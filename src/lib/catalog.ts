import type { AddressKind, OccasionKind } from "./types";

export type Vendor = {
  id: string;
  name: string;
  /** How we'd actually place the order in production. See docs/VENDORS.md. */
  integration: "partner-api" | "affiliate-cart" | "concierge" | "marketplace-api";
  /** Calendar days we place the order ahead of the delivery date. */
  leadDays: number;
  sameDayCapable: boolean;
  /** Order cutoff, vendor-local. Anything after this rolls to the next day. */
  cutoffLocal: string;
  notes: string;
};

export const VENDORS: Record<string, Vendor> = {
  petal_post: {
    id: "petal_post",
    name: "Petal & Post",
    integration: "partner-api",
    leadDays: 2,
    sameDayCapable: true,
    cutoffLocal: "14:00",
    notes: "Florist network. Same-day inside metro ZIPs, 2-day nationwide.",
  },
  orchard_club: {
    id: "orchard_club",
    name: "Orchard Club",
    integration: "partner-api",
    leadDays: 2,
    sameDayCapable: true,
    cutoffLocal: "13:00",
    notes: "Fresh fruit arrangements, hand-delivered from local stores.",
  },
  cocoa_line: {
    id: "cocoa_line",
    name: "Cocoa Line",
    integration: "affiliate-cart",
    leadDays: 3,
    sameDayCapable: false,
    cutoffLocal: "16:00",
    notes: "Chocolate + confection. Heat-sensitive; ships with cold pack May–Sep.",
  },
  cellar_seven: {
    id: "cellar_seven",
    name: "Cellar Seven",
    integration: "affiliate-cart",
    leadDays: 4,
    sameDayCapable: false,
    cutoffLocal: "15:00",
    notes: "Wine + spirits. Adult signature required, not all states served.",
  },
  hearthside: {
    id: "hearthside",
    name: "Hearthside Goods",
    integration: "marketplace-api",
    leadDays: 4,
    sameDayCapable: false,
    cutoffLocal: "17:00",
    notes: "Candles, spa, home. Ships parcel, leave-at-door safe.",
  },
  atelier_ink: {
    id: "atelier_ink",
    name: "Atelier Ink",
    integration: "concierge",
    leadDays: 8,
    sameDayCapable: false,
    cutoffLocal: "12:00",
    notes: "Personalized + engraved. Production time is the long pole.",
  },
  gilt_grace: {
    id: "gilt_grace",
    name: "Gilt & Grace",
    integration: "marketplace-api",
    leadDays: 4,
    sameDayCapable: false,
    cutoffLocal: "17:00",
    notes: "Fine jewelry, watches and accessories. Ships parcel, insured.",
  },
  moment_co: {
    id: "moment_co",
    name: "Moment Co.",
    integration: "partner-api",
    leadDays: 1,
    sameDayCapable: true,
    cutoffLocal: "18:00",
    notes: "Digital experience vouchers — spa days, dinners, classes.",
  },
};

export type ProductCategory =
  | "flowers"
  | "fruit"
  | "chocolate"
  | "bakery"
  | "wine"
  | "spa"
  | "jewelry"
  | "experience"
  | "plant"
  | "personalized";

export type Product = {
  id: string;
  vendorId: string;
  name: string;
  blurb: string;
  category: ProductCategory;
  priceCents: number;
  emoji: string;
  /** Occasion kinds this reads well for. */
  goodFor: OccasionKind[];
  /** Matched against recipient likes/dislikes, free-text. */
  tags: string[];
  allergens: string[];
  /** Alcohol, or anything that would be awkward on an office front desk. */
  workFriendly: boolean;
  /** Perishable — someone has to be there to receive it. */
  needsRecipientPresent: boolean;
  /** Shown on the card so nobody is surprised by the calendar math. */
  leadDaysOverride?: number;
  /** The partner's own catalogue code, when we have a live integration. */
  vendorSku?: string;
  /**
   * What one gift genuinely costs us to land on her doorstep, in cents:
   * the product, plus shipping, plus the supplier's processing fee, plus
   * worst-case sales tax. Quoted live from the supplier rather than assumed,
   * because shipping is per-product and ranged from nothing to twenty-five
   * dollars across six items — pricing off the product line alone put every
   * one of them under water.
   *
   * Any revenue share we negotiate lands on top of the margin below, so
   * treating it as zero here keeps the floor honest.
   */
  landedCostCents?: number;
  /**
   * The variant we have chosen from the partner's options — a flavour, a
   * colour, a style. Some partners will not ship without one, and the choice
   * is ours to make once here rather than the buyer's to make per order: he
   * is picking "a box of truffles", not adjudicating milk against dark. Left
   * unset when the product has no variants, or only one, which the adapter
   * then selects on its own.
   */
  vendorVariants?: string[];
  /**
   * The partner's own photograph of the product. Florist One returns one per
   * product and Giftbit returns one per brand, so with credentials in place
   * this is populated by `npm run sync:catalogue` rather than hand-written —
   * the real picture of the real bouquet, not a stock approximation.
   */
  imageUrl?: string;
  /** Where that image came from, for attribution and cache-busting. */
  imageSource?: string;
};

