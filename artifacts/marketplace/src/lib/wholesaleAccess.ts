import { isAdminUser, isSuperAdminUser, type ScopeUser } from "@/lib/adminCountryAccess";

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

function isModeratorUser(user: ScopeUser): boolean {
  return user?.role === "moderator";
}

/** Menu + /wholesale access during the Market-native rebuild. */
export function canAccessWholesale(user: ScopeUser | null | undefined): boolean {
  if (!user) return false;
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  return isSuperAdminUser(user) || isAdminUser(user) || isModeratorUser(user);
}
