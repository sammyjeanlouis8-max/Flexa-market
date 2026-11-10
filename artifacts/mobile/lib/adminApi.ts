/**
 * Native Super Admin / staff Control Center API client.
 * Wraps existing /api/admin/* and related finance endpoints only.
 */
import { getApiBase } from "./api";
import type { AdminMe } from "./adminRoles";

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

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function requireOk(res: Response, fallback: string): Promise<any> {
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || data.message || `${fallback} (${res.status})`);
  return data;
}

export async function fetchAdminMe(opts: AuthOpts): Promise<AdminMe> {
  const res = await authedFetch("/admin/me", opts);
  return (await requireOk(res, "Admin me failed")) as AdminMe;
}

export async function fetchAdminStats(opts: AuthOpts): Promise<Record<string, any>> {
  const res = await authedFetch("/admin/stats", opts);
  return await requireOk(res, "Admin stats failed");
}

export async function fetchAdminTraffic(
  opts: AuthOpts & { days?: number; period?: string },
): Promise<any> {
  const q = new URLSearchParams();
  if (opts.days) q.set("days", String(opts.days));
  if (opts.period) q.set("period", opts.period);
  const res = await authedFetch(`/admin/analytics/traffic?${q}`, opts);
  return await requireOk(res, "Traffic analytics failed");
}

export async function fetchAdminUsers(
  opts: AuthOpts & { q?: string; country?: string },
): Promise<any[]> {
  const q = new URLSearchParams();
  if (opts.q) q.set("q", opts.q);
  if (opts.country) q.set("country", opts.country);
  const res = await authedFetch(`/admin/users?${q}`, opts);
  const data = await requireOk(res, "Users failed");
  return Array.isArray(data) ? data : Array.isArray(data.users) ? data.users : [];
}

export async function fetchAdminUserActivity(
  userId: number,
  opts: AuthOpts,
): Promise<any> {
  const res = await authedFetch(`/admin/users/${userId}/activity`, opts);
  return await requireOk(res, "User activity failed");
}

export async function postAdminUserAction(
  userId: number,
  action:
    | "ban"
    | "unban"
    | "restrict"
    | "unrestrict"
    | "verify"
    | "unverify"
    | "trust"
    | "untrust"
    | "unflag",
  opts: AuthOpts & { body?: Record<string, unknown> },
): Promise<void> {
  const res = await authedFetch(`/admin/users/${userId}/${action}`, {
    ...opts,
    method: "POST",
    body: opts.body ?? {},
  });
  await requireOk(res, `User ${action} failed`);
}

export async function setAdminUserRole(
  userId: number,
  role: string,
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch(`/admin/users/${userId}/set-role`, {
    ...opts,
    method: "POST",
    body: { role },
  });
  await requireOk(res, "Set role failed");
}

export async function fetchAdminModeration(
  opts: AuthOpts & {
    status?: string;
    country?: string;
    q?: string;
    contentType?: string;
    page?: number;
  },
): Promise<{ items: any[]; total?: number; page?: number }> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.country) q.set("country", opts.country);
  if (opts.q) q.set("q", opts.q);
  if (opts.contentType) q.set("contentType", opts.contentType);
  if (opts.page) q.set("page", String(opts.page));
  const res = await authedFetch(`/admin/moderation?${q}`, opts);
  const data = await requireOk(res, "Moderation failed");
  if (Array.isArray(data)) return { items: data };
  return {
    items: Array.isArray(data.items) ? data.items : Array.isArray(data.listings) ? data.listings : [],
    total: data.total,
    page: data.page,
  };
}

export async function fetchAdminModerationOverview(
  opts: AuthOpts & { country?: string },
): Promise<Record<string, any>> {
  const q = opts.country ? `?country=${encodeURIComponent(opts.country)}` : "";
  const res = await authedFetch(`/admin/moderation/overview${q}`, opts);
  return await requireOk(res, "Moderation overview failed");
}

