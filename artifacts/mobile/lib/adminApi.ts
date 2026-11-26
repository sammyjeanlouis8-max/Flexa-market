/** Admin Control Center — stats + moderation/reports for native hub. */
import { getApiBase } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type AdminStats = {
  totalUsers: number;
  totalListings: number;
  activeListings: number;
  pendingReports: number;
  flaggedUsers: number;
  bannedUsers: number;
  boostedListings?: number;
  featuredListings?: number;
  activeSubscriptions?: number;
  visitsToday?: number;
  visitsMonth?: number;
  scopeLevel?: string;
  scopeCountry?: string | null;
};

export type AdminReport = {
  id: number;
  reporterId: number | null;
  reporterName: string;
  targetType: string;
  targetId: number;
  reason: string;
  status: string;
  priority: string | null;
  assignedAdminId: number | null;
  createdAt: string;
};

export type ModerationItem = {
  id: number;
  title: string;
  description?: string | null;
  price?: number | null;
  thumbnail: string | null;
  moderationStatus: string;
  moderationReason?: string | null;
  moderationRiskLevel?: string | null;
  sellerName: string;
  sellerId: number;
  country?: string | null;
  location?: string | null;
  createdAt: string;
  hasVideo?: boolean;
};

export async function fetchAdminStats(opts: AuthOpts): Promise<AdminStats> {
  const res = await fetch(`${getApiBase()}/admin/stats`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Admin stats failed (${res.status})`);
  return {
    totalUsers: Number(data.totalUsers ?? 0),
    totalListings: Number(data.totalListings ?? 0),
    activeListings: Number(data.activeListings ?? 0),
    pendingReports: Number(data.pendingReports ?? 0),
    flaggedUsers: Number(data.flaggedUsers ?? 0),
    bannedUsers: Number(data.bannedUsers ?? 0),
    boostedListings: data.boostedListings != null ? Number(data.boostedListings) : undefined,
    featuredListings: data.featuredListings != null ? Number(data.featuredListings) : undefined,
    activeSubscriptions:
      data.activeSubscriptions != null ? Number(data.activeSubscriptions) : undefined,
    visitsToday: data.visitsToday != null ? Number(data.visitsToday) : undefined,
    visitsMonth: data.visitsMonth != null ? Number(data.visitsMonth) : undefined,
    scopeLevel: data.scopeLevel,
    scopeCountry: data.scopeCountry ?? null,
  };
}

export async function fetchAdminReports(opts: AuthOpts): Promise<AdminReport[]> {
  const res = await fetch(`${getApiBase()}/admin/reports`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Reports failed (${res.status})`);
  const rows = Array.isArray(data) ? data : Array.isArray(data.reports) ? data.reports : [];
  return rows.map((r: any): AdminReport => ({
    id: Number(r.id),
    reporterId: r.reporterId != null ? Number(r.reporterId) : null,
    reporterName: String(r.reporterName ?? "Unknown"),
    targetType: String(r.targetType ?? ""),
    targetId: Number(r.targetId),
    reason: String(r.reason ?? ""),
    status: String(r.status ?? "pending"),
    priority: r.priority != null ? String(r.priority) : null,
    assignedAdminId: r.assignedAdminId != null ? Number(r.assignedAdminId) : null,
    createdAt: String(r.createdAt ?? ""),
  }));
}

export async function decideAdminReport(
  reportId: number,
  decision: "resolve" | "dismiss",
  resolution: string,
  opts: AuthOpts,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/reports/${reportId}/decision`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ decision, resolution }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Report decision failed (${res.status})`);
}

export async function fetchModerationQueue(
  opts: AuthOpts & { status?: "pending" | "rejected" | "approved" },
): Promise<ModerationItem[]> {
  const qs = opts.status ? `?status=${encodeURIComponent(opts.status)}` : "?status=pending";
  const res = await fetch(`${getApiBase()}/admin/moderation${qs}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Moderation failed (${res.status})`);
  const rows = Array.isArray(data) ? data : Array.isArray(data.items) ? data.items : [];
  return rows.map((r: any): ModerationItem => ({
    id: Number(r.id),
    title: String(r.title ?? ""),
    description: r.description ?? null,
    price: r.price != null ? Number(r.price) : null,
    thumbnail: Array.isArray(r.images) && r.images[0] ? String(r.images[0]) : r.thumbnail ?? null,
    moderationStatus: String(r.moderationStatus ?? "pending"),
    moderationReason: r.moderationReason ?? null,
    moderationRiskLevel: r.moderationRiskLevel ?? null,
    sellerName: String(r.sellerName ?? "Unknown"),
    sellerId: Number(r.sellerId ?? 0),
    country: r.country ?? null,
    location: r.location ?? null,
    createdAt: String(r.createdAt ?? ""),
    hasVideo: Boolean(r.hasVideo),
  }));
}

export async function approveModerationItem(id: number, opts: AuthOpts): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/moderation/${id}/approve`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Approve failed (${res.status})`);
}

export async function rejectModerationItem(
  id: number,
  reason: string,
  opts: AuthOpts,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/admin/moderation/${id}/reject`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ reason }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Reject failed (${res.status})`);
}

export function canAccessAdminHub(user: {
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  role?: string;
} | null): boolean {
  if (!user) return false;
  if (user.isAdmin || user.isSuperAdmin) return true;
  const role = (user.role || "").toLowerCase();
  return role === "admin" || role === "superadmin" || role === "moderator";
}
