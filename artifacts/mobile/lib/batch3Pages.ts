/**
 * Native batch 3 — seller tools / support / music (no overlap with batch 1 or 2).
 *
 * Already covered:
 *   B1: home, categories, search, PDP, seller storefront, cart, checkout×3, success
 *   B2: login, register, account, orders, order-detail, tracking, favorites, addresses, inbox, notifications
 */
export type Batch3Page = {
  slug: string;
  title: string;
  nativeRoute: string;
  webPath: string;
  needsAuth: boolean;
  note: string;
};

export const BATCH_3_PAGES: Batch3Page[] = [
  {
    slug: "forgot-password",
    title: "1 Forgot password",
    nativeRoute: "/auth/forgot-password",
    webPath: "/auth/forgot-password",
    needsAuth: false,
    note: "Native reset (not WebView)",
  },
  {
    slug: "sell",
    title: "2 Sell / create listing",
    nativeRoute: "/sell",
    webPath: "/sell",
    needsAuth: true,
    note: "Create listing form with image upload",
  },
  {
    slug: "my-listings",
    title: "3 My listings",
    nativeRoute: "/my-listings",
    webPath: "/sell",
    needsAuth: true,
    note: "Seller inventory management",
  },
  {
    slug: "sales",
    title: "4 Seller sales",
    nativeRoute: "/sales",
    webPath: "/sales",
    needsAuth: true,
    note: "Earnings dashboard + sale orders",
  },
  {
    slug: "offers",
    title: "5 Private offers",
    nativeRoute: "/offers",
    webPath: "/offers",
    needsAuth: true,
    note: "Received / sent offer negotiation",
  },
  {
    slug: "support",
    title: "6 Support tickets",
    nativeRoute: "/support",
    webPath: "/support",
    needsAuth: true,
    note: "Ticket list + create + FlexaBot entry",
  },
  {
    slug: "support-detail",
    title: "7 Support ticket detail",
    nativeRoute: "/support/1",
    webPath: "/support",
    needsAuth: true,
    note: "Ticket thread (text/image, no voice)",
  },
  {
    slug: "edit-profile",
    title: "8 Edit profile",
    nativeRoute: "/edit-profile",
    webPath: "/profile/edit",
    needsAuth: true,
    note: "Name, phone, avatar, password",
  },
  {
    slug: "music",
    title: "9 Flexa Music",
    nativeRoute: "/(tabs)/music",
    webPath: "/music",
    needsAuth: false,
    note: "Music home catalog",
  },
  {
    slug: "chatbot",
    title: "10 FlexaBot",
    nativeRoute: "/chatbot",
    webPath: "/chatbot",
    needsAuth: false,
    note: "Support chatbot (text only)",
  },
];

export function getBatch3Page(slug: string): Batch3Page | undefined {
  return BATCH_3_PAGES.find((p) => p.slug === slug);
}
