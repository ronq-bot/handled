import { currentUser } from "@/lib/auth";
import { upcomingOccasions } from "@/lib/queries";

export const dynamic = "force-dynamic";

/**
 * Every date on file as an iCalendar file, so his own calendar shows what
 * we're covering. All-day events; yearly ones carry an RRULE so they repeat
 * without re-downloading. Deliberately minimal — no alarms, because the whole
 * product is that he doesn't need one.
 */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const occasions = await upcomingOccasions(user.id, 400);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Handled//Standing Gift Orders//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Handled — dates that matter",
  ];

  for (const occ of occasions) {
    const start = occ.nextDate.replace(/-/g, "");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${occ.id}@handled`,
      `DTSTART;VALUE=DATE:${start}`,
      `SUMMARY:${icsText(`${occ.title} — ${occ.recipientName}`)}`,
      `DESCRIPTION:${icsText(
        occ.missions.length > 0
          ? "Handled: a gift is already scheduled for this."
          : "Handled: no gift scheduled yet.",
      )}`,
      ...(occ.recurring === 1 ? ["RRULE:FREQ=YEARLY"] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  // iCalendar requires CRLF line endings, and lines folded at 75 octets.
  const body = lines.map(fold).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="handled-dates.ics"',
      "Cache-Control": "no-store",
    },
  });
}

/** Escapes the characters iCalendar treats as structure inside text values. */
function icsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  parts.push(rest);
  return parts.join("\r\n");
}
