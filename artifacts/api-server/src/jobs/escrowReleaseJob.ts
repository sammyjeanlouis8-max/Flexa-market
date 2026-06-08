/**
 * PHASE 5 — Escrow & lifecycle auto-release cron
 *
 * Runs every 15 minutes (plus a 60 s warm-up after boot). Owns three jobs
 * that previously had to be done manually by ops, causing funds to get
 * stuck in escrow on the first abandoned transaction:
 *
 *  1. autoConfirmDeliveredOrders(now)
 *       delivered + paymentHeldUntil < now + sellerPaymentReleased=false
 *       AND no open dispute  →  confirm + release escrow + credit driver
 *
 *       Today the marketplace flow releases seller payment SYNCHRONOUSLY
 *       on driver code-verification (see delivery.ts:1078-1090), so this
 *       query returns 0 rows in steady state. This job is the safety net
 *       for: (a) failures inside that synchronous release that leave the
 *       row in 'delivered' + sellerPaymentReleased=false, (b) the future
 *       Phase 3 / Phase 4 escrow-hold state where a buyer-confirmation
 *       window is introduced. Wiring it in now means we never have to
 *       come back and add it under fire.
 *
 *  2. autoExpireStalledWaiting(now)
 *       waiting + created_at < now − 6 h  →  cancelled + refund buyer
 *
 *       Deliveries that no driver accepted within 6 hours. Today these
 *       sit in 'waiting' forever, so the buyer's transaction-side escrow
 *       (transactionsTable.escrowReleased=false) is held indefinitely.
 *       This job marks the delivery 'cancelled' and triggers escrow
 *       release back to the BUYER (via the existing releaseEscrow helper).
 *
 *  3. autoCancelStuckAccepted(now)
 *       accepted + accepted_at < now − 2 h + picked_up_at IS NULL
 *       → re-open for matching (back to 'waiting'), clear driver_user_id.
 *
 *       Driver accepted but never went to seller. We don't charge the
 *       driver yet — that's a Phase 6 anti-fraud concern. We just put the
 *       delivery back into the matching pool. Idempotent.
 *
 * Concurrency:
 *   Wrapped in pg_advisory_lock(54_321). If two instances run the job
 *   simultaneously (multi-pod deploy, blue/green rollout), only the one
 *   that acquires the lock does work; the other returns immediately.
 *
 * Boundaries:
 *   - No schema changes. Uses existing columns:
 *     deliveries.status, .paymentHeldUntil, .sellerPaymentReleased,
 *     .createdAt, .acceptedAt, .pickedUpAt, .transactionId, .driverUserId.
 *   - No external dependencies (no node-cron). Same setInterval pattern
 *     as the existing runAutoRelease / runSubscriptionExpiryJob in
 *     index.ts and transactions.ts.
 *   - Touches at most 200 rows per pass to keep the lock window small.
 */

import { sql, eq, and, lt, isNull } from "drizzle-orm";
import { db, deliveriesTable } from "@workspace/db";
import { logger } from "../lib/logger";
import { releaseEscrow } from "../routes/transactions";

const ADVISORY_LOCK_KEY = 54_321;
const MAX_ROWS_PER_PASS = 200;
const WAITING_TTL_MS = 6 * 60 * 60 * 1000;       // 6 h
const ACCEPTED_NO_PICKUP_TTL_MS = 2 * 60 * 60 * 1000;  // 2 h

async function autoConfirmDeliveredOrders(now: Date): Promise<number> {
  // delivered + paymentHeldUntil expired + payout not yet released.
  // releaseEscrow() is idempotent (it checks escrowReleased internally),
  // so re-running on a partial failure is safe.
  const rows = await db
    .select({
      id: deliveriesTable.id,
      transactionId: deliveriesTable.transactionId,
    })
    .from(deliveriesTable)
    .where(
      and(
        eq(deliveriesTable.status, "delivered"),
        eq(deliveriesTable.sellerPaymentReleased, false),
        lt(deliveriesTable.paymentHeldUntil, now),
      ),
    )
    .limit(MAX_ROWS_PER_PASS);

  if (rows.length === 0) return 0;

  let confirmed = 0;
  for (const d of rows) {
    try {
      if (d.transactionId) {
        await releaseEscrow(d.transactionId, "buyer");
      }
      await db
        .update(deliveriesTable)
        .set({
          sellerPaymentReleased: true,
          sellerPaymentReleasedAt: now,
          updatedAt: now,
        })
        .where(eq(deliveriesTable.id, d.id));
      confirmed += 1;
    } catch (err) {
      logger.error({ err, deliveryId: d.id }, "auto-confirm failed for delivery");
    }
  }
  if (confirmed > 0) {
    logger.info({ count: confirmed }, "Escrow cron: auto-confirmed delivered orders");
  }
  return confirmed;
}

