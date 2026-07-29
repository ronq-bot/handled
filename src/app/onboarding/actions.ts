"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb, newId, nowIso } from "@/lib/db";

const s = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();

/**
 * One shot: the person, where she is during the day, and where she is at night.
 * Dates come next — we don't want a six-screen wizard standing between a man and
 * the thing he came here to do.
 */
export async function completeOnboardingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const db = await getDb();
  const recipientId = newId("rcp");

  await db.run(
    `INSERT INTO recipients (id, user_id, name, relationship, likes, dislikes, allergies, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipientId,
      user.id,
      s(formData, "name") || "Her",
      s(formData, "relationship") || "wife",
      s(formData, "likes"),
      s(formData, "dislikes"),
      s(formData, "allergies"),
      "",
      nowIso(),
    ],
  );

  await insertAddress(user.id, recipientId, "home", formData, "home");
  if (s(formData, "work_line1")) {
    await insertAddress(user.id, recipientId, "work", formData, "work");
  }

  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/dates/new?first=1");
}

async function insertAddress(
  userId: string,
  recipientId: string,
  kind: "home" | "work",
  fd: FormData,
  prefix: string,
): Promise<void> {
  const db = await getDb();
  const g = (k: string) => String(fd.get(`${prefix}_${k}`) ?? "").trim();

  await db.run(
    `INSERT INTO addresses (id, user_id, recipient_id, kind, nickname, line1, line2, city, state,
       postal_code, country, window_start, window_end, weekdays_only, delivery_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, ?, ?, ?)`,
    [
      newId("adr"),
      userId,
      recipientId,
      kind,
      kind === "home" ? "Home" : "Work",
      g("line1"),
      g("line2"),
      g("city"),
      g("state"),
      g("postal_code"),
      g("window_start") || (kind === "home" ? "16:00" : "09:00"),
      g("window_end") || (kind === "home" ? "20:00" : "17:00"),
      kind === "work" ? 1 : 0,
      g("notes"),
      nowIso(),
    ],
  );
}
