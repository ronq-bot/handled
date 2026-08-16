/**
 * Prints what we make on every product with a recorded cost: the cost-plus
 * margin, the partner's affiliate commission on top, and the total take.
 * Static catalogue analysis — for what orders have actually earned, run
 * `npm run earnings`.
 */
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);
const { PRODUCTS } = await import("../src/lib/catalog.ts");
const { affiliateCentsFor } = await import("../src/lib/fulfilment-map.ts");

const $ = (cents) => "$" + (cents / 100).toFixed(2);

console.log(
  "product                      lands at     lists at     margin   affil.      take",
);
let totals = { margin: 0, affiliate: 0 };
for (const p of PRODUCTS.filter((x) => x.landedCostCents)) {
  const margin = p.priceCents - p.landedCostCents;
  const affiliate = affiliateCentsFor(p);
  totals.margin += margin;
  totals.affiliate += affiliate;
  console.log(
    "  " + p.id.padEnd(26),
    $(p.landedCostCents).padStart(9),
    $(p.priceCents).padStart(12),
    $(margin).padStart(10),
    $(affiliate).padStart(8),
    $(margin + affiliate).padStart(9),
  );
}
console.log(
  "\nAcross the priced catalogue: " +
    `${$(totals.margin)} margin + ${$(totals.affiliate)} commission = ${$(totals.margin + totals.affiliate)} if one of each sold.`,
);
