"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, requireUser } from "@/lib/auth";
import { getDb, newId, nowIso } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { planDelivery } from "@/lib/scheduling";
import { autoPick } from "@/lib/picker";
import {
  deleteAccount,
  getAddress,
  getMission,
  getOccasion,
  getRecipient,
  listAddresses,
  logMissionEvent,
  missedProductIds,
  recentProductIds,
  upcomingOccasions,
} from "@/lib/queries";
import { addDays, fromUtc, nextAnniversary, nextFixedHoliday, today, toUtc } from "@/lib/date";
import { runDispatch } from "@/lib/dispatcher";
import { paymentsAreLive, removeCard } from "@/lib/payments";
import type { AddressKind, OccasionKind } from "@/lib/types";

const s = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function refreshApp() {
  revalidatePath("/dashboard", "layout");
}

/**
 * `next` comes from a form field, and `redirect()` will happily follow an
 * absolute URL — keep it inside the app so the field can never become an
 * open redirect.
 */
function safePath(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

/** A real YYYY-MM-DD on the actual calendar — "2026-13-40" round-trips false. */
function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

/* ── People ─────────────────────────────────────────────────── */

export async function createRecipientAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = newId("rcp");

  await db.run(`INSERT INTO recipients (id, user_id, name, relationship, likes, dislikes, allergies, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id,
    user.id,
    s(formData, "name") || "Her",
    s(formData, "relationship") || "wife",
    s(formData, "likes"),
    s(formData, "dislikes"),
    s(formData, "allergies"),
    s(formData, "notes"),
    nowIso(),]);

  refreshApp();
  const next = s(formData, "next");
  if (next) redirect(safePath(next.replace("{id}", id)));
}

export async function updateRecipientAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  if (!await getRecipient(user.id, id)) return;

  await db.run(`UPDATE recipients SET name = ?, relationship = ?, likes = ?, dislikes = ?, allergies = ?, notes = ?
     WHERE id = ? AND user_id = ?`, [s(formData, "name") || "Her",
    s(formData, "relationship") || "wife",
    s(formData, "likes"),
    s(formData, "dislikes"),
    s(formData, "allergies"),
    s(formData, "notes"),
    id,
    user.id,]);
  refreshApp();
}

export async function deleteRecipientAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  // Deleting cascades into missions — refuse while any gift is in flight,
  // because a placed order is a financial record, not clutter.
  const inFlight = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM missions
     WHERE recipient_id = ? AND user_id = ? AND status IN ('scheduled', 'placed', 'shipped')`,
    [id, user.id],
  );
  if (Number(inFlight?.n ?? 0) > 0) return;
  await db.run(`DELETE FROM recipients WHERE id = ? AND user_id = ?`, [id, user.id]);
  refreshApp();
}

/* ── Addresses ──────────────────────────────────────────────── */

export async function createAddressAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const recipientId = s(formData, "recipient_id");
  if (!await getRecipient(user.id, recipientId)) return;

  const kind = (s(formData, "kind") || "home") as AddressKind;

  await db.run(`INSERT INTO addresses
       (id, user_id, recipient_id, kind, nickname, line1, line2, city, state, postal_code, country,
        window_start, window_end, weekdays_only, delivery_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [newId("adr"),
    user.id,
    recipientId,
    kind,
    s(formData, "nickname"),
    s(formData, "line1"),
    s(formData, "line2"),
    s(formData, "city"),
    s(formData, "state"),
    s(formData, "postal_code"),
    s(formData, "country") || "US",
    s(formData, "window_start") || "09:00",
    s(formData, "window_end") || "17:00",
    // Work addresses default to weekdays-only — nobody is at the office Saturday.
    formData.get("weekdays_only") ? 1 : kind === "work" ? 1 : 0,
    s(formData, "delivery_notes"),
    nowIso(),]);

  refreshApp();
  const next = s(formData, "next");
  if (next) redirect(safePath(next));
}

export async function updateAddressAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  if (!await getAddress(user.id, id)) return;

  await db.run(`UPDATE addresses SET kind = ?, nickname = ?, line1 = ?, line2 = ?, city = ?, state = ?,
       postal_code = ?, window_start = ?, window_end = ?, weekdays_only = ?, delivery_notes = ?
     WHERE id = ? AND user_id = ?`, [s(formData, "kind") || "home",
    s(formData, "nickname"),
    s(formData, "line1"),
    s(formData, "line2"),
    s(formData, "city"),
    s(formData, "state"),
    s(formData, "postal_code"),
    s(formData, "window_start") || "09:00",
    s(formData, "window_end") || "17:00",
    formData.get("weekdays_only") ? 1 : 0,
    s(formData, "delivery_notes"),
    id,
    user.id,]);
  refreshApp();
}

export async function deleteAddressAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  const inUse = await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM missions WHERE address_id = ? AND status = 'scheduled'`, [id]);
  if (Number(inUse?.n ?? 0) > 0) return; // Refuse to orphan a scheduled gift.
  await db.run(`DELETE FROM addresses WHERE id = ? AND user_id = ?`, [id, user.id]);
  refreshApp();
}

