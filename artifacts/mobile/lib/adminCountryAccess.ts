/**
 * Client-side helpers for admin geographic scope.
 * Mirror of marketplace/src/lib/adminCountryAccess.ts — API is the security boundary.
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

export function parseAdminScopeCountriesList(user: ScopeUser): string[] {
  if (!user || user.isSuperAdmin || user.role === "superadmin") return [];
  const raw = user.adminScopeCountries;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        const countries = parsed.filter(
          (c): c is string => typeof c === "string" && c.trim().length > 0,
        );
        if (countries.length > 0) return countries;
      }
    } catch {
      /* ignore */
    }
  }
  return user.adminScopeCountry ? [user.adminScopeCountry] : [];
}

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
  return !!(
    user?.isAdmin ||
    user?.isSuperAdmin ||
    user?.role === "admin" ||
    user?.role === "superadmin"
  );
}

export function isMultiCountryAdmin(user: ScopeUser): boolean {
  if (!isAdminUser(user) || isSuperAdminUser(user) || isGlobalCountryAdmin(user)) return false;
  return parseAdminScopeCountriesList(user).length > 1;
}

export function getAdminSelectableCountries(user: ScopeUser): string[] {
  if (!isAdminUser(user)) return [];
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) return [];
  return parseAdminScopeCountriesList(user);
}

export function canAdminSelectAllCountries(user: ScopeUser): boolean {
  if (!isAdminUser(user)) return false;
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) return true;
  return parseAdminScopeCountriesList(user).length > 1;
}

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
  if (selectedCountry && assigned.some((c) => c.toLowerCase() === selectedCountry.toLowerCase())) {
    return assigned.find((c) => c.toLowerCase() === selectedCountry.toLowerCase()) ?? selectedCountry;
  }
  return null;
}

export type AdminVideoFeedParams = { country?: string; allCountries?: "1" };

export function buildAdminVideoFeedParams(
  user: ScopeUser,
  effectiveCountry: string | null,
): AdminVideoFeedParams {
  if (!isAdminUser(user)) return {};
  if (effectiveCountry) return { country: effectiveCountry };
  if (isSuperAdminUser(user) || isGlobalCountryAdmin(user)) {
    return { allCountries: "1" };
  }
  return {};
}
