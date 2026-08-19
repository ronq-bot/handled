import { NextResponse, type NextRequest } from "next/server";

/**
 * The pre-launch gate.
 *
 * While HANDLED_COMING_SOON is "1", every public route is *rewritten* to
 * /coming-soon — rewritten rather than redirected so the URL is preserved and
 * nobody can probe which routes exist by watching where they land.
 *
 * You get past it with `?preview=<HANDLED_PREVIEW_SECRET>` once; that sets a
 * cookie so the rest of the session behaves normally. Turning the flag off
 * (or leaving it unset) disables all of this — the gate is opt-in, so a
 * misconfigured env var can never accidentally hide a live site.
 */

const BYPASS_COOKIE = "handled_preview";
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export function middleware(request: NextRequest) {
  if (process.env.HANDLED_COMING_SOON !== "1") return NextResponse.next();

  const secret = process.env.HANDLED_PREVIEW_SECRET;
  const { pathname, searchParams } = request.nextUrl;

  // The holding page itself must always resolve, or the rewrite would loop.
  if (pathname === "/coming-soon") return NextResponse.next();

  // Redeem the link once, then drop the secret from the URL so it isn't left
  // sitting in history, referrer headers, or a screenshot.
  if (secret && searchParams.get("preview") === secret) {
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("preview");
    const response = NextResponse.redirect(clean);
    response.cookies.set(BYPASS_COOKIE, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: THIRTY_DAYS,
    });
    return response;
  }

  if (secret && request.cookies.get(BYPASS_COOKIE)?.value === secret) {
    return NextResponse.next();
  }

  return NextResponse.rewrite(new URL("/coming-soon", request.url));
}

export const config = {
  /**
   * Everything except Next's own assets, our product photography, and the
   * machine entry points — the scheduler has to keep dispatching real orders
   * while the front door is shut, and uptime monitors have to keep seeing a
   * real health answer, not a holding page.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|products/|marketing/|api/cron|api/health).*)",
  ],
};
