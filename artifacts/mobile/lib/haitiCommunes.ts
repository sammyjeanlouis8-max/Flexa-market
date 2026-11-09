/** Haiti departments + communes for driver application UI (mirrors server geography). */
export const HAITI_DEPARTMENTS = [
  "Ouest", "Nord", "Nord-Est", "Nord-Ouest", "Artibonite",
  "Centre", "Sud", "Sud-Est", "Grand'Anse", "Nippes",
] as const;

export const HAITI_COMMUNES_BY_DEPARTMENT: Record<string, string[]> = {
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
    "Chardonnières", "Les Anglais", "Tiburon",
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

export const APPLY_BRAND = {
  primary: "hsl(152,65%,18%)",
  soft: "hsl(152,40%,94%)",
  softBorder: "hsl(152,30%,85%)",
  success: "hsl(152,55%,36%)",
} as const;
