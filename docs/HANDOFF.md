# Operational handoff

State of the world as of 2026-08-23, written for the first session working
in babygenie22/handled as the sole repository. Owner: Noor
(noorqrealestate@gmail.com).

## Where things run

- **Production**: Vercel project `handled` (team `babygenie22s-projects`,
  project id `prj_HPVb14t7dlpA8gIwvtl8UmADeQ8i`). Custom domain
  **handledthis.com**; `clubhandled.com` and `handledclub.com` 308-redirect
  to it. Database: Neon Postgres via `DATABASE_URL` (set in Vercel).
- **Coming-soon gate**: `HANDLED_COMING_SOON=1` in Vercel production env —
  every public route rewrites to the holding page. Bypass:
  `?preview=<HANDLED_PREVIEW_SECRET>` once per browser (30-day cookie).
  The secret lives in the Vercel env. Noor wants the gate UP until launch;
  never remove it without an explicit launch instruction.
- **Health**: `GET /api/health` (excluded from the gate, as is
  `/api/cron/dispatch`).

## Deployment — read before deploying

1. The Vercel↔GitHub integration was **broken** at handoff time (pushes to
   main did not trigger builds, dashboard "Create Deployment" errored).
   Durable fix: Vercel → handled → Settings → Git → disconnect and
   reconnect `babygenie22/handled`; also confirm the Vercel GitHub App has
   access to the repo at github.com/settings/installations.
2. Until that is fixed, deploy with the Vercel CLI
   (`npx vercel deploy --prod --yes` with a token). Two Vercel rules:
   - Commit **author email** must match a GitHub account with project
     access, or the deployment lands in `BLOCKED` (repo-local git config
     already sets `138932344+babygenie22@users.noreply.github.com`).
   - Crons: **daily max** on the Hobby plan (`vercel.json` is set to
     `0 9 * * *` — do not raise the frequency).
3. Env vars change only at deploy time — after editing one, redeploy.

## Vendors (fulfillment)

Everything degrades to a local mock without keys; keys make it real.

| Vendor | Status | Notes |
|---|---|---|
| Goody | Sandbox tested end-to-end (real sandbox order placed) | `GOODY_API_KEY` (a `goody_token_user_…` sandbox key was used; it was pasted in Noor's chat with the previous session). Production needs: a production key, and **restoring production vendorSkus** — they were remapped to sandbox IDs (originals are in ronq-era git history, pre-commit `0d9084f`). Ask Noor about a commerce account vs user-key model. |
| Florist One | Test mode tested end-to-end (2 real test orders) | `FLORIST_ONE_API_USER` / `FLORIST_ONE_API_PASSWORD` (issued 740553 / a password that passed through chat — **rotate it after going live**). Live mode: email brian@floristone.com to request the switch. Card env vars (`FLORIST_ONE_CARD_*`) hold their documented test card in Test mode; in Live mode that becomes the company card. |
| Giftbit | Coded, testbed-ready | `GIFTBIT_API_KEY`, self-serve at testbedapp.giftbit.com. |
| Printful | Coded, draft-mode | `PRINTFUL_API_KEY`, self-serve token. |
| Stripe | Not connected | `STRIPE_SECRET_KEY` required before ANY vendor goes to production — `realMoneyVendorConfigured()` refuses the payment stand-in when real money can move. |

`scripts/test-vendors.mjs` exercises live vendor APIs (flags:
`--order-goody`, `--order-florist`, needs `.env.local`). Real-order test
records: `docs/VENDOR-TEST-RESULTS.md`.

## Env vars (names only — values live in Vercel or with Noor)

`DATABASE_URL`, `HANDLED_APP_URL`, `HANDLED_COMING_SOON`,
`HANDLED_PREVIEW_SECRET`, `HANDLED_CRON_SECRET`, `HANDLED_ADMIN_EMAILS`
(operator surfaces: the house ledger and the order desk on /dashboard/coverage),
`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `GOODY_API_KEY`/`GOODY_ENV`,
`FLORIST_ONE_API_USER`/`FLORIST_ONE_API_PASSWORD`/`FLORIST_ONE_CARD_*`/
`FLORIST_ONE_TEST_MODE`, `GIFTBIT_API_KEY`/`GIFTBIT_ENV`,
`PRINTFUL_API_KEY`/`PRINTFUL_ENV`. The Settings page's "Connected services"
section shows live/stand-in status per integration and names each var.

## Outstanding items (waiting on Noor at handoff time)

- Reconnect Vercel↔GitHub (above) so pushes deploy automatically.
- Flip **ronq-bot/handled private/archive** (it was public for the final
  sync; nothing needs it anymore).
- Florist One Live-mode email + password rotation.
- Goody production key + vendorSku restore + commerce-account question.
- Stripe key, then real launch decisions.

## History note

Product history: 12 feature batches (vendor integrations, tracking,
send-now, feedback loop, password reset, rate limiting, cover-everything,
operator desk, data export…) built in the ronq-bot era. Batches up to 9
arrived here as fast-forwards; batches 10–12 arrived as one squash commit
("Catch up to ronq-bot/handled final state") because cross-repo fetches
were closed off. The verify suite (122 checks) passed in this repo's own
clone at handoff.
