import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  getAddress,
  getMission,
  getOccasion,
  getRecipient,
  listMissionEvents,
} from "@/lib/queries";
import { formatMoney, getProduct, getVendor } from "@/lib/catalog";
import { formatLong, formatTime } from "@/lib/date";
import { StatusPill } from "@/components/ui";
import { ProductImage } from "@/components/product-image";
import { MissionProgress } from "@/components/mission-progress";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { cancelMissionAction, recordFeedbackAction, retryMissionAction } from "../../../actions";

export const metadata = { title: "Gift detail — Handled" };
export const dynamic = "force-dynamic";

export default async function MissionPage({
  params,
}: {
  params: Promise<{ missionId: string }>;
}) {
  const { missionId } = await params;
  const user = await requireUser();

  const mission = await getMission(user.id, missionId);
  if (!mission) notFound();

  const product = getProduct(mission.product_id);
  const vendor = product ? getVendor(product.vendorId) : undefined;
  const [recipient, address, occasion, events] = await Promise.all([
    getRecipient(user.id, mission.recipient_id),
    getAddress(user.id, mission.address_id),
    getOccasion(user.id, mission.occasion_id),
    listMissionEvents(mission.id),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard/gifts" className="text-sm text-muted hover:text-ink">
        ← All scheduled gifts
      </Link>

      <div className="card p-6">
        <div className="flex flex-wrap items-start gap-5">
          {product ? (
            <ProductImage product={product} sizePx={80} />
          ) : (
            <span className="tile tile-forest h-20 w-20 text-4xl">🎁</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{product?.name ?? "Gift"}</h1>
              <StatusPill status={mission.status} />
              {mission.selection_mode === "auto" && <span className="tag text-brass-deep">Auto-Pilot</span>}
            </div>
            <p className="mt-1 text-muted">
              {occasion?.title}
              {/* Skip the redundant "for Dana" when the title already names her. */}
              {recipient && !occasion?.title.includes(recipient.name) ? ` for ${recipient.name}` : ""} ·{" "}
              {vendor?.name}
            </p>
            {mission.failure_reason && (
              <p className="mt-3 rounded-lg border border-claret/40 bg-claret-tint px-3 py-2 text-sm text-claret">
                {mission.failure_reason}
              </p>
            )}
          </div>
        </div>

        <div className="mt-6">
          <MissionProgress status={mission.status} />
        </div>

        <dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
          <Row label="Arrives" value={formatLong(mission.deliver_on)} />
          <Row label="Order goes in" value={formatLong(mission.ship_on)} />
          <Row label="Price" value={formatMoney(mission.price_cents)} />
          <Row
            label="Budget ceiling"
            value={formatMoney(mission.budget_cents)}
          />
          {address && (
            <>
              <Row
                label="Delivering to"
                value={
                  <>
                    {address.nickname || (address.kind === "work" ? "Work" : "Home")}
                    <br />
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                    <br />
                    {address.city}, {address.state} {address.postal_code}
                  </>
                }
              />
              <Row
                label="Delivery window"
                value={`${formatTime(address.window_start)}–${formatTime(address.window_end)}${
                  address.weekdays_only ? " · weekdays only" : ""
                }`}
              />
            </>
          )}
          {mission.vendor_order_ref && (
            <Row label="Vendor order" value={<span className="font-mono">{mission.vendor_order_ref}</span>} />
          )}
          {mission.tracking_url && (
            <Row
              label="Tracking"
              value={
                <a
                  href={mission.tracking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-forest underline decoration-brass/60 underline-offset-4 hover:decoration-brass"
                >
                  Follow the parcel →
                </a>
              }
            />
          )}
        </dl>

        {mission.gift_message && (
          <div className="mt-5 rounded-xl border border-line bg-bone-2 p-4">
            <div className="label mb-1">Card message</div>
            <p className="italic">&ldquo;{mission.gift_message}&rdquo;</p>
          </div>
        )}

        {mission.status === "delivered" && (
          <div className="mt-5 rounded-xl border border-line bg-bone-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Did it land?</div>
                <p className="mt-0.5 text-sm text-muted">
                  {mission.feedback === "hit"
                    ? "Noted — more where that came from."
                    : mission.feedback === "miss"
                      ? "Noted — we will never pick this one for her again."
                      : "One tap teaches Auto-Pilot. A miss is never picked for her again."}
                </p>
              </div>
              <div className="flex gap-2">
                <form action={recordFeedbackAction}>
                  <input type="hidden" name="id" value={mission.id} />
                  <input type="hidden" name="verdict" value="hit" />
                  <button
                    type="submit"
                    className={`btn min-h-9 px-4 py-1.5 text-sm ${
                      mission.feedback === "hit" ? "btn-primary" : "btn-quiet"
                    }`}
                  >
                    She loved it
                  </button>
                </form>
                <form action={recordFeedbackAction}>
                  <input type="hidden" name="id" value={mission.id} />
                  <input type="hidden" name="verdict" value="miss" />
                  <button
                    type="submit"
                    className={`btn min-h-9 px-4 py-1.5 text-sm ${
                      mission.feedback === "miss" ? "btn-primary" : "btn-quiet"
                    }`}
                  >
                    Not quite
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2 border-t border-line pt-5">
          {mission.status === "failed" && (
            <form action={retryMissionAction}>
              <input type="hidden" name="id" value={mission.id} />
              <button type="submit" className="btn btn-primary">
                {/* An existing vendor order means only the payment failed —
                    the retry fixes the money, it doesn't order twice. */}
                {mission.vendor_order_ref
                  ? "Retry the payment"
                  : "Rescue this with a replacement"}
              </button>
            </form>
          )}
          {/* Only a gift that hasn't been ordered can honestly be called
              off — a placed order is already paid for and moving. */}
          {["scheduled", "failed"].includes(mission.status) && (
            <form action={cancelMissionAction}>
              <input type="hidden" name="id" value={mission.id} />
              <ConfirmSubmit
                message="Call this gift off? The date goes back to uncovered."
                className="btn btn-ghost text-muted"
              >
                Cancel this gift
              </ConfirmSubmit>
            </form>
          )}
          {occasion && (
            <Link href={`/dashboard/plan/${occasion.id}`} className="btn btn-quiet">
              Schedule a different gift for this date
            </Link>
          )}
        </div>
      </div>

      <section className="card p-7">
        <h2 className="display-3">Timeline</h2>
        <ol className="relative mt-6 space-y-6">
          {/* Spine sits behind the markers, stopping at the last one */}
          <span
            className="absolute bottom-4 left-[5px] top-2 w-px bg-line-strong"
            aria-hidden="true"
          />
          {events.map((e, i) => (
            <li key={e.id} className="relative flex gap-5 pl-6">
              <span
                className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${
                  i === events.length - 1 ? "bg-forest ring-4 ring-forest/15" : "bg-line-strong"
                }`}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="font-semibold capitalize">{e.status}</div>
                {e.note && <p className="mt-0.5 text-sm text-muted">{e.note}</p>}
                <div className="mt-1 font-mono text-xs text-faint">
                  {e.at.slice(0, 16).replace("T", " ")} UTC
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="text-sm leading-relaxed">{value}</dd>
    </div>
  );
}
