import { and, asc, eq, notInArray, or, sql } from "drizzle-orm";
import {
  db,
  listingsTable,
  notificationsTable,
  shipmentEventsTable,
  shipmentsTable,
  transactionsTable,
} from "@workspace/db";
import { sendPushToUser } from "./push";
import {
  AfterShipError,
  createTracking,
  getTracking,
  normalizeCarrier,
  normalizeTrackingPayload,
  type NormalizedTracking,
} from "./aftership";
import { logger } from "./logger";
import {
  carrierRegistrationPredicate,
  isCarrierRegistrationEligible,
  isPayoutBlocked,
} from "./settlementEligibility";

// Exceptions can later resolve to an in-transit or delivered update, so they
// remain pollable. Delivered/returned are terminal provider states.
const TERMINAL = ["delivered", "returned"];
const STATUS_RANK: Record<string, number> = {
  label_created: 1, shipped: 2, in_transit: 3, out_for_delivery: 4, delivered: 5,
  exception: 5, returned: 5,
};
const NOTIFICATION_STATUS: Record<string, { type: string; message: (id: number) => string }> = {
  label_created: { type: "shipment_created", message: id => `Votre commande #${String(id).padStart(6, "0")} a été expédiée.` },
  shipped: { type: "shipment_shipped", message: id => `Votre commande #${String(id).padStart(6, "0")} a été expédiée.` },
  in_transit: { type: "shipment_in_transit", message: id => `Votre colis #${String(id).padStart(6, "0")} est maintenant en transit.` },
  out_for_delivery: { type: "shipment_out_for_delivery", message: id => `Votre colis #${String(id).padStart(6, "0")} est en cours de livraison.` },
  delivered: { type: "shipment_delivered", message: id => `Votre commande #${String(id).padStart(6, "0")} a été livrée.` },
  exception: { type: "shipment_exception", message: id => `Une exception affecte la livraison de votre commande #${String(id).padStart(6, "0")}.` },
  returned: { type: "shipment_returned", message: id => `Votre colis #${String(id).padStart(6, "0")} a été retourné.` },
};

function statusRank(status: string | null | undefined): number {
  return STATUS_RANK[status ?? ""] ?? 0;
}

function eventKey(event: NormalizedTracking["events"][number]): string {
  // A deterministic local key is used when a provider omits checkpoint_id.
  return event.carrierEventId ??
    `${event.status}:${event.timestamp.toISOString()}:${event.location ?? ""}:${event.description ?? ""}`;
}

async function notifyStatus(orderId: number, buyerId: number, sellerId: number, status: string): Promise<void> {
  const template = NOTIFICATION_STATUS[status];
  if (!template) return;
  const inserted = await db.insert(notificationsTable).values({
    userId: buyerId,
    actorId: sellerId,
    type: template.type,
    referenceId: orderId,
    message: template.message(orderId),
  }).onConflictDoNothing().returning({ id: notificationsTable.id }).catch(err => {
    logger.warn({ err, orderId, status }, "Shipment notification could not be written");
    return [];
  });
  if (inserted.length > 0) {
    void sendPushToUser(buyerId, {
      title: "Mise à jour de livraison",
      body: template.message(orderId),
      url: `/orders/${orderId}`,
      tag: `shipment-${orderId}-${status}`,
    });
  }
}

/**
 * Merge an AfterShip response into the snapshot/event ledger. Event rows are
 * append-only; the snapshot only moves forward in time and never regresses to
 * an older carrier status.
 */
