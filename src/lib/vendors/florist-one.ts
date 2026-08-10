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

/**
 * The dispatcher works through due missions one at a time, so a vendor that
 * accepts the connection and then never answers would stall every order behind
 * it — and on a serverless cron that ends as a timeout with nothing placed.
 * Bound the wait so one bad call costs one gift, not the whole run.
 */
const TIMEOUT_MS = 15_000;

async function call<T>(path: string, params: Record<string, string>): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("Florist One credentials are not configured.");

  const url = `${BASE}/${path}?${new URLSearchParams(params).toString()}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: auth, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new Error(
      timedOut
        ? `Florist One did not answer ${path} within ${TIMEOUT_MS / 1000}s.`
        : `Florist One ${path} is unreachable.`,
    );
  }

  if (!response.ok) {
    throw new Error(`Florist One ${path} returned ${response.status}`);
  }

  try {
    return (await response.json()) as T;
  } catch {
    // A 200 carrying an HTML error page is how their edge reports trouble;
    // treating it as "no data" would look like an empty result to callers.
    throw new Error(`Florist One ${path} returned a non-JSON body.`);
  }
}

type DeliveryDatesResponse = { DATES?: string[] };
type PlaceOrderResponse = { ORDERNUMBER?: string; ERROR?: string; STATUS?: string };

/**
 * Dates the network will actually deliver to this ZIP, as `YYYY-MM-DD`.
 *
 * An empty array means they genuinely serve nothing there. If they sent dates
 * we could not read, that is a format change on their side, and it throws —
 * quietly returning "no dates" would be indistinguishable from "ZIP not
 * covered" and would strand every order behind a wrong diagnosis.
 */
export async function availableDeliveryDates(zip: string): Promise<string[]> {
  const data = await call<DeliveryDatesResponse>("getdeliverydates", { zipcode: zip });
  return parseDeliveryDates(data.DATES ?? []);
}

/**
 * Their API speaks MM/DD/YYYY; the rest of this app speaks YYYY-MM-DD.
 *
 * The ranges are checked rather than assumed. Without that, a day-first date
 * like 20/08/2026 would quietly become "2026-20-08" — a string that is the
 * right shape, matches no real day, and would fail a comparison later with a
 * message pointing nowhere near the actual cause.
 */
export function normaliseDate(input: string): string | null {
  const slash = input.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) {
    const [, mm, dd, yyyy] = slash;
    if (Number(mm) < 1 || Number(mm) > 12) return null;
    if (Number(dd) < 1 || Number(dd) > 31) return null;
    return `${yyyy}-${mm}-${dd}`;
  }

  const iso = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, , mm, dd] = iso;
    if (Number(mm) < 1 || Number(mm) > 12) return null;
    if (Number(dd) < 1 || Number(dd) > 31) return null;
    return `${iso[1]}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Turns their raw date list into ours. Separated from the network call so the
 * rule that matters — unreadable input must never look like an empty calendar
 * — can be tested without credentials or a live vendor.
 */
export function parseDeliveryDates(raw: string[]): string[] {
  const parsed = raw.map(normaliseDate).filter((d): d is string => d !== null);

  if (raw.length > 0 && parsed.length === 0) {
    throw new Error(
      `Florist One returned ${raw.length} delivery date(s) in an unrecognised format ` +
        `(e.g. "${raw[0]}"). Refusing to order against dates we cannot read.`,
    );
  }
  return parsed;
}

function toApiDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

export const floristOneAdapter: FulfillmentAdapter = {
  id: "florist_one",

  async placeOrder({ mission, product, recipient, address }: OrderRequest): Promise<OrderResult> {
    // Their catalogue code is the only thing they can match an order against.
    // Our own product id is meaningless to them, so sending it as a fallback
    // just buys a rejection at best — or the wrong bouquet at worst.
    if (!product.vendorSku) {
      return {
        ok: false,
        reason: `${product.name} has no Florist One product code, so it cannot be ordered from them.`,
      };
    }

    try {
      const zip = address.postal_code.trim();

      // Never book a date the network hasn't confirmed it can serve. An empty
      // list is a refusal, not permission: if they name no dates for this ZIP
      // then the date we want is certainly not among them.
      const dates = await availableDeliveryDates(zip);
      if (!dates.includes(mission.deliver_on)) {
        return {
          ok: false,
          reason:
            dates.length === 0
              ? `Florist One serves no delivery dates for ${zip}.`
              : `No florist can deliver to ${zip} on ${mission.deliver_on}. Available: ${dates
                  .slice(0, 3)
                  .join(", ")}.`,
        };
      }

      const result = await call<PlaceOrderResponse>("placeorder", {
        code: product.vendorSku,
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
