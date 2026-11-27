import type { ScopeUser } from "@/lib/adminCountryAccess";

/**
 * Flexa Restaurant public launch gate.
 *
 * false → Super Admin ONLY (not Admin / Moderator)
 * true  → visible to everyone after explicit Super Admin approval
 *
 * Keep in sync with api-server + mobile `RESTAURANT_PUBLIC_LAUNCH`.
 */
export const RESTAURANT_PUBLIC_LAUNCH = false;

function roleOf(user: ScopeUser): string {
  return String(user?.role ?? "").trim().toLowerCase().replace(/[\s-_]+/g, "");
}

/** Menu + /restaurant access while public launch is false: Super Admin only. */
export function canAccessRestaurant(user: ScopeUser | null | undefined): boolean {
  if (RESTAURANT_PUBLIC_LAUNCH) return true;
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return roleOf(user) === "superadmin";
}
