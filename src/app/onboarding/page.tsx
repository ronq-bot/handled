import Link from "next/link";
import { Logo } from "@/components/logo";
import { requireUser } from "@/lib/auth";
import { listRecipients } from "@/lib/queries";
import { completeOnboardingAction } from "./actions";

export const metadata = { title: "Set up — Handled" };

export default async function OnboardingPage() {
  const user = await requireUser();
  const existing = await listRecipients(user.id);

  return (
    <div className="bloom relative min-h-screen">
      <div className="container-x relative flex h-16 items-center justify-between">
        <Logo href="/dashboard" />
        {existing.length > 0 && (
          <Link href="/dashboard" className="btn btn-ghost min-h-9 px-3 py-1.5 text-sm">
            Skip to dashboard
          </Link>
        )}
      </div>

      <div className="container-x relative max-w-3xl pb-20 pt-6">
        <span className="tag border-forest/40 text-forest">Step 1 of 2</span>
        <h1 className="display-2 mt-5">Who are we keeping happy?</h1>
        <p className="mt-3 max-w-xl leading-relaxed text-muted">
          The more you tell us, the better Auto-Pilot gets. Every field except her name and one
          address is optional — you can fill the rest in later from a parking lot.
        </p>

        <form action={completeOnboardingAction} className="mt-10 space-y-6">
          <section className="card p-6">
            <h2 className="display-3 text-xl">Her</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="name">Name</label>
                <input id="name" name="name" className="field" placeholder="Dana" required />
              </div>
              <div>
                <label className="label" htmlFor="relationship">Relationship</label>
                <select id="relationship" name="relationship" className="field" defaultValue="wife">
                  <option value="wife">Wife</option>
                  <option value="girlfriend">Girlfriend</option>
                  <option value="fiancee">Fiancée</option>
                  <option value="partner">Partner</option>
                  <option value="mom">Mom</option>
                  <option value="other">Someone else important</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="likes">Things she loves</label>
                <input
                  id="likes"
                  name="likes"
                  className="field"
                  placeholder="peonies, dark chocolate, spa days, date night"
                />
                <p className="mt-1.5 text-xs text-muted">Comma separated. Auto-Pilot reads this.</p>
              </div>
              <div>
                <label className="label" htmlFor="dislikes">Hard no&apos;s</label>
                <input id="dislikes" name="dislikes" className="field" placeholder="lilies, teddy bears" />
              </div>
              <div>
                <label className="label" htmlFor="allergies">Allergies</label>
                <input id="allergies" name="allergies" className="field" placeholder="nuts, dairy" />
                <p className="mt-1.5 text-xs text-muted">We hard-block anything containing these.</p>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="display-3 text-xl">Home address</h2>
              <span className="smallcaps">Required</span>
            </div>
            <AddressFields prefix="home" defaultStart="16:00" defaultEnd="20:00" required />
          </section>

          <section className="card p-6">
            <div className="flex items-baseline justify-between">
              <h2 className="display-3 text-xl">Work address</h2>
              <span className="smallcaps">Optional</span>
            </div>
            <p className="mt-2 text-sm text-muted">
              Worth adding. A bouquet at her desk on a Tuesday does considerably more work than the
              same bouquet on the kitchen counter.
            </p>
            <AddressFields prefix="work" defaultStart="09:00" defaultEnd="17:00" />
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn btn-primary btn-lg">
              Next: add the dates →
            </button>
            <span className="text-sm text-muted">You can add more people later.</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function AddressFields({
  prefix,
  defaultStart,
  defaultEnd,
  required = false,
}: {
  prefix: string;
  defaultStart: string;
  defaultEnd: string;
  required?: boolean;
}) {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-6">
      <div className="sm:col-span-4">
        <label className="label" htmlFor={`${prefix}_line1`}>Street address</label>
        <input
          id={`${prefix}_line1`}
          name={`${prefix}_line1`}
          className="field"
          placeholder="412 Rosewood Ln"
          required={required}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${prefix}_line2`}>Apt / Suite</label>
        <input id={`${prefix}_line2`} name={`${prefix}_line2`} className="field" placeholder="Suite 700" />
      </div>
      <div className="sm:col-span-3">
        <label className="label" htmlFor={`${prefix}_city`}>City</label>
        <input
          id={`${prefix}_city`}
          name={`${prefix}_city`}
          className="field"
          placeholder="Charlotte"
          required={required}
        />
      </div>
      <div className="sm:col-span-1">
        <label className="label" htmlFor={`${prefix}_state`}>State</label>
        <input
          id={`${prefix}_state`}
          name={`${prefix}_state`}
          className="field"
          placeholder="NC"
          maxLength={2}
          required={required}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${prefix}_postal_code`}>ZIP</label>
        <input
          id={`${prefix}_postal_code`}
          name={`${prefix}_postal_code`}
          className="field"
          placeholder="28202"
          inputMode="numeric"
          pattern="\d{5}(-\d{4})?"
          required={required}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${prefix}_window_start`}>She&apos;s there from</label>
        <input
          id={`${prefix}_window_start`}
          name={`${prefix}_window_start`}
          type="time"
          className="field"
          defaultValue={defaultStart}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${prefix}_window_end`}>Until</label>
        <input
          id={`${prefix}_window_end`}
          name={`${prefix}_window_end`}
          type="time"
          className="field"
          defaultValue={defaultEnd}
        />
      </div>
      <div className="sm:col-span-6">
        <label className="label" htmlFor={`${prefix}_notes`}>Delivery notes</label>
        <input
          id={`${prefix}_notes`}
          name={`${prefix}_notes`}
          className="field"
          placeholder="Front desk will sign for it. Ask for the 7th floor."
        />
      </div>
    </div>
  );
}
