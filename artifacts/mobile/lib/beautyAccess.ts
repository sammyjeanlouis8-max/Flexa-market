/**
 * Séduire Beauty public launch gate.
 * Keep in sync with api-server + marketplace `BEAUTY_PUBLIC_LAUNCH`.
 * true → public browse; false → Super Admin ONLY.
 */
export const BEAUTY_PUBLIC_LAUNCH = true;

type ScopeUser = {
  isSuperAdmin?: boolean;
  isAdmin?: boolean;
  role?: string | null;
} | null | undefined;

function roleOf(user: ScopeUser): string {
  return String(user?.role ?? "").trim().toLowerCase().replace(/[\s-_]+/g, "");
}

export function canAccessBeauty(user: ScopeUser): boolean {
  if (BEAUTY_PUBLIC_LAUNCH) return true;
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  return roleOf(user) === "superadmin";
}
