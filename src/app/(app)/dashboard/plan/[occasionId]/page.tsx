import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getOccasion, getRecipient, listAddresses, recentProductIds } from "@/lib/queries";
import { rankGifts } from "@/lib/picker";
import { planDelivery } from "@/lib/scheduling";
import { formatMoney, getVendor, OCCASION_LABELS, CATEGORY_LABELS } from "@/lib/catalog";
import { countdown, formatLong, formatShort, nextAnniversary, today } from "@/lib/date";
import { scheduleMissionAction } from "../../../actions";
import { PlannerControls } from "./planner-controls";
import { ProductImage } from "@/components/product-image";

export const metadata = { title: "Schedule a gift — Handled" };
export const dynamic = "force-dynamic";

export default async function PlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ occasionId: string }>;
  searchParams: Promise<{ address?: string; budget?: string; mode?: string }>;
}) {
  const { occasionId } = await params;
  const query = await searchParams;
  const user = await requireUser();

  const occasion = await getOccasion(user.id, occasionId);
  if (!occasion) notFound();

  const recipient = await getRecipient(user.id, occasion.recipient_id);
  if (!recipient) notFound();

  const addresses = await listAddresses(user.id, recipient.id);
  if (addresses.length === 0) redirect(`/dashboard/people?needAddress=${recipient.id}`);

  const address = addresses.find((a) => a.id === query.address) ?? addresses[0];
  const budget = clampBudget(Number(query.budget) || 120);
  const mode = query.mode === "manual" ? "manual" : "auto";

  const eventDate = occasion.recurring
    ? nextAnniversary(occasion.event_date, today())
    : occasion.event_date;

  const ranked = rankGifts({
    recipient,
    address,
    occasionKind: occasion.kind,
    budgetCents: budget * 100,
    recentProductIds: await recentProductIds(user.id, recipient.id),
  });

  const withPlans = ranked.map((r) => ({
    ...r,
    plan: planDelivery(eventDate, r.product, address),
  }));
  const deliverable = withPlans.filter((r) => !r.plan.tooLate);
  const missed = withPlans.filter((r) => r.plan.tooLate);
  const top = deliverable[0];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
          ← Back to the overview
        </Link>
        <h1 className="display-2 mt-3">{occasion.title}</h1>
        <p className="mt-2 text-muted">
          {OCCASION_LABELS[occasion.kind]} for {recipient.name} · {formatLong(eventDate)} ·{" "}
          <span className="text-forest">{countdown(eventDate)}</span>
        </p>
      </div>

      <PlannerControls addresses={addresses} addressId={address.id} budget={budget} mode={mode} />

      {top?.plan.shifted && (
        <div className="card border-brass/40 bg-brass-tint p-4 text-sm">
          <span className="font-semibold text-brass-deep">Heads up: </span>
          <span className="text-muted">{top.plan.shiftReason}</span>
        </div>
      )}

      <form action={scheduleMissionAction} className="space-y-6">
        <input type="hidden" name="occasion_id" value={occasion.id} />
        <input type="hidden" name="address_id" value={address.id} />
        <input type="hidden" name="budget" value={budget} />
        <input type="hidden" name="selection_mode" value={mode} />

        {mode === "auto" ? (
          top ? (
            <section className="card border-forest/50 p-7">
              <div className="flex items-center gap-2">
                <span className="tag border-forest/40 bg-forest-tint text-forest">
                  Auto-Pilot&apos;s choice
                </span>
                <span className="text-xs text-muted">
                  Re-evaluated the day it ships, so it&apos;s never stale.
                </span>
              </div>

              <div className="mt-5 flex flex-wrap items-start gap-5">
                <ProductImage product={top.product} sizePx={80} />
                <div className="min-w-0 flex-1">
                  <h2 className="display-3">{top.product.name}</h2>
                  <p className="mt-2 text-muted">{top.product.blurb}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="tag">{getVendor(top.product.vendorId)?.name}</span>
                    <span className="tag">{formatMoney(top.product.priceCents)}</span>
                    <span className="tag">Ships {formatShort(top.plan.shipOn)}</span>
                    <span className="tag">Arrives {formatShort(top.plan.deliverOn)}</span>
                  </div>
                  <ul className="mt-4 space-y-1 text-sm text-muted">
                    {top.reasons.map((r) => (
                      <li key={r} className="flex gap-2">
                        <span className="text-sage-deep">✓</span>
                        {r}
                      </li>
                    ))}
                    {top.warnings.map((w) => (
                      <li key={w} className="flex gap-2">
                        <span className="text-brass-deep">!</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p className="mt-5 border-t border-line pt-4 text-sm text-muted">
                Next in line if this one is unavailable:{" "}
                {deliverable
                  .slice(1, 4)
                  .map((r) => r.product.name)
                  .join(", ") || "nothing else fits this budget"}
                .
              </p>
            </section>
          ) : (
            <section className="card border-claret/40 bg-claret-tint p-6">
              <h2 className="text-xl font-bold text-claret">Nothing fits.</h2>
              <p className="mt-2 text-muted">
                Every option is either over your ${budget} ceiling, blocked by an allergy or a hard
                no, or can&apos;t physically make {formatShort(eventDate)}. Raise the budget or move
                to a home address.
              </p>
            </section>
          )
        ) : (
          <section>
            <h2 className="text-xl font-bold">
              {deliverable.length} gift{deliverable.length === 1 ? "" : "s"} that can make this date
            </h2>
            <p className="mt-1 text-sm text-muted">
              Within your ${budget} ceiling, safe for {address.kind === "work" ? "an office" : "a home"}{" "}
              delivery, and clear of anything {recipient.name} is allergic to or has vetoed.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {deliverable.map((r, i) => (
                <label key={r.product.id} className="group cursor-pointer">
                  <input
                    type="radio"
                    name="product_id"
                    value={r.product.id}
                    defaultChecked={i === 0}
                    required
                    className="peer sr-only"
                  />
                  <div className="card card-lift h-full p-5 peer-checked:border-forest peer-checked:ring-2 peer-checked:ring-forest/25 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest">
                    <div className="flex items-start justify-between gap-3">
                      <ProductImage product={r.product} sizePx={56} />
                      <span className="rounded-full bg-forest px-3 py-1 text-sm font-bold text-on-forest">
                        {formatMoney(r.product.priceCents)}
                      </span>
                    </div>
                    {i === 0 && (
                      <span className="tag mt-3 border-forest/40 bg-forest-tint text-forest">
                        Best match
                      </span>
                    )}
                    <h3 className="mt-3 font-bold leading-tight">{r.product.name}</h3>
                    <p className="mt-1.5 text-sm text-muted">{r.product.blurb}</p>
                    <div className="mt-3 space-y-0.5 text-xs text-faint">
                      <div>{CATEGORY_LABELS[r.product.category]} · {getVendor(r.product.vendorId)?.name}</div>
                      <div className="font-mono">
                        ships {formatShort(r.plan.shipOn)} → arrives {formatShort(r.plan.deliverOn)}
                      </div>
                    </div>
                    {r.warnings.length > 0 && (
                      <p className="mt-3 text-xs text-brass-deep">! {r.warnings[0]}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>

            {missed.length > 0 && (
              <details className="mt-6">
                <summary className="cursor-pointer text-sm text-muted hover:text-ink">
                  {missed.length} more that can&apos;t make it in time
                </summary>
                <ul className="mt-3 space-y-1.5 text-sm text-muted">
                  {missed.map((r) => (
                    <li key={r.product.id}>
                      <span className="text-ink">{r.product.name}</span> — {r.plan.lateReason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        )}

        <section className="card p-6">
          <label className="label" htmlFor="gift_message">
            Card message
          </label>
          <textarea
            id="gift_message"
            name="gift_message"
            rows={3}
            maxLength={250}
            className="field resize-y"
            placeholder="Happy birthday. Yes, I remembered. — M"
          />
          <p className="mt-2 text-xs text-muted">
            250 characters. Write it now, while you have thoughts. Leave it blank and we&apos;ll use
            something tasteful and generic, which she will notice.
          </p>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            disabled={mode === "auto" && !top}
          >
            Lock it in →
          </button>
          <span className="text-sm text-muted">
            Nothing is charged until the order goes in on {top ? formatShort(top.plan.shipOn) : "the ship date"}.
          </span>
        </div>
      </form>
    </div>
  );
}

function clampBudget(n: number): number {
  return Math.min(1000, Math.max(25, Math.round(n)));
}
