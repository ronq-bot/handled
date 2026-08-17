import "server-only";
import { getDb, nowIso } from "./db";
import { getProduct, type Product } from "./catalog";
import { adapterFor } from "./fulfillment";
import { affiliateCentsFor } from "./fulfilment-map";
import { chargeForMission, userCanBeCharged } from "./payments";
import {
  emailArrivingToday,
  emailDelivered,
  emailFailed,
  emailOrderPlaced,
  emailRenewal,
  emailUpcomingOrder,
} from "./email";
import { env } from "./env";
import { logMissionEvent } from "./queries";
import { addDays, daysBetween, today, type IsoDate } from "./date";
import type { Address, Mission, Recipient, User } from "./types";

export type DispatchReport = {
  asOf: IsoDate;
  reminded: string[];
  placed: string[];
  shipped: string[];
  delivered: string[];
  failed: { id: string; reason: string }[];
  /** User ids asked to schedule another year. */
  renewalsNudged: string[];
};

/** How far ahead of the ship date the heads-up email goes out. */
const REMINDER_DAYS_BEFORE = 3;

/** How little cover is left before we ask them to schedule another year. */
const RENEWAL_NUDGE_DAYS = 30;

/**
 * Never nudge the same account twice inside this window. A year of gifts can
 * finish and be replaced in a single sitting, so the guard has to outlast the
 * gap rather than reset the moment cover runs out.
 */
const RENEWAL_QUIET_DAYS = 60;

/**
 * The heartbeat. Idempotent by design — running it twice on the same day is a
 * no-op, because every transition is gated on the mission's current status.
 * In production this is a cron hitting /api/cron/dispatch once an hour.
 */
export async function runDispatch(asOf: IsoDate = today()): Promise<DispatchReport> {
  const report: DispatchReport = {
    asOf,
    reminded: [],
    placed: [],
    shipped: [],
    delivered: [],
    failed: [],
    renewalsNudged: [],
  };

  const db = await getDb();

  // Heads-up email, once per gift, before it's ordered and charged. Gated on
  // a mission_events row rather than a status change, since the mission is
  // still just "scheduled" — this only ever informs, never blocks the ship.
  const dueForReminder = await db.all<Mission>(
    `SELECT * FROM missions m
     WHERE m.status = 'scheduled' AND m.ship_on > ? AND m.ship_on <= ?
       AND NOT EXISTS (
         SELECT 1 FROM mission_events e WHERE e.mission_id = m.id AND e.status = 'reminder'
       )
     ORDER BY m.ship_on`,
    [asOf, addDays(asOf, REMINDER_DAYS_BEFORE)],
  );
  for (const mission of dueForReminder) {
    try {
      if (await sendReminder(mission, asOf)) report.reminded.push(mission.id);
    } catch (cause) {
      // A reminder is a courtesy; never let one bad row stop the run.
      console.error(`dispatch: reminder for ${mission.id} threw`, cause);
    }
  }

  const due = await db.all<Mission>(
    `SELECT * FROM missions WHERE status = 'scheduled' AND ship_on <= ? ORDER BY ship_on`,
    [asOf],
  );

  // Each mission is isolated: one customer's transient DB error or vendor
  // surprise must never starve every mission queued behind it.
  for (const mission of due) {
    try {
      await placeMission(mission, report);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      console.error(`dispatch: placing ${mission.id} threw`, cause);
      report.failed.push({ id: mission.id, reason: `Unexpected error: ${reason}` });
    }
  }

  // Advance anything already in flight. Vendors normally push these via webhook;
  // date-based transitions keep the timeline honest without one.
  const toShip = await db.all<{ id: string }>(
    `SELECT id FROM missions WHERE status = 'placed' AND deliver_on <= ?`,
    [asOf],
  );
  for (const { id } of toShip) {
    try {
      await setStatus(id, "shipped");
      await logMissionEvent(id, "shipped", "Out for delivery.");
      await notifyArriving(id);
      report.shipped.push(id);
    } catch (cause) {
      console.error(`dispatch: shipping ${id} threw`, cause);
    }
  }

  const toDeliver = await db.all<{ id: string }>(
    `SELECT id FROM missions WHERE status = 'shipped' AND deliver_on < ?`,
    [asOf],
  );
  for (const { id } of toDeliver) {
    try {
      await setStatus(id, "delivered");
      await logMissionEvent(id, "delivered", "Delivered. You're a hero and you did nothing.");
      await notifyDelivered(id);
      report.delivered.push(id);
    } catch (cause) {
      console.error(`dispatch: delivering ${id} threw`, cause);
    }
  }

  try {
    report.renewalsNudged.push(...(await nudgeRenewals(asOf)));
  } catch (cause) {
    console.error("dispatch: renewal nudges threw", cause);
  }

  return report;
}

