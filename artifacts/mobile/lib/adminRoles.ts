/**
 * Client-side admin RBAC helpers. Server middleware remains authoritative.
 */
import type { User } from "@/context/AuthContext";

export type AdminRole =
  | "user"
  | "support"
  | "moderator"
  | "admin"
  | "superadmin"
  | "finance";

const RANK: Record<string, number> = {
  user: 0,
  support: 1,
  moderator: 2,
  admin: 3,
  finance: 3,
  superadmin: 4,
};

export function resolveAdminRole(user: User | null | undefined): AdminRole {
  if (!user) return "user";
  if (user.isSuperAdmin) return "superadmin";
  const r = String(user.role ?? "").toLowerCase();
  if (r === "superadmin") return "superadmin";
  if (r === "admin" || user.isAdmin) return "admin";
  if (r === "moderator") return "moderator";
  if (r === "support") return "support";
  if (r === "finance" || r === "finance_manager") return "finance";
  return "user";
}

export function hasMinAdminRole(
  user: User | null | undefined,
  min: AdminRole,
): boolean {
  return (RANK[resolveAdminRole(user)] ?? 0) >= (RANK[min] ?? 0);
}

export function canAccessAdminCenter(user: User | null | undefined): boolean {
  return hasMinAdminRole(user, "support");
}

export function canModerate(user: User | null | undefined): boolean {
  return hasMinAdminRole(user, "moderator");
}

export function canManageUsersHard(user: User | null | undefined): boolean {
  return hasMinAdminRole(user, "admin");
}

export function canAccessFinance(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  if (user.isAdmin && resolveAdminRole(user) === "admin") return true;
  const r = String(user.role ?? "").toLowerCase();
  return r === "finance" || r === "finance_manager" || r === "superadmin";
}

export function isSuperAdminUser(user: User | null | undefined): boolean {
  return resolveAdminRole(user) === "superadmin";
}

export type AdminMe = {
  id?: number;
  name?: string;
  email?: string;
  role?: string;
  scopeLevel?: string;
  scopeCountry?: string | null;
  scopeCountries?: string[] | null;
  permissions?: Record<string, boolean>;
};
