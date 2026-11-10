/** Official Flexa Market brand + homepage SEO defaults (English). */

export const SEO_BRAND_NAME = "Flexa Market";
export const SEO_BRAND_ALT_NAMES = ["FlexaMarket", "FLEXA MARKET"] as const;
export const SEO_BASE_URL = "https://flexamarket.com";
export const SEO_HOME_PATH = "/";
export const SEO_HOME_CANONICAL = `${SEO_BASE_URL}/`;

/** Default English homepage title — brand first, global marketplace. */
export const SEO_HOME_TITLE_EN =
  "Flexa Market — Buy & sell online | flexamarket.com";

/** Default English homepage meta description — brand + global markets. */
export const SEO_HOME_DESCRIPTION_EN =
  "Flexa Market (FlexaMarket) is the official marketplace at flexamarket.com. Buy and sell online across Haiti and other supported markets with secure checkout.";

export const SEO_HOME_HEADING_SUPPORT_EN =
  "Buy and sell online across Haiti and other supported markets.";

/** Electronics / phones category — primary page for phone buy/sell intents. */
export const SEO_ELECTRONICS_PATH = "/categories/electronics";
export const SEO_ELECTRONICS_TITLE_EN =
  "Electronics & phones — Buy & sell on Flexa Market";
export const SEO_ELECTRONICS_DESCRIPTION_EN =
  "Shop electronics and phones on Flexa Market. Browse approved listings in Haiti and other supported markets with secure checkout.";

export function buildWebsiteJsonLd(opts?: {
  name?: string;
  description?: string;
  inLanguage?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SEO_BASE_URL}/#website`,
    url: SEO_HOME_CANONICAL,
    name: opts?.name ?? SEO_BRAND_NAME,
    alternateName: [...SEO_BRAND_ALT_NAMES],
    description: opts?.description ?? SEO_HOME_DESCRIPTION_EN,
    inLanguage: opts?.inLanguage ?? ["en", "ht", "fr"],
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${SEO_BASE_URL}/search?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}
