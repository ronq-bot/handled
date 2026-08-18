import type { MissionStatus } from "@/lib/types";

const STEPS: { key: MissionStatus; label: string; blurb: string }[] = [
  { key: "scheduled", label: "Scheduled", blurb: "On the calendar" },
  { key: "placed", label: "Ordered", blurb: "Placed & paid" },
  { key: "shipped", label: "On its way", blurb: "Out for delivery" },
  { key: "delivered", label: "Delivered", blurb: "In her hands" },
];

/**
 * Where a gift stands, as a quiet four-stop line. Failure and cancellation
 * are not stops on the journey, so they render as a plain statement instead
 * of pretending to be progress.
 */
export function MissionProgress({ status }: { status: MissionStatus }) {
  if (status === "failed" || status === "canceled") {
    return (
      <p className="border-t border-line pt-5 text-sm text-muted">
        {status === "failed"
          ? "This gift needs attention before it can move again."
          : "This gift was called off. Nothing further will happen."}
      </p>
    );
  }

  const current = STEPS.findIndex((s) => s.key === status);

  return (
    <ol className="flex border-t border-line pt-5" aria-label="Order progress">
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={step.key} className="flex flex-1 flex-col gap-2" aria-current={active ? "step" : undefined}>
            <div className="flex items-center">
              <span
                aria-hidden="true"
                className={`h-2.5 w-2.5 shrink-0 rounded-full border ${
                  done
                    ? "border-sage bg-sage"
                    : active
                      ? "border-forest bg-forest"
                      : "border-line-strong bg-transparent"
                }`}
              />
              {i < STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={`h-px flex-1 ${done ? "bg-sage" : "bg-line"}`}
                />
              )}
            </div>
            <div className="pr-3">
              <div
                className={`text-[0.6875rem] font-medium uppercase tracking-[0.15em] ${
                  active ? "text-forest" : done ? "text-sage-deep" : "text-faint"
                }`}
              >
                {step.label}
              </div>
              <div className={`mt-0.5 text-xs ${active ? "text-muted" : "text-faint"}`}>
                {active || done ? step.blurb : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
