import { useCallback, useMemo, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BarChart3,
  Bell,
  ChevronLeft,
  CreditCard,
  Grid2X2,
  Home,
  LayoutDashboard,
  LogOut,
  Moon,
  Package,
  Sun,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ADMIN_NAV_GROUPS, adminNavIsActive } from "./adminNav";

function useAdminRoleFlags() {
  const { user } = useAuth();
  const role = user?.role ?? (user?.isSuperAdmin ? "superadmin" : user?.isAdmin ? "admin" : "user");
  return {
    isSuperAdmin: !!(user?.isSuperAdmin || role === "superadmin"),
    isModerator: role === "moderator",
    isAdmin: !!(user?.isAdmin || user?.isSuperAdmin || role === "admin" || role === "superadmin"),
    displayName: user?.name || user?.email || "Admin",
    roleLabel: user?.isSuperAdmin || role === "superadmin"
      ? "Super Admin"
      : role === "moderator"
        ? "Moderator"
        : "Admin",
  };
}

function AdminSidebarNav() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const search = useSearch();
  const { isSuperAdmin, isModerator } = useAdminRoleFlags();

  const groups = useMemo(() => {
    return ADMIN_NAV_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((item) => {
        if (item.superAdminOnly && !isSuperAdmin) return false;
        if (item.hideFromModerator && isModerator) return false;
        return true;
      }),
    })).filter((g) => g.items.length > 0);
  }, [isSuperAdmin, isModerator]);

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.labelKey}>
          <SidebarGroupLabel>{t(group.labelKey)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = adminNavIsActive(location, search, item.href);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={t(item.titleKey)}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{t(item.titleKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function AdminTopBar() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { displayName, roleLabel } = useAdminRoleFlags();
  const [location, setLocation] = useLocation();
  const resolvedDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const handleBack = useCallback(() => {
    // Mobile Safari often reports history.length > 1 even on a deep-link
    // entry, so history.back() can no-op or leave the SPA. Prefer explicit
    // in-app parents for Flexa Control routes.
    const path = (location || "/").split("?")[0].replace(/\/$/, "") || "/";
    if (path === "/admin" || path === "/") {
      setLocation("/");
      return;
    }
    if (path.startsWith("/admin/")) {
      setLocation("/admin");
      return;
    }
    try {
      const ref = typeof document !== "undefined" ? document.referrer : "";
      if (ref) {
        const origin = window.location.origin;
        if (new URL(ref).origin === origin) {
          window.history.back();
          return;
        }
      }
    } catch {
      /* ignore */
    }
    setLocation("/admin");
  }, [location, setLocation]);

  // Compact Flexa Control bar: one safe-area pad (env / --sat fallback) + 56px row.
  const iconBtn =
    "h-9 w-9 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white";

  return (
    <header
      className="admin-console-header sticky top-0 z-30 flex shrink-0 flex-col border-b border-black/20 bg-[hsl(152,65%,18%)] text-white"
      style={{
        // Single inset only — do not also bake safe-area into minHeight (that
        // visually doubled the green gap under the Dynamic Island).
        paddingTop: "max(env(safe-area-inset-top, 0px), var(--sat, 0px))",
      }}
      data-testid="admin-top-bar"
    >
      <div className="flex h-14 w-full items-center gap-1 px-2 sm:px-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          onClick={handleBack}
          aria-label={t("adminNav.back", { defaultValue: "Back" })}
          data-testid="admin-button-back"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.25} />
        </Button>
        <SidebarTrigger
          className={cn(iconBtn, "[&_svg]:text-white")}
          aria-label={t("adminNav.menu", { defaultValue: "Admin menu" })}
          data-testid="admin-sidebar-trigger"
        />
        <div className="min-w-0 flex-1 px-1 text-center sm:text-left">
          <p className="truncate text-sm font-bold tracking-tight text-white">
            {t("adminControl.shellBrand", { defaultValue: "Flexa Control" })}
          </p>
          <p className="truncate text-[11px] text-white/70">
            {t("adminControl.commandCenter", { defaultValue: "Command Center" })} · {roleLabel}
          </p>
        </div>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn(iconBtn, "text-[var(--flexa-orange)] hover:text-[var(--flexa-orange)]")}
          aria-label={t("adminNav.dashboard", { defaultValue: "Dashboard" })}
          data-testid="admin-button-home"
        >
          <Link href="/admin">
            <LayoutDashboard className="h-5 w-5" />
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(iconBtn, "opacity-60")}
          aria-label={t("adminNav.notifications")}
          disabled
          title={t("adminNav.notificationsSoon")}
        >
          <Bell className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtn}
          aria-label={resolvedDark ? "Light mode" : "Dark mode"}
          onClick={() => setTheme(resolvedDark ? "light" : "dark")}
        >
          {resolvedDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          asChild
          size="sm"
          className="hidden h-8 gap-1 border-0 bg-[var(--flexa-orange)] text-white hover:bg-[var(--flexa-orange-deep)] lg:inline-flex"
        >
          <Link href="/">
            <Home className="h-3.5 w-3.5" />
            {t("adminNav.backToSite")}
          </Link>
        </Button>
      </div>
    </header>
  );
}

