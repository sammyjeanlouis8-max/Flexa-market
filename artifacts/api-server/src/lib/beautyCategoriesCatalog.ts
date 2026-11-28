/**
 * Canonical Séduire Beauty marketplace categories (12 primary).
 * Seeded into beauty_categories; used for hub tiles and discovery.
 */

export type BeautyPrimaryCategoryDef = {
  slug: string;
  kind: string;
  nameEn: string;
  nameFr: string;
  nameHt: string;
  nameEs: string;
  descriptionEn: string;
  imageUrl: string;
  /** Featured on the hub homepage (first 6). */
  featuredOnHome: boolean;
  sortOrder: number;
  /** Optional businessType values that also match this category in discovery. */
  businessTypes?: string[];
  /** When true, also match homeServiceAvailable / mobile delivery. */
  mobileDelivery?: boolean;
};

/** Full-color professional photography — no B&W or heavy overlays. */
export const BEAUTY_PRIMARY_CATEGORIES: BeautyPrimaryCategoryDef[] = [
  {
    slug: "beauty-studio",
    kind: "primary",
    nameEn: "Beauty Studio",
    nameFr: "Studio de beauté",
    nameHt: "Estidyo bote",
    nameEs: "Estudio de belleza",
    descriptionEn: "Salons for hair, styling, and full-service beauty.",
    imageUrl:
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    sortOrder: 1,
    businessTypes: ["beauty_studio", "independent_beauty"],
  },
  {
    slug: "barbershop",
    kind: "primary",
    nameEn: "Barbershop",
    nameFr: "Barbier",
    nameHt: "Kwafè",
    nameEs: "Barbería",
    descriptionEn: "Cuts, fades, beards, and grooming.",
    imageUrl:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    sortOrder: 2,
    businessTypes: ["barbershop", "independent_barber", "mobile_barber"],
  },
  {
    slug: "nail-studio",
    kind: "primary",
    nameEn: "Nail Studio",
    nameFr: "Salon d’ongles",
    nameHt: "Estidyo zong",
    nameEs: "Estudio de uñas",
    descriptionEn: "Manicure, pedicure, and nail art.",
    imageUrl:
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    sortOrder: 3,
  },
  {
    slug: "makeup-studio",
    kind: "primary",
    nameEn: "Makeup Studio",
    nameFr: "Studio maquillage",
    nameHt: "Estidyo makiyaj",
    nameEs: "Estudio de maquillaje",
    descriptionEn: "Professional makeup for everyday and events.",
    imageUrl:
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    sortOrder: 4,
  },
  {
    slug: "braids-locs",
    kind: "primary",
    nameEn: "Braids & Locs",
    nameFr: "Tresses & locks",
    nameHt: "Trese & locs",
    nameEs: "Trenzas y locs",
    descriptionEn: "Braids, locs, twists, and protective styles.",
    imageUrl:
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    sortOrder: 5,
  },
  {
    slug: "spa-massage",
    kind: "primary",
    nameEn: "Spa & Massage",
    nameFr: "Spa & massage",
    nameHt: "Spa & masaj",
    nameEs: "Spa y masaje",
    descriptionEn: "Relaxation, massage, and wellness treatments.",
    imageUrl:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    sortOrder: 6,
  },
  {
    slug: "lashes-brows",
    kind: "primary",
    nameEn: "Lashes & Brows",
    nameFr: "Cils & sourcils",
    nameHt: "Sil & sousi",
    nameEs: "Pestañas y cejas",
    descriptionEn: "Lash extensions, lifts, and brow shaping.",
    imageUrl:
      "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    sortOrder: 7,
  },
  {
    slug: "skin-care",
    kind: "primary",
    nameEn: "Skin Care",
    nameFr: "Soins de la peau",
    nameHt: "Swen po",
    nameEs: "Cuidado de la piel",
    descriptionEn: "Facials, peels, and skin treatments.",
    imageUrl:
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    sortOrder: 8,
  },
  {
    slug: "wigs-extensions",
    kind: "primary",
    nameEn: "Wigs & Extensions",
    nameFr: "Perruques & extensions",
    nameHt: "Perik & ekstansyon",
    nameEs: "Pelucas y extensiones",
    descriptionEn: "Wig installs, custom units, and hair extensions.",
    imageUrl:
      "https://images.unsplash.com/photo-1522336572468-97b06e8ef143?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    sortOrder: 9,
  },
  {
    slug: "bridal-beauty",
    kind: "primary",
    nameEn: "Bridal Beauty",
    nameFr: "Beauté mariage",
    nameHt: "Bote maryaj",
    nameEs: "Belleza nupcial",
    descriptionEn: "Bridal hair, makeup, and party packages.",
    imageUrl:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    sortOrder: 10,
  },
  {
    slug: "waxing-studio",
    kind: "primary",
    nameEn: "Waxing Studio",
    nameFr: "Épilation",
    nameHt: "Depilasyon",
    nameEs: "Estudio de depilación",
    descriptionEn: "Waxing and hair-removal services.",
    imageUrl:
      "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    sortOrder: 11,
  },
  {
    slug: "mobile-beauty",
    kind: "primary",
    nameEn: "Mobile Beauty",
    nameFr: "Beauté à domicile",
    nameHt: "Bote mobil",
    nameEs: "Belleza a domicilio",
    descriptionEn: "Professionals who come to you — home and on-the-go.",
    imageUrl:
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    sortOrder: 12,
    businessTypes: ["mobile_beauty", "mobile_barber"],
    mobileDelivery: true,
  },
];

export const BEAUTY_HOME_CATEGORY_SLUGS = BEAUTY_PRIMARY_CATEGORIES
  .filter((c) => c.featuredOnHome)
  .map((c) => c.slug);

export function beautyCategoryBySlug(slug: string): BeautyPrimaryCategoryDef | undefined {
  return BEAUTY_PRIMARY_CATEGORIES.find((c) => c.slug === slug);
}
