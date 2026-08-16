import "server-only";
import { env } from "./../env";
import type { FulfillmentAdapter, OrderRequest, OrderResult } from "../fulfillment";

/**
 * Printful — personalised, printed-to-order goods, shipped to her.
 *
 * Docs: https://developers.printful.com/docs/
 * Auth: `Authorization: Bearer <token>` — self-serve from the dashboard. An
 * account-level token that spans several stores also needs `X-PF-Store-Id`,
 * which is what PRINTFUL_STORE_ID is for; a single-store token can leave it
 * unset.
 *
 * ── The date is estimated, never promised ────────────────────────
 * Production time plus carrier transit. That is fine, and it is why this
 * partner gets the engraved-and-printed slot and not the flowers: the product
 * carries the honest lead time (`leadDaysOverride`), the picker refuses
 * anything that cannot make the date, and we order on `ship_on` like every
 * other adapter. See docs/VENDORS.md — right for a year-in-review book,
 * wrong for a dated bouquet.
 *
 * ── The design must already exist ────────────────────────────────
 * A Printful order points at a *sync variant* — a product in our own Printful
 * store with the print files already attached. That id lives in `vendorSku`.
 * There is nothing sensible to fall back to when it is missing: inventing an
 * id fails at their end after the money conversation has started, so we
 * refuse before the network call, loudly, days early.
 *
 * ── Draft first, confirm in production ───────────────────────────
 * Printful has no sandbox; its safe mode is the draft order, which costs
 * nothing and produces nothing. So the env flag follows the house convention:
 * anything but PRINTFUL_ENV=production creates drafts you can inspect in
 * their dashboard, and production adds `confirm=1`, which is the real,
 * charged, sent-to-production order.
 *
 * ── Idempotency ──────────────────────────────────────────────────
 * `external_id` is client-supplied and must be unique, so the mission id goes
 * there and a replayed dispatch is rejected by Printful itself. When that
 * happens we fetch the existing order by external id and report *it* — the
 * gift was already on its way, which is a success, not a failure.
 */

const HOST = "https://api.printful.com";
const TIMEOUT_MS = 15_000;

export function printfulIsLive(): boolean {
  return Boolean(env.printfulApiKey);
}

/** Production means confirmed (charged) orders; anything else stays a draft. */
export function confirmOrders(mode = env.printfulEnv): boolean {
  return mode === "production";
}

type PrintfulOrder = {
  id?: number;
  external_id?: string;
  status?: string;
};

type PrintfulResponse<T> = {
  code?: number;
  result?: T;
  error?: { message?: string };
};

async function call<T>(path: string, body?: unknown): Promise<PrintfulResponse<T>> {
  if (!env.printfulApiKey) throw new Error("Printful is not configured.");

  let response: Response;
  try {
    response = await fetch(`${HOST}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${env.printfulApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(env.printfulStoreId ? { "X-PF-Store-Id": env.printfulStoreId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new Error(
      timedOut
        ? `Printful did not answer ${path} within ${TIMEOUT_MS / 1000}s.`
        : `Printful is unreachable: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const json = (await response.json().catch(() => ({}))) as PrintfulResponse<T> & {
    result?: T | string;
  };

  if (!response.ok) {
    const detail =
      (typeof json.result === "string" ? json.result : undefined) ??
      json.error?.message ??
      `HTTP ${response.status}`;
    const error = new Error(`Printful ${path}: ${detail}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return json as PrintfulResponse<T>;
}

/**
 * Builds the order. Exported so a test can hold the line on the two things
 * that must never regress: the parcel goes to her name and address with no
 * way for Printful to contact her — no email, no phone, ever — and the gift
 * message rides on the order, signed by him.
 */
export function orderBody({ mission, product, recipient, address, buyer }: OrderRequest) {
  const message = mission.gift_message.trim();

  return {
    // Mission id doubles as the idempotency key — Printful rejects a repeat.
    external_id: mission.id,
    recipient: {
      name: recipient.name.trim(),
      address1: address.line1,
      address2: address.line2 || undefined,
      city: address.city,
      state_code: address.state,
      country_code: address.country || "US",
      zip: address.postal_code,
    },
    items: [{ sync_variant_id: Number(product.vendorSku), quantity: 1 }],
    ...(message
      ? {
          gift: {
            subject: `A gift from ${(buyer.name || "someone who remembered").trim()}`,
            message,
          },
        }
      : {}),
  };
}

/** A replayed external_id comes back as an error; this is how we spot it. */
function looksLikeDuplicate(message: string): boolean {
  return /external.?id/i.test(message) && /exist|already|duplicate|taken/i.test(message);
}

export const printfulAdapter: FulfillmentAdapter = {
  id: "printful",

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const { mission, product, address } = request;

    if (!product.vendorSku || !/^\d+$/.test(product.vendorSku)) {
      return {
        ok: false,
        reason: `${product.name} has no Printful design on file (vendorSku), so there is nothing to print. Add the sync variant id to the catalogue.`,
      };
    }

    if (!address.line1.trim() || !address.postal_code.trim()) {
      return { ok: false, reason: "Printful ships to a street address, and this one is incomplete." };
    }

    try {
      const confirm = confirmOrders() ? "?confirm=1" : "";
      const created = await call<PrintfulOrder>(`/orders${confirm}`, orderBody(request));
      const ref = created.result?.id;
      return {
        ok: true,
        vendorOrderRef: ref ? String(ref) : mission.id,
        priceCents: product.priceCents,
      };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);

      // The order already exists from a previous run — that is the idempotency
      // guarantee doing its job. Report the existing order, not a failure.
      if (looksLikeDuplicate(message)) {
        try {
          const existing = await call<PrintfulOrder>(
            `/orders/@${encodeURIComponent(mission.id)}`,
          );
          const ref = existing.result?.id;
          return {
            ok: true,
            vendorOrderRef: ref ? String(ref) : mission.id,
            priceCents: product.priceCents,
          };
        } catch {
          // Fall through to the plain failure below.
        }
      }

      return { ok: false, reason: message };
    }
  },
};
