import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  promoWalletTable,
  settlementRecoveryReservationsTable,
  stripeRefundLedgerTable,
  transactionsTable,
  usersTable,
  walletTransactionsTable,
} from "@workspace/db";
import { getStripeClient } from "./stripeClient";
import { escrowTransferGroup, escrowTransferIdempotencyKey } from "./escrowSettlement";
import { isPayoutBlocked } from "./settlementEligibility";
import { logger } from "./logger";

const STALE_AFTER_MS = 10 * 60 * 1000;

export function staleSettlementRecoveryAction(input: {
  providerTransferFound: boolean;
  payoutEligibilityBlocked: boolean;
}): "finalize_provider_transfer" | "retry_with_idempotency_key" | "hold_for_recovery" {
  if (input.providerTransferFound) return "finalize_provider_transfer";
  if (input.payoutEligibilityBlocked) return "hold_for_recovery";
  return "retry_with_idempotency_key";
}

export function shouldDeferSettlementMutation(settlementStatus: string | null | undefined): boolean {
  return settlementStatus === "processing";
}

export function aggregateRefundPaymentStatus(
  totalCents: number,
  successfulRefundCents: number,
): "refunded" | "partially_refunded" {
  return successfulRefundCents >= totalCents ? "refunded" : "partially_refunded";
}

export async function resolveRecoveryProviderTransfer(input: {
  providerTransferId: string | null;
  payoutEligibilityBlocked: boolean;
  createTransfer: () => Promise<string>;
}): Promise<{
  action: "finalize_provider_transfer" | "retry_with_idempotency_key" | "hold_for_recovery";
  transferId: string | null;
}> {
  const action = staleSettlementRecoveryAction({
    providerTransferFound: !!input.providerTransferId,
    payoutEligibilityBlocked: input.payoutEligibilityBlocked,
  });
  if (action === "hold_for_recovery") return { action, transferId: null };
  if (input.providerTransferId) return { action, transferId: input.providerTransferId };
  return { action, transferId: await input.createTransfer() };
}

const PROVIDER_STATUS_RANK: Record<string, number> = {
  failed: 0,
  canceled: 0,
  pending: 10,
  approval_required: 20,
  processing: 30,
  reconciliation_required: 30,
  paid: 90,
  succeeded: 100,
};

export function monotonicProviderStatus(previous: string | null | undefined, incoming: string): string {
  return (PROVIDER_STATUS_RANK[incoming] ?? 10) >= (PROVIDER_STATUS_RANK[previous ?? ""] ?? -1)
    ? incoming
    : previous!;
}

