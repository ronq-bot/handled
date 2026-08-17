"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";
import type { Address } from "@/lib/types";
import { formatTime } from "@/lib/date";

const BUDGETS = [50, 80, 120, 200, 350, 500];

/**
 * Address / budget / mode / search live in the URL so the ranked list stays a
 * server render. This component only pushes query params — it never holds
 * gift state.
 */
export function PlannerControls({
  addresses,
  addressId,
  budget,
  mode,
  query,
}: {
  addresses: Address[];
  addressId: string;
  budget: number;
  mode: "auto" | "manual";
  query: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // An orphaned timer would navigate back to this page after the user left
  // it — clear it on unmount.
  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  function set(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  /**
   * The search re-renders the grid on the server; don't do it per keystroke.
   * When the timer fires it reads the URL as it is THEN — building from this
   * render's searchParams would resurrect a budget or address the user
   * changed during the 300ms window.
   */
  function setSearch(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const next = new URLSearchParams(window.location.search);
      if (value) next.set("q", value);
      else next.delete("q");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    }, 300);
  }

  return (
    <div className={`card p-6 transition-opacity ${pending ? "opacity-60" : ""}`}>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="address-select">
            Where it goes
          </label>
          <select
            id="address-select"
            className="field"
            value={addressId}
            onChange={(e) => set("address", e.target.value)}
          >
            {addresses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.kind === "work" ? "Work" : a.kind === "home" ? "Home" : "Other"} —{" "}
                {a.nickname || a.line1}, {a.city}
              </option>
            ))}
          </select>
          {addresses.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              {(() => {
                const a = addresses.find((x) => x.id === addressId) ?? addresses[0];
                return `She's there ${formatTime(a.window_start)}–${formatTime(a.window_end)}${
                  a.weekdays_only ? ", weekdays only" : ""
                }.`;
              })()}
            </p>
          )}
        </div>

        <div>
          <span className="label">Budget ceiling</span>
          <div className="flex flex-wrap gap-2">
            {BUDGETS.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => set("budget", String(b))}
                className={`btn px-4 py-2 text-sm ${budget === b ? "btn-primary" : "btn-quiet"}`}
              >
                ${b}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <span className="label">How we choose</span>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                key: "auto",
                title: "Auto-Pilot",
                body: "We pick the best match for her tastes and this occasion, skip her allergies, and never repeat the last gift.",
              },
              {
                key: "manual",
                title: "I'll choose",
                body: "You pick it yourself from everything that can actually make the date.",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => set("mode", opt.key)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                mode === opt.key
                  ? "border-forest bg-forest-tint"
                  : "border-line bg-bone-2 hover:border-line-strong"
              }`}
            >
              <div className="font-semibold">{opt.title}</div>
              <div className="mt-1 text-sm text-muted">{opt.body}</div>
            </button>
          ))}
        </div>

        {mode === "manual" && (
          <div className="mt-5">
            <label className="label" htmlFor="gift-search">
              Search the catalogue
            </label>
            <input
              id="gift-search"
              type="search"
              className="field"
              placeholder="chocolate, jewelry, spa, something engraved…"
              defaultValue={query}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
