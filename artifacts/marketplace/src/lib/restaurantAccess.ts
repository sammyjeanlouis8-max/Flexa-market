import type { ScopeUser } from "@/lib/adminCountryAccess";

/**
 * Flexa Restaurant public launch gate.
 *
 * false → Super Admin / Admin / Moderator only (server + client must agree)
 * true  → visible to everyone after explicit Super Admin approval
 *
 * Keep in sync with api-server `RESTAURANT_PUBLIC_LAUNCH`.
 */
export const RESTAURANT_PUBLIC_LAUNCH = false;

function staffRole(user: ScopeUser): string {
  return String(user?.role ?? "").trim().toLowerCase();
}

/** Menu + /restaurant access while public launch is false. */
export function canAccessRestaurant(user: ScopeUser | null | undefined): boolean {
  if (RESTAURANT_PUBLIC_LAUNCH) return true;
  if (!user) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = staffRole(user);
  return role === "superadmin" || role === "admin" || role === "moderator";
}
