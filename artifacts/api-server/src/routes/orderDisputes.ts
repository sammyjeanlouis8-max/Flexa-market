import { Router } from "express";
import {
  db,
  orderDisputesTable,
  transactionsTable,
  listingsTable,
  supportThreadsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logAdminAction } from "../lib/auditLogger";

const router = Router();

const DISPUTE_STATUSES = [
  "OPEN",
  "UNDER_REVIEW",
  "WAITING_FOR_SELLER",
  "WAITING_FOR_BUYER",
  "RESOLVED",
  "CLOSED",
] as const;

const DISPUTE_CATEGORIES = [
  "missing_order",
  "incorrect_product",
  "damaged_product",
  "refund_request",
  "other",
] as const;

type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

function isStatus(value: unknown): value is DisputeStatus {
  return typeof value === "string" && (DISPUTE_STATUSES as readonly string[]).includes(value);
}

/**
 * POST /api/order-disputes
 * Buyer opens a Buyer Protection case for an order they purchased.
 * Never auto-refunds — support must act via existing payment tools.
 */
router.post("/order-disputes", requireAuth, async (req, res): Promise<void> => {
  const orderId = Number(req.body?.orderId);
  const category = String(req.body?.category ?? "other");
  const reason = String(req.body?.reason ?? "").trim();
  const buyerNotes = typeof req.body?.buyerNotes === "string" ? req.body.buyerNotes.trim() : null;
  const evidenceUrls = Array.isArray(req.body?.evidenceUrls)
    ? req.body.evidenceUrls.filter((u: unknown) => typeof u === "string").slice(0, 8)
    : [];

  if (!Number.isFinite(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid orderId" });
    return;
  }
  if (!(DISPUTE_CATEGORIES as readonly string[]).includes(category)) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }
  if (reason.length < 8) {
    res.status(400).json({ error: "Please describe the issue (at least 8 characters)." });
    return;
  }

  const [order] = await db
    .select({
      id: transactionsTable.id,
      buyerId: transactionsTable.userId,
      paymentStatus: transactionsTable.paymentStatus,
      listingId: transactionsTable.listingId,
      sellerId: listingsTable.sellerId,
    })
    .from(transactionsTable)
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(eq(transactionsTable.id, orderId))
    .limit(1);

  if (!order || order.buyerId !== req.userId) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  if (order.paymentStatus !== "completed") {
    res.status(400).json({ error: "Only completed purchases can open a dispute." });
    return;
  }
  if (!order.sellerId) {
    res.status(400).json({ error: "Order seller is unavailable." });
    return;
  }

  const [existing] = await db
    .select({ id: orderDisputesTable.id, status: orderDisputesTable.status })
    .from(orderDisputesTable)
    .where(and(
      eq(orderDisputesTable.buyerId, req.userId!),
      eq(orderDisputesTable.orderId, orderId),
    ))
    .limit(1);

  if (existing && !["RESOLVED", "CLOSED"].includes(existing.status)) {
    res.status(409).json({
      error: "A dispute is already open for this order.",
      code: "DISPUTE_EXISTS",
      disputeId: existing.id,
    });
    return;
  }
  if (existing) {
    res.status(409).json({
      error: "A dispute already exists for this order.",
      code: "DISPUTE_EXISTS",
      disputeId: existing.id,
    });
    return;
  }

  // Link a support ticket for agent workflow (reuse existing support inbox).
  const [thread] = await db.insert(supportThreadsTable).values({
    userId: req.userId!,
    subject: `Buyer Protection — Order #${orderId}`,
    status: "open",
    priority: "high",
    category: "orders",
    relatedOrderId: orderId,
    lastMessage: reason.slice(0, 280),
    lastMessageAt: new Date(),
    unreadByAdmin: 1,
  }).returning();

  const [dispute] = await db.insert(orderDisputesTable).values({
    orderId,
    buyerId: req.userId!,
    sellerId: order.sellerId,
    reason,
    category,
    status: "OPEN",
    evidenceUrls,
    buyerNotes,
    supportThreadId: thread?.id ?? null,
  }).returning();

  res.status(201).json({
    id: dispute.id,
    orderId: dispute.orderId,
    status: dispute.status,
    category: dispute.category,
    supportThreadId: dispute.supportThreadId,
    createdAt: dispute.createdAt.toISOString(),
  });
});