/** Hand-authored base catalogue. Import `PRODUCTS` below, not this — it lacks the overlay. */
const BASE_PRODUCTS: Product[] = [
  {
    id: "bouquet_signature_roses",
    vendorId: "petal_post",
    name: "Two Dozen Long-Stem Roses",
    blurb: "The one that says you remembered without needing a caption.",
    category: "flowers",
    priceCents: 11900,
    emoji: "🌹",
    imageUrl: "/products/bouquet_signature_roses.jpg",
    goodFor: ["anniversary", "valentines", "birthday", "apology"],
    tags: ["roses", "flowers", "classic", "romantic", "red"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "bouquet_garden_seasonal",
    vendorId: "petal_post",
    name: "Seasonal Garden Bouquet",
    blurb: "Whatever's peaking that week, arranged by someone with taste.",
    category: "flowers",
    priceCents: 7400,
    emoji: "💐",
    goodFor: ["birthday", "just_because", "mothers_day", "anniversary"],
    tags: ["flowers", "seasonal", "colorful", "peonies", "tulips"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "bouquet_desk_petite",
    vendorId: "petal_post",
    name: "Desk-Sized Posy",
    blurb: "Fits on a work desk. Big enough to notice, small enough to carry home.",
    category: "flowers",
    priceCents: 4900,
    emoji: "🌷",
    goodFor: ["birthday", "just_because", "apology"],
    tags: ["flowers", "small", "office", "understated"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "orchid_potted",
    vendorId: "hearthside",
    name: "Potted White Orchid",
    blurb: "Lives for months. Quietly implies you plan ahead.",
    category: "plant",
    priceCents: 8600,
    emoji: "🪴",
    // Lively Root white phalaenopsis
    vendorSku: "6cf449a8-006b-42cf-bb35-9d66d4baeaba",
    landedCostCents: 7739,
    goodFor: ["birthday", "just_because", "mothers_day"],
    tags: ["plant", "orchid", "long-lasting", "minimal"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "fruit_bouquet_celebration",
    vendorId: "orchard_club",
    name: "Celebration Fruit Bouquet",
    blurb: "Pineapple daisies, chocolate-dipped strawberries, the whole show.",
    category: "fruit",
    priceCents: 8900,
    emoji: "🍓",
    imageUrl: "/products/fruit_bouquet_celebration.jpg",
    goodFor: ["birthday", "anniversary", "just_because"],
    tags: ["fruit", "strawberries", "healthy", "shareable", "edible arrangement"],
    allergens: ["dairy", "soy"],
    workFriendly: true,
    needsRecipientPresent: true,
  },
  {
    id: "fruit_box_dipped",
    vendorId: "orchard_club",
    name: "Chocolate-Dipped Strawberry Box",
    blurb: "Twelve of them. Refrigerate on arrival, which she will not do.",
    category: "fruit",
    priceCents: 6400,
    emoji: "🍫",
    goodFor: ["valentines", "anniversary", "birthday", "apology"],
    tags: ["strawberries", "chocolate", "romantic"],
    allergens: ["dairy", "soy"],
    workFriendly: true,
    needsRecipientPresent: true,
  },
  {
    id: "choc_truffle_collection",
    vendorId: "cocoa_line",
    name: "24-Piece Truffle Collection",
    blurb: "Single-origin, in a box that looks more expensive than it was.",
    category: "chocolate",
    priceCents: 10600,
    emoji: "🍬",
    // Vosges 16-piece truffle box, Dark Chocolate
    vendorSku: "95742200-f2b9-4f0b-8bab-363ce23fe6e7",
    landedCostCents: 9587,
    vendorVariants: ["6d24590a-1675-4e0c-9e4c-921d538d9e67"],
    goodFor: ["valentines", "birthday", "christmas", "apology", "just_because"],
    tags: ["chocolate", "truffles", "dark chocolate", "sweets"],
    allergens: ["dairy", "soy", "nuts"],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "cookie_tin_bakery",
    vendorId: "cocoa_line",
    name: "Bakery Cookie Tin",
    blurb: "Warm-adjacent cookies in a tin she'll keep buttons in for a decade.",
    category: "bakery",
    priceCents: 6400,
    emoji: "🍪",
    // Cravory two-dozen assortment, Birthday Box
    vendorSku: "aaee944f-a9d9-44b6-8c01-334852f4c21f",
    landedCostCents: 5775,
    vendorVariants: ["5e8d5317-69e7-4ee6-bffd-6bc67d377430"],
    goodFor: ["birthday", "christmas", "just_because"],
    tags: ["cookies", "baked", "sweets", "shareable"],
    allergens: ["dairy", "gluten", "eggs", "nuts"],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "cake_layer_celebration",
    vendorId: "cocoa_line",
    name: "Six-Layer Celebration Cake",
    blurb: "Arrives cold, thaws to unreasonable. Feeds a small department.",
    category: "bakery",
    priceCents: 12800,
    emoji: "🎂",
    // Caroline's Cakes specialty signature
    vendorSku: "d8a8ee73-fbb1-483b-aedd-d493507453f5",
    landedCostCents: 11550,
    goodFor: ["birthday", "anniversary"],
    tags: ["cake", "birthday", "sweets", "shareable"],
    allergens: ["dairy", "gluten", "eggs"],
    workFriendly: true,
    needsRecipientPresent: true,
  },
  {
    id: "wine_duo_reserve",
    vendorId: "cellar_seven",
    name: "Reserve Red Duo",
    blurb: "Two bottles worth opening on a Tuesday for no reason.",
    category: "wine",
    priceCents: 12400,
    emoji: "🍷",
    goodFor: ["anniversary", "christmas", "birthday"],
    tags: ["wine", "red wine", "cabernet", "date night"],
    allergens: ["sulfites"],
    workFriendly: false,
    needsRecipientPresent: true,
  },
  {
    id: "champagne_celebration",
    vendorId: "cellar_seven",
    name: "Champagne & Chocolate Set",
    blurb: "For the anniversary you'd like to be remembered for remembering.",
    category: "wine",
    priceCents: 16800,
    emoji: "🍾",
    imageUrl: "/products/champagne_celebration.jpg",
    goodFor: ["anniversary", "valentines"],
    tags: ["champagne", "celebration", "romantic", "chocolate"],
    allergens: ["sulfites", "dairy"],
    workFriendly: false,
    needsRecipientPresent: true,
  },
  {
    id: "spa_ritual_box",
    vendorId: "hearthside",
    name: "Spa Ritual Box",
    blurb: "Bath soak, body oil, the good salt. Doubles as a hint to take a night off.",
    category: "spa",
    priceCents: 11200,
    emoji: "🛁",
    // Oak Essentials Ritual Oil
    vendorSku: "8977a8c0-cf24-43be-9be0-b26095a6e9a4",
    landedCostCents: 10164,
    imageUrl: "/products/spa_ritual_box.jpg",
    goodFor: ["birthday", "mothers_day", "just_because", "apology"],
    tags: ["spa", "self care", "bath", "relaxing", "lavender"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "candle_trio",
    vendorId: "hearthside",
    name: "Hand-Poured Candle Trio",
    blurb: "Three scents, zero chance of being wrong about all three.",
    category: "spa",
    priceCents: 6200,
    emoji: "🕯️",
    goodFor: ["birthday", "christmas", "just_because"],
    tags: ["candles", "home", "cozy", "scent"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "cashmere_wrap",
    vendorId: "hearthside",
    name: "Cashmere Travel Wrap",
    blurb: "The blanket that gets stolen from the couch and never returned.",
    category: "spa",
    priceCents: 19100,
    emoji: "🧣",
    // Quince Mongolian cashmere throw
    vendorSku: "1f1d47b7-9179-450e-a2ce-41dedb193cb3",
    landedCostCents: 17325,
    goodFor: ["christmas", "birthday", "anniversary"],
    tags: ["cozy", "cashmere", "warm", "travel", "luxury"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "necklace_birthstone",
    vendorId: "atelier_ink",
    name: "Birthstone Pendant",
    blurb: "Her stone, on a chain, in a box that snaps. Punches above its price.",
    category: "jewelry",
    priceCents: 21500,
    emoji: "💎",
    imageUrl: "/products/necklace_birthstone.jpg",
    goodFor: ["birthday", "anniversary", "valentines"],
    tags: ["jewelry", "necklace", "gold", "birthstone", "keepsake"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "bracelet_engraved",
    vendorId: "atelier_ink",
    name: "Engraved Bar Bracelet",
    blurb: "Up to 16 characters. Choose them more carefully than your last text.",
    category: "personalized",
    priceCents: 14500,
    emoji: "🔗",
    goodFor: ["anniversary", "valentines", "birthday"],
    tags: ["jewelry", "engraved", "personalized", "keepsake"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
    leadDaysOverride: 10,
  },
  {
    id: "photo_book_year",
    vendorId: "atelier_ink",
    name: "Year-in-Review Photo Book",
    blurb: "Linen cover, 40 pages. We'll nag you for photos six weeks out.",
    category: "personalized",
    priceCents: 9900,
    emoji: "📖",
    goodFor: ["anniversary", "christmas"],
    tags: ["photos", "personalized", "sentimental", "keepsake"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
    leadDaysOverride: 14,
  },
  {
    id: "spa_day_voucher",
    vendorId: "moment_co",
    name: "Spa Day for Two",
    blurb: "A whole day. Yes, you're going too. That's the gift.",
    category: "experience",
    priceCents: 29000,
    emoji: "💆",
    goodFor: ["anniversary", "birthday", "mothers_day"],
    tags: ["spa", "experience", "together", "massage"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "dinner_voucher",
    vendorId: "moment_co",
    name: "Chef's Tasting Dinner",
    blurb: "Reservation included, because 'we should go sometime' isn't a plan.",
    category: "experience",
    priceCents: 32000,
    emoji: "🍽️",
    imageUrl: "/products/dinner_voucher.jpg",
    goodFor: ["anniversary", "valentines", "birthday"],
    tags: ["dinner", "experience", "date night", "food"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "class_pottery",
    vendorId: "moment_co",
    name: "Pottery Class for Two",
    blurb: "You will be bad at it. That's most of the charm.",
    category: "experience",
    priceCents: 17000,
    emoji: "🏺",
    goodFor: ["birthday", "just_because", "anniversary"],
    tags: ["class", "experience", "together", "creative", "fun"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "earrings_gold_huggies",
    vendorId: "gilt_grace",
    name: "Gold Huggie Earrings",
    blurb: "Solid gold hoops she will simply never take off.",
    category: "jewelry",
    priceCents: 30300,
    emoji: "💛",
    // Aurate Gold Huggies
    vendorSku: "147194f4-9cbd-439e-b7fe-97a829b62476",
    landedCostCents: 27489,
    goodFor: ["anniversary","valentines","birthday"],
    tags: ["jewelry","gold","earrings","everyday","classic"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "earrings_diamond_studs",
    vendorId: "gilt_grace",
    name: "Diamond Stud Earrings",
    blurb: "Actual diamonds. The sentence says itself.",
    category: "jewelry",
    priceCents: 37900,
    emoji: "💎",
    // Aurate Diana studs
    vendorSku: "1a596763-445d-4166-80e7-720a2fb33258",
    landedCostCents: 34419,
    goodFor: ["anniversary","valentines","birthday"],
    tags: ["jewelry","diamond","earrings","luxury","keepsake"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "pearl_necklace_set",
    vendorId: "gilt_grace",
    name: "Pearl Necklace & Earrings Set",
    blurb: "Freshwater pearls, boxed as a set, zero decisions required of you.",
    category: "jewelry",
    priceCents: 25500,
    emoji: "🤍",
    // Nishi Pearls Silver Trace set
    vendorSku: "0c756da8-9fed-4dc8-90b0-a2052cb73745",
    landedCostCents: 23100,
    goodFor: ["anniversary","birthday","mothers_day"],
    tags: ["jewelry","pearls","necklace","set","elegant"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "necklace_gold_chain",
    vendorId: "gilt_grace",
    name: "Thick Gold Chain Necklace",
    blurb: "The everyday necklace she keeps being complimented on.",
    category: "jewelry",
    priceCents: 10800,
    emoji: "✨",
    // Ana Luisa Hayden
    vendorSku: "0338ba4f-09a7-405d-a114-764673c9d387",
    landedCostCents: 9818,
    goodFor: ["birthday","valentines","just_because"],
    tags: ["jewelry","gold","necklace","everyday","chain"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "bag_mini_chain",
    vendorId: "gilt_grace",
    name: "Designer Mini Chain Bag",
    blurb: "A proper designer bag, in a blue that goes with everything.",
    category: "jewelry",
    priceCents: 41300,
    emoji: "👜",
    // Marc Jacobs Dual Chain Mini, Blue Mist
    vendorSku: "138cee58-e1d0-4156-9ea6-b7f9907d7c98",
    landedCostCents: 37538,
    goodFor: ["anniversary","birthday","christmas"],
    tags: ["bag","designer","handbag","accessories","statement"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "watch_leather_elegant",
    vendorId: "gilt_grace",
    name: "Elegant Ladies' Watch",
    blurb: "Two-tone, understated, tells more than the time.",
    category: "jewelry",
    priceCents: 20500,
    emoji: "⌚",
    // BREDA Esther, Gold/Silver
    vendorSku: "0419f14d-7706-42b8-808c-c2a6009c923a",
    vendorVariants: ["ce63518f-c1df-4c8e-8d7d-412bf4b3c580"],
    landedCostCents: 18596,
    goodFor: ["anniversary","birthday","christmas"],
    tags: ["watch","accessories","gold","timeless"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "sleep_mask_silk_crystal",
    vendorId: "hearthside",
    name: "Swarovski Silk Sleep Mask",
    blurb: "Pure silk with actual crystals. Sleep, but make it an occasion.",
    category: "spa",
    priceCents: 19000,
    emoji: "😴",
    // Drowsy Crystals by Swarovski
    vendorSku: "0e05d936-54d4-46da-a329-c88cf001f4ee",
    landedCostCents: 17210,
    goodFor: ["birthday","mothers_day","just_because"],
    tags: ["silk","sleep","self care","luxury","spa"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
  {
    id: "wellness_sleep_bundle",
    vendorId: "hearthside",
    name: "Beauty Sleep Wellness Set",
    blurb: "Warming eye mask and massage tech. Spa night, no appointment.",
    category: "spa",
    priceCents: 35600,
    emoji: "🌙",
    // Therabody Beauty Sleep Bundle, White
    vendorSku: "10cd8617-1a8b-4537-913a-6f941a29a6cb",
    vendorVariants: ["321f026f-8d62-4cb5-9e34-3b5c5f21e431"],
    landedCostCents: 32340,
    goodFor: ["birthday","mothers_day","anniversary","just_because"],
    tags: ["wellness","spa","sleep","massage","tech","self care"],
    allergens: [],
    workFriendly: true,
    needsRecipientPresent: false,
  },
];

/**
 * Real photography and prices from partner APIs, applied over the base
 * catalogue above. Written by `npm run sync:catalogue` (see
 * src/lib/catalogue-sync.ts) and re-read here on every import — nothing about
 * the sync mutates this file, so a re-run is always safe and the 20 product
 * literals above stay hand-authored and readable.
 */
function withCatalogueOverlay(base: Product[]): Product[] {
  // Node-only file read; harmless no-op in the browser bundle since this
  // module is only ever imported from server code.
  if (typeof window !== "undefined") return base;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const file = path.join(process.cwd(), ".data", "catalogue-overlay.json");
    if (!fs.existsSync(file)) return base;

    const overlay = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
      string,
      Partial<Pick<Product, "imageUrl" | "imageSource" | "vendorSku" | "priceCents" | "blurb">>
    >;

    return base.map((product) => {
      const patch = overlay[product.id];
      return patch ? { ...product, ...patch } : product;
    });
  } catch {
    // A missing or malformed overlay file must never break the catalogue.
    return base;
  }
}

/** The catalogue everyone should import — base products plus real partner photography. */
export const PRODUCTS: Product[] = withCatalogueOverlay(BASE_PRODUCTS);

export const PRODUCTS_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return PRODUCTS_BY_ID.get(id);
}

export function getVendor(id: string): Vendor | undefined {
  return VENDORS[id];
}

/** Calendar days between order placement and delivery for a given product. */
export function leadDaysFor(product: Product): number {
  return product.leadDaysOverride ?? VENDORS[product.vendorId]?.leadDays ?? 5;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  flowers: "Flowers",
  fruit: "Fruit & Berries",
  chocolate: "Chocolate",
  bakery: "Bakery",
  wine: "Wine & Bubbles",
  spa: "Spa & Home",
  jewelry: "Jewelry",
  experience: "Experiences",
  plant: "Plants",
  personalized: "Personalized",
};

export const OCCASION_LABELS: Record<OccasionKind, string> = {
  birthday: "Birthday",
  anniversary: "Anniversary",
  valentines: "Valentine's Day",
  mothers_day: "Mother's Day",
  christmas: "Christmas",
  apology: "Damage Control",
  just_because: "Just Because",
  custom: "Custom",
};

export const ADDRESS_KIND_LABELS: Record<AddressKind, string> = {
  home: "Home",
  work: "Work",
  other: "Other",
};
