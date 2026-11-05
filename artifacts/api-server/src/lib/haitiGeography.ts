/**
 * Haiti administrative geography — 10 departments + communes.
 * Source of truth for driver work-zone selection and delivery matching.
 * Display names are official commune labels; matching uses normalized forms.
 *
 * Dataset: Haiti departmental / communal administrative divisions
 * (IHSI / government commune inventory). Includes primary spelling +
 * common ASCII / hyphen variants for pickup-city matching.
 */

export const HAITI_DEPARTMENT_NAMES = [
  "Ouest",
  "Nord",
  "Nord-Est",
  "Nord-Ouest",
  "Artibonite",
  "Centre",
  "Sud",
  "Sud-Est",
  "Grand'Anse",
  "Nippes",
] as const;

export type HaitiDepartment = (typeof HAITI_DEPARTMENT_NAMES)[number];

/** Display communes grouped by department (UI + validation). */
export const HAITI_COMMUNES_BY_DEPARTMENT: Record<HaitiDepartment, string[]> = {
  Ouest: [
    "Port-au-Prince", "Delmas", "Pétion-Ville", "Tabarre", "Cité Soleil", "Carrefour",
    "Kenscoff", "Gressier", "Ganthier", "Croix-des-Bouquets", "Thomazeau", "Cornillon",
    "Fonds-Verrettes", "Arcahaie", "Cabaret", "Anse-à-Galets", "Pointe-à-Raquette",
    "Léogâne", "Petit-Goâve", "Grand-Goâve",
  ],
  Nord: [
    "Cap-Haïtien", "Quartier-Morin", "Limonade", "Acul-du-Nord", "Plaine-du-Nord",
    "Milot", "Grande-Rivière-du-Nord", "Bahon", "Saint-Raphaël", "Dondon", "Ranquitte",
    "Pignon", "La Victoire", "Borgne", "Port-Margot", "Limbé", "Bas-Limbé", "Plaisance", "Pilate",
  ],
  "Nord-Est": [
    "Fort-Liberté", "Ferrier", "Perches", "Ouanaminthe", "Capotille", "Mont-Organisé",
    "Trou-du-Nord", "Caracol", "Terrier-Rouge", "Sainte-Suzanne", "Vallières", "Carice", "Mombin-Crochu",
  ],
  "Nord-Ouest": [
    "Port-de-Paix", "La Tortue", "Bassin-Bleu", "Chansolme", "Saint-Louis-du-Nord",
    "Anse-à-Foleur", "Môle-Saint-Nicolas", "Baie-de-Henne", "Bombardopolis", "Jean-Rabel",
  ],
  Artibonite: [
    "Gonaïves", "Ennery", "L'Estère", "Grande-Saline", "Anse-Rouge", "Terre-Neuve",
    "Saint-Marc", "La Chapelle", "Verrettes", "Montrouis", "Désarmes", "Liancourt",
    "Petite-Rivière-de-l'Artibonite", "Gros-Morne", "Marmelade",
    "Saint-Michel-de-l'Attalaye", "Dessalines", "Desdunes",
  ],
  Centre: [
    "Hinche", "Cerca-Cavajal", "Maïssade", "Thomassique", "Cerca-la-Source", "Thomonde",
    "Mirebalais", "Saut-d'Eau", "Boucan-Carré", "Belladère", "Lascahobas", "Savanette",
  ],
  Sud: [
    "Les Cayes", "Torbeck", "Chantal", "Camp-Perrin", "Maniche", "Île-à-Vache",
    "Port-Salut", "Saint-Jean-du-Sud", "Arniquet", "Aquin", "Saint-Louis-du-Sud",
    "Cavaillon", "Fond-des-Blancs", "Côteaux", "Port-à-Piment", "Roche-à-Bateau",
    "Chardonnières", "Les Anglais", "Tiburon", "Bouzi",
  ],
  "Sud-Est": [
    "Jacmel", "Marigot", "Cayes-Jacmel", "La Vallée", "Bainet", "Côtes-de-Fer",
    "Belle-Anse", "Grand-Gosier", "Thiotte", "Anse-à-Pitres",
  ],
  "Grand'Anse": [
    "Jérémie", "Abricots", "Bonbon", "Moron", "Chambellan", "Anse-d'Hainault",
    "Dame-Marie", "Les Irois", "Corail", "Roseaux", "Beaumont", "Pestel",
  ],
  Nippes: [
    "Miragoâne", "Petite-Rivière-de-Nippes", "Fonds-des-Nègres", "Paillant",
    "Anse-à-Veau", "L'Asile", "Petit-Trou-de-Nippes", "Plaisance-du-Sud",
    "Arnaud", "Baradères", "Grand-Boucan",
  ],
};

