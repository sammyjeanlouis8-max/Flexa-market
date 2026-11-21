/**
 * Embedded WebView allowlist — legal, FAQ, and read-only guides only.
 *
 * Architecture (Android + iOS):
 * - Core shopping / account / seller / support tickets stay native React Native
 * - These pages load official flexamarket.com content in SafeWebView
 *   with one native header (+ app bottom tabs when launched from Account)
 * - Never opens Chrome/Safari for these pages
 * - Wallet / Card FM / transfers / digital purchases stay blocked (not listed)
 */

export type TemuHybridPage = {
  /** Route slug under /embed/[slug] */
  slug: string;
  /** Inventory / architecture feature id */
  featureId: string;
  /** Title shown in native chrome / docs */
  title: string;
  /** Path on flexamarket.com (leading slash) */
  webPath: string;
  /** Short note for screenshots / PR */
  note: string;
};

/** Official WebView-only catalog (architecture allowlist). */
export const WEBVIEW_ALLOWLIST: TemuHybridPage[] = [
  {
    slug: "privacy",
    featureId: "legal-privacy",
    title: "Privacy Policy",
    webPath: "/privacy-policy",
    note: "Legal — embedded WebView",
  },
  {
    slug: "terms",
    featureId: "legal-terms",
    title: "Terms of Service",
    webPath: "/terms",
    note: "Legal — embedded WebView",
  },
  {
    slug: "about",
    featureId: "about",
    title: "About Flexa Market",
    webPath: "/about",
    note: "About — embedded WebView",
  },
  {
    slug: "help-center",
    featureId: "help-center",
    title: "Help Center",
    webPath: "/help-center",
    note: "FAQ / read-only articles — tickets stay native /support",
  },
  {
    slug: "shipping-policy",
    featureId: "policy-shipping",
    title: "Shipping policy",
    webPath: "/shipping-policy",
    note: "Policy text — checkout shipping selection stays native",
  },
  {
    slug: "returns-refunds",
    featureId: "policy-returns",
    title: "Returns & refunds",
    webPath: "/returns",
    note: "Policy text — embedded WebView",
  },
  {
    slug: "seller-policies",
    featureId: "policy-seller",
    title: "Seller policies",
    webPath: "/seller-policies",
    note: "Seller policy text — embedded WebView",
  },
  {
    slug: "prohibited-items",
    featureId: "policy-prohibited",
    title: "Prohibited items",
    webPath: "/prohibited-items",
    note: "Policy text — embedded WebView",
  },
  {
    slug: "community-guidelines",
    featureId: "policy-community",
    title: "Community guidelines",
    webPath: "/community-guidelines",
    note: "Guidelines — embedded WebView",
  },
  {
    slug: "guide-buy",
    featureId: "guide-buy",
    title: "How to buy",
    webPath: "/guides/how-to-buy",
    note: "Read-only guide — embedded WebView",
  },
  {
    slug: "guide-sell",
    featureId: "guide-sell",
    title: "How to sell",
    webPath: "/guides/how-to-sell",
    note: "Read-only guide — embedded WebView",
  },
  {
    slug: "guide-driver",
    featureId: "guide-driver",
    title: "Become a driver",
    webPath: "/guides/become-a-driver",
    note: "Read-only guide — driver tools stay native",
  },
];

/** @deprecated Use WEBVIEW_ALLOWLIST — kept alias for older imports/tests */
export const TEMU_HYBRID_BATCH_1 = WEBVIEW_ALLOWLIST;

export function getTemuHybridPage(slug: string): TemuHybridPage | undefined {
  return WEBVIEW_ALLOWLIST.find((p) => p.slug === slug);
}

export function temuHybridUrl(webPath: string): string {
  const path = webPath.startsWith("/") ? webPath : `/${webPath}`;
  return `https://flexamarket.com${path}`;
}
