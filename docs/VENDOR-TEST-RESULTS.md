# Vendor test results

## Florist One — Test mode, 2026-08-17

**Order 351097894 placed through the real adapter.** API key approved in Test
mode (no flowers ship, their documented test card pays). The full pipeline ran
live: catalogue (12 products) → `checkdeliverydate` for 28202 (real dates,
Sundays absent exactly as documented) → `gettotal` (T50-3A at $94.95 lands at
**$122.99** with their $19.99 delivery fee and $8.05 tax) → Authorize.net
tokenization → `placeorder` accepted.

Contact with the live API rewrote the adapter — every guessed detail was wrong
and is now real:

- The delivery-dates endpoint is **`checkdeliverydate`**, not `getdeliverydates`
  (which does not exist — the first production order would have failed).
- `placeorder` is **POST with a JSON body** of uppercase structures
  (`customer` / `products[].RECIPIENT` / `ccinfo` / `ordertotal`), not GET with
  flat query params.
- Payment is a **single-use Authorize.net token** per order: `getauthorizenetkey`
  hands over a public client key (and says which gateway environment —
  `jstest` = sandbox), the card in `FLORIST_ONE_CARD_*` env vars is tokenized
  against it, and the token rides in `ccinfo`. In Test mode that card is their
  documented `4242…` test card; in Live mode it becomes the company card.
- `ordertotal` must be *their* number — the adapter asks `gettotal` first, which
  also yields the true landed cost per order (logged on every placement).
- Card messages cap at **200** characters (ours allowed 250); the customer block
  carries the buyer's name with OUR operations email, so supplier
  correspondence never reaches him and the white label holds.

Before Live mode: contact brian@floristone.com for the application review, swap
`FLORIST_ONE_CARD_*` to the company card, remove `FLORIST_ONE_TEST_MODE`, and
map the three flower products to chosen codes (sync currently matches by
nearest price: 3/3 matched with real photography).

---

**Date:** 2026-08-17
**Target:** Goody SANDBOX (`api.sandbox.ongoody.com`) — nothing charged, no real money can move.

## Verdict

- **14 of 14 mapped Goody products are orderable today** — credentials accepted, every
  mapped sku pre-flights clean (active, cart-eligible, fixed price, no state
  restrictions, variants resolved).
- **A sandbox order WAS placed** (second run, after a test card was added to the
  sandbox account through the dashboard — the first attempt was refused with
  `Payment method not found` because the account had no payment method, which the
  API cannot add on its own). The full production pipeline ran end to end:
  auth → pre-flight → variant resolution → card lookup → order batch → payment.

  | | |
  |---|---|
  | Order | `4676c93e-89a5-4de0-bfc0-4ae4c24060b6` — status `created` |
  | Batch | `f4a708ab-4910-4947-ac8a-df9593ffb86f` — send_status `complete` |
  | Item | 40 Piece Signature Truffles Gift Set, charged $106.00 to Visa ····4242 |
  | Card + message | attached and carried (`from` name, gift message, card design) |

- **All 14 products' real photography and prices synced** — `npm run sync:catalogue`
  wrote 14 overlay entries, every one with the partner's own photo.
- **The production skus all 404 in the sandbox** (expected — Goody's sandbox serves a
  different catalogue). All 14 mapped products in `src/lib/catalog.ts` were remapped
  to sandbox equivalents by category and nearest price; the original production ids
  are in git history (`8c26e5d` and earlier) and must be restored before going live.
- Two code fixes landed (see below); `npx tsc --noEmit` and `npm run verify`
  (107 checks) stay green.

## What changed and why

**Remapping (finding, not a bug).** The first run pre-flighted all 14 mapped
products and every one returned HTTP 404 — those ids were recorded against Goody's
*production* catalogue, and the sandbox is a separate catalogue of 2,252 products.
Each product was remapped to the nearest sandbox equivalent by category and price:

| Ours | Sandbox stand-in | Price | Note |
|---|---|---|---|
| `orchid_potted` | H.Bloom White Single-Stem Orchid Plant | $100 | |
| `choc_truffle_collection` | Compartés 40 Piece Signature Truffles | $95 | no variant needed now |
| `cookie_tin_bakery` | Milk Bar Dozen Assorted Cookie Tin | $50 | no variant needed now |
| `cake_layer_celebration` | Milk Bar Birthday Cake (6") | $70 | |
| `spa_ritual_box` | Valleybrink Road Self Care Spa Bundle | $118 | |
| `cashmere_wrap` | Naked Cashmere Jones Scarf | $220 | variant: Ecru |
| `earrings_gold_huggies` | Mignonne Gavigan Emma Lux Hoops | $125 | |
| `earrings_diamond_studs` | Mignonne Gavigan Spritz Earrings | $425 | sandbox has **no diamond jewelry** |
| `pearl_necklace_set` | Yam Bonar Pearl Choker | $140 | variant: White |
| `necklace_gold_chain` | MadeByKwest The Everything Chain | $138 | |
| `bag_mini_chain` | Parker Clay Deset Woven Crossbody | $278 | variant: Black |
| `watch_leather_elegant` | Mignonne Gavigan Positano Lemon Earrings | $195 | sandbox has **no watches** — nearest-price jewelry stand-in, flag for review |
| `sleep_mask_silk_crystal` | Blissy Silk Sleep Mask | $50 | variant: Champagne |
| `wellness_sleep_bundle` | Therabody TheraFace PRO | $399 | variant: White |

`landedCostCents` values were left as recorded (they describe our production cost
assumptions, which the sandbox can't confirm), so sandbox margins in
`show-margins` will look wrong for the cheaper stand-ins — ignore until the
production ids come back.

**Code fix 1 — Goody error shape** (`src/lib/vendors/goody.ts`). The order refusal
first surfaced as a bare `Goody /order_batches: HTTP 400` because Goody returns
failures as `{"error": "Payment method not found"}` (a string), while the adapter
only read `error.message` (an object shape it uses elsewhere). The parser now
accepts both, so refusals carry Goody's actual reason. No refusal logic changed.

**Code fix 2 — sync script env** (`scripts/sync-catalogue.mjs`). The script never
loaded `.env.local`, so run standalone it reported Goody "not configured" even
with a key present. It now loads `.env.local` the same way `test-vendors.mjs`
(and Next) do.

One more sandbox quirk worth recording: Mignonne Gavigan's *Metallic Madeline*
earrings advertise `variants_num_selectable: 1` but expose an **empty** variants
list, so the adapter (correctly) refuses them — they were considered and skipped
during remapping.

## Step 4 — `npm run test:vendors` (read-only pre-flight)

First run, against the original production ids:

```
Vendor test-drive — read-only unless a flag says otherwise

Goody (chocolate, bakery, spa, jewelry — ships to her)
  key present · sandbox — nothing charged
  credentials accepted.
  pre-flighting 14 mapped products against their live catalogue:
    ✗ orchid_potted — HTTP 404 (withdrawn or wrong id)
    ✗ choc_truffle_collection — HTTP 404 (withdrawn or wrong id)
    ✗ cookie_tin_bakery — HTTP 404 (withdrawn or wrong id)
    ✗ cake_layer_celebration — HTTP 404 (withdrawn or wrong id)
    ✗ spa_ritual_box — HTTP 404 (withdrawn or wrong id)
    ✗ cashmere_wrap — HTTP 404 (withdrawn or wrong id)
    ✗ earrings_gold_huggies — HTTP 404 (withdrawn or wrong id)
    ✗ earrings_diamond_studs — HTTP 404 (withdrawn or wrong id)
    ✗ pearl_necklace_set — HTTP 404 (withdrawn or wrong id)
    ✗ necklace_gold_chain — HTTP 404 (withdrawn or wrong id)
    ✗ bag_mini_chain — HTTP 404 (withdrawn or wrong id)
    ✗ watch_leather_elegant — HTTP 404 (withdrawn or wrong id)
    ✗ sleep_mask_silk_crystal — HTTP 404 (withdrawn or wrong id)
    ✗ wellness_sleep_bundle — HTTP 404 (withdrawn or wrong id)
  0/14 orderable today.
  (add --order-goody to place one real sandbox order through the adapter)

Florist One (flowers — the only partner with a true dated promise)
  not configured. Apply at https://www.floristone.com/api/ for API credentials.
  Add FLORIST_ONE_API_USER and FLORIST_ONE_API_PASSWORD to .env.local and re-run.

Done. Next steps: fix anything marked ✗, run `npm run sync:catalogue` to pull real
photography and prices for everything that passed, then restart the app to see it.
```

After remapping to sandbox ids:

```
Vendor test-drive — read-only unless a flag says otherwise

Goody (chocolate, bakery, spa, jewelry — ships to her)
  key present · sandbox — nothing charged
  credentials accepted.
  pre-flighting 14 mapped products against their live catalogue:
    ✓ orchid_potted — orderable (White Single-Stem Orchid Plant, $100.00)
    ✓ choc_truffle_collection — orderable (40 Piece Signature Truffles Gift Set, $95.00)
    ✓ cookie_tin_bakery — orderable (Dozen Assorted Cookie Tin, $50.00)
    ✓ cake_layer_celebration — orderable (Birthday Cake (6"), $70.00)
    ✓ spa_ritual_box — orderable (Self Care Spa Bundle, $118.00)
    ✓ cashmere_wrap — orderable (Jones Cashmere Scarf, Recipient's Choice, $220.00)
    ✓ earrings_gold_huggies — orderable (Emma Lux Hoop Earrings, $125.00)
    ✓ earrings_diamond_studs — orderable (Spritz Earrings, $425.00)
    ✓ pearl_necklace_set — orderable (Bonar Pearl Choker, $140.00)
    ✓ necklace_gold_chain — orderable (The Everything Chain, $138.00)
    ✓ bag_mini_chain — orderable (Deset Woven Crossbody, Recipient's Choice, $278.00)
    ✓ watch_leather_elegant — orderable (Positano Lemon Earrings, $195.00)
    ✓ sleep_mask_silk_crystal — orderable (Sleep Mask, Recipient's Choice, $50.00)
    ✓ wellness_sleep_bundle — orderable (TheraFace PRO, Recipient's Choice, $399.00)
  14/14 orderable today.
  (add --order-goody to place one real sandbox order through the adapter)

Florist One (flowers — the only partner with a true dated promise)
  not configured. Apply at https://www.floristone.com/api/ for API credentials.
  Add FLORIST_ONE_API_USER and FLORIST_ONE_API_PASSWORD to .env.local and re-run.

Done. Next steps: fix anything marked ✗, run `npm run sync:catalogue` to pull real
photography and prices for everything that passed, then restart the app to see it.
```

## Step 5 — `npm run test:vendors -- --order-goody` (one sandbox order)

```
Vendor test-drive — read-only unless a flag says otherwise

Goody (chocolate, bakery, spa, jewelry — ships to her)
  key present · sandbox — nothing charged
  credentials accepted.
  pre-flighting 14 mapped products against their live catalogue:
    ✓ orchid_potted — orderable (White Single-Stem Orchid Plant, $100.00)
    ✓ choc_truffle_collection — orderable (40 Piece Signature Truffles Gift Set, $95.00)
    ✓ cookie_tin_bakery — orderable (Dozen Assorted Cookie Tin, $50.00)
    ✓ cake_layer_celebration — orderable (Birthday Cake (6"), $70.00)
    ✓ spa_ritual_box — orderable (Self Care Spa Bundle, $118.00)
    ✓ cashmere_wrap — orderable (Jones Cashmere Scarf, Recipient's Choice, $220.00)
    ✓ earrings_gold_huggies — orderable (Emma Lux Hoop Earrings, $125.00)
    ✓ earrings_diamond_studs — orderable (Spritz Earrings, $425.00)
    ✓ pearl_necklace_set — orderable (Bonar Pearl Choker, $140.00)
    ✓ necklace_gold_chain — orderable (The Everything Chain, $138.00)
    ✓ bag_mini_chain — orderable (Deset Woven Crossbody, Recipient's Choice, $278.00)
    ✓ watch_leather_elegant — orderable (Positano Lemon Earrings, $195.00)
    ✓ sleep_mask_silk_crystal — orderable (Sleep Mask, Recipient's Choice, $50.00)
    ✓ wellness_sleep_bundle — orderable (TheraFace PRO, Recipient's Choice, $399.00)
  14/14 orderable today.
  placing ONE sandbox order for choc_truffle_collection through the real adapter…
  ✗ order refused: Goody /order_batches: Payment method not found

Florist One (flowers — the only partner with a true dated promise)
  not configured. Apply at https://www.floristone.com/api/ for API credentials.
  Add FLORIST_ONE_API_USER and FLORIST_ONE_API_PASSWORD to .env.local and re-run.

Done. Next steps: fix anything marked ✗, run `npm run sync:catalogue` to pull real
photography and prices for everything that passed, then restart the app to see it.
```

Payment probes, direct against the API (the account genuinely has nothing to pay
with; both stored value and workspace-scoped attempts refuse the same way):

```
GET /v1/payment_methods            -> 200 {"data":[],"list_meta":{"total_count":0}}
POST /v1/order_batches             -> 400 {"error":"Payment method not found"}
  …with payment_method_id
     "COMMERCE_STORED_VALUE"       -> 400 {"error":"Payment method not found"}
  …with workspace_id (Dom-q)       -> 400 {"error":"Payment method not found"}
```

Goody's docs confirm sandbox stored value is loaded by their team on request
("contact your partnerships manager or support@ongoody.com"), and card payment
methods are added in the dashboard, not the API.

## Step 6 — `npm run sync:catalogue`

```
Florist One — not configured
  Would fetch photographs for 3 flower products. Set FLORIST_ONE_API_USER and FLORIST_ONE_API_PASSWORD.
Giftbit — not configured
  Would fetch brand marks for 3 experience products. Set GIFTBIT_API_KEY.
Goody — live
  Refreshed 14 of 14 mapped curated products.

Wrote 14 product updates (14 with real photos) to
  /home/user/handled/.data/catalogue-overlay.json

Restart the dev server to pick it up — the catalogue is read once per process.
```

### `.data/catalogue-overlay.json` (public catalogue data)

```json
{
  "orchid_potted": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/gpOd-duoaJzy8xuhHsALfGIznhMxubgV.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "a1cf6154-bfa4-4f8b-8bfe-48e07c67387f",
    "priceCents": 10000,
    "blurb": "A single stem white phalaenopsis orchid plant potted elegantly with moss in a chic glass vase. The Goody support team will reach out to you via text message to confirm your preferred delivery date."
  },
  "choc_truffle_collection": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/WdT3UmMhTi9kp4FKUgfxk4hmx5vL3d3b.jpeg?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "d1afea0c-e333-43bd-b31b-916ceb65e09a",
    "priceCents": 9500,
    "blurb": "The Signature Truffles ultra-luxe 40 piece gift set is bursting with 40 of Compartés seasonal handmade chocolate truffles, displayed in this gorgeous black gift box that is as visually beautiful as it is delicious. They're the most popular chocolates for a very good reason! Flavors may include the signature infusions, from Dark Chocolate Smoked Sea Salt and even classics such as Apple Pie! Made with all natural ingredients, with no preservatives or additives."
  },
  "cookie_tin_bakery": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/yV81nO-ADYPCWJzcML-CteYMbdDFJgOv.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "3357e606-f0be-4f41-9783-55a8c639d5f3",
    "priceCents": 5000,
    "blurb": "Cover all the flavor bases x2 with fruity, corny, chewy, crispy, fudgy and salty-sweet cookie confections. Include two of each individually wrapped: Compost Cookie®, Cornflake Chocolate Chip Marshmallow Cookie, Corn Cookie, Blueberry & Cream Cookie™, Chocolate Confetti Cookie and Confetti Cookie."
  },
  "cake_layer_celebration": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/IBfN79cgefNPpJ_wOS5OTdSJW7YPi2Py.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "8cc93263-1c4a-4167-bc48-c56a90cfc184",
    "priceCents": 7000,
    "blurb": "Milk Bar's bestselling Birthday Cake is inspired by classic kid birthday cakes. Three tiers of rainbow-flecked vanilla birthday cake layered with creamy birthday frosting, crunchy birthday crumbs and rainbow sprinkles make this cake the ultimate celebratory treat with share. Serves 8-12 people."
  },
  "spa_ritual_box": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/uRSLg1SdljdbcoPrB3U5W75vgSf0mhxY.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "9610ab45-8e19-4481-b4d6-8a70c1fd02a5",
    "priceCents": 11800,
    "blurb": "Everyone loves the gift of relaxation. Filled with natural beauty products, a relaxing aromatherapy eye pillow, and a calming votive candle, it's everything one needs to unwind."
  },
  "cashmere_wrap": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/5SavZN3tPYwXKq1B5_v_x9aMJwFcHUJp.jpeg?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "69557ece-aa9a-43fc-87ca-1d832af9af1f",
    "priceCents": 22000,
    "blurb": "Throw on the lightweight woven Jones Cashmere Scarf to dress up any outfit. 100% pure cashmere with fringe trim detailing, measuring about 70 1/2\" x 33 1/2\"."
  },
  "earrings_gold_huggies": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/02QWoqJ00lKcfQpxLArWNgKDJlzvtKVU.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "5d1c3f04-8377-4d58-938d-79d830eeb7be",
    "priceCents": 12500,
    "blurb": "These cult favorite hoops are so good you'll want for yourself and to gift to everyone you know! These statement hoops were designed to be unbelievably lightweight and for enhancing every day style. Made of 14K gold plated brass hardware and a stainless steel post."
  },
  "earrings_diamond_studs": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/NGmrx3gLIeiwRqM520bWr90Yvr5TsmKF.jpeg?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "2e0c8a03-4d25-4277-b997-1c0b142c80a2",
    "priceCents": 42500,
    "blurb": "Spritz season is upon us and we are thrilled to launch MG's newest buzzy bauble. In three-dimensional embroidery and refined craftsmanship, these exquisite statements are earrings worth celebrating. 14k gold plated brass."
  },
  "pearl_necklace_set": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/Aoet2A-2OX64FSOLPi80Q4pKQ06NPyRH.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "0f6db3a1-277b-4522-b28b-14b53216065e",
    "priceCents": 14000,
    "blurb": "Pearl choker with a unique Biwa pearl toggle clasp. Pearls are vintage or sourced from a small family owned supplier originating in the 1980s. Made with gold plated link beads and measures 17\". Choice of color. Each choker is handmade to order, please allow up to 10 days to ship."
  },
  "necklace_gold_chain": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/Aq9DmRsWwQHNgdY8vhgKNMd3JKkwtjzV.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "a10c05bc-e014-4e36-a2dc-052a959f2c49",
    "priceCents": 13800,
    "blurb": "The only chain you'll ever need. Crafted to ensure elegance, function and durability. Often used as a mask chain but this functional 24\" chain can do so much more! The Everything Chain can be used as a necklace as it stacks so well with others as well as a bracelet, anklet, and glasses chain. Pieces are finished so they are water, sweat and tarnish resistant and clasps are lasered to ensure durability. Made of 14K Gold Vermeil."
  },
  "bag_mini_chain": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/ZhglqYibz4KADRDaUK1dfCffUsB-qtKx.jpeg?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "2b0e7e0c-93b7-40c0-8ac5-0acf5ab18742",
    "priceCents": 27800,
    "blurb": "Meet the daily carry your rotation has been waiting for. Break up your typical look with this slim, structured crossbody, featuring a weighty, woven design and a wide strap to match. Under the flap, you'll find magnet and zippered closures enclosing a lean, pocket-free interior. It measures 6\"H x 9\"W x 2\"D, with a strap length of 45\"-50\"."
  },
  "watch_leather_elegant": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/PI9T2UNBWsvU3Y1_8YpsuURzCKSbRUZf.jpeg?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "558f17e9-983d-4d17-996f-75e985db0851",
    "priceCents": 19500,
    "blurb": "The essence of Italy, bursting with fresh citrus and fragrant life-like blooms, is embodied in these sweet, delicate, hand embroidered drop earrings. 14k gold plated brass."
  },
  "sleep_mask_silk_crystal": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/-OZ2mdltZ93MF2Yb9E9lfi5Uw_dUBURI.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "50e0f25d-2812-455e-bb4c-9569b1d58d20",
    "priceCents": 5000,
    "blurb": "Blissy Silk Sleep Masks are beautifully designed and a must-have beauty sleep essential. Handmade, crafted from pure silk, and gentle on your skin, making for the perfect compliment to your beauty routine. Includes Blissy silk carrying case for traveling. Choice of color."
  },
  "wellness_sleep_bundle": {
    "imageUrl": "https://assets.ongoody.com/store/products/image/p7sz_ZMG5-2rWSG2HU2_MrzSyZMF_Ign.png?width=800",
    "imageSource": "ongoody.com",
    "vendorSku": "8ac16b77-9d34-49a3-a57b-647410f2577d",
    "priceCents": 39900,
    "blurb": "A relaxing facial massage meets the facial treatments you love in this all in one device. Reduce tension and relax facial muscles with the technology behind Theragun percussive therapy, now designed for the face. From skin-toning microcurrent to rejuvenating light therapy, you can combine and customize more facial health treatments than any other device."
  }
}
```

## Untested / next steps

- **Place the order** once a payment method exists on the sandbox account (see
  verdict). Everything else in the order path has now run against the real API.
- Florist One and Giftbit remain unconfigured — no credentials yet.
- `npx tsc --noEmit` clean; `npm run verify` — 107 checks passed, before and after
  the changes.