/** Extra lowercase aliases that appear in legacy pickupCity values. */
const EXTRA_ALIASES: Record<string, string[]> = {
  "pétion-ville": ["petionville", "petion-ville", "petion ville"],
  "port-au-prince": ["pap", "port au prince"],
  "croix-des-bouquets": ["croix des bouquets"],
  "cap-haïtien": ["cap-haitien", "cap haitien", "cap haïtien"],
  "gonaïves": ["gonaives"],
  "jérémie": ["jeremie"],
  "léogâne": ["leogane", "léogane"],
  "les cayes": ["les-cayes"],
  "port-de-paix": ["port de paix"],
  "fort-liberté": ["fort-liberte", "fort liberte"],
};

export function normalizeHaitiPlace(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ");
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
}

/** Build lowercase match tokens for a department (all communes + aliases). */
export function getCommuneMatchTokensForDepartment(department: string): string[] {
  const key = HAITI_DEPARTMENT_NAMES.find(
    (d) => normalizeHaitiPlace(d) === normalizeHaitiPlace(department),
  );
  if (!key) return [];
  const tokens = new Set<string>();
  for (const commune of HAITI_COMMUNES_BY_DEPARTMENT[key]) {
    const n = normalizeHaitiPlace(commune);
    tokens.add(n);
    tokens.add(commune.toLowerCase());
    for (const [canon, aliases] of Object.entries(EXTRA_ALIASES)) {
      if (normalizeHaitiPlace(canon) === n || aliases.some((a) => normalizeHaitiPlace(a) === n)) {
        tokens.add(canon);
        aliases.forEach((a) => tokens.add(a));
      }
    }
  }
  return [...tokens];
}

export function getCommuneMatchTokens(communes: string[]): string[] {
  const tokens = new Set<string>();
  for (const commune of communes) {
    const n = normalizeHaitiPlace(commune);
    if (!n) continue;
    tokens.add(n);
    tokens.add(commune.toLowerCase());
    for (const [canon, aliases] of Object.entries(EXTRA_ALIASES)) {
      if (normalizeHaitiPlace(canon) === n || aliases.some((a) => normalizeHaitiPlace(a) === n)) {
        tokens.add(canon);
        aliases.forEach((a) => tokens.add(a));
      }
    }
  }
  return [...tokens];
}

export function isValidHaitiDepartment(department: string | null | undefined): boolean {
  if (!department) return false;
  return HAITI_DEPARTMENT_NAMES.some(
    (d) => normalizeHaitiPlace(d) === normalizeHaitiPlace(department),
  );
}

export function isValidHaitiCommune(
  department: string | null | undefined,
  commune: string | null | undefined,
): boolean {
  if (!department || !commune) return false;
  const key = HAITI_DEPARTMENT_NAMES.find(
    (d) => normalizeHaitiPlace(d) === normalizeHaitiPlace(department),
  );
  if (!key) return false;
  const n = normalizeHaitiPlace(commune);
  return HAITI_COMMUNES_BY_DEPARTMENT[key].some((c) => normalizeHaitiPlace(c) === n);
}

export function validateWorkZones(input: {
  department?: string | null;
  communes?: string[] | null;
}): { ok: true; department: string; communes: string[] } | { ok: false; error: string } {
  const department = (input.department ?? "").trim();
  if (!isValidHaitiDepartment(department)) {
    return { ok: false, error: "Invalid Haiti department" };
  }
  const key = HAITI_DEPARTMENT_NAMES.find(
    (d) => normalizeHaitiPlace(d) === normalizeHaitiPlace(department),
  )!;
  const raw = Array.isArray(input.communes) ? input.communes : [];
  const communes = uniqueSorted(
    raw.filter((c) => isValidHaitiCommune(key, c)),
  );
  if (raw.length > 0 && communes.length === 0) {
    return { ok: false, error: "No valid communes for the selected department" };
  }
  // Reject communes outside the selected department
  for (const c of raw) {
    if (!isValidHaitiCommune(key, c)) {
      return { ok: false, error: `Commune "${c}" is not in ${key}` };
    }
  }
  return { ok: true, department: key, communes };
}

export function parseWorkZonesJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return uniqueSorted(parsed.map((x) => String(x)));
    }
  } catch {
    // zone field may historically hold a free-text label
  }
  return [];
}

/** Payload for GET /delivery/driver/zones */
export function haitiZonesApiPayload() {
  return {
    country: "Haiti",
    departments: HAITI_DEPARTMENT_NAMES,
    communesByDepartment: HAITI_COMMUNES_BY_DEPARTMENT,
  };
}
