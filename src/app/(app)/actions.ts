"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb, newId, nowIso } from "@/lib/db";
import { getProduct } from "@/lib/catalog";
import { planDelivery } from "@/lib/scheduling";
import { autoPick } from "@/lib/picker";
import {
  getAddress,
  getMission,
  getOccasion,
  getRecipient,
  listAddresses,
  logMissionEvent,
  recentProductIds,
} from "@/lib/queries";
import { addDays, nextAnniversary, today } from "@/lib/date";
import { runDispatch } from "@/lib/dispatcher";
import { removeCard } from "@/lib/payments";
import type { AddressKind, OccasionKind } from "@/lib/types";

const s = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

function refreshApp() {
  revalidatePath("/dashboard", "layout");
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
  if (next) redirect(next.replace("{id}", id));
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
  await db.run(`DELETE FROM recipients WHERE id = ? AND user_id = ?`, [s(formData, "id"), user.id]);
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
  if (next) redirect(next);
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

  await db.run(`INSERT INTO occasions (id, user_id, recipient_id, kind, title, event_date, recurring, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id,
    user.id,
    recipientId,
    kind,
    s(formData, "title") || defaultTitle(kind),
    s(formData, "event_date") || today(),
    formData.get("recurring") ? 1 : 0,
    nowIso(),]);

  refreshApp();
  const next = s(formData, "next");
  redirect(next ? next.replace("{id}", id) : `/dashboard/plan/${id}`);
}

export async function deleteOccasionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await db.run(`DELETE FROM occasions WHERE id = ? AND user_id = ?`, [s(formData, "id"), user.id]);
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

  const budgetCents = Math.max(1000, Number(s(formData, "budget") || "80") * 100);
  const mode = s(formData, "selection_mode") === "auto" ? "auto" : "manual";
  const eventDate = occasion.recurring
    ? nextAnniversary(occasion.event_date, today())
    : occasion.event_date;

  let productId = s(formData, "product_id");
  if (mode === "auto" || !productId) {
    const recipient = await getRecipient(user.id, occasion.recipient_id);
    if (!recipient) return;
    const pick = autoPick({
      recipient,
      address,
      occasionKind: occasion.kind,
      budgetCents,
      recentProductIds: await recentProductIds(user.id, occasion.recipient_id),
    });
    if (!pick) return;
    productId = pick.product.id;
  }

  const product = getProduct(productId);
  if (!product) return;

  const plan = planDelivery(eventDate, product, address);
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

export async function cancelMissionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const id = s(formData, "id");
  const mission = await getMission(user.id, id);
  if (!mission || mission.status === "delivered") return;

  await db.run(`UPDATE missions SET status = 'canceled', updated_at = ? WHERE id = ? AND user_id = ?`, [nowIso(),
    id,
    user.id,]);
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

/* ── Settings ───────────────────────────────────────────────── */

export async function updateSettingsAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  await db.run(`UPDATE users SET name = ?, auto_pilot = ?, payment_ok = ? WHERE id = ?`, [s(formData, "name") || user.name,
    formData.get("auto_pilot") ? 1 : 0,
    formData.get("payment_ok") ? 1 : 0,
    user.id,]);
  refreshApp();
}

/** Detaches the Stripe payment method and clears the local flag. */
export async function removeCardAction(): Promise<void> {
  const user = await requireUser();
  await removeCard(user);
  refreshApp();
}

/* ── Ops ────────────────────────────────────────────────────── */

/** Manually fire the scheduler. In production this is a cron, not a button. */
export async function runDispatchAction(): Promise<void> {
  await requireUser();
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

  scheduleSeeded(user.id, birthdayId, recipientId, workId, "bouquet_garden_seasonal", "Happy birthday. Yes, I remembered. — M");
  scheduleSeeded(user.id, anniversaryId, recipientId, homeId, "fruit_bouquet_celebration", "Same time next year. — M");

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
