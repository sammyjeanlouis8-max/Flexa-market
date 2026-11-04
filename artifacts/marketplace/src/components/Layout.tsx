import { ReactNode, Suspense, lazy, useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useBroadcast } from "@/contexts/broadcast";
import {
  Home, Search, Plus, MessageCircle, User, Moon, Sun,
  MoreHorizontal, Heart, ShoppingBag, Tag, Briefcase, Menu, LayoutGrid,
  HelpCircle, Settings, X, ChevronRight, Wallet, ArrowLeft, Globe, Crown, TrendingUp, LogOut, ShieldCheck, Film, Zap, Truck, ShoppingCart, Landmark, Calculator, Sparkles, Tv, Music2, Gift, Coins, MapPin,
} from "lucide-react";
import { useCart } from "@/contexts/cart";
import { SUPPORTED_LANGUAGES, setLanguage, type SupportedLanguage } from "@/i18n";
import { apiPatch } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import LanguagePickerModal from "@/components/LanguagePickerModal";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import PushNotificationsBanner from "@/components/PushNotificationsBanner";
import PasswordUpgradeBanner from "@/components/PasswordUpgradeBanner";
import { FlexCardDebtBanner } from "@/components/FlexCardDebtBanner";
import OfflineBar from "@/components/OfflineBar";
import BoostVideoOverlay, { shouldShowBoostAd, markBoostAdShown } from "@/components/BoostVideoOverlay";
import Footer from "@/components/Footer";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import UserMenu from "@/components/UserMenu";
import GuestMenu from "@/components/GuestMenu";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import AndroidInlineRoute from "@/components/AndroidInlineRoute";
import { OPEN_PUSH_CONVERSATION } from "@/lib/pushNavigation";
import { isNativeMobileApp } from "@/lib/nativeMobileApp";
import { DeliveryMenuCountryContext, canShowFMDeliveryLinks } from "@/contexts/delivery-navigation";
import { useSocket } from "@/hooks/useSocket";
import { prefetchRoute } from "@/lib/prefetchRoutes";
import { CommandPalette } from "@/components/CommandPalette";
import AdminShell from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";

const InlineSell = lazy(() => import("@/pages/Sell"));
const InlineMessages = lazy(() => import("@/pages/Messages"));

/** Desktop badge: socket-driven refresh + slow safety poll (was 5s). */
const UNREAD_POLL_MS = 60_000;

