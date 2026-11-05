/** Shared video URL validation for Today's Deals boosted cards. */
export function isValidProductVideoUrl(url: string | null | undefined): boolean {
  if (typeof url !== "string") return false;
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith("http://") || u.startsWith("https://")) return true;
  if (u.startsWith("/api/") || u.startsWith("/objects/") || u.startsWith("/api/storage/")) return true;
  return false;
}

export function resolveValidProductVideoUrl(listing: {
  boostVideoUrl?: string | null;
  listingVideoUrl?: string | null;
}): string | null {
  if (isValidProductVideoUrl(listing.boostVideoUrl)) return listing.boostVideoUrl!.trim();
  if (isValidProductVideoUrl(listing.listingVideoUrl)) return listing.listingVideoUrl!.trim();
  return null;
}