/* ── Dates ──────────────────────────────────────────────────── */

export async function createOccasionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const recipientId = s(formData, "recipient_id");
  if (!await getRecipient(user.id, recipientId)) return;

  const kind = (s(formData, "kind") || "birthday") as OccasionKind;
  const id = newId("occ");

  // The date input guards the happy path, but a server action is a public
  // POST endpoint — a malformed date stored here would make every page that
  // computes the next occurrence throw, bricking the whole dashboard. A blank
  // date is legitimate for fixed holidays: we know when Valentine's Day is.
  const eventDate = s(formData, "event_date") || nextFixedHoliday(kind) || today();
  if (!isCalendarDate(eventDate)) return;

  await db.run(`INSERT INTO occasions (id, user_id, recipient_id, kind, title, event_date, recurring, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id,
    user.id,
    recipientId,
    kind,
    s(formData, "title") || defaultTitle(kind),
    eventDate,
    formData.get("recurring") ? 1 : 0,
    nowIso(),]);

  refreshApp();
  const next = s(formData, "next");
  redirect(next ? safePath(next.replace("{id}", id)) : `/dashboard/plan/${id}`);
}

/**
 * "Send a gift now" — no occasion required. Creates a one-off Just Because
 * date at the earliest window most of the catalogue can genuinely make
 * (four days covers flowers and the curated range; anything slower simply
 * won't appear in the planner), then drops straight into choosing.
 */
export async function sendNowAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const recipientId = s(formData, "recipient_id");
  if (!await getRecipient(user.id, recipientId)) return;

  const id = newId("occ");
  await db.run(
    `INSERT INTO occasions (id, user_id, recipient_id, kind, title, event_date, recurring, created_at)
     VALUES (?, ?, ?, 'just_because', 'Just because', ?, 0, ?)`,
    [id, user.id, recipientId, addDays(today(), 4), nowIso()],
  );

  refreshApp();
  redirect(`/dashboard/plan/${id}?mode=manual`);
}

/**
 * Rename freely; move the date only while nothing is scheduled against it.
 * A mission's ship/deliver dates were computed from the old date — silently
 * leaving them behind would ship a birthday gift to the wrong week.
 */
export async function updateOccasionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  const occasion = await getOccasion(user.id, id);
  if (!occasion) return;

  const title = s(formData, "title") || occasion.title;

  let eventDate = occasion.event_date;
  const requestedDate = s(formData, "event_date");
  if (requestedDate && requestedDate !== occasion.event_date && isCalendarDate(requestedDate)) {
    const scheduled = await db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM missions
       WHERE occasion_id = ? AND user_id = ? AND status IN ('scheduled', 'placed', 'shipped')`,
      [id, user.id],
    );
    if (Number(scheduled?.n ?? 0) === 0) eventDate = requestedDate;
  }

  await db.run(`UPDATE occasions SET title = ?, event_date = ? WHERE id = ? AND user_id = ?`, [
    title,
    eventDate,
    id,
    user.id,
  ]);
  refreshApp();
  redirect("/dashboard/dates");
}

