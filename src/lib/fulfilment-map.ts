import { VENDORS, PRODUCTS, type ProductCategory } from "./catalog";
import { floristOneIsLive } from "./vendors/florist-one";
import { giftbitIsLive } from "./vendors/giftbit";

/**
 * Which real-world partner would actually dispatch each category, and how far
 * away that is from working. The catalogue's vendor names are placeholders;
 * this is the map from those placeholders to companies that exist.
 *
 * Kept as data next to the code so the coverage page can never drift from
 * what the adapters actually do.
 */

export type Readiness =
  /** Coded and running now — only needs credentials. */
  | "live"
  /** Public self-serve API. We could build the adapter without asking anyone. */
  | "self-serve"
  /** Real API, but they gate access behind an application or a call. */
  | "apply"
  /** No public API. Commission link or a human places the order. */
  | "manual";

export type Coverage = {
  vendorId: string;
  /** Categories this partner would cover in our catalogue. */
  categories: ProductCategory[];
  partner: string;
  url: string;
  readiness: Readiness;
  /** What the integration can actually promise about the delivery date. */
  dateGuarantee: string;
  /** Honest note on what stands between us and shipping this automatically. */
  gap: string;
};

export const COVERAGE: Coverage[] = [
  {
    vendorId: "petal_post",
    categories: ["flowers"],
    partner: "Florist One",
    url: "https://www.floristone.com/api/",
    readiness: "live",
    dateGuarantee:
      "Exact. `getdeliverydates` returns the dates their 15,000-florist network can actually serve for a ZIP, and we refuse to book anything else. Delivers daily except Sundays and holidays.",
    gap: "None in code. Add FLORIST_ONE_API_USER and FLORIST_ONE_API_PASSWORD and flowers ship for real.",
  },
  {
    vendorId: "moment_co",
    categories: ["experience"],
    partner: "Giftbit",
    url: "https://www.giftbit.com/developers/",
    readiness: "live",
    dateGuarantee:
      "Perfect, because there is no logistics. The credit reaches him on the day, by email — never her, so the surprise is never at risk.",
    gap: "None in code. Add GIFTBIT_API_KEY — the sandbox is self-serve at testbedapp.giftbit.com. Just needs a funded balance before anything sends.",
  },
  {
    vendorId: "atelier_ink",
    categories: ["personalized"],
    partner: "Printful",
    url: "https://developers.printful.com/docs/",
    readiness: "self-serve",
    dateGuarantee:
      "Estimated, not promised. Production plus carrier transit, so we work backwards from a lead time — which is exactly what `leadDaysOverride` already models.",
    gap: "Adapter not written. Self-serve token, REST/JSON, supports a gift field on the order. Best for photo books and engraved keepsakes, not for a dated bouquet.",
  },
  {
    vendorId: "orchard_club",
    categories: ["fruit"],
    partner: "Gift Baskets Overseas",
    url: "https://www.giftbasketsoverseas.com/gift-delivery-api",
    readiness: "apply",
    dateGuarantee:
      "Dated delivery on their side, but we cannot confirm the contract until we have access.",
    gap: "Real gift-delivery API covering fruit, sweets, wine and spa — but access requires an application and their approval. This is the one worth applying for first.",
  },
  {
    vendorId: "cocoa_line",
    categories: ["chocolate", "bakery"],
    partner: "Goody",
    url: "https://developer.ongoody.com/",
    readiness: "live",
    dateGuarantee:
      "Posted on the day, not promised for one. They commit to the send; arrival is a carrier estimate, which is what the product's lead time already models.",
    gap: "None in code. Add GOODY_API_KEY — self-serve, free sandbox. Each product needs its Goody catalogue id before it can ship.",
  },
  {
    vendorId: "hearthside",
    categories: ["spa", "plant"],
    partner: "Goody",
    url: "https://developer.ongoody.com/",
    readiness: "live",
    dateGuarantee:
      "Posted on the day, not promised for one — the same send-date commitment as their confectionery range.",
    gap: "None in code. Shares the Goody adapter with Cocoa Line. Note their recipients may swap a gift, so the category is right but the exact item is not guaranteed.",
  },
  {
    vendorId: "cellar_seven",
    categories: ["wine"],
    partner: "No public API",
    url: "https://www.floristone.com/api/",
    readiness: "manual",
    dateGuarantee:
      "None. Alcohol is state-regulated, needs an adult signature, and cannot go to most offices.",
    gap: "No self-serve wine API exists that we could verify. Realistically a concierge task, or dropped from the catalogue until a partner is signed.",
  },
];

export const READINESS_LABEL: Record<Readiness, string> = {
  live: "Automated now",
  "self-serve": "Buildable today",
  apply: "Needs approval",
  manual: "Human in the loop",
};

export const READINESS_BLURB: Record<Readiness, string> = {
  live: "Coded and tested. Add credentials and it dispatches on its own.",
  "self-serve": "Public API, self-serve signup. Nobody's permission required — just the adapter.",
  apply: "A real API exists, but they decide who gets access.",
  manual: "No API we can use. A person places this order, or we don't offer it.",
};

/** Adds the runtime truth — whether credentials are actually present. */
export function coverageWithStatus() {
  return COVERAGE.map((c) => {
    const vendor = VENDORS[c.vendorId];
    const products = PRODUCTS.filter((p) => p.vendorId === c.vendorId);
    const credentialsPresent =
      c.vendorId === "petal_post"
        ? floristOneIsLive()
        : c.vendorId === "moment_co"
          ? giftbitIsLive()
          : false;

    return {
      ...c,
      vendorName: vendor?.name ?? c.vendorId,
      productCount: products.length,
      examples: products.slice(0, 3).map((p) => p.name),
      /** Live *and* configured — the only state where a gift ships unattended. */
      dispatchingNow: c.readiness === "live" && credentialsPresent,
      credentialsPresent,
    };
  });
}

/** How much of the catalogue could ship unattended today, by product count. */
export function coverageSummary() {
  const rows = coverageWithStatus();
  const total = PRODUCTS.length;
  const count = (r: Readiness) =>
    rows.filter((x) => x.readiness === r).reduce((n, x) => n + x.productCount, 0);

  return {
    total,
    live: count("live"),
    buildable: count("self-serve"),
    needsApproval: count("apply"),
    manual: count("manual"),
    dispatchingNow: rows
      .filter((r) => r.dispatchingNow)
      .reduce((n, r) => n + r.productCount, 0),
  };
}
