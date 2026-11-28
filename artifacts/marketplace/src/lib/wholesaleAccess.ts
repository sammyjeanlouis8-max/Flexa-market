import type { ScopeUser } from "@/lib/adminCountryAccess";

/**
 * Flexa Wholesale public launch gate.
 *
 * true  → browse available to everyone (including guests)
 * false → authenticated staff only: Super Admin, Admin, Moderator
 *
 * Keep in sync with mobile + api-server `WHOLESALE_PUBLIC_LAUNCH`.
 * Seller writes still require authentication + ownership checks on the API.
 */
export const WHOLESALE_PUBLIC_LAUNCH = true;

function staffRole(user: ScopeUser): string {
  return String(user?.role ?? "").trim().toLowerCase();
}

/**
 * Menu + /wholesale module access.
 * When public launch is on, guests and regular users may browse.
 */
export function canAccessWholesale(user: ScopeUser | null | undefined): boolean {
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  if (!user) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = staffRole(user);
  return role === "superadmin" || role === "admin" || role === "moderator";
}
