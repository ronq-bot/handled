"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { daysBetween, nextAnniversary, today } from "@/lib/date";
import { dogHouseRisk } from "@/lib/risk";
import { RiskMeter } from "@/components/risk-meter";

/**
 * The public Doghouse Risk quiz. No account, no server round-trip: it runs the
 * same `dogHouseRisk()` the dashboard runs, on dates that never leave the
 * visitor's browser. The score updates as they type, and the only way to move
 * it is the signup button underneath — which is the entire point.
 */

type QuizDate = {
  id: number;
  title: string;
  /** MM-DD or a full YYYY-MM-DD; the year is irrelevant for recurring dates. */
  date: string;
  covered: boolean;
};

const SUGGESTIONS: { title: string; date?: string }[] = [
  { title: "Her birthday" },
  { title: "Our anniversary" },
  { title: "Valentine's Day", date: "02-14" },
  { title: "The day we met" },
];

let nextId = 1;

/**
 * "02-14" or "1998-02-14" → the next occurrence as a full date, else null.
 * The round-trip check rejects phantom dates like "13-40" that the regex
 * alone would let through — a score computed from a month that doesn't
 * exist is worse than no score.
 */
function nextOccurrence(raw: string, from: string): string | null {
  const mmdd = /^(\d{2})-(\d{2})$/.exec(raw.trim());
  const full = mmdd ? `2000-${mmdd[1]}-${mmdd[2]}` : raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(full)) return null;
  const [y, m, d] = full.split("-").map(Number);
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null;
  return nextAnniversary(full, from);
}

export function RiskQuiz() {
  const [dates, setDates] = useState<QuizDate[]>([]);
  const [paymentOk, setPaymentOk] = useState(false);
  const [copied, setCopied] = useState(false);

  const from = today();

  const add = (title: string, date = "") => {
    // Minted outside the updater — updaters must stay pure, and React may
    // replay them, which would give the same row a new identity.
    const id = nextId++;
    setDates((d) => [...d, { id, title, date, covered: false }]);
  };

  const update = (id: number, patch: Partial<QuizDate>) =>
    setDates((d) => d.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const remove = (id: number) => setDates((d) => d.filter((row) => row.id !== id));

  const risk = useMemo(() => {
    const valid = dates
      .map((row) => ({ ...row, next: nextOccurrence(row.date, from) }))
      .filter((row) => row.next !== null && row.title.trim() !== "");

    return dogHouseRisk({
      totalOccasions: valid.length,
      uncoveredOccasions: valid
        .filter((row) => !row.covered)
        .map((row) => ({ title: row.title.trim(), daysAway: daysBetween(from, row.next!) })),
      missionsNeedingAttention: 0,
      paymentOk,
    });
  }, [dates, paymentOk, from]);

  const share = async () => {
    const text =
      `I scored ${risk.score}/100 on the Doghouse Risk Meter — "${risk.headline}" ` +
      `What's yours? ${window.location.origin}/risk`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused (permissions, http) — the button simply stays quiet.
    }
  };

  return (
    <div className="space-y-12">
      {/* ── The dates ────────────────────────────────────────── */}
      <section className="card p-8 sm:p-10">
        <h2 className="smallcaps">The dates that can hurt you</h2>
        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
          Month and day are enough — these come back every year. Tick the ones that already have a
          gift genuinely arranged. Not &ldquo;an idea&rdquo;. Arranged.
        </p>

        <div className="mt-7 flex flex-wrap gap-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              type="button"
              onClick={() => add(s.title, s.date ?? "")}
              className="rounded-full border border-line px-4 py-1.5 text-[0.8125rem] text-muted transition-colors hover:border-brass hover:text-ink"
            >
              + {s.title}
            </button>
          ))}
          <button
            type="button"
            onClick={() => add("")}
            className="rounded-full border border-line px-4 py-1.5 text-[0.8125rem] text-muted transition-colors hover:border-brass hover:text-ink"
          >
            + Something else
          </button>
        </div>

        {dates.length > 0 && (
          <ul className="mt-8 space-y-4">
            {dates.map((row) => (
              <li key={row.id} className="grid gap-3 sm:grid-cols-[1.4fr_1fr_auto_auto] sm:items-center">
                <input
                  aria-label="What is the date"
                  className="field"
                  placeholder="Her birthday"
                  value={row.title}
                  onChange={(e) => update(row.id, { title: e.target.value })}
                />
                <div>
                  <input
                    aria-label="When is it (month and day)"
                    className="field"
                    placeholder="MM-DD"
                    value={row.date}
                    onChange={(e) => update(row.id, { date: e.target.value })}
                  />
                  {/* A row we can't read silently wouldn't count — say so. */}
                  {row.date.trim() !== "" && nextOccurrence(row.date, from) === null && (
                    <p className="mt-1 text-xs text-claret">
                      Write it as MM-DD, like 08-24 — this one isn&apos;t counting yet.
                    </p>
                  )}
                </div>
                <label className="flex items-center gap-2 text-[0.8125rem] text-muted">
                  <input
                    type="checkbox"
                    checked={row.covered}
                    onChange={(e) => update(row.id, { covered: e.target.checked })}
                  />
                  Handled already
                </label>
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  className="text-[0.8125rem] text-faint transition-colors hover:text-claret"
                  aria-label={`Remove ${row.title || "this date"}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="mt-8 flex items-start gap-3 border-t border-line pt-7 text-[0.9375rem] leading-relaxed text-muted">
          <input
            type="checkbox"
            className="mt-1"
            checked={paymentOk}
            onChange={(e) => setPaymentOk(e.target.checked)}
          />
          If one of these dates arrived tomorrow, something is already ordered and paid for — it
          would ship without me touching it.
        </label>
      </section>

      {/* ── The verdict ──────────────────────────────────────── */}
      <RiskMeter risk={risk} />

      <section className="flex flex-wrap items-center gap-5">
        <Link href="/signup" className="btn btn-primary">
          Fix my score
        </Link>
        <button type="button" onClick={share} className="btn">
          {copied ? "Copied — go worry a friend" : "Copy my score"}
        </button>
        <p className="basis-full text-[0.8125rem] text-faint sm:basis-auto">
          Your dates stay in this browser tab. We see nothing until you sign up.
        </p>
      </section>
    </div>
  );
}
