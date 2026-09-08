import { sql } from "drizzle-orm";
import { db, favoritesTable, listingsTable } from "@workspace/db";

const PLACEHOLDER_HOSTS = ["placehold.co", "via.placeholder.com"];

export function cleanListingImages(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  return images
    .filter((image): image is string => typeof image === "string")
    .map((image) => image.trim())
    .filter((image) =>
      image.length > 0 &&
      !PLACEHOLDER_HOSTS.some((host) => image.includes(host)),
    );
}

export function hasUsableListingImage(images: unknown): boolean {
  return cleanListingImages(images).length > 0;
}

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