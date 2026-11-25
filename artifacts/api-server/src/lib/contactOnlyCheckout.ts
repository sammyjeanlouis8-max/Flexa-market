import { categoriesTable, db } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { isContactOnlyListing } from "../../../../lib/marketplace-policy/contact-only.mjs";

export const contactOnlyError = { code: "CONTACT_ONLY_LISTING", error: "Contact the seller about this listing." };

export async function hasContactOnlyListing(listings: { categoryId: number; subcategoryId: number | null }[]) {
  const ids = [...new Set(listings.map((listing) => listing.subcategoryId ?? listing.categoryId))];
  if (!ids.length) return false;
  const categories = await db.select({ slug: categoriesTable.slug }).from(categoriesTable)
    .where(inArray(categoriesTable.id, ids));
  return categories.some(({ slug }) => isContactOnlyListing({ subcategorySlug: slug }));
}