export async function upsertSettlementRecoveryReservationInTransaction(
  tx: any,
  input: {
    transactionId: number;
    kind: "refund" | "dispute" | "provider";
    referenceId: string;
    reason: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  const [existing] = await tx.select().from(settlementRecoveryReservationsTable).where(and(
    eq(settlementRecoveryReservationsTable.transactionId, input.transactionId),
    eq(settlementRecoveryReservationsTable.kind, input.kind),
    eq(settlementRecoveryReservationsTable.referenceId, input.referenceId),
  )).for("update");
  const incomingPayload = input.payload ?? {};
  const previousPayload = (existing?.payload as Record<string, unknown> | null) ?? {};
  const payload = {
    ...previousPayload,
    ...incomingPayload,
    ...(incomingPayload.providerStatus || previousPayload.providerStatus
      ? { providerStatus: monotonicProviderStatus(
        String(previousPayload.providerStatus ?? ""),
        String(incomingPayload.providerStatus ?? previousPayload.providerStatus),
      ) }
      : {}),
  };
  const previousStatus = String(previousPayload.providerStatus ?? "");
  const mergedProviderStatus = String(payload.providerStatus ?? "");
  if (existing) {
    await tx.update(settlementRecoveryReservationsTable).set({
      status: existing.status === "resolved" && mergedProviderStatus === previousStatus
        ? "resolved"
        : "pending",
      reason: input.reason,
      payload,
      resolvedAt: null,
    }).where(eq(settlementRecoveryReservationsTable.id, existing.id));
  } else {
    await tx.insert(settlementRecoveryReservationsTable).values({
      transactionId: input.transactionId,
      kind: input.kind,
      referenceId: input.referenceId,
      reason: input.reason,
      payload,
    });
  }
}

export async function recordSettlementRecoveryReservation(input: {
  transactionId: number;
  kind: "refund" | "dispute" | "provider";
  referenceId: string;
  reason: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.transaction(async tx => upsertSettlementRecoveryReservationInTransaction(tx, input));
}

export async function applyDeferredRecoveryForSettlement(transactionId: number): Promise<void> {
  const reservations = await db.select().from(settlementRecoveryReservationsTable)
    .where(and(
      eq(settlementRecoveryReservationsTable.transactionId, transactionId),
      eq(settlementRecoveryReservationsTable.status, "pending"),
    ));
  if (!reservations.length) return;
  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, transactionId));
  if (!tx || !tx.escrowReleased) return;

  let paymentStatus: string | undefined;
  let reason = "Post-payout recovery required";
  const resolvedIds: number[] = [];
  const successfulRefunds = await db.select({ amountCents: stripeRefundLedgerTable.amountCents })
    .from(stripeRefundLedgerTable)
    .where(and(
      eq(stripeRefundLedgerTable.transactionId, transactionId),
      eq(stripeRefundLedgerTable.providerStatus, "succeeded"),
    ));
  const refundedCents = successfulRefunds.reduce((sum, refund) => sum + refund.amountCents, 0);
  const totalCents = Math.round((tx.buyerTotal ?? tx.amount) * 100);
  for (const reservation of reservations) {
    if (reservation.kind === "dispute") {
      paymentStatus = "disputed";
      reason = "Post-payout dispute recorded; seller recovery/debt workflow required";
      resolvedIds.push(reservation.id);
      break;
    }
    if (reservation.kind === "refund") {
      const payload = reservation.payload as Record<string, unknown> | null;
      if (payload?.providerStatus !== "succeeded") continue;
      paymentStatus = aggregateRefundPaymentStatus(totalCents, refundedCents);
      reason = "Post-payout refund recorded; seller recovery/debt workflow required";
      resolvedIds.push(reservation.id);
    }
  }
  if (!resolvedIds.length) return;
  await db.transaction(async recoveryTx => {
    const [locked] = await recoveryTx.select().from(transactionsTable)
      .where(eq(transactionsTable.id, transactionId))
      .for("update");
    if (!locked?.escrowReleased) return;
    await recoveryTx.update(transactionsTable).set({
      ...(paymentStatus ? { paymentStatus } : {}),
      settlementError: reason,
    }).where(eq(transactionsTable.id, transactionId));
    await recoveryTx.update(settlementRecoveryReservationsTable).set({
      status: "resolved",
      resolvedAt: new Date(),
    }).where(inArray(settlementRecoveryReservationsTable.id, resolvedIds));
  });
}

