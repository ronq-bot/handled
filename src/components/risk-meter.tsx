import type { DogHouseRisk } from "@/lib/scheduling";

const TONE = {
  clear: { bar: "bg-sage", text: "text-sage-deep", label: "In good standing" },
  watch: { bar: "bg-brass", text: "text-brass-deep", label: "Minor exposure" },
  warning: { bar: "bg-clay", text: "text-clay", label: "Exposed" },
  critical: { bar: "bg-claret", text: "text-claret", label: "Seriously exposed" },
} as const;

/**
 * The account's standing, set like a statement header: a serif figure, a
 * hairline rule, and a single quiet bar. No gauge, no colour-blocking.
 */
export function RiskMeter({ risk }: { risk: DogHouseRisk }) {
  const tone = TONE[risk.level];

  return (
    <section aria-labelledby="risk-heading" className="border-y border-line py-10">
      <div className="grid gap-10 md:grid-cols-[1fr_auto] md:items-start">
        <div>
          <h2 id="risk-heading" className="smallcaps">
            Standing · {tone.label}
          </h2>
          <p className="display-3 mt-4">{risk.headline}</p>
          <p className="mt-3 max-w-xl leading-relaxed text-muted">{risk.detail}</p>
        </div>

        <div className="md:text-right">
          <p className={`serif text-7xl leading-none ${tone.text}`}>{risk.score}</p>
          <p className="smallcaps-quiet mt-3">of 100 risk</p>
        </div>
      </div>

      <div
        className="mt-9 h-px w-full bg-line"
        role="meter"
        aria-valuenow={risk.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${risk.score} out of 100 — ${risk.headline}`}
        aria-labelledby="risk-heading"
      >
        <div
          className={`h-px transition-[width] duration-500 ${tone.bar}`}
          style={{ width: `${Math.max(risk.score, 2)}%` }}
        />
      </div>

      {risk.issues.length > 0 && (
        <ul className="mt-8 space-y-3">
          {risk.issues.map((issue) => (
            <li key={issue} className="flex gap-4 text-[0.9375rem] leading-relaxed text-muted">
              <span className={`mt-3 h-px w-4 shrink-0 ${tone.bar}`} aria-hidden="true" />
              {issue}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
