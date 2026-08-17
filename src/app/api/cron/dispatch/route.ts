import { timingSafeEqual, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { runDispatch } from "@/lib/dispatcher";
import { today } from "@/lib/date";

/** Length-independent comparison, so the check leaks nothing by timing. */
function secretsMatch(presented: string, expected: string): boolean {
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const dynamic = "force-dynamic";

/**
 * The scheduler's entry point. Point a cron at this once an hour:
 *   curl -H "Authorization: Bearer $HANDLED_CRON_SECRET" https://…/api/cron/dispatch
 *
 * Idempotent — re-running it the same day changes nothing. `?asOf=YYYY-MM-DD`
 * lets you fast-forward the calendar in development.
 */
export async function GET(request: Request) {
  // In production the secret is mandatory: this route sits outside the
  // coming-soon gate (the cron must keep running behind it), so without a
  // secret it would be the one publicly reachable endpoint. CRON_SECRET is
  // accepted too, because that is the env var Vercel's own scheduler sends —
  // configure only HANDLED_CRON_SECRET and scheduled runs would 401 forever.
  const secret = process.env.HANDLED_CRON_SECRET ?? process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "HANDLED_CRON_SECRET is not set — refusing to run the dispatcher unauthenticated." },
      { status: 503 },
    );
  }
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (!secretsMatch(auth, `Bearer ${secret}`)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const requested = url.searchParams.get("asOf");
  const asOf =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) && process.env.NODE_ENV !== "production"
      ? requested
      : today();

  const report = await runDispatch(asOf);
  return NextResponse.json(report);
}
