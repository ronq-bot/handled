import { addDays, daysBetween, previousBusinessDay, today, type IsoDate } from "./date";
import { leadDaysFor, type Product } from "./catalog";
import type { Address } from "./types";

/**
 * How far ahead a gift may be committed to.
 *
 * A recurring date never trips this — `nextAnniversary` always lands inside a
 * year — so in practice it catches one-off dates entered far out. The limit
 * exists because a mission is a set of promises made at planning time that all
 * decay: it stores the price, the product, the address and the card, and none
 * of those survive two years unattended. Better to ask again than to ship
 * something priced in 2026 against a card that expired in 2027.
 */
export const MAX_SCHEDULE_DAYS = 365;

export type Plan = {
  deliverOn: IsoDate;
  shipOn: IsoDate;
  leadDays: number;
  /** True when we shifted off the actual date (weekend + a work address). */
  shifted: boolean;
  shiftReason: string;
  /** True when there isn't enough runway left to place this order. */
  tooLate: boolean;
  lateReason: string;
  /** True when the date is further out than we're willing to commit to. */
  tooFar: boolean;
  farReason: string;
};

/**
 * Turns "her birthday is August 20" into the two dates that actually matter:
 * when it lands on her desk, and when we have to hit the button.
 */
export function planDelivery(
  eventDate: IsoDate,
  product: Product,
  address: Pick<Address, "kind" | "weekdays_only">,
  from: IsoDate = today(),
): Plan {
  const leadDays = leadDaysFor(product);
  const officeBound = address.kind === "work" || address.weekdays_only === 1;

  let deliverOn = eventDate;
  let shifted = false;
  let shiftReason = "";

  if (officeBound) {
    const adjusted = previousBusinessDay(eventDate);
    if (adjusted !== eventDate) {
      deliverOn = adjusted;
      shifted = true;
      shiftReason =
        "The date falls on a weekend and nobody is at the office — delivering the Friday before.";
    }
  }

  const shipOn = addDays(deliverOn, -leadDays);
  const runway = daysBetween(from, shipOn);
  const reach = daysBetween(from, deliverOn);

  return {
    deliverOn,
    shipOn,
    leadDays,
    shifted,
    shiftReason,
    tooLate: runway < 0,
    lateReason:
      runway < 0
        ? `${product.name} needs ${leadDays} days of lead time and that ship date has already passed.`
        : "",
    tooFar: reach > MAX_SCHEDULE_DAYS,
    farReason:
      reach > MAX_SCHEDULE_DAYS
        ? `That date is over a year away. We schedule twelve months at a time, then ask you to look again — prices, addresses and cards all move in two years.`
        : "",
  };
}

/** Products we can still get there in time for `eventDate`. */
export function isFeasible(
  eventDate: IsoDate,
  product: Product,
  address: Pick<Address, "kind" | "weekdays_only">,
  from: IsoDate = today(),
): boolean {
  const plan = planDelivery(eventDate, product, address, from);
  return !plan.tooLate && !plan.tooFar;
}

export type RiskLevel = "clear" | "watch" | "warning" | "critical";

export type DogHouseRisk = {
  level: RiskLevel;
  score: number;
  headline: string;
  detail: string;
  issues: string[];
};

export type RiskInput = {
  /** Occasions coming up in the next year that have no mission attached. */
  uncoveredOccasions: { title: string; daysAway: number }[];
  missionsNeedingAttention: number;
  paymentOk: boolean;
  totalOccasions: number;
};

/**
 * The dashboard's headline number. Deliberately theatrical, but every point of
 * risk maps to something the user can go fix in one click.
 */
export function dogHouseRisk(input: RiskInput): DogHouseRisk {
  const issues: string[] = [];
  let score = 0;

  if (input.totalOccasions === 0) {
    return {
      level: "warning",
      score: 55,
      headline: "Unknown risk. That's its own kind of risk.",
      detail: "You haven't told us a single date yet. Statistically, this ends badly.",
      issues: ["No important dates on file"],
    };
  }

  for (const occ of input.uncoveredOccasions) {
    if (occ.daysAway <= 14) {
      score += 40;
      issues.push(`${occ.title} is ${occ.daysAway} days out with nothing scheduled`);
    } else if (occ.daysAway <= 45) {
      score += 22;
      issues.push(`${occ.title} is coming up and has no gift attached`);
    } else {
      score += 8;
      issues.push(`${occ.title} is unplanned`);
    }
  }

  if (!input.paymentOk) {
    score += 25;
    issues.push("No payment method on file — nothing can actually ship");
  }

  if (input.missionsNeedingAttention > 0) {
    score += 15 * input.missionsNeedingAttention;
    issues.push(
      `${input.missionsNeedingAttention} scheduled gift${
        input.missionsNeedingAttention === 1 ? "" : "s"
      } need${input.missionsNeedingAttention === 1 ? "s" : ""} your attention`,
    );
  }

  score = Math.min(100, score);

  if (score === 0) {
    return {
      level: "clear",
      score,
      headline: "Certified thoughtful.",
      detail: "Every date is covered and paid for. Go be smug about it.",
      issues,
    };
  }
  if (score < 30) {
    return {
      level: "watch",
      score,
      headline: "Mostly safe.",
      detail: "One or two loose ends. Nothing that ends in a silent car ride.",
      issues,
    };
  }
  if (score < 65) {
    return {
      level: "warning",
      score,
      headline: "Doghouse-adjacent.",
      detail: "There's a gap on the calendar and it has your name on it.",
      issues,
    };
  }
  return {
    level: "critical",
    score,
    headline: "Start practicing your apology face.",
    detail: "Multiple dates are unprotected. This is the exact situation we built for.",
    issues,
  };
}
