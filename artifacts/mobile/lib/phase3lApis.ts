/**
 * Phase 3L customer/driver APIs — existing production endpoints only.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

async function authedFetch(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function requireOk(res: Response, fallback: string): Promise<any> {
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    /* ignore */
  }
  if (!res.ok) throw new Error(data.error || data.message || `${fallback} (${res.status})`);
  return data;
}

export async function fetchLoanEligibility(opts: AuthOpts) {
  return requireOk(await authedFetch("/loans/eligibility", opts), "Loan eligibility failed");
}

export async function fetchMyLoans(opts: AuthOpts) {
  return requireOk(await authedFetch("/loans/my", opts), "My loans failed");
}

export async function applyForLoan(
  body: { amountRequested: number; termMonths: number; purpose?: string },
  opts: AuthOpts,
) {
  return requireOk(
    await authedFetch("/loans/apply", { ...opts, method: "POST", body }),
    "Loan apply failed",
  );
}

export async function fetchSubscriptionPlans() {
  const res = await fetch(`${getApiBase()}/subscription/plans`, { headers: { Accept: "application/json" } });
  return requireOk(res, "Subscription plans failed");
}

export async function fetchMySubscription(opts: AuthOpts) {
  return requireOk(await authedFetch("/subscription/my", opts), "My subscription failed");
}

export async function fetchAndroidPurchaseStatus(opts: AuthOpts) {
  return requireOk(
    await authedFetch("/subscription/android/purchase-status", opts),
    "Android purchase status failed",
  );
}

export async function fetchDriverMyApplication(opts: AuthOpts) {
  return requireOk(await authedFetch("/driver/my-application", opts), "Driver application failed");
}

export async function saveDriverDraft(body: Record<string, unknown>, opts: AuthOpts) {
  return requireOk(
    await authedFetch("/delivery/application/draft", { ...opts, method: "PUT", body }),
    "Driver draft failed",
  );
}

export async function submitDriverApplication(body: Record<string, unknown>, opts: AuthOpts) {
  return requireOk(
    await authedFetch("/delivery/apply", { ...opts, method: "POST", body }),
    "Driver apply failed",
  );
}

export async function fetchDriverStats(opts: AuthOpts) {
  return requireOk(await authedFetch("/delivery/driver/stats", opts), "Driver stats failed");
}

export async function fetchDeliveryAvailable(opts: AuthOpts) {
  const res = await authedFetch("/delivery/available", opts);
  const data = await requireOk(res, "Available deliveries failed");
  return Array.isArray(data) ? data : Array.isArray(data.deliveries) ? data.deliveries : [];
}

export async function acceptDelivery(id: number, opts: AuthOpts) {
  return requireOk(
    await authedFetch(`/delivery/${id}/accept`, { ...opts, method: "POST", body: {} }),
    "Accept delivery failed",
  );
}

export async function setDriverOnline(
  body: { isOnline: boolean; lat?: number; lng?: number },
  opts: AuthOpts,
) {
  return requireOk(
    await authedFetch("/delivery/driver/location", { ...opts, method: "PATCH", body }),
    "Driver location update failed",
  );
}

export async function fetchDriverHistory(opts: AuthOpts) {
  const data = await requireOk(
    await authedFetch("/driver/delivery-history", opts),
    "Driver history failed",
  );
  return Array.isArray(data) ? data : Array.isArray(data.deliveries) ? data.deliveries : [];
}

export async function fetchFlexCardMe(opts: AuthOpts) {
  return requireOk(await authedFetch("/flex-card/me", opts), "Flex card failed");
}

export async function repayFlexCard(amountUsd: number, opts: AuthOpts) {
  return requireOk(
    await authedFetch("/flex-card/repay", { ...opts, method: "POST", body: { amountUsd } }),
    "Flex card repay failed",
  );
}

export async function fetchBnplSettings() {
  const res = await fetch(`${getApiBase()}/bnpl/settings`, { headers: { Accept: "application/json" } });
  return requireOk(res, "BNPL settings failed");
}

export async function fetchBnplEligibility(opts: AuthOpts) {
  return requireOk(await authedFetch("/bnpl/eligibility", opts), "BNPL eligibility failed");
}

export async function fetchPublicAgents(opts: AuthOpts & { onlineOnly?: boolean }) {
  const q = opts.onlineOnly ? "?onlineOnly=1" : "";
  const data = await requireOk(await authedFetch(`/agents/public${q}`, opts), "Agents failed");
  return Array.isArray(data) ? data : Array.isArray(data.agents) ? data.agents : [];
}

export async function applyAsCashAgent(body: Record<string, unknown>, opts: AuthOpts) {
  return requireOk(
    await authedFetch("/agents/apply", { ...opts, method: "POST", body }),
    "Agent apply failed",
  );
}

export async function fetchPromoCommissions(opts: AuthOpts) {
  return requireOk(
    await authedFetch("/promo-purchase-commissions/my", opts),
    "Promo commissions failed",
  );
}

export async function withdrawPromoCommissions(opts: AuthOpts) {
  return requireOk(
    await authedFetch("/promo-purchase-commissions/withdraw", { ...opts, method: "POST", body: {} }),
    "Withdraw commissions failed",
  );
}

export async function fetchCreditScoreMy(opts: AuthOpts) {
  return requireOk(await authedFetch("/credit-score/my", opts), "Credit score failed");
}
