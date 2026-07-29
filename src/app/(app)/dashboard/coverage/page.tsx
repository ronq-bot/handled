import { requireUser } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { CATEGORY_LABELS } from "@/lib/catalog";
import {
  coverageSummary,
  coverageWithStatus,
  READINESS_BLURB,
  READINESS_LABEL,
  type Readiness,
} from "@/lib/fulfilment-map";

export const metadata = { title: "Fulfilment — Handled" };
export const dynamic = "force-dynamic";

const TONE: Record<Readiness, string> = {
  live: "border-sage/50 text-sage-deep",
  "self-serve": "border-forest/40 text-forest",
  apply: "border-brass/60 text-brass-deep",
  manual: "border-line-strong text-faint",
};

const ORDER: Readiness[] = ["live", "self-serve", "apply", "manual"];

export default async function CoveragePage() {
  await requireUser();
  const rows = coverageWithStatus();
  const summary = coverageSummary();

  return (
    <div className="space-y-16">
      <SectionHeading
        title="What we can actually dispatch"
        subtitle="Every category in the catalogue, mapped to the company that would really fulfil it — and an honest read on how far that is from working unattended."
      />

      {/* ── Summary ──────────────────────────────────────────── */}
      <section className="grid gap-8 border-y border-line py-10 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            n: summary.live,
            label: "Automated now",
            note: summary.dispatchingNow
              ? "Credentials present — shipping unattended."
              : "Coded. Waiting on credentials.",
          },
          {
            n: summary.buildable,
            label: "Buildable today",
            note: "Self-serve API. No permission needed.",
          },
          { n: summary.needsApproval, label: "Needs approval", note: "Real API, gated access." },
          { n: summary.manual, label: "Human in the loop", note: "No usable API exists." },
        ].map((s) => (
          <div key={s.label}>
            <p className="serif text-5xl leading-none text-ink">
              {s.n}
              <span className="text-2xl text-faint">/{summary.total}</span>
            </p>
            <p className="smallcaps-quiet mt-3">{s.label}</p>
            <p className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{s.note}</p>
          </div>
        ))}
      </section>

      {/* ── The partners ─────────────────────────────────────── */}
      {ORDER.map((readiness) => {
        const group = rows.filter((r) => r.readiness === readiness);
        if (group.length === 0) return null;

        return (
          <section key={readiness}>
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="display-3 text-ink">{READINESS_LABEL[readiness]}</h2>
              <p className="max-w-md text-[0.9375rem] text-muted sm:text-right">
                {READINESS_BLURB[readiness]}
              </p>
            </div>

            <div className="mt-8 border-t border-line">
              {group.map((r) => (
                <article key={r.vendorId} className="border-b border-line py-9">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-3">
                    <div>
                      <h3 className="serif text-[1.5rem] leading-tight text-ink">{r.partner}</h3>
                      <p className="mt-1 text-[0.9375rem] text-muted">
                        Stands in for <em>{r.vendorName}</em> ·{" "}
                        {r.categories.map((c) => CATEGORY_LABELS[c]).join(", ")} ·{" "}
                        {r.productCount} item{r.productCount === 1 ? "" : "s"}
                      </p>
                    </div>

                    <span className={`tag whitespace-nowrap ${TONE[r.readiness]}`}>
                      {r.dispatchingNow && (
                        <span className="h-1.5 w-1.5 rounded-full bg-sage" aria-hidden="true" />
                      )}
                      {r.dispatchingNow ? "Dispatching" : READINESS_LABEL[r.readiness]}
                    </span>
                  </div>

                  <dl className="mt-6 grid gap-6 md:grid-cols-2">
                    <div>
                      <dt className="smallcaps-quiet">Date guarantee</dt>
                      <dd className="mt-2 text-[0.9375rem] leading-relaxed text-muted">
                        {r.dateGuarantee}
                      </dd>
                    </div>
                    <div>
                      <dt className="smallcaps-quiet">What stands in the way</dt>
                      <dd className="mt-2 text-[0.9375rem] leading-relaxed text-muted">{r.gap}</dd>
                    </div>
                  </dl>

                  <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
                    <p className="text-[0.8125rem] text-faint">
                      e.g. {r.examples.join(" · ")}
                    </p>
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-rule"
                    >
                      Their docs ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {/* ── The honest footnote ──────────────────────────────── */}
      <section className="card p-9">
        <h2 className="display-3 text-ink">The thing worth knowing</h2>
        <p className="lede mt-4">
          Only one category — flowers — has a partner that will commit to an exact calendar date
          and let us verify it before booking. That is why the flagship promise is a bouquet on her
          birthday and not a case of wine on your anniversary.
        </p>
        <p className="mt-5 max-w-3xl leading-relaxed text-muted">
          Everything else is either date-<em>estimated</em> (production plus a carrier) or
          date-<em>irrelevant</em> (a credit delivered by email). Both are perfectly good products;
          they just make a different promise, and the catalogue should say which one it is making.
          The scheduler already models the difference — it lives in{" "}
          <code className="font-mono text-[0.875rem]">leadDaysOverride</code>, and the picker
          refuses outright anything that cannot make the date.
        </p>
      </section>
    </div>
  );
}
