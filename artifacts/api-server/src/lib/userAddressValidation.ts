export type AddressKind = "delivery" | "ship_from";

export type AddressInput = {
  kind?: string;
  label?: string;
  fullName?: string;
  phone?: string;
  email?: string | null;
  street?: string;
  apartment?: string | null;
  city?: string;
  region?: string;
  postalCode?: string | null;
  country?: string;
  isDefault?: boolean;
};

export type NormalizedAddress = {
  kind: AddressKind;
  label: string;
  fullName: string;
  phone: string;
  email: string | null;
  street: string;
  apartment: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
};

function clean(s: unknown): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

/** Countries where postal code is commonly required for shipping labels. */
const POSTAL_REQUIRED = new Set([
  "USA", "United States", "Canada", "United Kingdom", "France", "Germany",
  "Spain", "Italy", "Australia", "Japan", "Mexico", "Brazil",
]);

export function normalizeAddressInput(raw: AddressInput): { ok: true; value: NormalizedAddress } | { ok: false; error: string } {
  const kind = (clean(raw.kind) || "delivery") as AddressKind;
  if (kind !== "delivery" && kind !== "ship_from") {
    return { ok: false, error: "Invalid address kind" };
  }

  const fullName = clean(raw.fullName);
  const phone = clean(raw.phone);
  const email = clean(raw.email) || null;
  const street = clean(raw.street);
  const apartment = clean(raw.apartment) || null;
  const city = clean(raw.city);
  const region = clean(raw.region);
  const postalCode = clean(raw.postalCode) || null;
  const country = clean(raw.country);
  const label = clean(raw.label) || (kind === "ship_from" ? "Warehouse" : "Home");

  if (fullName.length < 2) return { ok: false, error: "Full name is required" };
  if (phone.replace(/\D/g, "").length < 6) return { ok: false, error: "Valid phone number is required" };
  if (street.length < 3) return { ok: false, error: "Street address is required" };
  if (city.length < 2) return { ok: false, error: "City is required" };
  if (region.length < 2) return { ok: false, error: "State / region is required" };
  if (country.length < 2) return { ok: false, error: "Country is required" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Invalid email" };
  }
  if (POSTAL_REQUIRED.has(country) && !postalCode) {
    return { ok: false, error: "Postal code is required for this country" };
  }

  return {
    ok: true,
    value: {
      kind,
      label: label.slice(0, 40),
      fullName: fullName.slice(0, 120),
      phone: phone.slice(0, 40),
      email: email ? email.slice(0, 160) : null,
      street: street.slice(0, 200),
      apartment: apartment ? apartment.slice(0, 80) : null,
      city: city.slice(0, 100),
      region: region.slice(0, 100),
      postalCode: postalCode ? postalCode.slice(0, 32) : null,
      country: country.slice(0, 80),
      isDefault: raw.isDefault !== false,
    },
  };
}

export function serializeAddress(row: {
  id: number;
  kind: string;
  label: string;
  fullName: string;
  phone: string;
  email: string | null;
  street: string;
  apartment: string | null;
  city: string;
  region: string;
  postalCode: string | null;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    street: row.street,
    apartment: row.apartment,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    country: row.country,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
