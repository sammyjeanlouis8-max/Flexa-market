import { sql } from "drizzle-orm";
import { db, favoritesTable, listingsTable } from "@workspace/db";
import {
  cleanListingImages,
  hasUsableListingImage,
  isDisplayableListingImageUrl,
} from "./listingImageUrls";

export {
  cleanListingImages,
  hasUsableListingImage,
  isDisplayableListingImageUrl,
};

/**
 * The images column is a PostgreSQL text[]; use the same rules in SQL so
 * invalid legacy rows cannot briefly leak into a public feed before cleanup.
 */
export function listingHasUsableImageSql() {
  return sql<boolean>`EXISTS (
    SELECT 1
    FROM unnest(${listingsTable.images}) AS listing_image
    WHERE btrim(listing_image) <> ''
      AND listing_image NOT ILIKE '%placehold.co%'
      AND listing_image NOT ILIKE '%via.placeholder.com%'
      AND (
        listing_image ~* '^https?://[^[:space:]]+'
        OR listing_image ~ '^/api/storage/objects/[^[:space:]]+'
        OR listing_image ~ '^/objects/[^[:space:]]+'
      )
  )`;
}

/**
 * Hide legacy rows that were created before media was enforced. We keep the
 * row for audit/order references, but it is removed from every marketplace
 * surface and any saved copy is cleared.
 */
export async function runListingMediaCleanup(): Promise<number> {
  const removed = await db
    .update(listingsTable)
    .set({ status: "removed", isBoosted: false })
    .where(sql`
      ${listingsTable.status} = 'available'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(${listingsTable.images}) AS listing_image
        WHERE btrim(listing_image) <> ''
          AND listing_image NOT ILIKE '%placehold.co%'
          AND listing_image NOT ILIKE '%via.placeholder.com%'
          AND (
            listing_image ~* '^https?://[^[:space:]]+'
            OR listing_image ~ '^/api/storage/objects/[^[:space:]]+'
            OR listing_image ~ '^/objects/[^[:space:]]+'
          )
      )
    `)
    .returning({ id: listingsTable.id });

  if (removed.length > 0) {
    await db
      .delete(favoritesTable)
      .where(sql`${favoritesTable.listingId} IN (${sql.join(removed.map(({ id }) => sql`${id}`), sql`, `)})`);
  }

  return removed.length;
}
