import {
  cloudinaryVideoPosterUrl,
  videoThumbnailProxyUrl,
} from "./videoThumbnail";

const PLACEHOLDER_HOSTS = ["placehold.co", "via.placeholder.com"];

function firstUsableProductPhoto(images: unknown): string | null {
  if (!Array.isArray(images)) return null;
  for (const image of images) {
    if (typeof image !== "string") continue;
    const trimmed = image.trim();
    if (!trimmed) continue;
    if (PLACEHOLDER_HOSTS.some((host) => trimmed.includes(host))) continue;
    return trimmed;
  }
  return null;
}

/**
 * Resolve the best poster URL for a promo / boost video listing.
 * Priority: boostImageUrl → first product photo → Cloudinary frame →
 * Wasabi frame extracted during upload (convention path).
 */
export function resolvePromoVideoThumbnail(input: {
  boostImageUrl?: string | null;
  images?: string[] | null;
  boostVideoUrl?: string | null;
}): string | null {
  const boostImage = typeof input.boostImageUrl === "string" ? input.boostImageUrl.trim() : "";
  if (boostImage) return boostImage;

  const productPhoto = firstUsableProductPhoto(input.images);
  if (productPhoto) return productPhoto;

  const cloudinary = cloudinaryVideoPosterUrl(input.boostVideoUrl);
  if (cloudinary) return cloudinary;

  return videoThumbnailProxyUrl(input.boostVideoUrl);
}
