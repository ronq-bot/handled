import "server-only";
import { env } from "./../env";
import type { FulfillmentAdapter, OrderRequest, OrderResult } from "../fulfillment";

/**
 * Florist One — flowers with a genuinely dated promise, US-wide.
 *
 * Docs: https://florist.one/api/documentation/
 * Auth: HTTP Basic with the API user/password they issue.
 *
 * The important call is `checkdeliverydate` — we never assume a date is
 * available, we ask. If the date we planned isn't offered we fail loudly
 * rather than silently shipping on the wrong day.
 *
 * ── How they get paid ────────────────────────────────────────────
 * Their affiliate model: each order is paid with OUR card, tokenized per
 * order through Authorize.net (they hand out a public client key via
 * `getauthorizenetkey`; the token is single-use), and they pay the ~20%
 * commission back. The card lives in FLORIST_ONE_CARD_* env vars — while
 * the API key is in Test mode that is their documented test card and no
 * flowers ship; before Live mode it becomes the company card, so those
 * variables are as sensitive as the Stripe key.
 *
 * ── The order total is theirs to compute ─────────────────────────
 * `placeorder` requires an `ordertotal` that includes their delivery fee and
 * tax, so we ask `gettotal` first rather than guessing — a wrong total is a
 * rejected order. That total is also the true landed cost of the bouquet,
 * which is worth logging every time we see it.
 *
 * ── Keeping the white label ──────────────────────────────────────
 * The customer structure gets the buyer's name (the florist needs a real
 * sender) but OUR operations email, never his — any correspondence from the
 * supplier lands with us, and Handled remains the only brand he ever hears
 * from. See the no-supplier-names rule in scripts/verify.mjs.
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

type FloristOneError = { errors?: string[] };

async function call<T>(
  path: string,
  params: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const auth = authHeader();
  if (!auth) throw new Error("Florist One credentials are not configured.");

  const query = Object.keys(params).length ? `?${new URLSearchParams(params).toString()}` : "";
  const url = `${BASE}/${path}${query}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: auth,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
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

  let json: T & FloristOneError;
  try {
    json = (await response.json()) as T & FloristOneError;
  } catch {
    // A non-JSON body is how their edge reports trouble; treating it as
    // "no data" would look like an empty result to callers.
    throw new Error(`Florist One ${path} returned a non-JSON body (HTTP ${response.status}).`);
  }

  if (json.errors?.length) throw new Error(`Florist One ${path}: ${json.errors.join("; ")}`);
  if (!response.ok) throw new Error(`Florist One ${path} returned ${response.status}`);
  return json;
}

type DeliveryDatesResponse = { DATES?: string[]; DATE_AVAILABLE?: boolean };

/**
 * Dates the network will actually deliver to this ZIP, as `YYYY-MM-DD`.
 *
 * The endpoint is `checkdeliverydate` — without a `date` parameter it returns
 * the full deliverable list (the earlier name we shipped against,
 * `getdeliverydates`, does not exist; the live API taught us that).
 *
 * An empty array means they genuinely serve nothing there. If they sent dates
 * we could not read, that is a format change on their side, and it throws —
 * quietly returning "no dates" would be indistinguishable from "ZIP not
 * covered" and would strand every order behind a wrong diagnosis.
 */
