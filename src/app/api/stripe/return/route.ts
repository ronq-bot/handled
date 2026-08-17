import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { completeCardSetup } from "@/lib/payments";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Where Stripe Checkout sends the user back to. Saves the new card. */
export async function GET(request: Request) {
  const user = await requireUser();

  const sessionId = new URL(request.url).searchParams.get("session_id");
  const back = new URL("/dashboard/settings", env.appUrl);

  if (!sessionId) {
    back.searchParams.set("card", "error");
    back.searchParams.set("detail", "Stripe did not return a session.");
    return NextResponse.redirect(back);
  }

  const saved = await completeCardSetup(sessionId, user);
  if (!saved.ok) {
    back.searchParams.set("card", "error");
    back.searchParams.set("detail", saved.error.slice(0, 140));
    return NextResponse.redirect(back);
  }

  back.searchParams.set("card", "saved");
  return NextResponse.redirect(back);
}
