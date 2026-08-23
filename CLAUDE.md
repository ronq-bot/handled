# Handled — working notes for Claude sessions

Handled is a gift-scheduling service: a member enters the dates that matter
once, and the right gift arrives on the day — picked by Auto-Pilot or chosen
by hand — with the house earning affiliate commission on every order. Live at
https://handledthis.com behind a coming-soon gate.

**This repository (babygenie22/handled) is the sole source of truth.** The
earlier ronq-bot/handled repo is retired; its final state was folded in via
the "Catch up to ronq-bot/handled final state (batches 10-12)" commit.

Read `docs/HANDOFF.md` before touching deployment, vendors, or env vars — it
carries the operational state a fresh session can't infer from code.

## Commands

- `npm run dev` — dev server on :3000 (SQLite in `.data/`, created on boot)
- `node scripts/verify.mjs` — the test suite; **122 checks** must pass
- `npx tsc --noEmit` — typecheck; `npm run lint` — 2 known `<img>` warnings
- `npm run build` — production build
- `npm run margins` / `npm run earnings` — affiliate math from the CLI

## Conventions that bite if missed

- **Migrations**: add columns via `ADDED_COLUMNS` in `src/lib/db.ts`, and
  move the Postgres cold-start **probe sentinel** (the
  `information_schema` query in `openPostgres`) to whatever the newest
  migration creates. A stale sentinel silently skips new migrations in prod.
- **Dispatcher writes are status-guarded** (`WHERE status = ...`) so crashed
  or concurrent runs never double-order; `vendor_order_ref` is persisted
  before charging. Keep that shape in new mission updates.
- **Operator-only data**: `affiliate_cents`, the house ledger, and the order
  desk must never reach a member's screen. Gate with `isOperator()`
  (`HANDLED_ADMIN_EMAILS` in production, everyone in dev).
- **Dates are `YYYY-MM-DD` strings, math in UTC** (`src/lib/date.ts`) — a
  gift date is a wall-calendar fact, not an instant.
- **Emails escape user text** with `esc()` in `src/lib/email.ts`.
- **Vendor adapters** implement `FulfillmentAdapter`
  (`src/lib/fulfillment.ts`): `placeOrder`, optional `preflight` (catch dead
  products early), optional `orderStatus` (real tracking). Mock adapter
  covers everything keyless — the app must always run with zero env vars.
- Commit author email must be the GitHub-matched account address (repo-local
  git config already set) — Vercel **blocks deployments** whose commit
  author email doesn't match a GitHub account with project access.
- `vercel.json` cron must stay **daily** — Vercel Hobby refuses more.

## Demo account (dev)

`tour@example.com` / `sunflower-42`, or the "Load demo data" button in
Settings seeds a year for a fresh account.
