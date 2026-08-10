# Handled

**Never forget her birthday ever again.**

Set every important date once — birthdays, anniversaries, Valentine's, the day you met. Choose
the gift or let Auto-Pilot choose. Pick her home or her office and the hours she's actually
there. Handled places the order on the right day, with the right lead time, up to a year in
advance.

Web app first; the same server becomes the API for an iOS client (see [docs/ROADMAP.md](docs/ROADMAP.md)).

---

## Running it

```bash
npm install
npm run dev
```

Then open http://localhost:3000. Sign up, and either walk through onboarding or hit
**Settings → Load demo data** for the worked example: an August 20 birthday with a bouquet going
to her office and a September 25 anniversary with a fruit bouquet going home.

Run the test suite:

```bash
npm run verify                                    # SQLite
npm run verify:both -- postgresql://…/handled_test  # both engines
```

69 checks covering calendar math, the picker's hard rules, delivery planning, risk scoring, the
dispatcher's state machine, the SQL placeholder translation and the integration fallbacks. Uses a
throwaway database, and the whole suite runs green against **both** SQLite and Postgres.

### Watching the scheduler work

The dispatcher normally runs on a cron. In development you can fast-forward the calendar:

```bash
curl "http://localhost:3000/api/cron/dispatch?asOf=2026-08-18"
```

That places every order whose ship date has arrived, then advances anything already in flight.
Re-running it is a no-op — every transition is gated on the mission's current status.

### Connecting real services

Copy `.env.example` to `.env.local`. **Every key is optional.** With none set,
the app runs end to end on SQLite with simulated vendors, logged email, and a
checkbox standing in for a card — so you can click through the whole product
with no accounts at all. Add a key and that one integration turns real;
nothing else changes. **Account → Connected services** shows live status.

| Add this | And this becomes real | Where |
|---|---|---|
| `STRIPE_SECRET_KEY` | Cards collected via Stripe Checkout, charged per shipment | dashboard.stripe.com/apikeys — a `sk_test_…` key works immediately |
| `RESEND_API_KEY` | Order, delivery and failure emails actually send | resend.com/api-keys — free, no card |
| `DATABASE_URL` | Hosted Postgres instead of the local file | neon.tech or supabase.com |
| `FLORIST_ONE_API_USER` + `_PASSWORD` | Flowers ordered from real florists against confirmed delivery dates | floristone.com/api |
| `GIFTBIT_API_KEY` | An experience credit is emailed to *him* on the day — never to her, so the surprise holds | testbedapp.giftbit.com — self-serve sandbox |
| `GOODY_API_KEY` | Confectionery, bakery, spa and home gifts posted to her address | developer.ongoody.com — self-serve key, free sandbox |
| `HANDLED_CRON_SECRET` | `/api/cron/dispatch` requires `Authorization: Bearer …` | any random string — set it before you deploy |

Other knobs: `HANDLED_DATA_DIR` (SQLite location, default `./.data`),
`HANDLED_ADAPTER=mock` (force simulated vendors even with real keys),
`HANDLED_FORCE_FAIL=1` (make every order fail, to exercise the rescue flow).

`vercel.json` already schedules the dispatcher hourly.

### Real product photography

```bash
npm run sync:catalogue
```

Pulls each configured partner's own photograph, name and price and writes them to
`.data/catalogue-overlay.json`, which the catalogue merges in on every import — restart the dev
server to see it. Safe with no credentials at all: it reports what it *would* fetch and changes
nothing. Safe to re-run any time: it's a full re-fetch, never an accumulation. See
[`catalogue-sync.ts`](src/lib/catalogue-sync.ts).

### Deploying

```bash
vercel --prod
```

Set `HANDLED_APP_URL`, `HANDLED_CRON_SECRET` and `DATABASE_URL` in the project's
environment, plus whichever of Stripe / Resend / Florist One you want live. The
schema is created and migrated on the first connection, so there is no separate
migration step. `vercel.json` already registers the hourly cron.

