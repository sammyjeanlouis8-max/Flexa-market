import { Router, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  shipmentEventsTable,
  shipmentsTable,
  transactionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { AfterShipError, verifyAfterShipSignature } from "../lib/aftership";
import {
  processAfterShipWebhook,
  registerShipmentForOrder,
} from "../lib/shipmentTracking";

const router = Router();

function publicShipment(shipment: typeof shipmentsTable.$inferSelect) {
  return {
    trackingId: shipment.trackingId,
    orderId: shipment.orderId,
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    trackingStatus: shipment.trackingStatus,
    originCountry: shipment.originCountry,
    destinationCountry: shipment.destinationCountry,
    originPostalCode: shipment.originPostalCode,
    destinationPostalCode: shipment.destinationPostalCode,
    estimatedDelivery: shipment.estimatedDelivery,
    lastLocation: shipment.lastLocation,
    lastUpdate: shipment.lastUpdate,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
  };
}

function publicEvent(event: typeof shipmentEventsTable.$inferSelect) {
  return {
    id: event.id,
    eventStatus: event.eventStatus,
    eventDescription: event.eventDescription,
    location: event.location,
    eventTimestamp: event.eventTimestamp,
  };
}

function admin(req: Request): boolean {
  return !!(req.user?.isAdmin || req.user?.isSuperAdmin);
}

function idFromRequest(req: Request): number {
  return parseInt(Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id!, 10);
}

async function register(req: Request, res: Response): Promise<void> {
  const orderId = idFromRequest(req);
  const carrier = String(req.body?.carrier ?? "").trim();
  const trackingNumber = String(req.body?.trackingNumber ?? "").trim();
  if (!orderId || !carrier || !trackingNumber) {
    res.status(400).json({ error: "Carrier and tracking number are required" });
    return;
  }
  const [tx] = await db.select({ sellerUserId: transactionsTable.sellerUserId }).from(transactionsTable).where(eq(transactionsTable.id, orderId));
  if (!tx) { res.status(404).json({ error: "Order not found" }); return; }
  const sellerId = tx.sellerUserId;
  if (!sellerId || (!admin(req) && sellerId !== req.userId)) {
    res.status(403).json({ error: "Only the seller can add tracking" });
    return;
  }
  try {
    const result = await registerShipmentForOrder(orderId, sellerId, carrier, trackingNumber);
    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.trackingId, result.shipmentId));
    res.status(201).json({
      ok: true,
      shipmentId: result.shipmentId,
      status: result.status,
      shipment: shipment ? publicShipment(shipment) : null,
    });
  } catch (error) {
    const e = error instanceof AfterShipError ? error : new AfterShipError("Unable to register shipment");
    const status = e.statusCode ?? (e.code === "AFTERSHIP_NOT_CONFIGURED" ? 503 : 502);
    res.status(status).json({ error: e.message, code: e.code });
  }
}

router.post("/orders/:id/tracking", requireAuth, register);
// Retain the existing PATCH API shape while routing it through the provider
// registration and persistence path.
router.patch("/orders/:id/tracking", requireAuth, register);

router.get("/orders/:id/tracking", requireAuth, async (req, res): Promise<void> => {
  const orderId = idFromRequest(req);
  if (!orderId) { res.status(400).json({ error: "Invalid order id" }); return; }
  const [order] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, orderId));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  const allowed = admin(req) || order.userId === req.userId || order.sellerUserId === req.userId;
  if (!allowed) { res.status(403).json({ error: "Access denied" }); return; }
  const [shipment] = await db.select().from(shipmentsTable)
    .where(eq(shipmentsTable.orderId, orderId)).orderBy(asc(shipmentsTable.createdAt)).limit(1);
  if (!shipment) {
    res.json({ orderId, orderStatus: order.orderStatus, paymentStatus: order.paymentStatus, shipment: null, events: [] });
    return;
  }
  const events = await db.select().from(shipmentEventsTable)
    .where(eq(shipmentEventsTable.shipmentId, shipment.trackingId))
    .orderBy(asc(shipmentEventsTable.eventTimestamp));
  res.json({
    orderId,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    shipment: publicShipment(shipment),
    events: events.map(publicEvent),
  });
});

router.get("/shipments/:trackingId", requireAuth, async (req, res): Promise<void> => {
  const trackingId = parseInt(Array.isArray(req.params.trackingId) ? req.params.trackingId[0]! : (req.params.trackingId ?? ""), 10);
  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.trackingId, trackingId));
  if (!shipment) { res.status(404).json({ error: "Shipment not found" }); return; }
  if (!admin(req) && shipment.buyerId !== req.userId && shipment.sellerId !== req.userId) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  const events = await db.select().from(shipmentEventsTable)
    .where(eq(shipmentEventsTable.shipmentId, trackingId))
    .orderBy(asc(shipmentEventsTable.eventTimestamp));
  res.json({ shipment: publicShipment(shipment), events: events.map(publicEvent) });
});

/**
 * The webhook is deliberately mounted with express.raw in app.ts. A missing
 * secret is a hard failure (503), never an implicit unauthenticated fallback.
 */
export async function afterShipWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!process.env.AFTERSHIP_WEBHOOK_SECRET?.trim()) {
    res.status(503).json({ error: "AFTERSHIP_WEBHOOK_SECRET is not configured" });
    return;
  }
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  const signature = String(req.header("aftership-hmac-sha256") ?? "");
  if (!verifyAfterShipSignature(raw, signature)) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "Invalid webhook payload" });
    return;
  }
  try {
    const applied = await processAfterShipWebhook(payload);
    // Unknown tracking IDs are acknowledged without exposing whether an order
    // exists. The provider may deliver a webhook before a local retry persists.
    res.status(applied ? 200 : 202).json({ ok: true, applied });
  } catch {
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

export default router;