export async function applyTrackingSnapshot(shipmentId: number, snapshot: NormalizedTracking): Promise<void> {
  const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.trackingId, shipmentId));
  if (!shipment) throw new AfterShipError("Shipment not found", "SHIPMENT_NOT_FOUND", 404);

  for (const event of snapshot.events) {
    await db.insert(shipmentEventsTable).values({
      shipmentId,
      eventStatus: event.status,
      eventDescription: event.description,
      location: event.location,
      eventTimestamp: event.timestamp,
      carrierEventId: eventKey(event),
      rawEvent: event.raw,
    }).onConflictDoNothing().catch(err => logger.warn({ err, shipmentId }, "Duplicate shipment event skipped"));
  }

  const incomingTime = snapshot.lastUpdate ??
    (snapshot.events.length ? snapshot.events[snapshot.events.length - 1]!.timestamp : null);
  const incomingStatus = snapshot.status || shipment.trackingStatus;
  const incomingRank = statusRank(incomingStatus);
  // The freshness and monotonic-status predicates are part of the UPDATE,
  // rather than a read-then-write check, so concurrent webhooks cannot make a
  // stale snapshot win after this process has read the row.
  const freshness = incomingTime
    ? sql`(COALESCE(${shipmentsTable.lastEventTimestamp}, ${shipmentsTable.lastUpdate}) IS NULL
        OR COALESCE(${shipmentsTable.lastEventTimestamp}, ${shipmentsTable.lastUpdate}) <= ${incomingTime})`
    : sql`COALESCE(${shipmentsTable.lastEventTimestamp}, ${shipmentsTable.lastUpdate}) IS NULL`;
  const currentRank = sql`CASE ${shipmentsTable.trackingStatus}
    WHEN 'label_created' THEN 1 WHEN 'shipped' THEN 2 WHEN 'in_transit' THEN 3
    WHEN 'out_for_delivery' THEN 4 WHEN 'delivered' THEN 5
    WHEN 'exception' THEN 5 WHEN 'returned' THEN 5 ELSE 0 END`;
  const statusAllowed = sql`(
    (${shipmentsTable.trackingStatus} = 'exception' AND ${incomingStatus} <> 'label_created')
    OR ${currentRank} <= ${incomingRank}
  )`;
  const terminalNoRegression = sql`NOT (
    ${shipmentsTable.trackingStatus} IN ('delivered', 'returned')
    AND ${shipmentsTable.trackingStatus} <> ${incomingStatus}
  )`;
  const terminalOnlyOnce = sql`${shipmentsTable.trackingStatus} NOT IN ('delivered', 'returned')`;
  const [updated] = await db.update(shipmentsTable).set({
    providerTrackingId: snapshot.providerTrackingId ?? shipment.providerTrackingId,
    carrier: snapshot.carrier || shipment.carrier,
    trackingStatus: incomingStatus,
    originCountry: snapshot.originCountry ?? shipment.originCountry,
    destinationCountry: snapshot.destinationCountry ?? shipment.destinationCountry,
    originPostalCode: snapshot.originPostalCode ?? shipment.originPostalCode,
    destinationPostalCode: snapshot.destinationPostalCode ?? shipment.destinationPostalCode,
    estimatedDelivery: snapshot.estimatedDelivery ?? shipment.estimatedDelivery,
    lastLocation: snapshot.lastLocation ?? shipment.lastLocation,
    lastUpdate: incomingTime ?? shipment.lastUpdate,
    lastEventTimestamp: incomingTime ?? shipment.lastEventTimestamp,
    rawSnapshot: snapshot.raw,
    updatedAt: new Date(),
  }).where(and(
    eq(shipmentsTable.trackingId, shipmentId),
    freshness,
    statusAllowed,
    terminalNoRegression,
    terminalOnlyOnce,
  )).returning({ trackingStatus: shipmentsTable.trackingStatus, lastUpdate: shipmentsTable.lastUpdate });

  // No row means this snapshot was stale or was rejected as a regression.
  if (!updated) return;
  const effectiveStatus = updated.trackingStatus;
  if (effectiveStatus !== shipment.trackingStatus) {
    await notifyStatus(shipment.orderId, shipment.buyerId, shipment.sellerId, effectiveStatus);
  }

  const terminalDelivery = effectiveStatus === "delivered" &&
    shipment.trackingStatus !== "delivered";
  const [transaction] = await db.select({
    orderStatus: transactionsTable.orderStatus,
    paymentStatus: transactionsTable.paymentStatus,
  }).from(transactionsTable).where(eq(transactionsTable.id, shipment.orderId));
  const payoutBlocked = !transaction || isPayoutBlocked(transaction.orderStatus, transaction.paymentStatus);
  if (terminalDelivery && !payoutBlocked) {
    const [eligibleUpdate] = await db.update(transactionsTable).set({
      trackingStatus: "delivered",
      trackingLastUpdated: updated.lastUpdate ?? shipment.lastUpdate,
      deliveredAt: updated.lastUpdate ?? shipment.lastUpdate,
      orderStatus: sql`CASE WHEN ${transactionsTable.orderStatus} IN ('cancelled', 'refunded', 'partially_refunded', 'disputed', 'returned', 'return_refunded', 'completed') THEN ${transactionsTable.orderStatus} ELSE 'delivered' END`,
    }).where(and(
      eq(transactionsTable.id, shipment.orderId),
      notInArray(transactionsTable.orderStatus, ["cancelled", "refunded", "partially_refunded", "disputed", "returned", "return_refunded"]),
      notInArray(transactionsTable.paymentStatus, ["refunded", "partially_refunded", "disputed", "failed", "cancelled"]),
    )).returning({ id: transactionsTable.id });
    // Import lazily to avoid a route-module cycle. releaseEscrow performs its
    // own payment/refund checks and an atomic escrowReleased claim.
    if (eligibleUpdate) {
      const { releaseEscrow } = await import("../routes/transactions");
      await releaseEscrow(shipment.orderId, "carrier").catch(err =>
        logger.warn({ err, orderId: shipment.orderId }, "Carrier delivery recorded; escrow release was not completed"),
      );
    } else {
      // A cancellation/refund won the race after the snapshot was read. Keep
      // carrier movement visible, but never mark the order payout-eligible.
      await db.update(transactionsTable).set({
        trackingStatus: "delivered",
        trackingLastUpdated: updated.lastUpdate ?? shipment.lastUpdate,
      }).where(eq(transactionsTable.id, shipment.orderId));
    }
  } else {
    await db.update(transactionsTable).set({
      trackingStatus: effectiveStatus,
      trackingLastUpdated: updated.lastUpdate ?? shipment.lastUpdate,
    }).where(eq(transactionsTable.id, shipment.orderId));
  }
}

