/**
 * Canonical Séduire Beauty marketplace categories (12 primary).
 * Keep in sync with api-server + marketplace catalogs.
 */

export type BeautyPrimaryCategoryDef = {
  slug: string;
  labelKey: string;
  href: string;
  photo: string;
  featuredOnHome: boolean;
  /** Feather / emoji-friendly glyph for the label pill */
  glyph: string;
  mobileDelivery?: boolean;
};

export const BEAUTY_PRIMARY_CATEGORIES: BeautyPrimaryCategoryDef[] = [
  {
    slug: "beauty-studio",
    labelKey: "beauty_catBeautyStudio",
    href: "/beauty/c/beauty-studio",
    photo:
      "https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    glyph: "✂",
  },
  {
    slug: "barbershop",
    labelKey: "beauty_catBarbershop",
    href: "/beauty/c/barbershop",
    photo:
      "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    glyph: "💈",
  },
  {
    slug: "nail-studio",
    labelKey: "beauty_catNailStudio",
    href: "/beauty/c/nail-studio",
    photo:
      "https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    glyph: "💅",
  },
  {
    slug: "makeup-studio",
    labelKey: "beauty_catMakeupStudio",
    href: "/beauty/c/makeup-studio",
    photo:
      "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    glyph: "💄",
  },
  {
    slug: "braids-locs",
    labelKey: "beauty_catBraidsLocs",
    href: "/beauty/c/braids-locs",
    photo:
      "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    glyph: "🪢",
  },
  {
    slug: "spa-massage",
    labelKey: "beauty_catSpaMassage",
    href: "/beauty/c/spa-massage",
    photo:
      "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: true,
    glyph: "🪨",
  },
  {
    slug: "lashes-brows",
    labelKey: "beauty_catLashesBrows",
    href: "/beauty/c/lashes-brows",
    photo:
      "https://images.unsplash.com/photo-1583001931096-959e9a1a6223?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    glyph: "👁",
  },
  {
    slug: "skin-care",
    labelKey: "beauty_catSkinCare",
    href: "/beauty/c/skin-care",
    photo:
      "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    glyph: "✨",
  },
  {
    slug: "wigs-extensions",
    labelKey: "beauty_catWigsExtensions",
    href: "/beauty/c/wigs-extensions",
    photo:
      "https://images.unsplash.com/photo-1522336572468-97b06e8ef143?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    glyph: "💇",
  },
  {
    slug: "bridal-beauty",
    labelKey: "beauty_catBridalBeauty",
    href: "/beauty/c/bridal-beauty",
    photo:
      "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    glyph: "👰",
  },
  {
    slug: "waxing-studio",
    labelKey: "beauty_catWaxingStudio",
    href: "/beauty/c/waxing-studio",
    photo:
      "https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    glyph: "🕯",
  },
  {
    slug: "mobile-beauty",
    labelKey: "beauty_catMobileBeauty",
    href: "/beauty/c/mobile-beauty",
    photo:
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=900&q=80",
    featuredOnHome: false,
    glyph: "🚗",
    mobileDelivery: true,
  },
];

export const BEAUTY_HOME_CATEGORIES = BEAUTY_PRIMARY_CATEGORIES.filter((c) => c.featuredOnHome);

export function beautyCategoryBySlug(slug: string): BeautyPrimaryCategoryDef | undefined {
  return BEAUTY_PRIMARY_CATEGORIES.find((c) => c.slug === slug);
}
