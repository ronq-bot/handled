"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import type { Address } from "@/lib/types";
import { formatTime } from "@/lib/date";

const BUDGETS = [50, 80, 120, 200, 350];

/**
 * Address / budget / mode live in the URL so the ranked list stays a server
 * render. This component only pushes query params — it never holds gift state.
 */
export function PlannerControls({
  addresses,
  addressId,
  budget,
  mode,
}: {
  addresses: Address[];
  addressId: string;
  budget: number;
  mode: "auto" | "manual";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function set(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set(key, value);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
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
      </div>
    </div>
  );
}
