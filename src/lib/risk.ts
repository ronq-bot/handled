/**
 * The Doghouse Risk score, on its own so both sides of the wall can run it:
 * the dashboard (via `scheduling.ts`, which re-exports everything here) and
 * the public quiz at `/risk`, which computes the score in the browser as the
 * visitor types. Keep this module dependency-free — the moment it imports
 * anything server-flavoured, the quiz page stops building.
 */

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