export async function decideModeration(
  listingId: number,
  decision: "approve" | "reject" | "suspend",
  opts: AuthOpts & { reason?: string },
): Promise<void> {
  const res = await authedFetch(`/admin/moderation/${listingId}/${decision}`, {
    ...opts,
    method: "POST",
    body: { reason: opts.reason },
  });
  await requireOk(res, `Moderation ${decision} failed`);
}

export async function fetchAdminReports(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/reports", opts);
  const data = await requireOk(res, "Reports failed");
  return Array.isArray(data) ? data : Array.isArray(data.reports) ? data.reports : [];
}

export async function decideReport(
  reportId: number,
  decision: string,
  opts: AuthOpts & { notes?: string },
): Promise<void> {
  const res = await authedFetch(`/admin/reports/${reportId}/decision`, {
    ...opts,
    method: "POST",
    body: { decision, notes: opts.notes },
  });
  await requireOk(res, "Report decision failed");
}

export async function fetchAdminOrdersOverview(
  opts: AuthOpts & { status?: string; search?: string; limit?: number },
): Promise<any[]> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.search) q.set("search", opts.search);
  q.set("limit", String(opts.limit ?? 100));
  const res = await authedFetch(`/admin/orders-overview?${q}`, opts);
  const data = await requireOk(res, "Orders overview failed");
  return Array.isArray(data) ? data : Array.isArray(data.orders) ? data.orders : [];
}

export async function fetchAdminDeliveries(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/deliveries", opts);
  return await requireOk(res, "Deliveries analytics failed");
}

export async function fetchAdminDeliveryList(
  opts: AuthOpts & { status?: string },
): Promise<any[]> {
  const q = opts.status ? `?status=${encodeURIComponent(opts.status)}` : "";
  const res = await authedFetch(`/admin/delivery/list${q}`, opts);
  const data = await requireOk(res, "Delivery list failed");
  return Array.isArray(data) ? data : Array.isArray(data.deliveries) ? data.deliveries : [];
}

export async function fetchAdminBoosts(
  opts: AuthOpts & { status?: string; country?: string; paymentMethod?: string },
): Promise<any[]> {
  const q = new URLSearchParams();
  if (opts.status) q.set("status", opts.status);
  if (opts.country) q.set("country", opts.country);
  if (opts.paymentMethod) q.set("paymentMethod", opts.paymentMethod);
  const res = await authedFetch(`/admin/boosts?${q}`, opts);
  const data = await requireOk(res, "Boosts failed");
  return Array.isArray(data) ? data : [];
}

export async function decideBoost(
  boostId: number,
  decision: "approve" | "reject",
  opts: AuthOpts & { reason?: string },
): Promise<void> {
  const res = await authedFetch(`/admin/boosts/${boostId}/${decision}`, {
    ...opts,
    method: "POST",
    body: { reason: opts.reason },
  });
  await requireOk(res, `Boost ${decision} failed`);
}

/** Promo video feed for staff — Super Admin can pass allCountries=1 for global All Videos. */
export async function fetchAdminPromoVideos(
  opts: AuthOpts & { country?: string; allCountries?: boolean; page?: number },
): Promise<{ videos: any[]; total?: number }> {
  const q = new URLSearchParams();
  q.set("page", String(opts.page ?? 1));
  q.set("limit", "20");
  q.set("sort", "all");
  if (opts.allCountries) q.set("allCountries", "1");
  else if (opts.country) q.set("country", opts.country);
  const res = await authedFetch(`/videos/feed?${q}`, opts);
  const data = await requireOk(res, "Promo videos failed");
  return {
    videos: Array.isArray(data.videos) ? data.videos : Array.isArray(data.items) ? data.items : [],
    total: data.total,
  };
}

export async function fetchAdminWallets(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/wallet/admin/all", opts);
  const data = await requireOk(res, "Wallets failed");
  return Array.isArray(data) ? data : Array.isArray(data.wallets) ? data.wallets : [];
}

