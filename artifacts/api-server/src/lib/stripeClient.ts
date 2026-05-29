import Stripe from "stripe";

/**
 * Returns Stripe credentials.
 *
 * Priority:
 *  1. Direct environment variables (STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY /
 *     STRIPE_WEBHOOK_SECRET) — set by the user in Replit Secrets.
 *  2. Replit Stripe connector — fallback for legacy / team setups.
 */
async function getCredentials() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (secretKey && publishableKey) {
    return { secretKey, publishableKey, webhookSecret: webhookSecret ?? "" };
  }

  // ── Fallback: Replit connector ──────────────────────────────────────────────
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Stripe credentials not found. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in Secrets."
    );
  }

  const isProduction = process.env.REPLIT_DEPLOYMENT === "1";
  const targetEnvironment = isProduction ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });

  const data = await response.json();
  const conn = data.items?.[0];

  if (!conn?.settings?.publishable || !conn?.settings?.secret) {
    throw new Error(
      `Stripe ${targetEnvironment} connector connection not found. Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in Secrets.`
    );
  }

  return {
    secretKey: conn.settings.secret as string,
    publishableKey: conn.settings.publishable as string,
    webhookSecret: (conn.settings.webhook_secret as string | undefined) ?? "",
  };
}

export async function getStripeClient(): Promise<Stripe> {
  const { secretKey } = await getCredentials();
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" as any });
}

export async function getStripePublishableKey(): Promise<string> {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const { secretKey } = await getCredentials();
  return secretKey;
}

export async function getStripeWebhookSecret(): Promise<string> {
  const { webhookSecret } = await getCredentials();
  return webhookSecret;
}
