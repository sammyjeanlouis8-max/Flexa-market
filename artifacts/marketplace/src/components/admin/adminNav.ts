import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Shield,
  Package,
  Flag,
  Truck,
  Landmark,
  CreditCard,
  Wallet,
  BarChart3,
  Settings,
  MessageSquare,
  Radio,
  Music2,
  Tv,
  Activity,
  ClipboardList,
  AlertTriangle,
  Crown,
  Briefcase,
  Banknote,
  FileWarning,
  Eye,
  ShieldCheck,
  KeyRound,
  Headphones,
} from "lucide-react";

export type AdminNavItem = {
  titleKey: string;
  href: string;
  /** If set, only show for super admin */
  superAdminOnly?: boolean;
  /** Hide from moderators */
  hideFromModerator?: boolean;
  icon: LucideIcon;
};

export type AdminNavGroup = {
  labelKey: string;
  items: AdminNavItem[];
};

/** Enterprise admin IA — dedicated routes for primary sections. */
export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    labelKey: "adminNav.groupOverview",
    items: [
      { titleKey: "adminNav.dashboard", href: "/admin", icon: LayoutDashboard },
      { titleKey: "adminNav.operations", href: "/admin/operations", icon: ClipboardList },
      { titleKey: "admin.tabAppeals", href: "/admin/appeals", icon: ShieldCheck },
      { titleKey: "adminNav.activity", href: "/admin/activity", icon: Activity, hideFromModerator: true },
      { titleKey: "adminNav.actions", href: "/admin/actions", icon: Shield, hideFromModerator: true },
    ],
  },
  {
    labelKey: "adminNav.groupPeople",
    items: [
      { titleKey: "adminNav.users", href: "/admin/users", icon: Users },
      { titleKey: "adminNav.admins", href: "/admin/team", icon: Crown, hideFromModerator: true },
      { titleKey: "adminNav.flagged", href: "/admin/flagged", icon: AlertTriangle },
      { titleKey: "adminNav.support", href: "/admin/support", icon: MessageSquare },
      { titleKey: "adminNav.liveSupport", href: "/admin/live-support", icon: Headphones },
      { titleKey: "adminNav.security", href: "/admin/security", icon: KeyRound, hideFromModerator: true },
    ],
  },
  {
    labelKey: "adminNav.groupCatalog",
    items: [
      { titleKey: "adminNav.listings", href: "/admin/listings", icon: Package },
      { titleKey: "adminNav.moderation", href: "/admin/moderation", icon: Flag },
      { titleKey: "adminNav.reports", href: "/admin/reports", icon: FileWarning },
      { titleKey: "adminNav.views", href: "/admin?tab=views", icon: Eye, superAdminOnly: true },
    ],
  },
  {
    labelKey: "adminNav.groupCommerce",
    items: [
      { titleKey: "adminNav.orders", href: "/admin?tab=orders", icon: ClipboardList, hideFromModerator: true },
      { titleKey: "adminNav.deliveries", href: "/admin/deliveries", icon: Truck, hideFromModerator: true },
      { titleKey: "adminNav.drivers", href: "/admin/driver-applications", icon: Truck, hideFromModerator: true },
      { titleKey: "adminNav.agents", href: "/admin/agent-applications", icon: Briefcase, hideFromModerator: true },
      { titleKey: "adminNav.subscriptions", href: "/admin/vip-subscriptions", icon: Crown, hideFromModerator: true },
    ],
  },
  {
    labelKey: "adminNav.groupFinance",
    items: [
      { titleKey: "adminNav.wallet", href: "/admin?tab=wallet", icon: Wallet, hideFromModerator: true },
      { titleKey: "adminNav.transactions", href: "/admin/transactions", icon: Banknote, hideFromModerator: true },
      { titleKey: "adminNav.stripe", href: "/admin/stripe-transactions", icon: CreditCard, hideFromModerator: true },
      { titleKey: "adminNav.moncash", href: "/admin/moncash-transactions", icon: Landmark, hideFromModerator: true },
      { titleKey: "adminNav.loans", href: "/admin/loans", icon: Landmark, hideFromModerator: true },
      { titleKey: "adminNav.flexCard", href: "/admin/flex-card", icon: CreditCard, hideFromModerator: true },
      { titleKey: "adminNav.revenue", href: "/admin?tab=revenue", icon: BarChart3, hideFromModerator: true },
    ],
  },
  {
    labelKey: "adminNav.groupMedia",
    items: [
      { titleKey: "adminNav.tv", href: "/admin/tv", icon: Tv, hideFromModerator: true },
      { titleKey: "adminNav.music", href: "/admin/music", icon: Music2, hideFromModerator: true },
      { titleKey: "adminNav.broadcast", href: "/admin/broadcast", icon: Radio, hideFromModerator: true },
      { titleKey: "adminNav.push", href: "/admin/push-notifications", icon: Radio, hideFromModerator: true },
    ],
  },
  {
    labelKey: "adminNav.groupSystem",
    items: [
      { titleKey: "adminNav.fraud", href: "/admin/fraud", icon: Shield, hideFromModerator: true },
      { titleKey: "adminNav.logs", href: "/admin/security", icon: Activity },
      { titleKey: "adminNav.settings", href: "/admin?tab=fees", icon: Settings, hideFromModerator: true },
    ],
  },
];

export function adminNavIsActive(location: string, search: string, href: string): boolean {
  const [path, query = ""] = href.split("?");
  const locPath = (location.split("?")[0] || "/").replace(/\/$/, "") || "/";
  const hrefPath = path.replace(/\/$/, "") || "/";

  if (hrefPath === "/admin" && !query) {
    return locPath === "/admin";
  }
  if (query) {
    const wantTab = new URLSearchParams(query).get("tab");
    const haveTab = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("tab");
    return locPath === hrefPath && wantTab === haveTab;
  }
  return locPath === hrefPath || locPath.startsWith(hrefPath + "/");
}
