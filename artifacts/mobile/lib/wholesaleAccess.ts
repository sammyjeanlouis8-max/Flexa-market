/**
 * Flexa Wholesale rollout gate — keep in sync with marketplace + API server.
 * false → Super Admin only; true → public launch.
 */
export const WHOLESALE_PUBLIC_LAUNCH = false;

export type WholesaleUser = {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
} | null | undefined;

export function canAccessWholesale(user: WholesaleUser): boolean {
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  return !!user?.isSuperAdmin;
}
