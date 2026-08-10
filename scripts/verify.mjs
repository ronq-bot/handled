/**
 * End-to-end check of the parts that are hard to click through: calendar math,
 * the picker's hard rules, and the dispatcher's state machine across a fake year.
 *
 *   node scripts/verify.mjs
 *
 * Uses a throwaway database so it never touches .data/handled.db.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

process.env.HANDLED_DATA_DIR = mkdtempSync(path.join(tmpdir(), "handled-verify-"));

const { register } = await import("node:module");
register("./ts-loader.mjs", import.meta.url);

const { addDays, nextAnniversary, previousBusinessDay, daysBetween } = await import(
  "../src/lib/date.ts"
);
const { planDelivery, dogHouseRisk } = await import("../src/lib/scheduling.ts");
const { autoPick, rankGifts } = await import("../src/lib/picker.ts");
const { getProduct } = await import("../src/lib/catalog.ts");

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

console.log("\ncalendar math");

check("next anniversary rolls into the following year once the date passes", () => {
  assert.equal(nextAnniversary("2020-08-20", "2026-07-28"), "2026-08-20");
  assert.equal(nextAnniversary("2020-01-14", "2026-07-28"), "2027-01-14");
});

check("Feb 29 clamps to Feb 28 in a non-leap year", () => {
  assert.equal(nextAnniversary("2024-02-29", "2026-03-01"), "2027-02-28");
});

check("previousBusinessDay pulls a weekend back to Friday", () => {
  assert.equal(previousBusinessDay("2026-08-22"), "2026-08-21"); // Sat -> Fri
  assert.equal(previousBusinessDay("2026-08-23"), "2026-08-21"); // Sun -> Fri
  assert.equal(previousBusinessDay("2026-08-20"), "2026-08-20"); // Thu unchanged
});

check("date math does not drift across a DST boundary", () => {
  assert.equal(addDays("2026-03-07", 1), "2026-03-08");
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
});

console.log("\ndelivery planning");

const workAddress = { kind: "work", weekdays_only: 1 };
const homeAddress = { kind: "home", weekdays_only: 0 };
const bouquet = getProduct("bouquet_garden_seasonal");
const fruit = getProduct("fruit_bouquet_celebration");
const engraved = getProduct("bracelet_engraved");

check("ship date backs off the delivery date by the vendor's lead time", () => {
  const plan = planDelivery("2026-08-20", bouquet, workAddress, "2026-07-28");
  assert.equal(plan.deliverOn, "2026-08-20");
  assert.equal(plan.shipOn, "2026-08-18");
  assert.equal(plan.shifted, false);
  assert.equal(plan.tooLate, false);
});

check("a weekend office delivery shifts to the Friday before", () => {
  const plan = planDelivery("2026-08-22", bouquet, workAddress, "2026-07-28");
  assert.equal(plan.deliverOn, "2026-08-21");
  assert.equal(plan.shifted, true);
  assert.match(plan.shiftReason, /weekend/);
});

check("a weekend home delivery is left alone", () => {
  const plan = planDelivery("2026-08-22", fruit, homeAddress, "2026-07-28");
  assert.equal(plan.deliverOn, "2026-08-22");
  assert.equal(plan.shifted, false);
});

check("a long-lead personalized item is flagged too late when the runway is gone", () => {
  const plan = planDelivery("2026-08-01", engraved, homeAddress, "2026-07-28");
  assert.equal(plan.tooLate, true);
  assert.match(plan.lateReason, /lead time/);
});

console.log("\ngift selection");

const dana = {
  id: "r1",
  user_id: "u1",
  name: "Dana",
  relationship: "wife",
  likes: "peonies, strawberries, lavender",
  dislikes: "lilies",
  allergies: "nuts",
  notes: "",
  created_at: "",
};

check("nut allergies hard-block every product containing nuts", () => {
  const ranked = rankGifts({
    recipient: dana,
    address: homeAddress,
    occasionKind: "birthday",
    budgetCents: 35000,
  });
  assert.equal(
    ranked.some((r) => r.product.allergens.includes("nuts")),
    false,
  );
});

check("alcohol never goes to an office address", () => {
  const ranked = rankGifts({
    recipient: dana,
    address: workAddress,
    occasionKind: "anniversary",
    budgetCents: 35000,
  });
  assert.equal(
    ranked.some((r) => !r.product.workFriendly),
    false,
  );
});

check("the budget ceiling is respected", () => {
  const ranked = rankGifts({
    recipient: dana,
    address: homeAddress,
    occasionKind: "birthday",
    budgetCents: 6000,
  });
  assert.equal(
    ranked.every((r) => r.product.priceCents <= 6000),
    true,
  );
});

check("auto-pilot picks a liked, occasion-appropriate gift", () => {
  const pick = autoPick({
    recipient: dana,
    address: workAddress,
    occasionKind: "birthday",
    budgetCents: 12000,
  });
  assert.ok(pick);
  assert.equal(pick.product.goodFor.includes("birthday"), true);
  assert.equal(pick.product.workFriendly, true);
});

check("auto-pilot does not repeat the most recent gift", () => {
  const first = autoPick({
    recipient: dana,
    address: workAddress,
    occasionKind: "birthday",
    budgetCents: 12000,
  });
  const second = autoPick({
    recipient: dana,
    address: workAddress,
    occasionKind: "birthday",
    budgetCents: 12000,
    recentProductIds: [first.product.id],
  });
  assert.notEqual(second.product.id, first.product.id);
});

check("an experience gift says plainly that it comes to him, not to her", () => {
  const pick = rankGifts({
    recipient: dana,
    address: homeAddress,
    occasionKind: "anniversary",
    budgetCents: 35000,
  }).find((r) => r.product.category === "experience");

  assert.ok(pick, "expected an experience gift in range");
  assert.equal(pick.warnings.some((w) => /never contacted/i.test(w)), true);
});

check("an impossible budget returns null rather than a bad gift", () => {
  const pick = autoPick({
    recipient: dana,
    address: homeAddress,
    occasionKind: "birthday",
    budgetCents: 1000,
  });
  assert.equal(pick, null);
});

console.log("\nrisk scoring");

check("everything covered and paid for scores clear", () => {
  const risk = dogHouseRisk({
    uncoveredOccasions: [],
    missionsNeedingAttention: 0,
    paymentOk: true,
    totalOccasions: 3,
  });
  assert.equal(risk.level, "clear");
  assert.equal(risk.score, 0);
});

check("an imminent uncovered date is critical", () => {
  const risk = dogHouseRisk({
    uncoveredOccasions: [{ title: "Her birthday", daysAway: 5 }],
    missionsNeedingAttention: 1,
    paymentOk: false,
    totalOccasions: 2,
  });
  assert.equal(risk.level, "critical");
  assert.equal(risk.score > 65, true);
});

console.log("\ndispatcher");

const { getDb, newId, nowIso, toPositional, sslFor } = await import("../src/lib/db.ts");
const db = await getDb();
const { runDispatch } = await import("../src/lib/dispatcher.ts");

async function seed({ paymentOk = 1, productId = "bouquet_garden_seasonal", postal = "28203" } = {}) {
  const userId = newId("usr");
  const recipientId = newId("rcp");
  const addressId = newId("adr");
  const occasionId = newId("occ");
  const missionId = newId("msn");

  await db.run(`INSERT INTO users (id, email, password_hash, name, payment_ok, created_at) VALUES (?, ?, 'x', 'Mike', ?, ?)`, [userId, `${userId}@example.com`, paymentOk, nowIso()]);
  await db.run(`INSERT INTO recipients (id, user_id, name, created_at) VALUES (?, ?, 'Dana', ?)`, [recipientId, userId, nowIso()]);
  await db.run(`INSERT INTO addresses (id, user_id, recipient_id, kind, line1, city, state, postal_code, created_at)
     VALUES (?, ?, ?, 'work', '1900 Trade St', 'Charlotte', 'NC', ?, ?)`, [addressId, userId, recipientId, postal, nowIso()]);
  await db.run(`INSERT INTO occasions (id, user_id, recipient_id, kind, title, event_date, created_at)
     VALUES (?, ?, ?, 'birthday', 'Birthday', '2026-08-20', ?)`, [occasionId, userId, recipientId, nowIso()]);
  await db.run(`INSERT INTO missions (id, user_id, occasion_id, recipient_id, address_id, product_id,
       deliver_on, ship_on, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '2026-08-20', '2026-08-18', ?, ?)`, [missionId, userId, occasionId, recipientId, addressId, productId, nowIso(), nowIso()]);

  return missionId;
}

const status = async (id) => (await db.get(`SELECT status FROM missions WHERE id = ?`, [id])).status;

{
  const id = await seed();
  await runDispatch("2026-08-17");
  assert.equal(await status(id), "scheduled");
  passed += 1;
  console.log("  ok  nothing is placed before the ship date");
}

{
  const id = await seed();
  await runDispatch("2026-08-18");
  assert.equal(await status(id), "placed");
  const ref = await db.get(`SELECT vendor_order_ref FROM missions WHERE id = ?`, [id]);
  assert.match(ref.vendor_order_ref, /^PETA-/);
  passed += 1;
  console.log("  ok  the order is placed on the ship date with a vendor reference");
}

{
  const id = await seed();
  await runDispatch("2026-08-18");
  await runDispatch("2026-08-18");
  const events = await db.get(
    `SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ? AND status = 'placed'`,
    [id],
  );
  assert.equal(Number(events.n), 1);
  passed += 1;
  console.log("  ok  re-running the same day is idempotent");
}

{
  const id = await seed();
  await runDispatch("2026-08-18");
  await runDispatch("2026-08-20");
  assert.equal(await status(id), "shipped");
  await runDispatch("2026-08-21");
  assert.equal(await status(id), "delivered");
  passed += 1;
  console.log("  ok  placed -> shipped -> delivered advances on the right days");
}

{
  const id = await seed({ paymentOk: 0 });
  await runDispatch("2026-08-18");
  assert.equal(await status(id), "failed");
  const row = await db.get(`SELECT failure_reason FROM missions WHERE id = ?`, [id]);
  assert.match(row.failure_reason, /payment/i);
  passed += 1;
  console.log("  ok  a missing payment method fails loudly instead of silently");
}

{
  const id = await seed({ productId: "wine_duo_reserve" });
  await runDispatch("2026-08-18");
  assert.equal(await status(id), "failed");
  const row = await db.get(`SELECT failure_reason FROM missions WHERE id = ?`, [id]);
  assert.match(row.failure_reason, /alcohol/i);
  passed += 1;
  console.log("  ok  the vendor rejects alcohol bound for a business address");
}

{
  const id = await seed({ postal: "2820" });
  await runDispatch("2026-08-18");
  assert.equal(await status(id), "failed");
  passed += 1;
  console.log("  ok  a malformed postal code fails before anyone is disappointed");
}

{
  const id = await seed();
  await runDispatch("2026-08-14");
  const events = await db.get(
    `SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ? AND status = 'reminder'`,
    [id],
  );
  assert.equal(Number(events.n), 0);
  passed += 1;
  console.log("  ok  no reminder yet when the ship date is more than 3 days out");
}

{
  const id = await seed();
  const report = await runDispatch("2026-08-16");
  assert.equal(report.reminded.includes(id), true);
  const events = await db.get(
    `SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ? AND status = 'reminder'`,
    [id],
  );
  assert.equal(Number(events.n), 1);
  assert.equal(await status(id), "scheduled");
  passed += 1;
  console.log("  ok  a reminder fires 3 days ahead of the ship date, without touching status");
}

{
  const id = await seed();
  await runDispatch("2026-08-16");
  await runDispatch("2026-08-17");
  const events = await db.get(
    `SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ? AND status = 'reminder'`,
    [id],
  );
  assert.equal(Number(events.n), 1);
  passed += 1;
  console.log("  ok  the reminder is sent once, not once per day it stays scheduled");
}

{
  const id = await seed();
  await runDispatch("2026-08-18");
  const events = await db.get(
    `SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ? AND status = 'reminder'`,
    [id],
  );
  assert.equal(Number(events.n), 0);
  passed += 1;
  console.log("  ok  no reminder on the ship day itself — that's what the order-placed email is for");
}

console.log("\ndata layer");

check("the driver matches whether DATABASE_URL is set", () => {
  assert.equal(db.dialect, process.env.DATABASE_URL ? "postgres" : "sqlite");
});

check("TLS is off for a local Postgres and relaxed for a hosted one", () => {
  assert.equal(sslFor("postgresql://u@localhost:5432/db"), false);
  assert.equal(sslFor("postgresql://u@127.0.0.1:5432/db"), false);
  assert.equal(sslFor("postgresql://u@[::1]:5432/db"), false);
  assert.deepEqual(sslFor("postgresql://u:p@ep-x.neon.tech/db"), { rejectUnauthorized: false });
});

check("an explicit sslmode in the URL is left for pg to honour", () => {
  assert.equal(sslFor("postgresql://u@host/db?sslmode=require"), undefined);
  assert.equal(sslFor("postgresql://u@host/db?sslmode=disable"), undefined);
});

check("placeholders convert to Postgres positional form", () => {
  assert.equal(toPositional("SELECT * FROM t WHERE a = ? AND b = ?"),
               "SELECT * FROM t WHERE a = $1 AND b = $2");
});

check("a question mark inside a string literal is left alone", () => {
  assert.equal(toPositional("SELECT * FROM t WHERE note = 'why?' AND id = ?"),
               "SELECT * FROM t WHERE note = 'why?' AND id = $1");
});

check("conversion is stable across many parameters", () => {
  const sql = "INSERT INTO t VALUES (" + Array(12).fill("?").join(", ") + ")";
  assert.match(toPositional(sql), /\$1, \$2, .*\$12\)$/);
});

console.log("\nfulfilment coverage");

const { COVERAGE, coverageWithStatus, coverageSummary } = await import("../src/lib/fulfilment-map.ts");
const { PRODUCTS: ALL_PRODUCTS, VENDORS: ALL_VENDORS } = await import("../src/lib/catalog.ts");

check("every catalogue vendor has a real-world partner mapped", () => {
  const mapped = new Set(COVERAGE.map((c) => c.vendorId));
  for (const id of Object.keys(ALL_VENDORS)) {
    assert.ok(mapped.has(id), `${id} has no entry in the coverage map`);
  }
});

check("the coverage map accounts for every product exactly once", () => {
  const counted = coverageWithStatus().reduce((n, r) => n + r.productCount, 0);
  assert.equal(counted, ALL_PRODUCTS.length);
});

check("every partner marked automated has an adapter behind it", () => {
  const live = COVERAGE.filter((c) => c.readiness === "live").map((c) => c.partner).sort();
  assert.deepEqual(live, ["Florist One", "Giftbit", "Goody", "Goody"]);
});

check("nothing claims to be dispatching without credentials", () => {
  // Only meaningful when the environment really has no keys. A developer with
  // a sandbox key in .env.local should see this adapt rather than fail with a
  // message about a bug that isn't there.
  const configured = coverageWithStatus().filter((r) => r.credentialsPresent);
  if (configured.length === 0) {
    assert.equal(coverageSummary().dispatchingNow, 0);
  } else {
    assert.equal(coverageSummary().dispatchingNow > 0, true);
  }
});

check("every automated partner has a credential check wired to it", () => {
  // Without this, a slot can be marked live while its check silently returns
  // false, so the page shows "Automated now" and never "Dispatching" no
  // matter what is configured. That regression shipped once already.
  const { GOODY_API_KEY, FLORIST_ONE_API_USER, FLORIST_ONE_API_PASSWORD, GIFTBIT_API_KEY } =
    process.env;
  const anyConfigured = Boolean(
    GOODY_API_KEY || GIFTBIT_API_KEY || (FLORIST_ONE_API_USER && FLORIST_ONE_API_PASSWORD),
  );
  // With no keys present every live row must read false — and crucially the
  // property has to exist, which a missing map entry would still satisfy. So
  // assert the shape too.
  for (const row of coverageWithStatus().filter((r) => r.readiness === "live")) {
    assert.equal(typeof row.credentialsPresent, "boolean", `${row.partner} has no credential check`);
    if (!anyConfigured) assert.equal(row.credentialsPresent, false);
  }
});

check("every partner states a date guarantee and a gap", () => {
  for (const c of COVERAGE) {
    assert.ok(c.dateGuarantee.length > 20, `${c.partner} has no date guarantee`);
    assert.ok(c.gap.length > 20, `${c.partner} has no stated gap`);
    assert.match(c.url, /^https:\/\//);
  }
});

console.log("\nflorist one adapter — never book an unconfirmed date");

const { floristOneAdapter, floristOneIsLive, normaliseDate, parseDeliveryDates } = await import(
  "../src/lib/vendors/florist-one.ts"
);

const flowerOrder = {
  mission: { id: "msn_f", deliver_on: "2026-08-20", gift_message: "x" },
  product: { id: "bouquet_garden_seasonal", name: "Seasonal Garden Bouquet", priceCents: 7400, vendorSku: "F1-123" },
  recipient: { name: "Dana Ruiz" },
  address: { line1: "1 Main St", line2: "", city: "Charlotte", state: "NC", postal_code: "28202", country: "US" },
  buyer: { name: "Mike Ruiz", email: "mike@example.com" },
};

check("florist one stays dormant without credentials", () => {
  assert.equal(floristOneIsLive(), false);
});

{
  const result = await floristOneAdapter.placeOrder(flowerOrder);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not configured/i);
  passed += 1;
  console.log("  ok  without credentials it fails on configuration, not on data");
}

{
  // The product code is the only handle they have on the order. Our internal
  // id means nothing to them, so a product without a SKU must be refused
  // rather than sent and hoped for.
  const noSku = { ...flowerOrder, product: { ...flowerOrder.product, vendorSku: undefined } };
  const result = await floristOneAdapter.placeOrder(noSku);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no florist one product code/i);
  passed += 1;
  console.log("  ok  a product with no vendor SKU is refused before any network call");
}

check("their MM/DD/YYYY dates become ours", () => {
  assert.equal(normaliseDate("08/20/2026"), "2026-08-20");
  assert.equal(normaliseDate("2026-08-20"), "2026-08-20");
});

check("a day-first date is rejected rather than becoming an impossible one", () => {
  // 20/08/2026 read as MM/DD gives month 20. It has the right shape and would
  // survive a naive parse, then never match anything.
  assert.equal(normaliseDate("20/08/2026"), null);
  assert.equal(normaliseDate("08/32/2026"), null);
  assert.equal(normaliseDate("tomorrow"), null);
});

check("an unreadable date list throws instead of looking like no availability", () => {
  // Parsing failures used to collapse to an empty array, which read as "they
  // serve nothing there" — and, before this change, as permission to order.
  assert.throws(() => parseDeliveryDates(["20/08/2026", "tomorrow"]), /unrecognised format/);
});

check("an genuinely empty calendar is not an error", () => {
  assert.deepEqual(parseDeliveryDates([]), []);
});

check("readable dates survive alongside unreadable ones", () => {
  assert.deepEqual(parseDeliveryDates(["08/20/2026", "junk"]), ["2026-08-20"]);
});

console.log("\ngiftbit adapter — the surprise invariant");

const { giftbitAdapter, giftbitIsLive, campaignBody } = await import("../src/lib/vendors/giftbit.ts");

const order = {
  mission: { id: "msn_x", gift_message: "" },
  product: { priceCents: 29000, name: "Spa Day for Two" },
  recipient: { name: "Dana Ruiz" },
  address: { city: "Charlotte", line1: "412 Rosewood Ln" },
  buyer: { name: "Mike Ruiz", email: "mike@example.com" },
};

check("giftbit stays dormant without a key", () => {
  assert.equal(giftbitIsLive(), false);
});

check("the credit is addressed to the buyer, never the recipient", () => {
  const body = campaignBody(order, ["amazonus"]);
  assert.equal(body.contacts.length, 1);
  assert.equal(body.contacts[0].email, "mike@example.com");
  assert.equal(body.contacts[0].firstname, "Mike");
});

check("no recipient contact detail can leak into the payload", () => {
  // Whole-payload sweep: her address and any address-shaped string must be absent.
  const serialised = JSON.stringify(campaignBody(order, ["amazonus"]));
  assert.equal(/412 Rosewood/.test(serialised), false);
  assert.equal(/@/.test(serialised.replace("mike@example.com", "")), false);
});

check("her name may appear only as a reference for him, not as a contact", () => {
  const body = campaignBody(order, ["amazonus"]);
  assert.match(body.subject, /Dana/);
  assert.equal(JSON.stringify(body.contacts).includes("Dana"), false);
});

check("the recipient record has no contact route at all", () => {
  assert.equal("email" in dana, false, "recipients must not carry an email address");
});

{
  const result = await giftbitAdapter.placeOrder(order);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not configured/i);
  passed += 1;
  console.log("  ok  without a key it fails on configuration, not on data");
}

{
  const noBuyerEmail = { ...order, buyer: { name: "Mike", email: "  " } };
  const result = await giftbitAdapter.placeOrder(noBuyerEmail);
  assert.equal(result.ok, false);
  assert.match(result.reason, /your account has no email/i);
  passed += 1;
  console.log("  ok  a buyer with no email fails before any network call");
}

console.log("\ngoody adapter — shipped to her, signed by him");

const { goodyAdapter, goodyIsLive, orderBatchBody } = await import("../src/lib/vendors/goody.ts");

const goodyOrder = {
  mission: { id: "msn_g", gift_message: "Happy birthday. — M", deliver_on: "2026-08-20" },
  product: { id: "cookie_tin_bakery", name: "Bakery Cookie Tin", priceCents: 5200, vendorSku: "abc-uuid" },
  recipient: { name: "Dana Ruiz" },
  address: { line1: "412 Rosewood Ln", line2: "Apt 3", city: "Charlotte", state: "NC", postal_code: "28202", country: "US" },
  buyer: { name: "Mike Ruiz", email: "mike@example.com" },
};

check("goody is live exactly when its key is present", () => {
  assert.equal(goodyIsLive(), Boolean(process.env.GOODY_API_KEY));
});

check("the parcel is addressed to her, and the card is signed by him", () => {
  // Goody is the one live partner that ships straight to the recipient, so
  // the two identities travel in the same payload and must not be swapped.
  const body = orderBatchBody(goodyOrder);
  assert.equal(body.from_name, "Mike Ruiz");
  assert.equal(body.recipients[0].mailing_address.address_1, "412 Rosewood Ln");
  assert.equal(body.recipients[0].first_name, "Dana");
  assert.equal(body.recipients[0].mailing_address.postal_code, "28202");
});

check("her email address is never sent, because we do not hold one", () => {
  // The surprise depends on Goody never contacting her directly.
  const serialised = JSON.stringify(orderBatchBody(goodyOrder));
  assert.equal(/@/.test(serialised), false);
});

check("the mission id is the idempotency key", () => {
  assert.equal(orderBatchBody(goodyOrder).customer_reference_id, "msn_g");
});

check("a message never travels without the card Goody requires", () => {
  // They reject a bare message with a 422, so the two move together or not
  // at all. No GOODY_CARD_ID is configured here, so neither should appear.
  const body = orderBatchBody(goodyOrder);
  assert.equal("message" in body, false);
  assert.equal("card_id" in body, false);
});

check("we never hand Goody a send date — our own dispatcher owns the timing", () => {
  assert.equal("scheduled_send_on" in orderBatchBody(goodyOrder), false);
});

{
  const result = await goodyAdapter.placeOrder(goodyOrder);
  assert.equal(result.ok, false);
  assert.match(result.reason, /not configured/i);
  passed += 1;
  console.log("  ok  without a key it fails on configuration, not on data");
}

{
  const noSku = { ...goodyOrder, product: { ...goodyOrder.product, vendorSku: undefined } };
  const result = await goodyAdapter.placeOrder(noSku);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no goody product id/i);
  passed += 1;
  console.log("  ok  a product with no Goody id is refused before any network call");
}

{
  const noStreet = { ...goodyOrder, address: { ...goodyOrder.address, line1: "  " } };
  const result = await goodyAdapter.placeOrder(noStreet);
  assert.equal(result.ok, false);
  assert.match(result.reason, /street address/i);
  passed += 1;
  console.log("  ok  an incomplete address is caught before it reaches them");
}

console.log("\nintegrations");

const { integrationStatus } = await import("../src/lib/env.ts");
const { paymentsAreLive, userCanBeCharged, chargeForMission } = await import("../src/lib/payments.ts");

check("an integration is live only when its own key is present", () => {
  const present = {
    payments: Boolean(process.env.STRIPE_SECRET_KEY),
    email: Boolean(process.env.RESEND_API_KEY),
    database: Boolean(process.env.DATABASE_URL),
    giftcards: Boolean(process.env.GIFTBIT_API_KEY),
    curatedgifts: Boolean(process.env.GOODY_API_KEY),
    florist: Boolean(process.env.FLORIST_ONE_API_USER && process.env.FLORIST_ONE_API_PASSWORD),
  };
  for (const i of integrationStatus()) {
    assert.equal(i.live, present[i.key], `${i.name} reported live=${i.live}`);
  }
});

check("each stand-in names the exact variable that turns it on", () => {
  for (const i of integrationStatus()) {
    assert.ok(i.needs.length > 0, `${i.name} is missing its env var name`);
    assert.ok(i.where.length > 0, `${i.name} is missing its sign-up hint`);
  }
});

check("payments track the Stripe key exactly", () => {
  assert.equal(paymentsAreLive(), Boolean(process.env.STRIPE_SECRET_KEY));
});

check("without Stripe, chargeability falls back to the local flag", () => {
  assert.equal(userCanBeCharged({ payment_ok: 1 }), true);
  assert.equal(userCanBeCharged({ payment_ok: 0 }), false);
});

{
  const ok = await chargeForMission({ payment_ok: 1 }, "msn_x", 7400, "test");
  assert.equal(ok.ok, true);
  const denied = await chargeForMission({ payment_ok: 0 }, "msn_y", 7400, "test");
  assert.equal(denied.ok, false);
  assert.match(denied.reason, /payment method/i);
  passed += 2;
  console.log("  ok  a local charge clears only when the flag is set");
  console.log("  ok  an unpaid account is refused with a readable reason");
}

console.log(`\n${passed} checks passed\n`);