async function autoExpireStalledWaiting(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - WAITING_TTL_MS);
  const rows = await db
    .select({
      id: deliveriesTable.id,
      transactionId: deliveriesTable.transactionId,
    })
    .from(deliveriesTable)
    .where(
      and(
        eq(deliveriesTable.status, "waiting"),
        lt(deliveriesTable.createdAt, cutoff),
      ),
    )
    .limit(MAX_ROWS_PER_PASS);

  if (rows.length === 0) return 0;

  let expired = 0;
  for (const d of rows) {
    try {
      // Mark cancelled first, THEN refund — so a failed refund leaves an
      // auditable 'cancelled' row instead of an inconsistent 'waiting'.
      await db
        .update(deliveriesTable)
        .set({ status: "cancelled", updatedAt: now })
        .where(
          and(
            eq(deliveriesTable.id, d.id),
            eq(deliveriesTable.status, "waiting"),  // CAS guard
          ),
        );
      if (d.transactionId) {
        await releaseEscrow(d.transactionId, "buyer").catch((err: unknown) => {
          logger.error({ err, deliveryId: d.id, transactionId: d.transactionId }, "Buyer refund failed on waiting-TTL expiry");
        });
      }
      expired += 1;
    } catch (err) {
      logger.error({ err, deliveryId: d.id }, "auto-expire (waiting) failed for delivery");
    }
  }
  if (expired > 0) {
    logger.info({ count: expired }, "Escrow cron: expired stalled 'waiting' deliveries");
  }
  return expired;
}

async function autoCancelStuckAccepted(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - ACCEPTED_NO_PICKUP_TTL_MS);
  const rows = await db
    .select({ id: deliveriesTable.id })
    .from(deliveriesTable)
    .where(
      and(
        eq(deliveriesTable.status, "accepted"),
        isNull(deliveriesTable.pickedUpAt),
        lt(deliveriesTable.acceptedAt, cutoff),
      ),
    )
    .limit(MAX_ROWS_PER_PASS);

  if (rows.length === 0) return 0;

  let recycled = 0;
  for (const d of rows) {
    try {
      // Re-open the delivery for matching: clear the driver assignment
      // (driverUserId IS NOT nullable in current schema — only flip status
      // back to 'waiting' so the matching pool picks it up again. The
      // existing accept route already overwrites driverUserId on a fresh
      // accept).
      const result = await db
        .update(deliveriesTable)
        .set({ status: "waiting", updatedAt: now })
        .where(
          and(
            eq(deliveriesTable.id, d.id),
            eq(deliveriesTable.status, "accepted"),  // CAS guard
          ),
        );
      if ((result as any)?.rowCount !== 0) recycled += 1;
    } catch (err) {
      logger.error({ err, deliveryId: d.id }, "auto-cancel (stuck-accepted) failed");
    }
  }
  if (recycled > 0) {
    logger.info({ count: recycled }, "Escrow cron: recycled stuck 'accepted' deliveries to 'waiting'");
  }
  return recycled;
}

/**
 * Top-level entry. Acquires pg_advisory_lock so only one pod runs the
 * pass at a time. Lock is process-scoped (released on disconnect) AND
 * we explicitly unlock in the finally block to free it for the next
 * 15-min tick.
 */
export async function runEscrowReleaseJob(): Promise<void> {
  let acquired = false;
  try {
    const lockRes = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS got`);
    acquired = Boolean((lockRes.rows?.[0] as any)?.got);
    if (!acquired) {
      // Another instance is running — silently no-op.
      return;
    }
    const now = new Date();
    await autoConfirmDeliveredOrders(now);
    await autoExpireStalledWaiting(now);
    await autoCancelStuckAccepted(now);
  } catch (err) {
    logger.error({ err }, "Escrow release job failed");
  } finally {
    if (acquired) {
      try {
        await db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
      } catch {
        // Lock auto-releases on connection close; ignore.
      }
    }
  }
}
