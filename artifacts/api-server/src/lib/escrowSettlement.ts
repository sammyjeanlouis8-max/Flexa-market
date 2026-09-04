export type SettlementRoute = "stripe_connect" | "fm_wallet";

export function resolveSettlementRoute(input: {
  paymentMethod: string;
  payoutPreference?: string | null;
  stripeAccountId?: string | null;
  stripeAccountStatus?: string | null;
}): SettlementRoute {
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