export type StripeConnectStatus = "pending" | "connected" | "active";

export function deriveStripeConnectStatus(account: {
  details_submitted?: boolean;
  payouts_enabled?: boolean;
  capabilities?: { transfers?: string | null } | null;
}): StripeConnectStatus {
  if (!account.details_submitted) return "pending";
  const transfersActive = account.capabilities?.transfers === "active";
  return account.payouts_enabled && transfersActive ? "active" : "connected";
}