/**
 * Temu-style hybrid catalog — batch 1 (first 10 pages).
 *
 * Architecture:
 * - Native shell (tabs, back header via SafeWebView)
 * - Selected Flexa website paths load in an **in-app** WebView
 * - Never opens Chrome/Safari for these pages
 *
 * Wallet / Card FM / Promo money stay blocked on Android (not in this list).
 */

export type TemuHybridPage = {
  /** Route slug under /embed/[slug] */
  slug: string;
  /** Inventory feature id when applicable */
  featureId: string;
  /** Title shown in native chrome / docs */
  title: string;
  /** Path on flexamarket.com (leading slash) */
  webPath: string;
  /** Short note for screenshots / PR */
  note: string;
};

export const TEMU_HYBRID_BATCH_1: TemuHybridPage[] = [
  {
    slug: "forgot-password",
    featureId: "auth-forgot-password",
    title: "Forgot password",
    webPath: "/auth/forgot-password",
    note: "Embedded WebView — password reset stays in-app",
  },
  {
    slug: "phone-login",
    featureId: "auth-phone-login",
    title: "Phone login",
    webPath: "/auth/login-phone",
    note: "Embedded WebView — phone auth stays in-app",
  },
  {
    slug: "help-center",
    featureId: "help-center",
    title: "Help Center",
    webPath: "/help-center",
    note: "Embedded WebView — FAQ / contact in-app",
  },
  {
    slug: "privacy",
    featureId: "legal",
    title: "Privacy Policy",
    webPath: "/privacy-policy",
    note: "Embedded WebView — legal page in-app (not external browser)",
  },
  {
    slug: "terms",
    featureId: "legal",
    title: "Terms of Service",
    webPath: "/terms",
    note: "Embedded WebView — terms in-app",
  },
  {
    slug: "referrals",
    featureId: "referrals",
    title: "Referrals / Leaderboard",
    webPath: "/leaderboard",
    note: "Embedded WebView — referrals in-app",
  },
  {
    slug: "jobs",
    featureId: "jobs",
    title: "Jobs",
    webPath: "/jobs",
    note: "Embedded WebView — jobs board in-app",
  },
  {
    slug: "calculator",
    featureId: "calculator",
    title: "CalcAI",
    webPath: "/calculator",
    note: "Embedded WebView — calculator in-app",
  },
  {
    slug: "commission-promo",
    featureId: "commission-promo",
    title: "Commission promo",
    webPath: "/commission-promo",
    note: "Embedded WebView — commission promo in-app",
  },
  {
    slug: "public-tracking",
    featureId: "public-tracking",
    title: "Track package",
    webPath: "/track",
    note: "Embedded WebView — public tracking in-app",
  },
];

export function getTemuHybridPage(slug: string): TemuHybridPage | undefined {
  return TEMU_HYBRID_BATCH_1.find((p) => p.slug === slug);
}

export function temuHybridUrl(webPath: string): string {
  const path = webPath.startsWith("/") ? webPath : `/${webPath}`;
  return `https://flexamarket.com${path}`;
}
