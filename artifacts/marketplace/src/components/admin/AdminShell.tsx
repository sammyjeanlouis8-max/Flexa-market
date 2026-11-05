import { useCallback, useMemo, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Bell,
  ChevronLeft,
  Home,
  LayoutDashboard,
  LogOut,
  Moon,
  Sun,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
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
  const [, setLocation] = useLocation();
  const resolvedDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const handleBack = useCallback(() => {
    // Prefer browser history when there is a prior page.
    // Safe fallback: admin dashboard (never leave the user stranded).
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch {
      /* ignore */
    }
    setLocation("/admin");
  }, [setLocation]);

  // Match Flexa Market chat / marketplace chrome: dark-green bar under status bar,
  // white Back control, orange accent on Dashboard.
  const iconBtn =
    "h-10 w-10 shrink-0 rounded-full text-white hover:bg-white/15 hover:text-white";

  return (
    <header
      className="admin-console-header sticky top-0 z-30 flex shrink-0 items-center border-b border-black/20 bg-[hsl(152,65%,18%)] px-2 text-white sm:px-3"
      style={{
        paddingTop: "max(env(safe-area-inset-top, 0px), var(--sat, 0px))",
        minHeight: "calc(3.5rem + max(env(safe-area-inset-top, 0px), var(--sat, 0px)))",
      }}
      data-testid="admin-top-bar"
    >
      <div className="flex h-14 w-full items-center gap-1">
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
            {t("adminControl.shellBrand")}
          </p>
          <p className="truncate text-[11px] text-white/70">
            {displayName} · {roleLabel}
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
        <div className={cn("flex-1 min-w-0 overflow-x-hidden")}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ShieldMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12 2l8 3v6c0 5.25-3.4 9.74-8 11-4.6-1.26-8-5.75-8-11V5l8-3z" />
    </svg>
  );
}
