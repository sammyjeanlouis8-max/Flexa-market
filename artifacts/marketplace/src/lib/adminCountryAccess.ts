/**
 * Client-side helpers for admin geographic scope on promotional videos /
 * marketplace feeds. Mirror of server adminScope rules — the API remains the
 * security boundary; these only drive UI filters.
 */

export type ScopeUser = {
  isAdmin?: boolean | null;
  isSuperAdmin?: boolean | null;
  role?: string | null;
  adminScopeCountry?: string | null;
  adminScopeCountries?: string | null;
  adminScopeDepartment?: string | null;
  adminScopeCity?: string | null;
  country?: string | null;
} | null | undefined;

/** Assigned countries from single + multi-country admin fields. */
export function parseAdminScopeCountriesList(user: ScopeUser): string[] {
  if (!user || user.isSuperAdmin || user.role === "superadmin") return [];
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
  if (!user || user.isSuperAdmin || user.role === "superadmin") return false;
  if (!user.isAdmin && user.role !== "admin") return false;
  if (user.adminScopeCity || user.adminScopeDepartment) return false;
  return parseAdminScopeCountriesList(user).length === 0;
}

export function isSuperAdminUser(user: ScopeUser): boolean {
  return !!(user?.isSuperAdmin || user?.role === "superadmin");
}

export function isAdminUser(user: ScopeUser): boolean {
  return !!(user?.isAdmin || user?.isSuperAdmin || user?.role === "admin" || user?.role === "superadmin");
}

/** Admin who can pick among multiple countries (or All). */
export function isMultiCountryAdmin(user: ScopeUser): boolean {
  if (!isAdminUser(user) || isSuperAdminUser(user) || isGlobalCountryAdmin(user)) return false;
  return parseAdminScopeCountriesList(user).length > 1;
}

/**
 * Countries the admin may select in the picker.
 * Super / global → empty list means "use SUPPORTED_COUNTRIES in the UI".
 * Multi / single → assigned countries only.
 */
export function getAdminSelectableCountries(user: ScopeUser): string[] {
  if (!isAdminUser(user)) return [];
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) return [];
  return parseAdminScopeCountriesList(user);
}

/** Can the admin choose "All Countries"? */
export function canAdminSelectAllCountries(user: ScopeUser): boolean {
  if (!isAdminUser(user)) return false;
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) return true;
  return parseAdminScopeCountriesList(user).length > 1;
}

/**
 * Resolve the effective marketplace/promo country filter.
 * null = All Countries (authorized union / worldwide for SA/global).
 * Single-country admins are locked to their assignment.
 */
export function resolveEffectiveAdminCountry(
  user: ScopeUser,
  selectedCountry: string | null,
): string | null {
  if (!isAdminUser(user)) return null;
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) {
    return selectedCountry;
  }
  const assigned = parseAdminScopeCountriesList(user);
  if (assigned.length === 0) return null;
  if (assigned.length === 1) return assigned[0];
  if (selectedCountry && assigned.some(c => c.toLowerCase() === selectedCountry.toLowerCase())) {
    return assigned.find(c => c.toLowerCase() === selectedCountry.toLowerCase()) ?? selectedCountry;
  }
  return null; // All of their authorized countries
}

/** Show per-video country flags when viewing more than one country. */
export function shouldShowAdminCountryFlags(
  user: ScopeUser,
  effectiveCountry: string | null,
): boolean {
  if (!isAdminUser(user)) return false;
  if (effectiveCountry) return false; // single-country view — flag optional
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) return true;
  return parseAdminScopeCountriesList(user).length > 1;
}

/**
 * Query params for /api/videos/feed under the admin country context.
 * Regular users omit these — the server uses profile / geo.
 */
export function buildAdminVideoFeedParams(
  user: ScopeUser,
  effectiveCountry: string | null,
): { country?: string; allCountries?: "1" } {
  if (!isAdminUser(user)) return {};
  if (effectiveCountry) return { country: effectiveCountry };
  // All Countries — SA / global-country admin need the explicit unlock so a
  // stale ?country= cannot shrink the feed. Multi-country admins omit both
  // (server returns the assigned union).
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) {
    return { allCountries: "1" };
  }
  return {};
}
