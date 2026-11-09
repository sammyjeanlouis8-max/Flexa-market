/**
 * Client-side helpers for admin geographic scope on promotional videos /
 * marketplace feeds. Mirror of server adminScope rules — the API remains the
 * security boundary; these only drive UI filters.
 */

type ScopeUser = {
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
  adminScopeCountry?: string | null;
  adminScopeCountries?: string | null;
  adminScopeDepartment?: string | null;
  adminScopeCity?: string | null;
  country?: string | null;
} | null | undefined;

/** Assigned countries from single + multi-country admin fields. */
export function parseAdminScopeCountriesList(user: ScopeUser): string[] {
  if (!user || user.isSuperAdmin) return [];
  const raw = user.adminScopeCountries;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const countries = parsed.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
        if (countries.length > 0) return countries;
      }
    } catch { /* ignore */ }
  }
  return user.adminScopeCountry ? [user.adminScopeCountry] : [];
}

/**
 * Regular admin assigned Global / all countries (null scope fields).
 * Must never be treated as Super Admin.
 */
export function isGlobalCountryAdmin(user: ScopeUser): boolean {
  if (!user || user.isSuperAdmin) return false;
  if (!user.isAdmin) return false;
  if (user.adminScopeCity || user.adminScopeDepartment) return false;
  return parseAdminScopeCountriesList(user).length === 0;
}
