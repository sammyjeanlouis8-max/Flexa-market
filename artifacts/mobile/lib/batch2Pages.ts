/**
 * Native batch 2 — next 10 screens after shopping (account / orders / messaging).
 */
export type Batch2Page = {
  slug: string;
  title: string;
  nativeRoute: string;
  webPath: string;
  needsAuth: boolean;
  note: string;
};

export const BATCH_2_PAGES: Batch2Page[] = [
  {
    slug: "login",
    title: "1 Login",
    nativeRoute: "/auth/login",
    webPath: "/auth/login",
    needsAuth: false,
    note: "Native AuthGlobe login",
  },
  {
    slug: "register",
    title: "2 Register",
    nativeRoute: "/auth/register",
    webPath: "/auth/register",
    needsAuth: false,
    note: "Native signup",
  },
  {
    slug: "account",
    title: "3 Account",
    nativeRoute: "/(tabs)/profile",
    webPath: "/settings",
    needsAuth: false,
    note: "Account hub (guest or signed-in)",
  },
  {
    slug: "orders",
    title: "4 My Orders",
    nativeRoute: "/orders",
    webPath: "/orders",
    needsAuth: true,
    note: "Purchase list with filters",
  },
  {
    slug: "order-detail",
    title: "5 Order details",
    nativeRoute: "/orders/1",
    webPath: "/orders",
    needsAuth: true,
    note: "Order detail + delivery actions",
  },
  {
    slug: "tracking",
    title: "6 Delivery tracking",
    nativeRoute: "/delivery-tracking",
    webPath: "/delivery/tracking/1",
    needsAuth: true,
    note: "Live Haiti delivery timeline",
  },
  {
    slug: "favorites",
    title: "7 Favorites",
    nativeRoute: "/favorites",
    webPath: "/saved",
    needsAuth: true,
    note: "Saved products grid",
  },
  {
    slug: "addresses",
    title: "8 Addresses",
    nativeRoute: "/addresses",
    webPath: "/settings/addresses",
    needsAuth: true,
    note: "Delivery address book",
  },
  {
    slug: "inbox",
    title: "9 Inbox",
    nativeRoute: "/(tabs)/inbox",
    webPath: "/messages",
    needsAuth: true,
    note: "Buyer–seller Flexa Chat inbox",
  },
  {
    slug: "notifications",
    title: "10 Notifications",
    nativeRoute: "/notifications",
    webPath: "/settings/notifications",
    needsAuth: true,
    note: "In-app notification center",
  },
];

export function getBatch2Page(slug: string): Batch2Page | undefined {
  return BATCH_2_PAGES.find((p) => p.slug === slug);
}
