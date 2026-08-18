import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listRecipients } from "@/lib/queries";
import { SectionHeading } from "@/components/ui";
import { addDays, formatLong, today } from "@/lib/date";
import { sendNowAction } from "../../actions";

export const metadata = { title: "Send a gift now — Handled" };
export const dynamic = "force-dynamic";

/**
 * The impulse path. Everything else in the product schedules against a date
 * that matters; this one manufactures the date — a one-off "just because",
 * four days out, which is the soonest most of the catalogue can honestly
 * arrive — and goes straight to picking the gift.
 */
export default async function SendNowPage() {
  const user = await requireUser();
  const recipients = await listRecipients(user.id);
  if (recipients.length === 0) redirect("/onboarding");

  const arrives = addDays(today(), 4);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
        ← Back to the overview
      </Link>

      <div className="mt-3">
        <SectionHeading
          title="Send a gift now"
          subtitle={`No occasion required — "just because" outperforms every date on the calendar. It would arrive ${formatLong(arrives)}.`}
        />
      </div>

      <form action={sendNowAction} className="card space-y-5 p-6">
        <fieldset>
          <legend className="label">Who is this for?</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {recipients.map((r, i) => (
              <label key={r.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="recipient_id"
                  value={r.id}
                  defaultChecked={i === 0}
                  required
                  className="peer sr-only"
                />
                <div className="card card-lift p-4 peer-checked:border-forest peer-checked:ring-2 peer-checked:ring-forest/25 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-forest">
                  <div className="font-semibold">{r.name}</div>
                  <div className="mt-0.5 text-sm capitalize text-muted">{r.relationship}</div>
                </div>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button type="submit" className="btn btn-primary btn-lg">
            Choose the gift →
          </button>
          <span className="text-sm text-muted">
            Nothing is charged until the order actually goes in.
          </span>
        </div>
      </form>
    </div>
  );
}
