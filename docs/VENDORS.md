# Who can actually deliver a gift on a date we picked a year ago

Researched July 2026. The live version of this is in the app —
**Dashboard → Fulfilment** — driven by [`src/lib/fulfilment-map.ts`](../src/lib/fulfilment-map.ts)
so it can't drift from what the adapters really do.

The product only works if something lands **on the right day, at the right address**. That single
constraint eliminates most of the gifting world: anything quoting "5–9 business days, probably"
is useless to us. Sorted below by how close each is to shipping unattended.

---

## 1. Automated now — coded, tested, waiting on credentials

### Florist One — flowers, US-wide
**The only partner found that will commit to an exact calendar date and let us verify it first.**
A genuine REST API (not an affiliate link) selling florist-delivered flowers entirely inside your
own app, fulfilled by a network of ~15,000 local florists.

The call that matters is `getdeliverydates`: it returns the dates that network can actually serve
for a given ZIP. Our adapter asks first and **refuses to book a date they haven't confirmed** —
see [`vendors/florist-one.ts`](../src/lib/vendors/florist-one.ts). Delivers every day except
Sundays and holidays, because that's when local florists are shut.

Also offers cart management (`Create Cart`, `Add to Cart`…), which we skip — we place single
dated orders directly. ~20% commission funds the free tier.
→ https://www.floristone.com/api/

---

## 2. Buildable today — public API, self-serve signup, no permission needed

### Giftbit — experiences, credited to him — **live**
Fully self-serve: sign up at `testbedapp.giftbit.com`, generate a token, build. No sales call. A
RESTful API for sending and tracking digital rewards programmatically. Coded in
[`vendors/giftbit.ts`](../src/lib/vendors/giftbit.ts).

**The credit goes to the buyer, never to the recipient.** Handled's entire value is that she has
no idea any of this is happening — an email landing in her inbox would end the surprise the
product exists to protect (see the guardrail in [MARKETING.md](MARKETING.md)). So on the day, he
receives a credit for the amount he budgeted, redeemable across the regional catalogue; he chooses
what to give and arranges the reveal himself. We handle the deciding and the remembering, not the
delivering — for this one category, that split is the honest offer.

Its date guarantee is perfect precisely because there is no logistics on our side: the credit
either sends on the day or it doesn't send at all. The one operational catch is funding — a
campaign sits in `AWAITING_FUNDS` until the account balance covers it, which our adapter treats as
a failure, not a success.
→ https://www.giftbit.com/developers/

*Alternatives with free sandboxes:* **Tremendous** (gift cards, prepaid Visa, cash).
**Tango Card** is comparable but wants you to contact them for credentials, so it isn't self-serve.

### Printful — personalised, physical
Self-serve token, REST/JSON, and a `gift` field on the order. Right for photo books, engraved
keepsakes, and anything printed to order.

**Date is estimated, not promised** — production time plus carrier transit. That's fine, because
the scheduler already models it: `leadDaysOverride` on the product, and the picker refuses
anything that can't make the date. Wrong for a dated bouquet; right for a year-in-review book
you commission in October.
→ https://developers.printful.com/docs/ (**Printify** is an equivalent alternative.)

---

## 3. Needs approval — a real API exists, but they choose who gets it

