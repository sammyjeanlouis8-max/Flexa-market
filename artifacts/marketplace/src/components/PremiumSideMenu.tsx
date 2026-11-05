import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Home, Search, Film, Tv, Music2, Zap, Gift, Coins, ShoppingBag, TrendingUp,
  Truck, ShieldCheck, User, Heart, Wallet, Crown, Settings, HelpCircle,
  Briefcase, Globe, LogOut, X, ChevronRight, Moon, Sun, Plus, Package,
  Store, Bell, Lock, MapPinned, Sparkles, Landmark, Tag, Award, LayoutGrid,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/components/theme-provider";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/i18n";
import { persistLanguage } from "@/lib/persistLanguage";
import { apiPatch } from "@/lib/api";
import { isNativeMobileApp } from "@/lib/nativeMobileApp";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export function DarkModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isDark = theme === "dark";

  const toggle = () => {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    if (user) {
      apiPatch("/auth/theme", { theme: next }).catch(() => {});
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="btn-dark-mode-toggle"
      className={cn(
        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium text-foreground/80 hover:bg-muted/70 active:scale-[0.99] transition-all",
        className,
      )}
    >
      {isDark
        ? <Sun className="h-4 w-4 shrink-0 text-amber-500" />
        : <Moon className="h-4 w-4 shrink-0 text-muted-foreground" />}
      <span className="flex-1 text-left">{t("userMenu.darkMode")}</span>
      <span
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full border transition-colors duration-200",
          isDark ? "bg-[hsl(152,65%,28%)] border-[hsl(152,65%,28%)]" : "bg-muted border-border",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200",
            isDark ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

export type DriverStatus = "loading" | "none" | "pending" | "approved" | "rejected" | "suspended";

export function useDriverStatus(user: ReturnType<typeof useAuth>["user"]): DriverStatus {
  const [status, setStatus] = useState<DriverStatus>("loading");
  useEffect(() => {
    if (!user) { setStatus("none"); return; }
    const token = localStorage.getItem("flexamarket_token");
    if (!token) { setStatus("none"); return; }
    let cancelled = false;
    fetch("/api/delivery/application", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.driver?.status === "active") { setStatus("approved"); return; }
        const s = data.application?.status;
        if (s === "pending") { setStatus("pending"); return; }
        if (s === "approved") { setStatus("approved"); return; }
        if (s === "rejected") { setStatus("rejected"); return; }
        if (s === "suspended") { setStatus("suspended"); return; }
        setStatus("none");
      })
      .catch(() => { if (!cancelled) setStatus("none"); });
    return () => { cancelled = true; };
  }, [user?.id, user?.country]);
  return status;
}

function useWalletBalances(userId: number | string | undefined): { promo: number; real: number } {
  const [bal, setBal] = useState({ promo: 0, real: 0 });
  useEffect(() => {
    if (!userId) return;
    const token = localStorage.getItem("flexamarket_token");
    if (!token) return;
    let cancelled = false;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setBal({ promo: d?.promoBalance ?? 0, real: d?.balanceUsd ?? 0 });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);
  return bal;
}

type NavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  testId?: string;
  accent?: "emerald" | "primary" | "amber" | "violet";
};

type NavSection = {
  id: string;
  heading: string;
  items: NavItem[];
};

function isPathActive(location: string, href: string): boolean {
  if (href === "/") return location === "/";
  const base = href.split("?")[0];
  if (base === "/search") {
    if (href.includes("boosted=true")) {
      return location.startsWith("/search") && location.includes("boosted=true");
    }
    return location.startsWith("/search") && !location.includes("boosted=true");
  }
  return location === base || location.startsWith(`${base}/`) || location.startsWith(`${base}?`);
}

