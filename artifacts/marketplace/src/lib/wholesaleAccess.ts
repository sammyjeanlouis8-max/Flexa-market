import type { ScopeUser } from "@/lib/adminCountryAccess";

/**
 * Flexa Wholesale rollout gate.
 *
 * false  → authenticated staff only: Super Admin, Admin, Moderator
 * true   → visible to everyone (flip this when wholesale is ready to launch)
 *
 * Regular users / sellers / support must not see the Flexa Wholesale menu
 * or open /wholesale while this flag is false.
 */
export const WHOLESALE_PUBLIC_LAUNCH = false;

function staffRole(user: ScopeUser): string {
  return String(user?.role ?? "").trim().toLowerCase();
}

/**
 * Menu + /wholesale access during the Market-native rebuild.
 * Uses the same staff signals as the Admin badge / admin drawer chrome.
 */
export function canAccessWholesale(user: ScopeUser | null | undefined): boolean {
  if (!user) return false;
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = staffRole(user);
  return role === "superadmin" || role === "admin" || role === "moderator";
}
