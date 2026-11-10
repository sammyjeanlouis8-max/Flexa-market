/**
 * Admin / Super Admin video moderation for Promotional Videos.
 * Reject and delete are separate actions; both stop promotional delivery.
 */

import { Router } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  listingsTable,
  notificationsTable,
  categoriesTable,
  usersTable,
  favoritesTable,
  promoVideoSavesTable,
} from "@workspace/db";
import { requireRole, getRole } from "../middlewares/auth";
import { logAdminAction } from "../lib/auditLogger";
import { listingInAdminScope } from "../lib/adminScope";
import { stopVideoPromotion } from "../lib/videoProfile";
import { logger } from "../lib/logger";

const router = Router();

function assertVideoListingInScope(
  admin: any,
  listing: { country?: string | null; city?: string | null; location?: string | null },
): string | null {
  // Super Admin: all videos. Country admins: assigned countries (not browsing country).
  if (admin?.isSuperAdmin || getRole(admin) === "superadmin") return null;
  if (!listingInAdminScope(admin, listing as any)) {
    return "This video is outside your country scope";
  }
  return null;
}

async function loadVideoListing(id: number) {
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id)).limit(1);
  if (!listing) return null;
  if (!listing.boostVideoUrl) return null;
  return listing;
}

/**
 * POST /api/admin/videos/:id/reject
 * Body: { reason: string, notes?: string }
 */
router.post("/admin/videos/:id/reject", requireRole("moderator"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid video id" });
    return;
  }
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
  const notes = typeof req.body?.notes === "string" ? req.body.notes.trim().slice(0, 1000) : "";
  if (reason.length < 3) {
    res.status(400).json({ error: "A rejection reason is required" });
    return;
  }

  const listing = await loadVideoListing(id);
  if (!listing) {
    // Idempotent — already gone or not a promo video.
    res.json({ success: true, alreadyMissing: true });
    return;
  }

  const scopeErr = assertVideoListingInScope(req.user, listing);
  if (scopeErr) {
    res.status(403).json({ error: scopeErr });
    return;
  }

  if (listing.moderationStatus === "rejected" && listing.status === "removed") {
    res.json({ success: true, alreadyRejected: true });
    return;
  }

  const previous = {
    moderationStatus: listing.moderationStatus,
    status: listing.status,
    lifecycleStatus: listing.lifecycleStatus,
    isBoosted: listing.isBoosted,
  };

  const wasApproved = listing.moderationStatus === "approved";
  await db.update(listingsTable).set({
    moderationStatus: "rejected",
    moderationRiskLevel: "high",
    moderationReason: notes ? `${reason} — ${notes}` : reason,
    moderationSource: "admin",
    status: "removed",
    moderatedAt: new Date(),
    moderatedBy: req.userId!,
    eligibilityClass: "prohibited",
    lifecycleStatus: "rejected",
    rejectionCode: "PROHIBITED_ILLEGAL",
    isBoosted: false,
  } as any).where(eq(listingsTable.id, id));

  const { stoppedBoostIds } = await stopVideoPromotion(id);

  if (wasApproved) {
    await db.update(categoriesTable).set({ listingCount: sql`GREATEST(${categoriesTable.listingCount} - 1, 0)` }).where(eq(categoriesTable.id, listing.categoryId));
    if (listing.subcategoryId) {
      await db.update(categoriesTable).set({ listingCount: sql`GREATEST(${categoriesTable.listingCount} - 1, 0)` }).where(eq(categoriesTable.id, listing.subcategoryId));
    }
    await db.update(usersTable).set({ listingCount: sql`GREATEST(${usersTable.listingCount} - 1, 0)` }).where(eq(usersTable.id, listing.sellerId));
  }

  await db.insert(notificationsTable).values({
    userId: listing.sellerId,
    actorId: req.userId!,
    type: "moderation_rejected",
    listingId: id,
    message: `Your promotional video was rejected: ${reason}`,
  }).catch(() => {});

  await logAdminAction(req, {
    actionType: "video_reject",
    actionCategory: "moderation",
    description: `Rejected promotional video "${listing.title}"`,
    targetType: "listing",
    targetId: id,
    targetName: listing.title,
    riskLevel: "high",
    metadata: {
      creatorId: listing.sellerId,
      moderatorId: req.userId,
      moderatorRole: getRole(req.user),
      reason,
      notes: notes || null,
      previous,
      resulting: {
        moderationStatus: "rejected",
        status: "removed",
        lifecycleStatus: "rejected",
        isBoosted: false,
      },
      stoppedBoostIds,
    },
  });

  res.json({ success: true });
});

