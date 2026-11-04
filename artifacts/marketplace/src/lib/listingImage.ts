/**
 * Responsive <img> hints for listing media.
 * Does not rewrite URLs — object-storage / absolute image URLs have no safe
 * CDN resize params in this stack, so we only set browser loading hints.
 */

export type ListingImageVariant = "card" | "mosaic" | "detail";

export type ListingImageProps = {
  loading: "eager" | "lazy";
  decoding: "async";
  fetchPriority: "high" | "auto";
  sizes: string;
};

const SIZES: Record<ListingImageVariant, string> = {
  // Home / search grid cards
  card: "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px",
  // Multi-tile mosaic previews
  mosaic: "(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 200px",
  // Listing detail hero
  detail: "(max-width: 768px) 100vw, min(640px, 50vw)",
};

export function listingImageProps(opts: {
  priority?: boolean;
  variant?: ListingImageVariant;
} = {}): ListingImageProps {
  const variant = opts.variant ?? "card";
  const priority = !!opts.priority;
  return {
    loading: priority ? "eager" : "lazy",
    decoding: "async",
    fetchPriority: priority ? "high" : "auto",
    sizes: SIZES[variant],
  };
}
