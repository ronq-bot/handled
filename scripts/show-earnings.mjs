/**
 * The money actually earned: every placed, shipped or delivered mission, with
 * the price charged, the affiliate commission recorded at placement, and the
 * margin over landed cost. Reads whichever database the app is pointed at
 * (SQLite by default, Postgres when DATABASE_URL is set).
 *
 * Operator-facing only. Nothing here may leak into a customer-visible page —
 * the same rule the fulfilment map's supplier names live under, and the test
 * suite holds the line on both.
 */
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);
const { getDb } = await import("../src/lib/db.ts");
const { getProduct } = await import("../src/lib/catalog.ts");

const db = await getDb();
const rows = await db.all(
  `SELECT id, product_id, price_cents, affiliate_cents, status, deliver_on
   FROM missions
   WHERE status IN ('placed', 'shipped', 'delivered')
   ORDER BY deliver_on`,
);

const $ = (cents) => "$" + (cents / 100).toFixed(2);

if (rows.length === 0) {
  console.log("No orders placed yet — nothing earned. Run the dispatcher and come back.");
  process.exit(0);
}

console.log("delivery     product                      charged    affil.    margin   status");
let totals = { charged: 0, affiliate: 0, margin: 0 };
for (const m of rows) {
  const product = getProduct(m.product_id);
  const margin = product?.landedCostCents ? m.price_cents - product.landedCostCents : 0;
  totals.charged += m.price_cents;
  totals.affiliate += m.affiliate_cents;
  totals.margin += margin;
  console.log(
    "  " + m.deliver_on,
    (product?.id ?? m.product_id).padEnd(26),
    $(m.price_cents).padStart(8),
    $(m.affiliate_cents).padStart(8),
    $(margin).padStart(9),
    "  " + m.status,
  );
}
console.log(
  `\n${rows.length} order${rows.length === 1 ? "" : "s"}: ${$(totals.charged)} charged, ` +
    `${$(totals.affiliate)} affiliate commission earned, ${$(totals.margin)} margin over landed cost — ` +
    `${$(totals.affiliate + totals.margin)} to us.`,
);