| Partner | Covers | The catch |
|---|---|---|
| [Gift Baskets Overseas](https://www.giftbasketsoverseas.com/gift-delivery-api) | Fruit, sweets, wine, spa, flowers — internationally | Real dated gift-delivery API, but access is by application and approval. **Worth applying for first** — it's the widest single-partner coverage of our catalogue. |
| [Giftnote](https://www.giftnote.com/features/gifting-api) | Chocolate, bakery, general | Storefront + server-side APIs, tracked across 100+ carriers. Onboarding goes through their team. |
| [Sendoso](https://developer.sendoso.com/rest-api/overview/introduction) / Snappy | Spa, home, multi-category | Genuine programmatic sending, but enterprise sales with minimums. Sensible at scale, wrong as a first integration. |

**Flower Shop Network** ([api.flowershopnetwork.com](https://api.flowershopnetwork.com/)) deserves
a specific note. It has exactly the endpoints we'd want — `RelayOrder.apiSendOrder` takes a
`YYYY-MM-DD` delivery date — but it is a **florist-to-florist relay**. You must be a florist or a
florist POS system to use it. Not a route for us directly; possibly one if we ever partner with a
shop.

---

## 4. Human in the loop — no API we can use

- **Wine and spirits.** No self-serve API found that we could verify. Compounded by state-level
  regulation, adult-signature requirements, and the fact that it can't go to most offices — all of
  which the picker already hard-blocks. Realistically a concierge task, or drop it from the
  catalogue until a partner is signed.
- **1-800-Flowers** (and Harry & David, Shari's Berries, Cheryl's Cookies), **Edible
  Arrangements**, **Goldbelly**. Household names, real gifting operations, **no public developer
  API**. You can earn commission (~20%, 45-day cookie) and pre-fill a cart, but you cannot place a
  dated order from code. If we list these, the "order" is a person with a browser tab — and we
  should never describe that as automated.

---

## The last mile — a time window, not just a date

Delivery *windows* ("she's at her desk 9–5") are a courier problem, not a merchant one. Both of
these run under your own brand rather than their marketplace, and both need a source merchant —
they move goods, they don't sell them:

- **DoorDash Drive** — POST an order, get a tracking URL. All 50 US states, plus Canada and
  Australia. → https://developer.doordash.com/en-US/blog/same-day-delivery-using-doordash-drive-api/
- **Uber Direct** — same model, strong Shopify/POS integration.

This is what would eventually make "10 AM, so the whole office sees it" real.

---

## Recommended order

1. **Turn on Florist One.** The adapter is written. Flowers are the highest-volume, highest-return
   gift and the only category with a clean dated-delivery API. Prove the scheduler against real
   orders before adding surface area.
2. **Build Giftbit.** Half a day, self-serve, and it makes the experiences category genuinely
   reliable — plus it's the natural fallback when a physical delivery fails.
3. **Apply to Gift Baskets Overseas.** Widest coverage of what's left; the application is the long
   pole, so start it early.
4. **Build Printful** when personalised gifts justify it.
5. **Couriers** once volume justifies a same-day tier — this is the actual moat.

---

## What every adapter must implement

Learned from the failure modes already encoded in `scripts/verify.mjs`:

1. **Ask before promising.** Get available dates from the vendor; never assume.
2. **Address-type awareness.** Business vs. residential changes what can ship and who signs.
3. **Lead time as data.** Engraving is 10 days, a bouquet is 2. It lives on the product and drives
   the ship date.
4. **Idempotency.** The dispatcher is re-runnable by design; the vendor must not double-charge.
5. **Fail loudly, days early.** A failure surfaced on the ship date leaves runway to rescue it.
   On the delivery date it's just the doghouse.
6. **Webhooks for state.** Date-based `placed → shipped → delivered` is a stopgap.

## Sources

- [Florist One API](https://www.floristone.com/api/) · [technical details](https://www.floristone.com/api/technical-information/)
- [Flower Shop Network JSON API](https://api.flowershopnetwork.com/)
- [Giftbit developer hub](https://www.giftbit.com/developers/) · [vs Tremendous / Tango](https://www.giftbit.com/tremendous-tango-alternatives)
- [Tango Card API](https://developers.tangocard.com/)
- [Printful API docs](https://developers.printful.com/docs/) · [Printify API](https://developers.printify.com/)
- [Gift Baskets Overseas gift delivery API](https://www.giftbasketsoverseas.com/gift-delivery-api)
- [Giftnote gifting API](https://www.giftnote.com/features/gifting-api)
- [Sendoso REST API](https://developer.sendoso.com/rest-api/overview/introduction)
- [DoorDash Drive](https://developer.doordash.com/en-US/blog/same-day-delivery-using-doordash-drive-api/)
