import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { upcomingOccasions } from "@/lib/queries";
import { OCCASION_LABELS } from "@/lib/catalog";
import { countdown, formatLong } from "@/lib/date";
import { EmptyState, SectionHeading } from "@/components/ui";
import { deleteOccasionAction } from "../../actions";

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
          <Link href="/dashboard/dates/new" className="btn btn-primary">
            Add a date
          </Link>
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
          {occasions.map((occ) => (
            <div key={occ.id} className="card flex flex-wrap items-center gap-4 p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg font-bold">{occ.title}</h3>
                  <span className="tag">{OCCASION_LABELS[occ.kind]}</span>
                  {occ.recurring === 1 && <span className="tag">Yearly</span>}
                  {occ.missions.length === 0 ? (
                    <span className="tag border-claret/40 bg-claret-tint text-claret">Unprotected</span>
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
                <Link href={`/dashboard/plan/${occ.id}`} className="btn btn-quiet px-3 py-2 text-sm">
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
          ))}
        </div>
      )}
    </div>
  );
}
