/**
 * Promotional Videos profile helpers — shared account, video-specific fields.
 */

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, boostsTable, listingsTable } from "@workspace/db";

export {
  isValidUsernameCandidate,
  normalizeUsername,
  usernameBaseFromName,
} from "./videoProfileUsername";

/**
 * Stop promotional delivery for a listing without inventing refunds.
 * Clears listing boost flags and marks active paid boost campaigns cancelled.
 */
export async function stopVideoPromotion(listingId: number): Promise<{
  stoppedBoostIds: number[];
}> {
  const now = new Date();
  await db
    .update(listingsTable)
    .set({
      isBoosted: false,
      boostExpiresAt: now,
    } as any)
    .where(eq(listingsTable.id, listingId));

  const active = await db
    .select({ id: boostsTable.id })
    .from(boostsTable)
    .where(and(
      eq(boostsTable.listingId, listingId),
      eq(boostsTable.paymentStatus, "paid"),
      gt(boostsTable.expiresAt, now),
    ));

  const ids = active.map((r) => r.id);
  if (ids.length > 0) {
    await db
      .update(boostsTable)
      .set({
        campaignStatus: "cancelled",
        expiresAt: now,
      } as any)
      .where(inArray(boostsTable.id, ids));
  }

  return { stoppedBoostIds: ids };
}

/** Public video eligibility for another user's Videos grid. */
export function publicVideoListingSql() {
  return sql`(
    ${listingsTable.boostVideoUrl} IS NOT NULL
    AND ${listingsTable.moderationStatus} = 'approved'
    AND coalesce(${listingsTable.lifecycleStatus}, 'published') NOT IN ('suspended', 'archived', 'rejected')
    AND (
      (
        ${listingsTable.status} = 'available'
        AND (${listingsTable.stockQuantity} IS NULL OR ${listingsTable.stockQuantity} > 0)
      )
      OR (
        ${listingsTable.status} = 'hidden'
        AND ${listingsTable.price} = 0
      )
    )
  )`;
}
