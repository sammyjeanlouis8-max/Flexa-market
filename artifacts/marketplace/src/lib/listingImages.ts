/**
 * Client-side listing image URL rules — keep in sync with
 * artifacts/api-server/src/lib/listingMedia.ts
 */

const PLACEHOLDER_HOSTS = ["placehold.co", "via.placeholder.com"];

/** True when a URL/path can actually render as a product photo. */
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

  return false;
}

export function cleanListingImageUrls(images: unknown): string[] {
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

export function hasDisplayableListingImage(images: unknown): boolean {
  return cleanListingImageUrls(images).length > 0;
}
