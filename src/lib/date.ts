/**
 * All calendar dates in Handled are plain `YYYY-MM-DD` strings and all math
 * happens in UTC. A gift date is a wall-calendar fact, not an instant — doing it
 * this way keeps "August 20" from sliding to the 19th for anyone west of UTC.
 */

export type IsoDate = string;

const DAY_MS = 86_400_000;

export function toUtc(date: IsoDate): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function fromUtc(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function today(): IsoDate {
  return fromUtc(new Date());
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromUtc(new Date(toUtc(date).getTime() + days * DAY_MS));
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(date: IsoDate): number {
  return toUtc(date).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const d = weekday(date);
  return d === 0 || d === 6;
}

/** Pull a Sat/Sun date back to the preceding Friday. Used for work deliveries. */
export function previousBusinessDay(date: IsoDate): IsoDate {
  let d = date;
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

/**
 * Next occurrence of a recurring MM-DD on/after `from`. Feb 29 in a non-leap
 * year lands on Feb 28 rather than silently jumping to March 1.
 */
export function nextAnniversary(eventDate: IsoDate, from: IsoDate = today()): IsoDate {
  const [, m, d] = eventDate.split("-").map(Number);
  const fromYear = Number(from.slice(0, 4));
  for (const year of [fromYear, fromYear + 1]) {
    const candidate = clampToMonth(year, m, d);
    if (daysBetween(from, candidate) >= 0) return candidate;
  }
  return clampToMonth(fromYear + 1, m, d);
}

function clampToMonth(year: number, month: number, day: number): IsoDate {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return fromUtc(new Date(Date.UTC(year, month - 1, Math.min(day, lastDay))));
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatLong(date: IsoDate): string {
  const d = toUtc(date);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatShort(date: IsoDate): string {
  const d = toUtc(date);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
}

export function monthLabel(date: IsoDate): string {
  const d = toUtc(date);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function countdown(date: IsoDate, from: IsoDate = today()): string {
  const n = daysBetween(from, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 0) return `${Math.abs(n)} days ago`;
  if (n < 45) return `in ${n} days`;
  const months = Math.round(n / 30);
  return `in ~${months} month${months === 1 ? "" : "s"}`;
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour}${suffix}` : `${hour}:${String(m).padStart(2, "0")}${suffix}`;
}

/**
 * The next occurrence of a fixed-calendar holiday, so the form can fill in
 * dates nobody should have to type. Mother's Day (US) is the second Sunday
 * of May; the others never move. Returns null for kinds that are personal —
 * we can never guess a birthday.
 */
export function nextFixedHoliday(
  kind: string,
  from: IsoDate = today(),
): IsoDate | null {
  const year = Number(from.slice(0, 4));

  const candidate = (y: number): IsoDate | null => {
    if (kind === "valentines") return `${y}-02-14`;
    if (kind === "christmas") return `${y}-12-25`;
    if (kind === "mothers_day") {
      // Second Sunday of May: May 1's weekday decides how far to the first
      // Sunday, then one more week.
      const may1 = toUtc(`${y}-05-01`);
      const toSunday = (7 - may1.getUTCDay()) % 7;
      return fromUtc(new Date(may1.getTime() + (toSunday + 7) * DAY_MS));
    }
    return null;
  };

  const thisYear = candidate(year);
  if (thisYear === null) return null;
  return thisYear >= from ? thisYear : candidate(year + 1);
}
