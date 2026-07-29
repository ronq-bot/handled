import "server-only";
import { env } from "./../env";
import type { FulfillmentAdapter, OrderRequest, OrderResult } from "../fulfillment";

/**
 * Florist One — the one gifting partner with a public API that will commit to
 * a specific delivery date, which is the whole premise of this product.
 *
 * Docs: https://www.floristone.com/api/
 * Auth: HTTP Basic with the API user/password they issue.
 *
 * The important call is `getdeliverydates` — we never assume a date is
 * available, we ask. If the date we planned isn't offered we fail loudly
 * rather than silently shipping on the wrong day.
 */

const BASE = "https://www.floristone.com/api/rest/flowershop";

function authHeader(): string | null {
  if (!env.floristOneUser || !env.floristOnePassword) return null;
  const raw = `${env.floristOneUser}:${env.floristOnePassword}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

export function floristOneIsLive(): boolean {
  return authHeader() !== null;
}

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("Florist One credentials are not configured.");

  const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`;
  const response = await fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Florist One ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

type DeliveryDatesResponse = { DATES?: string[] };
type PlaceOrderResponse = { ORDERNUMBER?: string; ERROR?: string; STATUS?: string };

/** Dates the network will actually deliver to this ZIP, as `YYYY-MM-DD`. */
export async function availableDeliveryDates(zip: string): Promise<string[]> {
  const data = await call<DeliveryDatesResponse>("getdeliverydates", { zipcode: zip });
  return (data.DATES ?? []).map(normaliseDate).filter(Boolean) as string[];
}

/** Their API speaks MM/DD/YYYY; the rest of this app speaks YYYY-MM-DD. */
function normaliseDate(input: string): string | null {
  const slash = input.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1]}-${slash[2]}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : null;
}

function toApiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export const floristOneAdapter: FulfillmentAdapter = {
  id: "florist_one",

  async placeOrder({ mission, product, recipient, address }: OrderRequest): Promise<OrderResult> {
    try {
      const zip = address.postal_code.trim();

      // Never book a date the network hasn't confirmed it can serve.
      const dates = await availableDeliveryDates(zip);
      if (dates.length > 0 && !dates.includes(mission.deliver_on)) {
        return {
          ok: false,
          reason: `No florist can deliver to ${zip} on ${mission.deliver_on}. Available: ${dates
            .slice(0, 3)
            .join(", ")}.`,
        };
      }

      const result = await call<PlaceOrderResponse>("placeorder", {
        // Their catalogue code lives on our product record; fall back to the id.
        code: product.vendorSku ?? product.id,
        deliverydate: toApiDate(mission.deliver_on),
        recipientname: recipient.name,
        recipientaddress1: address.line1,
        recipientaddress2: address.line2,
        recipientcity: address.city,
        recipientstate: address.state,
        recipientzip: zip,
        recipientcountry: address.country || "US",
        cardmessage: mission.gift_message.slice(0, 240),
        ordernumber: mission.id,
      });

      if (result.ERROR) return { ok: false, reason: `Florist One: ${result.ERROR}` };
      if (!result.ORDERNUMBER) {
        return { ok: false, reason: "Florist One accepted the request but returned no order number." };
      }

      return {
        ok: true,
        vendorOrderRef: result.ORDERNUMBER,
        priceCents: product.priceCents,
      };
    } catch (cause) {
      return {
        ok: false,
        reason: cause instanceof Error ? cause.message : "Florist One is unreachable.",
      };
    }
  },
};
