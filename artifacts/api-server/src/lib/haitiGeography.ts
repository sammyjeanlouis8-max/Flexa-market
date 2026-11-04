/**
 * Validated Haitian administrative geography for motorcycle dispatch.
 * Display names are canonical; matching is accent/case/spacing insensitive.
 */

export const HAITI_DEPARTMENT_COMMUNES: Record<string, readonly string[]> = {
  Ouest: [
    "Port-au-Prince", "Pétion-Ville", "Delmas", "Carrefour", "Tabarre",
    "Croix-des-Bouquets", "Léogâne", "Kenscoff", "Arcahaie", "Thomazeau",
  ],
  Nord: ["Cap-Haïtien"],
  Artibonite: ["Gonaïves", "Saint-Marc", "Verrettes", "Montrouis"],
  Centre: ["Hinche", "Mirebalais"],
  Sud: ["Les Cayes"],
  "Grand'Anse": ["Jérémie"],
  "Sud-Est": ["Jacmel"],
  Nippes: ["Miragoâne"],
};

/** Default authorized neighbor communes when a driver is based in a primary commune. */
export const DEFAULT_SERVICE_ZONE_NEIGHBORS: Record<string, readonly string[]> = {
  "Carrefour": ["Carrefour", "Port-au-Prince", "Delmas"],
  "Port-au-Prince": ["Port-au-Prince", "Delmas", "Pétion-Ville", "Carrefour", "Tabarre"],
  "Delmas": ["Delmas", "Port-au-Prince", "Pétion-Ville", "Tabarre"],
  "Pétion-Ville": ["Pétion-Ville", "Port-au-Prince", "Delmas", "Tabarre", "Kenscoff"],
  "Tabarre": ["Tabarre", "Port-au-Prince", "Delmas", "Croix-des-Bouquets"],
  "Croix-des-Bouquets": ["Croix-des-Bouquets", "Tabarre", "Port-au-Prince"],
  "Léogâne": ["Léogâne", "Carrefour"],
  "Kenscoff": ["Kenscoff", "Pétion-Ville"],
  "Cap-Haïtien": ["Cap-Haïtien"],
  "Gonaïves": ["Gonaïves"],
  "Saint-Marc": ["Saint-Marc", "Montrouis"],
  "Les Cayes": ["Les Cayes"],
  "Jacmel": ["Jacmel"],
  "Jérémie": ["Jérémie"],
  "Hinche": ["Hinche", "Mirebalais"],
  "Mirebalais": ["Mirebalais", "Hinche"],
};

export function normalizeCommuneKey(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const CANONICAL_BY_KEY: Map<string, { commune: string; department: string }> = (() => {
  const map = new Map<string, { commune: string; department: string }>();
  for (const [department, communes] of Object.entries(HAITI_DEPARTMENT_COMMUNES)) {
    for (const commune of communes) {
      map.set(normalizeCommuneKey(commune), { commune, department });
      // Common aliases
      if (commune === "Pétion-Ville") {
        map.set("petionville", { commune, department });
        map.set("petion ville", { commune, department });
      }
      if (commune === "Croix-des-Bouquets") {
        map.set("croix des bouquets", { commune, department });
      }
      if (commune === "Cap-Haïtien") {
        map.set("cap haitien", { commune, department });
        map.set("cap haïtien", { commune, department });
      }
    }
  }
  return map;
})();

export function resolveHaitiCommune(raw: string | null | undefined): { commune: string; department: string } | null {
  const key = normalizeCommuneKey(raw);
  if (!key) return null;
  return CANONICAL_BY_KEY.get(key) ?? null;
}

export function communesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = normalizeCommuneKey(a);
  const kb = normalizeCommuneKey(b);
  return !!ka && ka === kb;
}

export function findDepartmentForCommune(commune: string | null | undefined): string | null {
  return resolveHaitiCommune(commune)?.department ?? null;
}

/** Default authorized set for a primary commune (includes itself). */
export function defaultAuthorizedCommunes(primaryCommune: string | null | undefined): string[] {
  const resolved = resolveHaitiCommune(primaryCommune);
  if (!resolved) return primaryCommune ? [String(primaryCommune)] : [];
  const neighbors = DEFAULT_SERVICE_ZONE_NEIGHBORS[resolved.commune];
  if (neighbors?.length) return [...neighbors];
  return [resolved.commune];
}
