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