export async function fetchAdminWalletTransactions(
  opts: AuthOpts & { limit?: number },
): Promise<any[]> {
  const q = new URLSearchParams();
  if (opts.limit) q.set("limit", String(opts.limit));
  const res = await authedFetch(`/wallet/admin/transactions?${q}`, opts);
  const data = await requireOk(res, "Wallet txs failed");
  return Array.isArray(data) ? data : Array.isArray(data.transactions) ? data.transactions : [];
}

export async function fetchAdminCashouts(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/cashout/admin/all", opts);
  const data = await requireOk(res, "Cashouts failed");
  return Array.isArray(data) ? data : Array.isArray(data.requests) ? data.requests : [];
}

export async function reviewCashout(
  input: { requestId: number; decision: "approve" | "reject"; note?: string },
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch("/cashout/admin/review", {
    ...opts,
    method: "POST",
    body: input,
  });
  await requireOk(res, "Cashout review failed");
}

export async function fetchAdminTransactions(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/transactions", opts);
  const data = await requireOk(res, "Transactions failed");
  return Array.isArray(data) ? data : Array.isArray(data.transactions) ? data.transactions : [];
}

export async function fetchAdminLogs(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/logs", opts);
  const data = await requireOk(res, "Logs failed");
  return Array.isArray(data) ? data : Array.isArray(data.logs) ? data.logs : [];
}

export async function fetchAdminAuditLogs(
  opts: AuthOpts & { page?: number },
): Promise<{ items: any[]; total?: number }> {
  const q = new URLSearchParams();
  if (opts.page) q.set("page", String(opts.page));
  const res = await authedFetch(`/admin/audit-logs?${q}`, opts);
  const data = await requireOk(res, "Audit logs failed");
  if (Array.isArray(data)) return { items: data };
  return {
    items: Array.isArray(data.items) ? data.items : Array.isArray(data.logs) ? data.logs : [],
    total: data.total,
  };
}

export async function fetchAdminAuditStats(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/audit-stats", opts);
  return await requireOk(res, "Audit stats failed");
}

export async function fetchAdminTeam(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/admins", opts);
  const data = await requireOk(res, "Admin team failed");
  return Array.isArray(data) ? data : Array.isArray(data.admins) ? data.admins : [];
}

export async function fetchAdminKyc(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/kyc", opts);
  const data = await requireOk(res, "KYC queue failed");
  return Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
}

export async function decideKyc(
  userId: number,
  decision: "approved" | "rejected",
  opts: AuthOpts & { reason?: string },
): Promise<void> {
  const res = await authedFetch(`/admin/kyc/${userId}/decide`, {
    ...opts,
    method: "PATCH",
    body: { decision, reason: opts.reason },
  });
  await requireOk(res, "KYC decision failed");
}

export async function fetchAdminActionQueue(
  opts: AuthOpts & { type?: string; page?: number },
): Promise<{ items: any[]; counts?: any; total?: number }> {
  const q = new URLSearchParams();
  if (opts.type) q.set("type", opts.type);
  if (opts.page) q.set("page", String(opts.page));
  q.set("limit", "50");
  const res = await authedFetch(`/admin/action-queue?${q}`, opts);
  const data = await requireOk(res, "Action queue failed");
  if (Array.isArray(data)) return { items: data };
  return {
    items: Array.isArray(data.items) ? data.items : [],
    counts: data.counts,
    total: data.total,
  };
}

export async function fetchAdminAppeals(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/appeals", opts);
  const data = await requireOk(res, "Appeals failed");
  return Array.isArray(data) ? data : Array.isArray(data.appeals) ? data.appeals : [];
}

export async function decideAppeal(
  appealId: number,
  decision: "uphold" | "overturn",
  decisionReason: string,
  opts: AuthOpts,
): Promise<void> {
  const res = await authedFetch(`/admin/appeals/${appealId}/decision`, {
    ...opts,
    method: "POST",
    body: { decision, decisionReason },
  });
  await requireOk(res, "Appeal decision failed");
}

export async function fetchAdminDriverApplications(
  opts: AuthOpts & { status?: string },
): Promise<any[]> {
  const q = opts.status ? `?status=${encodeURIComponent(opts.status)}` : "";
  const res = await authedFetch(`/admin/delivery/applications${q}`, opts);
  const data = await requireOk(res, "Driver applications failed");
  return Array.isArray(data) ? data : Array.isArray(data.applications) ? data.applications : [];
}

