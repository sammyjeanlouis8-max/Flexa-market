/**
 * Canonical Séduire Beauty marketplace categories (12 primary).
 * Keep in sync with api-server/src/lib/beautyCategoriesCatalog.ts
 */

export type BeautyPrimaryCategoryDef = {
  slug: string;
  id: string;
  labelKey: string;
  href: string;
  photo: string;
  featuredOnHome: boolean;
  icon: string;
  mobileDelivery?: boolean;
};

export const BEAUTY_PRIMARY_CATEGORIES: BeautyPrimaryCategoryDef[] = [
  {
    slug: "beauty-studio",
    id: "beauty_studio",
    labelKey: "beauty.catBeautyStudio",
    href: "/beauty/c/beauty-studio",
    photo:
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    icon: "scissors",
  },
  {
    slug: "barbershop",
    id: "barbershop",
    labelKey: "beauty.catBarbershop",
    href: "/beauty/c/barbershop",
    photo:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    icon: "barber",
  },
  {
    slug: "nail-studio",
    id: "nail_studio",
    labelKey: "beauty.catNailStudio",
    href: "/beauty/c/nail-studio",
    photo:
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    icon: "nail",
  },
  {
    slug: "makeup-studio",
    id: "makeup_studio",
    labelKey: "beauty.catMakeupStudio",
    href: "/beauty/c/makeup-studio",
    photo:
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    icon: "makeup",
  },
  {
    slug: "braids-locs",
    id: "braids_locs",
    labelKey: "beauty.catBraidsLocs",
    href: "/beauty/c/braids-locs",
    photo:
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    icon: "braids",
  },
  {
    slug: "spa-massage",
    id: "spa_massage",
    labelKey: "beauty.catSpaMassage",
    href: "/beauty/c/spa-massage",
    photo:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    icon: "spa",
  },
  {
    slug: "lashes-brows",
    id: "lashes_brows",
    labelKey: "beauty.catLashesBrows",
    href: "/beauty/c/lashes-brows",
    photo:
      "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    icon: "lashes",
  },
  {
    slug: "skin-care",
    id: "skin_care",
    labelKey: "beauty.catSkinCare",
    href: "/beauty/c/skin-care",
    photo:
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    icon: "skin",
  },
  {
    slug: "wigs-extensions",
    id: "wigs_extensions",
    labelKey: "beauty.catWigsExtensions",
    href: "/beauty/c/wigs-extensions",
    photo:
      "https://images.unsplash.com/photo-1522336572468-97b06e8ef143?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    icon: "wig",
  },
  {
    slug: "bridal-beauty",
    id: "bridal_beauty",
    labelKey: "beauty.catBridalBeauty",
    href: "/beauty/c/bridal-beauty",
    photo:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    icon: "bridal",
  },
  {
    slug: "waxing-studio",
    id: "waxing_studio",
    labelKey: "beauty.catWaxingStudio",
    href: "/beauty/c/waxing-studio",
    photo:
      "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    icon: "wax",
  },
  {
    slug: "mobile-beauty",
    id: "mobile_beauty",
    labelKey: "beauty.catMobileBeauty",
    href: "/beauty/c/mobile-beauty",
    photo:
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    icon: "mobile",
    mobileDelivery: true,
  },
];

export const BEAUTY_HOME_CATEGORIES = BEAUTY_PRIMARY_CATEGORIES.filter((c) => c.featuredOnHome);

export function beautyCategoryBySlug(slug: string): BeautyPrimaryCategoryDef | undefined {
  return BEAUTY_PRIMARY_CATEGORIES.find((c) => c.slug === slug);
}
