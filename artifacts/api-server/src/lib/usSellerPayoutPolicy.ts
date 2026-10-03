import { getStripeClient } from "./stripeClient";
import { deriveStripeConnectStatus } from "./stripeConnectStatus";

const STRIPE_COUNTRY_CODES: Record<string, string> = {
  "united states": "US", usa: "US", us: "US", canada: "CA", ca: "CA",
  mexico: "MX", mexique: "MX", meksik: "MX", mx: "MX",
  "united kingdom": "GB", australia: "AU", france: "FR", germany: "DE",
  spain: "ES", italy: "IT", japan: "JP", singapore: "SG", netherlands: "NL",
  belgium: "BE", austria: "AT", denmark: "DK", finland: "FI", norway: "NO",
  sweden: "SE", switzerland: "CH", ireland: "IE", portugal: "PT",
  "new zealand": "NZ", "czech republic": "CZ", poland: "PL", romania: "RO",
  slovakia: "SK", slovenia: "SI", hungary: "HU", bulgaria: "BG", estonia: "EE",
  latvia: "LV", lithuania: "LT", luxembourg: "LU", malta: "MT", cyprus: "CY",
  greece: "GR", croatia: "HR", iceland: "IS", india: "IN", indonesia: "ID",
  israel: "IL", malaysia: "MY", philippines: "PH", "south africa": "ZA",
  thailand: "TH", "united arab emirates": "AE", "saudi arabia": "SA",
  kenya: "KE", brazil: "BR", "hong kong": "HK", gibraltar: "GI", liechtenstein: "LI",
};

function normalizeCountry(country?: string | null): string {
  return (country ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

export function getStripeOnlySellerCountryCode(country?: string | null): string | null {
  const normalized = normalizeCountry(country);
  return Object.hasOwn(STRIPE_COUNTRY_CODES, normalized) ? STRIPE_COUNTRY_CODES[normalized] : null;
}

export function isStripeOnlySellerCountry(country?: string | null): boolean {
  return !["haiti", "ayiti", "ht"].includes(normalizeCountry(country));
}

/** Mexico is outside Stripe's self-serve cross-border payout regions.
 * Do not assume an approved custom arrangement or reroute via an FM wallet.
 */
export async function requireSupportedStripeSellerCountry(country?: string | null): Promise<void> {
  if (!isStripeOnlySellerCountry(country)) return;
  const code = getStripeOnlySellerCountryCode(country);
  if (!code) throw new Error("STRIPE_COUNTRY_UNSUPPORTED");
  if (code !== "MX") return;
  const stripe = await getStripeClient();
  const platform = await stripe.accounts.retrieve();
  if (platform.country !== "MX") throw new Error("STRIPE_COUNTRY_UNSUPPORTED");
}

/** Check provider readiness, not just the cached "connected" label. Fail closed. */
export async function requireActiveStripeDestination(stripeAccountId?: string | null, sellerCountry?: string | null): Promise<void> {
  if (!stripeAccountId) throw new Error("STRIPE_SETUP_REQUIRED");
  if (sellerCountry !== undefined && isStripeOnlySellerCountry(sellerCountry) && !getStripeOnlySellerCountryCode(sellerCountry)) {
    throw new Error("STRIPE_COUNTRY_UNSUPPORTED");
  }
  const stripe = await getStripeClient();
  const account = await stripe.accounts.retrieve(stripeAccountId);
  if ("deleted" in account && account.deleted) throw new Error("STRIPE_SETUP_REQUIRED");
  const countryCode = getStripeOnlySellerCountryCode(sellerCountry);
  if (countryCode && account.country !== countryCode) throw new Error("STRIPE_ACCOUNT_COUNTRY_MISMATCH");
  if (deriveStripeConnectStatus(account) !== "active") throw new Error("STRIPE_SETUP_REQUIRED");
  if (sellerCountry !== undefined) await requireSupportedStripeSellerCountry(sellerCountry);
}