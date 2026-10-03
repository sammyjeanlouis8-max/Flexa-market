/** Countries where MonCash is available as a payout option */
export const MONCASH_COUNTRIES = new Set(["Haiti", "Dominican Republic"]);

/** Only Haiti may receive new seller proceeds in FM; wallets remain accessible everywhere. */
export function isStripeOnlySellerCountry(country?: string | null): boolean {
  const normalized = (country ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
  return !["haiti", "ayiti", "ht"].includes(normalized);
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
