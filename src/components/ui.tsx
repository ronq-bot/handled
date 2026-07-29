import type { MissionStatus } from "@/lib/types";

const STATUS_STYLES: Record<MissionStatus, { label: string; dot: string; className: string }> = {
  scheduled: { label: "Scheduled", dot: "bg-forest", className: "border-forest/35 text-forest" },
  placed: { label: "Placed", dot: "bg-brass", className: "border-brass/50 text-brass-deep" },
  shipped: { label: "In transit", dot: "bg-brass", className: "border-brass/50 text-brass-deep" },
  delivered: { label: "Delivered", dot: "bg-sage", className: "border-sage/40 text-sage-deep" },
  canceled: { label: "Cancelled", dot: "bg-faint", className: "border-line-strong text-faint" },
  failed: { label: "Needs you", dot: "bg-claret", className: "border-claret/45 text-claret" },
};

/** Status carries a mark as well as a colour — colour alone isn't accessible. */
export function StatusPill({ status }: { status: MissionStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.scheduled;
  return (
    <span className={`tag ${s.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-12 border-b border-line pb-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display-2">{title}</h1>
          {subtitle && <p className="lede mt-4">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  /** Accepted for call-site compatibility; this design doesn't show it. */
  emoji?: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border-y border-line py-24 text-center">
      <hr className="rule-brass mx-auto" />
      <h2 className="display-3 mt-8">{title}</h2>
      <p className="mx-auto mt-4 max-w-md leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-10">{action}</div>}
    </div>
  );
}

const STAT_TONES = {
  forest: "text-forest",
  brass: "text-brass-deep",
  sage: "text-sage-deep",
  slate: "text-ink",
} as const;

/**
 * A ledger figure. Serif numeral over a letter-spaced label, separated by a
 * hairline — no card, no tile, no shadow.
 */
export function Stat({
  label,
  value,
  hint,
  accent = "slate",
}: {
  label: string;
  value: string;
  hint?: string;
  /** Accepted for call-site compatibility; this design doesn't show it. */
  emoji?: string;
  accent?: keyof typeof STAT_TONES;
}) {
  return (
    <div className="border-t border-line pt-6">
      <p className="smallcaps-quiet">{label}</p>
      <p className={`serif mt-3 text-5xl leading-none ${STAT_TONES[accent]}`}>{value}</p>
      {hint && <p className="mt-3 text-[0.9375rem] text-muted">{hint}</p>}
    </div>
  );
}