/**
 * POST /api/admin/videos/:id/delete
 * Soft/logical public removal + stop boost. Preserves audit/financial rows.
 * Body: { confirmTitle?: string } optional match of listing title.
 */
router.post("/admin/videos/:id/delete", requireRole("moderator"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid video id" });
    return;
  }

  const listing = await loadVideoListing(id);
  if (!listing) {
    res.json({ success: true, alreadyMissing: true });
    return;
  }

  const scopeErr = assertVideoListingInScope(req.user, listing);
  if (scopeErr) {
    res.status(403).json({ error: scopeErr });
    return;
  }

  const confirmTitle = typeof req.body?.confirmTitle === "string" ? req.body.confirmTitle.trim() : "";
  if (confirmTitle && confirmTitle !== listing.title) {
    res.status(400).json({ error: "Confirmation title does not match this video" });
    return;
  }

  const previous = {
    moderationStatus: listing.moderationStatus,
    status: listing.status,
    lifecycleStatus: listing.lifecycleStatus,
    isBoosted: listing.isBoosted,
  };

  await db.update(listingsTable).set({
    status: "removed",
    moderationStatus: "rejected",
    lifecycleStatus: "archived",
    eligibilityClass: "prohibited",
    isBoosted: false,
    boostVideoUrl: listing.boostVideoUrl, // keep path for owner/audit; public feed gates exclude removed
    moderatedAt: new Date(),
    moderatedBy: req.userId!,
    moderationSource: "admin",
    moderationReason: listing.moderationReason || "Deleted by administrator",
  } as any).where(eq(listingsTable.id, id));

  const { stoppedBoostIds } = await stopVideoPromotion(id);

  // Remove from public liked/saved surfaces (owner history can remain in soft-deleted listing).
  await db.delete(promoVideoSavesTable).where(eq(promoVideoSavesTable.listingId, id)).catch((err) => {
    logger.warn({ err, id }, "video delete: saves cleanup");
  });
  // Favorites kept for audit counts but listing is non-public — optional strip:
  await db.delete(favoritesTable).where(eq(favoritesTable.listingId, id)).catch(() => {});

  await db.insert(notificationsTable).values({
    userId: listing.sellerId,
    actorId: req.userId!,
    type: "moderation_rejected",
    listingId: id,
    message: `Your promotional video "${listing.title}" was deleted by an administrator.`,
  }).catch(() => {});

  await logAdminAction(req, {
    actionType: "video_delete",
    actionCategory: "moderation",
    description: `Deleted promotional video "${listing.title}"`,
    targetType: "listing",
    targetId: id,
    targetName: listing.title,
    riskLevel: "critical",
    metadata: {
      creatorId: listing.sellerId,
      moderatorId: req.userId,
      moderatorRole: getRole(req.user),
      reason: "admin_delete",
      previous,
      resulting: {
        moderationStatus: "rejected",
        status: "removed",
        lifecycleStatus: "archived",
        isBoosted: false,
      },
      stoppedBoostIds,
    },
  });

  res.json({ success: true });
});

/** Also harden listing moderation reject to stop boosts for promo videos. */
export async function hardenListingRejectBoostStop(listingId: number, hasVideo: boolean) {
  if (!hasVideo) return;
  try {
    await stopVideoPromotion(listingId);
  } catch (err) {
    logger.error({ err, listingId }, "hardenListingRejectBoostStop failed");
  }
}

export default router;
