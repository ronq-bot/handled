import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { upcomingOccasions } from "@/lib/queries";
import { OCCASION_LABELS } from "@/lib/catalog";
import { countdown, formatLong } from "@/lib/date";
import { EmptyState, SectionHeading } from "@/components/ui";
import { deleteOccasionAction, updateOccasionAction } from "../../actions";

export const metadata = { title: "Dates — Handled" };
export const dynamic = "force-dynamic";

export default async function DatesPage() {
  const user = await requireUser();
  const occasions = await upcomingOccasions(user.id, 400);

  return (
    <div>
      <SectionHeading
        title="Every date on file"
        subtitle="The full list, sorted by how soon it can hurt you."
        action={
          <div className="flex flex-wrap gap-2">
            {occasions.length > 0 && (
              <a
                href="/api/calendar"
                className="btn btn-quiet"
                title="Adds every date here to Apple, Google or Outlook calendars."
              >
                Calendar file (.ics)
              </a>
            )}
            <Link href="/dashboard/dates/new" className="btn btn-primary">
              Add a date
            </Link>
          </div>
        }
      />

      {occasions.length === 0 ? (
        <EmptyState
          emoji="🗓️"
          title="Nothing here yet."
          body="An empty calendar is not the same thing as a clear one."
          action={
            <Link href="/dashboard/dates/new" className="btn btn-primary">
              Add the first date
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {occasions.map((occ) => {
            const locked = occ.missions.length > 0;
            return (
              <div key={occ.id} className="card p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">{occ.title}</h3>
                      <span className="tag">{OCCASION_LABELS[occ.kind]}</span>
                      {occ.recurring === 1 && <span className="tag">Yearly</span>}
                      {occ.missions.length === 0 ? (
                        <span className="tag border-claret/40 bg-claret-tint text-claret">
                          Unprotected
                        </span>
                      ) : (
                        <span className="tag border-sage/40 bg-sage-tint text-sage-deep">
                          {occ.missions.length} gift{occ.missions.length === 1 ? "" : "s"} scheduled
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {occ.recipientName} · {formatLong(occ.nextDate)} ·{" "}
                      <span className="text-forest">{countdown(occ.nextDate)}</span>
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/dashboard/plan/${occ.id}`}
                      className="btn btn-quiet px-3 py-2 text-sm"
                    >
                      {occ.missions.length ? "Add gift" : "Schedule gift"}
                    </Link>
                    <form action={deleteOccasionAction}>
                      <input type="hidden" name="id" value={occ.id} />
                      <button type="submit" className="btn btn-ghost px-3 py-2 text-sm text-muted">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>

                <details className="mt-3">
                  <summary className="inline-block cursor-pointer py-1 text-sm text-muted hover:text-ink">
                    Edit this date
                  </summary>
                  <form
                    action={updateOccasionAction}
                    className="mt-3 grid gap-4 border-t border-line pt-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end"
                  >
                    <input type="hidden" name="id" value={occ.id} />
                    <div>
                      <label className="label" htmlFor={`${occ.id}-title`}>
                        Name
                      </label>
                      <input
                        id={`${occ.id}-title`}
                        name="title"
                        className="field"
                        defaultValue={occ.title}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`${occ.id}-date`}>
                        Date
                      </label>
                      <input
                        id={`${occ.id}-date`}
                        name="event_date"
                        type="date"
                        className="field disabled:opacity-50"
                        defaultValue={occ.event_date}
                        disabled={locked}
                      />
                    </div>
                    <button type="submit" className="btn btn-quiet">
                      Save
                    </button>
                    {locked && (
                      <p className="text-xs text-faint sm:col-span-3">
                        The date is locked while a gift is scheduled against it — the delivery was
                        planned around it. Cancel the gift first to move the date.
                      </p>
                    )}
                  </form>
                </details>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
