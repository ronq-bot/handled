import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAddresses, listRecipients } from "@/lib/queries";
import { ADDRESS_KIND_LABELS } from "@/lib/catalog";
import { formatTime } from "@/lib/date";
import { SectionHeading } from "@/components/ui";
import {
  createAddressAction,
  createRecipientAction,
  deleteAddressAction,
  updateRecipientAction,
} from "../../actions";
import type { AddressKind } from "@/lib/types";

export const metadata = { title: "People & addresses — Handled" };
export const dynamic = "force-dynamic";

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ needAddress?: string }>;
}) {
  const { needAddress } = await searchParams;
  const user = await requireUser();
  const [recipients, allAddresses] = await Promise.all([
    listRecipients(user.id),
    listAddresses(user.id),
  ]);
  const addressesFor = (recipientId: string) =>
    allAddresses.filter((a) => a.recipient_id === recipientId);

  return (
    <div className="space-y-8">
      <SectionHeading
        title="People & addresses"
        subtitle="Who you're covering, what they like, and where to find them during the day."
      />

      {needAddress && (
        <div className="card border-brass/40 bg-brass-tint p-4 text-sm text-muted">
          <span className="font-semibold text-brass-deep">Add an address first. </span>
          We can&apos;t schedule a gift for someone we can&apos;t deliver to.
        </div>
      )}

      {recipients.map((r) => {
        const addresses = addressesFor(r.id);
        return (
          <section key={r.id} className="card p-7">
            <details open={addresses.length === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold">
                    {r.name}{" "}
                    <span className="text-base font-normal text-muted">({r.relationship})</span>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {addresses.length} address{addresses.length === 1 ? "" : "es"}
                    {r.allergies ? ` · allergic to ${r.allergies}` : ""}
                  </p>
                </div>
                <span className="text-sm text-muted">Edit</span>
              </summary>

              <form action={updateRecipientAction} className="mt-5 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="id" value={r.id} />
                <div>
                  <label className="label" htmlFor={`${r.id}-name`}>Name</label>
                  <input id={`${r.id}-name`} name="name" className="field" defaultValue={r.name} />
                </div>
                <div>
                  <label className="label" htmlFor={`${r.id}-rel`}>Relationship</label>
                  <input
                    id={`${r.id}-rel`}
                    name="relationship"
                    className="field"
                    defaultValue={r.relationship}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`${r.id}-likes`}>Loves</label>
                  <input id={`${r.id}-likes`} name="likes" className="field" defaultValue={r.likes} />
                </div>
                <div>
                  <label className="label" htmlFor={`${r.id}-dislikes`}>Hard no&apos;s</label>
                  <input
                    id={`${r.id}-dislikes`}
                    name="dislikes"
                    className="field"
                    defaultValue={r.dislikes}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`${r.id}-allergies`}>Allergies</label>
                  <input
                    id={`${r.id}-allergies`}
                    name="allergies"
                    className="field"
                    defaultValue={r.allergies}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`${r.id}-notes`}>Notes</label>
                  <input id={`${r.id}-notes`} name="notes" className="field" defaultValue={r.notes} />
                </div>
                <div className="sm:col-span-2">
                  <button type="submit" className="btn btn-quiet">
                    Save changes
                  </button>
                </div>
              </form>
            </details>

            <div className="mt-6 border-t border-line pt-5">
              <h3 className="smallcaps">Addresses</h3>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <div key={a.id} className="rounded-xl border border-line bg-bone-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          {(() => {
                            const kind = ADDRESS_KIND_LABELS[a.kind as AddressKind] ?? a.kind;
                            // Onboarding defaults the nickname to the kind — don't print "Home · Home".
                            return a.nickname && a.nickname.toLowerCase() !== kind.toLowerCase()
                              ? `${kind} · ${a.nickname}`
                              : kind;
                          })()}
                        </div>
                        <div className="mt-1 text-sm text-muted">
                          {a.line1}
                          {a.line2 ? `, ${a.line2}` : ""}
                          <br />
                          {a.city}, {a.state} {a.postal_code}
                        </div>
                        <div className="mt-2 font-mono text-xs text-faint">
                          {formatTime(a.window_start)}–{formatTime(a.window_end)}
                          {a.weekdays_only ? " · weekdays" : ""}
                        </div>
                        {a.delivery_notes && (
                          <div className="mt-2 text-xs text-faint">{a.delivery_notes}</div>
                        )}
                      </div>
                      <form action={deleteAddressAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <button
                          type="submit"
                          /* negative margin keeps the layout while growing the hit area */
                          className="-m-2 p-2 text-xs text-muted hover:text-claret"
                          title="Addresses used by a scheduled gift can't be removed"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>

              <details className="mt-4">
                <summary className="inline-block cursor-pointer py-2 text-sm font-semibold text-forest">
                  + Add another address
                </summary>
                <form action={createAddressAction} className="mt-4 grid gap-4 sm:grid-cols-6">
                  <input type="hidden" name="recipient_id" value={r.id} />
                  <input type="hidden" name="next" value="/dashboard/people" />

                  <div className="sm:col-span-2">
                    <label className="label" htmlFor={`${r.id}-kind`}>Type</label>
                    <select id={`${r.id}-kind`} name="kind" className="field" defaultValue="work">
                      <option value="home">Home</option>
                      <option value="work">Work</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="sm:col-span-4">
                    <label className="label" htmlFor={`${r.id}-nickname`}>Nickname</label>
                    <input
                      id={`${r.id}-nickname`}
                      name="nickname"
                      className="field"
                      placeholder="Her office"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="label" htmlFor={`${r.id}-line1`}>Street</label>
                    <input id={`${r.id}-line1`} name="line1" className="field" required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor={`${r.id}-line2`}>Suite</label>
                    <input id={`${r.id}-line2`} name="line2" className="field" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label" htmlFor={`${r.id}-city`}>City</label>
                    <input id={`${r.id}-city`} name="city" className="field" required />
                  </div>
                  <div className="sm:col-span-1">
                    <label className="label" htmlFor={`${r.id}-state`}>State</label>
                    <input id={`${r.id}-state`} name="state" className="field" maxLength={2} required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor={`${r.id}-zip`}>ZIP</label>
                    <input
                      id={`${r.id}-zip`}
                      name="postal_code"
                      className="field"
                      pattern="\d{5}(-\d{4})?"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor={`${r.id}-start`}>There from</label>
                    <input
                      id={`${r.id}-start`}
                      name="window_start"
                      type="time"
                      className="field"
                      defaultValue="09:00"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor={`${r.id}-end`}>Until</label>
                    <input
                      id={`${r.id}-end`}
                      name="window_end"
                      type="time"
                      className="field"
                      defaultValue="17:00"
                    />
                  </div>
                  <div className="flex items-end sm:col-span-2">
                    <label className="flex items-center gap-2 pb-2.5 text-sm">
                      <input
                        type="checkbox"
                        name="weekdays_only"
                        className="h-4 w-4 accent-[var(--color-forest)]"
                      />
                      Weekdays only
                    </label>
                  </div>
                  <div className="sm:col-span-6">
                    <label className="label" htmlFor={`${r.id}-notes-addr`}>Delivery notes</label>
                    <input
                      id={`${r.id}-notes-addr`}
                      name="delivery_notes"
                      className="field"
                      placeholder="Front desk will sign for it."
                    />
                  </div>
                  <div className="sm:col-span-6">
                    <button type="submit" className="btn btn-primary">
                      Save address
                    </button>
                  </div>
                </form>
              </details>
            </div>
          </section>
        );
      })}

      <section className="card p-6">
        <h2 className="text-xl font-bold">Add another person</h2>
        <p className="mt-1 text-sm text-muted">
          Mom, your sister, the assistant who actually runs your life. Same machinery.
        </p>
        <form action={createRecipientAction} className="mt-5 grid gap-4 sm:grid-cols-2">
          <input type="hidden" name="next" value="/dashboard/people" />
          <div>
            <label className="label" htmlFor="new-name">Name</label>
            <input id="new-name" name="name" className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="new-rel">Relationship</label>
            <input id="new-rel" name="relationship" className="field" placeholder="mom" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="new-likes">Loves</label>
            <input id="new-likes" name="likes" className="field" placeholder="tulips, cookies" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn btn-primary">
              Add person
            </button>
          </div>
        </form>
      </section>

      <p className="text-sm text-muted">
        Once someone has an address,{" "}
        <Link href="/dashboard/dates/new" className="text-forest hover:underline">
          add their dates
        </Link>
        .
      </p>
    </div>
  );
}
