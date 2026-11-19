/**
 * Flexa Control module catalog — mirrors web Command Center + adminNav.
 * Routes are native `/admin/...` paths; permission keys match GET /admin/me.
 */

export type FeatherName =
  | "bell"
  | "credit-card"
  | "rotate-ccw"
  | "film"
  | "truck"
  | "headphones"
  | "users"
  | "shield"
  | "package"
  | "shopping-bag"
  | "flag"
  | "lock"
  | "zap"
  | "dollar-sign"
  | "refresh-cw"
  | "tv"
  | "music"
  | "star"
  | "repeat"
  | "smartphone"
  | "activity"
  | "trending-up"
  | "mail"
  | "message-circle"
  | "grid"
  | "box"
  | "bar-chart-2"
  | "send"
  | "globe"
  | "wifi"
  | "arrow-up-right"
  | "chevron-right"
  | "chevron-down"
  | "arrow-left"
  | "moon"
  | "sun"
  | "menu"
  | "layout"
  | "alert-circle"
  | "check-circle";

export type AdminModuleDef = {
  slug: string;
  title: string;
  desc: string;
  href: string;
  icon: FeatherName;
  color: string;
  /** Permission key from /admin/me; omit = any allowed staff */
  perm?: string;
  /** Minimum role beyond support gate */
  minRole?: "support" | "moderator" | "admin" | "superadmin";
  superAdminOnly?: boolean;
  hideFromModerator?: boolean;
  hideFromSupport?: boolean;
};

export const COMMAND_MODULES: AdminModuleDef[] = [
  {
    slug: "push-notifications",
    title: "Push Notifications",
    desc: "Campaigns & alerts",
    href: "/admin/push-notifications",
    icon: "bell",
    color: "#059669",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "stripe-payments",
    title: "Stripe Payments",
    desc: "Charges & payouts",
    href: "/admin/stripe-transactions",
    icon: "credit-card",
    color: "#1E293B",
    perm: "payments",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "refunds",
    title: "Refunds & Disputes",
    desc: "Payment recovery",
    href: "/admin/refunds",
    icon: "rotate-ccw",
    color: "#7C3AED",
    perm: "refunds",
    minRole: "superadmin",
    superAdminOnly: true,
  },
  {
    slug: "promo-videos",
    title: "Promotional Videos",
    desc: "Discover & analytics",
    href: "/admin/promo-videos",
    icon: "film",
    color: "#DB2777",
    minRole: "admin",
    hideFromSupport: true,
  },
  {
    slug: "deliveries",
    title: "Deliveries",
    desc: "Drivers & tracking",
    href: "/admin/deliveries",
    icon: "truck",
    color: "#F97316",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "support",
    title: "Support & Tickets",
    desc: "Live help desk",
    href: "/admin/support",
    icon: "headphones",
    color: "#0EA5E9",
    perm: "reports",
  },
  {
    slug: "users",
    title: "Users",
    desc: "Accounts & roles",
    href: "/admin/users",
    icon: "users",
    color: "#0D9488",
    perm: "users",
    minRole: "moderator",
    hideFromSupport: true,
  },
  {
    slug: "team",
    title: "Admin Team",
    desc: "Staff & scopes",
    href: "/admin/team",
    icon: "shield",
    color: "#6366F1",
    perm: "adminTeam",
    superAdminOnly: true,
  },
  {
    slug: "listings",
    title: "Listings",
    desc: "Catalog moderation",
    href: "/admin/listings",
    icon: "package",
    color: "#146C43",
    perm: "listings",
    minRole: "moderator",
    hideFromSupport: true,
  },
  {
    slug: "operations",
    title: "Operations",
    desc: "Queue & appeals",
    href: "/admin/operations",
    icon: "shopping-bag",
    color: "#D97706",
    minRole: "moderator",
    hideFromSupport: true,
  },
];

