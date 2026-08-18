# Roadmap: from this build to the iOS app

## Where this build actually is

Working end to end on **either SQLite or hosted Postgres**, with real Stripe, Resend and
Florist One integrations that fall back to local stand-ins when their keys are absent:

- Email/password auth with server-side sessions
- Recipients, multiple addresses per recipient, delivery windows, weekday-only flags
- Recurring dates that roll forward every year on their own
- A gift catalog with per-vendor lead times, allergens, and work-safety flags
- Auto-Pilot selection (allergy/veto/budget hard rules, taste and occasion scoring, no repeats)
- Delivery planning: weekend→Friday shift for office addresses, lead-time-aware ship dates,
  "can't make this date" detection
- An idempotent dispatcher with a real state machine (`scheduled → placed → shipped → delivered`,
  plus `failed` with a one-click rescue)
- `/api/cron/dispatch` as the production entry point
- 35 automated checks in `npm run verify`, green against both database engines

Still simulated when keys are absent: the vendor API, email delivery, and the card on file.
Push notifications are not built at all — see Phase 3.

---

## Done since the first build

- **One async data layer over SQLite and Postgres** (`src/lib/db.ts`). Queries are written once
  with `?` placeholders; the Postgres driver rewrites them positionally. Schema and column
  migrations run on first connection, so a deploy needs no migration step.
- **Stripe** via Checkout in setup mode, charged off-session per shipment, idempotent on mission id.
- **Resend** for the four transactional emails, including the one that asks you to fix something.
- **Florist One** adapter that confirms the delivery date with the florist network before booking.
- **Hourly cron** (`vercel.json`) behind a bearer secret.

## Phase 1 — Make it real (4–6 weeks)

**Stripe webhooks.** Charges are confirmed synchronously today. A webhook endpoint would catch
asynchronous declines and disputes.

**Florist One catalogue sync.** Products carry an optional `vendorSku`; nothing populates it yet,
so the adapter falls back to our own product id. Pull their catalogue on a schedule.

**Notifications.** Three emails carry the entire product: *scheduled*, *shipping today*,
*delivered*. Plus one that matters more than the rest — *we couldn't place this order, here's the
fix, one tap.*

**Real cron.** A hosted scheduler hitting `/api/cron/dispatch` hourly with the bearer secret.

## Phase 2 — Make it sticky (6–10 weeks)

- **Calendar import.** Read birthdays and anniversaries from Google/Apple Calendar and contacts.
  Cuts onboarding from twenty minutes to two, which is the single biggest conversion lever.
- **Doghouse Risk quiz** as a public, no-signup growth page.
- **Gift history intelligence.** "You sent flowers three times running" → Auto-Pilot already
  penalizes repeats; surface it as advice.
- **Budget planning.** Annual budget across all dates, not per-gift ceilings.
- **The rescue flow.** ~~Catching a dead product early, and replacing it without homework~~ —
  done: adapters pre-flight upcoming gifts in the reminder window (days before the ship date),
  and Auto-Pilot accounts get an automatic replacement (capped at two swaps) with a "we handled
  it, change it if you disagree" email. Still ahead: same-day sourcing when the failure happens
  on the day itself — the paid tiers' core promise.

## Phase 3 — iOS (8–12 weeks, starts once Phase 1 is live)

**Native SwiftUI, not a wrapper.** The three things iOS does better are the whole reason to build
it, and none survive a WebView:

1. **Push notifications.** "Her flowers arrive today. Act natural." Web push on iOS is still a
   worse experience than an APNs notification.
2. **Contacts + Calendar access.** `EventKit` and `Contacts` turn setup into a permission prompt
   and a few taps. This is the killer onboarding path.
3. **Widgets + Live Activities.** A home-screen widget showing the next date and its countdown
   is passive reassurance — the emotional product, on the lock screen. A Live Activity on
   delivery day is genuinely delightful.

**Architecture.** The web app becomes the API. Extract the current server actions into a
versioned REST/JSON layer (`/api/v1/...`) that both clients use; `src/lib/` — dates, picker,
scheduling, dispatcher — is already framework-free and stays the single source of truth on the
server. The iOS client stays thin: no gift-selection logic on the device, ever, or the two
clients will disagree about what Auto-Pilot would choose.

**Auth.** Sign in with Apple is effectively mandatory for this audience and this App Store
category. Add it to the web app first so accounts are portable.

**App Store positioning.** Category: Lifestyle. The screenshots do the selling — lead with the
Doghouse Risk Meter, then the timeline, then a delivered gift. Keep the humor in the screenshot
captions where it's allowed to be funny; keep the description straight so review doesn't stall.

## Phase 4 — Breadth

- Multiple recipients as a first-class flow (kids, parents, in-laws, assistants)
- Corporate accounts — the same engine sells to sales teams and HR unchanged
- International via Giftsenda
- Courier-level delivery windows via DoorDash Drive / Uber Direct

---

## Technical debt worth naming now

- **Server actions have no shared validation layer.** Zod is installed but unused; the actions
  currently coerce with a `s(fd, key)` helper. Fine at this size, wrong at ten times this size.
- **No rate limiting on auth.** Add it before the app is public.
- ~~Sessions are never garbage collected.~~ Fixed: expired rows are swept whenever a new
  session is created.
- **The dispatcher is single-process.** Postgres plus `SELECT … FOR UPDATE SKIP LOCKED` before
  running more than one worker.
- **`price_cents` is captured at scheduling time.** A gift scheduled eleven months out will be
  priced at today's price. Decide deliberately: honor it (a real feature — "locked-in pricing")
  or re-price at ship time and notify. Right now it silently honors it.
