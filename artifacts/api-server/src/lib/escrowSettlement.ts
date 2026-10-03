export type SettlementRoute = "stripe_connect" | "fm_wallet";

export function resolveSettlementRoute(input: {
  paymentMethod: string;
  requiresStripePayout?: boolean;
  payoutPreference?: string | null;
  stripeAccountId?: string | null;
  stripeAccountStatus?: string | null;
}): SettlementRoute {
  if (input.requiresStripePayout) return "stripe_connect";
  return input.paymentMethod === "stripe" &&
    input.payoutPreference === "stripe" &&
    !!input.stripeAccountId &&
    input.stripeAccountStatus === "active"
    ? "stripe_connect"
    : "fm_wallet";
}

export function escrowTransferIdempotencyKey(transactionId: number): string {
  return `escrow-release-${transactionId}`;
}

export function escrowTransferGroup(transactionId: number): string {
  return `FM_ESCROW_${transactionId}`;
}