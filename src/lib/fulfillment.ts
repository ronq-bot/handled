import { getVendor, type Product } from "./catalog";
import type { Address, Mission, Recipient, User } from "./types";

export type OrderRequest = {
  mission: Mission;
  product: Product;
  recipient: Recipient;
  address: Address;
  /**
   * The account holder. Anything delivered digitally goes to *him* — we never
   * contact the recipient, because the surprise is the entire product.
   */
  buyer: User;
};

export type OrderResult =
  | { ok: true; vendorOrderRef: string; priceCents: number }
  | { ok: false; reason: string };

export type PreflightResult = { ok: true } | { ok: false; reason: string };

/**
 * What the vendor says about an order we already placed. `null` means "no
 * verdict" — the vendor gave no usable signal, and the caller falls back to
 * date-based transitions. `canceled` is the ugly one: the vendor accepted
 * the order and then killed it, which must surface as a failure, never as a
 * gift quietly marked delivered on schedule.
 */
export type VendorOrderStatus = {
  status: "placed" | "shipped" | "delivered" | "canceled";
  trackingUrl?: string;
} | null;

/**
 * Every gifting partner gets wrapped in this one interface. Swapping the mock
 * for a real 1-800-Flowers / Edible / Goldbelly integration is a matter of
 * writing one of these and registering it below — nothing upstream changes.
 * See docs/VENDORS.md for the shortlist and what each one actually supports.
 *
 * `preflight` answers "would this order be refused today?" without placing
 * anything. The dispatcher runs it in the reminder window, days before the
 * ship date, so a withdrawn or restricted product surfaces while there is
 * still runway to fix it — rule 5 in docs/VENDORS.md, made real. A definite
 * refusal returns ok:false; anything inconclusive (network trouble) should
 * THROW, which callers treat as "unknown, try again later", never as a
 * refusal.
 */
export interface FulfillmentAdapter {
  id: string;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  preflight?(req: OrderRequest): Promise<PreflightResult>;
  /**
   * Real progress for a placed order, when the partner can report it. The
   * dispatcher prefers this over its date-based stopgap, which stays as the
   * fallback for partners (and the mock) that cannot answer.
   */
  orderStatus?(vendorOrderRef: string): Promise<VendorOrderStatus>;
}

/**
 * Development adapter. Deterministic: the same mission always gets the same
 * outcome, so demos and tests don't flap. Set HANDLED_FORCE_FAIL=1 to watch
 * the failure path (and the "we caught it, here's a replacement" flow).
 */
export const mockAdapter: FulfillmentAdapter = {
  id: "mock",
  async placeOrder({ mission, product, address }) {
    const refusal = mockRefusal(product, address);
    if (refusal) return { ok: false, reason: refusal };

    const vendor = getVendor(product.vendorId)!;
    const ref = `${vendor.id.toUpperCase().slice(0, 4)}-${mission.id.slice(-8).toUpperCase()}`;
    return { ok: true, vendorOrderRef: ref, priceCents: product.priceCents };
  },

  // Same rules as placing, so the early check catches exactly what the ship
  // date would — which also makes the rescue paths exercisable in tests.
  async preflight({ product, address }) {
    const refusal = mockRefusal(product, address);
    return refusal ? { ok: false, reason: refusal } : { ok: true };
  },
};

function mockRefusal(
  product: OrderRequest["product"],
  address: OrderRequest["address"],
): string | null {
  if (process.env.HANDLED_FORCE_FAIL === "1") {
    return "Vendor reported the item is out of stock for that date.";
  }
  if (!getVendor(product.vendorId)) return "Unknown vendor.";
  if (!product.workFriendly && address.kind === "work") {
    return "Alcohol cannot be delivered to a business address.";
  }
  if (!/^\d{5}(-\d{4})?$/.test(address.postal_code.trim())) {
    return `Vendor rejected the postal code "${address.postal_code}".`;
  }
  return null;
}

/**
 * Which vendors a live integration can actually serve. Anything not listed
 * here still runs through the mock, so adding a partner is one entry plus one
 * adapter file — and a partner going down never takes the whole app with it.
 */
const LIVE_VENDORS: Record<string, () => Promise<FulfillmentAdapter | null>> = {
  // Petal & Post is our flower slot; Florist One fulfils it when configured.
  petal_post: async () => {
    const { floristOneAdapter, floristOneIsLive } = await import("./vendors/florist-one");
    return floristOneIsLive() ? floristOneAdapter : null;
  },
  // Moment Co. is our experiences slot; Giftbit sends the credit.
  moment_co: async () => {
    const { giftbitAdapter, giftbitIsLive } = await import("./vendors/giftbit");
    return giftbitIsLive() ? giftbitAdapter : null;
  },
  // Goody's curated catalogue covers two of our slots — confectionery and
  // bakery under Cocoa Line, spa and home under Hearthside.
  cocoa_line: async () => {
    const { goodyAdapter, goodyIsLive } = await import("./vendors/goody");
    return goodyIsLive() ? goodyAdapter : null;
  },
  hearthside: async () => {
    const { goodyAdapter, goodyIsLive } = await import("./vendors/goody");
    return goodyIsLive() ? goodyAdapter : null;
  },
  // Gilt & Grace is our jewelry and accessories slot; same supplier again.
  gilt_grace: async () => {
    const { goodyAdapter, goodyIsLive } = await import("./vendors/goody");
    return goodyIsLive() ? goodyAdapter : null;
  },
  // Atelier Ink is our personalised slot; Printful prints and ships it.
  atelier_ink: async () => {
    const { printfulAdapter, printfulIsLive } = await import("./vendors/printful");
    return printfulIsLive() ? printfulAdapter : null;
  },
};

export async function adapterFor(vendorId: string): Promise<FulfillmentAdapter> {
  if (process.env.HANDLED_ADAPTER === "mock") return mockAdapter;

  const resolve = LIVE_VENDORS[vendorId];
  if (resolve) {
    const live = await resolve();
    if (live) return live;
  }
  return mockAdapter;
}
