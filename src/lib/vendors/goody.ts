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

/** Their catalogue is browsable, so a wrong SKU fails late and confusingly. */
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

async function call<T>(path: string, body: unknown): Promise<T> {
  if (!env.goodyApiKey) throw new Error("Goody is not configured.");

  let response: Response;
  try {
    response = await fetch(`${host()}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.goodyApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
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

/**
 * Builds the order batch. Exported so a test can assert the two things that
 * must not regress: the parcel is addressed to her, and the card is signed by
 * him — Goody is the one live partner that ships to the recipient directly,
 * so the sender's identity has to be carried deliberately rather than assumed.
 */
export function orderBatchBody({ mission, product, recipient, address, buyer }: OrderRequest) {
  const [first, ...rest] = recipient.name.trim().split(/\s+/);

  return {
    // Idempotency: Goody rejects a replayed reference, so a re-run of the
    // dispatcher cannot send the same gift twice.
    customer_reference_id: mission.id,
    from_name: buyer.name || "A friend",
    send_method: "direct_send" as const,
    // A message is only accepted alongside a card, so both move together or
    // neither does — sending a bare message is a 422 from them.
    ...(env.goodyCardId && mission.gift_message.trim()
      ? { card_id: env.goodyCardId, message: mission.gift_message.slice(0, 500) }
      : {}),
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
      items: [{ product_id: product.vendorSku, quantity: 1 }],
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
      const result = await call<OrderBatchResponse>("/order_batches", orderBatchBody(request));

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
