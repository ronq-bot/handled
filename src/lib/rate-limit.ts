import { getDb } from "./db";

/**
 * A fixed-window counter in the database, because the app runs serverless —
 * an in-memory map would reset on every cold start and never be shared
 * between instances. One row per key; the window rolls forward atomically in
 * the upsert so two concurrent attempts can't both start a fresh window.
 *
 * Returns true while the attempt is inside the allowance. Callers pick keys
 * that bind the thing being protected ("login:{email}"), not the caller's
 * address — the goal is stopping a credential grind against one account.
 */
export async function allowAttempt(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  const nowIso = now.toISOString();
  const resetsAt = new Date(now.getTime() + windowSeconds * 1000).toISOString();

  await db.run(
    `INSERT INTO rate_limits (key, resets_at, count) VALUES (?, ?, 1)
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.resets_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
       resets_at = CASE WHEN rate_limits.resets_at <= ? THEN ? ELSE rate_limits.resets_at END`,
    [key, resetsAt, nowIso, nowIso, resetsAt],
  );
  const row = await db.get<{ count: number }>(`SELECT count FROM rate_limits WHERE key = ?`, [key]);
  return Number(row?.count ?? 0) <= max;
}
