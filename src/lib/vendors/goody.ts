import "server-only";
import { env } from "./../env";
import type { FulfillmentAdapter, OrderRequest, OrderResult } from "../fulfillment";

/**
 * Goody — curated physical gifts, shipped to an address we choose.
 *
 * Docs: https://developer.ongoody.com/
 * Auth: `Authorization: Bearer <key>`. Sandbox and production are separate
 * accounts with separate keys, so the host follows the key.
 *
 * ── Why we do not use their scheduler ────────────────────────────
 * `POST /order_batches` accepts `scheduled_send_on`, and it is tempting to
 * hand them the delivery date at planning time. We don't. The dispatcher
 * already wakes on `mission.ship_on`; letting Goody hold the order too would
 * put two schedulers in charge of one promise, with the authoritative one
 * inside a system we cannot inspect, correct, or replay. So we call them when
 * the gift is due to ship and they send promptly — the same contract every
 * other adapter here honours.
 *
 * ── What they will and will not commit to ────────────────────────
 * They commit to a *send*, never to an arrival. `delivery_eta` comes back as
 * an estimate and the real answer arrives later on the `order.shipped` and
 * `order.delivered` webhooks. Flowers are the only category in this catalogue
 * with a genuinely dated promise; a Goody gift is "posted on the day", which
 * the scheduler already models through the product's lead time.
 *
 * ── The recipient can change the gift ────────────────────────────
 * Goody lets recipients swap a gift for something else in range. That is
 * normal, not a fault: we report the send, not the eventual contents.
 */

function host(): string {
  return env.goodyEnv === "production"
    ? "https://api.ongoody.com/v1"
    : "https://api.sandbox.ongoody.com/v1";
}

export function goodyIsLive(): boolean {
  return Boolean(env.goodyApiKey);
}

/**
 * Goody issues two kinds of key and they mean different businesses.
 *
 * An Automation key spends our own money to send our own gifts. A Commerce
 * key resells their catalogue through us and settles against stored value,
 * which is the arrangement that actually pays. The two need different payment
 * instructions on the order, and the key itself says which it is — reading it
 * from the prefix beats a second env var that can disagree with the key it is
 * meant to describe.
 */
export function isCommerceKey(key = env.goodyApiKey ?? ""): boolean {
  return key.startsWith("goody_token_commerce_");
}

/**
 * The parts of their product record that decide whether we may order it.
 * Measured against a 200-product sample of the live catalogue: 48% require a
 * variant choice and 33% are barred from at least one state, so neither is an
 * edge case to discover in production.
 */
type GoodyProduct = {
  name?: string;
  variants_label?: string | null;
  variants_num_selectable?: number | null;
  variants?: { id?: string; name?: string }[];
  restricted_states?: string[];
  cart_eligible?: boolean;
  price_is_variable?: boolean;
  status?: string;
};

/**
 * Which variant ids to send, or a reason we cannot choose.
 *
 * Their "variants" are a flavour, a colour, a style — a curation decision, not
 * something to guess per order. So the catalogue records our choice and this
 * honours it. Two cases still resolve themselves: a product with no variants
 * needs none, and one offering exactly the required number has made the choice
 * for us. Anything else is a genuine gap in our own catalogue data, and saying
 * so is more useful than silently sending a flavour nobody picked.
 */
export function resolveVariants(
  product: GoodyProduct,
  chosen: string[] | undefined,
  displayName: string,
): { ids: string[] } | { error: string } {
  const needed = product.variants_num_selectable ?? 0;
  if (needed <= 0) return { ids: [] };

  const available = (product.variants ?? []).filter((v) => v.id);

  if (chosen?.length) {
    const known = new Set(available.map((v) => v.id));
    const stale = chosen.filter((id) => !known.has(id));
    if (stale.length) {
      return {
        error: `Our chosen ${product.variants_label?.toLowerCase() ?? "option"} for ${displayName} is no longer offered by Goody.`,
      };
    }
    if (chosen.length !== needed) {
      return {
        error: `${displayName} needs ${needed} ${product.variants_label?.toLowerCase() ?? "option"}(s) chosen and we have recorded ${chosen.length}.`,
      };
    }
    return { ids: chosen };
  }

  // Nothing recorded, but no decision to make either.
  if (available.length === needed) return { ids: available.map((v) => v.id as string) };

  return {
    error: `${displayName} needs a ${product.variants_label?.toLowerCase() ?? "option"} chosen and our catalogue does not record one.`,
  };
}

