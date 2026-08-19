import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listRecipients } from "@/lib/queries";
import { SectionHeading } from "@/components/ui";
import { createOccasionAction } from "../../../actions";
import { DateFields } from "./date-fields";
import type { OccasionKind } from "@/lib/types";

export const metadata = { title: "Add a date — Handled" };

const SUGGESTIONS: { kind: OccasionKind; title: string; hint: string }[] = [
  { kind: "birthday", title: "Her birthday", hint: "The non-negotiable one" },
  { kind: "anniversary", title: "Our anniversary", hint: "The other non-negotiable one" },
  { kind: "valentines", title: "Valentine's Day", hint: "February 14, every year, forever" },
  { kind: "mothers_day", title: "Mother's Day", hint: "Yes, even if it's not your mom" },
  { kind: "christmas", title: "Christmas", hint: "You will still forget it" },
  { kind: "just_because", title: "A random Tuesday", hint: "The highest-ROI gift there is" },
];

export default async function NewDatePage({
  searchParams,
}: {
  searchParams: Promise<{ first?: string; recipient?: string }>;
}) {
  const params = await searchParams;
  const user = await requireUser();
  const recipients = await listRecipients(user.id);

  if (recipients.length === 0) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-3xl">
      <SectionHeading
        title={params.first ? "Now the dates." : "Add a date"}
        subtitle={
          params.first
            ? "Start with her birthday. Then add every other date you've ever been quizzed on. Recurring dates roll forward automatically each year — you enter them once, ever."
            : "Recurring dates roll forward automatically each year."
        }
      />

      <form action={createOccasionAction} className="card space-y-5 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="recipient_id">Who is it for</label>
            <select id="recipient_id" name="recipient_id" className="field" required>
              {recipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.relationship})
                </option>
              ))}
            </select>
          </div>

          <DateFields />
        </div>

        <label className="choice">
          <input type="checkbox" name="recurring" defaultChecked />
          <span className="text-sm">
            <span className="font-semibold">Repeat every year.</span>
            <span className="block text-muted">
              Leave this on for birthdays and anniversaries. Turn it off for one-time things like a
              graduation, a big presentation, or an apology with a specific delivery date.
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button type="submit" className="btn btn-primary btn-lg">
            Save and pick a gift →
          </button>
          <Link href="/dashboard" className="btn btn-ghost">
            Back to dashboard
          </Link>
        </div>
      </form>

      <div className="mt-8">
        <h2 className="smallcaps">
          Dates people forget, ranked by consequence
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTIONS.map((s) => (
            <div key={s.title} className="card p-4">
              <div className="font-semibold">{s.title}</div>
              <div className="mt-0.5 text-sm text-muted">{s.hint}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
