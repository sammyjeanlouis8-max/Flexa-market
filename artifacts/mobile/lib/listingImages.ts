/**
 * Client-side mirror of api-server listingMedia rules.
 * Placeholders do not count as product images.
 */
const PLACEHOLDER_HOSTS = ["placehold.co", "via.placeholder.com"];

export function cleanListingImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image): image is string => typeof image === "string")
    .map((image) => image.trim())
    .filter(
      (image) =>
        image.length > 0 &&
        !PLACEHOLDER_HOSTS.some((host) => image.includes(host)),
    );
}

export function hasUsableListingImage(images: unknown): boolean {
  return cleanListingImages(images).length > 0;
}

/** Prefer first usable URL; skip broken placeholders. */
export function pickCoverImage(images: unknown): string | null {
  const cleaned = cleanListingImages(images);
  return cleaned[0] ?? null;
}

export function listingIsPubliclyVisible(listing: {
  images?: unknown;
  status?: string | null;
}): boolean {
  if (listing.status && listing.status !== "available") return false;
  return hasUsableListingImage(listing.images);
}
