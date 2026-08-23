import "server-only";
import { cache } from "react";
import { getDb, newId, nowIso } from "./db";
import type { Address, Mission, MissionEvent, Occasion, Recipient } from "./types";
import { addDays, daysBetween, nextAnniversary, today } from "./date";

/*
 * The list functions are wrapped in React's request-scoped cache: a layout,
 * the page inside it, and `upcomingOccasions` all ask for the same rows
 * during one render, and on hosted Postgres each duplicate query is a real
 * round trip. Outside a React render (the dispatcher) cache() is a no-op.
 */

export const listRecipients = cache(async (userId: string): Promise<Recipient[]> => {
  const db = await getDb();
  return db.all<Recipient>(`SELECT * FROM recipients WHERE user_id = ? ORDER BY created_at`, [
    userId,
  ]);
});

export async function getRecipient(userId: string, id: string): Promise<Recipient | undefined> {
  const db = await getDb();
  return db.get<Recipient>(`SELECT * FROM recipients WHERE user_id = ? AND id = ?`, [userId, id]);
}

export async function listAddresses(userId: string, recipientId?: string): Promise<Address[]> {
  const db = await getDb();
  return recipientId
    ? db.all<Address>(
        `SELECT * FROM addresses WHERE user_id = ? AND recipient_id = ? ORDER BY kind`,
        [userId, recipientId],
      )
    : db.all<Address>(`SELECT * FROM addresses WHERE user_id = ? ORDER BY recipient_id, kind`, [
        userId,
      ]);
}

export async function getAddress(userId: string, id: string): Promise<Address | undefined> {
  const db = await getDb();
  return db.get<Address>(`SELECT * FROM addresses WHERE user_id = ? AND id = ?`, [userId, id]);
}

export const listOccasions = cache(async (userId: string): Promise<Occasion[]> => {
  const db = await getDb();
  return db.all<Occasion>(`SELECT * FROM occasions WHERE user_id = ? ORDER BY event_date`, [userId]);
});

export async function getOccasion(userId: string, id: string): Promise<Occasion | undefined> {
  const db = await getDb();
  return db.get<Occasion>(`SELECT * FROM occasions WHERE user_id = ? AND id = ?`, [userId, id]);
}

export const listMissions = cache(async (userId: string): Promise<Mission[]> => {
  const db = await getDb();
  return db.all<Mission>(`SELECT * FROM missions WHERE user_id = ? ORDER BY deliver_on`, [userId]);
});

export async function getMission(userId: string, id: string): Promise<Mission | undefined> {
  const db = await getDb();
  return db.get<Mission>(`SELECT * FROM missions WHERE user_id = ? AND id = ?`, [userId, id]);
}

export async function listMissionEvents(missionId: string): Promise<MissionEvent[]> {
  const db = await getDb();
  return db.all<MissionEvent>(
    `SELECT * FROM mission_events WHERE mission_id = ? ORDER BY at, id`,
    [missionId],
  );
}

export async function logMissionEvent(
  missionId: string,
  status: string,
  note = "",
): Promise<void> {
  const db = await getDb();
  await db.run(
    `INSERT INTO mission_events (id, mission_id, status, note, at) VALUES (?, ?, ?, ?, ?)`,
    [newId("evt"), missionId, status, note, nowIso()],
  );
}

/** Product ids already scheduled for this recipient, newest first — feeds the variety rule. */
export async function recentProductIds(userId: string, recipientId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.all<{ product_id: string }>(
    `SELECT product_id FROM missions
     WHERE user_id = ? AND recipient_id = ? AND status != 'canceled'
     ORDER BY deliver_on DESC LIMIT 6`,
    [userId, recipientId],
  );
  return rows.map((r) => r.product_id).filter(Boolean);
}

export type DeskRow = Mission & { member_email: string; recipient_name: string };

/**
 * The operator's order desk: recent missions across EVERY account, joined to
 * who they belong to. Operator-facing only — the caller must gate this behind
 * isOperator(); a member must never see another member's orders.
 */
export async function orderDesk(limit = 50): Promise<DeskRow[]> {
  const db = await getDb();
  return db.all<DeskRow>(
    `SELECT m.*, u.email AS member_email, r.name AS recipient_name
     FROM missions m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN recipients r ON r.id = m.recipient_id
     ORDER BY m.updated_at DESC LIMIT ?`,
    [limit],
  );
}

/**
 * Everything the account owns, for the member to take with them. Secrets
 * never leave: the password hash, reset tokens, and Stripe identifiers are
 * stripped before this crosses the wire.
 */
