import "server-only";
import { getDb, newId, nowIso } from "./db";
import type { Address, Mission, MissionEvent, Occasion, Recipient } from "./types";
import { daysBetween, nextAnniversary, today } from "./date";

export async function listRecipients(userId: string): Promise<Recipient[]> {
  const db = await getDb();
  return db.all<Recipient>(`SELECT * FROM recipients WHERE user_id = ? ORDER BY created_at`, [
    userId,
  ]);
}

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

export async function listOccasions(userId: string): Promise<Occasion[]> {
  const db = await getDb();
  return db.all<Occasion>(`SELECT * FROM occasions WHERE user_id = ? ORDER BY event_date`, [userId]);
}

export async function getOccasion(userId: string, id: string): Promise<Occasion | undefined> {
  const db = await getDb();
  return db.get<Occasion>(`SELECT * FROM occasions WHERE user_id = ? AND id = ?`, [userId, id]);
}

export async function listMissions(userId: string): Promise<Mission[]> {
  const db = await getDb();
  return db.all<Mission>(`SELECT * FROM missions WHERE user_id = ? ORDER BY deliver_on`, [userId]);
}

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
    .map((occ) => {
      const nextDate = occ.recurring ? nextAnniversary(occ.event_date, from) : occ.event_date;
      return {
        ...occ,
        nextDate,
        daysAway: daysBetween(from, nextDate),
        recipientName: recipients.get(occ.recipient_id)?.name ?? "Someone",
        missions: missions.filter(
          (m) => m.occasion_id === occ.id && m.status !== "canceled" && m.deliver_on >= from,
        ),
      };
    })
    .filter((o) => o.daysAway >= 0 && o.daysAway <= horizonDays)
    .sort((a, b) => a.daysAway - b.daysAway);
}
