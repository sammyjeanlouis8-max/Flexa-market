/**
 * Native Flexa Control access helpers.
 * Mirror server getRole / hasRole — API remains the security boundary.
 */

export type StaffRole = "user" | "support" | "moderator" | "admin" | "superadmin";

export type StaffishUser = {
  id?: number;
  role?: string | null;
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
  isAdminSuspended?: boolean | null;
  adminSuspendedUntil?: string | null;
} | null | undefined;

const ROLE_RANK: Record<StaffRole, number> = {
  user: 0,
  support: 1,
  moderator: 2,
  admin: 3,
  superadmin: 4,
};

/** Normalize role strings like "Super Admin", "super_admin" → "superadmin". */
export function normalizeRole(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");
}

/** Canonical staff role — same precedence as api-server getRole. */
export function getCanonicalRole(user: StaffishUser): StaffRole {
  if (!user) return "user";
  const explicit = normalizeRole(user.role);
  if (
    explicit === "superadmin" ||
    explicit === "admin" ||
    explicit === "moderator" ||
    explicit === "support"
  ) {
    return explicit;
  }
  if (user.isSuperAdmin) return "superadmin";
  if (user.isAdmin) return "admin";
  return "user";
}

export function hasMinRole(user: StaffishUser, min: StaffRole): boolean {
  return ROLE_RANK[getCanonicalRole(user)] >= ROLE_RANK[min];
}

/**
 * Client hint that the account may open Flexa Control.
 * Final authority is GET /admin/me (requireRole("support")).
 */
export function mayAccessFlexaControl(user: StaffishUser): boolean {
  return hasMinRole(user, "support");
}

export function roleDisplayLabel(role: StaffRole | string): string {
  const r = normalizeRole(role);
  if (r === "superadmin") return "Super Admin";
  if (r === "admin") return "Admin";
  if (r === "moderator") return "Moderator";
  if (r === "support") return "Support";
  return "Member";
}

export function isAdminAccessSuspended(user: StaffishUser): boolean {
  if (!user || getCanonicalRole(user) === "superadmin" || !user.isAdminSuspended) return false;
  const until = user.adminSuspendedUntil;
  return !until || new Date(until) > new Date();
}

export type AdminMe = {
  id: number;
  name?: string | null;
  email?: string | null;
  role: string;
  scopeLevel?: string | null;
  scopeCountry?: string | null;
  scopeCountries?: string[] | null;
  scopeDepartment?: string | null;
  scopeCity?: string | null;
  permissions?: Record<string, boolean>;
};

export type AccessPhase =
  | "boot"
  | "unauthenticated"
  | "checking"
  | "allowed"
  | "denied"
  | "session_expired"
  | "network_error";