export async function exportAccount(userId: string): Promise<Record<string, unknown>> {
  const db = await getDb();
  const user = await db.get<Record<string, unknown>>(`SELECT * FROM users WHERE id = ?`, [userId]);
  if (!user) return {};
  for (const secret of [
    "password_hash",
    "reset_token_hash",
    "reset_token_expires",
    "stripe_customer_id",
    "stripe_payment_method_id",
  ]) {
    delete user[secret];
  }

  const [recipients, addresses, occasions, missions] = await Promise.all([
    db.all(`SELECT * FROM recipients WHERE user_id = ?`, [userId]),
    db.all(`SELECT * FROM addresses WHERE user_id = ?`, [userId]),
    db.all(`SELECT * FROM occasions WHERE user_id = ?`, [userId]),
    db.all(`SELECT * FROM missions WHERE user_id = ?`, [userId]),
  ]);
  const events = await db.all(
    `SELECT * FROM mission_events WHERE mission_id IN (SELECT id FROM missions WHERE user_id = ?)`,
    [userId],
  );

  return { exported_at: new Date().toISOString(), user, recipients, addresses, occasions, missions, mission_events: events };
}

/**
 * Deletes the account and everything under it — refused while an order is
 * actually moving, because a paid, placed gift will arrive whether or not
 * the account exists, and its record should too.
 */
export async function deleteAccount(
  userId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  const inFlight = await db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM missions WHERE user_id = ? AND status IN ('placed', 'shipped')`,
    [userId],
  );
  if (Number(inFlight?.n ?? 0) > 0) {
    return {
      ok: false,
      reason: "An order is already placed and moving. Once it lands, deletion works.",
    };
  }

  await db.run(
    `DELETE FROM mission_events WHERE mission_id IN (SELECT id FROM missions WHERE user_id = ?)`,
    [userId],
  );
  for (const table of ["missions", "occasions", "addresses", "recipients", "sessions"]) {
    await db.run(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
  }
  await db.run(`DELETE FROM users WHERE id = ?`, [userId]);
  return { ok: true };
}

export type LedgerRow = {
  vendor_id: string;
  orders: number;
  sales_cents: number;
  affiliate_cents: number;
};

/**
 * The house's commission ledger: every order actually placed, across all
 * accounts, grouped by supplier. Operator-facing only — the caller must gate
 * this behind isOperator() before any of it reaches a page.
 */
export async function houseLedger(): Promise<LedgerRow[]> {
  const db = await getDb();
  const rows = await db.all<LedgerRow>(
    `SELECT vendor_id, COUNT(*) AS orders,
            SUM(price_cents) AS sales_cents, SUM(affiliate_cents) AS affiliate_cents
     FROM missions WHERE status IN ('placed', 'shipped', 'delivered')
     GROUP BY vendor_id`,
  );
  // Postgres hands SUM/COUNT back as strings; SQLite as numbers. Normalise.
  return rows
    .map((r) => ({
      vendor_id: r.vendor_id,
      orders: Number(r.orders),
      sales_cents: Number(r.sales_cents),
      affiliate_cents: Number(r.affiliate_cents),
    }))
    .sort((a, b) => b.affiliate_cents - a.affiliate_cents);
}

/**
 * Products the member marked "miss" after delivery, for this recipient.
 * The picker treats these as hard vetoes — a gift that already landed badly
 * once is worse than repetitive, it's a known mistake.
 */
export async function missedProductIds(userId: string, recipientId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.all<{ product_id: string }>(
    `SELECT DISTINCT product_id FROM missions
     WHERE user_id = ? AND recipient_id = ? AND feedback = 'miss'`,
    [userId, recipientId],
  );
  return rows.map((r) => r.product_id).filter(Boolean);
}

export type UpcomingOccasion = Occasion & {
  /** For recurring dates this is the next time it comes around, not the original year. */
  nextDate: string;
  daysAway: number;
  recipientName: string;
  missions: Mission[];
};

/**
 * The dashboard's spine: every date on file, resolved to its next occurrence,
 * with whatever we've already scheduled against it.
 */
export async function upcomingOccasions(
  userId: string,
  horizonDays = 400,
): Promise<UpcomingOccasion[]> {
  const from = today();
  const [recipientRows, missions, occasions] = await Promise.all([
    listRecipients(userId),
    listMissions(userId),
    listOccasions(userId),
  ]);
  const recipients = new Map(recipientRows.map((r) => [r.id, r]));

  return occasions
    .filter((occ) => /^\d{4}-\d{2}-\d{2}$/.test(occ.event_date))
    .map((occ) => {
      const nextDate = occ.recurring ? nextAnniversary(occ.event_date, from) : occ.event_date;
      return {
        ...occ,
        nextDate,
        daysAway: daysBetween(from, nextDate),
        recipientName: recipients.get(occ.recipient_id)?.name ?? "Someone",
        // A mission belongs to this occurrence when it lands on or shortly
        // before it — a weekend delivery shifted to the Friday before must
        // still count as cover on the day itself, or the dashboard would
        // panic (and offer to double-book) during the very window the gift
        // is arriving.
        missions: missions.filter(
          (m) =>
            m.occasion_id === occ.id &&
            m.status !== "canceled" &&
            m.deliver_on >= addDays(nextDate, -7) &&
            m.deliver_on <= nextDate,
        ),
      };
    })
    .filter((o) => o.daysAway >= 0 && o.daysAway <= horizonDays)
    .sort((a, b) => a.daysAway - b.daysAway);
}
