import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAddresses, listMissions, listRecipients } from "@/lib/queries";
import { formatMoney, getProduct, getVendor } from "@/lib/catalog";
import { formatLong, formatShort } from "@/lib/date";
import { EmptyState, SectionHeading, StatusPill } from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { runDispatchAction } from "../../actions";
import type { Address, Mission, Recipient } from "@/lib/types";

/** Prefetched once per page so a list of orders is not a list of queries. */
type Lookup = { recipients: Map<string, Recipient>; addresses: Map<string, Address> };

export const metadata = { title: "Scheduled gifts — Handled" };
export const dynamic = "force-dynamic";

export default async function GiftsPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; q?: string }>;
}) {
  const { who, q } = await searchParams;
  const user = await requireUser();
  const [allMissions, recipients, addresses] = await Promise.all([
    listMissions(user.id),
    listRecipients(user.id),
    listAddresses(user.id),
  ]);
  const lookup: Lookup = {
    recipients: new Map(recipients.map((r) => [r.id, r])),
    addresses: new Map(addresses.map((a) => [a.id, a])),
  };

  // Filters narrow, never 404: an unknown ?who just shows everything.
  const query = (q ?? "").trim().toLowerCase();
  const missions = allMissions.filter((m) => {
    if (who && m.recipient_id !== who) return false;
    if (query) {
      const name = getProduct(m.product_id)?.name ?? "";
      if (!name.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  const active = missions.filter((m) => ["scheduled", "placed", "shipped"].includes(m.status));
  const attention = missions.filter((m) => m.status === "failed");
  const done = missions.filter((m) => ["delivered", "canceled"].includes(m.status));

  const chip = (href: string, label: string, current: boolean) => (
    <Link
      key={href}
      href={href}
      className={`tag transition-colors ${
        current ? "border-forest bg-forest text-white" : "text-muted hover:border-forest hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-8">
      <SectionHeading
        title="Scheduled gifts"
        subtitle="Everything queued, in flight, or already landed."
        action={
          process.env.NODE_ENV !== "production" ? (
            <form action={runDispatchAction}>
              <button type="submit" className="btn btn-ghost">
                Run scheduler now
              </button>
            </form>
          ) : undefined
        }
      />

      {(recipients.length > 1 || allMissions.length > 5 || query !== "" || who) && (
        <div className="flex flex-wrap items-center gap-2">
          {recipients.length > 1 && (
            <>
              {chip(query ? `/dashboard/gifts?q=${encodeURIComponent(q ?? "")}` : "/dashboard/gifts", "Everyone", !who)}
              {recipients.map((r) =>
                chip(
                  `/dashboard/gifts?who=${r.id}${query ? `&q=${encodeURIComponent(q ?? "")}` : ""}`,
                  r.name,
                  who === r.id,
                ),
              )}
            </>
          )}
          <form action="/dashboard/gifts" method="get" className="ml-auto flex items-center gap-2">
            {who && <input type="hidden" name="who" value={who} />}
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search gifts…"
              className="field min-h-9 w-44 px-3 py-1.5 text-sm"
              aria-label="Search gifts by name"
            />
          </form>
        </div>
      )}

      {missions.length === 0 ? (
        <EmptyState
          emoji="📦"
          title={allMissions.length === 0 ? "Nothing scheduled." : "Nothing matches."}
          body={
            allMissions.length === 0
              ? "Add a date and put a gift behind it. That's the whole product."
              : "No gifts match that filter. Clear it and they all come back."
          }
          action={
            allMissions.length === 0 ? (
              <Link href="/dashboard/dates/new" className="btn btn-primary">
                Add a date
              </Link>
            ) : (
              <Link href="/dashboard/gifts" className="btn btn-quiet">
                Clear the filter
              </Link>
            )
          }
        />
      ) : (
        <>
          {attention.length > 0 && (
            <Group title="Needs your attention" missions={attention} lookup={lookup} />
          )}
          <Group title="In flight" missions={active} lookup={lookup} />
          {done.length > 0 && <Group title="History" missions={done} lookup={lookup} />}
        </>
      )}
    </div>
  );
}

function Group({
  title,
  missions,
  lookup,
}: {
  title: string;
  missions: Mission[];
  lookup: Lookup;
}) {
  if (missions.length === 0) return null;

  return (
    <section>
      <h2 className="smallcaps mb-3">{title}</h2>
      <div className="space-y-3">
        {missions.map((m) => {
          const product = getProduct(m.product_id);
          const vendor = product ? getVendor(product.vendorId) : undefined;
          const recipient = lookup.recipients.get(m.recipient_id);
          const address = lookup.addresses.get(m.address_id);

          return (
            <Link
              key={m.id}
              href={`/dashboard/gifts/${m.id}`}
              className="card card-lift flex flex-wrap items-center gap-4 p-5 hover:border-forest/50"
            >
              {product ? (
                <ProductImage product={product} sizePx={48} />
              ) : (
                <span className="tile tile-brass h-12 w-12 text-2xl">🎁</span>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold">{product?.name ?? "Gift"}</div>
                <div className="text-sm text-muted">
                  For {recipient?.name ?? "someone"} · {vendor?.name ?? "vendor"} →{" "}
                  {address ? `${address.kind} in ${address.city}` : "address removed"}
                </div>
                {m.failure_reason && (
                  <div className="mt-1 text-sm text-claret">{m.failure_reason}</div>
                )}
              </div>
              <div className="text-right text-sm">
                <div className="font-semibold">{formatLong(m.deliver_on)}</div>
                <div className="font-mono text-xs text-muted">
                  ships {formatShort(m.ship_on)} · {formatMoney(m.price_cents)}
                </div>
              </div>
              <StatusPill status={m.status} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