export async function deleteOccasionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  // Same rule as recipients: the cascade must never eat an in-flight order.
  const inFlight = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM missions
     WHERE occasion_id = ? AND user_id = ? AND status IN ('scheduled', 'placed', 'shipped')`,
    [id, user.id],
  );
  if (Number(inFlight?.n ?? 0) > 0) return;
  await db.run(`DELETE FROM occasions WHERE id = ? AND user_id = ?`, [id, user.id]);
  refreshApp();
}

function defaultTitle(kind: OccasionKind): string {
  return (
    {
      birthday: "Birthday",
      anniversary: "Anniversary",
      valentines: "Valentine's Day",
      mothers_day: "Mother's Day",
      christmas: "Christmas",
      apology: "Damage control",
      just_because: "Just because",
      custom: "Important date",
    } as Record<OccasionKind, string>
  )[kind];
}

/* ── Missions (a scheduled gift) ────────────────────────────── */

export async function scheduleMissionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const occasionId = s(formData, "occasion_id");
  const occasion = await getOccasion(user.id, occasionId);
  if (!occasion) return;

  const addressId = s(formData, "address_id");
  const address = await getAddress(user.id, addressId);
  if (!address) return;

  // Number() of garbage is NaN, and NaN survives Math.max — round and fall
  // back so a hand-made request can neither crash the insert nor store a
  // fractional cent (Postgres refuses a REAL in an INTEGER column).
  const rawBudget = Number(s(formData, "budget") || "80");
  const budgetCents = Math.max(1000, Number.isFinite(rawBudget) ? Math.round(rawBudget * 100) : 8000);
  const mode = s(formData, "selection_mode") === "auto" ? "auto" : "manual";
  const eventDate = occasion.recurring
    ? nextAnniversary(occasion.event_date, today())
    : occasion.event_date;

  let productId = s(formData, "product_id");
  // In manual mode the user is choosing with their own eyes — a submission
  // with no product means the grid was empty (a search with no matches);
  // silently substituting an Auto-Pilot pick they never saw is worse than
  // doing nothing.
  if (mode === "manual" && !productId) return;
  if (mode === "auto") {
    const recipient = await getRecipient(user.id, occasion.recipient_id);
    if (!recipient) return;
    const pick = autoPick({
      recipient,
      address,
      occasionKind: occasion.kind,
      budgetCents,
      recentProductIds: await recentProductIds(user.id, occasion.recipient_id),
      vetoProductIds: await missedProductIds(user.id, occasion.recipient_id),
    });
    if (!pick) return;
    productId = pick.product.id;
  }

  const product = getProduct(productId);
  if (!product) return;

  const plan = planDelivery(eventDate, product, address);

  // The picker already hides these, so arriving here means a hand-made request
  // or a date that moved underneath the page. Refuse rather than store a
  // promise we have just said we will not make.
  if (plan.tooFar || plan.tooLate) return;

  const id = newId("msn");

  await db.run(`INSERT INTO missions
       (id, user_id, occasion_id, recipient_id, address_id, product_id, selection_mode,
        budget_cents, price_cents, gift_message, deliver_on, ship_on, status, vendor_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`, [id,
    user.id,
    occasionId,
    occasion.recipient_id,
    addressId,
    product.id,
    mode,
    budgetCents,
    product.priceCents,
    s(formData, "gift_message"),
    plan.deliverOn,
    plan.shipOn,
    product.vendorId,
    nowIso(),
    nowIso(),]);

  await logMissionEvent(
    id,
    "scheduled",
    `${product.name} scheduled for ${plan.deliverOn}. Order goes in ${plan.shipOn}.${
      plan.shifted ? ` ${plan.shiftReason}` : ""
    }`,
  );

  refreshApp();
  redirect("/dashboard?scheduled=1");
}

/**
 * The product promise in one click: every unprotected date gets an
 * Auto-Pilot gift scheduled against it. Dates it can't honestly cover — no
 * address on file, nothing in budget, too late for anything to arrive — are
 * skipped and counted, never faked.
 */
export async function coverEverythingAction(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const occasions = await upcomingOccasions(user.id, 365);
  const uncovered = occasions.filter((o) => o.missions.length === 0);

  let covered = 0;
  for (const occ of uncovered) {
    const recipient = await getRecipient(user.id, occ.recipient_id);
    if (!recipient) continue;
    const addressId = await firstAddressId(user.id, occ.recipient_id);
    const address = addressId ? await getAddress(user.id, addressId) : null;
    if (!address) continue;

    const budgetCents = user.default_budget_cents || 12000;
    const pick = autoPick({
      recipient,
      address,
      occasionKind: occ.kind,
      budgetCents,
      recentProductIds: await recentProductIds(user.id, occ.recipient_id),
      vetoProductIds: await missedProductIds(user.id, occ.recipient_id),
    });
    if (!pick) continue;

    const plan = planDelivery(occ.nextDate, pick.product, address);
    if (plan.tooFar || plan.tooLate) continue;

    const id = newId("msn");
    await db.run(
      `INSERT INTO missions
         (id, user_id, occasion_id, recipient_id, address_id, product_id, selection_mode,
          budget_cents, price_cents, gift_message, deliver_on, ship_on, status, vendor_id,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'auto', ?, ?, '', ?, ?, 'scheduled', ?, ?, ?)`,
      [
        id,
        user.id,
        occ.id,
        occ.recipient_id,
        address.id,
        pick.product.id,
        budgetCents,
        pick.product.priceCents,
        plan.deliverOn,
        plan.shipOn,
        pick.product.vendorId,
        nowIso(),
        nowIso(),
      ],
    );
    await logMissionEvent(
      id,
      "scheduled",
      `${pick.product.name} scheduled for ${plan.deliverOn} by "Cover everything". Order goes in ${plan.shipOn}.`,
    );
    covered += 1;
  }

  refreshApp();
  redirect(`/dashboard?covered=${covered}&of=${uncovered.length}`);
}

export async function cancelMissionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  const mission = await getMission(user.id, id);
  // Only a gift that hasn't been ordered can honestly be called off. A
  // 'placed' order has a live vendor order and a captured charge — flipping
  // the status would keep the money and ship the gift anyway; until vendor
  // cancellation and refunds exist, we refuse rather than pretend.
  if (!mission || !["scheduled", "failed"].includes(mission.status)) return;

  // Status-guarded so a dispatch run that grabbed this mission mid-flight
  // and placed it does not get silently overwritten (nor vice versa).
  await db.run(
    `UPDATE missions SET status = 'canceled', updated_at = ?
     WHERE id = ? AND user_id = ? AND status IN ('scheduled', 'failed')`,
    [nowIso(), id, user.id],
  );
  await logMissionEvent(id, "canceled", "You called it off.");
  refreshApp();
}

/** Re-run the picker for a failed gift and put it back on the rails. */
export async function retryMissionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  const mission = await getMission(user.id, id);
  if (!mission || mission.status !== "failed") return;

  // A failed mission that carries a vendor reference means the vendor took
  // the order and only the charge failed — the gift is on its way. The right
  // fix is the card, not a second gift: re-scheduling as-is lets the
  // dispatcher retry the charge against the existing order.
  if (mission.vendor_order_ref) {
    await db.run(
      `UPDATE missions SET status = 'scheduled', failure_reason = '', updated_at = ?
       WHERE id = ? AND user_id = ? AND status = 'failed'`,
      [nowIso(), id, user.id],
    );
    await logMissionEvent(
      id,
      "scheduled",
      `Retrying payment for the existing order ${mission.vendor_order_ref} — not ordering twice.`,
    );
    refreshApp();
    return;
  }

  const recipient = await getRecipient(user.id, mission.recipient_id);
  const address = await getAddress(user.id, mission.address_id);
  if (!recipient || !address) return;

  const occasion = await getOccasion(user.id, mission.occasion_id);
  const pick = autoPick({
    recipient,
    address,
    occasionKind: occasion?.kind ?? "just_because",
    budgetCents: mission.budget_cents,
    recentProductIds: [mission.product_id],
    vetoProductIds: await missedProductIds(user.id, mission.recipient_id),
  });
  if (!pick) return;

  // Salvage what's left of the runway: earliest date this product can still make.
  const plan = planDelivery(mission.deliver_on, pick.product, address);
  const shipOn = plan.tooLate ? today() : plan.shipOn;
  const deliverOn = plan.tooLate ? addDays(today(), plan.leadDays) : plan.deliverOn;

  await db.run(`UPDATE missions SET product_id = ?, vendor_id = ?, price_cents = ?, deliver_on = ?, ship_on = ?,
       status = 'scheduled', failure_reason = '', updated_at = ? WHERE id = ? AND user_id = ?`, [pick.product.id,
    pick.product.vendorId,
    pick.product.priceCents,
    deliverOn,
    shipOn,
    nowIso(),
    id,
    user.id,]);
  await logMissionEvent(id, "scheduled", `Rescued with ${pick.product.name}, delivering ${deliverOn}.`);
  refreshApp();
}

/**
 * The card message stays editable right up until the order goes in — after
 * that it's printed and in a box somewhere, and pretending otherwise is a lie.
 */
export async function updateMissionMessageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  const mission = await getMission(user.id, id);
  if (!mission || mission.status !== "scheduled") return;

  await db.run(
    `UPDATE missions SET gift_message = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND status = 'scheduled'`,
    [s(formData, "gift_message").slice(0, 250), nowIso(), id, user.id],
  );
  refreshApp();
}

/**
 * "Did it land?" — a verdict on a delivered gift. 'miss' becomes a standing
 * veto: the picker never chooses that product for this recipient again.
 */
export async function recordFeedbackAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  const verdict = s(formData, "verdict");
  if (!["hit", "miss"].includes(verdict)) return;

  const mission = await getMission(user.id, id);
  // Only a delivered gift can honestly be judged.
  if (!mission || mission.status !== "delivered") return;

  await db.run(
    `UPDATE missions SET feedback = ?, updated_at = ?
     WHERE id = ? AND user_id = ? AND status = 'delivered'`,
    [verdict, nowIso(), id, user.id],
  );
  await logMissionEvent(
    id,
    "delivered",
    verdict === "hit"
      ? "Marked a hit — more like this."
      : "Marked a miss — never picking this one for her again.",
  );
  refreshApp();
}

/** The whole account, gone — except an order already paid for and moving. */
export async function deleteAccountAction(): Promise<void> {
  const user = await requireUser();
  const result = await deleteAccount(user.id);
  if (!result.ok) {
    redirect("/dashboard/settings?account=inflight");
  }
  // Sessions are already gone from the database; this clears the cookie.
  await endSession();
  redirect("/?deleted=1");
}

/* ── Settings ───────────────────────────────────────────────── */

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  // With Stripe live, payment_ok is owned by the card flow — a form field
  // must not be able to assert "I have a card" when Stripe says otherwise.
  const paymentOk = paymentsAreLive()
    ? user.payment_ok
    : formData.get("payment_ok")
      ? 1
      : 0;
  // Only the budgets the planner itself offers — a hand-made request can't
  // store a $1 default and quietly make every future gift a candy bar.
  const BUDGETS = [5000, 8000, 12000, 20000, 35000];
  const rawBudget = Number(s(formData, "default_budget"));
  const defaultBudget = BUDGETS.includes(rawBudget) ? rawBudget : user.default_budget_cents;

  await db.run(
    `UPDATE users SET name = ?, auto_pilot = ?, payment_ok = ?, default_budget_cents = ? WHERE id = ?`,
    [s(formData, "name") || user.name, formData.get("auto_pilot") ? 1 : 0, paymentOk, defaultBudget, user.id],
  );
  refreshApp();
}

/** Detaches the Stripe payment method and clears the local flag. */
export async function removeCardAction(): Promise<void> {
  const user = await requireUser();
  await removeCard(user);
  refreshApp();
}

/* ── Ops ────────────────────────────────────────────────────── */

/**
 * Manually fire the scheduler — a development convenience. In production the
 * cron owns this: the dispatcher processes EVERY account's due missions, and
 * a tenant-scoped session must not decide when other customers' orders and
 * charges fire.
 */
export async function runDispatchAction(): Promise<void> {
  await requireUser();
  if (process.env.NODE_ENV === "production") return;
  await runDispatch();
  refreshApp();
}

/** Loads the exact scenario from the pitch: Aug 20 birthday, Sep 25 anniversary. */
export async function seedDemoAction(): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const recipientId = newId("rcp");
  const year = Number(today().slice(0, 4));

  await db.run(`INSERT INTO recipients (id, user_id, name, relationship, likes, dislikes, allergies, notes, created_at)
     VALUES (?, ?, 'Dana', 'wife', 'peonies, strawberries, lavender, date night', 'lilies', 'nuts',
             'Hates surprises at 6am. Loves them at 10am.', ?)`, [recipientId, user.id, nowIso()]);

  const homeId = newId("adr");
  const workId = newId("adr");

  await db.run(`INSERT INTO addresses (id, user_id, recipient_id, kind, nickname, line1, line2, city, state,
       postal_code, country, window_start, window_end, weekdays_only, delivery_notes, created_at)
     VALUES (?, ?, ?, 'home', 'The house', '412 Rosewood Ln', '', 'Charlotte', 'NC', '28202', 'US',
             '16:00', '20:00', 0, 'Leave with the side door, not the porch.', ?)`, [homeId, user.id, recipientId, nowIso()]);

  await db.run(`INSERT INTO addresses (id, user_id, recipient_id, kind, nickname, line1, line2, city, state,
       postal_code, country, window_start, window_end, weekdays_only, delivery_notes, created_at)
     VALUES (?, ?, ?, 'work', 'Her office', '1900 Trade St', 'Suite 700', 'Charlotte', 'NC', '28203',
             'US', '09:00', '17:00', 1, 'Front desk will sign. Ask for the 7th floor.', ?)`, [workId, user.id, recipientId, nowIso()]);

  const birthdayId = newId("occ");
  const anniversaryId = newId("occ");

  await db.run(`INSERT INTO occasions (id, user_id, recipient_id, kind, title, event_date, recurring, created_at)
     VALUES (?, ?, ?, 'birthday', 'Dana''s birthday', ?, 1, ?)`, [birthdayId, user.id, recipientId, `${year}-08-20`, nowIso()]);

  await db.run(`INSERT INTO occasions (id, user_id, recipient_id, kind, title, event_date, recurring, created_at)
     VALUES (?, ?, ?, 'anniversary', 'Our anniversary', ?, 1, ?)`, [anniversaryId, user.id, recipientId, `${year}-09-25`, nowIso()]);

  await db.run(`UPDATE users SET payment_ok = 1 WHERE id = ?`, [user.id]);

  await scheduleSeeded(user.id, birthdayId, recipientId, workId, "bouquet_garden_seasonal", "Happy birthday. Yes, I remembered. — M");
  await scheduleSeeded(user.id, anniversaryId, recipientId, homeId, "fruit_bouquet_celebration", "Same time next year. — M");

  refreshApp();
  redirect("/dashboard?seeded=1");
}

async function scheduleSeeded(
  userId: string,
  occasionId: string,
  recipientId: string,
  addressId: string,
  productId: string,
  message: string,
): Promise<void> {
  const db = await getDb();

  const occasion = await db.get<{ event_date: string; recurring: number }>(
    `SELECT * FROM occasions WHERE id = ?`,
    [occasionId],
  );
  const address = await db.get<{ kind: AddressKind; weekdays_only: number }>(
    `SELECT * FROM addresses WHERE id = ?`,
    [addressId],
  );
  const product = getProduct(productId);
  if (!occasion || !address || !product) return;

  const eventDate = occasion.recurring
    ? nextAnniversary(occasion.event_date, today())
    : occasion.event_date;
  const plan = planDelivery(eventDate, product, address);
  const id = newId("msn");

  await db.run(
    `INSERT INTO missions
       (id, user_id, occasion_id, recipient_id, address_id, product_id, selection_mode, budget_cents,
        price_cents, gift_message, deliver_on, ship_on, status, vendor_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'manual', 15000, ?, ?, ?, ?, 'scheduled', ?, ?, ?)`,
    [
      id,
      userId,
      occasionId,
      recipientId,
      addressId,
      product.id,
      product.priceCents,
      message,
      plan.deliverOn,
      plan.shipOn,
      product.vendorId,
      nowIso(),
      nowIso(),
    ],
  );

  await logMissionEvent(id, "scheduled", `${product.name} scheduled for ${plan.deliverOn}.`);
}

/** Convenience for the empty state — first address for a recipient, if any. */
export async function firstAddressId(userId: string, recipientId: string): Promise<string | null> {
  const addresses = await listAddresses(userId, recipientId);
  return addresses[0]?.id ?? null;
}
