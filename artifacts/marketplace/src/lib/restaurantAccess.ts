import type { ScopeUser } from "@/lib/adminCountryAccess";

/**
 * Flexa Restaurant public launch gate.
 *
 * true  → visible to everyone (guests may browse; auth for protected ops)
 * false → Super Admin ONLY (not Admin / Moderator)
 *
 * Keep in sync with api-server + mobile `RESTAURANT_PUBLIC_LAUNCH`.
 */
export const RESTAURANT_PUBLIC_LAUNCH = true;

function roleOf(user: ScopeUser): string {
  return String(user?.role ?? "").trim().toLowerCase().replace(/[\s-_]+/g, "");
}

/** Menu + /restaurant access. */
export function canAccessRestaurant(user: ScopeUser | null | undefined): boolean {
  if (RESTAURANT_PUBLIC_LAUNCH) return true;
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return roleOf(user) === "superadmin";
}
