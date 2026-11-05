import type { Listing } from "@workspace/api-client-react";

export function formatListingPrice(
  price: number | string | null | undefined,
  currency?: Listing["currency"] | string | null,
): string {
  const amount = typeof price === "number" ? price : Number.parseFloat(String(price ?? 0));
  const safe = Number.isFinite(amount) ? amount : 0;
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code === "HTG" || code === "DOP" || code === "USD" ? code : "USD",
      maximumFractionDigits: code === "HTG" ? 0 : 2,
    }).format(safe);
  } catch {
    return `${safe.toLocaleString()} ${code}`;
  }
}

export function listingLocation(item: {
  city?: string | null;
  location?: string | null;
  country?: string | null;
}): string {
  return [item.city, item.location, item.country].filter(Boolean).join(" · ");
}