/**
 * Enterprise admin application shell (Seller Central–style).
 * Wraps all /admin* pages; marketplace chrome should be hidden by Layout.
 */
export default function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const { isSuperAdmin } = useAdminRoleFlags();

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" variant="sidebar" className="border-r border-sidebar-border">
        <SidebarHeader className="border-b border-sidebar-border px-3 py-3">
          <Link href="/admin" className="flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-sidebar-accent">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--flexa-green)] text-white shadow-sm">
              <ShieldMark />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-bold leading-tight tracking-tight">
                {t("adminControl.shellBrand")}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {isSuperAdmin ? t("adminNav.roleSuper") : t("adminNav.roleStaff")}
              </p>
            </div>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <AdminSidebarNav />
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border gap-1 p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t("adminNav.backToSite")}>
                <Link href="/">
                  <ChevronLeft />
                  <span>{t("adminNav.backToSite")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={t("adminNav.signOut")}
                onClick={() => logout?.()}
              >
                <LogOut />
                <span>{t("adminNav.signOut")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-w-0 bg-muted/30">
        <AdminTopBar />
        <div className={cn("flex-1 min-w-0 overflow-x-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:pb-0")}>
          {children}
        </div>
        <AdminMobileBottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}

function AdminMobileBottomNav() {
  const { t } = useTranslation();
  const [location] = useLocation();
  const search = useSearch();
  const path = (location || "/").split("?")[0];

  // Users is under More (not a primary tab) for Admin / Super Admin.
  const items = [
    {
      id: "dashboard",
      href: "/admin",
      label: t("adminNav.dashboard", { defaultValue: "Dashboard" }),
      icon: LayoutDashboard,
      active: path === "/admin" && !search.includes("tab="),
    },
    {
      id: "orders",
      href: "/admin?tab=orders",
      label: t("adminNav.orders", { defaultValue: "Orders" }),
      icon: Package,
      active: search.includes("tab=orders") || path.includes("/admin/orders"),
    },
    {
      id: "payments",
      href: "/admin/stripe-transactions",
      label: t("adminNav.payments", { defaultValue: "Payments" }),
      icon: CreditCard,
      active: path.includes("stripe") || path.includes("transactions") || search.includes("tab=payments"),
    },
    {
      id: "analytics",
      href: "/admin?tab=views",
      label: t("adminNav.analytics", { defaultValue: "Analytics" }),
      icon: BarChart3,
      active: search.includes("tab=views") || search.includes("tab=revenue"),
    },
    {
      id: "more",
      href: "/admin/more",
      label: t("adminNav.more", { defaultValue: "More" }),
      icon: Grid2X2,
      active:
        path === "/admin/more"
        || path === "/admin/operations"
        || path === "/admin/team"
        || path === "/admin/users"
        || path.startsWith("/admin/users/")
        || path === "/admin/flagged"
        || path === "/admin/security",
    },
  ] as const;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/90 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid="admin-mobile-bottom-nav"
      aria-label="Admin primary"
    >
      <div className="mx-auto flex h-[3.75rem] max-w-lg items-stretch justify-between px-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 text-[10px] font-semibold transition-colors",
                item.active
                  ? "text-[hsl(152,65%,22%)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
              data-testid={`admin-bottom-nav-${item.id}`}
              aria-current={item.active ? "page" : undefined}
            >
              <Icon className={cn("h-[20px] w-[20px]", item.active && "stroke-[2.4]")} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ShieldMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3z" />
    </svg>
  );
}