export async function decideDriverApplication(
  id: number,
  action: "approve" | "reject",
  opts: AuthOpts & { adminNote?: string },
): Promise<void> {
  const res = await authedFetch(`/admin/delivery/applications/${id}/${action}`, {
    ...opts,
    method: "PATCH",
    body: { adminNote: opts.adminNote },
  });
  await requireOk(res, `Driver ${action} failed`);
}

export async function fetchAdminAgents(
  opts: AuthOpts & { status?: string },
): Promise<any[]> {
  const q = opts.status ? `?status=${encodeURIComponent(opts.status)}` : "";
  const res = await authedFetch(`/admin/agents${q}`, opts);
  const data = await requireOk(res, "Agent applications failed");
  return Array.isArray(data) ? data : Array.isArray(data.agents) ? data.agents : Array.isArray(data.applications) ? data.applications : [];
}

export async function decideAdminAgent(
  id: number,
  action: "approve" | "reject",
  opts: AuthOpts & { note?: string },
): Promise<void> {
  const res = await authedFetch(`/admin/agents/${id}/${action}`, {
    ...opts,
    method: "PATCH",
    body: { note: opts.note, adminNote: opts.note },
  });
  await requireOk(res, `Agent ${action} failed`);
}

export async function fetchAdminStripeTransactions(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/stripe-transactions?limit=50", opts);
  const data = await requireOk(res, "Stripe transactions failed");
  return Array.isArray(data)
    ? data
    : Array.isArray(data.transactions)
      ? data.transactions
      : Array.isArray(data.items)
        ? data.items
        : [];
}

export async function fetchAdminReturns(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/returns", opts);
  const data = await requireOk(res, "Returns failed");
  return Array.isArray(data) ? data : Array.isArray(data.returns) ? data.returns : [];
}

export async function decideAdminReturn(
  returnId: number,
  decision: string,
  opts: AuthOpts & { note?: string },
): Promise<void> {
  const res = await authedFetch(`/admin/returns/${returnId}/decide`, {
    ...opts,
    method: "POST",
    body: { decision, note: opts.note },
  });
  await requireOk(res, "Return decision failed");
}

export async function fetchAdminFraudDashboard(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/fraud/dashboard", opts);
  return await requireOk(res, "Fraud dashboard failed");
}

export async function fetchAdminFraudAlerts(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/fraud/alerts", opts);
  const data = await requireOk(res, "Fraud alerts failed");
  return Array.isArray(data) ? data : Array.isArray(data.alerts) ? data.alerts : [];
}

export async function fetchAdminCommissionSummary(opts: AuthOpts): Promise<any> {
  const res = await authedFetch("/admin/commission/summary", opts);
  return await requireOk(res, "Commission summary failed");
}

export async function fetchAdminPlatformRevenue(
  opts: AuthOpts & { period?: string },
): Promise<any> {
  const q = opts.period ? `?period=${encodeURIComponent(opts.period)}` : "";
  const res = await authedFetch(`/admin/platform-revenue${q}`, opts);
  return await requireOk(res, "Platform revenue failed");
}

export async function fetchAdminFlexCards(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/flex-card", opts);
  const data = await requireOk(res, "Flex card admin failed");
  return Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : Array.isArray(data.debts) ? data.debts : [];
}

export async function fetchAdminLoans(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/loans", opts);
  const data = await requireOk(res, "Admin loans failed");
  return Array.isArray(data) ? data : Array.isArray(data.loans) ? data.loans : Array.isArray(data.applications) ? data.applications : [];
}

export async function fetchAdminSubscriptions(opts: AuthOpts): Promise<any[]> {
  const res = await authedFetch("/admin/subscriptions", opts);
  const data = await requireOk(res, "Admin subscriptions failed");
  return Array.isArray(data) ? data : Array.isArray(data.subscriptions) ? data.subscriptions : [];
}
