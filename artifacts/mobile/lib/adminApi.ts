/** Admin Control Center — read-only stats for native hub. */
import { getApiBase } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

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

export async function fetchAdminStats(opts: AuthOpts): Promise<AdminStats> {
  const res = await fetch(`${getApiBase()}/admin/stats`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await res.json().catch(() => ({}));
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
