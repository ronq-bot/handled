import { requireUser } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { CATEGORY_LABELS, formatMoney, getProduct, getVendor } from "@/lib/catalog";
import { isOperator } from "@/lib/env";
import { houseLedger, orderDesk } from "@/lib/queries";
import { formatShort } from "@/lib/date";
import { StatusPill } from "@/components/ui";
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
  const user = await requireUser();
  const rows = coverageWithStatus();
  const summary = coverageSummary();
  // The commission ledger is the house's own number and must never reach a
  // member's screen — it renders only for the operator.
  const operator = isOperator(user.email);
  const ledger = operator ? await houseLedger() : null;
  const desk = operator ? await orderDesk(50) : null;

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
                      {/* Our own house name, not the partner's. Who actually
                          fulfils a category is a supplier relationship, and
                          naming it here would put someone else's brand on our
                          page — see `partner` in fulfilment-map.ts, which is
                          kept for our own reference and deliberately unrendered. */}
                      <h3 className="serif text-[1.5rem] leading-tight text-ink">{r.vendorName}</h3>
                      <p className="mt-1 text-[0.9375rem] text-muted">
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

                  {/* No outbound link: it would name the supplier as surely
                      as printing their logo. `url` stays in the map for us. */}
                  <div className="mt-6">
                    <p className="text-[0.8125rem] text-faint">
                      e.g. {r.examples.join(" · ")}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {/* ── The house ledger (operator only) ─────────────────── */}
      {ledger && (
        <section className="card border-brass/40 p-9">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="display-3 text-ink">The house ledger</h2>
            <span className="tag border-brass/60 text-brass-deep">Operator view</span>
          </div>
          <p className="mt-3 max-w-2xl text-muted">
            Commission earned on every order actually placed, at the rate that applied when it went
            in. Members never see this section.
          </p>

          {ledger.length === 0 ? (
            <p className="mt-6 text-muted">
              Nothing placed yet — the ledger starts the moment the first order goes in.
            </p>
          ) : (
            <>
              <div className="mt-7 overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left text-[0.9375rem]">
                  <thead>
                    <tr className="smallcaps-quiet border-b border-line">
                      <th className="py-2 pr-4 font-medium">Supplier</th>
                      <th className="py-2 pr-4 font-medium">Orders</th>
                      <th className="py-2 pr-4 font-medium">Sales</th>
                      <th className="py-2 font-medium">Our commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.vendor_id} className="border-b border-line">
                        <td className="py-3 pr-4 font-semibold">
                          {getVendor(row.vendor_id)?.name ?? row.vendor_id}
                        </td>
                        <td className="py-3 pr-4 text-muted">{row.orders}</td>
                        <td className="py-3 pr-4 text-muted">{formatMoney(row.sales_cents)}</td>
                        <td className="py-3 font-mono text-forest">
                          {formatMoney(row.affiliate_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="py-3 pr-4 font-semibold">Total</td>
                      <td className="py-3 pr-4 text-muted">
                        {ledger.reduce((n, r) => n + r.orders, 0)}
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        {formatMoney(ledger.reduce((n, r) => n + r.sales_cents, 0))}
                      </td>
                      <td className="py-3 font-mono font-semibold text-forest">
                        {formatMoney(ledger.reduce((n, r) => n + r.affiliate_cents, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-4 text-[0.8125rem] text-faint">
                In production, set <code className="font-mono">HANDLED_ADMIN_EMAILS</code> to the
                addresses allowed to see this. Unset, it shows to nobody there.
              </p>
            </>
          )}
        </section>
      )}

      {/* ── The order desk (operator only) ───────────────────── */}
      {desk && (
        <section className="card border-brass/40 p-9">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="display-3 text-ink">The order desk</h2>
            <span className="tag border-brass/60 text-brass-deep">Operator view</span>
          </div>
          <p className="mt-3 max-w-2xl text-muted">
            The last {desk.length} orders across every account, newest movement first. Members
            never see this section.
          </p>

          {desk.length === 0 ? (
            <p className="mt-6 text-muted">Nothing yet — it fills as members schedule gifts.</p>
          ) : (
            <div className="mt-7 overflow-x-auto">
              <table className="w-full min-w-[46rem] text-left text-[0.875rem]">
                <thead>
                  <tr className="smallcaps-quiet border-b border-line">
                    <th className="py-2 pr-4 font-medium">Member</th>
                    <th className="py-2 pr-4 font-medium">Gift</th>
                    <th className="py-2 pr-4 font-medium">For</th>
                    <th className="py-2 pr-4 font-medium">Arrives</th>
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 pr-4 font-medium">Commission</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {desk.map((m) => (
                    <tr key={m.id} className="border-b border-line">
                      <td className="max-w-[12rem] truncate py-2.5 pr-4 text-muted">
                        {m.member_email}
                      </td>
                      <td className="py-2.5 pr-4 font-semibold">
                        {getProduct(m.product_id)?.name ?? m.product_id}
                      </td>
                      <td className="py-2.5 pr-4 text-muted">{m.recipient_name ?? "—"}</td>
                      <td className="py-2.5 pr-4 font-mono text-muted">
                        {formatShort(m.deliver_on)}
                      </td>
                      <td className="py-2.5 pr-4 text-muted">{formatMoney(m.price_cents)}</td>
                      <td className="py-2.5 pr-4 font-mono text-forest">
                        {m.affiliate_cents ? formatMoney(m.affiliate_cents) : "—"}
                      </td>
                      <td className="py-2.5">
                        <StatusPill status={m.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

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