One data layer covers both engines (`src/lib/db.ts`): queries are written once
with `?` placeholders, and the Postgres driver rewrites them to `$1, $2` —
correctly skipping question marks inside string literals, which is covered by
the test suite.

---

## Working on this with someone else

`main` is the deployed branch, so nothing lands on it directly. Work goes on a
branch and arrives through a pull request.

```bash
git feature add-gift-notes    # branches off an up-to-date main
# ...commit as usual...
git pr                        # pushes and opens the PR
```

A `pre-push` hook refuses direct pushes to `main` and tells you how to move
commits onto a branch if you started there by habit. Deliberate exceptions —
a hotfix, a revert — go through `ALLOW_MAIN_PUSH=1 git push origin main`.

**In a fresh clone the hook is off until you point git at it**, since git will
not run version-controlled hooks by default:

```bash
git config core.hooksPath .githooks
```

### Two remotes

`origin` pushes to both `babygenie22/handled` and `ronq-bot/handled`, so one
`git push` mirrors to both accounts. Fetches come from `babygenie22` only —
that is the source of truth, and `ronq-bot` is the backup copy.

Since nothing pulls back automatically, `git sync-check` reports whether the
two have drifted and which commits are on one but not the other.

---

## How it fits together

```
src/lib/
  date.ts          Calendar math. Plain YYYY-MM-DD strings, all UTC, no timezone drift.
  catalog.ts       Vendors and products — lead times, allergens, work-safety flags.
  picker.ts        Auto-Pilot. Hard rules eliminate, soft scores rank.
  scheduling.ts    Event date → delivery date → ship date. Plus the Doghouse Risk score.
  fulfillment.ts   The one interface every gifting partner implements.
  dispatcher.ts    The heartbeat. Idempotent. Runs the state machine.
  queries.ts       Data access.
  auth.ts          scrypt passwords, server-side sessions.
  db.ts            SQLite schema and connection.

src/app/
  page.tsx              Marketing site
  (auth)/               Login, signup
  onboarding/           Who she is, where she is
  (app)/dashboard/      Command center, dates, gifts, people, settings
  (app)/dashboard/plan/ The gift picker
  api/cron/dispatch/    The scheduler entry point
```

The three ideas worth knowing:

**Dates are strings, not instants.** "August 20" is a wall-calendar fact. Everything in
`date.ts` works in UTC on `YYYY-MM-DD` so a birthday never slides to the 19th for someone west
of UTC.

**Two dates per gift.** `deliver_on` is when it lands; `ship_on` is `deliver_on` minus the
product's lead time. An engraved bracelet needs 10 days, a bouquet needs 2. Weekend deliveries
to an office shift back to the Friday before, automatically, and the user is told.

**The dispatcher is idempotent by construction.** Every transition is gated on current status,
so running it twice in a day — or replaying a week — changes nothing. That's what makes a cron
safe.

---

## What's mocked

| Mocked | Real version |
|---|---|
| Payments (`payment_ok` boolean) | Stripe SetupIntent, charged per shipment |
| The vendor (`mockAdapter`) | Florist One API first — see [docs/VENDORS.md](docs/VENDORS.md) |
| `placed → shipped → delivered` on dates | Vendor webhooks |
| Email and push | Transactional email + APNs |

The mock adapter is deliberately strict — it rejects alcohol bound for a business address and
malformed postal codes — so the failure and rescue paths are exercised, not theoretical.

---

## Docs

- [docs/VENDORS.md](docs/VENDORS.md) — the gifting supply landscape: who has a real API, who's
  affiliate-only, and the recommended integration order
- [docs/MARKETING.md](docs/MARKETING.md) — voice, taglines, campaign concepts, guardrails
- [docs/ROADMAP.md](docs/ROADMAP.md) — path to production and to iOS

---

Vendor and product names in the catalog are illustrative placeholders for this build. Real
partners are covered in [docs/VENDORS.md](docs/VENDORS.md).
