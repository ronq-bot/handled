import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { getDb, newId, nowIso } from "./db";
import type { User } from "./types";

/** Exported so a page can check for the cookie's presence without a DB hit. */
export const SESSION_COOKIE = "alpha_session";
const COOKIE = SESSION_COOKIE;
const SESSION_DAYS = 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function createUser(email: string, password: string, name: string): Promise<User> {
  const db = await getDb();
  const id = newId("usr");
  await db.run(
    `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)`,
    [id, email.toLowerCase().trim(), hashPassword(password), name.trim(), nowIso()],
  );
  return (await db.get<User>(`SELECT * FROM users WHERE id = ?`, [id]))!;
}

export async function findUserByEmail(email: string): Promise<User | undefined> {
  const db = await getDb();
  return db.get<User>(`SELECT * FROM users WHERE email = ?`, [email.toLowerCase().trim()]);
}

export async function startSession(userId: string): Promise<void> {
  const db = await getDb();
  const id = newId("ses");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.run(`INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`, [
    id,
    userId,
    expires.toISOString(),
    nowIso(),
  ]);

  // Opportunistic cleanup — expired rows would otherwise accumulate forever.
  await db.run(`DELETE FROM sessions WHERE expires_at < ?`, [nowIso()]);
  const jar = await cookies();
  jar.set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (id) {
    const db = await getDb();
    await db.run(`DELETE FROM sessions WHERE id = ?`, [id]);
  }
  jar.delete(COOKIE);
}

/**
 * Request-scoped via React's cache(): the layout, the page inside it, and any
 * helper in the same render all call this, and each duplicate call used to be
 * another session-join round trip to the database.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;

  const db = await getDb();
  const row = await db.get<User>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > ?`,
    [id, nowIso()],
  );

  return row ?? null;
});

/** For pages and actions that must not run for a signed-out visitor. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