async function reconcileOne(transactionId: number, staleBefore: Date): Promise<void> {
  const [candidate] = await db.select().from(transactionsTable)
    .where(and(
      eq(transactionsTable.id, transactionId),
      eq(transactionsTable.settlementStatus, "processing"),
      or(isNull(transactionsTable.settlementAttemptedAt), lt(transactionsTable.settlementAttemptedAt, staleBefore)),
    ));
  if (!candidate) return;

  let existingTransferId = candidate.stripeTransferId;
  if (candidate.settlementMethod === "stripe_connect" && !existingTransferId) {
    const [seller] = candidate.sellerUserId
      ? await db.select({ stripeAccountId: usersTable.stripeAccountId })
        .from(usersTable).where(eq(usersTable.id, candidate.sellerUserId))
      : [];
    if (!seller?.stripeAccountId) {
      logger.error({ transactionId }, "Stale settlement has no Stripe destination");
      return;
    }
    try {
      const stripe = await getStripeClient();
      const transfers = await stripe.transfers.list({ transfer_group: escrowTransferGroup(transactionId), limit: 1 });
      existingTransferId = transfers.data[0]?.id ?? null;
    } catch (error) {
      logger.warn({ error, transactionId }, "Stale settlement Stripe lookup failed");
      return;
    }
  }

  // Re-lock immediately before any new provider side effect. A refund,
  // dispute, or other eligibility mutation may have won after the transfer
  // lookup. A committed processing claim remains held for recovery when no
  // provider transfer exists; it must never be reset/retried blindly.
  if (!existingTransferId) {
    const providerCallAllowed = await db.transaction(async tx => {
      const [locked] = await tx.select().from(transactionsTable)
        .where(eq(transactionsTable.id, transactionId))
        .for("update");
      if (!locked || locked.settlementStatus !== "processing" || locked.escrowReleased ||
          (locked.settlementAttemptedAt && locked.settlementAttemptedAt >= staleBefore)) {
        return false;
      }
      const payoutEligibilityBlocked = locked.paymentStatus !== "completed" ||
        isPayoutBlocked(locked.orderStatus, locked.paymentStatus);
      const action = staleSettlementRecoveryAction({
        providerTransferFound: false,
        payoutEligibilityBlocked,
      });
      if (action === "hold_for_recovery") {
        await tx.update(transactionsTable).set({
          settlementError: "Stale settlement claim is no longer payout-eligible; held for recovery",
        }).where(and(
          eq(transactionsTable.id, transactionId),
          eq(transactionsTable.settlementStatus, "processing"),
          eq(transactionsTable.escrowReleased, false),
        ));
        return false;
      }
      return action === "retry_with_idempotency_key";
    });
    if (!providerCallAllowed) return;
  }

  if (!existingTransferId && candidate.settlementMethod === "stripe_connect") {
    const [seller] = candidate.sellerUserId
      ? await db.select({ stripeAccountId: usersTable.stripeAccountId })
        .from(usersTable).where(eq(usersTable.id, candidate.sellerUserId))
      : [];
    if (!seller?.stripeAccountId) {
      logger.error({ transactionId }, "Stale settlement has no Stripe destination");
      return;
    }
    try {
      const stripe = await getStripeClient();
      const resolution = await resolveRecoveryProviderTransfer({
        providerTransferId: existingTransferId,
        payoutEligibilityBlocked: false,
        createTransfer: async () => {
          const transfer = await stripe.transfers.create({
            amount: Math.round((candidate.sellerEarnings ?? candidate.amount) * 100),
            currency: "usd",
            destination: seller.stripeAccountId!,
            description: `FlexaMarket escrow recovery — order #${transactionId}`,
            transfer_group: escrowTransferGroup(transactionId),
            metadata: { transactionId: String(transactionId), triggeredBy: "settlement_recovery" },
          }, { idempotencyKey: escrowTransferIdempotencyKey(transactionId) });
          return transfer.id;
        },
      });
      existingTransferId = resolution.transferId;
    } catch (error) {
      logger.warn({ error, transactionId }, "Stale settlement idempotent Stripe payout failed");
      return;
    }
  }

  {
    const finalized = await db.transaction(async tx => {
      const [locked] = await tx.select().from(transactionsTable)
        .where(eq(transactionsTable.id, transactionId))
        .for("update");
      if (!locked || locked.settlementStatus !== "processing" || locked.escrowReleased ||
          locked.paymentStatus !== "completed" && !existingTransferId) return false;
      const blocked = locked.paymentStatus !== "completed" ||
        isPayoutBlocked(locked.orderStatus, locked.paymentStatus);
      if (blocked && !existingTransferId) return false;
      await tx.update(transactionsTable).set({
        stripeTransferId: existingTransferId,
        escrowReleased: true,
        escrowReleasedAt: new Date(),
        settlementStatus: "paid",
        orderStatus: blocked ? locked.orderStatus : "completed",
        deliveredAt: locked.deliveredAt ?? new Date(),
        settlementError: blocked ? "Provider transfer found after claim; seller recovery/debt workflow required" : null,
      }).where(and(
        eq(transactionsTable.id, transactionId),
        eq(transactionsTable.settlementStatus, "processing"),
        eq(transactionsTable.escrowReleased, false),
        or(isNull(transactionsTable.settlementAttemptedAt), lt(transactionsTable.settlementAttemptedAt, staleBefore)),
      ));
      if (locked.settlementMethod === "fm_wallet") {
        const [existingWallet] = await tx.select({ id: promoWalletTable.id })
          .from(promoWalletTable).where(eq(promoWalletTable.userId, locked.sellerUserId!));
        if (existingWallet) {
          await tx.update(promoWalletTable).set({
            balanceUsd: sql`${promoWalletTable.balanceUsd} + ${locked.sellerEarnings ?? locked.amount}`,
            updatedAt: new Date(),
        }).where(eq(promoWalletTable.userId, locked.sellerUserId!));
        } else {
          await tx.insert(promoWalletTable).values({
            userId: locked.sellerUserId!,
            balanceUsd: locked.sellerEarnings ?? locked.amount,
          });
        }
      }
      await tx.insert(walletTransactionsTable).values({
        userId: locked.sellerUserId!,
        type: "sale_earnings",
        amountUsd: locked.sellerEarnings ?? locked.amount,
        paymentRef: locked.settlementMethod === "fm_wallet"
          ? `order-${transactionId}`
          : `order-${transactionId}-${locked.settlementMethod === "legacy_checkout" ? "legacy" : "stripe"}-release`,
        status: "completed",
        note: locked.settlementMethod === "legacy_checkout"
          ? `Recovered legacy checkout settlement — order #${transactionId}`
          : existingTransferId
          ? `Recovered Stripe Connect escrow transfer ${existingTransferId} — order #${transactionId}`
          : `Recovered wallet escrow release — order #${transactionId}`,
      }).onConflictDoNothing();
      return true;
    });
    if (finalized) await applyDeferredRecoveryForSettlement(transactionId);
    return;
  }
}

