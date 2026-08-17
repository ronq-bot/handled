import "server-only";
import { env, realMoneyVendorConfigured } from "./env";
import { getDb, nowIso } from "./db";
import type { User } from "./types";

/**
 * Stripe, over plain fetch — no SDK.
 *
 * Card collection uses Checkout in `setup` mode: we hand the user off to a
 * Stripe-hosted page, so no card data ever touches this app and there is no
 * client-side Stripe bundle to ship. Shipments are then charged off-session
 * against the saved payment method, which is exactly the model this product
 * needs (charge on the ship date, months after the card was added).
 */

const API = "https://api.stripe.com/v1";

type StripeResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function stripe<T>(
  path: string,
  params?: Record<string, string>,
  method: "GET" | "POST" = "POST",
  idempotencyKey?: string,
): Promise<StripeResult<T>> {
  if (!env.stripeSecretKey) return { ok: false, error: "Stripe is not configured." };

  const body = params ? new URLSearchParams(params).toString() : undefined;
  const url = method === "GET" && body ? `${API}${path}?${body}` : `${API}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${env.stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: method === "POST" ? body : undefined,
      cache: "no-store",
    });

    const json = await response.json();
    if (!response.ok) {
      return { ok: false, error: json?.error?.message ?? `Stripe returned ${response.status}` };
    }
    return { ok: true, data: json as T };
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Stripe is unreachable." };
  }
}

export function paymentsAreLive(): boolean {
  return Boolean(env.stripeSecretKey);
}

/**
 * True when this user can actually be charged. Falls back to the local flag —
 * but never when a configured vendor spends real money: the checkbox stand-in
 * would then place real orders nobody paid for, so it refuses until Stripe is
 * wired up.
 */
export function userCanBeCharged(user: User): boolean {
  if (!paymentsAreLive()) {
    if (realMoneyVendorConfigured()) return false;
    return user.payment_ok === 1;
  }
  return Boolean(user.stripe_payment_method_id);
}

async function ensureCustomer(user: User): Promise<StripeResult<string>> {
  if (user.stripe_customer_id) return { ok: true, data: user.stripe_customer_id };

  const created = await stripe<{ id: string }>("/customers", {
    email: user.email,
    name: user.name || user.email,
    "metadata[user_id]": user.id,
  });
  if (!created.ok) return created;

  const db = await getDb();
  await db.run(`UPDATE users SET stripe_customer_id = ? WHERE id = ?`, [created.data.id, user.id]);
  return { ok: true, data: created.data.id };
}

/** Hosted page where the user adds a card. Returns a URL to redirect to. */
export async function startCardSetup(user: User): Promise<StripeResult<string>> {
  const customer = await ensureCustomer(user);
  if (!customer.ok) return customer;

  const session = await stripe<{ url: string }>("/checkout/sessions", {
    mode: "setup",
    customer: customer.data,
    "payment_method_types[0]": "card",
    success_url: `${env.appUrl}/api/stripe/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.appUrl}/dashboard/settings?card=cancelled`,
  });

  if (!session.ok) return session;
  return { ok: true, data: session.data.url };
}

/**
 * Called on return from Checkout — persists the payment method it created.
 * The session must belong to the signed-in user's Stripe customer: the
 * session id arrives as a query parameter, and a card should only ever land
 * on the account that started the setup.
 */
export async function completeCardSetup(
  sessionId: string,
  user: User,
): Promise<StripeResult<string>> {
  const session = await stripe<{ setup_intent: string; customer: string }>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}`,
    undefined,
    "GET",
  );
  if (!session.ok) return session;
  if (!user.stripe_customer_id || session.data.customer !== user.stripe_customer_id) {
    return { ok: false, error: "This checkout session does not belong to your account." };
  }

  const intent = await stripe<{ payment_method: string; status: string }>(
    `/setup_intents/${encodeURIComponent(session.data.setup_intent)}`,
    undefined,
    "GET",
  );
  if (!intent.ok) return intent;
  if (!intent.data.payment_method) {
    return { ok: false, error: `Card setup did not complete (${intent.data.status}).` };
  }

  // Make it the default for future off-session charges.
  await stripe(`/customers/${encodeURIComponent(session.data.customer)}`, {
    "invoice_settings[default_payment_method]": intent.data.payment_method,
  });

  const db = await getDb();
  await db.run(
    `UPDATE users SET stripe_payment_method_id = ?, payment_ok = 1 WHERE stripe_customer_id = ?`,
    [intent.data.payment_method, session.data.customer],
  );

  return { ok: true, data: intent.data.payment_method };
}

export async function removeCard(user: User): Promise<void> {
  if (user.stripe_payment_method_id && paymentsAreLive()) {
    await stripe(`/payment_methods/${encodeURIComponent(user.stripe_payment_method_id)}/detach`);
  }
  const db = await getDb();
  await db.run(`UPDATE users SET stripe_payment_method_id = '', payment_ok = 0 WHERE id = ?`, [
    user.id,
  ]);
}

export type ChargeResult =
  | { ok: true; reference: string }
  | { ok: false; reason: string };

/**
 * Charge for one shipment, off-session. The mission id plus an attempt
 * counter is sent as Stripe's `Idempotency-Key`: a crashed run replaying the
 * SAME attempt gets the same key, so it can never double-charge — while a
 * genuine retry after a decline (which recorded a failure, bumping the
 * counter) gets a fresh key instead of Stripe replaying the old decline for
 * 24 hours.
 */
export async function chargeForMission(
  user: User,
  missionId: string,
  amountCents: number,
  description: string,
  attempt = 0,
): Promise<ChargeResult> {
  if (!paymentsAreLive()) {
    if (realMoneyVendorConfigured()) {
      return {
        ok: false,
        reason:
          "A live vendor is configured but Stripe is not — refusing to simulate payment for a real order. Set STRIPE_SECRET_KEY.",
      };
    }
    return user.payment_ok === 1
      ? { ok: true, reference: `local-${missionId}` }
      : { ok: false, reason: "No payment method on file — we couldn't place the order." };
  }

  if (!user.stripe_customer_id || !user.stripe_payment_method_id) {
    return { ok: false, reason: "No card on file — add one before this date comes around." };
  }

  const intent = await stripe<{ id: string; status: string }>(
    "/payment_intents",
    {
      amount: String(amountCents),
      currency: "usd",
      customer: user.stripe_customer_id,
      payment_method: user.stripe_payment_method_id,
      off_session: "true",
      confirm: "true",
      description,
      "metadata[mission_id]": missionId,
    },
    "POST",
    `mission-charge-${missionId}-a${attempt}`,
  );

  if (!intent.ok) return { ok: false, reason: `Card declined: ${intent.error}` };
  if (intent.data.status !== "succeeded") {
    return { ok: false, reason: `Payment did not clear (${intent.data.status}).` };
  }

  const db = await getDb();
  await db.run(`UPDATE missions SET charge_ref = ?, updated_at = ? WHERE id = ?`, [
    intent.data.id,
    nowIso(),
    missionId,
  ]);

  return { ok: true, reference: intent.data.id };
}
