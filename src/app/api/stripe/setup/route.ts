import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { paymentsAreLive, startCardSetup } from "@/lib/payments";

export const dynamic = "force-dynamic";

/** Sends the signed-in user to Stripe's hosted page to add a card. */
export async function GET() {
  const user = await requireUser();

  if (!paymentsAreLive()) {
    return NextResponse.redirect(new URL("/dashboard/settings?card=unconfigured", env.appUrl));
  }

  const session = await startCardSetup(user);
  if (!session.ok) {
    const url = new URL("/dashboard/settings", env.appUrl);
    url.searchParams.set("card", "error");
    url.searchParams.set("detail", session.error.slice(0, 140));
    return NextResponse.redirect(url);
  }

  return NextResponse.redirect(session.data);
}
