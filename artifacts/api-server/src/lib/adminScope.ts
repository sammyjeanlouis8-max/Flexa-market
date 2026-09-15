import { usersTable } from "@workspace/db";

type AdminUser = typeof usersTable.$inferSelect;

export const SCOPE_OPTIONS: Record<string, { departments: string[]; citiesByDept: Record<string, string[]> }> = {
  Haiti: {
    departments: ["Ouest", "Nord", "Nord-Est", "Nord-Ouest", "Artibonite", "Centre", "Sud", "Grand'Anse", "Sud-Est", "Nippes"],
    citiesByDept: {
      Ouest: ["Port-au-Prince", "Pétion-Ville", "Delmas", "Carrefour"],
      Nord: ["Cap-Haïtien"],
      "Nord-Ouest": ["Port-de-Paix"],
      "Sud-Est": ["Jacmel"],
      Sud: ["Les Cayes"],
      Artibonite: ["Gonaïves"],
      "Grand'Anse": ["Jérémie"],
    },
  },
  USA: {
    departments: ["Northeast", "Southeast", "Midwest", "Southwest", "West"],
    citiesByDept: {
      Northeast: ["New York, NY", "Brooklyn, NY", "Queens, NY", "Boston, MA", "Philadelphia, PA", "Newark, NJ"],
      Southeast: ["Miami, FL", "Orlando, FL", "Atlanta, GA", "Washington, DC"],
      Midwest: ["Chicago, IL"],
      Southwest: ["Houston, TX"],
      West: ["Los Angeles, CA"],
    },
  },
  "Dominican Republic": {
    departments: ["Norte", "Sur", "Este"],
    citiesByDept: {
      Norte: ["Santiago", "Puerto Plata"],
      Sur: ["Santo Domingo", "San Pedro de Macorís"],
      Este: ["La Romana", "Punta Cana", "Higüey"],
    },
  },
  Canada: {
    departments: ["Quebec", "Ontario", "British Columbia", "Alberta"],
    citiesByDept: {
      Quebec: ["Montréal, QC", "Québec, QC"],
      Ontario: ["Toronto, ON", "Ottawa, ON"],
      "British Columbia": ["Vancouver, BC"],
      Alberta: ["Calgary, AB", "Edmonton, AB"],
    },
  },
};

export function parseAdminCountries(admin: AdminUser): string[] {
  if (!admin.adminScopeCountries) return [];
  try {
    const value = JSON.parse(admin.adminScopeCountries);
    return Array.isArray(value) ? value.filter((country): country is string => typeof country === "string") : [];
  } catch {
    return [];
  }
}

/** Country assignments, including the legacy single-country field. */
export function getAdminScopeCountries(admin: AdminUser): string[] {
  const parsedCountries = parseAdminCountries(admin);
  if (parsedCountries.length > 0) return parsedCountries;
  if (admin.adminScopeCountry) return [admin.adminScopeCountry];
  // Legacy admins without explicit scope remain limited to their profile
  // country; absence of scope metadata must not silently grant global access.
  return admin.country ? [admin.country] : [];
}

/**
 * Returns the cities represented by a department assignment.  The scope
 * options are intentionally the source of truth here; an unknown department
 * does not silently become a global scope.
 */
export function getAdminScopeCities(admin: AdminUser): string[] {
  if (admin.adminScopeCity) return [admin.adminScopeCity];

  if (!admin.adminScopeDepartment) return [];
  const countries = getAdminScopeCountries(admin);
  return [...new Set(countries.flatMap((country) =>
    SCOPE_OPTIONS[country]?.citiesByDept[admin.adminScopeDepartment!] ?? []
  ))];
}

/** Checks a listing-shaped target against an administrator's full scope. */
export function listingInAdminScope(
  admin: AdminUser,
  target: { country?: string | null; city?: string | null; location?: string | null },
): boolean {
  if (admin.isSuperAdmin) return true;

  const countries = getAdminScopeCountries(admin);
  if (countries.length === 0 || !target.country || !countries.includes(target.country)) return false;

  const scopedCities = getAdminScopeCities(admin);
  if (admin.adminScopeCity) {
    const targetCity = target.city || target.location;
    return targetCity === admin.adminScopeCity;
  }
  if (admin.adminScopeDepartment) {
    const targetCity = target.city || target.location;
    return scopedCities.length > 0 && !!targetCity && scopedCities.includes(targetCity);
  }

  return true;
}

export function userInAdminScope(admin: AdminUser, target: AdminUser): boolean {
  if (admin.isSuperAdmin) return true;

  const countries = getAdminScopeCountries(admin);

  if (countries.length === 0 || !target.country || !countries.includes(target.country)) return false;
  if (admin.adminScopeCity && target.location !== admin.adminScopeCity) return false;

  if (!admin.adminScopeCity && admin.adminScopeDepartment) {
    const departmentCities = getAdminScopeCities(admin);
    if (departmentCities.length === 0) return false;
    if (!target.location || !departmentCities.includes(target.location)) return false;
  }

  return true;
}