export async function availableDeliveryDates(zip: string): Promise<string[]> {
  const data = await call<DeliveryDatesResponse>("checkdeliverydate", { zipcode: zip });
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

type OrderTotalResponse = { ORDERTOTAL?: number };

/**
 * The grand total they will charge our card — product plus their delivery
 * fee plus tax. `placeorder` requires it verbatim, and it is the bouquet's
 * true landed cost.
 */
export async function orderTotalFor(
  code: string,
  price: number,
  zip: string,
): Promise<number> {
  const products = JSON.stringify([{ CODE: code, PRICE: price, RECIPIENT: { ZIPCODE: zip } }]);
  const data = await call<OrderTotalResponse>("gettotal", { products });
  if (typeof data.ORDERTOTAL !== "number") {
    throw new Error("Florist One gettotal returned no ORDERTOTAL.");
  }
  return data.ORDERTOTAL;
}

type AuthorizeNetKeyResponse = {
  USERNAME?: string;
  AUTHORIZENET_KEY?: string;
  AUTHORIZENET_URL?: string;
};

/**
 * Payment rides on a single-use Authorize.net token. Their `AUTHORIZENET_URL`
 * says which gateway environment the account points at — `jstest` means the
 * sandbox — and we tokenize against the matching API host rather than
 * hardcoding one, so the same code is correct in Test and Live mode.
 */
export async function tokenizeCard(): Promise<string> {
  if (!env.floristOneCardNumber || !env.floristOneCardExp || !env.floristOneCardCvv) {
    throw new Error(
      "No payment card is configured for Florist One — set FLORIST_ONE_CARD_NUMBER, " +
        "FLORIST_ONE_CARD_EXP (MMYYYY) and FLORIST_ONE_CARD_CVV. In Test mode, use " +
        "their documented test card.",
    );
  }

  const key = await call<AuthorizeNetKeyResponse>("getauthorizenetkey", {});
  if (!key.USERNAME || !key.AUTHORIZENET_KEY) {
    throw new Error("Florist One returned no Authorize.net key.");
  }

  const gateway = key.AUTHORIZENET_URL?.includes("jstest")
    ? "https://apitest.authorize.net/xml/v1/request.api"
    : "https://api2.authorize.net/xml/v1/request.api";

  const response = await fetch(gateway, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      securePaymentContainerRequest: {
        merchantAuthentication: { name: key.USERNAME, clientKey: key.AUTHORIZENET_KEY },
        data: {
          type: "TOKEN",
          id: `handled-${crypto.randomUUID().slice(0, 12)}`,
          token: {
            cardNumber: env.floristOneCardNumber,
            expirationDate: env.floristOneCardExp,
            cardCode: env.floristOneCardCvv,
          },
        },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  // Authorize.net prefixes its JSON with a BOM; strip it before parsing.
  const text = (await response.text()).replace(/^﻿/, "");
  const json = JSON.parse(text) as {
    opaqueData?: { dataValue?: string };
    messages?: { resultCode?: string; message?: { text?: string }[] };
  };

  if (json.messages?.resultCode !== "Ok" || !json.opaqueData?.dataValue) {
    throw new Error(
      `Card tokenization failed: ${json.messages?.message?.[0]?.text ?? "no token returned"}.`,
    );
  }
  return json.opaqueData.dataValue;
}

/**
 * Builds the placeorder body. Exported so a test can hold the two lines that
 * must never regress: the recipient's address rides inside the product (that
 * is where the flowers go), and the customer block carries the buyer's name
 * with OUR operations email — the supplier must have no route to surprise
 * either of them.
 */
export function placeOrderBody(
  { mission, product, recipient, address, buyer }: OrderRequest,
  nonce: string,
  orderTotal: number,
) {
  return {
    customer: {
      NAME: (buyer.name || "Handled Orders").slice(0, 100),
      // Deliberately ours, not his: supplier receipts and queries come to
      // operations, and Handled stays the only brand the buyer hears from.
      EMAIL: env.emailFrom.replace(/^.*<|>$/g, ""),
      ADDRESS1: "1900 Trade St",
      ADDRESS2: "",
      CITY: "Charlotte",
      STATE: "NC",
      COUNTRY: "US",
      PHONE: "7045550100",
      ZIPCODE: "28202",
      IP: "8.8.8.8",
    },
    products: [
      {
        CODE: product.vendorSku,
        PRICE: product.priceCents / 100,
        DELIVERYDATE: mission.deliver_on,
        // Their hard cap is 200 characters; ours is 250 in the UI.
        CARDMESSAGE: mission.gift_message.slice(0, 200) || "With love.",
        RECIPIENT: {
          NAME: recipient.name.slice(0, 100),
          INSTITUTION: "",
          ADDRESS1: address.line1,
          ADDRESS2: address.line2 || "",
          CITY: address.city,
          STATE: address.state,
          ZIPCODE: address.postal_code.trim(),
          COUNTRY: address.country || "US",
          PHONE: "0000000000",
        },
      },
    ],
    ccinfo: { AUTHORIZENET_TOKEN: nonce },
    ordertotal: orderTotal,
  };
}

type PlaceOrderResponse = { ORDERNO?: number | string; ORDERNUMBER?: number | string };

export const floristOneAdapter: FulfillmentAdapter = {
  id: "florist_one",

  /**
   * Asks their network, days early, whether the planned date is still
   * deliverable to her ZIP — the same gate ordering enforces. A definite
   * "no dates" or "not that date" refuses; network trouble throws.
   */
  async preflight({ mission, product, address }) {
    if (!product.vendorSku) {
      return { ok: false, reason: `${product.name} has no Florist One product code.` };
    }
    const zip = address.postal_code.trim();
    const dates = await availableDeliveryDates(zip);
    if (!dates.includes(mission.deliver_on)) {
      return {
        ok: false,
        reason:
          dates.length === 0
            ? `Florist One serves no delivery dates for ${zip}.`
            : `No florist can deliver to ${zip} on ${mission.deliver_on}.`,
      };
    }
    return { ok: true };
  },

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const { mission, product, address } = request;

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

      const total = await orderTotalFor(product.vendorSku, product.priceCents / 100, zip);
      const nonce = await tokenizeCard();

      const result = await call<PlaceOrderResponse>(
        "placeorder",
        {},
        placeOrderBody(request, nonce, total),
      );

      const orderNumber = result.ORDERNO ?? result.ORDERNUMBER;
      if (!orderNumber) {
        return { ok: false, reason: "Florist One accepted the request but returned no order number." };
      }

      console.info(
        `florist-one: order ${orderNumber} placed for mission ${mission.id}; landed cost $${total.toFixed(2)}.`,
      );
      return {
        ok: true,
        vendorOrderRef: String(orderNumber),
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