export async function reconcileStaleSettlementClaims(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
  const rows = await db.select({ id: transactionsTable.id }).from(transactionsTable)
    .where(and(
      eq(transactionsTable.settlementStatus, "processing"),
      or(isNull(transactionsTable.settlementAttemptedAt), lt(transactionsTable.settlementAttemptedAt, staleBefore)),
    ))
    .orderBy(asc(transactionsTable.settlementAttemptedAt))
    .limit(25);
  let count = 0;
  for (const row of rows) {
    try {
      await reconcileOne(row.id, staleBefore);
      count++;
    } catch (error) {
      logger.error({ error, transactionId: row.id }, "Stale settlement reconciliation failed");
    }
  }
  const deferred = await db.select({ transactionId: settlementRecoveryReservationsTable.transactionId })
    .from(settlementRecoveryReservationsTable)
    .innerJoin(transactionsTable, eq(transactionsTable.id, settlementRecoveryReservationsTable.transactionId))
    .where(and(
      eq(settlementRecoveryReservationsTable.status, "pending"),
      eq(transactionsTable.escrowReleased, true),
    ))
    .limit(25);
  for (const row of deferred) {
    await applyDeferredRecoveryForSettlement(row.transactionId).catch(error =>
      logger.error({ error, transactionId: row.transactionId }, "Deferred settlement recovery failed"),
    );
  }
  return count;
}

export function startSettlementRecoveryWorker(): void {
  const intervalMs = Math.max(5, Number(process.env.SETTLEMENT_RECOVERY_INTERVAL_MINUTES ?? 5)) * 60_000;
  const run = () => { void reconcileStaleSettlementClaims(); };
  const timer = setInterval(run, intervalMs);
  timer.unref?.();
}