function NavRow({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={item.testId}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative w-full flex items-center gap-2.5 min-h-[40px] px-2.5 py-1.5 rounded-lg text-left transition-all duration-150 active:scale-[0.985]",
        active
          ? "bg-[hsl(152,45%,92%)] text-[hsl(152,65%,18%)] dark:bg-[hsl(152,40%,16%)] dark:text-[hsl(152,60%,78%)]"
          : "text-foreground/90 hover:bg-muted/70",
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[hsl(152,65%,28%)]"
        />
      )}
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          active
            ? "bg-[hsl(152,55%,88%)] text-[hsl(152,65%,22%)] dark:bg-[hsl(152,35%,22%)] dark:text-[hsl(152,55%,75%)]"
            : "bg-muted/80 text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className={cn("flex-1 min-w-0 text-[13px] leading-snug", active ? "font-semibold" : "font-medium")}>
        {item.label}
      </span>
      <ChevronRight
        className={cn(
          "h-3.5 w-3.5 shrink-0 transition-opacity",
          active ? "text-[hsl(152,50%,35%)] opacity-80" : "text-muted-foreground/40 group-hover:opacity-70",
        )}
      />
    </button>
  );
}

export type PremiumSideMenuProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
  showDelivery: boolean;
};

/**
 * Premium marketplace side drawer — visual redesign only.
 * Preserves existing routes, RBAC, country gates, and handlers.
 */
