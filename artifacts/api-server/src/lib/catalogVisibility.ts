import { sql } from "drizzle-orm";
import { db, listingsTable } from "@workspace/db";

/** Exclude sellers the viewer has blocked from catalog feeds. */
export function excludeBlockedSellers(conditions: any[], viewerId?: number | null): void {
  if (!viewerId) return;
  conditions.push(sql`NOT EXISTS (
    SELECT 1 FROM user_blocks ub
    WHERE ub.blocker_id = ${viewerId} AND ub.blocked_id = ${listingsTable.sellerId}
  )`);
}

/** Exclude listings / sellers the viewer has hidden from catalog feeds. */
export function excludeHiddenContent(conditions: any[], viewerId?: number | null): void {
  if (!viewerId) return;
  conditions.push(sql`NOT EXISTS (
    SELECT 1 FROM listing_hides lh
    WHERE lh.user_id = ${viewerId}
      AND (
        lh.listing_id = ${listingsTable.id}
        OR lh.seller_id = ${listingsTable.sellerId}
      )
  )`);
}

/** Apply both block + hide filters for authenticated catalog browsing. */
export function appendViewerCatalogFilters(conditions: any[], viewerId?: number | null): void {
  excludeBlockedSellers(conditions, viewerId);
  excludeHiddenContent(conditions, viewerId);
}

/** True when either user has blocked the other (messaging must stop). */
export async function isDirectMessagingBlocked(userA: number, userB: number): Promise<boolean> {
  if (!Number.isInteger(userA) || !Number.isInteger(userB) || userA <= 0 || userB <= 0 || userA === userB) {
    return false;
  }
  const result = await db.execute(sql`
    SELECT 1 FROM user_blocks
    WHERE (blocker_id = ${userA} AND blocked_id = ${userB})
       OR (blocker_id = ${userB} AND blocked_id = ${userA})
    LIMIT 1
  `);
  return (result.rows?.length ?? 0) > 0;
}

/** True when the viewer has hidden this listing or its seller. */
export async function isListingHiddenForViewer(
  viewerId: number,
  listingId: number,
  sellerId: number,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM listing_hides
    WHERE user_id = ${viewerId}
      AND (listing_id = ${listingId} OR seller_id = ${sellerId})
    LIMIT 1
  `);
  return (result.rows?.length ?? 0) > 0;
}
