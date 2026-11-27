/** Client-side helpers mirroring api-server restaurantCountryPolicy (default-deny). */

export function normalizeRestaurantCountryCode(raw: string | null | undefined): string {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return "";
  const map: Record<string, string> = {
    us: "US",
    usa: "US",
    "united states": "US",
    ca: "CA",
    canada: "CA",
    ht: "HT",
    haiti: "HT",
    haïti: "HT",
  };
  if (map[s]) return map[s];
  if (/^[a-z]{2}$/i.test(s)) return s.toUpperCase();
  return s.toUpperCase().slice(0, 8);
}

/** Countries blocked by default policy until Super Admin explicitly approves. */
export function isRestaurantCountryHardDisabled(country: string): boolean {
  const code = normalizeRestaurantCountryCode(country);
  return code === "US" || code === "CA";
}

/** Registration dropdown: exclude hard-disabled markets. */
export function restaurantRegistrationCountries(all: string[]): string[] {
  return all.filter((c) => !isRestaurantCountryHardDisabled(c));
}
