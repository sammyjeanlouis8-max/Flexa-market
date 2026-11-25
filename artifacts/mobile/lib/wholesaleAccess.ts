/**
 * Flexa Wholesale rollout gate — keep in sync with marketplace + API server.
 * false → authenticated Super Admin only; true → public launch.
 * Regular users, sellers, moderators, and non–Super Admin admins are excluded.
 */
/** Keep false until public launch — Super Admin only (not regular admin/moderator). */
export const WHOLESALE_PUBLIC_LAUNCH = false;

export type WholesaleUser = {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
} | null | undefined;

export function canAccessWholesale(user: WholesaleUser): boolean {
  if (!user) return false;
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  return !!(user.isSuperAdmin || user.role === "superadmin");
}
