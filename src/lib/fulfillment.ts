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

/**
 * Every gifting partner gets wrapped in this one interface. Swapping the mock
 * for a real 1-800-Flowers / Edible / Goldbelly integration is a matter of
 * writing one of these and registering it below — nothing upstream changes.
 * See docs/VENDORS.md for the shortlist and what each one actually supports.
 */
export interface FulfillmentAdapter {
  id: string;
  placeOrder(req: OrderRequest): Promise<OrderResult>;
}

/**
 * Development adapter. Deterministic: the same mission always gets the same
 * outcome, so demos and tests don't flap. Set HANDLED_FORCE_FAIL=1 to watch
 * the failure path (and the "we caught it, here's a replacement" flow).
 */
export const mockAdapter: FulfillmentAdapter = {
  id: "mock",
  async placeOrder({ mission, product, address }) {
    if (process.env.HANDLED_FORCE_FAIL === "1") {
      return { ok: false, reason: "Vendor reported the item is out of stock for that date." };
    }

    const vendor = getVendor(product.vendorId);
    if (!vendor) return { ok: false, reason: "Unknown vendor." };

    if (!product.workFriendly && address.kind === "work") {
      return { ok: false, reason: "Alcohol cannot be delivered to a business address." };
    }
    if (!/^\d{5}(-\d{4})?$/.test(address.postal_code.trim())) {
      return { ok: false, reason: `Vendor rejected the postal code "${address.postal_code}".` };
    }

    const ref = `${vendor.id.toUpperCase().slice(0, 4)}-${mission.id.slice(-8).toUpperCase()}`;
    return { ok: true, vendorOrderRef: ref, priceCents: product.priceCents };
  },
};

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
