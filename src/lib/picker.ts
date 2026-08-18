import { PRODUCTS, type Product } from "./catalog";
import type { Address, OccasionKind, Recipient } from "./types";

export type PickInput = {
  recipient: Recipient;
  address: Pick<Address, "kind" | "weekdays_only">;
  occasionKind: OccasionKind;
  budgetCents: number;
  /** Most recent first — used to keep three birthdays in a row from all being roses. */
  recentProductIds?: string[];
  /**
   * Products the member said missed the mark for this recipient. A hard rule,
   * not a score — a known mistake never comes back on its own.
   */
  vetoProductIds?: string[];
};

export type GiftPick = {
  product: Product;
  score: number;
  reasons: string[];
  warnings: string[];
};

function words(csv: string): string[] {
  return csv
    .toLowerCase()
    .split(/[,\n;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function matches(needle: string, haystack: string[]): boolean {
  return haystack.some((h) => h.includes(needle) || needle.includes(h));
}

/**
 * Ranks the catalog for one gift slot. Hard rules eliminate anything that would
 * actually be a problem (allergy, alcohol at an office, over budget); everything
 * else is a soft score so we always have something to fall back to.
 */
export function rankGifts(input: PickInput): GiftPick[] {
  const { recipient, address, occasionKind, budgetCents } = input;
  const likes = words(recipient.likes);
  const dislikes = words(recipient.dislikes);
  const allergies = words(recipient.allergies);
  const recent = input.recentProductIds ?? [];
  const vetoed = new Set(input.vetoProductIds ?? []);

  const ranked: GiftPick[] = [];

  for (const product of PRODUCTS) {
    const reasons: string[] = [];
    const warnings: string[] = [];

    if (vetoed.has(product.id)) continue;
    if (product.priceCents > budgetCents) continue;
    if (address.kind === "work" && !product.workFriendly) continue;

    const allergyHit = product.allergens.find((a) => matches(a, allergies));
    if (allergyHit) continue;

    const dislikeHit = [...product.tags, product.category].find((t) => matches(t, dislikes));
    if (dislikeHit) continue;

    let score = 20;

    if (product.goodFor.includes(occasionKind)) {
      score += 40;
      reasons.push(`Reads right for a ${occasionKind.replace("_", " ")}`);
    }

    const likeHits = product.tags.filter((t) => matches(t, likes));
    if (likeHits.length) {
      score += Math.min(45, likeHits.length * 18);
      reasons.push(`She likes ${likeHits.slice(0, 2).join(" and ")}`);
    }

    // Prefer using most of the budget without maxing it out — 60–95% is the sweet spot.
    const usage = product.priceCents / budgetCents;
    if (usage >= 0.6 && usage <= 0.95) {
      score += 18;
      reasons.push("Uses the budget well");
    } else if (usage < 0.4) {
      score -= 12;
    }

    const recentIndex = recent.indexOf(product.id);
    if (recentIndex === 0) score -= 60;
    else if (recentIndex > 0) score -= 30;

    if (product.needsRecipientPresent && address.kind === "work" && address.weekdays_only === 0) {
      warnings.push("Perishable — make sure someone is at the desk to sign for it.");
    }
    if (product.needsRecipientPresent && address.kind === "home") {
      warnings.push("Perishable — we'll aim for a window when she's home.");
    }
    if (!product.workFriendly) {
      warnings.push("Contains alcohol — adult signature required on delivery.");
    }
    if (product.category === "experience") {
      warnings.push(
        "Comes to you to choose and hand over — she is never contacted, so the surprise holds.",
      );
    }

    if (!reasons.length) reasons.push("Safe, broadly-loved pick");

    ranked.push({ product, score, reasons, warnings });
  }

  ranked.sort((a, b) => b.score - a.score || a.product.priceCents - b.product.priceCents);
  return ranked;
}

/** Top pick, or null when the filters ruled out everything (usually a tight budget). */
export function autoPick(input: PickInput): GiftPick | null {
  return rankGifts(input)[0] ?? null;
}

export type CatalogueEntry = GiftPick & {
  /**
   * Why Auto-Pilot would not choose this one. Empty for anything rankGifts
   * would rank. Browsing is different from delegating: when he is choosing
   * with his own eyes we say what we know and let him decide, rather than
   * silently hiding half the catalogue.
   */
  cautions: string[];
};

/**
 * The whole catalogue for one gift slot, searchable. Products the hard rules
 * would eliminate are returned with their objections spelled out instead of
 * being dropped — Auto-Pilot's picks first, in its order, then the rest.
 */
export function browseGifts(input: PickInput, query = ""): CatalogueEntry[] {
  const { recipient, address, budgetCents } = input;
  const dislikes = words(recipient.dislikes);
  const allergies = words(recipient.allergies);

  const ranked = new Map(rankGifts(input).map((r, order) => [r.product.id, { ...r, order }]));

  const q = query.trim().toLowerCase();
  const hit = (p: Product) =>
    !q ||
    [p.name, p.blurb, p.category, ...p.tags].some((text) => text.toLowerCase().includes(q));

  const entries = PRODUCTS.filter(hit).map((product) => {
    const scored = ranked.get(product.id);
    if (scored) return { ...scored, cautions: [] };

    const cautions: string[] = [];
    if ((input.vetoProductIds ?? []).includes(product.id)) {
      cautions.push("You told us this one missed the mark last time.");
    }
    const allergyHit = product.allergens.find((a) => matches(a, allergies));
    if (allergyHit) {
      cautions.push(`She has listed a ${allergyHit} allergy, and this contains it.`);
    }
    const dislikeHit = [...product.tags, product.category].find((t) => matches(t, dislikes));
    if (dislikeHit) cautions.push(`She has said no to ${dislikeHit}.`);
    if (address.kind === "work" && !product.workFriendly) {
      cautions.push("Not one for the office front desk — send it to her home instead.");
    }
    if (product.priceCents > budgetCents) {
      cautions.push(`Over your $${Math.round(budgetCents / 100)} ceiling.`);
    }

    return { product, score: 0, reasons: [], warnings: [], cautions, order: Infinity };
  });

  entries.sort(
    (a, b) =>
      a.order - b.order ||
      a.cautions.length - b.cautions.length ||
      a.product.name.localeCompare(b.product.name),
  );
  return entries.map(({ product, score, reasons, warnings, cautions }) => ({
    product,
    score,
    reasons,
    warnings,
    cautions,
  }));
}