type OrderBatchResponse = {
  id?: string;
  send_status?: string;
  orders_preview?: { id?: string; status?: string }[];
  error?: { message?: string };
  message?: string;
  errors?: unknown;
};

/** Batch-level states that mean the send is genuinely under way. */
const SENDING_STATUSES = new Set(["pending", "complete"]);

/** Order-level states that mean this particular gift has failed. */
const FAILED_ORDER_STATUSES = new Set(["failed", "canceled"]);

const TIMEOUT_MS = 15_000;

async function call<T>(path: string, body?: unknown): Promise<T> {
  if (!env.goodyApiKey) throw new Error("Goody is not configured.");

  let response: Response;
  try {
    response = await fetch(`${host()}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${env.goodyApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new Error(
      timedOut
        ? `Goody did not answer ${path} within ${TIMEOUT_MS / 1000}s.`
        : `Goody ${path} is unreachable.`,
    );
  }

  const json = (await response.json().catch(() => ({}))) as T & OrderBatchResponse;

  if (!response.ok) {
    const detail = json?.error?.message ?? json?.message ?? `HTTP ${response.status}`;
    throw new Error(`Goody ${path}: ${detail}`);
  }
  return json as T;
}

type GoodyCard = { id?: string; occasions?: (string | { name?: string })[] };

/**
 * Their card designs, fetched once per process.
 *
 * Goody rejects a gift message that arrives without a card, so without one of
 * these the note he wrote is silently dropped. Resolved at runtime rather than
 * pinned in config because card ids are theirs to withdraw, and a stale id
 * would fail on the ship date — the one day there is no runway to fix it.
 */
let cardCache: Promise<string | null> | null = null;

/** Their library is built for corporate gifting, so romantic occasions are thin. */
const PREFERRED_CARD_OCCASIONS = ["Anytime", "Birthday", "Congratulations"];

function cardOccasions(card: GoodyCard): string[] {
  return (card.occasions ?? []).map((o) => (typeof o === "string" ? o : (o.name ?? "")));
}

/** Exported for testing: which card we would choose from a given library. */
export function chooseCard(cards: GoodyCard[]): string | null {
  for (const wanted of PREFERRED_CARD_OCCASIONS) {
    const match = cards.find((c) => c.id && cardOccasions(c).includes(wanted));
    if (match?.id) return match.id;
  }
  return cards.find((c) => c.id)?.id ?? null;
}

async function resolveCardId(): Promise<string | null> {
  if (env.goodyCardId) return env.goodyCardId;

  cardCache ??= (async () => {
    try {
      const result = await call<{ data?: GoodyCard[] }>("/cards");
      return chooseCard(result.data ?? []);
    } catch {
      // A missing card costs us the note, not the gift. Carry on without one
      // rather than failing an order over stationery.
      return null;
    }
  })();

  return cardCache;
}

/**
 * Why a gift cannot be ordered as it stands, or null if it can.
 *
 * Exported and pure so the rules can be tested without a key or a live
 * catalogue. Same contract the florist adapter follows: ask them what they
 * will accept before promising it, rather than sending an order we can
 * already tell will be rejected.
 */
export function rejectionReason(
  product: GoodyProduct,
  state: string,
  displayName: string,
): string | null {
  if (product.status && product.status !== "active") {
    return `${displayName} is no longer available from Goody.`;
  }
  if (product.cart_eligible === false) {
    return `${displayName} cannot be sent directly — Goody only offers it through a gift link.`;
  }
  if (product.price_is_variable) {
    return `${displayName} has no fixed price, so we cannot commit to it in advance.`;
  }
  const barred = (product.restricted_states ?? []).map((s) => s.toUpperCase());
  if (state && barred.includes(state.trim().toUpperCase())) {
    return `Goody cannot ship ${displayName} to ${state.toUpperCase()}.`;
  }
  return null;
}

/**
 * Builds the order batch. Exported so a test can assert the two things that
 * must not regress: the parcel is addressed to her, and the card is signed by
 * him — Goody is the one live partner that ships to the recipient directly,
 * so the sender's identity has to be carried deliberately rather than assumed.
 */
export function orderBatchBody(
  { mission, product, recipient, address, buyer }: OrderRequest,
  cardId: string | null = null,
  variantIds: string[] = [],
) {
  const [first, ...rest] = recipient.name.trim().split(/\s+/);
  const message = mission.gift_message.trim();

  return {
    // A Commerce key resells their catalogue and settles against stored value.
    // An Automation key spends our own card, and must not carry this field.
    ...(isCommerceKey() ? { payment_method_id: "COMMERCE_STORED_VALUE" } : {}),
    // Idempotency: Goody rejects a replayed reference, so a re-run of the
    // dispatcher cannot send the same gift twice.
    customer_reference_id: mission.id,
    from_name: buyer.name || "A friend",
    send_method: "direct_send" as const,
    // A message is only accepted alongside a card, so both move together or
    // neither does — sending a bare message is a 422 from them.
    ...(cardId && message ? { card_id: cardId, message: message.slice(0, 500) } : {}),
    recipients: [
      {
        first_name: first || recipient.name,
        last_name: rest.join(" "),
        mailing_address: {
          first_name: first || recipient.name,
          last_name: rest.join(" "),
          address_1: address.line1,
          address_2: address.line2,
          city: address.city,
          state: address.state,
          postal_code: address.postal_code,
          country: address.country || "US",
        },
      },
    ],
    cart: {
      items: [
        {
          product_id: product.vendorSku,
          quantity: 1,
          ...(variantIds.length ? { variants: variantIds } : {}),
        },
      ],
    },
  };
}

export const goodyAdapter: FulfillmentAdapter = {
  id: "goody",

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const { mission, product, address } = request;

    // Their product_id is a UUID from Goody's own catalogue. Our internal id
    // means nothing to them, so a product without one is refused here rather
    // than rejected later with a vaguer message.
    if (!product.vendorSku) {
      return {
        ok: false,
        reason: `${product.name} has no Goody product id, so it cannot be ordered from them.`,
      };
    }

    if (!address.line1.trim() || !address.postal_code.trim()) {
      return { ok: false, reason: "Goody ships to a street address, and this one is incomplete." };
    }

    try {
      // Ask what they will actually accept before committing to it. Nearly
      // half their catalogue needs a variant chosen and a third is barred
      // from some state, so sending blind would fail on the ship date — the
      // one day there is no runway left to recover.
      const lookup = await call<{ data?: GoodyProduct } & GoodyProduct>(
        `/products/${encodeURIComponent(product.vendorSku)}`,
      );
      const goodyProduct = lookup.data ?? lookup;

      const refusal = rejectionReason(goodyProduct, address.state, product.name);
      if (refusal) return { ok: false, reason: refusal };

      const variants = resolveVariants(goodyProduct, product.vendorVariants, product.name);
      if ("error" in variants) return { ok: false, reason: variants.error };

      // Only worth fetching when there is actually a note to carry.
      const cardId = mission.gift_message.trim() ? await resolveCardId() : null;

      const result = await call<OrderBatchResponse>(
        "/order_batches",
        orderBatchBody(request, cardId, variants.ids),
      );

      const batchStatus = result.send_status ?? "";
      if (!SENDING_STATUSES.has(batchStatus)) {
        return { ok: false, reason: `Goody returned an unexpected batch status: ${batchStatus || "none"}.` };
      }

      // A batch can be accepted while the single order inside it fails —
      // reporting the batch alone would call that a success.
      const order = result.orders_preview?.[0];
      if (order?.status && FAILED_ORDER_STATUSES.has(order.status)) {
        return { ok: false, reason: `Goody could not place the order (${order.status}).` };
      }

      const reference = order?.id ?? result.id;
      if (!reference) {
        return { ok: false, reason: "Goody accepted the batch but returned no order reference." };
      }

      return { ok: true, vendorOrderRef: reference, priceCents: product.priceCents };
    } catch (cause) {
      return {
        ok: false,
        reason: cause instanceof Error ? cause.message : "Goody is unreachable.",
      };
    }
  },
};
