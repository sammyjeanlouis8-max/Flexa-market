import { getStripeClient } from "./stripeClient";
import { deriveStripeConnectStatus } from "./stripeConnectStatus";

export function getStripeOnlySellerCountryCode(country?: string | null): "US" | "CA" | "MX" | null {
  const normalized = (country ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  if (["usa", "united states", "us"].includes(normalized)) return "US";
  if (["canada", "ca"].includes(normalized)) return "CA";
  if (["mexico", "mexique", "meksik", "mx"].includes(normalized)) return "MX";
  return null;
}

export function isStripeOnlySellerCountry(country?: string | null): boolean {
  return getStripeOnlySellerCountryCode(country) !== null;
}

/** Mexico is outside Stripe's self-serve cross-border payout regions.
 * Do not assume an approved custom arrangement or reroute via an FM wallet.
 */
export async function requireSupportedStripeSellerCountry(country?: string | null): Promise<void> {
  if (getStripeOnlySellerCountryCode(country) !== "MX") return;
  const stripe = await getStripeClient();
  const platform = await stripe.accounts.retrieve();
  if (platform.country !== "MX") throw new Error("STRIPE_COUNTRY_UNSUPPORTED");
}

/** Check provider readiness, not just the cached "connected" label. Fail closed. */
export async function requireActiveStripeDestination(stripeAccountId?: string | null, sellerCountry?: string | null): Promise<void> {
  if (!stripeAccountId) throw new Error("STRIPE_SETUP_REQUIRED");
  const stripe = await getStripeClient();
  const account = await stripe.accounts.retrieve(stripeAccountId);
  if ("deleted" in account && account.deleted) throw new Error("STRIPE_SETUP_REQUIRED");
  const countryCode = getStripeOnlySellerCountryCode(sellerCountry);
  if (countryCode && account.country !== countryCode) throw new Error("STRIPE_ACCOUNT_COUNTRY_MISMATCH");
  if (deriveStripeConnectStatus(account) !== "active") throw new Error("STRIPE_SETUP_REQUIRED");
  await requireSupportedStripeSellerCountry(sellerCountry);
}