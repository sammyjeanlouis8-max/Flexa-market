/**
 * Phase 4 — Dispute system routes.
 *
 *   POST   /api/deliveries/:id/dispute        — open a dispute (party of the delivery)
 *   GET    /api/deliveries/:id/dispute        — fetch dispute for a delivery (any party)
 *   GET    /api/admin/disputes                — admin list of all disputes
 *   POST   /api/admin/disputes/:id/resolve    — admin resolves a dispute
 *
 * The router is mounted in `app.ts` alongside the other delivery routes.
 *
 * Money movement on resolution piggy-backs on the existing `releaseEscrow()`
 * primitive — admin resolution writes the dispute row, transitions the
 * delivery via the state machine, then dispatches refund or payout exactly
 * like the regular delivery lifecycle. No new payment code path is added.
 */
import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  disputesTable,
  deliveriesTable,
  usersTable,
  disputeOpenInput,
  disputeResolveInput,
  type DeliveryDispute,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import {
  assertTransition,
  isDeliveryStatus,
  InvalidDeliveryTransitionError,
  type DeliveryStatus,
} from "../lib/deliveryStateMachine";
import { releaseEscrow } from "./transactions";
import { logger } from "../lib/logger";
import { logAdminAction } from "../lib/auditLogger";

const router = Router();

/**
 * Resolve which role (buyer / seller / driver) the calling user plays on a
 * given delivery. Returns null if they are not a party — admins are NOT
 * treated as a party here; admin endpoints live under /admin/disputes.
 */
function partyRole(
  userId: number,
  delivery: { buyerId: number; sellerId: number; driverUserId: number | null },
): "buyer" | "seller" | "driver" | null {
  if (delivery.buyerId === userId) return "buyer";
  if (delivery.sellerId === userId) return "seller";
  if (delivery.driverUserId === userId) return "driver";
  return null;
}

// ─── POST /api/deliveries/:id/dispute ────────────────────────────────────────
router.post("/deliveries/:id/dispute", requireAuth, async (req, res): Promise<void> => {
  const deliveryId = Number(req.params.id);
  if (!Number.isFinite(deliveryId)) {
    res.status(400).json({ error: "invalid_delivery_id" });
    return;
  }
  const userId = (req as any).user.id as number;

  const parsed = disputeOpenInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }

  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId));
  if (!delivery) {
    res.status(404).json({ error: "delivery_not_found" });
    return;
  }

  const role = partyRole(userId, delivery);
  if (!role) {
    res.status(403).json({ error: "not_a_party_to_this_delivery" });
    return;
  }

  // Refuse new disputes once the money has already moved by Stripe chargeback
  // path (delivered + sellerPaymentReleased=true → completed). We still allow
  // disputes on `delivered` (before auto-release) and any earlier in-flight
  // state — the state-machine guards which.
  const currentStatus = delivery.status as DeliveryStatus;
  try {
    assertTransition(currentStatus, "disputed");
  } catch (err) {
    if (err instanceof InvalidDeliveryTransitionError) {
      res.status(409).json({ error: "dispute_not_allowed_in_current_status", currentStatus });
      return;
    }
    throw err;
  }

  // Atomically insert the dispute row + flip the delivery status. The
  // partial unique index `delivery_disputes_one_open_per_delivery_uq`
  // guarantees that two concurrent requests can't both succeed — the
  // loser hits a unique-violation and we surface a 409.
  try {
    const inserted = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(disputesTable)
        .values({
          deliveryId,
          openedByUserId: userId,
          openedByRole: role,
          reason: parsed.data.reason,
          description: parsed.data.description,
          evidenceUrls: JSON.stringify(parsed.data.evidenceUrls),
        })
        .returning();
      await tx
        .update(deliveriesTable)
        .set({ status: "disputed", updatedAt: new Date() })
        .where(eq(deliveriesTable.id, deliveryId));
      return row;
    });

    logger.info({ deliveryId, disputeId: inserted.id, role }, "Dispute opened");
    res.status(201).json({ ok: true, dispute: serializeDispute(inserted) });
  } catch (err: any) {
    if (err?.message?.includes("delivery_disputes_one_open_per_delivery_uq")) {
      res.status(409).json({ error: "dispute_already_open" });
      return;
    }
    logger.error({ err, deliveryId }, "Failed to open dispute");
    res.status(500).json({ error: "internal_error" });
  }
});

// ─── GET /api/deliveries/:id/dispute ─────────────────────────────────────────
router.get("/deliveries/:id/dispute", requireAuth, async (req, res): Promise<void> => {
  const deliveryId = Number(req.params.id);
  if (!Number.isFinite(deliveryId)) {
    res.status(400).json({ error: "invalid_delivery_id" });
    return;
  }
  const userId = (req as any).user.id as number;

  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId));
  if (!delivery) {
    res.status(404).json({ error: "delivery_not_found" });
    return;
  }
  if (!partyRole(userId, delivery) && !(req as any).user.isAdmin) {
    res.status(403).json({ error: "forbidden" });
    return;
  }

  const [dispute] = await db
    .select()
    .from(disputesTable)
    .where(eq(disputesTable.deliveryId, deliveryId))
    .orderBy(desc(disputesTable.createdAt))
    .limit(1);

  res.json({ dispute: dispute ? serializeDispute(dispute) : null });
});

