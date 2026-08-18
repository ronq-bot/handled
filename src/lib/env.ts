/**
 * One place that knows which real services are wired up.
 *
 * Every integration degrades to a safe local stand-in when its key is absent,
 * so the app runs end-to-end on a laptop with no accounts at all — and turns
 * real the moment you paste a key into `.env.local`. Nothing in the product
 * branches on NODE_ENV; it branches on "do we have credentials".
 */

const read = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
};

/**
 * Absolute origin, needed for Stripe redirects and email links. An explicit
 * HANDLED_APP_URL always wins; otherwise Vercel's own env vars give us the
 * answer — the stable production domain if this is a production deploy, the
 * per-deployment URL for preview builds — so a first deploy needs no manual
 * "guess the URL, then set it" step.
 */
function resolveAppUrl(): string {
  const explicit = read("HANDLED_APP_URL");
  if (explicit) return explicit;

  const productionHost = read("VERCEL_PROJECT_PRODUCTION_URL");
  if (productionHost && read("VERCEL_ENV") === "production") return `https://${productionHost}`;

  const deploymentHost = read("VERCEL_URL");
  if (deploymentHost) return `https://${deploymentHost}`;

  return "http://localhost:3000";
}

export const env = {
  appUrl: resolveAppUrl(),

  stripeSecretKey: read("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: read("STRIPE_WEBHOOK_SECRET"),

  resendApiKey: read("RESEND_API_KEY"),
  emailFrom: read("HANDLED_EMAIL_FROM") ?? "Handled <orders@handledthis.com>",

  databaseUrl: read("DATABASE_URL"),

  floristOneUser: read("FLORIST_ONE_API_USER"),
  floristOnePassword: read("FLORIST_ONE_API_PASSWORD"),
  /**
   * The card each flower order is paid with (their affiliate model: our card
   * pays, they commission back). While the API key is in Test mode this is
   * their documented test card and nothing ships; in Live mode it is the
   * company card — treat these like the Stripe secret. Expiration is MMYYYY.
   */
  floristOneCardNumber: read("FLORIST_ONE_CARD_NUMBER"),
  floristOneCardExp: read("FLORIST_ONE_CARD_EXP"),
  floristOneCardCvv: read("FLORIST_ONE_CARD_CVV"),

  giftbitApiKey: read("GIFTBIT_API_KEY"),
  /** "production" switches off the testbed host. Anything else stays sandboxed. */
  giftbitEnv: read("GIFTBIT_ENV") ?? "testbed",

  /**
   * Either kind of Goody key. A `goody_token_commerce_…` key resells their
   * catalogue and settles against stored value; a `goody_token_user_…` key
   * spends our own card. The adapter reads the prefix rather than asking for
   * a second variable that could contradict it.
   */
  goodyApiKey: read("GOODY_API_KEY"),
  /** "production" switches off the sandbox host. Anything else stays sandboxed. */
  goodyEnv: read("GOODY_ENV") ?? "sandbox",
  /** Pins a specific card design. Left unset, the adapter picks one itself. */
  goodyCardId: read("GOODY_CARD_ID"),

  printfulApiKey: read("PRINTFUL_API_KEY"),
  /** "production" confirms (charges) orders. Anything else creates drafts. */
  printfulEnv: read("PRINTFUL_ENV") ?? "draft",
  /** Only needed with an account-level token that spans several stores. */
  printfulStoreId: read("PRINTFUL_STORE_ID"),

  cronSecret: read("HANDLED_CRON_SECRET"),
} as const;

/**
 * True when any configured vendor places orders that cost real money —
 * Florist One has no sandbox at all, and the others cross over the moment
 * their env flag says production. Used to refuse the "pretend a card is on
 * file" stand-in: simulated payment against real fulfilment would ship
 * gifts nobody paid for.
 */
export function realMoneyVendorConfigured(): boolean {
  return (
    Boolean(env.floristOneUser && env.floristOnePassword) ||
    Boolean(env.goodyApiKey && env.goodyEnv === "production") ||
    Boolean(env.giftbitApiKey && env.giftbitEnv === "production") ||
    Boolean(env.printfulApiKey && env.printfulEnv === "production")
  );
}

export type IntegrationKey =
  | "payments"
  | "email"
  | "database"
  | "florist"
  | "giftcards"
  | "curatedgifts"
  | "personalized";

export type IntegrationStatus = {
  key: IntegrationKey;
  name: string;
  live: boolean;
  /** What happens right now, given whether the key is present. */
  behaviour: string;
  /** Exactly what to add to .env.local to turn it on. */
  needs: string;
  where: string;
};

export function integrationStatus(): IntegrationStatus[] {
  return [
    {
      key: "payments",
      name: "Stripe",
      live: Boolean(env.stripeSecretKey),
      behaviour: env.stripeSecretKey
        ? "Cards are collected through Stripe Checkout and charged per shipment."
        : "A checkbox stands in for a card. The scheduler still refuses to ship without it.",
      needs: "STRIPE_SECRET_KEY",
      where: "dashboard.stripe.com/apikeys — a test key (sk_test_…) works immediately",
    },
    {
      key: "email",
      name: "Resend",
      live: Boolean(env.resendApiKey),
      behaviour: env.resendApiKey
        ? "Order confirmations and failure alerts are sent for real."
        : "Emails are written to the server log instead of being sent.",
      needs: "RESEND_API_KEY",
      where: "resend.com/api-keys — free tier, no card required",
    },
    {
      key: "database",
      name: "Postgres",
      live: Boolean(env.databaseUrl),
      behaviour: env.databaseUrl
        ? "Running on hosted Postgres. The schema is created and migrated on first connection."
        : "Running on a local SQLite file. Fine for one machine, not for a deploy.",
      needs: "DATABASE_URL",
      where: "neon.tech or supabase.com — free tier",
    },
    {
      key: "giftcards",
      name: "Giftbit",
      live: Boolean(env.giftbitApiKey),
      behaviour: env.giftbitApiKey
        ? `Experience credits are sent for real${env.giftbitEnv === "production" ? "" : " (testbed — no money moves)"}.`
        : "Experience gifts are simulated locally.",
      needs: "GIFTBIT_API_KEY",
      where: "testbedapp.giftbit.com — self-serve sandbox, no sales call",
    },
    {
      key: "curatedgifts",
      name: "Goody",
      live: Boolean(env.goodyApiKey),
      behaviour: env.goodyApiKey
        ? `Curated gifts ship to her address for real${env.goodyEnv === "production" ? "" : " (sandbox — nothing is charged)"}.`
        : "Chocolate, bakery, spa and home gifts are simulated locally.",
      needs: "GOODY_API_KEY",
      where: "developer.ongoody.com — self-serve key, free sandbox",
    },
    {
      key: "personalized",
      name: "Printful",
      live: Boolean(env.printfulApiKey),
      behaviour: env.printfulApiKey
        ? `Personalised gifts are printed and shipped to her address${env.printfulEnv === "production" ? "" : " (draft orders — nothing is charged or produced)"}.`
        : "Engraved and printed-to-order gifts are simulated locally.",
      needs: "PRINTFUL_API_KEY",
      where: "printful.com dashboard → Settings → API — self-serve token, no sales call",
    },
    {
      key: "florist",
      name: "Florist One",
      live: Boolean(env.floristOneUser && env.floristOnePassword),
      behaviour:
        env.floristOneUser && env.floristOnePassword
          ? "Flower orders are placed with real florists against real delivery dates."
          : "Orders are simulated locally. Every other rule still applies.",
      needs: "FLORIST_ONE_API_USER + FLORIST_ONE_API_PASSWORD",
      where: "floristone.com/api — apply for API credentials",
    },
  ];
}