/** GET /api/order-disputes/mine — buyer or seller view */
router.get("/order-disputes/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(orderDisputesTable)
    .where(sql`${orderDisputesTable.buyerId} = ${req.userId!} OR ${orderDisputesTable.sellerId} = ${req.userId!}`)
    .orderBy(desc(orderDisputesTable.createdAt))
    .limit(100);

  res.json({
    disputes: rows.map((d) => ({
      id: d.id,
      orderId: d.orderId,
      buyerId: d.buyerId,
      sellerId: d.sellerId,
      reason: d.reason,
      category: d.category,
      status: d.status,
      evidenceUrls: d.evidenceUrls ?? [],
      buyerNotes: d.buyerNotes,
      sellerNotes: d.sellerNotes,
      supportThreadId: d.supportThreadId,
      resolution: d.resolution,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      resolvedAt: d.resolvedAt?.toISOString() ?? null,
      closedAt: d.closedAt?.toISOString() ?? null,
      role: d.buyerId === req.userId ? "buyer" : "seller",
    })),
  });
});

/** PATCH /api/order-disputes/:id/seller-response */
router.patch("/order-disputes/:id/seller-response", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  const notes = String(req.body?.sellerNotes ?? "").trim();
  if (!id || notes.length < 2) {
    res.status(400).json({ error: "sellerNotes required" });
    return;
  }

  const [dispute] = await db.select().from(orderDisputesTable).where(eq(orderDisputesTable.id, id)).limit(1);
  if (!dispute || dispute.sellerId !== req.userId) {
    res.status(404).json({ error: "Dispute not found" });
    return;
  }
  if (["RESOLVED", "CLOSED"].includes(dispute.status)) {
    res.status(409).json({ error: "Dispute is already closed" });
    return;
  }

  const [updated] = await db.update(orderDisputesTable).set({
    sellerNotes: notes,
    status: "UNDER_REVIEW",
    updatedAt: new Date(),
  }).where(eq(orderDisputesTable.id, id)).returning();

  res.json({ id: updated.id, status: updated.status });
});

/** GET /api/admin/order-disputes */
router.get("/admin/order-disputes", requireRole("moderator"), async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const conditions = status && isStatus(status)
    ? [eq(orderDisputesTable.status, status)]
    : [inArray(orderDisputesTable.status, ["OPEN", "UNDER_REVIEW", "WAITING_FOR_SELLER", "WAITING_FOR_BUYER"])];

  const rows = await db
    .select()
    .from(orderDisputesTable)
    .where(and(...conditions))
    .orderBy(desc(orderDisputesTable.createdAt))
    .limit(200);

  res.json({ disputes: rows, count: rows.length });
});

/**
 * PATCH /api/admin/order-disputes/:id
 * Support agents update status / notes. Does NOT release or refund funds.
 */
router.patch("/admin/order-disputes/:id", requireRole("moderator"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }

  const nextStatus = req.body?.status;
  const adminNotes = typeof req.body?.adminNotes === "string" ? req.body.adminNotes.trim() : undefined;
  const resolution = typeof req.body?.resolution === "string" ? req.body.resolution.trim() : undefined;

  if (nextStatus !== undefined && !isStatus(nextStatus)) {
    res.status(400).json({ error: `status must be one of: ${DISPUTE_STATUSES.join(", ")}` });
    return;
  }

  const [dispute] = await db.select().from(orderDisputesTable).where(eq(orderDisputesTable.id, id)).limit(1);
  if (!dispute) { res.status(404).json({ error: "Dispute not found" }); return; }

  const patch: Partial<typeof orderDisputesTable.$inferInsert> = {
    updatedAt: new Date(),
    assignedAdminId: req.userId!,
  };
  if (nextStatus) patch.status = nextStatus;
  if (adminNotes !== undefined) patch.adminNotes = adminNotes;
  if (resolution !== undefined) patch.resolution = resolution;
  if (nextStatus === "RESOLVED") patch.resolvedAt = new Date();
  if (nextStatus === "CLOSED") patch.closedAt = new Date();

  const [updated] = await db.update(orderDisputesTable).set(patch).where(eq(orderDisputesTable.id, id)).returning();

  await logAdminAction(req, {
    actionType: "order_dispute_update",
    actionCategory: "support",
    description: `Dispute #${id} → ${updated.status}`,
    targetType: "order",
    targetId: updated.orderId,
    riskLevel: "high",
  }).catch(() => {});

  res.json({
    id: updated.id,
    status: updated.status,
    resolution: updated.resolution,
    note: "Status updated only. Refunds/releases must use existing payment tools when policy allows.",
  });
});

export default router;