// ─── GET /api/admin/disputes ─────────────────────────────────────────────────
router.get("/admin/disputes", requireAdmin, async (req, res): Promise<void> => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
  const conds: any[] = [];
  if (statusFilter && ["open", "under_review", "resolved_buyer", "resolved_seller", "closed"].includes(statusFilter)) {
    conds.push(eq(disputesTable.status, statusFilter));
  }
  const rows = await db
    .select({
      dispute: disputesTable,
      opener: {
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
      },
    })
    .from(disputesTable)
    .leftJoin(usersTable, eq(usersTable.id, disputesTable.openedByUserId))
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(disputesTable.createdAt))
    .limit(200);

  res.json({
    disputes: rows.map((r) => ({
      ...serializeDispute(r.dispute),
      opener: r.opener,
    })),
  });
});

// ─── POST /api/admin/disputes/:id/resolve ────────────────────────────────────
router.post("/admin/disputes/:id/resolve", requireAdmin, async (req, res): Promise<void> => {
  const disputeId = Number(req.params.id);
  if (!Number.isFinite(disputeId)) {
    res.status(400).json({ error: "invalid_dispute_id" });
    return;
  }
  const adminId = (req as any).user.id as number;

  const parsed = disputeResolveInput.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { resolution, resolutionNote } = parsed.data;

  const [dispute] = await db
    .select()
    .from(disputesTable)
    .where(eq(disputesTable.id, disputeId));
  if (!dispute) {
    res.status(404).json({ error: "dispute_not_found" });
    return;
  }
  if (dispute.status === "resolved_buyer" || dispute.status === "resolved_seller" || dispute.status === "closed") {
    res.status(409).json({ error: "dispute_already_resolved", currentStatus: dispute.status });
    return;
  }

  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, dispute.deliveryId));
  if (!delivery) {
    res.status(500).json({ error: "delivery_disappeared" });
    return;
  }

  // Map resolution → target delivery status (validated by the state machine)
  const targetDeliveryStatus: DeliveryStatus =
    resolution === "resolved_buyer"  ? "returned"   :
    resolution === "resolved_seller" ? "completed"  :
    /* closed */                        "cancelled";

  if (!isDeliveryStatus(delivery.status)) {
    res.status(500).json({ error: "delivery_status_unknown", currentStatus: delivery.status });
    return;
  }
  try {
    assertTransition(delivery.status, targetDeliveryStatus);
  } catch (err) {
    if (err instanceof InvalidDeliveryTransitionError) {
      res.status(409).json({
        error: "resolution_blocked_by_state_machine",
        message: err.message,
      });
      return;
    }
    throw err;
  }

  // Persist dispute + delivery status transition atomically.
  await db.transaction(async (tx) => {
    await tx
      .update(disputesTable)
      .set({
        status: resolution,
        resolvedByAdminId: adminId,
        resolvedAt: new Date(),
        resolutionNote,
        updatedAt: new Date(),
      })
      .where(eq(disputesTable.id, disputeId));

    await tx
      .update(deliveriesTable)
      .set({ status: targetDeliveryStatus, updatedAt: new Date() })
      .where(eq(deliveriesTable.id, dispute.deliveryId));
  });

  // Move money. `releaseEscrow` already routes the funds correctly based on
  // its `triggeredBy` arg — "buyer" = refund, "carrier"/"auto" = seller payout.
  // We deliberately do this AFTER the transaction so a payment failure
  // doesn't leave dispute+delivery rolled back into an inconsistent state.
  try {
    if (delivery.transactionId) {
      if (resolution === "resolved_buyer") {
        await releaseEscrow(delivery.transactionId, "buyer");
      } else if (resolution === "resolved_seller") {
        await releaseEscrow(delivery.transactionId, "auto");
      }
      // 'closed' → no money movement; admin reasoned the dispute is invalid.
    }
  } catch (err) {
    logger.error({ err, disputeId, deliveryId: dispute.deliveryId, resolution }, "Escrow release after dispute resolution failed");
    // Don't bubble — dispute is recorded as resolved; ops can re-fire the
    // escrow path manually via the admin transactions screen.
  }

  await logAdminAction(req, {
    actionType: "dispute.resolve",
    actionCategory: "delivery",
    description: `Resolved delivery dispute #${disputeId} as ${resolution}`,
    targetType: "delivery_dispute",
    targetId: disputeId,
    afterState: { resolution, resolutionNote, targetDeliveryStatus },
  }).catch(() => {});

  res.json({ ok: true });
});

// ─── helpers ─────────────────────────────────────────────────────────────────
function serializeDispute(d: DeliveryDispute) {
  let evidence: string[] = [];
  try {
    evidence = JSON.parse(d.evidenceUrls) as string[];
  } catch {
    evidence = [];
  }
  return {
    id: d.id,
    deliveryId: d.deliveryId,
    openedByUserId: d.openedByUserId,
    openedByRole: d.openedByRole,
    reason: d.reason,
    description: d.description,
    evidenceUrls: evidence,
    status: d.status,
    resolvedByAdminId: d.resolvedByAdminId,
    resolvedAt: d.resolvedAt,
    resolutionNote: d.resolutionNote,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export default router;
