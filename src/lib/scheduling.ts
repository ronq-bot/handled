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

/**
 * The Doghouse Risk score lives in `risk.ts` so the public quiz can run it in
 * the browser; re-exported here so the dashboard's imports read as before.
 */
export { dogHouseRisk } from "./risk";
export type { DogHouseRisk, RiskInput, RiskLevel } from "./risk";
