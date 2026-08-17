/**
 * Test-drive the gifting partners with real credentials — `npm run test:vendors`.
 *
 * Read-only by default: proves each configured partner's credentials work and
 * shows what is actually orderable, without placing anything. Two flags go
 * further, deliberately opt-in:
 *
 *   --order-goody     Places ONE real order through the Goody adapter — the
 *                     full production code path (pre-flight, variants, card,
 *                     order batch). Refuses outside the sandbox: with
 *                     GOODY_ENV=production this flag does nothing but warn.
 *
 * Florist One has no sandbox — every order is a real bouquet and a real
 * charge — so this script NEVER orders flowers. Its test is the one that
 * matters anyway: can we authenticate, see the catalogue, and confirm real
 * deliverable dates for a ZIP, which is the promise the whole product rests
 * on.
 *
 * Keys go in .env.local (see README). Run from the repo root.
 */
import { register } from "node:module";
register("./ts-loader.mjs", import.meta.url);

// Load .env.local the same way Next does, so the script sees the same keys.
import { readFileSync } from "node:fs";
try {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
} catch {
  /* no .env.local — rely on the environment */
}

const { env } = await import("../src/lib/env.ts");
const { PRODUCTS } = await import("../src/lib/catalog.ts");

const flags = new Set(process.argv.slice(2));
const line = (s = "") => console.log(s);
const money = (cents) => "$" + (cents / 100).toFixed(2);

line("Vendor test-drive — read-only unless a flag says otherwise\n");

/* ── Goody ──────────────────────────────────────────────────── */

async function goody() {
  line("Goody (chocolate, bakery, spa, jewelry — ships to her)");
  if (!env.goodyApiKey) {
    line("  not configured. Self-serve key: https://developer.ongoody.com (free sandbox, no sales call).");
    line("  Add GOODY_API_KEY to .env.local and re-run.\n");
    return;
  }

  const host =
    env.goodyEnv === "production" ? "https://api.ongoody.com/v1" : "https://api.sandbox.ongoody.com/v1";
  line(`  key present · ${env.goodyEnv === "production" ? "PRODUCTION — real money" : "sandbox — nothing charged"}`);

  const auth = { Authorization: `Bearer ${env.goodyApiKey}`, Accept: "application/json" };
  const ping = await fetch(`${host}/products?per_page=1`, { headers: auth });
  if (!ping.ok) {
    line(`  FAIL: credentials rejected (HTTP ${ping.status}). Check the key.\n`);
    return;
  }
  line("  credentials accepted.");

  // Pre-flight every mapped product exactly the way the adapter does on the day.
  const { rejectionReason, resolveVariants } = await import("../src/lib/vendors/goody.ts");
  const mapped = PRODUCTS.filter(
    (p) => ["cocoa_line", "hearthside", "gilt_grace"].includes(p.vendorId) && p.vendorSku,
  );
  line(`  pre-flighting ${mapped.length} mapped products against their live catalogue:`);
  let orderable = 0;
  for (const p of mapped) {
    const res = await fetch(`${host}/products/${encodeURIComponent(p.vendorSku)}`, { headers: auth });
    if (!res.ok) {
      line(`    ✗ ${p.id} — HTTP ${res.status} (withdrawn or wrong id)`);
      continue;
    }
    const theirs = await res.json();
    const variants = resolveVariants(theirs, p.vendorVariants, p.name);
    const refusal = rejectionReason(theirs, "NC", p.name) ?? ("error" in variants ? variants.error : null);
    if (refusal) line(`    ✗ ${p.id} — ${refusal}`);
    else {
      orderable += 1;
      line(`    ✓ ${p.id} — orderable (${theirs.name ?? "unnamed"}, ${money(theirs.price ?? p.priceCents)})`);
    }
  }
  line(`  ${orderable}/${mapped.length} orderable today.`);

  if (flags.has("--order-goody")) {
    if (env.goodyEnv === "production") {
      line("  --order-goody REFUSED: GOODY_ENV=production would spend real money. Unset it to test.\n");
      return;
    }
    const candidate = mapped.find((p) => p.vendorId === "cocoa_line") ?? mapped[0];
    if (!candidate) {
      line("  --order-goody: no mapped product to order.\n");
      return;
    }
    line(`  placing ONE sandbox order for ${candidate.id} through the real adapter…`);
    const { goodyAdapter } = await import("../src/lib/vendors/goody.ts");
    const result = await goodyAdapter.placeOrder({
      mission: { id: `test_${crypto.randomUUID().slice(0, 12)}`, gift_message: "Adapter test drive — sandbox order. — Handled", deliver_on: "" },
      product: candidate,
      recipient: { name: "Test Recipient" },
      address: {
        line1: "412 Rosewood Ln",
        line2: "",
        city: "Charlotte",
        state: "NC",
        postal_code: "28202",
        country: "US",
      },
      buyer: { name: "Handled Test", email: "test@example.com" },
    });
    if (result.ok) {
      line(`  ✓ ORDER PLACED (sandbox): ref ${result.vendorOrderRef} at ${money(result.priceCents)}.`);
      line("    See it at the Goody sandbox dashboard.");
    } else {
      line(`  ✗ order refused: ${result.reason}`);
    }
  } else {
    line("  (add --order-goody to place one real sandbox order through the adapter)");
  }
  line();
}

/* ── Florist One ────────────────────────────────────────────── */

async function floristOne() {
  line("Florist One (flowers — the only partner with a true dated promise)");
  if (!env.floristOneUser || !env.floristOnePassword) {
    line("  not configured. Apply at https://www.floristone.com/api/ for API credentials.");
    line("  Add FLORIST_ONE_API_USER and FLORIST_ONE_API_PASSWORD to .env.local and re-run.\n");
    return;
  }

  const auth = Buffer.from(`${env.floristOneUser}:${env.floristOnePassword}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}`, Accept: "application/json" };

  const products = await fetch("https://www.floristone.com/api/rest/flowershop/getproducts", {
    headers,
  });
  if (!products.ok) {
    line(`  FAIL: credentials rejected on getproducts (HTTP ${products.status}).\n`);
    return;
  }
  const catalogue = (await products.json()).PRODUCTS ?? [];
  line(`  credentials accepted · ${catalogue.length} products in their live catalogue.`);
  for (const p of catalogue.slice(0, 5)) {
    line(`    · ${p.CODE} — ${p.NAME} (${p.PRICE ? "$" + p.PRICE : "?"})`);
  }

  const zip = "28202";
  const dates = await fetch(
    `https://www.floristone.com/api/rest/flowershop/getdeliverydates?zipcode=${zip}`,
    { headers },
  );
  if (dates.ok) {
    // Parse with the adapter's own parser — the same code that gates real orders.
    const { parseDeliveryDates } = await import("../src/lib/vendors/florist-one.ts");
    const payload = await dates.json();
    const list = parseDeliveryDates(payload.DELIVERYDATES ?? payload.deliverydates ?? []);
    line(`  deliverable dates for ${zip} (their 15,000-florist network answering): ${list.slice(0, 7).join(", ")}`);
  } else {
    line(`  getdeliverydates returned HTTP ${dates.status} — check account permissions.`);
  }

  line("  NOTE: no test order is ever placed here — Florist One has no sandbox, every order");
  line("  is a real bouquet and a real charge. The date + catalogue check above is the");
  line("  integration proof; the first real order should be one you send yourself.\n");
}

await goody();
await floristOne();

line("Done. Next steps: fix anything marked ✗, run `npm run sync:catalogue` to pull real");
line("photography and prices for everything that passed, then restart the app to see it.");
