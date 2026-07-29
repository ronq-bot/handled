import "server-only";
import { env } from "./env";
import { PRODUCTS, type Product } from "./catalog";

/**
 * Pulls each partner's own product photography, name and price.
 *
 * The images in this app should be the partner's actual pictures of the actual
 * item — Florist One returns an image URL, a name, a price and a description
 * per product; Giftbit returns an image URL per brand. Both are the real thing,
 * which is the only kind of photo worth showing next to a price.
 *
 * Run with `npm run sync:catalogue`. Without credentials it reports what it
 * *would* fetch and changes nothing, so it's safe to run at any time.
 */

export type SyncedProduct = {
  id: string;
  vendorSku?: string;
  imageUrl?: string;
  imageSource?: string;
  name?: string;
  priceCents?: number;
  blurb?: string;
};

export type SyncReport = {
  partner: string;
  live: boolean;
  fetched: number;
  matched: SyncedProduct[];
  note: string;
};

/* ── Florist One ────────────────────────────────────────────────
   `getproducts` returns name, price, description and an image URL per
   product. Their codes are the authority; our own ids are placeholders.
   ─────────────────────────────────────────────────────────────── */

type FloristOneProduct = {
  CODE?: string;
  NAME?: string;
  PRICE?: string | number;
  DESCRIPTION?: string;
  SMALL?: string;
  MEDIUM?: string;
  LARGE?: string;
};

export async function syncFloristOne(): Promise<SyncReport> {
  const flowers = PRODUCTS.filter((p) => p.vendorId === "petal_post");

  if (!env.floristOneUser || !env.floristOnePassword) {
    return {
      partner: "Florist One",
      live: false,
      fetched: 0,
      matched: [],
      note: `Would fetch photographs for ${flowers.length} flower products. Set FLORIST_ONE_API_USER and FLORIST_ONE_API_PASSWORD.`,
    };
  }

  const auth = Buffer.from(`${env.floristOneUser}:${env.floristOnePassword}`).toString("base64");
  const response = await fetch("https://www.floristone.com/api/rest/flowershop/getproducts", {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) throw new Error(`Florist One getproducts returned ${response.status}`);

  const data = (await response.json()) as { PRODUCTS?: FloristOneProduct[] };
  const theirs = data.PRODUCTS ?? [];

  // Match on price band — their catalogue is the source of truth for what a
  // bouquet at this price actually looks like.
  const matched = flowers
    .map((ours) => {
      const best = nearestByPrice(theirs, ours.priceCents);
      if (!best) return null;
      return {
        id: ours.id,
        vendorSku: best.CODE,
        imageUrl: best.LARGE ?? best.MEDIUM ?? best.SMALL,
        imageSource: "floristone.com",
        name: best.NAME,
        priceCents: toCents(best.PRICE),
        blurb: best.DESCRIPTION?.trim(),
      } satisfies SyncedProduct;
    })
    .filter((x) => x !== null);

  return {
    partner: "Florist One",
    live: true,
    fetched: theirs.length,
    matched,
    note: `Matched ${matched.length} of ${flowers.length} flower products to real listings.`,
  };
}

function toCents(price: string | number | undefined): number | undefined {
  if (price === undefined) return undefined;
  const value = typeof price === "number" ? price : Number(String(price).replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? Math.round(value * 100) : undefined;
}

function nearestByPrice(
  items: FloristOneProduct[],
  targetCents: number,
): FloristOneProduct | undefined {
  let best: FloristOneProduct | undefined;
  let bestGap = Infinity;

  for (const item of items) {
    const cents = toCents(item.PRICE);
    if (cents === undefined || !item.CODE) continue;
    const gap = Math.abs(cents - targetCents);
    if (gap < bestGap) {
      best = item;
      bestGap = gap;
    }
  }
  return best;
}

/* ── Giftbit ────────────────────────────────────────────────────
   Brands carry an `image_url`. An experience credit shows the brand mark
   he'd be choosing from, which is the honest picture for that product.
   ─────────────────────────────────────────────────────────────── */

export async function syncGiftbit(): Promise<SyncReport> {
  const experiences = PRODUCTS.filter((p) => p.vendorId === "moment_co");

  if (!env.giftbitApiKey) {
    return {
      partner: "Giftbit",
      live: false,
      fetched: 0,
      matched: [],
      note: `Would fetch brand marks for ${experiences.length} experience products. Set GIFTBIT_API_KEY.`,
    };
  }

  const { brandsAt } = await import("./vendors/giftbit");
  const matched: SyncedProduct[] = [];
  let fetched = 0;

  for (const product of experiences) {
    const { brands } = await brandsAt(product.priceCents);
    fetched += brands.length;
    const brand = brands[0] as { brand_code: string; name: string; image_url?: string } | undefined;
    if (!brand) continue;

    matched.push({
      id: product.id,
      vendorSku: brand.brand_code,
      imageUrl: brand.image_url,
      imageSource: "giftbit.com",
      name: product.name,
    });
  }

  return {
    partner: "Giftbit",
    live: true,
    fetched,
    matched,
    note: `Matched ${matched.length} of ${experiences.length} experience products to brands.`,
  };
}

export async function syncAll(): Promise<SyncReport[]> {
  return Promise.all([syncFloristOne(), syncGiftbit()]);
}

export type OverlayEntry = Partial<
  Pick<Product, "imageUrl" | "imageSource" | "vendorSku" | "priceCents" | "blurb">
>;

/** Reduces every report down to the overlay file `catalog.ts` reads at import time. */
export function toOverlay(reports: SyncReport[]): Record<string, OverlayEntry> {
  const overlay: Record<string, OverlayEntry> = {};

  for (const report of reports) {
    for (const update of report.matched) {
      const entry: OverlayEntry = {};
      // Only ever record what the partner actually returned.
      if (update.imageUrl) entry.imageUrl = update.imageUrl;
      if (update.imageSource) entry.imageSource = update.imageSource;
      if (update.vendorSku) entry.vendorSku = update.vendorSku;
      if (update.priceCents) entry.priceCents = update.priceCents;
      if (update.blurb) entry.blurb = update.blurb;
      if (Object.keys(entry).length > 0) overlay[update.id] = entry;
    }
  }

  return overlay;
}
