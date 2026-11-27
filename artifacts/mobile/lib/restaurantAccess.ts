/**
 * Flexa Restaurant public launch gate (mobile).
 * Keep in sync with marketplace + api-server `RESTAURANT_PUBLIC_LAUNCH`.
 * While false: Super Admin ONLY.
 */
export const RESTAURANT_PUBLIC_LAUNCH = false;

type AccessUser = {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
} | null | undefined;

export function canAccessRestaurant(user: AccessUser): boolean {
  if (RESTAURANT_PUBLIC_LAUNCH) return true;
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const role = String(user.role ?? "").trim().toLowerCase().replace(/[\s-_]+/g, "");
  return role === "superadmin";
}
