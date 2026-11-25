/**
 * Flexa Wholesale rollout gate — keep in sync with marketplace + API server.
 * false → Super Admin, Admin, Moderator; true → public launch.
 * Regular users, sellers, and support are excluded while launch is false.
 */
/** Keep false until public launch — staff preview (admin + moderator + SA). */
export const WHOLESALE_PUBLIC_LAUNCH = false;

export type WholesaleUser = {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
} | null | undefined;

export function canAccessWholesale(user: WholesaleUser): boolean {
  if (!user) return false;
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  const role = user.role ?? "";
  return !!(
    user.isSuperAdmin ||
    user.isAdmin ||
    role === "superadmin" ||
    role === "admin" ||
    role === "moderator"
  );
}