export async function registerShipmentForOrder(
  orderId: number,
  sellerId: number,
  carrierValue: string,
  trackingNumberValue: string,
): Promise<{ shipmentId: number; status: string }> {
  const carrier = normalizeCarrier(carrierValue);
  const trackingNumber = trackingNumberValue.trim();
  const [tx] = await db.transaction(async lockTx =>
    lockTx.select().from(transactionsTable).where(eq(transactionsTable.id, orderId)).for("update"));
  if (!tx || tx.type !== "purchase") throw new AfterShipError("Order not found", "ORDER_NOT_FOUND", 404);
  if (!isCarrierRegistrationEligible(tx)) {
    throw new AfterShipError("Order is not eligible for carrier shipment registration", "ORDER_NOT_ELIGIBLE", 409);
  }
  const [listing] = tx.listingId
    ? await db.select({ sellerId: listingsTable.sellerId, country: listingsTable.country }).from(listingsTable).where(eq(listingsTable.id, tx.listingId))
    : [];
  const ownerId = tx.sellerUserId ?? listing?.sellerId;
  if (ownerId !== sellerId) throw new AfterShipError("Only the seller can add tracking", "FORBIDDEN", 403);
  const listingCountry = tx.listingCountry ?? listing?.country;
  if (listingCountry === "Haiti" || listingCountry === "Dominican Republic") {
    throw new AfterShipError("Local FM delivery orders must use the existing driver flow", "LOCAL_DELIVERY_ORDER", 409);
  }
  const [existingNumber] = await db.select({ trackingId: shipmentsTable.trackingId, orderId: shipmentsTable.orderId })
    .from(shipmentsTable)
    .where(and(eq(shipmentsTable.provider, "aftership"), eq(shipmentsTable.trackingNumber, trackingNumber)))
    .limit(1);
  if (existingNumber && existingNumber.orderId !== orderId) {
    throw new AfterShipError("Tracking number is already registered to another order", "DUPLICATE_TRACKING_NUMBER", 409);
  }

  let snapshot: NormalizedTracking;
  try {
    snapshot = await createTracking(carrierValue, trackingNumber, {
      origin_country: listingCountry ?? undefined,
      destination_country: undefined,
    });
  } catch (error) {
    // A client retry after a response timeout may find that AfterShip already
    // created the tracking. Reconcile it by fetching the provider snapshot;
    // this is safe because the local order/number ownership checks ran above.
    if (error instanceof AfterShipError && (error.statusCode === 400 || error.statusCode === 409)) {
      try {
        snapshot = await getTracking(carrierValue, trackingNumber);
      } catch {
        throw error;
      }
    } else {
      throw error instanceof AfterShipError ? error : new AfterShipError("Unable to register shipment", "AFTERSHIP_UNAVAILABLE");
    }
  }

  // Re-lock and re-check after the provider call. Cancellation/refund/dispute
  // may have won the race while AfterShip was creating the remote tracker;
  // in that case the transaction rolls back and the remote tracker remains
  // harmlessly unassociated rather than reactivating the order locally.
  const persisted = await db.transaction(async persistTx => {
    const [lockedTx] = await persistTx.select().from(transactionsTable)
      .where(eq(transactionsTable.id, orderId))
      .for("update");
    if (!lockedTx || !isCarrierRegistrationEligible(lockedTx)) {
      throw new AfterShipError("Order changed and is no longer eligible for shipment registration", "ORDER_NOT_ELIGIBLE", 409);
    }
    const inserted = await persistTx.insert(shipmentsTable).values({
      orderId,
      sellerId: ownerId,
      buyerId: lockedTx.userId,
      provider: "aftership",
      providerTrackingId: snapshot.providerTrackingId,
      carrier: snapshot.carrier || carrier,
      trackingNumber,
      trackingStatus: "label_created",
      originCountry: snapshot.originCountry ?? listingCountry ?? null,
      destinationCountry: snapshot.destinationCountry,
      originPostalCode: snapshot.originPostalCode,
      destinationPostalCode: snapshot.destinationPostalCode,
      estimatedDelivery: snapshot.estimatedDelivery,
      lastLocation: snapshot.lastLocation,
      lastUpdate: snapshot.lastUpdate,
      lastEventTimestamp: snapshot.lastUpdate,
      rawSnapshot: snapshot.raw,
    }).onConflictDoUpdate({
      target: shipmentsTable.orderId,
      // Preserve the first registration's carrier/number. The order-level
      // unique key makes concurrent retries idempotent without allowing a
      // second tracking to replace an active shipment.
      set: { updatedAt: sql`NOW()` },
    }).returning({ trackingId: shipmentsTable.trackingId });
    const shipmentId = inserted[0]?.trackingId;
    if (!shipmentId) throw new AfterShipError("Unable to persist shipment", "SHIPMENT_PERSIST_FAILED");
    const [persistedShipment] = await persistTx.select({
      trackingId: shipmentsTable.trackingId,
      trackingNumber: shipmentsTable.trackingNumber,
    }).from(shipmentsTable).where(eq(shipmentsTable.trackingId, shipmentId));
    if (!persistedShipment || persistedShipment.trackingNumber !== trackingNumber) {
      throw new AfterShipError("This order already has a different active tracking number", "SHIPMENT_ALREADY_EXISTS", 409);
    }
    const [updatedTx] = await persistTx.update(transactionsTable).set({
      carrier: carrierValue.trim(),
      trackingNumber,
      trackingStatus: snapshot.status,
      shippedAt: lockedTx.shippedAt ?? new Date(),
      ...(snapshot.status === "delivered" ? {} : { orderStatus: "shipped" }),
    }).where(and(
      eq(transactionsTable.id, orderId),
      carrierRegistrationPredicate(),
    )).returning({ userId: transactionsTable.userId });
    if (!updatedTx) {
      throw new AfterShipError("Order changed and is no longer eligible for shipment registration", "ORDER_NOT_ELIGIBLE", 409);
    }
    return { shipmentId, buyerId: updatedTx.userId };
  });
  const shipmentId = persisted.shipmentId;
  await applyTrackingSnapshot(shipmentId, snapshot);
  // Registration itself is meaningful even when the carrier's first response
  // has no checkpoint or still reports label_created. The unique notification
  // key makes retries safe.
  await notifyStatus(orderId, persisted.buyerId, sellerId, "label_created");
  return { shipmentId, status: snapshot.status };
}

