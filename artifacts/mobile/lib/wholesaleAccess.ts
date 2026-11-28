/**
 * Flexa Wholesale public launch gate — keep in sync with marketplace + API server.
 * true → public browse; false → Super Admin / Admin / Moderator only.
 * Seller writes still require auth + ownership on the API.
 */
export const WHOLESALE_PUBLIC_LAUNCH = true;

export type WholesaleUser = {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
} | null | undefined;

export function canAccessWholesale(user: WholesaleUser): boolean {
  if (WHOLESALE_PUBLIC_LAUNCH) return true;
  if (!user) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = String(user.role ?? "").trim().toLowerCase();
  return role === "superadmin" || role === "admin" || role === "moderator";
}
