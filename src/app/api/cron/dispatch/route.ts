import { NextResponse } from "next/server";
import { runDispatch } from "@/lib/dispatcher";
import { today } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * The scheduler's entry point. Point a cron at this once an hour:
 *   curl -H "Authorization: Bearer $HANDLED_CRON_SECRET" https://…/api/cron/dispatch
 *
 * Idempotent — re-running it the same day changes nothing. `?asOf=YYYY-MM-DD`
 * lets you fast-forward the calendar in development.
 */
export async function GET(request: Request) {
  const secret = process.env.HANDLED_CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
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
