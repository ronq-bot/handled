import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAddresses, listMissions, listRecipients, upcomingOccasions } from "@/lib/queries";
import { dogHouseRisk } from "@/lib/scheduling";
import { getProduct, getVendor, formatMoney, OCCASION_LABELS } from "@/lib/catalog";
import { countdown, formatLong, formatShort, monthLabel } from "@/lib/date";
import { RiskMeter } from "@/components/risk-meter";
import { EmptyState, Stat, StatusPill } from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { runDispatchAction, seedDemoAction } from "../actions";

export const metadata = { title: "Overview — Handled" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scheduled?: string; seeded?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const [recipients, occasions, missions, addresses] = await Promise.all([
    listRecipients(user.id),
    upcomingOccasions(user.id, 365),
    listMissions(user.id),
    listAddresses(user.id),
  ]);
  // One lookup for the whole page — the timeline renders a row per mission.
  const addressById = new Map(addresses.map((a) => [a.id, a]));

  const uncovered = occasions.filter((o) => o.missions.length === 0);
  const risk = dogHouseRisk({
    uncoveredOccasions: uncovered.map((o) => ({ title: o.title, daysAway: o.daysAway })),
    missionsNeedingAttention: missions.filter((m) => m.status === "failed").length,
    paymentOk: user.payment_ok === 1,
    totalOccasions: occasions.length,
  });

  const nextUp = occasions[0];
  const inFlight = missions.filter((m) => ["scheduled", "placed", "shipped"].includes(m.status));
  const committedCents = inFlight.reduce((sum, m) => sum + m.price_cents, 0);

  return (
    <div className="space-y-10">
      {params.scheduled && <Banner text="Locked in. That date is handled." />}
      {params.seeded && <Banner text="Demo year loaded — Aug 20 birthday and Sep 25 anniversary." />}

      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="display-2">
            {greeting()}, {user.name.split(" ")[0] || "chief"}.
          </h1>
          <p className="mt-3 max-w-xl text-muted">
            {nextUp ? (
              <>
                {nextUp.title} is{" "}
                <span className="font-semibold text-forest">{countdown(nextUp.nextDate)}</span> —{" "}
                {formatLong(nextUp.nextDate)}.
              </>
            ) : (
              "Nothing on the calendar yet. That's the only thing standing between you and total coverage."
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/dates/new" className="btn btn-primary">
            Add a date
          </Link>
          <form action={runDispatchAction}>
            <button
              type="submit"
              className="btn btn-ghost"
              title="Normally a cron job. Here's the button."
            >
              Run scheduler now
            </button>
          </form>
        </div>
      </div>

      <RiskMeter risk={risk} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Dates protected"
          emoji="🛡️"
          value={`${occasions.length - uncovered.length}/${occasions.length}`}
          hint={uncovered.length ? `${uncovered.length} still unplanned` : "Every date covered"}
          accent={uncovered.length ? "brass" : "sage"}
        />
        <Stat
          label="Gifts in flight"
          emoji="📦"
          value={String(inFlight.length)}
          hint={nextUp ? `Next ships ${inFlight[0] ? formatShort(inFlight[0].ship_on) : "—"}` : undefined}
          accent="forest"
        />
        <Stat
          label="Committed spend"
          emoji="💳"
          value={formatMoney(committedCents)}
          hint="Charged as each ships"
          accent="slate"
        />
      </div>

      {recipients.length === 0 ? (
        <EmptyState
          emoji="🫥"
          title="There's nobody in here."
          body="Add the person you're trying not to disappoint, then we can start putting dates on the board."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/onboarding" className="btn btn-primary">
                Add her
              </Link>
              <form action={seedDemoAction}>
                <button type="submit" className="btn btn-ghost">
                  Load the demo year instead
                </button>
              </form>
            </div>
          }
        />
      ) : occasions.length === 0 ? (
        <EmptyState
          emoji="📅"
          title="No dates on the calendar."
          body="A calendar with nothing on it is just a poster. Add her birthday and we'll take it from there."
          action={
            <Link href="/dashboard/dates/new" className="btn btn-primary">
              Add the first date
            </Link>
          }
        />
      ) : (
        <section aria-labelledby="timeline-heading">
          <div className="mb-7 flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="timeline-heading" className="display-3">
              The next 12 months
            </h2>
            <Link
              href="/dashboard/gifts"
              className="inline-block py-1.5 text-sm text-muted hover:text-ink"
            >
              View all scheduled gifts →
            </Link>
          </div>

          {/* Timeline: a spine down the left, months as stations along it */}
          <div className="relative">
            <div
              className="spine absolute bottom-6 left-[7px] top-2 w-px sm:left-[9px]"
              aria-hidden="true"
            />

            <div className="space-y-10">
              {groupByMonth(occasions).map(([month, group]) => (
                <div key={month} className="relative pl-8 sm:pl-11">
                  <span
                    className="absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-forest bg-bone sm:h-[19px] sm:w-[19px]"
                    aria-hidden="true"
                  />
                  <h3 className="smallcaps">{month}</h3>

                  <div className="mt-4 space-y-3">
                    {group.map((occ) => (
                      <article key={occ.id} className="card card-lift p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-xl font-bold tracking-tight">{occ.title}</h4>
                              <span className="tag">{OCCASION_LABELS[occ.kind]}</span>
                              {occ.recurring === 1 && <span className="tag">Repeats yearly</span>}
                            </div>
                            <p className="mt-2 text-sm text-muted">
                              {occ.recipientName} · {formatLong(occ.nextDate)} ·{" "}
                              <span className="font-semibold text-forest">
                                {countdown(occ.nextDate)}
                              </span>
                            </p>
                          </div>

                          {occ.missions.length === 0 && (
                            <Link
                              href={`/dashboard/plan/${occ.id}`}
                              className="btn btn-primary shrink-0"
                            >
                              Schedule a gift
                            </Link>
                          )}
                        </div>

                        {occ.missions.length > 0 && (
                          <div className="mt-5 space-y-2.5">
                            {occ.missions.map((m) => {
                              const product = getProduct(m.product_id);
                              const vendor = product ? getVendor(product.vendorId) : undefined;
                              const address = addressById.get(m.address_id);
                              return (
                                <div
                                  key={m.id}
                                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-bone-2 p-4"
                                >
                                  {product ? (
                                    <ProductImage product={product} sizePx={44} />
                                  ) : (
                                    <span
                                      className="tile tile-brass h-11 w-11 text-xl"
                                      aria-hidden="true"
                                    >
                                      🎁
                                    </span>
                                  )}
                                  {/* Wraps rather than truncates — a gift name is
                                      the one thing worth reading in full. */}
                                  <div className="min-w-[11rem] flex-1">
                                    <div className="font-semibold">
                                      {product?.name ?? "Gift"}
                                      {m.selection_mode === "auto" && (
                                        <span className="ml-2 text-xs font-normal text-brass-deep">
                                          Auto-Pilot
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-sm text-muted">
                                      {vendor?.name} →{" "}
                                      {address ? addressSummary(address) : "address removed"}
                                    </div>
                                  </div>
                                  <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
                                    <span className="font-mono text-sm text-muted">
                                      ships {formatShort(m.ship_on)}
                                      <span className="ml-2 text-faint">
                                        {formatMoney(m.price_cents)}
                                      </span>
                                    </span>
                                    <StatusPill status={m.status} />
                                    <Link
                                      href={`/dashboard/gifts/${m.id}`}
                                      className="btn btn-quiet min-h-9 px-3 py-1.5 text-sm"
                                    >
                                      Details
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                            <Link
                              href={`/dashboard/plan/${occ.id}`}
                              className="inline-block py-1 text-sm text-muted hover:text-ink"
                            >
                              + Add another gift for this date
                            </Link>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {user.payment_ok === 0 && (
        <div className="card border-claret/40 p-6">
          <h2 className="text-lg font-bold text-claret">No payment method on file.</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Everything above is scheduled but nothing can actually ship. This is the single most
            common way people end up in the doghouse with a full dashboard.
          </p>
          <Link href="/dashboard/settings" className="btn btn-primary mt-5">
            Fix that
          </Link>
        </div>
      )}
    </div>
  );
}

function Banner({ text }: { text: string }) {
  return (
    <p
      role="status"
      className="rounded-xl border border-sage/40 bg-sage-tint px-4 py-3 text-sm font-medium text-sage-deep"
    >
      {text}
    </p>
  );
}

function addressSummary(a: { kind: string; city: string }) {
  const where = a.kind === "work" ? "her office" : a.kind === "home" ? "home" : "the other address";
  return `${where}, ${a.city}`;
}

function greeting(): string {
  const hour = new Date().getUTCHours();
  if (hour < 11) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

function groupByMonth<T extends { nextDate: string }>(items: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = monthLabel(item.nextDate);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()];
}
