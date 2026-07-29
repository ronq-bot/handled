import "server-only";
import { env } from "./../env";
import type { FulfillmentAdapter, OrderRequest, OrderResult } from "../fulfillment";

/**
 * Giftbit — a choice of experience, delivered to the buyer.
 *
 * Docs: https://www.giftbit.com/developers/ (blueprint: github.com/Giftbit/Giftbit-API-Docs)
 * Auth: `Authorization: Bearer <key>`.
 *
 * ── Who receives this, and why ──────────────────────────────────
 * The credit goes to **him**, never to her. That is not a limitation of the
 * API; it is the product. Handled's entire value is that she has no idea any
 * of this is happening, so an email landing in her inbox — "here is a credit
 * from your husband" — destroys the thing she is paying for. See
 * docs/MARKETING.md: *never imply we'll email or contact the recipient*.
 *
 * So the flow is: on the day, he receives a credit for the amount he budgeted,
 * redeemable across the regional catalogue. He picks what he actually wants
 * and arranges it himself — the booking, the table, the surprise. We remove
 * the deciding and the remembering; he keeps the delivering.
 *
 * ── Idempotency and funding ─────────────────────────────────────
 * `POST /campaign` takes a client-supplied `id` that must be unique across all
 * orders, so we pass the mission id: Giftbit itself rejects a replayed
 * dispatch. A campaign sits in `AWAITING_FUNDS` when the balance is empty —
 * that returns HTTP 200, so we check for it explicitly and treat it as a
 * failure, because an unfunded campaign never actually sends.
 */

const HOST =
  env.giftbitEnv === "production"
    ? "https://api.giftbit.com/papi/v1"
    : "https://api-testbed.giftbit.com/papi/v1";

export function giftbitIsLive(): boolean {
  return Boolean(env.giftbitApiKey);
}

/** Statuses that mean the credit is genuinely on its way. */
const SENDING_STATUSES = new Set(["API_CREATING", "CAMPAIGN_CREATED", "SENT"]);

type CampaignResponse = {
  campaign?: { uuid?: string; id?: string; status?: string };
  info?: { code?: string; message?: string };
  error?: { message?: string };
};

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  if (!env.giftbitApiKey) throw new Error("Giftbit is not configured.");

  const response = await fetch(`${HOST}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.giftbitApiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });

  const json = (await response.json().catch(() => ({}))) as T & CampaignResponse;

  if (!response.ok) {
    const detail = json?.error?.message ?? json?.info?.message ?? `HTTP ${response.status}`;
    throw new Error(`Giftbit ${path}: ${detail}`);
  }
  return json as T;
}

/** Brands redeemable at a given price — used to build the catalogue. */
export async function brandsAt(priceCents: number, region = 1) {
  const query = new URLSearchParams({
    region: String(region),
    min_price_in_cents: String(priceCents),
    max_price_in_cents: String(priceCents),
    limit: "50",
  });
  return call<{ brands: { brand_code: string; name: string }[] }>(`/brands?${query}`, {
    method: "GET",
  });
}

/**
 * Builds the campaign body. Exported so a test can assert the one thing that
 * must never regress: the contact is the buyer, and the recipient's details
 * appear nowhere in the payload.
 */
export function campaignBody({ mission, product, recipient, buyer }: OrderRequest) {
  const [firstname, ...rest] = (buyer.name || buyer.email).trim().split(/\s+/);

  return {
    // Mission id doubles as the idempotency key — Giftbit rejects a repeat.
    id: mission.id,
    price_in_cents: product.priceCents,
    subject: `Your credit for ${recipient.name}`,
    message:
      `This is the ${product.name} you set aside. Choose whatever suits, then surprise her ` +
      `with it — she has no idea, and that is rather the point.`,
    // Whole regional catalogue unless we've pinned a brand, so he has a choice.
    ...(product.vendorSku ? { brand_codes: [product.vendorSku] } : { region: 1 }),
    contacts: [
      {
        firstname: firstname || "there",
        lastname: rest.join(" "),
        email: buyer.email,
      },
    ],
  };
}

export const giftbitAdapter: FulfillmentAdapter = {
  id: "giftbit",

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const { mission, product, buyer } = request;

    if (!buyer.email.trim()) {
      return { ok: false, reason: "Your account has no email address to send the credit to." };
    }

    try {
      const result = await call<CampaignResponse>("/campaign", {
        method: "POST",
        body: campaignBody(request),
      });

      const status = result.campaign?.status ?? "";

      if (status === "AWAITING_FUNDS") {
        return {
          ok: false,
          reason:
            "Giftbit accepted the order but the account has no funds, so it will not send. Top up the balance.",
        };
      }

      if (!SENDING_STATUSES.has(status)) {
        return { ok: false, reason: `Giftbit returned an unexpected status: ${status || "none"}.` };
      }

      const reference = result.campaign?.uuid ?? result.campaign?.id ?? mission.id;
      return { ok: true, vendorOrderRef: reference, priceCents: product.priceCents };
    } catch (cause) {
      return {
        ok: false,
        reason: cause instanceof Error ? cause.message : "Giftbit is unreachable.",
      };
    }
  },
};
