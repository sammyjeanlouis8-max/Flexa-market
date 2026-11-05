/** Path-based Flexa Control sections — dedicated routes instead of ?tab= only. */

export const ADMIN_SECTION_PATHS: Record<string, string> = {
  operations: "/admin/operations",
  appeals: "/admin/appeals",
  users: "/admin/users",
  admins: "/admin/team",
  support: "/admin/support",
  security: "/admin/security",
  listings: "/admin/listings",
  reports: "/admin/reports",
  flagged: "/admin/flagged",
  moderation: "/admin/moderation",
  logs: "/admin/security",
};

/** Primary IA sections shown in the redesigned Control nav. */
export const ADMIN_PRIMARY_SECTIONS = [
  { tab: "dashboard", path: "/admin", titleKey: "adminNav.dashboard" },
  { tab: "operations", path: "/admin/operations", titleKey: "adminNav.operations" },
  { tab: "appeals", path: "/admin/appeals", titleKey: "admin.tabAppeals" },
  { tab: "users", path: "/admin/users", titleKey: "adminNav.users" },
  { tab: "admins", path: "/admin/team", titleKey: "adminNav.admins" },
  { tab: "support", path: "/admin/support", titleKey: "adminNav.support" },
  { tab: "live-support", path: "/admin/live-support", titleKey: "adminNav.liveSupport" },
  { tab: "security", path: "/admin/security", titleKey: "adminNav.security" },
] as const;

export function adminPathToTab(pathname: string): string | "dashboard" | null {
  const path = pathname.split("?")[0].replace(/\/$/, "") || "/";
  if (path === "/admin") return "dashboard";
  if (path === "/admin/operations") return "operations";
  if (path === "/admin/appeals") return "appeals";
  if (path === "/admin/users") return "users";
  if (path === "/admin/team") return "admins";
  if (path === "/admin/support") return "support";
  if (path === "/admin/security") return "security";
  if (path === "/admin/listings") return "listings";
  if (path === "/admin/reports") return "reports";
  if (path === "/admin/flagged") return "flagged";
  if (path === "/admin/moderation") return "moderation";
  return null;
}

export function adminTabToPath(tab: string): string | null {
  return ADMIN_SECTION_PATHS[tab] ?? null;
}

export function adminSectionTitleKey(tab: string): string {
  const hit = ADMIN_PRIMARY_SECTIONS.find((s) => s.tab === tab);
  if (hit) return hit.titleKey;
  return `admin.tab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`;
}
