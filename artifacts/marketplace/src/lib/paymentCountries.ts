/** @deprecated Prefer isMonCashPayoutCountry — MonCash seller payouts are Haiti-only. */
export const MONCASH_COUNTRIES = new Set(["Haiti"]);

function normalizeCountry(country?: string | null): string {
  return (country ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
}

/** Seller MonCash payout configuration is allowed only for registered country Haiti. */
export function isMonCashPayoutCountry(country?: string | null): boolean {
  return ["haiti", "ayiti", "ht"].includes(normalizeCountry(country));
}

/** Only Haiti may receive new seller proceeds in FM; wallets remain accessible everywhere. */
export function isStripeOnlySellerCountry(country?: string | null): boolean {
  return !isMonCashPayoutCountry(country);
}

/** An admin's listing-country override must not expose FM outside Haiti. */
export function isStripeOnlySale(sellerCountry?: string | null, listingCountry?: string | null): boolean {
  return isStripeOnlySellerCountry(sellerCountry) || isStripeOnlySellerCountry(listingCountry);
}

export const STRIPE_SUPPORTED_COUNTRIES = new Set([
  "United States", "Canada", "United Kingdom", "Australia", "France", "Germany",
  "Spain", "Italy", "Japan", "Singapore", "Netherlands", "Belgium", "Austria",
  "Denmark", "Finland", "Norway", "Sweden", "Switzerland", "Ireland", "Portugal",
  "New Zealand", "Czech Republic", "Poland", "Romania", "Slovakia", "Slovenia",
  "Hungary", "Bulgaria", "Estonia", "Latvia", "Lithuania", "Luxembourg", "Malta",
  "Cyprus", "Greece", "Croatia", "Iceland", "India", "Indonesia", "Israel",
  "Malaysia", "Mexico", "Philippines", "South Africa", "Thailand",
  "United Arab Emirates", "Saudi Arabia", "Kenya", "Brazil", "Hong Kong",
  "Gibraltar", "Liechtenstein",
]);
