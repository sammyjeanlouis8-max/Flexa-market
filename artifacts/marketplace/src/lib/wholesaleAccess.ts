import { isSuperAdminUser, type ScopeUser } from "@/lib/adminCountryAccess";

/**
 * Flexa Wholesale rollout gate.
 *
 * false  → authenticated Super Admin only (preview / build phase on Market DB)
 * true   → visible to everyone (flip this when wholesale is ready to launch)
 *
 * Regular users, sellers, moderators, and non–Super Admin admins must never
 * see the Flexa Wholesale menu or open /wholesale while this flag is false.
 */
export const WHOLESALE_PUBLIC_LAUNCH = false;

/** Menu + /wholesale access during the Market-native rebuild. */
export function canAccessWholesale(user: ScopeUser | null | undefined): boolean {
  if (!user) return false;
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  return isSuperAdminUser(user);
}
