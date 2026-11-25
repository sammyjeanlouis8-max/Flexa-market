/**
 * Flexa Wholesale rollout gate — keep in sync with marketplace + API server.
 * false → Super Admin, Admin, Moderator; true → public launch.
 * Regular users, sellers, and support are excluded while launch is false.
 */
export const WHOLESALE_PUBLIC_LAUNCH = false;

export type WholesaleUser = {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
} | null | undefined;

export function canAccessWholesale(user: WholesaleUser): boolean {
  if (!user) return false;
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = String(user.role ?? "").trim().toLowerCase();
  return role === "superadmin" || role === "admin" || role === "moderator";
}