async function findShipmentForSnapshot(snapshot: NormalizedTracking): Promise<number | null> {
  const [row] = await db.select({ trackingId: shipmentsTable.trackingId })
    .from(shipmentsTable)
    .where(or(
      snapshot.providerTrackingId ? eq(shipmentsTable.providerTrackingId, snapshot.providerTrackingId) : sql`FALSE`,
      and(eq(shipmentsTable.carrier, snapshot.carrier), eq(shipmentsTable.trackingNumber, snapshot.trackingNumber)),
    )).limit(1);
  return row?.trackingId ?? null;
}

export async function processAfterShipWebhook(payload: Record<string, unknown>): Promise<boolean> {
  const message = (payload.msg && typeof payload.msg === "object" ? payload.msg : payload) as Record<string, unknown>;
  const tracking = (message.tracking && typeof message.tracking === "object"
    ? message.tracking
    : message) as Record<string, unknown>;
  const snapshot = normalizeTrackingPayload(payload, {
    slug: String(tracking.slug ?? "unknown"),
    trackingNumber: String(tracking.tracking_number ?? ""),
  });
  const shipmentId = await findShipmentForSnapshot(snapshot);
  if (!shipmentId) return false;
  await applyTrackingSnapshot(shipmentId, snapshot);
  return true;
}

