"use client";

import { useState } from "react";
import type { OccasionKind } from "@/lib/types";

/**
 * Three ready lines per occasion, in the house voice — because the card
 * message is where most people stall, and a stalled planner schedules
 * nothing. Clicking one fills the field; it stays editable.
 */
const SUGGESTIONS: Record<OccasionKind, string[]> = {
  birthday: [
    "Happy birthday. Yes, I remembered. All by myself.",
    "Another year of you. Lucky everyone.",
    "You don't look it. I checked.",
  ],
  anniversary: [
    "Still my best decision.",
    "Here's to us — I'd sign again today.",
    "You, again, forever. Gladly.",
  ],
  valentines: [
    "No occasion needed. But there is one, and it's you.",
    "Roses are cliché. You're not.",
    "Be mine. Continue being mine.",
  ],
  mothers_day: [
    "For everything you carry. Happy Mother's Day.",
    "The kids voted. Unanimous.",
    "Best mother in this house, by a mile.",
  ],
  christmas: [
    "Merry Christmas. You were impossible to shop for; I managed.",
    "Under no tree, straight to you.",
    "Consider the season officially merry.",
  ],
  apology: [
    "I was wrong. This is me saying it in flowers.",
    "You were right. Please enjoy the evidence.",
    "Sorry — properly, and in writing.",
  ],
  just_because: [
    "No reason. That's the reason.",
    "Saw this. Thought of you. Sent it.",
    "It's Tuesday. You're wonderful. That's all.",
  ],
  custom: [
    "Thinking of you today, on purpose.",
    "This seemed like a you thing.",
    "Marked the date. Meant it.",
  ],
};

export function MessageField({
  occasionKind,
  signOff,
}: {
  occasionKind: OccasionKind;
  signOff: string;
}) {
  const [value, setValue] = useState("");
  const suggestions = SUGGESTIONS[occasionKind] ?? SUGGESTIONS.custom;

  return (
    <>
      <textarea
        id="gift_message"
        name="gift_message"
        rows={3}
        maxLength={250}
        className="field resize-y"
        placeholder={`${suggestions[0]} ${signOff}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setValue(`${s} ${signOff}`)}
            className="rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-brass hover:text-ink"
          >
            {s}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        250 characters. Write it now, while you have thoughts — or borrow a line above and make it
        yours. Leave it blank and we&apos;ll use something tasteful and generic, which she will
        notice.
      </p>
    </>
  );
}
