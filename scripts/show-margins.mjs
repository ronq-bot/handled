/** Prints the margin on every product a live supplier fulfils. */
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);
const { PRODUCTS } = await import("../src/lib/catalog.ts");

console.log("product                      lands at     lists at     profit   margin");
for (const p of PRODUCTS.filter((x) => x.landedCostCents)) {
  const profit = p.priceCents - p.landedCostCents;
  console.log(
    "  " + p.id.padEnd(26),
    ("$" + (p.landedCostCents / 100).toFixed(2)).padStart(9),
    ("$" + (p.priceCents / 100).toFixed(2)).padStart(12),
    ("$" + (profit / 100).toFixed(2)).padStart(10),
    ((profit / p.landedCostCents * 100).toFixed(1) + "%").padStart(8),
  );
}