// ─── Unread message badge ────────────────────────────────────────────────────
function useUnreadMessageCount(): number {
  const { user } = useAuth();
  const socket = useSocket();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) { setCount(0); return; }
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const tk = localStorage.getItem("flexamarket_token");
        if (!tk) return;
        const res = await fetch("/api/conversations/unread-count", {
          headers: { Authorization: `Bearer ${tk}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCount(typeof data.count === "number" ? data.count : 0);
      } catch { /* non-critical */ }
    };
    fetchCount();
    // Safety net only — realtime updates come from socket below.
    const iv = setInterval(fetchCount, UNREAD_POLL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") fetchCount(); };
    window.addEventListener("focus", fetchCount);
    document.addEventListener("visibilitychange", onVisible);
    const unsub = socket.onNewMessage(() => { void fetchCount(); });
    return () => {
      cancelled = true;
      clearInterval(iv);
      unsub();
      window.removeEventListener("focus", fetchCount);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, socket]);
  return count;
}

// ─── Cart icon button with badge ─────────────────────────────────────────────
function CartIconButton({ light = false }: { light?: boolean }) {
  const { count } = useCart();
  return (
    <Link href="/cart" aria-label="Panye mwen">
      <button
        className={cn(
          "relative p-2 rounded-xl transition-colors",
          light ? "hover:bg-white/10" : "hover:bg-muted",
        )}
        data-testid="cart-icon-button"
      >
        <ShoppingCart className={cn("h-5 w-5", light ? "text-white" : "text-foreground")} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-[#F97316] text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 leading-none">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
    </Link>
  );
}

// ─── Sponsored video trigger ──────────────────────────────────────────────────
// Timer fires 10 s after the user FIRST enters any browsing route.
// Navigating between browsing routes does NOT reset the countdown — only
// leaving all browsing routes (e.g. going to /messages) cancels the pending
// timer.  This prevents the common case where clicking on listings repeatedly
// keeps resetting the 10-s window so the ad never fires.
const BOOST_AD_DELAY_MS = 10_000;
const BROWSING_ROUTES: RegExp[] = [
  /^\/$/,
  /^\/search/,
  /^\/listings\/[^/]+$/,
  /^\/saved$/,
  /^\/music(\/|$)/,   // FlexaMusic — boost should appear here too
];

interface BoostAdListing {
  id: number;
  title: string;
  price: number;
  thumbnail: string | null;
  boostVideoUrl: string;
  sellerName: string | null;
  boostCtaType: string | null;
  boostExternalLink: string | null;
  boostWhatsappNumber: string | null;
  boostCtaText: string | null;
}

function useBoostAdTrigger(): { listing: BoostAdListing | null; dismiss: () => void } {
  const [location] = useLocation();
  const [listing, setListing] = useState<BoostAdListing | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef  = useRef(false); // true while the timer is armed

  const cancelTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    pendingRef.current = false;
  }, []);

  const armTimer = useCallback(() => {
    if (pendingRef.current) return;           // already armed — keep existing countdown
    if (!shouldShowBoostAd()) return;         // still within cooldown window
    pendingRef.current = true;
    timerRef.current = setTimeout(async () => {
      timerRef.current  = null;
      pendingRef.current = false;
      if (!shouldShowBoostAd()) return;
      try {
        const tk = localStorage.getItem("flexamarket_token");
        const res = await fetch("/api/boost/random-video", {
          headers: tk ? { Authorization: `Bearer ${tk}` } : {},
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!data?.listing || !shouldShowBoostAd()) return;
        markBoostAdShown();
        setListing(data.listing as BoostAdListing);
      } catch { /* non-critical */ }
    }, BOOST_AD_DELAY_MS);
  }, []);

  // Unmount cleanup
  useEffect(() => () => cancelTimer(), [cancelTimer]);

  useEffect(() => {
    const isBrowsing = BROWSING_ROUTES.some(rx => rx.test(location));
    if (!isBrowsing) {
      // Left all browsing routes — cancel any pending timer
      cancelTimer();
      return;
    }
    // Entered (or moved between) browsing routes — arm once; do not reset if already armed
    armTimer();
  }, [location, armTimer, cancelTimer]);

  const dismiss = useCallback(() => {
    setListing(null);
    // Re-arm for next session after cooldown clears (armTimer will no-op if
    // shouldShowBoostAd is still false, which is correct)
    armTimer();
  }, [armTimer]);

  return { listing, dismiss };
}

// ─── Top search bar ───────────────────────────────────────────────────────────
function HeaderSearch({ marketStyle = false }: { marketStyle?: boolean }) {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [q, setQ] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
  };

  if (marketStyle) {
    return (
      <form onSubmit={submit} className="flex-1 max-w-2xl flex gap-0 items-stretch">
        <label className="sr-only">{t("nav.search")}</label>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder={t("home.searchPlaceholder", { defaultValue: "Search for products, brands, and more..." })}
            className="w-full h-10 bg-white text-foreground rounded-l-md rounded-r-none pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#F97316]/50"
            data-testid="input-header-search"
          />
        </div>
        <button
          type="submit"
          className="h-10 w-11 rounded-r-md bg-[#F97316] hover:bg-[#ea6a0c] text-white flex items-center justify-center shrink-0"
          aria-label={t("buttons.search")}
          data-testid="button-header-search"
        >
          <Search className="h-4 w-4" />
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex-1 max-w-xl">
      <label className="sr-only">{t("nav.search")}</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          onFocus={() => { if (!q.trim()) navigate("/search"); }}
          placeholder={t("search.placeholder")}
          className="w-full bg-muted/60 rounded-full pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 transition-shadow"
          data-testid="input-header-search"
        />
      </div>
    </form>
  );
}

// ─── Mobile "More" drawer ─────────────────────────────────────────────────────
type DrawerItem =
  | { kind?: "nav";   icon: React.ComponentType<{ className?: string }>; label: string; href: string }
  | { kind: "lang";   icon: React.ComponentType<{ className?: string }>; label: string; href?: never }
  | { kind: "loan";   icon: React.ComponentType<{ className?: string }>; label: string; subtitle: string; href: string }
  | { kind: "delivery"; icon: React.ComponentType<{ className?: string }>; label: string; href: string; variant: "available" | "apply" }
  | { kind: "commerce"; icon: React.ComponentType<{ className?: string }>; label: string; href: string; variant: "orders" | "sales" }
  | { kind: "promo";  icon: React.ComponentType<{ className?: string }>; label: string; href: string; balance: number; realBalance: number };

function DarkModeToggle({ className }: { className?: string }) {
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
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-all ${className ?? ""}`}
    >
      {isDark
        ? <Sun className="h-4 w-4 shrink-0 text-amber-500" />
        : <Moon className="h-4 w-4 shrink-0" />}
      <span className="flex-1 text-left">{t("userMenu.darkMode")}</span>
      <span className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 transition-colors duration-200 ${isDark ? "bg-primary border-primary" : "bg-muted border-border"}`}>
        <span className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${isDark ? "translate-x-4" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

type DriverStatus = "loading" | "none" | "pending" | "approved" | "rejected" | "suspended";

function useDriverStatus(user: ReturnType<typeof useAuth>["user"]): DriverStatus {
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

function MobileMoreDrawer({ open, onClose, onNavigate, showDelivery }: { open: boolean; onClose: () => void; onNavigate: (href: string) => void; showDelivery: boolean }) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const driverStatus = useDriverStatus(user);
  const walletBal = useWalletBalances(user?.id);

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language);

  const go = (href: string) => { onClose(); onNavigate(href); };

  const isDrawerAdmin = !!(user?.isAdmin || user?.isSuperAdmin || (user?.role && user.role !== "user"));
  const canSeeModeratorPanel = !!(user && (user.isAdmin || user.isSuperAdmin || user.role === "moderator"));
  const canSeeLoan = !isNativeMobileApp() && !!(user && (user.isSuperAdmin || ["Haiti", "Dominican Republic"].includes(user.country ?? "")));

  const sections: Array<{ heading: string; items: DrawerItem[]; highlight?: boolean }> = [
    {
      heading: t("nav.videosSection"),
      highlight: true,
      items: [
        { icon: Film,   label: t("nav.videos"),    href: "/videos" },
        { icon: Tv,     label: "Flexa TV",         href: "/tv" },
        { icon: Music2, label: "Flexa Music",      href: "/music" },
        ...(user ? [
          { icon: Zap, label: t("nav.myBoosts"), href: "/my-boosts" } as DrawerItem,
          { kind: "promo" as const, icon: Gift, label: t("nav.promoAccount", { defaultValue: "Promo Account" }), href: "/wallet", balance: walletBal.promo, realBalance: walletBal.real },
          { icon: Coins, label: t("nav.commissionPromo"), href: "/commission-promo" } as DrawerItem,
        ] : []),
      ] as DrawerItem[],
    },
    ...(user ? [{
      heading: t("nav.ordersSalesSection"),
      items: [
        { kind: "commerce", variant: "orders", icon: ShoppingBag, label: t("nav.orders"), href: "/orders" },
        { kind: "commerce", variant: "sales", icon: TrendingUp, label: t("nav.sales"), href: "/sales" },
      ] as DrawerItem[],
    }] : []),
    ...(user && showDelivery ? [
      {
        heading: t("nav.livrezonSection"),
        items: (() => {
          const applyLabel =
            driverStatus === "approved"  ? t("nav.driverApproved") :
            driverStatus === "pending"   ? t("nav.driverPending") :
            driverStatus === "rejected"  ? t("nav.driverRejected") :
            driverStatus === "suspended" ? t("nav.driverSuspended") :
            t("nav.applyDriver");
          return [
            { kind: "delivery", variant: "available", icon: Truck, label: t("nav.deliveryAvailable"), href: "/delivery/deliveries" },
            { kind: "delivery", variant: "apply", icon: Truck, label: applyLabel, href: "/delivery/apply" },
          ] as DrawerItem[];
        })(),
      },
    ] : []),
    ...(isDrawerAdmin ? [
      {
        heading: t("nav.adminSection"),
        items: [
          { icon: ShieldCheck, label: t("nav.adminDashboard"), href: "/admin" },
          ...(canSeeModeratorPanel ? [{ icon: ShieldCheck, label: t("nav.moderatorPanel", { defaultValue: "Panèl Moderator" }), href: "/admin?tab=moderation" }] : []),
        ] as DrawerItem[],
      },
    ] : []),
    ...(user ? [
      {
        heading: t("nav.account"),
        items: [
          { icon: User,        label: t("nav.profile"),       href: "/settings" },
          { icon: Heart,       label: t("nav.saved"),         href: "/saved" },
          { icon: Tag,         label: t("nav.offers"),        href: "/offers" },
          { icon: Wallet,      label: t("nav.wallet"),        href: "/wallet" },
          { icon: Crown, label: t("nav.subscription"), href: "/subscription" },
          { icon: Settings,    label: t("nav.settings"),      href: "/settings" },
        ] as DrawerItem[],
      },
    ] : [
      {
        heading: t("nav.account"),
        items: [
          { icon: User, label: t("auth.login"), href: "/auth/login" },
        ] as DrawerItem[],
      },
    ]),
    ...(canSeeLoan ? [{
      heading: t("nav.financialSupport", { defaultValue: "Financial support" }),
      items: [
        { icon: TrendingUp, label: t("nav.creditScore"), href: "/credit-score" },
        { kind: "loan" as const, icon: Landmark, label: t("nav.loanApply"), subtitle: t("nav.loanSubtitle"), href: "/loans" },
      ] as DrawerItem[],
    }] : []),
    {
      heading: t("nav.discover"),
      items: [
        { icon: Sparkles,   label: "FlexaBot AI",    href: "/chatbot" },
        { icon: Briefcase,  label: t("nav.jobs"),    href: "/jobs" },
        { icon: HelpCircle, label: t("nav.support"), href: "/support" },
        { kind: "lang" as const, icon: Globe, label: t("userMenu.language") },
      ] as DrawerItem[],
    },
  ];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-[60] md:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Left slide-out drawer (menu opens from top-left hamburger) */}
      <div
        className="mobile-menu-sheet fixed top-0 left-0 bottom-0 z-[70] w-[min(86vw,20rem)] max-w-[100vw] overflow-x-hidden md:hidden bg-card shadow-2xl border-r border-border flex flex-col"
        style={{
          boxSizing: "border-box",
          overscrollBehavior: "contain",
          touchAction: "pan-y",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.menu")}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-[hsl(152,65%,18%)] text-white shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold truncate">Flexa Market</p>
            <p className="text-[10px] text-white/80 truncate">{t("nav.menu")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white shrink-0"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Menu items */}
        <div
          className="px-3 pt-3 space-y-4 flex-1 overflow-y-auto"
          style={{
            paddingBottom: "max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
          }}
        >
          {sections.map(section => (
            <div key={section.heading} className="min-w-0 max-w-full">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground px-1 mb-1.5">
                {section.heading.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, "")}
              </p>
              <div className={`grid min-w-0 w-full gap-1.5 ${section.highlight ? "grid-cols-[repeat(2,minmax(0,1fr))]" : "grid-cols-1"}`}>
                {section.items.map((item, idx) => {
                  if (item.kind === "promo") {
                    const totalBal = (item.balance ?? 0) + (item.realBalance ?? 0);
                    return (
                      <button
                        key="promo-account"
                        type="button"
                        onClick={() => go(item.href)}
                        className="col-span-2 w-full text-left rounded-xl border border-border bg-muted/40 hover:bg-muted/70 active:scale-[0.99] transition-all"
                      >
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary">
                            <Gift className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-foreground leading-tight">
                              {item.label}
                            </span>
                            <span className="block text-[11px] text-muted-foreground leading-tight mt-0.5">
                              {item.realBalance > 0
                                ? `$${item.realBalance.toFixed(2)} · promo $${item.balance.toFixed(2)}`
                                : t("nav.promoBalanceAvail", { defaultValue: "Available balance" })}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-sm font-semibold tabular-nums text-foreground">
                              ${totalBal.toFixed(2)}
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                          </div>
                        </div>
                      </button>
                    );
                  }
                  if (item.kind === "loan") {
                    return (
                      <button
                        key="loan-apply"
                        type="button"
                        onClick={() => go(item.href)}
                        className="col-span-2 w-full text-left rounded-xl border border-border bg-card hover:bg-accent/50 active:scale-[0.99] transition-all"
                      >
                        <div className="flex items-center gap-3 px-3 py-2.5">
                          <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 text-primary">
                            <item.icon className="h-[18px] w-[18px]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">{item.label}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                                NEW
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        </div>
                      </button>
                    );
                  }
                  if (item.kind === "delivery") {
                    const isAvailable = item.variant === "available";
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => go(item.href)}
                        className="w-full min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/50 active:scale-[0.99] transition-all"
                        data-testid={isAvailable ? "drawer-deliveries-available" : "drawer-driver-application"}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            isAvailable ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-primary/10 text-primary"
                          }`}>
                            <item.icon className="h-4 w-4" />
                          </div>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.label}</span>
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                        </div>
                      </button>
                    );
                  }
                  if (item.kind === "commerce") {
                    const isOrders = item.variant === "orders";
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => go(item.href)}
                        className="w-full min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-accent/50 active:scale-[0.99] transition-all"
                        data-testid={isOrders ? "drawer-orders" : "drawer-sales"}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <item.icon className="h-4 w-4" />
                          </div>
                          <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      </button>
                    );
                  }
                  if (item.kind === "lang") {
                    return (
                      <div key="lang-item" className="col-span-2">
                        <button
                          type="button"
                          onClick={() => setShowLangPicker(p => !p)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-transparent hover:bg-accent transition-colors text-left"
                          data-testid="drawer-lang-toggle"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <item.icon className="h-4 w-4" />
                          </div>
                          <span className="flex-1 text-sm font-medium">{item.label}</span>
                          <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                            <span>{currentLang?.flag}</span>
                            <span>{currentLang?.name}</span>
                          </span>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${showLangPicker ? "rotate-90" : ""}`} />
                        </button>

                        {showLangPicker && (
                          <div className="mt-1 ml-3 border-l-2 border-border pl-3 space-y-0.5">
                            {SUPPORTED_LANGUAGES.map(lang => (
                              <button
                                key={lang.code}
                                type="button"
                                onClick={() => { setLanguage(lang.code as SupportedLanguage); apiPatch("/auth/language", { language: lang.code }).catch(() => {}); setShowLangPicker(false); onClose(); }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                                  i18n.language === lang.code
                                    ? "bg-primary/10 text-primary font-semibold"
                                    : "hover:bg-accent text-foreground"
                                }`}
                                data-testid={`drawer-lang-${lang.code}`}
                              >
                                <span className="text-lg leading-none">{lang.flag}</span>
                                <span className="flex-1 text-sm font-medium">{lang.name}</span>
                                {i18n.language === lang.code && (
                                  <span className="text-primary text-xs font-bold">✓</span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  const isHighlightItem = section.highlight;
                  return (
                    <button
                      key={item.href ?? idx}
                      type="button"
                      onClick={() => go(item.href!)}
                      className={`w-full min-w-0 flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors text-left active:scale-[0.99] ${
                        isHighlightItem
                          ? "border border-border bg-card hover:bg-accent/50"
                          : "hover:bg-accent"
                      }`}
                      data-testid={item.href === "/videos" ? "drawer-promo-videos" : undefined}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        isHighlightItem ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                      }`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.label}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Dark Mode toggle */}
          <div className="border-t border-border pt-3">
            <DarkModeToggle className="py-3" />
          </div>

          {/* Logout — only when logged in */}
          {user && (
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => { logout(); onClose(); }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-destructive/10 text-destructive transition-colors text-left"
                data-testid="drawer-logout"
              >
                <LogOut className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-sm font-medium">{t("userMenu.logout")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Back-button helpers ───────────────────────────────────────────────────────
function getPageTitle(loc: string, t: (key: string) => string): string {
  if (loc.startsWith("/listings/")) return t("page.listingDetail");
  if (loc === "/profile/edit") return t("page.editProfile");
  if (loc.startsWith("/profile/")) return t("page.profile");
  if (loc.startsWith("/wallet")) return t("wallet.title");
  if (loc.startsWith("/settings/help")) return t("page.help");
  if (loc.startsWith("/settings/notifications")) return t("page.notifications");
  if (loc.startsWith("/settings/security")) return t("page.security");
  if (loc.startsWith("/settings/preferences")) return t("page.preferences");
  if (loc.startsWith("/settings")) return t("page.settings");
  if (loc.startsWith("/orders")) return t("page.orders");
  if (loc.startsWith("/order-label/")) return t("page.orderLabel");
  if (loc.startsWith("/order/")) return t("page.orderDetail");
  if (loc.startsWith("/sales")) return t("page.sales");
  if (loc.startsWith("/offers")) return t("page.offers");
  if (loc.startsWith("/saved")) return t("page.saved");
  if (loc.startsWith("/jobs")) return t("page.jobs");
  if (loc.startsWith("/support")) return t("page.support");
  if (loc.startsWith("/boost")) return t("page.boost");
  if (loc.startsWith("/checkout")) return t("page.checkout");
  if (loc.startsWith("/subscription")) return t("page.subscription");
  if (loc.startsWith("/sell")) return t("page.sell");
  if (loc.startsWith("/search")) return t("page.search");
  if (loc.startsWith("/agent")) return t("page.agent");
  if (loc.startsWith("/chatbot")) return t("page.chatbot");
  if (loc === "/videos") return t("videoFeed.title");
  return "";
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function Layout({ children, inlineRoutes }: { children: ReactNode; inlineRoutes?: ReactNode }) {
  const [location, navigate] = useLocation();
  const [deliveryMenuCountry, setDeliveryMenuCountry] = useState<string | null | undefined>(undefined);
  const { user, logout, showLanguageModal, dismissLanguageModal } = useAuth();
  const { t } = useTranslation();
  const { count: cartCount } = useCart();
  const unread = useUnreadMessageCount();
  const boostAd = useBoostAdTrigger();
  const bs = useBroadcast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [showInlineSell, setShowInlineSell] = useState(false);
  const [showInlineMessages, setShowInlineMessages] = useState(false);
  const [inlineMessageConversationId, setInlineMessageConversationId] = useState<number | null>(null);
  const [inlineRoute, setInlineRoute] = useState<string | null>(null);
  const inlineSellOriginRef = useRef(location);
  const inlineMessagesOriginRef = useRef(location);
  const inlineRouteOriginRef = useRef(location);

  useEffect(() => {
    const openConversation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!user || !isAndroidApp() || !Number.isSafeInteger(detail?.conversationId) || detail.conversationId <= 0) return;
      detail.handled = true;
      inlineMessagesOriginRef.current = location;
      setInlineMessageConversationId(detail.conversationId);
      setShowInlineSell(false);
      setInlineRoute(null);
      setMoreOpen(false);
      setShowInlineMessages(true);
    };
    window.addEventListener(OPEN_PUSH_CONVERSATION, openConversation);
    return () => window.removeEventListener(OPEN_PUSH_CONVERSATION, openConversation);
  }, [user, location]);

  const handleMobileTab = useCallback((href: string) => {
    if (href === "/messages" && user && isAndroidApp()) {
      inlineMessagesOriginRef.current = location;
      setInlineMessageConversationId(null);
      setShowInlineMessages(true);
      return;
    }
    if (href === "/sell" && user && isAndroidApp()) {
      inlineSellOriginRef.current = location;
      setShowInlineSell(true);
      return;
    }
    if (isAndroidApp() && inlineRoutes) {
      if (href === "/" && location === "/") {
        setInlineRoute(null);
        return;
      }
      inlineRouteOriginRef.current = location;
      setInlineRoute(href);
      return;
    }
    navigate(href);
  }, [location, navigate, user, inlineRoutes]);

  useEffect(() => {
    if (showInlineSell && location !== inlineSellOriginRef.current) {
      setShowInlineSell(false);
    }
    if (showInlineMessages && location !== inlineMessagesOriginRef.current) {
      setShowInlineMessages(false);
    }
    if (inlineRoute && location !== inlineRouteOriginRef.current) {
      setInlineRoute(null);
    }
  }, [location, showInlineMessages, showInlineSell, inlineRoute]);

  // Back button: show on mobile for every page except home, messages, auth, and PDP
  // PDP uses Amazon-style chrome (hamburger + brand) — no back chevron
  const showBackButton =
    location !== "/"
    && !location.startsWith("/messages")
    && !location.startsWith("/auth/")
    && !/^\/listings\/[^/]+/.test(location);

  // When leaving the TV page with an active broadcast OR film playing,
  // always use navigate("/") so GlobalBroadcastPlayer keeps its React state
  // and switches to mini-player. window.history.back() can escape the SPA
  // in WebView contexts and lose all context state.
  const handleBack = useCallback(() => {
    const broadcastActive = bs.state === "playing" || bs.state === "paused";
    const filmActive = bs.filmPlayer !== null;
    if (location === "/tv" && (broadcastActive || filmActive)) {
      navigate("/");
    } else {
      window.history.back();
    }
  }, [location, bs.state, bs.filmPlayer, navigate]);
  const pageTitle = getPageTitle(location, t);

  const profileHref = user ? "/settings" : "/auth/login";

  // 5 fixed bottom tabs — Menu opens from top-left hamburger only (not bottom)
  const tabs = [
    { href: "/",         icon: Home,           label: t("nav.home"),       key: "home" },
    { href: "/search",   icon: LayoutGrid,     label: t("nav.categories", { defaultValue: "Categories" }), key: "categories" },
    { href: "/messages", icon: MessageCircle,  label: t("nav.messages"),   key: "messages", badge: unread },
    { href: "/cart",     icon: ShoppingCart,   label: t("nav.cart", { defaultValue: "Cart" }), key: "cart", badge: cartCount },
    { href: profileHref, icon: User,           label: t("nav.account", { defaultValue: "Account" }), key: "account" },
  ] as const;

  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin || (user?.role && user.role !== "user"));
  const canSeeModeratorPanel = !!(user && (user.isAdmin || user.isSuperAdmin || user.role === "moderator"));
  const driverStatusDesktop = useDriverStatus(user);
  const showDelivery = !!user && canShowFMDeliveryLinks(deliveryMenuCountry === undefined ? user.country : deliveryMenuCountry);
  const canSeeLoan = !isNativeMobileApp() && !!(user && (user.isSuperAdmin || ["Haiti", "Dominican Republic"].includes(user.country ?? "")));

  type SidebarItem = { href: string; icon: React.ComponentType<{ className?: string }>; label: string; key: string; highlight?: boolean; adminHighlight?: boolean; badge?: number };
  type SidebarSection = { heading?: string; highlight?: boolean; items: SidebarItem[] };

  const driverApplyLabel =
    driverStatusDesktop === "approved"  ? t("nav.driverApproved") :
    driverStatusDesktop === "pending"   ? t("nav.driverPending") :
    driverStatusDesktop === "rejected"  ? t("nav.driverRejected") :
    driverStatusDesktop === "suspended" ? t("nav.driverSuspended") :
    t("nav.applyDriver");

  const desktopSections: SidebarSection[] = [
    {
      items: [
        { href: "/",         icon: Home,          label: t("nav.home"),     key: "home" },
        { href: "/search",   icon: Search,        label: t("nav.search"),   key: "search" },
        { href: "/sell",     icon: Plus,          label: t("nav.sell"),     key: "sell", highlight: true },
        { href: "/messages", icon: MessageCircle, label: t("nav.messages"), key: "messages", badge: unread },
      ],
    },
    {
      heading: t("nav.videosSection"),
      highlight: true,
      items: [
        { href: "/videos", icon: Film,   label: t("nav.videos"), key: "videos"      },
        { href: "/tv",     icon: Tv,     label: "Flexa TV",      key: "flexa-tv"    },
        { href: "/music",  icon: Music2, label: "Flexa Music",   key: "flexa-music" },
        ...(user ? [
          { href: "/my-boosts", icon: Zap,  label: t("nav.myBoosts"), key: "my-boosts" },
          { href: "/wallet",    icon: Gift, label: t("nav.promoAccount", { defaultValue: "Promo Account" }), key: "promo-account" },
          { href: "/commission-promo", icon: Coins, label: t("nav.commissionPromo"), key: "commission-promo" },
        ] : []),
      ],
    },
    ...(isAdmin ? [{
      heading: t("nav.adminSection"),
      items: [
        { href: "/admin", icon: ShieldCheck, label: t("nav.adminDashboard"), key: "admin", adminHighlight: true },
        ...(canSeeModeratorPanel ? [{ href: "/admin?tab=moderation", icon: ShieldCheck, label: t("nav.moderatorPanel", { defaultValue: "Panèl Moderator" }), key: "moderator" }] : []),
      ],
    }] : []),
    ...(user ? [{
      heading: t("nav.account"),
      items: [
        { href: "/settings",      icon: User,        label: t("nav.profile"),      key: "profile" },
        { href: "/saved",         icon: Heart,       label: t("nav.saved"),        key: "saved" },
        { href: "/offers",        icon: Tag,         label: t("nav.offers"),       key: "offers" },
        { href: "/orders",        icon: ShoppingBag, label: t("nav.orders"),       key: "orders" },
        { href: "/sales",         icon: TrendingUp,  label: t("nav.sales"),        key: "sales" },
        { href: "/wallet",        icon: Wallet,      label: t("nav.wallet"),       key: "wallet" },
        { href: "/subscription", icon: Crown, label: t("nav.subscription"), key: "subscription" },
        { href: "/settings",      icon: Settings,    label: t("nav.settings"),     key: "settings" },
      ],
    }] : []),
    ...(showDelivery ? [{
      heading: t("nav.livrezonSection"),
      items: [
        { href: "/delivery/deliveries", icon: Truck, label: t("nav.deliveryAvailable"), key: "deliveries" },
        { href: "/delivery/apply",      icon: Truck, label: driverApplyLabel,            key: "driver-apply" },
      ],
    }] : []),
    ...(canSeeLoan ? [{
      heading: t("nav.financialSupport", { defaultValue: "Financial support" }),
      items: [
        { href: "/credit-score", icon: TrendingUp, label: t("nav.creditScore"), key: "credit-score" } as any,
        { href: "/loans",        icon: Landmark,   label: t("nav.loanApply"),   key: "loans" } as any,
      ],
    }] : []),
    {
      heading: t("nav.discover"),
      items: [
        { href: "/chatbot", icon: Sparkles,   label: "FlexaBot AI",    key: "chatbot" },
        { href: "/jobs",    icon: Briefcase,  label: t("nav.jobs"),    key: "jobs" },
        { href: "/support", icon: HelpCircle, label: t("nav.support"), key: "support" },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const moreActive = ["/settings", "/saved", "/orders", "/sales", "/offers", "/jobs", "/support", "/wallet", "/admin", "/videos"].some(p =>
    location.startsWith(p)
  );
  const isHomePage = location === "/";
  // Messages page needs full-height layout (no bottom padding, overflow clipped)
  const isMessages = location.startsWith("/messages");
  // Video feed also needs full-height, immersive layout
  const isVideoFeed = location === "/videos";
  // Inside a specific conversation: hide the mobile bottom nav (WhatsApp style)
  const isMessageThread = /^\/messages\/[^/]+/.test(location);
  // Listing detail — hide footer + bottom nav for a cleaner immersive view
  const isListingDetail = /^\/listings\/[^/]+/.test(location);
  // Amazon-style dark green chrome on home + product detail (mobile)
  const isMarketGreenHeader = isHomePage || isListingDetail;
  const isSubscriptionPage = /^\/subscription\/?$/.test(location);
  // Cover regular navigation and Android's inline posting screen.
  const isSellPage = showInlineSell || /^\/sell\/?(?:\?.*)?$/.test(inlineRoute ?? location);
  const isPaymentOperations =
    location === "/admin/stripe-transactions"
    || location === "/admin/moncash-transactions";
  // Full enterprise admin console — hide marketplace chrome (bottom nav / storefront sidebar).
  const isAdminConsole = /^\/admin(?:\/|$)/.test(location);

  // Pages where the footer should NOT render (full-screen / chat-like UIs)
  const noFooter = isSellPage || isAdminConsole || [
    /^\/messages/,
    /^\/auth\//,
    /^\/checkout/,
    /^\/settings(?:\/|$)/,
    /^\/order-label\//,
    /^\/orders\/[^/]+\/?$/,
    /^\/videos$/,
    /^\/wallet/,
    /^\/subscription\/?$/,
    /^\/chatbot/,
    /^\/calculator/,
    /^\/delivery\/apply/,
    /^\/delivery\/deliveries\/?$/,
    /^\/listings\/[^/]+/,
    /^\/profile\/\d+\/?$/,
    /^\/tv(\/|$)/,
    /^\/admin\/tv(\/|$)/,
    /^\/admin\/music(\/|$)/,
    /^\/admin\/stripe-transactions\/?$/,
    /^\/admin\/moncash-transactions\/?$/,
    /^\/music(\/|$)/,
    /^\/music\/upload$/,
  ].some(rx => rx.test(location));

  // Immersive admin shell — do not nest marketplace header/nav around it.
  if (isAdminConsole) {
    return (
      <DeliveryMenuCountryContext.Provider value={setDeliveryMenuCountry}>
        <div className="app-shell admin-console-shell w-full min-w-0 max-w-full overflow-x-hidden bg-background flex flex-col min-h-dvh">
          <AdminShell>{children}</AdminShell>
        </div>
      </DeliveryMenuCountryContext.Provider>
    );
  }

  return (
    <DeliveryMenuCountryContext.Provider value={setDeliveryMenuCountry}>
    <div className={`app-shell w-full min-w-0 max-w-full overflow-x-hidden bg-background flex flex-col ${isMessages || isVideoFeed ? "h-dvh overflow-clip" : "min-h-dvh"}`}>

      {/* ── Top header ── */}
      {/* paddingTop covers the notch / Dynamic Island on iPhone X+.
          --sat is also used because Safari viewport-fit=auto can report
          env(safe-area-inset-top) as 0 while the status area is still present. */}
      {!isVideoFeed && (
        <header
          className={cn(
            "mobile-app-header sticky top-0 z-50 border-b shadow-sm md:pl-56",
            isMarketGreenHeader
              ? "bg-[hsl(152,65%,18%)] border-[hsl(152,65%,14%)] text-white"
              : "bg-card border-border",
          )}
        >
          <div className="mobile-app-header-row w-full max-w-7xl mx-auto px-3 h-14 md:h-16 flex items-center gap-2">
            {/* Hamburger — mobile menu (top left). Opens left drawer with all role menus. */}
            <button
              type="button"
              data-testid="nav-hamburger"
              onClick={() => setMoreOpen(true)}
              className={cn(
                "md:hidden shrink-0 -ml-1 w-10 h-10 flex items-center justify-center rounded-full transition-colors",
                isMarketGreenHeader ? "text-white hover:bg-white/10" : "text-foreground hover:bg-accent",
              )}
              aria-label={t("nav.menu")}
            >
              <Menu className="h-6 w-6" />
            </button>

            {showBackButton ? (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  className={cn(
                    "md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors",
                    isMarketGreenHeader ? "hover:bg-white/10 text-white" : "hover:bg-accent text-foreground",
                  )}
                  aria-label="Retounen"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {/* On PDP keep brand visible instead of long page title */}
                {isListingDetail ? (
                  <Link href="/" className="md:hidden flex items-center gap-1.5 min-w-0 flex-1">
                    <img src="/flexa-logo-v2.png" alt="" className="h-8 w-auto" width="32" height="32" />
                    <span className="font-bold text-[13px] truncate text-white">Flexa Market</span>
                  </Link>
                ) : pageTitle ? (
                  <span className="md:hidden flex-1 text-base font-bold truncate">{pageTitle}</span>
                ) : null}
                <Link href="/" aria-label="FLEXA MARKET home" className="hidden md:flex items-center gap-2 shrink-0">
                  <img src="/flexa-logo-v2.png" alt="FLEXA MARKET logo" className="h-11 w-auto" width="44" height="44" />
                  <span className="font-bold text-[15px] tracking-wide whitespace-nowrap text-foreground">FLEXA MARKET</span>
                </Link>
                <div className="hidden md:block flex-1">
                  <HeaderSearch />
                </div>
              </>
            ) : (
              <>
                <Link href="/" aria-label="FLEXA MARKET home" className="shrink-0 flex items-center gap-2 min-w-0 flex-1 md:flex-none">
                  <img src="/flexa-logo-v2.png" alt="FLEXA MARKET logo" className="h-9 w-auto md:h-11" width="44" height="44" />
                  <div className="min-w-0">
                    <span className={cn("block font-bold text-[14px] tracking-wide truncate leading-tight", isMarketGreenHeader ? "text-white" : "text-foreground")}>
                      Flexa Market
                    </span>
                    <span className={cn("hidden sm:block text-[10px] leading-tight truncate", isMarketGreenHeader ? "text-white/80" : "text-muted-foreground")}>
                      Buy · Sell · Delivery
                    </span>
                  </div>
                </Link>
                <div className="hidden md:block flex-1 px-4">
                  <HeaderSearch marketStyle={isMarketGreenHeader} />
                </div>
              </>
            )}

            {/* Account icon */}
            <Link
              href={profileHref}
              className={cn(
                "shrink-0 p-2 rounded-xl transition-colors",
                isMarketGreenHeader ? "text-white hover:bg-white/10" : "text-foreground hover:bg-muted",
              )}
              aria-label={t("nav.account", { defaultValue: "Account" })}
              data-testid="header-account-icon"
            >
              <User className="h-5 w-5" />
            </Link>
            {user && <NotificationsDropdown light={isMarketGreenHeader} />}
            <CartIconButton light={isMarketGreenHeader} />
            <CommandPalette />
            <LanguageSwitcher className={cn("header-language-switcher shrink-0 hidden md:inline-flex", isMarketGreenHeader && "text-white")} />
            <div className={cn("hidden md:block", isMarketGreenHeader && "[&_button]:text-white [&_button:hover]:bg-white/10")}>
              {user ? <UserMenu onNavigate={handleMobileTab} /> : <GuestMenu />}
            </div>
          </div>
        </header>
      )}

      {/* Push-notification one-time prompt */}
      {!isVideoFeed && <PushNotificationsBanner isLoggedIn={!!user} />}

      {/* Legacy password upgrade prompt */}
      {!isVideoFeed && <PasswordUpgradeBanner />}

      {/* Flex Card debt block — permanent until repaid (account stays usable) */}
      {!isVideoFeed && <FlexCardDebtBanner />}

      {/* Slow / offline connection notice */}
      {!isVideoFeed && <OfflineBar />}

      {/* ── Main content ── */}
      {/* pb-safe-nav = calc(64px + env(safe-area-inset-bottom)) so content
          never hides under the fixed bottom nav on any iPhone model. */}
      <main className={
        isMessages || isVideoFeed
          ? `app-main-immersive flex-1 overflow-clip flex flex-col min-h-0${isMessageThread ? " message-thread-main" : ""}${isVideoFeed ? "" : " md:pl-56"}`
          : `app-main-scroll flex-1 min-h-0 ${isListingDetail || isPaymentOperations || isSubscriptionPage || isSellPage ? "" : "pb-safe-nav"} md:pl-56`
      }
        style={isSellPage ? { paddingBottom: "max(env(safe-area-inset-bottom, 0px), var(--flexa-android-bottom, 0px))" } : undefined}
      >
        {children}
        {!noFooter && <Footer />}
      </main>

      {/* ── AI Calculator floating button — Home page only ── */}
      {user && location === "/" && (
        <Link href="/calculator">
          <button
            aria-label="CalcAI"
            className={`
              fixed z-40 flex items-center justify-center
              h-11 w-11 rounded-full shadow-md
              bg-gradient-to-br from-orange-500 to-amber-400
              hover:from-orange-600 hover:to-amber-500
              active:scale-95 transition-all duration-150
              right-3 md:right-5
              bottom-[calc(64px+max(env(safe-area-inset-bottom,0px),var(--flexa-android-bottom,0px))+12px)]
              md:bottom-5
            `}
          >
            <Calculator className="h-5 w-5 text-white" aria-hidden="true" />
          </button>
        </Link>
      )}

      {/* ── Mobile bottom nav (5 tabs) — hidden inside an active conversation ── */}
      <nav
        className={`mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50 ${isMessageThread || isVideoFeed || isListingDetail || isPaymentOperations || isSubscriptionPage || isSellPage ? "hidden" : ""}`}
        aria-label="Main navigation"
      >
        {/* Nav expands to include the home-indicator safe area — icons stay
            in the upper 64 px, extra space is padding below them. */}
        <div
          className="mobile-bottom-nav-row w-full grid grid-cols-5"
          style={{
            height: "calc(64px + max(env(safe-area-inset-bottom, 0px), var(--flexa-android-bottom, 0px)))",
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), var(--flexa-android-bottom, 0px))",
            alignItems: "flex-start",
            paddingTop: "0",
          }}
        >
          {tabs.map((tab) => {
            if ("isMore" in tab && tab.isMore) {
              return (
                <button
                  key="more"
                  type="button"
                  data-testid="nav-more"
                  onClick={() => setMoreOpen(true)}
                  className="min-w-0 h-16 flex flex-col items-center justify-center gap-0.5"
                >
                  <MoreHorizontal
                    className={`h-5 w-5 transition-colors ${
                      moreActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium transition-colors ${
                      moreActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            }

            const t2 = tab as { href: string; icon: typeof Home; label: string; key: string; highlight?: true; badge?: number };
            const active = isActive(t2.href);
            const showBadge = typeof t2.badge === "number" && t2.badge > 0;

            return (
              <button
                key={t2.key}
                type="button"
                data-testid={`nav-${t2.key}`}
                aria-label={t2.label}
                onClick={() => handleMobileTab(t2.href)}
                className="w-full min-w-0 h-16 flex flex-col items-center justify-center gap-0.5"
              >
                  {t2.highlight ? (
                    <div className="bg-[#F97316] rounded-full p-3 -mt-6 shadow-lg border-[3px] border-background">
                      <t2.icon className="h-5 w-5 text-white" />
                    </div>
                  ) : (
                    <div className="relative">
                      <t2.icon
                        className={`h-5 w-5 transition-colors ${
                          active ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                      {showBadge && (
                        <span
                          className="absolute -top-1.5 -right-2 bg-red-500 text-white text-xs font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1"
                          data-testid={`badge-${t2.key}`}
                        >
                          {(t2.badge as number) > 99 ? "99+" : t2.badge}
                        </span>
                      )}
                    </div>
                  )}
                  {!t2.highlight && (
                    <span
                      className={`text-xs font-medium transition-colors ${
                        active ? "text-primary" : "text-muted-foreground"
                      }`}
                    >
                      {t2.label}
                    </span>
                  )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Older Android WebViews emit a native load-start event even for some
          client-side route changes. Keep the add-product flow in the current
          document so installed builds do not reopen their startup overlay. */}
      {showInlineSell && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-background md:hidden">
          <div className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur">
            <button
              type="button"
              aria-label={t("common.back")}
              onClick={() => setShowInlineSell(false)}
              className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="font-semibold">{t("page.sell")}</span>
          </div>
          <Suspense fallback={<div className="p-6 text-center text-muted-foreground">{t("common.loading")}</div>}>
            <InlineSell />
          </Suspense>
        </div>
      )}

      {/* Keep Messages inside the already-loaded document on installed Android
          builds. Older WebViews can otherwise reopen the native startup overlay
          when the URL changes, even for a client-side route transition. */}
      {showInlineMessages && (
        <div className="fixed inset-0 z-[70] overflow-hidden bg-background md:hidden">
          <Suspense fallback={<div className="p-6 text-center text-muted-foreground">{t("common.loading")}</div>}>
            <InlineMessages embedded initialConversationId={inlineMessageConversationId} onClose={() => setShowInlineMessages(false)} />
          </Suspense>
        </div>
      )}

      {/* The other Android menu destinations use the same in-document routing
          as Messages, rather than waking the startup screen in old builds. */}
      {inlineRoute && inlineRoutes && (
        <AndroidInlineRoute
          path={inlineRoute}
          routes={inlineRoutes}
          onClose={() => setInlineRoute(null)}
          getTitle={(path) => getPageTitle(path, t)}
        />
      )}

      {/* ── Mobile More Drawer ── */}
      <MobileMoreDrawer
        open={moreOpen}
        showDelivery={showDelivery}
        onClose={() => setMoreOpen(false)}
        onNavigate={handleMobileTab}
      />

      {/* ── Desktop sidebar ── */}
      <nav
        className={`${isVideoFeed ? "hidden" : "hidden md:flex"} fixed left-0 top-16 bottom-0 w-56 bg-card border-r border-border flex-col py-4 px-3 gap-0 z-40 overflow-y-auto`}
        aria-label="Sidebar navigation"
      >
        {desktopSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-3" : ""}>
            {section.heading && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
                {section.heading.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, "")}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((tab) => {
                const { href, icon: Icon, label, key } = tab;
                const highlight = tab.highlight;
                const adminHighlight = tab.adminHighlight;
                const badge = tab.badge;
                const active = isActive(href);
                const showBadge = typeof badge === "number" && badge > 0;
                return (
                  <Link key={key} href={href} onMouseEnter={() => prefetchRoute(href)}>
                    <button
                      type="button"
                      data-testid={`nav-desktop-${key}`}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        highlight
                          ? "bg-primary text-white hover:opacity-90"
                          : adminHighlight
                          ? active
                            ? "bg-primary/10 text-primary font-semibold"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground border border-border/70"
                          : active
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left truncate">{label}</span>
                      {adminHighlight && !active && (
                        <span className="text-[10px] font-semibold bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 leading-none shrink-0">
                          ADMIN
                        </span>
                      )}
                      {showBadge && (
                        <span
                          className="bg-red-500 text-white text-xs font-black rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1.5 shrink-0"
                          data-testid={`badge-desktop-${key}`}
                        >
                          {(badge as number) > 99 ? "99+" : badge}
                        </span>
                      )}
                    </button>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {/* Language + Dark Mode + Logout at bottom of sidebar */}
        <div className="mt-auto pt-2 border-t border-border space-y-1">
          <LanguageSwitcher variant="full" align="start" className="w-full justify-start px-3" />
          <DarkModeToggle />
          {user && (
            <button
              type="button"
              data-testid="nav-desktop-logout"
              onClick={() => { logout(); navigate("/"); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 transition-all"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-left">{t("userMenu.logout")}</span>
            </button>
          )}
        </div>
      </nav>

      {/* Desktop content offset handled by md:pl-56 on <main> above */}

      {/* Sponsored video overlay */}
      {boostAd.listing && (
        <BoostVideoOverlay listing={boostAd.listing} onClose={boostAd.dismiss} />
      )}

      {/* First-login language picker modal */}
      <LanguagePickerModal
        open={showLanguageModal}
        onDone={dismissLanguageModal}
      />
    </div>
    </DeliveryMenuCountryContext.Provider>
  );
}