/** One mission through the gauntlet: guards, vendor, money, record. */
async function placeMission(mission: Mission, report: DispatchReport): Promise<void> {
  const db = await getDb();

  const product = getProduct(mission.product_id);
  if (!product) {
    await failMission(mission.id, "No product selected for this gift.");
    report.failed.push({ id: mission.id, reason: "No product selected" });
    return;
  }

  const recipient = await db.get<Recipient>(`SELECT * FROM recipients WHERE id = ?`, [
    mission.recipient_id,
  ]);
  const address = await db.get<Address>(`SELECT * FROM addresses WHERE id = ?`, [
    mission.address_id,
  ]);

  if (!recipient || !address) {
    await failMission(mission.id, "Recipient or address is missing.");
    report.failed.push({ id: mission.id, reason: "Missing recipient or address" });
    return;
  }

  const user = await db.get<User>(`SELECT * FROM users WHERE id = ?`, [mission.user_id]);

  if (!user) {
    await failMission(mission.id, "The account behind this gift no longer exists.");
    report.failed.push({ id: mission.id, reason: "Missing account" });
    return;
  }

  if (!userCanBeCharged(user)) {
    const reason = "No payment method on file — we couldn't place the order.";
    await failMission(mission.id, reason);
    await notifyFailure(user, mission, product, recipient, reason);
    report.failed.push({ id: mission.id, reason: "No payment method" });
    return;
  }

  // A scheduled mission that already carries a vendor reference is a previous
  // run that ordered successfully and then died (or had its card declined and
  // was retried) — the gift is on its way. Re-ordering would send a second
  // one, so we skip straight to the money. This is what makes a replayed
  // dispatch safe with vendors that reject a duplicate reference instead of
  // returning the original order.
  let vendorOrderRef = mission.vendor_order_ref;
  let adapterId = mission.vendor_id || product.vendorId;

  if (!vendorOrderRef) {
    const adapter = await adapterFor(product.vendorId);
    const result = await adapter.placeOrder({ mission, product, recipient, address, buyer: user });

    if (!result.ok) {
      await failMission(mission.id, result.reason);
      await notifyFailure(user, mission, product, recipient, result.reason);
      report.failed.push({ id: mission.id, reason: result.reason });
      return;
    }

    vendorOrderRef = result.vendorOrderRef;
    adapterId = adapter.id;

    // Persist the reference the moment the vendor accepts, before any money
    // moves: if we crash between here and 'placed', the next run finds the
    // reference and does not order twice — and if the charge below fails,
    // ops can still see exactly which live vendor order needs attention.
    await db.run(
      `UPDATE missions SET vendor_id = ?, vendor_order_ref = ?, updated_at = ?
       WHERE id = ? AND status = 'scheduled'`,
      [product.vendorId, vendorOrderRef, nowIso(), mission.id],
    );
  }

  // Charge the price the user locked in when they scheduled the gift — the
  // catalogue may have been re-synced since, and a price he never saw is not
  // a price he agreed to. Only take the money once the vendor has accepted.
  // Prior recorded failures count as the attempt number, so a genuine retry
  // gets a fresh Stripe idempotency key while a crash-replay reuses the old.
  const amountCents = mission.price_cents > 0 ? mission.price_cents : product.priceCents;
  const prior = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ? AND status = 'failed'`,
    [mission.id],
  );
  const charge = await chargeForMission(
    user,
    mission.id,
    amountCents,
    `${product.name} for ${recipient.name}`,
    Number(prior?.n ?? 0),
  );

  if (!charge.ok) {
    await failMission(mission.id, charge.reason);
    await notifyFailure(user, mission, product, recipient, charge.reason);
    report.failed.push({ id: mission.id, reason: charge.reason });
    return;
  }

  // Guarded on status so a cancellation that landed while the vendor call was
  // in flight is never overwritten back to 'placed'.
  await db.run(
    `UPDATE missions
     SET status = 'placed', vendor_id = ?, vendor_order_ref = ?, price_cents = ?,
         affiliate_cents = ?, failure_reason = '', updated_at = ?
     WHERE id = ? AND status = 'scheduled'`,
    [
      product.vendorId,
      vendorOrderRef,
      amountCents,
      affiliateCentsFor({ vendorId: product.vendorId, priceCents: amountCents }),
      nowIso(),
      mission.id,
    ],
  );
  await logMissionEvent(
    mission.id,
    "placed",
    `Order ${vendorOrderRef} placed via ${adapterId}. Charged ${charge.reference}.`,
  );

  await emailOrderPlaced({
    to: user.email,
    firstName: firstNameOf(user),
    gift: product.name,
    recipient: recipient.name,
    occasion: await occasionTitle(mission.occasion_id),
    deliverOn: mission.deliver_on,
    where: describe(address),
  });

  report.placed.push(mission.id);
}

/**
 * Ask accounts that are running out of scheduled gifts to set another year.
 *
 * We deliberately cap scheduling at twelve months, so every account eventually
 * arrives here. It fires on the *last* gift on the calendar rather than on any
 * individual date, because the thing worth saying is "you are about to have
 * nothing scheduled", not "one date needs attention" — the dashboard already
 * says the latter.
 *
 * Only accounts with a recurring date get this. Someone who scheduled a single
 * one-off gift has not lapsed; they are finished.
 */
async function nudgeRenewals(asOf: IsoDate): Promise<string[]> {
  const db = await getDb();
  const nudged: string[] = [];

  const candidates = await db.all<{
    id: string;
    email: string;
    name: string;
    renewal_nudged_at: string;
    last_deliver: string | null;
    recurring_count: number;
  }>(
    `SELECT u.id, u.email, u.name, u.renewal_nudged_at,
            (SELECT MAX(m.deliver_on) FROM missions m
              WHERE m.user_id = u.id AND m.status != 'canceled') AS last_deliver,
            (SELECT COUNT(*) FROM occasions o
              WHERE o.user_id = u.id AND o.recurring = 1) AS recurring_count
       FROM users u`,
  );

  for (const row of candidates) {
    // Never used the product, or has no date that will come round again.
    if (!row.last_deliver || Number(row.recurring_count) === 0) continue;

    // Still has more than a month of cover left.
    if (daysBetween(asOf, row.last_deliver) > RENEWAL_NUDGE_DAYS) continue;

    if (row.renewal_nudged_at) {
      const since = daysBetween(row.renewal_nudged_at.slice(0, 10), asOf);
      if (since < RENEWAL_QUIET_DAYS) continue;
    }

    await emailRenewal({
      to: row.email,
      firstName: row.name.split(" ")[0] || "there",
      lastDate: row.last_deliver,
      dateCount: Number(row.recurring_count),
      planUrl: `${env.appUrl}/dashboard/dates`,
    });

    // Stamped whether or not the mail actually left — `send()` swallows its
    // own failures, and a bounced nudge is not worth re-sending daily.
    await db.run(`UPDATE users SET renewal_nudged_at = ? WHERE id = ?`, [nowIso(), row.id]);
    nudged.push(row.id);
  }

  return nudged;
}

/* ── Notifications ──────────────────────────────────────────────
   Email must never be able to fail a shipment, so every one of these
   swallows its own errors — `send()` already logs them.
   ─────────────────────────────────────────────────────────────── */

function firstNameOf(user: User): string {
  return user.name.split(" ")[0] || "there";
}

function describe(address: Address): string {
  const where =
    address.kind === "work" ? "at her office" : address.kind === "home" ? "at home" : "as directed";
  return `${where} in ${address.city}`;
}

async function occasionTitle(occasionId: string): Promise<string> {
  const db = await getDb();
  const row = await db.get<{ title: string }>(`SELECT title FROM occasions WHERE id = ?`, [
    occasionId,
  ]);
  return row?.title ?? "the date";
}

/** True when the heads-up actually went out (and was recorded as sent). */
async function sendReminder(mission: Mission, asOf: IsoDate): Promise<boolean> {
  const db = await getDb();
  const product = getProduct(mission.product_id);
  const recipient = await db.get<Recipient>(`SELECT * FROM recipients WHERE id = ?`, [
    mission.recipient_id,
  ]);
  const address = await db.get<Address>(`SELECT * FROM addresses WHERE id = ?`, [
    mission.address_id,
  ]);
  const user = await db.get<User>(`SELECT * FROM users WHERE id = ?`, [mission.user_id]);
  if (!product || !recipient || !address || !user) return false;

  await emailUpcomingOrder({
    to: user.email,
    firstName: firstNameOf(user),
    gift: product.name,
    recipient: recipient.name,
    occasion: await occasionTitle(mission.occasion_id),
    deliverOn: mission.deliver_on,
    where: describe(address),
    daysUntilShip: daysBetween(asOf, mission.ship_on),
    changeUrl: `${env.appUrl}/dashboard/gifts/${mission.id}`,
  });
  await logMissionEvent(
    mission.id,
    "reminder",
    `Heads-up sent — ordering in ${daysBetween(asOf, mission.ship_on)} day(s).`,
  );
  return true;
}

async function notifyFailure(
  user: User,
  mission: Mission,
  product: Product,
  recipient: Recipient,
  reason: string,
): Promise<void> {
  await emailFailed({
    to: user.email,
    firstName: firstNameOf(user),
    gift: product.name,
    recipient: recipient.name,
    occasion: await occasionTitle(mission.occasion_id),
    deliverOn: mission.deliver_on,
    where: "",
    reason,
    fixUrl: `${env.appUrl}/dashboard/gifts/${mission.id}`,
  });
}

/** "Her flowers arrive today. Act natural." — sent on the delivery day. */
async function notifyArriving(missionId: string): Promise<void> {
  const db = await getDb();
  const mission = await db.get<Mission>(`SELECT * FROM missions WHERE id = ?`, [missionId]);
  if (!mission) return;

  const user = await db.get<User>(`SELECT * FROM users WHERE id = ?`, [mission.user_id]);
  const recipient = await db.get<Recipient>(`SELECT * FROM recipients WHERE id = ?`, [
    mission.recipient_id,
  ]);
  const product = getProduct(mission.product_id);
  if (!user || !recipient || !product) return;

  await emailArrivingToday({
    to: user.email,
    firstName: firstNameOf(user),
    gift: product.name,
    recipient: recipient.name,
    occasion: await occasionTitle(mission.occasion_id),
    deliverOn: mission.deliver_on,
    where: "",
  });
}

async function notifyDelivered(missionId: string): Promise<void> {
  const db = await getDb();
  const mission = await db.get<Mission>(`SELECT * FROM missions WHERE id = ?`, [missionId]);
  if (!mission) return;

  const user = await db.get<User>(`SELECT * FROM users WHERE id = ?`, [mission.user_id]);
  const recipient = await db.get<Recipient>(`SELECT * FROM recipients WHERE id = ?`, [
    mission.recipient_id,
  ]);
  const product = getProduct(mission.product_id);
  if (!user || !recipient || !product) return;

  await emailDelivered({
    to: user.email,
    firstName: firstNameOf(user),
    gift: product.name,
    recipient: recipient.name,
    occasion: await occasionTitle(mission.occasion_id),
    deliverOn: mission.deliver_on,
    where: "",
  });
}

async function setStatus(id: string, status: string): Promise<void> {
  const db = await getDb();
  await db.run(`UPDATE missions SET status = ?, updated_at = ? WHERE id = ?`, [
    status,
    nowIso(),
    id,
  ]);
}

async function failMission(id: string, reason: string): Promise<void> {
  const db = await getDb();
  await db.run(
    `UPDATE missions SET status = 'failed', failure_reason = ?, updated_at = ? WHERE id = ?`,
    [reason, nowIso(), id],
  );
  await logMissionEvent(id, "failed", reason);
}
