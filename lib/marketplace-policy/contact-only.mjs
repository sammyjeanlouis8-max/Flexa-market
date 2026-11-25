// Subcategory slugs only — never the parent "vehicles" category.
const contactOnlySlugs = new Set([
  "cars",
  "car-rentals",
  "houses-for-sale",
  "houses-for-rent",
]);

export function isContactOnlyListing(listing) {
  const category = listing?.subcategorySlug || listing?.subcategory || listing?.categorySlug || listing?.category;
  return typeof category === "string" && contactOnlySlugs.has(category.trim().toLowerCase().replace(/\s+/g, "-"));
}
