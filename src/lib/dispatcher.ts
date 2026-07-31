import "server-only";
import { getDb, nowIso } from "./db";
import { getProduct, type Product } from "./catalog";
import { adapterFor } from "./fulfillment";
import { chargeForMission, userCanBeCharged } from "./payments";
import { emailDelivered, emailFailed, emailOrderPlaced, emailUpcomingOrder } from "./email";
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
};

/** How far ahead of the ship date the heads-up email goes out. */
const REMINDER_DAYS_BEFORE = 3;

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
    await sendReminder(mission, asOf);
    report.reminded.push(mission.id);
  }

  const due = await db.all<Mission>(
    `SELECT * FROM missions WHERE status = 'scheduled' AND ship_on <= ? ORDER BY ship_on`,
    [asOf],
  );

  for (const mission of due) {
    const product = getProduct(mission.product_id);
    if (!product) {
      await failMission(mission.id, "No product selected for this gift.");
      report.failed.push({ id: mission.id, reason: "No product selected" });
      continue;
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
      continue;
    }

    const user = await db.get<User>(`SELECT * FROM users WHERE id = ?`, [mission.user_id]);

    if (!user) {
      await failMission(mission.id, "The account behind this gift no longer exists.");
      report.failed.push({ id: mission.id, reason: "Missing account" });
      continue;
    }

    if (!userCanBeCharged(user)) {
      const reason = "No payment method on file — we couldn't place the order.";
      await failMission(mission.id, reason);
      await notifyFailure(user, mission, product, recipient, reason);
      report.failed.push({ id: mission.id, reason: "No payment method" });
      continue;
    }

    const adapter = await adapterFor(product.vendorId);
    const result = await adapter.placeOrder({ mission, product, recipient, address, buyer: user });

    if (!result.ok) {
      await failMission(mission.id, result.reason);
      await notifyFailure(user, mission, product, recipient, result.reason);
      report.failed.push({ id: mission.id, reason: result.reason });
      continue;
    }

    // Only take the money once the vendor has accepted the order. If the
    // charge then fails we still have the order, so this reads as needing
    // attention rather than silently shipping something unpaid for.
    const charge = await chargeForMission(
      user,
      mission.id,
      result.priceCents,
      `${product.name} for ${recipient.name}`,
    );

    if (!charge.ok) {
      await failMission(mission.id, charge.reason);
      await notifyFailure(user, mission, product, recipient, charge.reason);
      report.failed.push({ id: mission.id, reason: charge.reason });
      continue;
    }

    await db.run(
      `UPDATE missions
       SET status = 'placed', vendor_id = ?, vendor_order_ref = ?, price_cents = ?,
           failure_reason = '', updated_at = ?
       WHERE id = ?`,
      [product.vendorId, result.vendorOrderRef, result.priceCents, nowIso(), mission.id],
    );
    await logMissionEvent(
      mission.id,
      "placed",
      `Order ${result.vendorOrderRef} placed via ${adapter.id}. Charged ${charge.reference}.`,
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

  // Advance anything already in flight. Vendors normally push these via webhook;
  // date-based transitions keep the timeline honest without one.
  const toShip = await db.all<{ id: string }>(
    `SELECT id FROM missions WHERE status = 'placed' AND deliver_on <= ?`,
    [asOf],
  );
  for (const { id } of toShip) {
    await setStatus(id, "shipped");
    await logMissionEvent(id, "shipped", "Out for delivery.");
    report.shipped.push(id);
  }

  const toDeliver = await db.all<{ id: string }>(
    `SELECT id FROM missions WHERE status = 'shipped' AND deliver_on < ?`,
    [asOf],
  );
  for (const { id } of toDeliver) {
    await setStatus(id, "delivered");
    await logMissionEvent(id, "delivered", "Delivered. You're a hero and you did nothing.");
    await notifyDelivered(id);
    report.delivered.push(id);
  }

  return report;
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

async function sendReminder(mission: Mission, asOf: IsoDate): Promise<void> {
  const db = await getDb();
  const product = getProduct(mission.product_id);
  const recipient = await db.get<Recipient>(`SELECT * FROM recipients WHERE id = ?`, [
    mission.recipient_id,
  ]);
  const address = await db.get<Address>(`SELECT * FROM addresses WHERE id = ?`, [
    mission.address_id,
  ]);
  const user = await db.get<User>(`SELECT * FROM users WHERE id = ?`, [mission.user_id]);
  if (!product || !recipient || !address || !user) return;

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
