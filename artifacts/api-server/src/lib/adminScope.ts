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

export function userInAdminScope(admin: AdminUser, target: AdminUser): boolean {
  if (admin.isSuperAdmin) return true;

  const parsedCountries = parseAdminCountries(admin);
  const countries = parsedCountries.length > 0
    ? parsedCountries
    : admin.adminScopeCountry
      ? [admin.adminScopeCountry]
      : [];

  if (countries.length > 0 && (!target.country || !countries.includes(target.country))) return false;
  if (admin.adminScopeCity && target.location !== admin.adminScopeCity) return false;

  if (!admin.adminScopeCity && admin.adminScopeDepartment && admin.adminScopeCountry) {
    const departmentCities = SCOPE_OPTIONS[admin.adminScopeCountry]?.citiesByDept[admin.adminScopeDepartment] ?? [];
    if (departmentCities.length === 0) return false;
    if (!target.location || !departmentCities.includes(target.location)) return false;
  }

  return true;
}