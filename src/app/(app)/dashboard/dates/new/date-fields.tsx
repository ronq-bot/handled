"use client";

import { useState } from "react";
import { OCCASION_LABELS } from "@/lib/catalog";
import type { OccasionKind } from "@/lib/types";

/** The kinds whose calendar date is public knowledge, not a memory test. */
const FIXED: Partial<Record<OccasionKind, string>> = {
  valentines: "February 14 — we'll fill it in.",
  mothers_day: "Second Sunday of May — we'll fill it in.",
  christmas: "December 25 — we'll fill it in.",
};

/**
 * Kind + date, together because they interact: picking a fixed holiday makes
 * the date field unnecessary (the server computes the next occurrence when
 * it's blank). Without JavaScript the form still works — the date is simply
 * still fillable, and the server treats a blank the same way.
 */
export function DateFields() {
  const [kind, setKind] = useState<OccasionKind>("birthday");
  const fixed = FIXED[kind];

  return (
    <>
      <div>
        <label className="label" htmlFor="kind">
          Type of date
        </label>
        <select
          id="kind"
          name="kind"
          className="field"
          value={kind}
          onChange={(e) => setKind(e.target.value as OccasionKind)}
        >
          {(Object.keys(OCCASION_LABELS) as OccasionKind[]).map((k) => (
            <option key={k} value={k}>
              {OCCASION_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="title">
          What to call it
        </label>
        <input id="title" name="title" className="field" placeholder="Dana's birthday" />
      </div>

      <div>
        <label className="label" htmlFor="event_date">
          The date
        </label>
        {fixed ? (
          <p className="field flex items-center bg-bone-2 text-sm text-muted">{fixed}</p>
        ) : (
          <input id="event_date" name="event_date" type="date" className="field" required />
        )}
      </div>
    </>
  );
}
