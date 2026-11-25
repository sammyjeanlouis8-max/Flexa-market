const PLACEHOLDER_HOSTS = ["placehold.co", "via.placeholder.com"];

/**
 * True when a URL/path is a real product photo we can show in the app —
 * not blank, not a placeholder host, and not an empty storage key.
 */
export function isDisplayableListingImageUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const image = url.trim();
  if (!image) return false;
  const lower = image.toLowerCase();
  if (PLACEHOLDER_HOSTS.some((host) => lower.includes(host))) return false;

  if (/^https?:\/\//i.test(image)) {
    try {
      const parsed = new URL(image);
      return Boolean(parsed.hostname) && parsed.pathname.replace(/\/+$/, "").length > 0;
    } catch {
      return false;
    }
  }

  const storageKey = image.match(/^\/api\/storage\/objects\/(.+)$/i)?.[1]
    ?? image.match(/^\/objects\/(.+)$/i)?.[1]
    ?? null;
  if (storageKey != null) {
    return storageKey.replace(/^\/+/, "").trim().length > 0;
  }

  // Wasabi image proxy: /api/storage/wasabi-image?key=<object-key>
  const wasabiMatch = image.match(/^\/api\/storage\/wasabi-image\?([^#]*)$/i);
  if (wasabiMatch) {
    try {
      const key = new URLSearchParams(wasabiMatch[1]).get("key");
      return Boolean(key && key.replace(/^\/+/, "").trim().length > 0);
    } catch {
      return false;
    }
  }

  return false;
}

export function cleanListingImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const image of images) {
    if (typeof image !== "string") continue;
    const trimmed = image.trim();
    if (!isDisplayableListingImageUrl(trimmed)) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export function hasUsableListingImage(images: unknown): boolean {
  return cleanListingImages(images).length > 0;
}

/**
 * Drop listings that have no displayable public photo after formatting
 * (empty arrays, placeholders stripped, or all media-review rejected).
 * Keeps QA/no-photo rows like #160/#163 out of shopper feeds.
 */
export function keepPublicListingsWithPhotos<T extends { images?: unknown }>(
  listings: T[],
): T[] {
  return listings.filter((listing) => hasUsableListingImage(listing.images));
}
