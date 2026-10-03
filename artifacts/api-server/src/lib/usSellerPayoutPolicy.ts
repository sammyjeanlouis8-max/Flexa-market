import { getStripeClient } from "./stripeClient";
import { deriveStripeConnectStatus } from "./stripeConnectStatus";

export function isUsSellerCountry(country?: string | null): boolean {
  return ["USA", "United States", "US"].includes((country ?? "").trim());
}

/** Check provider readiness, not just the cached "connected" label. Fail closed. */
export async function requireActiveStripeDestination(stripeAccountId?: string | null): Promise<void> {
  if (!stripeAccountId) throw new Error("STRIPE_SETUP_REQUIRED");
  const stripe = await getStripeClient();
  const account = await stripe.accounts.retrieve(stripeAccountId);
  if ("deleted" in account && account.deleted) throw new Error("STRIPE_SETUP_REQUIRED");
  if (deriveStripeConnectStatus(account) !== "active") throw new Error("STRIPE_SETUP_REQUIRED");
}