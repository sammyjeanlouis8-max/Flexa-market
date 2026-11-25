import { isSuperAdminUser, type ScopeUser } from "@/lib/adminCountryAccess";

/**
 * Flexa Wholesale rollout gate.
 *
 * false  → Super Admin only (preview / build phase on Market DB)
 * true   → visible to everyone (flip this when wholesale is ready to launch)
 */
export const WHOLESALE_PUBLIC_LAUNCH = false;

/** Menu + /wholesale access during the Market-native rebuild. */
export function canAccessWholesale(user: ScopeUser | null | undefined): boolean {
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  return isSuperAdminUser(user);
}