export async function pollAfterShipShipments(): Promise<number> {
  if (!process.env.AFTERSHIP_API_KEY?.trim()) return 0;
  // Transaction-scoped advisory locking is important here: a session-scoped
  // lock can move between pooled connections when db.execute is called.
  return db.transaction(async pollDb => {
    const lockResult = await pollDb.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext('flexamarket_aftership_poll')) AS locked`);
    const lockAcquired = Boolean((lockResult as any).rows?.[0]?.locked);
    if (!lockAcquired) return 0;
    const active = await pollDb.select().from(shipmentsTable)
      .where(and(
        eq(shipmentsTable.provider, "aftership"),
        notInArray(shipmentsTable.trackingStatus, TERMINAL),
        sql`(${shipmentsTable.nextPollAt} IS NULL OR ${shipmentsTable.nextPollAt} <= NOW())`,
      ))
      // Oldest due rows first prevents frequently updated/new shipments from
      // starving shipments that have been waiting longest.
      .orderBy(
        asc(sql`COALESCE(${shipmentsTable.nextPollAt}, ${shipmentsTable.createdAt})`),
        asc(shipmentsTable.createdAt),
      )
      .limit(25);
    let updated = 0;
    const successDelay = Math.max(5, Number(process.env.AFTERSHIP_POLL_INTERVAL_MINUTES ?? 30)) * 60_000;
    // Bounded concurrency prevents a large seller catalog from exhausting the
    // AfterShip quota or the API server's socket pool.
    for (let i = 0; i < active.length; i += 3) {
      const batch = active.slice(i, i + 3);
      await Promise.all(batch.map(async shipment => {
        let delay = Math.min(successDelay, 5 * 60_000);
        try {
          const snapshot = await getTracking(shipment.carrier, shipment.trackingNumber);
          await applyTrackingSnapshot(shipment.trackingId, snapshot);
          updated++;
          delay = successDelay;
          return 1;
        } catch (err) {
          logger.warn({ err, shipmentId: shipment.trackingId }, "Shipment polling failed");
          return 0;
        } finally {
          await pollDb.update(shipmentsTable).set({
            nextPollAt: new Date(Date.now() + delay),
          }).where(eq(shipmentsTable.trackingId, shipment.trackingId)).catch(error =>
            logger.warn({ error, shipmentId: shipment.trackingId }, "Shipment poll schedule update failed"),
          );
        }
      }));
    }
    return updated;
  });
}

export function startAfterShipPollingWorker(): void {
  const intervalMs = Math.max(5, Number(process.env.AFTERSHIP_POLL_INTERVAL_MINUTES ?? 30)) * 60_000;
  const run = () => { void pollAfterShipShipments(); };
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
}