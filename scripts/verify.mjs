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

const { addDays, nextAnniversary, nextFixedHoliday, previousBusinessDay, daysBetween } = await import(
  "../src/lib/date.ts"
);
const { planDelivery, dogHouseRisk, isFeasible, MAX_SCHEDULE_DAYS } = await import("../src/lib/scheduling.ts");
const { autoPick, browseGifts, rankGifts } = await import("../src/lib/picker.ts");
const catalogForBrowse = await import("../src/lib/catalog.ts");
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

check("fixed holidays fill their own dates, personal ones never do", () => {
  assert.equal(nextFixedHoliday("valentines", "2026-01-10"), "2026-02-14");
  assert.equal(nextFixedHoliday("valentines", "2026-02-15"), "2027-02-14", "past → next year");
  assert.equal(nextFixedHoliday("valentines", "2026-02-14"), "2026-02-14", "the day itself counts");
  assert.equal(nextFixedHoliday("christmas", "2026-08-19"), "2026-12-25");
  // Second Sunday of May: 2026-05-10 and 2027-05-09 — both real calendar facts.
  assert.equal(nextFixedHoliday("mothers_day", "2026-01-01"), "2026-05-10");
  assert.equal(nextFixedHoliday("mothers_day", "2026-05-11"), "2027-05-09");
  assert.equal(nextFixedHoliday("birthday", "2026-01-01"), null);
});

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

check("a date beyond twelve months is refused rather than booked", () => {
  const plan = planDelivery("2027-12-01", bouquet, homeAddress, "2026-07-28");
  assert.equal(plan.tooFar, true);
  assert.match(plan.farReason, /over a year away/);
  assert.equal(isFeasible("2027-12-01", bouquet, homeAddress, "2026-07-28"), false);
});

check("a date inside twelve months is still bookable", () => {
  const plan = planDelivery("2027-07-01", bouquet, homeAddress, "2026-07-28");
  assert.equal(plan.tooFar, false);
  assert.equal(plan.farReason, "");
  assert.equal(isFeasible("2027-07-01", bouquet, homeAddress, "2026-07-28"), true);
});