export const MORE_MODULES: AdminModuleDef[] = [
  ...COMMAND_MODULES,
  {
    slug: "moderation",
    title: "Moderation",
    desc: "Reports & review queue",
    href: "/admin/moderation",
    icon: "flag",
    color: "#DC2626",
    perm: "moderation",
    minRole: "moderator",
    hideFromSupport: true,
  },
  {
    slug: "security",
    title: "Security",
    desc: "Logs & access audit",
    href: "/admin/security",
    icon: "lock",
    color: "#475569",
    perm: "logs",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "boosts",
    title: "Boosts",
    desc: "Boost approvals",
    href: "/admin/boosts",
    icon: "zap",
    color: "#CA8A04",
    perm: "boosts",
    minRole: "admin",
    hideFromSupport: true,
  },
  {
    slug: "driver-applications",
    title: "Driver Applications",
    desc: "View and manage driver applications",
    href: "/admin/driver-applications",
    icon: "truck",
    color: "#EA580C",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "agent-applications",
    title: "Agent Applications",
    desc: "View and manage agent applications",
    href: "/admin/agent-applications",
    icon: "shield",
    color: "#7C3AED",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "loans",
    title: "Loan Requests",
    desc: "View all loan requests",
    href: "/admin/loans",
    icon: "dollar-sign",
    color: "#0F766E",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "rates",
    title: "Rates",
    desc: "HTG and DOP rate updates",
    href: "/admin/rates",
    icon: "refresh-cw",
    color: "#146C43",
    superAdminOnly: true,
  },
  {
    slug: "tv",
    title: "Flexa TV",
    desc: "Programs, films, series, schedule",
    href: "/admin/tv",
    icon: "tv",
    color: "#7E22CE",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "music",
    title: "Flexa Music",
    desc: "Songs, albums, genres",
    href: "/admin/music",
    icon: "music",
    color: "#DB2777",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "vip",
    title: "Flexa VIP",
    desc: "Monthly subscribers",
    href: "/admin/vip-subscriptions",
    icon: "star",
    color: "#D97706",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "flex-card",
    title: "Flex Card Debt",
    desc: "Block, manage & track FM card debts",
    href: "/admin/flex-card",
    icon: "credit-card",
    color: "#6D28D9",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "transactions",
    title: "Transactions",
    desc: "Balances & history per user",
    href: "/admin/transactions",
    icon: "repeat",
    color: "#0F766E",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "moncash",
    title: "MonCash Transactions",
    desc: "Monitor Haiti wallet payments",
    href: "/admin/moncash-transactions",
    icon: "smartphone",
    color: "#EA580C",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "actions",
    title: "Admin Actions",
    desc: "Live feed of admin & moderator actions",
    href: "/admin/actions",
    icon: "activity",
    color: "#DC2626",
    perm: "logs",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "activity",
    title: "Activity",
    desc: "User activity — past & real-time",
    href: "/admin/activity",
    icon: "trending-up",
    color: "#0284C7",
    minRole: "admin",
    hideFromModerator: true,
    hideFromSupport: true,
  },
  {
    slug: "broadcast-email",
    title: "Broadcast Email",
    desc: "Email all users",
    href: "/admin/broadcast-email",
    icon: "mail",
    color: "#DB2777",
    superAdminOnly: true,
  },
  {
    slug: "broadcast-sms",
    title: "Broadcast SMS",
    desc: "SMS via Twilio",
    href: "/admin/broadcast-sms",
    icon: "message-circle",
    color: "#0891B2",
    superAdminOnly: true,
  },
  {
    slug: "reports",
    title: "Reports",
    desc: "User reports queue",
    href: "/admin/reports",
    icon: "alert-circle",
    color: "#DC2626",
    perm: "reports",
    minRole: "moderator",
  },
  {
    slug: "appeals",
    title: "Appeals",
    desc: "Ban & restriction appeals",
    href: "/admin/appeals",
    icon: "check-circle",
    color: "#D97706",
    minRole: "moderator",
    hideFromSupport: true,
  },
  {
    slug: "flagged",
    title: "Flagged Users",
    desc: "Banned, restricted & flagged accounts",
    href: "/admin/flagged",
    icon: "flag",
    color: "#B91C1C",
    perm: "users",
    minRole: "moderator",
    hideFromSupport: true,
  },
  {
    slug: "live-support",
    title: "Live Support",
    desc: "Live chat inbox",
    href: "/admin/live-support",
    icon: "headphones",
    color: "#0284C7",
    perm: "reports",
  },
];

export const BOTTOM_TABS = [
  { id: "dashboard", label: "Dashboard", icon: "grid" as FeatherName, href: "/admin" },
  { id: "orders", label: "Orders", icon: "box" as FeatherName, href: "/admin/orders" },
  { id: "payments", label: "Payments", icon: "credit-card" as FeatherName, href: "/admin/payments" },
  { id: "analytics", label: "Analytics", icon: "bar-chart-2" as FeatherName, href: "/admin/analytics" },
  { id: "more", label: "More", icon: "grid" as FeatherName, href: "/admin/more" },
] as const;
