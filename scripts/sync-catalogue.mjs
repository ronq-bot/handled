/**
 * Pulls real product photography, names and prices from the gifting partners
 * we have credentials for, and writes them to .data/catalogue-overlay.json —
 * which src/lib/catalog.ts reads on every import and merges over the
 * hand-authored product list.
 *
 *   npm run sync:catalogue
 *
 * Safe to run with no credentials at all: each partner reports what it
 * *would* fetch and the overlay file is left untouched. Safe to run
 * repeatedly: it's a full re-fetch and overwrite, never an accumulation.
 */
import fs from "node:fs";
import path from "node:path";

const { register } = await import("node:module");
register("./ts-loader.mjs", import.meta.url);

const { syncAll, toOverlay } = await import("../src/lib/catalogue-sync.ts");

const reports = await syncAll();

console.log();
for (const r of reports) {
  const tag = r.live ? "live" : "not configured";
  console.log(`${r.partner} — ${tag}`);
  console.log(`  ${r.note}`);
}
console.log();

const overlay = toOverlay(reports);
const withImages = Object.values(overlay).filter((e) => e.imageUrl).length;

if (Object.keys(overlay).length === 0) {
  console.log("Nothing to write — no partner returned a match. Overlay file left as-is.");
  process.exit(0);
}

const dataDir = path.join(process.cwd(), ".data");
fs.mkdirSync(dataDir, { recursive: true });
const outPath = path.join(dataDir, "catalogue-overlay.json");
fs.writeFileSync(outPath, JSON.stringify(overlay, null, 2) + "\n");

console.log(`Wrote ${Object.keys(overlay).length} product updates (${withImages} with real photos) to`);
console.log(`  ${outPath}`);
console.log();
console.log("Restart the dev server to pick it up — the catalogue is read once per process.");