check("a recurring date never trips the horizon, because it always rolls to the next one", () => {
  // The cap is aimed at one-off dates entered years out. nextAnniversary
  // always lands inside a year, so ordinary birthdays must never be blocked.
  for (const eventDate of ["2020-01-14", "2020-07-29", "2020-12-31"]) {
    const next = nextAnniversary(eventDate, "2026-07-28");
    assert.equal(planDelivery(next, bouquet, homeAddress, "2026-07-28").tooFar, false);
  }
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

check("a gift marked as a miss is never picked again for that recipient", () => {
  const first = autoPick({
    recipient: dana,
    address: workAddress,
    occasionKind: "birthday",
    budgetCents: 12000,
  });
  const after = rankGifts({
    recipient: dana,
    address: workAddress,
    occasionKind: "birthday",
    budgetCents: 12000,
    vetoProductIds: [first.product.id],
  });
  assert.equal(
    after.some((r) => r.product.id === first.product.id),
    false,
    "a vetoed product must not be ranked at all",
  );
});

check("browsing labels a vetoed product instead of hiding it", () => {
  const input = { recipient: dana, address: homeAddress, occasionKind: "birthday", budgetCents: 12000 };
  const target = rankGifts(input)[0];
  const entries = browseGifts({ ...input, vetoProductIds: [target.product.id] });
  const entry = entries.find((e) => e.product.id === target.product.id);
  assert.ok(entry, "the vetoed product must still appear in the catalogue");
  assert.match(entry.cautions.join(" "), /missed the mark/i);
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

check("browsing shows the whole catalogue, objections written out instead of hidden", () => {
  const input = { recipient: dana, address: homeAddress, occasionKind: "birthday", budgetCents: 12000 };
  const { PRODUCTS } = catalogForBrowse;
  const entries = browseGifts(input);
  assert.equal(entries.length, PRODUCTS.length, "nothing may be silently dropped");

  // Auto-Pilot's picks lead, in its own order, and carry no cautions.
  const ranked = rankGifts(input);
  assert.deepEqual(
    entries.slice(0, ranked.length).map((e) => e.product.id),
    ranked.map((r) => r.product.id),
  );
  assert.ok(entries.slice(0, ranked.length).every((e) => e.cautions.length === 0));

  // A nut allergy no longer hides the product — it labels it.
  const nutty = entries.find((e) => e.product.allergens.includes("nuts"));
  assert.ok(nutty, "products with allergens must still appear");
  assert.match(nutty.cautions.join(" "), /allergy/i);

  // Over-budget items appear too, saying so.
  const dear = entries.find((e) => e.product.priceCents > 12000);
  assert.ok(dear, "over-budget products must still appear");
  assert.match(dear.cautions.join(" "), /ceiling/i);
});

check("the catalogue search finds gifts by name, tag and category", () => {
  const input = { recipient: dana, address: homeAddress, occasionKind: "birthday", budgetCents: 12000 };
  const chocolate = browseGifts(input, "chocolate");
  assert.ok(chocolate.length > 0);
  assert.ok(
    chocolate.every(
      (e) =>
        [e.product.name, e.product.blurb, e.product.category, ...e.product.tags]
          .join(" ")
          .toLowerCase()
          .includes("chocolate"),
    ),
  );
  assert.equal(browseGifts(input, "zzzz-no-such-gift").length, 0);
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

async function seed({ paymentOk = 1, productId = "bouquet_garden_seasonal", postal = "28203", autoPilot = 1 } = {}) {
  const userId = newId("usr");
  const recipientId = newId("rcp");
  const addressId = newId("adr");
  const occasionId = newId("occ");
  const missionId = newId("msn");

  await db.run(`INSERT INTO users (id, email, password_hash, name, payment_ok, auto_pilot, created_at) VALUES (?, ?, 'x', 'Mike', ?, ?, ?)`, [userId, `${userId}@example.com`, paymentOk, autoPilot, nowIso()]);
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
  const row = await db.get(
    `SELECT price_cents, affiliate_cents FROM missions WHERE id = ?`,
    [id],
  );
  const { COVERAGE: cov } = await import("../src/lib/fulfilment-map.ts");
  const rate = cov.find((c) => c.vendorId === "petal_post").affiliateRatePct;
  assert.ok(rate > 0, "the flower partner pays a commission");
  assert.equal(row.affiliate_cents, Math.round((row.price_cents * rate) / 100));
  passed += 1;
  console.log("  ok  the partner's commission is recorded the moment the order is placed");
}

{
  // A scheduled mission already carrying a vendor reference is a previous run
  // that ordered and then died before recording the charge. The replay must
  // reuse that order, never place a second one.
  const id = await seed();
  await db.run(`UPDATE missions SET vendor_id = 'petal_post', vendor_order_ref = 'PREV-REF' WHERE id = ?`, [id]);
  await runDispatch("2026-08-18");
  const row = await db.get(`SELECT status, vendor_order_ref FROM missions WHERE id = ?`, [id]);
  assert.equal(row.status, "placed");
  assert.equal(row.vendor_order_ref, "PREV-REF", "the existing vendor order must be kept, not re-placed");
  passed += 1;
  console.log("  ok  a replay after a crash reuses the existing vendor order instead of ordering twice");
}

{
  // The user locked in a price at scheduling time; that is the price charged,
  // even if the catalogue has been re-synced to a different number since.
  const id = await seed();
  await db.run(`UPDATE missions SET price_cents = 6100 WHERE id = ?`, [id]);
  await runDispatch("2026-08-18");
  const row = await db.get(`SELECT status, price_cents FROM missions WHERE id = ?`, [id]);
  assert.equal(row.status, "placed");
  assert.equal(row.price_cents, 6100, "the charge must honour the scheduled price");
  passed += 1;
  console.log("  ok  the price the user locked in is the price that is charged");
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
  const id = await seed({ productId: "wine_duo_reserve", autoPilot: 0 });
  await runDispatch("2026-08-18");
  assert.equal(await status(id), "failed");
  const row = await db.get(`SELECT failure_reason FROM missions WHERE id = ?`, [id]);
  assert.match(row.failure_reason, /alcohol/i);
  passed += 1;
  console.log("  ok  the vendor rejects alcohol bound for a business address");
}

{
  const id = await seed({ postal: "2820", autoPilot: 0 });
  await runDispatch("2026-08-18");
  assert.equal(await status(id), "failed");
  passed += 1;
  console.log("  ok  a malformed postal code fails before anyone is disappointed");
}

{
  // Auto-Pilot ON: the same refusal becomes a rescue, not homework. The
  // mission stays scheduled, wearing a different, office-safe product.
  const id = await seed({ productId: "wine_duo_reserve", autoPilot: 1 });
  const report = await runDispatch("2026-08-18");
  assert.equal(await status(id), "scheduled");
  const row = await db.get(`SELECT product_id FROM missions WHERE id = ?`, [id]);
  assert.notEqual(row.product_id, "wine_duo_reserve");
  assert.ok(report.rescued.includes(id), "the report must list the rescue");
  const note = await db.get(
    `SELECT note FROM mission_events WHERE mission_id = ? AND note LIKE 'Auto-Pilot rescued%'`,
    [id],
  );
  assert.ok(note, "the timeline must record the rescue");
  passed += 1;
  console.log("  ok  Auto-Pilot rescues a refused product instead of filing homework");
}

{
  // Feedback closes the loop: learn what a rescue would pick, mark that
  // product a delivered miss for a fresh account, and the next rescue for
  // that recipient must steer around it.
  const probeId = await seed({ productId: "wine_duo_reserve", autoPilot: 1 });
  await runDispatch("2026-08-18");
  const wouldPick = (await db.get(`SELECT product_id FROM missions WHERE id = ?`, [probeId]))
    .product_id;

  const id = await seed({ productId: "wine_duo_reserve", autoPilot: 1 });
  const m = await db.get(`SELECT user_id, occasion_id, recipient_id, address_id FROM missions WHERE id = ?`, [id]);
  await db.run(
    `INSERT INTO missions (id, user_id, occasion_id, recipient_id, address_id, product_id,
       deliver_on, ship_on, status, feedback, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, '2026-05-01', '2026-04-29', 'delivered', 'miss', ?, ?)`,
    [newId("msn"), m.user_id, m.occasion_id, m.recipient_id, m.address_id, wouldPick, nowIso(), nowIso()],
  );

  await runDispatch("2026-08-18");
  assert.equal(await status(id), "scheduled", "the rescue must still succeed");
  const row = await db.get(`SELECT product_id FROM missions WHERE id = ?`, [id]);
  assert.notEqual(row.product_id, "wine_duo_reserve");
  assert.notEqual(row.product_id, wouldPick, "a delivered miss must never be picked again");
  passed += 1;
  console.log("  ok  a rescue never reaches for a product she already called a miss");
}

{
  // The reminder window is also an early-warning check: a product the vendor
  // would refuse is caught days BEFORE the ship date, not on it.
  const id = await seed({ productId: "wine_duo_reserve", autoPilot: 0 });
  await db.run(`UPDATE missions SET ship_on = '2026-08-18', deliver_on = '2026-08-20' WHERE id = ?`, [id]);
  await runDispatch("2026-08-16");
  assert.equal(await status(id), "failed", "caught two days before the ship date");
  const reminded = await db.get(
    `SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ? AND status = 'reminder'`,
    [id],
  );
  assert.equal(Number(reminded.n), 0, "no reminder for a gift that cannot ship");
  passed += 1;
  console.log("  ok  a doomed product is caught in the reminder window, days early");
}

{
  // The rescue cap: when every product is refused, Auto-Pilot swaps twice and
  // then admits defeat honestly instead of burning gifts forever.
  const id = await seed({ autoPilot: 1 });
  process.env.HANDLED_FORCE_FAIL = "1";
  try {
    await runDispatch("2026-08-20");
    assert.equal(await status(id), "scheduled", "first refusal is rescued");
    await runDispatch("2026-08-20");
    assert.equal(await status(id), "scheduled", "second refusal is rescued");
    await runDispatch("2026-08-20");
    assert.equal(await status(id), "failed", "the cap turns the third refusal into an honest failure");
  } finally {
    delete process.env.HANDLED_FORCE_FAIL;
  }
  passed += 1;
  console.log("  ok  the rescue cap stops an unfixable mission from looping forever");
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

console.log("\nrenewal — asking for the next twelve months");

async function seedForRenewal({ recurring = 1, deliverOn = "2026-08-20", nudgedAt = "" } = {}) {
  const userId = newId("usr");
  const recipientId = newId("rcp");
  const addressId = newId("adr");
  const occasionId = newId("occ");

  await db.run(
    `INSERT INTO users (id, email, password_hash, name, payment_ok, renewal_nudged_at, created_at)
     VALUES (?, ?, 'x', 'Mike Ruiz', 1, ?, ?)`,
    [userId, `${userId}@example.com`, nudgedAt, nowIso()],
  );
  await db.run(`INSERT INTO recipients (id, user_id, name, created_at) VALUES (?, ?, 'Dana', ?)`, [
    recipientId, userId, nowIso(),
  ]);
  await db.run(
    `INSERT INTO addresses (id, user_id, recipient_id, kind, line1, city, state, postal_code, created_at)
     VALUES (?, ?, ?, 'home', '1 Main St', 'Charlotte', 'NC', '28202', ?)`,
    [addressId, userId, recipientId, nowIso()],
  );
  await db.run(
    `INSERT INTO occasions (id, user_id, recipient_id, kind, title, event_date, recurring, created_at)
     VALUES (?, ?, ?, 'birthday', 'Birthday', '2026-08-20', ?, ?)`,
    [occasionId, userId, recipientId, recurring, nowIso()],
  );
  await db.run(
    `INSERT INTO missions (id, user_id, occasion_id, recipient_id, address_id, product_id,
        deliver_on, ship_on, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'bouquet_garden_seasonal', ?, ?, 'delivered', ?, ?)`,
    [newId("msn"), userId, occasionId, recipientId, addressId, deliverOn, deliverOn, nowIso(), nowIso()],
  );
  return userId;
}

{
  // Cover runs out in 5 days — this is the moment to ask.
  const id = await seedForRenewal({ deliverOn: "2026-08-20" });
  const report = await runDispatch("2026-08-15");
  assert.equal(report.renewalsNudged.includes(id), true);
  passed += 1;
  console.log("  ok  an account about to run out of scheduled gifts is asked to renew");
}

{
  const id = await seedForRenewal({ deliverOn: "2027-06-01" });
  const report = await runDispatch("2026-08-15");
  assert.equal(report.renewalsNudged.includes(id), false);
  passed += 1;
  console.log("  ok  an account with months of cover left is left alone");
}

{
  // A one-off gift is finished business, not a lapsed subscription.
  const id = await seedForRenewal({ recurring: 0, deliverOn: "2026-08-20" });
  const report = await runDispatch("2026-08-15");
  assert.equal(report.renewalsNudged.includes(id), false);
  passed += 1;
  console.log("  ok  an account with no recurring date is not chased");
}

{
  const id = await seedForRenewal({ deliverOn: "2026-08-20" });
  const first = await runDispatch("2026-08-15");
  const second = await runDispatch("2026-08-16");
  assert.equal(first.renewalsNudged.includes(id), true);
  assert.equal(second.renewalsNudged.includes(id), false);
  passed += 1;
  console.log("  ok  the nudge is sent once, not every day cover stays low");
}

{
  // Long enough after the last nudge that asking again is fair.
  const id = await seedForRenewal({ deliverOn: "2026-08-20", nudgedAt: "2026-01-01T00:00:00.000Z" });
  const report = await runDispatch("2026-08-15");
  assert.equal(report.renewalsNudged.includes(id), true);
  passed += 1;
  console.log("  ok  a nudge from a previous year does not silence this one");
}

console.log("\ndata layer");

check("the driver matches whether DATABASE_URL is set", () => {
  assert.equal(db.dialect, process.env.DATABASE_URL ? "postgres" : "sqlite");
});

check("TLS is off for a local Postgres and VERIFIED for a hosted one", () => {
  assert.equal(sslFor("postgresql://u@localhost:5432/db"), false);
  assert.equal(sslFor("postgresql://u@127.0.0.1:5432/db"), false);
  assert.equal(sslFor("postgresql://u@[::1]:5432/db"), false);
  // This connection carries password hashes and session ids: hosted means
  // certificate verification ON, never rejectUnauthorized: false.
  assert.deepEqual(sslFor("postgresql://u:p@ep-x.neon.tech/db"), { rejectUnauthorized: true });
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

check("an escaped quote does not end the literal", () => {
  // '' inside a string is SQL's escaped quote — the old translator flipped
  // its in-string flag on each one, so a ? later in the literal got numbered.
  assert.equal(toPositional("SELECT * FROM t WHERE note = 'It''s here?' AND id = ?"),
               "SELECT * FROM t WHERE note = 'It''s here?' AND id = $1");
});

check("conversion is stable across many parameters", () => {
  const sql = "INSERT INTO t VALUES (" + Array(12).fill("?").join(", ") + ")";
  assert.match(toPositional(sql), /\$1, \$2, .*\$12\)$/);
});

console.log("\nfulfilment coverage");

const { COVERAGE, coverageWithStatus, coverageSummary, affiliateCentsFor } = await import("../src/lib/fulfilment-map.ts");
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
  assert.deepEqual(live, ["Florist One", "Giftbit", "Goody", "Goody", "Goody", "Printful"]);
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
  const { GOODY_API_KEY, FLORIST_ONE_API_USER, FLORIST_ONE_API_PASSWORD, GIFTBIT_API_KEY, PRINTFUL_API_KEY } =
    process.env;
  const anyConfigured = Boolean(
    GOODY_API_KEY || GIFTBIT_API_KEY || PRINTFUL_API_KEY || (FLORIST_ONE_API_USER && FLORIST_ONE_API_PASSWORD),
  );
  // With no keys present every live row must read false — and crucially the
  // property has to exist, which a missing map entry would still satisfy. So
  // assert the shape too.
  for (const row of coverageWithStatus().filter((r) => r.readiness === "live")) {
    assert.equal(typeof row.credentialsPresent, "boolean", `${row.partner} has no credential check`);
    if (!anyConfigured) assert.equal(row.credentialsPresent, false);
  }
});

check("we never list a gift below what it costs us to land", () => {
  // The mistake a hurried price edit makes is selling at a loss quietly.
  const priced = ALL_PRODUCTS.filter((p) => p.landedCostCents);
  assert.ok(priced.length > 0, "expected at least one product with a recorded cost");
  for (const p of priced) {
    assert.ok(
      p.priceCents >= p.landedCostCents,
      `${p.name} lists at ${p.priceCents} but costs ${p.landedCostCents} to land`,
    );
    const margin = (p.priceCents - p.landedCostCents) / p.landedCostCents;
    assert.ok(
      margin >= 0.05 && margin <= 0.2,
      `${p.name} margin is ${(margin * 100).toFixed(1)}%, outside the intended ~10%`,
    );
  }
});

check("no supplier's name reaches anything the customer can read", () => {
  // Suppliers are a commercial relationship, not part of the brand. The map
  // keeps `partner` and `url` for our own reference; neither is rendered.
  const shown = coverageWithStatus().flatMap((r) => [
    r.vendorName,
    r.dateGuarantee,
    r.gap,
    ...r.examples,
  ]);
  for (const text of shown) {
    assert.equal(/goody|giftbit|florist one|ongoody/i.test(text), false, `leaks a supplier: ${text}`);
  }
});

check("every partner states a date guarantee and a gap", () => {
  for (const c of COVERAGE) {
    assert.ok(c.dateGuarantee.length > 20, `${c.partner} has no date guarantee`);
    assert.ok(c.gap.length > 20, `${c.partner} has no stated gap`);
    assert.match(c.url, /^https:\/\//);
  }
});

check("every partner states what it pays us back, and the arithmetic holds", () => {
  for (const c of COVERAGE) {
    assert.equal(typeof c.affiliateRatePct, "number", `${c.partner} has no affiliate rate`);
    assert.ok(
      c.affiliateRatePct >= 0 && c.affiliateRatePct <= 50,
      `${c.partner}'s rate ${c.affiliateRatePct}% is outside anything a partner really pays`,
    );
  }
  // 20% of $74.00 is $14.80, rounded to the cent.
  const flowers = ALL_PRODUCTS.find((p) => p.vendorId === "petal_post");
  const rate = COVERAGE.find((c) => c.vendorId === "petal_post").affiliateRatePct;
  assert.equal(
    affiliateCentsFor(flowers),
    Math.round((flowers.priceCents * rate) / 100),
  );
  // A vendor we've never heard of earns nothing rather than crashing.
  assert.equal(affiliateCentsFor({ vendorId: "nobody", priceCents: 10000 }), 0);
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

const { goodyAdapter, goodyIsLive, orderBatchBody, rejectionReason, isCommerceKey, chooseCard, resolveVariants, orderStatusFrom } = await import("../src/lib/vendors/goody.ts");

const goodyOrder = {
  mission: { id: "msn_g", gift_message: "Happy birthday. — M", deliver_on: "2026-08-20" },
  product: { id: "cookie_tin_bakery", name: "Bakery Cookie Tin", priceCents: 5200, vendorSku: "abc-uuid" },
  recipient: { name: "Dana Ruiz" },
  address: { line1: "412 Rosewood Ln", line2: "Apt 3", city: "Charlotte", state: "NC", postal_code: "28202", country: "US" },
  buyer: { name: "Mike Ruiz", email: "mike@example.com" },
};

check("their order record maps to our transitions, conservatively", () => {
  // No signal → no verdict; the date-based fallback keeps custody.
  assert.equal(orderStatusFrom({ status: "created", shipments: [] }), null);
  assert.equal(orderStatusFrom({}), null);
  // A shipment with tracking is proof of motion, and the link travels along.
  assert.deepEqual(
    orderStatusFrom({ status: "created", shipments: [{ tracking_url: "https://t.co/x" }] }),
    { status: "shipped", trackingUrl: "https://t.co/x" },
  );
  // Their own words win when they say so.
  assert.equal(orderStatusFrom({ status: "shipped", shipments: [] }).status, "shipped");
  assert.deepEqual(
    orderStatusFrom({ status: "delivered", shipments: [{ tracking_url: "https://t.co/x" }] }),
    { status: "delivered", trackingUrl: "https://t.co/x" },
  );
  assert.equal(orderStatusFrom({ shipments: [{ delivered_at: "2026-08-20" }] }).status, "delivered");
  // The ugly one: accepted then killed must surface, never be papered over.
  assert.deepEqual(orderStatusFrom({ status: "canceled" }), { status: "canceled" });
  // An unrecognised status is not a verdict.
  assert.equal(orderStatusFrom({ status: "notified", shipments: [] }), null);
});

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
  // at all. With no card resolved, the note is dropped rather than sent alone.
  const withoutCard = orderBatchBody(goodyOrder, null);
  assert.equal("message" in withoutCard, false);
  assert.equal("card_id" in withoutCard, false);

  const withCard = orderBatchBody(goodyOrder, "card-uuid");
  assert.equal(withCard.card_id, "card-uuid");
  assert.equal(withCard.message, "Happy birthday. — M");
});

check("a card without a note is pointless, so neither is sent", () => {
  const noNote = { ...goodyOrder, mission: { ...goodyOrder.mission, gift_message: "   " } };
  const body = orderBatchBody(noNote, "card-uuid");
  assert.equal("card_id" in body, false);
  assert.equal("message" in body, false);
});

check("the key's own prefix decides how the order is paid for", () => {
  // Two keys, two businesses: Commerce resells their catalogue and settles
  // against stored value, Automation spends our card and must not send the
  // field at all.
  assert.equal(isCommerceKey("goody_token_commerce_abc"), true);
  assert.equal(isCommerceKey("goody_token_user_abc"), false);
  assert.equal(isCommerceKey(""), false);
});

check("a card is chosen by occasion, not by whichever came back first", () => {
  const library = [
    { id: "corporate", occasions: ["Sales Prospecting"] },
    { id: "anytime", occasions: ["Anytime"] },
    { id: "birthday", occasions: ["Birthday"] },
  ];
  assert.equal(chooseCard(library), "anytime");
  // Falls back to something usable rather than nothing when nothing matches.
  assert.equal(chooseCard([{ id: "only", occasions: ["Sympathy"] }]), "only");
  assert.equal(chooseCard([]), null);
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

check("our recorded variant is the one sent", () => {
  // Their "variants" are a flavour or a colour — a curation decision made once
  // in the catalogue, not something to guess per order.
  const product = {
    variants_label: "Flavor",
    variants_num_selectable: 1,
    variants: [{ id: "dark" }, { id: "milk" }],
  };
  assert.deepEqual(resolveVariants(product, ["dark"], "Truffles"), { ids: ["dark"] });
});

check("a sole option needs no decision from us", () => {
  // The cashmere throw offers exactly one colour. Refusing that as an
  // unmade choice, which an earlier version did, blocked a product with
  // nothing to choose.
  const product = { variants_num_selectable: 1, variants: [{ id: "heather-grey" }] };
  assert.deepEqual(resolveVariants(product, undefined, "Throw"), { ids: ["heather-grey"] });
});

check("a product with no variants sends none", () => {
  assert.deepEqual(resolveVariants({ variants_num_selectable: 0 }, undefined, "Oil"), { ids: [] });
});

check("a real unmade choice is refused rather than guessed", () => {
  const product = {
    variants_label: "Flavor",
    variants_num_selectable: 1,
    variants: [{ id: "dark" }, { id: "milk" }],
  };
  const out = resolveVariants(product, undefined, "Truffles");
  assert.match(out.error, /does not record one/i);
});

check("a variant Goody has withdrawn is caught, not sent blind", () => {
  const product = {
    variants_label: "Flavor",
    variants_num_selectable: 1,
    variants: [{ id: "milk" }],
  };
  const out = resolveVariants(product, ["dark-discontinued"], "Truffles");
  assert.match(out.error, /no longer offered/i);
});

check("a product barred from her state is caught before the order goes in", () => {
  // Real constraint: a third of their catalogue restricts at least one state.
  assert.match(
    rejectionReason({ restricted_states: ["AK", "HI"] }, "hi", "Wine Tumbler"),
    /cannot ship/i,
  );
  assert.equal(rejectionReason({ restricted_states: ["AK", "HI"] }, "NC", "Wine Tumbler"), null);
});

check("link-only, variable-price and withdrawn products are all refused", () => {
  assert.match(rejectionReason({ cart_eligible: false }, "NC", "X"), /gift link/i);
  assert.match(rejectionReason({ price_is_variable: true }, "NC", "X"), /no fixed price/i);
  assert.match(rejectionReason({ status: "inactive" }, "NC", "X"), /no longer available/i);
});

check("an ordinary product passes the pre-flight untouched", () => {
  assert.equal(
    rejectionReason(
      { status: "active", cart_eligible: true, variants_num_selectable: null, restricted_states: [] },
      "NC",
      "Bakery Cookie Tin",
    ),
    null,
  );
});

{
  const noStreet = { ...goodyOrder, address: { ...goodyOrder.address, line1: "  " } };
  const result = await goodyAdapter.placeOrder(noStreet);
  assert.equal(result.ok, false);
  assert.match(result.reason, /street address/i);
  passed += 1;
  console.log("  ok  an incomplete address is caught before it reaches them");
}

console.log("\nprintful adapter — printed to order, shipped to her");

const { printfulAdapter, printfulIsLive, orderBody, confirmOrders } = await import("../src/lib/vendors/printful.ts");

const printfulOrder = {
  mission: { id: "msn_p", gift_message: "Sixteen characters, chosen carefully. — M" },
  product: { id: "bracelet_engraved", name: "Engraved Bar Bracelet", priceCents: 14500, vendorSku: "4938271" },
  recipient: { name: "Dana Ruiz" },
  address: { line1: "412 Rosewood Ln", line2: "Apt 3", city: "Charlotte", state: "NC", postal_code: "28202", country: "US" },
  buyer: { name: "Mike Ruiz", email: "mike@example.com" },
};

check("printful is live exactly when its key is present", () => {
  assert.equal(printfulIsLive(), Boolean(process.env.PRINTFUL_API_KEY));
});

check("the parcel goes to her name and address, with no way to contact her", () => {
  const body = orderBody(printfulOrder);
  assert.equal(body.recipient.name, "Dana Ruiz");
  assert.equal(body.recipient.address1, "412 Rosewood Ln");
  assert.equal(body.recipient.zip, "28202");
  // No email, no phone — Printful must have no route to her at all, and the
  // buyer's email must not stand in for hers on a physical parcel either.
  const serialised = JSON.stringify(body);
  assert.equal("email" in body.recipient, false);
  assert.equal("phone" in body.recipient, false);
  assert.equal(/@/.test(serialised.replace(/msn_p/g, "")), false);
});

check("the mission id is the idempotency key", () => {
  assert.equal(orderBody(printfulOrder).external_id, "msn_p");
});

check("the gift message rides on the order, signed by him", () => {
  const body = orderBody(printfulOrder);
  assert.match(body.gift.message, /Sixteen characters/);
  assert.match(body.gift.subject, /Mike Ruiz/);
});

check("no message means no gift block, not an empty one", () => {
  const silent = { ...printfulOrder, mission: { ...printfulOrder.mission, gift_message: "  " } };
  assert.equal("gift" in orderBody(silent), false);
});

check("the design pointer is the sync variant id from vendorSku", () => {
  const body = orderBody(printfulOrder);
  assert.deepEqual(body.items, [{ sync_variant_id: 4938271, quantity: 1 }]);
});

check("draft by default; only an explicit production flag spends money", () => {
  assert.equal(confirmOrders("draft"), false);
  assert.equal(confirmOrders(undefined), false);
  assert.equal(confirmOrders("production"), true);
});

{
  const noDesign = { ...printfulOrder, product: { ...printfulOrder.product, vendorSku: undefined } };
  const result = await printfulAdapter.placeOrder(noDesign);
  assert.equal(result.ok, false);
  assert.match(result.reason, /no Printful design on file/i);
  passed += 1;
  console.log("  ok  a product with no recorded design is refused before any network call");
}

{
  const noStreet = { ...printfulOrder, address: { ...printfulOrder.address, line1: " " } };
  const result = await printfulAdapter.placeOrder(noStreet);
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
    personalized: Boolean(process.env.PRINTFUL_API_KEY),
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

console.log("\npassword reset");

const { hashPassword, verifyPassword, createResetToken, resetPasswordWithToken } = await import(
  "../src/lib/auth.ts"
);

check("password hashing round-trips and rejects the wrong password", () => {
  const stored = hashPassword("correct horse battery");
  assert.equal(verifyPassword("correct horse battery", stored), true);
  assert.equal(verifyPassword("incorrect horse", stored), false);
  assert.notEqual(hashPassword("same input"), hashPassword("same input"), "salts must differ");
});

{
  const userId = newId("usr");
  await db.run(
    `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, 'Mike', ?)`,
    [userId, `${userId}@example.com`, hashPassword("original-pass"), nowIso()],
  );
  await db.run(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)`,
    [newId("ses"), userId, new Date(Date.now() + 86_400_000).toISOString(), nowIso()],
  );

  const token = await createResetToken(userId);
  const row = await db.get(`SELECT reset_token_hash FROM users WHERE id = ?`, [userId]);
  assert.notEqual(row.reset_token_hash, token, "only the hash may be stored");
  assert.equal(await resetPasswordWithToken("not-the-token", "whatever-123"), false);

  assert.equal(await resetPasswordWithToken(token, "brand-new-pass"), true);
  const after = await db.get(
    `SELECT password_hash, reset_token_hash FROM users WHERE id = ?`,
    [userId],
  );
  assert.equal(verifyPassword("brand-new-pass", after.password_hash), true);
  assert.equal(after.reset_token_hash, "", "the token must clear on use");
  assert.equal(await resetPasswordWithToken(token, "third-pass-999"), false, "single use only");
  const sessions = await db.get(`SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?`, [userId]);
  assert.equal(Number(sessions.n), 0, "a reset must sign out every device");
  passed += 1;
  console.log("  ok  the reset token is hashed, single-use, and revokes every session");
}

{
  // An expired token is as good as no token.
  const userId = newId("usr");
  await db.run(
    `INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, 'x', 'Mike', ?)`,
    [userId, `${userId}@example.com`, nowIso()],
  );
  const token = await createResetToken(userId);
  await db.run(`UPDATE users SET reset_token_expires = '2000-01-01T00:00:00.000Z' WHERE id = ?`, [
    userId,
  ]);
  assert.equal(await resetPasswordWithToken(token, "too-late-pass"), false);
  passed += 1;
  console.log("  ok  an expired reset token is refused");
}

console.log("\nrate limiting & account deletion");

const { allowAttempt } = await import("../src/lib/rate-limit.ts");
const { deleteAccount } = await import("../src/lib/queries.ts");

{
  const key = `test:${newId("key")}`;
  for (let i = 0; i < 3; i++) {
    assert.equal(await allowAttempt(key, 3, 900), true, `attempt ${i + 1} is inside the allowance`);
  }
  assert.equal(await allowAttempt(key, 3, 900), false, "the fourth attempt is refused");
  // Force the window into the past — the next attempt starts a fresh one.
  await db.run(`UPDATE rate_limits SET resets_at = '2000-01-01T00:00:00.000Z' WHERE key = ?`, [key]);
  assert.equal(await allowAttempt(key, 3, 900), true, "an expired window resets the count");
  passed += 1;
  console.log("  ok  the limiter allows the allowance, refuses the excess, and rolls the window");
}

{
  // Deletion is refused while an order is moving, then wipes everything.
  const id = await seed();
  const m = await db.get(`SELECT user_id FROM missions WHERE id = ?`, [id]);
  await db.run(`UPDATE missions SET status = 'placed' WHERE id = ?`, [id]);
  const refused = await deleteAccount(m.user_id);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /placed and moving/i);

  await db.run(`UPDATE missions SET status = 'delivered' WHERE id = ?`, [id]);
  const done = await deleteAccount(m.user_id);
  assert.equal(done.ok, true);
  for (const table of ["users", "recipients", "addresses", "occasions", "missions", "sessions"]) {
    const col = table === "users" ? "id" : "user_id";
    const left = await db.get(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} = ?`, [m.user_id]);
    assert.equal(Number(left.n), 0, `${table} must be empty for the deleted account`);
  }
  const events = await db.get(`SELECT COUNT(*) AS n FROM mission_events WHERE mission_id = ?`, [id]);
  assert.equal(Number(events.n), 0, "mission events must go with their missions");
  passed += 1;
  console.log("  ok  deletion waits for in-flight orders, then leaves nothing behind");
}

console.log("\noperator & export");

const { orderDesk, exportAccount } = await import("../src/lib/queries.ts");

{
  const id = await seed();
  const desk = await orderDesk(10);
  const row = desk.find((r) => r.id === id);
  assert.ok(row, "a fresh mission must appear on the desk");
  assert.match(row.member_email, /@example\.com$/, "the desk names the member");
  assert.equal(row.recipient_name, "Dana", "the desk names the recipient");
  passed += 1;
  console.log("  ok  the order desk joins missions to their member and recipient");
}

{
  const id = await seed();
  const m = await db.get(`SELECT user_id FROM missions WHERE id = ?`, [id]);
  const data = await exportAccount(m.user_id);
  assert.equal(data.missions.length, 1);
  assert.equal(data.user.email, `${m.user_id}@example.com`);
  const dumped = JSON.stringify(data);
  for (const secret of ["password_hash", "reset_token", "stripe_customer", "stripe_payment"]) {
    assert.equal(dumped.includes(secret), false, `${secret} must never leave in an export`);
  }
  passed += 1;
  console.log("  ok  the export carries everything the member owns and none of the secrets");
}

console.log(`\n${passed} checks passed\n`);