export default function PremiumSideMenu({ open, onClose, onNavigate, showDelivery }: PremiumSideMenuProps) {
  const { user, logout, token } = useAuth();
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [entered, setEntered] = useState(false);
  const driverStatus = useDriverStatus(user);
  const walletBal = useWalletBalances(user?.id);
  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      setShowLangPicker(false);
      return;
    }
    const id = requestAnimationFrame(() => setEntered(true));
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const go = (href: string) => {
    onClose();
    onNavigate(href);
  };

  const isDrawerAdmin = !!(user?.isAdmin || user?.isSuperAdmin || (user?.role && user.role !== "user"));
  const canSeeModeratorPanel = !!(user && (user.isAdmin || user.isSuperAdmin || user.role === "moderator"));
  const canSeeLoan = !isNativeMobileApp() && !!(user && (user.isSuperAdmin || ["Haiti", "Dominican Republic"].includes(user.country ?? "")));
  const isApprovedDriver = driverStatus === "approved";
  const canSeeSellerTools = !!user;

  const applyLabel =
    driverStatus === "approved" ? t("nav.driverApproved") :
    driverStatus === "pending" ? t("nav.driverPending") :
    driverStatus === "rejected" ? t("nav.driverRejected") :
    driverStatus === "suspended" ? t("nav.driverSuspended") :
    t("nav.applyDriver");

  const sections: NavSection[] = [
    {
      id: "discover",
      heading: t("nav.homeDiscoverSection", { defaultValue: "Home & Discover" }),
      items: [
        { icon: Home, label: t("nav.home"), href: "/", testId: "drawer-home" },
        { icon: LayoutGrid, label: t("nav.categories", { defaultValue: "Categories" }), href: "/search", testId: "drawer-categories" },
        { icon: Tag, label: t("nav.offersPromos", { defaultValue: "Offers & Promotions" }), href: "/offers", testId: "drawer-offers" },
        { icon: Sparkles, label: t("nav.flexaPicks", { defaultValue: "Flexa Picks" }), href: "/search?boosted=true", testId: "drawer-flexa-picks" },
        { icon: Film, label: t("nav.videos"), href: "/videos", testId: "drawer-promo-videos" },
      ],
    },
    ...(canSeeSellerTools ? [{
      id: "boutique",
      heading: t("nav.boutiqueSection", { defaultValue: "Shop & Products" }),
      items: [
        { icon: Store, label: t("salesDashboard.myShop", { defaultValue: "My Shop" }), href: `/profile/${user!.id}`, testId: "drawer-my-shop" },
        { icon: Package, label: t("accountCenter.myListings", { defaultValue: "My Products" }), href: `/profile/${user!.id}`, testId: "drawer-my-products" },
        { icon: Plus, label: t("settings.addProduct", { defaultValue: "Add a product" }), href: "/sell", testId: "drawer-add-product" },
        { icon: Film, label: t("accountCenter.myVideos", { defaultValue: "My Videos" }), href: "/settings/videos", testId: "drawer-my-videos" },
        { icon: Settings, label: t("nav.shopSettings", { defaultValue: "Shop settings" }), href: "/settings", testId: "drawer-shop-settings" },
      ] as NavItem[],
    }] : []),
    ...(user ? [{
      id: "orders",
      heading: t("nav.ordersSalesSection"),
      items: [
        { icon: ShoppingBag, label: t("nav.myOrders", { defaultValue: t("nav.orders") }), href: "/orders", testId: "drawer-orders" },
        { icon: TrendingUp, label: t("nav.salesStats", { defaultValue: t("nav.sales") }), href: "/sales", testId: "drawer-sales" },
        { icon: HelpCircle, label: t("nav.returnsRefunds", { defaultValue: "Returns & Refunds" }), href: "/support", testId: "drawer-returns" },
        { icon: Award, label: t("nav.reviewsRatings", { defaultValue: "Reviews & Ratings" }), href: `/profile/${user.id}`, testId: "drawer-reviews" },
      ] as NavItem[],
    }] : []),
    ...(user && showDelivery ? [{
      id: "delivery",
      heading: t("nav.deliveryServicesSection", { defaultValue: t("nav.livrezonSection") }),
      items: [
        { icon: Truck, label: t("nav.deliveryAvailable"), href: "/delivery/deliveries", testId: "drawer-deliveries-available", accent: "emerald" as const },
        { icon: Truck, label: applyLabel, href: "/delivery/apply", testId: "drawer-driver-application" },
        ...(isApprovedDriver
          ? [{ icon: MapPinned, label: t("driverDash.myDeliveries", { defaultValue: "My Deliveries" }), href: "/driver/dashboard", testId: "drawer-my-deliveries" } as NavItem]
          : []),
        { icon: Search, label: t("nav.orderTracking", { defaultValue: "Order tracking" }), href: "/track", testId: "drawer-tracking" },
      ] as NavItem[],
    }] : []),
    ...(user ? [{
      id: "account",
      heading: t("nav.myAccountSection", { defaultValue: t("nav.account") }),
      items: [
        { icon: User, label: t("nav.profile"), href: "/settings", testId: "drawer-profile" },
        { icon: Heart, label: t("nav.saved"), href: "/saved", testId: "drawer-saved" },
        { icon: Wallet, label: t("nav.walletLabel", { defaultValue: "Wallet" }), href: "/wallet", testId: "drawer-wallet" },
        { icon: Gift, label: t("nav.promoAccount", { defaultValue: "Promo Account" }), href: "/wallet", testId: "drawer-promo-account" },
        { icon: Crown, label: t("nav.subscription"), href: "/subscription", testId: "drawer-subscription" },
        { icon: Settings, label: t("nav.settings"), href: "/settings", testId: "drawer-settings" },
        { icon: Lock, label: t("accountCenter.securityLogin", { defaultValue: "Security & Login" }), href: "/settings/security", testId: "drawer-security" },
        { icon: Bell, label: t("accountCenter.notifications", { defaultValue: "Notifications" }), href: "/settings/notifications", testId: "drawer-notifications" },
      ] as NavItem[],
    }] : [{
      id: "account",
      heading: t("nav.myAccountSection", { defaultValue: t("nav.account") }),
      items: [
        { icon: User, label: t("auth.login"), href: "/auth/login", testId: "drawer-login" },
      ] as NavItem[],
    }]),
    {
      id: "services",
      heading: t("nav.flexaServicesSection", { defaultValue: "Flexa Services" }),
      items: [
        { icon: Tv, label: "Flexa TV", href: "/tv", testId: "drawer-flexa-tv" },
        { icon: Music2, label: "Flexa Music", href: "/music", testId: "drawer-flexa-music" },
        ...(user ? [
          { icon: Zap, label: t("nav.myBoosts"), href: "/my-boosts", testId: "drawer-my-boosts" } as NavItem,
          { icon: Coins, label: t("nav.commissionPromo"), href: "/commission-promo", testId: "drawer-commission-promo" } as NavItem,
        ] : []),
        { icon: Briefcase, label: t("nav.jobsOpportunities", { defaultValue: t("nav.jobs") }), href: "/jobs", testId: "drawer-jobs" },
        ...(user ? [
          { icon: Award, label: t("nav.referralProgram", { defaultValue: "Referral Program" }), href: "/leaderboard", testId: "drawer-referral" } as NavItem,
        ] : []),
        { icon: Sparkles, label: "FlexaBot AI", href: "/chatbot", testId: "drawer-chatbot" },
        { icon: HelpCircle, label: t("nav.supportHelp", { defaultValue: t("nav.support") }), href: "/support", testId: "drawer-support" },
      ],
    },
    ...(canSeeLoan ? [{
      id: "financial",
      heading: t("nav.financialSupport", { defaultValue: "Financial support" }),
      items: [
        { icon: TrendingUp, label: t("nav.creditScore"), href: "/credit-score", testId: "drawer-credit-score" },
        { icon: Landmark, label: t("nav.loanApply"), href: "/loans", testId: "drawer-loans" },
      ] as NavItem[],
    }] : []),
    ...(isDrawerAdmin ? [{
      id: "admin",
      heading: t("nav.adminSection"),
      items: [
        { icon: ShieldCheck, label: t("nav.adminDashboard"), href: "/admin", testId: "drawer-admin" },
        ...(canSeeModeratorPanel
          ? [{ icon: ShieldCheck, label: t("nav.moderatorPanel", { defaultValue: "Moderator Panel" }), href: "/admin?tab=moderation", testId: "drawer-moderator" } as NavItem]
          : []),
      ] as NavItem[],
    }] : []),
  ];

  if (!open) return null;

  const promoTotal = walletBal.promo + walletBal.real;
  const roleLabel = user?.isSuperAdmin
    ? "Super Admin"
    : user?.isAdmin
      ? "Admin"
      : user?.role && user.role !== "user"
        ? user.role
        : t("nav.buyerSeller", { defaultValue: "Member" });

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-[60] bg-black/45 transition-opacity duration-200",
          entered ? "opacity-100" : "opacity-0",
        )}
        onClick={onClose}
        aria-hidden="true"
        data-testid="premium-menu-backdrop"
      />

      <aside
        className={cn(
          "mobile-menu-sheet premium-side-menu fixed top-0 left-0 bottom-0 z-[70] flex w-[min(92vw,22.5rem)] max-w-[100vw] flex-col overflow-x-hidden bg-background shadow-2xl border-r border-border transition-transform duration-200 ease-out",
          entered ? "translate-x-0" : "-translate-x-full",
        )}
        style={{
          boxSizing: "border-box",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.menu")}
        data-testid="premium-side-menu"
      >
        {/* Compact brand header */}
        <div className="shrink-0 bg-[hsl(152,65%,18%)] text-white px-3.5 pt-3 pb-3.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <img
                src="/flexa-logo-v2.png"
                alt=""
                className="h-8 w-auto shrink-0"
                width={32}
                height={32}
              />
              <div className="min-w-0">
                <p className="text-[14px] font-bold tracking-wide leading-tight truncate">Flexa Market</p>
                <p className="text-[10px] text-white/75 leading-tight truncate mt-0.5">
                  {t("nav.menuTagline", { defaultValue: "Marketplace · Delivery · Services" })}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/15 text-white shrink-0 transition-colors"
              aria-label={t("common.close", { defaultValue: "Close menu" })}
              data-testid="premium-menu-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {user && (
            <div className="mt-3 rounded-xl bg-white/10 border border-white/10 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold truncate leading-tight flex items-center gap-1.5">
                    <span className="truncate">{user.name}</span>
                    {user.isVerified && (
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-400 text-[hsl(152,65%,18%)] text-[9px] font-black shrink-0" aria-label="Verified">✓</span>
                    )}
                  </p>
                  <p className="text-[10px] text-white/70 truncate mt-0.5">
                    {roleLabel} · ID: FM-{user.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => go("/wallet")}
                className="mt-2 w-full flex items-center gap-2 rounded-lg bg-[hsl(152,55%,14%)]/80 hover:bg-[hsl(152,55%,12%)] border border-white/10 px-2.5 py-1.5 transition-colors"
                data-testid="drawer-promo-balance"
              >
                <Gift className="h-3.5 w-3.5 text-emerald-300 shrink-0" />
                <span className="flex-1 text-left min-w-0">
                  <span className="block text-[10px] text-white/70 leading-none">{t("nav.promoAccount", { defaultValue: "Promo Account" })}</span>
                  <span className="block text-[13px] font-semibold tabular-nums leading-tight mt-0.5">
                    ${promoTotal.toFixed(2)}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-white/50 shrink-0" />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable navigation */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 pt-3 space-y-3"
          style={{
            paddingBottom: "max(1.25rem, calc(env(safe-area-inset-bottom, 0px) + 1rem))",
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-3">
            {sections.map((section) => (
              <section key={section.id} className="min-w-0" data-testid={`drawer-section-${section.id}`}>
                <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(152,55%,28%)] dark:text-[hsl(152,40%,62%)]">
                  {section.heading.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, "")}
                </p>
                <div className="rounded-xl border border-border/70 bg-card/80 shadow-sm overflow-hidden divide-y divide-border/60">
                  {section.items.map((item) => (
                    <NavRow
                      key={`${section.id}-${item.href}-${item.testId ?? item.label}`}
                      item={item}
                      active={isPathActive(location, item.href)}
                      onClick={() => go(item.href)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Preferences */}
          <section data-testid="drawer-section-preferences">
            <p className="px-2 mb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(152,55%,28%)] dark:text-[hsl(152,40%,62%)]">
              {t("nav.preferencesSection", { defaultValue: "Preferences" })}
            </p>
            <div className="rounded-xl border border-border/70 bg-card/80 shadow-sm overflow-hidden">
              <button
                type="button"
                onClick={() => setShowLangPicker(p => !p)}
                className="w-full flex items-center gap-2.5 min-h-[40px] px-2.5 py-1.5 text-left hover:bg-muted/70 transition-colors"
                data-testid="drawer-lang-toggle"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted/80 text-muted-foreground">
                  <Globe className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-[13px] font-medium">{t("userMenu.language")}</span>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span>{currentLang?.flag}</span>
                  <span>{currentLang?.name}</span>
                </span>
                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground/40 transition-transform", showLangPicker && "rotate-90")} />
              </button>

              {showLangPicker && (
                <div className="border-t border-border/60 bg-muted/20 px-2 py-1.5 space-y-0.5">
                  {SUPPORTED_LANGUAGES.map(lang => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => {
                        void persistLanguage(lang.code as SupportedLanguage, token).then(() => {
                          queryClient.invalidateQueries({ queryKey: ["getMe"] });
                        });
                        setShowLangPicker(false);
                        onClose();
                      }}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors",
                        i18n.language === lang.code
                          ? "bg-[hsl(152,45%,92%)] text-[hsl(152,65%,18%)] font-semibold dark:bg-[hsl(152,40%,16%)] dark:text-[hsl(152,60%,78%)]"
                          : "hover:bg-accent text-foreground",
                      )}
                      data-testid={`drawer-lang-${lang.code}`}
                    >
                      <span className="text-base leading-none">{lang.flag}</span>
                      <span className="flex-1 text-[13px]">{lang.name}</span>
                      {i18n.language === lang.code && <span className="text-[hsl(152,55%,30%)] text-xs font-bold">✓</span>}
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-border/60">
                <DarkModeToggle />
              </div>
            </div>
          </section>

          {user && (
            <button
              type="button"
              onClick={() => { logout(); onClose(); }}
              className="w-full flex items-center justify-center gap-2 min-h-[42px] rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-[13px] font-semibold"
              data-testid="drawer-logout"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>{t("userMenu.logout")}</span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
