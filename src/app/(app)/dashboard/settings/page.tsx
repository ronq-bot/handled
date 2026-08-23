import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { SectionHeading } from "@/components/ui";
import { integrationStatus } from "@/lib/env";
import { paymentsAreLive } from "@/lib/payments";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  deleteAccountAction,
  removeCardAction,
  seedDemoAction,
  updateSettingsAction,
} from "../../actions";

export const metadata = { title: "Account — Handled" };
export const dynamic = "force-dynamic";

const CARD_MESSAGES: Record<string, { tone: "good" | "bad"; text: string }> = {
  saved: { tone: "good", text: "Card saved. Orders will be charged as each gift ships." },
  cancelled: { tone: "bad", text: "Card setup was cancelled. Nothing has changed." },
  unconfigured: {
    tone: "bad",
    text: "Stripe isn't configured on this deployment, so there's nothing to connect to yet.",
  },
  error: { tone: "bad", text: "Stripe couldn't complete the setup." },
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; detail?: string; account?: string }>;
}) {
  const { card, detail, account } = await searchParams;
  const user = await requireUser();
  const integrations = integrationStatus();
  const stripeLive = paymentsAreLive();
  const hasCard = Boolean(user.stripe_payment_method_id);
  const notice = card ? CARD_MESSAGES[card] : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-14">
      <SectionHeading title="Account" subtitle="A short list, on purpose." />

      {notice && (
        <p
          role="status"
          className={`card p-5 text-[0.9375rem] ${
            notice.tone === "good"
              ? "border-sage/40 bg-sage-tint text-sage-deep"
              : "border-claret/40 bg-claret-tint text-claret"
          }`}
        >
          {notice.text}
          {detail && <span className="mt-1 block text-[0.8125rem] opacity-80">{detail}</span>}
        </p>
      )}

      {/* ── Payment ──────────────────────────────────────────── */}
      <section>
        <h2 className="smallcaps">Payment</h2>
        <div className="card mt-5 p-8">
          {stripeLive ? (
            hasCard ? (
              <>
                <p className="serif text-[1.35rem] text-ink">A card is on file.</p>
                <p className="mt-3 text-muted">
                  Charged only when a gift actually ships — never in advance, never for a date you
                  cancel in time.
                </p>
                <p className="mt-4 font-mono text-[0.8125rem] text-faint">
                  Stripe payment method {user.stripe_payment_method_id.slice(0, 12)}…
                </p>
                <form action={removeCardAction} className="mt-7">
                  <button type="submit" className="btn btn-ghost">
                    Remove card
                  </button>
                </form>
              </>
            ) : (
              <>
                <p className="serif text-[1.35rem] text-ink">No card yet.</p>
                <p className="mt-3 max-w-xl text-muted">
                  Everything can be planned without one. Nothing can ship without one — which is the
                  single most common way a man ends up with a full calendar and an empty doorstep.
                </p>
                <Link href="/api/stripe/setup" prefetch={false} className="btn btn-primary mt-7">
                  Add a card
                </Link>
                <p className="mt-4 text-[0.8125rem] text-faint">
                  Handled by Stripe. No card details touch this application.
                </p>
              </>
            )
          ) : (
            <>
              <p className="serif text-[1.35rem] text-ink">Stripe isn&apos;t connected.</p>
              <p className="mt-3 max-w-xl text-muted">
                Until it is, the switch below stands in for a card so you can exercise the whole
                flow. The scheduler still refuses to ship without it, exactly as production would.
              </p>
              <form action={updateSettingsAction} className="mt-7 space-y-5">
                <input type="hidden" name="name" value={user.name} />
                <input
                  type="hidden"
                  name="auto_pilot"
                  value={user.auto_pilot === 1 ? "on" : ""}
                />
                <label className="choice">
                  <input
                    type="checkbox"
                    name="payment_ok"
                    defaultChecked={user.payment_ok === 1}
                  />
                  <span>
                    <span className="font-semibold">Pretend a card is on file</span>
                    <span className="mt-1 block text-[0.9375rem] text-muted">
                      Stands in for the Stripe setup flow in this build.
                    </span>
                  </span>
                </label>
                <button type="submit" className="btn btn-quiet">
                  Save
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      {/* ── Preferences ──────────────────────────────────────── */}
      <section>
        <h2 className="smallcaps">Preferences</h2>
        <form action={updateSettingsAction} className="card mt-5 space-y-7 p-8">
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input id="name" name="name" className="field" defaultValue={user.name} />
          </div>

          <div>
            <span className="label">Email</span>
            <p className="text-muted">{user.email}</p>
          </div>

          <div>
            <label className="label" htmlFor="default_budget">
              Default gift budget
            </label>
            <select
              id="default_budget"
              name="default_budget"
              className="field"
              defaultValue={String(user.default_budget_cents)}
            >
              <option value="5000">$50</option>
              <option value="8000">$80</option>
              <option value="12000">$120</option>
              <option value="20000">$200</option>
              <option value="35000">$350</option>
            </select>
            <p className="mt-1.5 text-[0.8125rem] text-faint">
              Where the planner and &ldquo;Cover everything&rdquo; start. Adjustable per gift.
            </p>
          </div>

          <label className="choice">
            <input type="checkbox" name="auto_pilot" defaultChecked={user.auto_pilot === 1} />
            <span>
              <span className="font-semibold">Choose gifts on my behalf by default</span>
              <span className="mt-1 block text-[0.9375rem] text-muted">
                You can still override any single date.
              </span>
            </span>
          </label>

          {/* Preserve the payment flag when Stripe is live and owns it */}
          {stripeLive && hasCard && <input type="hidden" name="payment_ok" value="on" />}

          <button type="submit" className="btn btn-primary">
            Save preferences
          </button>
        </form>
      </section>

      {/* ── Integrations ─────────────────────────────────────── */}
      <section>
        <h2 className="smallcaps">Connected services</h2>
        <p className="mt-3 max-w-2xl text-muted">
          Each of these turns real the moment its key is present. Until then the app falls back to a
          local stand-in, so every screen and rule still works.
        </p>

        <div className="mt-7 border-t border-line">
          {integrations.map((i) => (
            <div
              key={i.key}
              className="grid gap-x-8 gap-y-2 border-b border-line py-6 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline"
            >
              <p className="serif text-[1.2rem] text-ink">{i.name}</p>

              <div>
                <p className="text-[0.9375rem] leading-relaxed text-muted">{i.behaviour}</p>
                {!i.live && (
                  <p className="mt-1.5 text-[0.8125rem] text-faint">
                    Add <code className="font-mono">{i.needs}</code> — {i.where}
                  </p>
                )}
              </div>

              <span
                className={`tag whitespace-nowrap ${
                  i.live ? "border-sage/50 text-sage-deep" : "border-line-strong text-faint"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${i.live ? "bg-sage" : "bg-faint"}`}
                  aria-hidden="true"
                />
                {i.live ? "Live" : "Stand-in"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Your data ────────────────────────────────────────── */}
      <section>
        <h2 className="smallcaps">Your data</h2>
        <div className="card mt-5 p-8">
          <p className="serif text-[1.35rem] text-ink">Take a copy of everything.</p>
          <p className="mt-3 max-w-xl text-muted">
            One JSON file: the people, addresses, dates, orders, and history. Passwords and payment
            identifiers are never included.
          </p>
          <a href="/api/export" className="btn btn-quiet mt-6">
            Download my data
          </a>
        </div>
      </section>

      {/* ── Leaving ──────────────────────────────────────────── */}
      <section>
        <h2 className="smallcaps">Leaving</h2>
        <div className="card mt-5 border-claret/30 p-8">
          {account === "inflight" && (
            <p
              role="status"
              className="mb-5 rounded-lg border border-brass/40 bg-brass-tint px-3 py-2 text-sm text-brass-deep"
            >
              An order is already placed and moving — it will arrive whether or not the account
              exists. Once it lands, deletion works.
            </p>
          )}
          <p className="serif text-[1.35rem] text-ink">Delete this account.</p>
          <p className="mt-3 max-w-xl text-muted">
            Everything goes: the people, the addresses, the dates, the history. There is no
            archive and no undo. Gifts already placed still arrive — they were paid for.
          </p>
          <form action={deleteAccountAction} className="mt-7">
            <ConfirmSubmit
              message="Delete the account and everything in it? There is no undo."
              className="btn btn-ghost text-claret"
            >
              Delete my account
            </ConfirmSubmit>
          </form>
        </div>
      </section>

      {/* ── Demo ─────────────────────────────────────────────── */}
      <section>
        <h2 className="smallcaps">Sample account</h2>
        <div className="card mt-5 p-8">
          <p className="serif text-[1.35rem] text-ink">Load a year of demo data</p>
          <p className="mt-3 max-w-xl text-muted">
            Creates Dana, a home and a work address, an August 20 birthday and a September 25
            anniversary — with a bouquet going to her office and fruit going home. It runs the same
            code paths you would.
          </p>
          <form action={seedDemoAction} className="mt-7">
            <button type="submit" className="btn btn-quiet">
              Load demo data
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
