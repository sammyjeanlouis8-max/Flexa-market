import { ReactNode, useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import {
  Home, Search, Plus, MessageCircle, User, Moon, Sun,
  MoreHorizontal, Heart, ShoppingBag, Tag, Briefcase,
  HelpCircle, Settings, X, ChevronRight, Wallet, ArrowLeft, Globe, Crown, TrendingUp, LogOut, ShieldCheck, Film, Zap, Truck, ShoppingCart, Landmark, Calculator, Sparkles, Tv,
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

// ─── Unread message badge ────────────────────────────────────────────────────
function useUnreadMessageCount(): number {
  const { user } = useAuth();
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
    const iv = setInterval(fetchCount, 5_000);
    const onVisible = () => { if (document.visibilityState === "visible") fetchCount(); };
    window.addEventListener("focus", fetchCount);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(iv);
      window.removeEventListener("focus", fetchCount);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user]);
  return count;
}

// ─── Cart icon button with badge ─────────────────────────────────────────────
function CartIconButton() {
  const { count } = useCart();
  return (
    <Link href="/cart" aria-label="Panye mwen">
      <button className="relative p-2 rounded-xl hover:bg-muted transition-colors" data-testid="cart-icon-button">
        <ShoppingCart className="h-5 w-5 text-foreground" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-primary text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 leading-none">
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
function HeaderSearch() {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const [q, setQ] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : "/search");
  };

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
  | { kind?: "nav";  icon: React.ComponentType<{ className?: string }>; label: string; href: string }
  | { kind: "lang";  icon: React.ComponentType<{ className?: string }>; label: string; href?: never }
  | { kind: "loan";  icon: React.ComponentType<{ className?: string }>; label: string; subtitle: string; href: string };

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

function MobileMoreDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [, navigate] = useLocation();
  const [showLangPicker, setShowLangPicker] = useState(false);
  const driverStatus = useDriverStatus(user);

  const currentLang = SUPPORTED_LANGUAGES.find(l => l.code === i18n.language);

  const go = (href: string) => { onClose(); navigate(href); };

  const isDrawerAdmin = !!(user?.isAdmin || user?.isSuperAdmin || (user?.role && user.role !== "user"));
  const canSeeLoan = !!(user && (user.isSuperAdmin || ["Haiti", "Dominican Republic"].includes(user.country ?? "")));

  const sections: Array<{ heading: string; items: DrawerItem[]; highlight?: boolean }> = [
    {
      heading: t("nav.videosSection"),
      highlight: true,
      items: [
        { icon: Film, label: `🔥 ${t("nav.videos")}`, href: "/videos" },
        { icon: Tv,   label: "📺 Flexa TV",            href: "/tv" },
        ...(user ? [{ icon: Zap, label: t("nav.myBoosts"), href: "/my-boosts" } as DrawerItem] : []),
      ] as DrawerItem[],
    },
    ...(isDrawerAdmin ? [
      {
        heading: t("nav.adminSection"),
        items: [
          { icon: ShieldCheck, label: t("nav.adminDashboard"), href: "/admin" },
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
          { icon: ShoppingBag, label: t("nav.orders"),        href: "/orders" },
          { icon: TrendingUp,  label: t("nav.sales"),         href: "/sales" },
          { icon: Wallet,      label: t("nav.wallet"),        href: "/wallet" },
          { icon: Crown,       label: t("nav.subscription"),  href: "/subscription" },
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
    ...(user && (isDrawerAdmin || ["Haiti", "Dominican Republic"].includes(user.country ?? "")) ? [
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
            { icon: Truck, label: t("nav.deliveryAvailable"), href: "/delivery/deliveries" },
            { icon: Truck, label: applyLabel, href: "/delivery/apply" },
          ] as DrawerItem[];
        })(),
      },
    ] : []),
    ...(canSeeLoan ? [{
      heading: "💼 Sipò Finansye",
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

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[70] md:hidden bg-card rounded-t-2xl shadow-2xl"
        style={{ maxHeight: "80vh", overflowY: "auto" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Close button */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <span className="text-base font-semibold">{t("nav.menu")}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-accent text-muted-foreground"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Menu items */}
        <div className="px-3 py-3 space-y-4 pb-8">
          {sections.map(section => (
            <div
              key={section.heading}
              className={section.highlight ? "rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent ring-1 ring-primary/20 p-2" : ""}
            >
              <p className={`text-xs font-bold uppercase tracking-wider px-2 mb-1 ${section.highlight ? "text-primary" : "text-muted-foreground font-semibold"}`}>
                {section.heading}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item, idx) => {
                  if (item.kind === "loan") {
                    return (
                      <button
                        key="loan-apply"
                        type="button"
                        onClick={() => go(item.href)}
                        className="w-full text-left rounded-2xl overflow-hidden relative group"
                        style={{
                          background: "linear-gradient(135deg, #7c3aed22 0%, #6d28d922 40%, #4f46e522 100%)",
                          border: "1px solid #7c3aed44",
                          boxShadow: "0 0 16px 0 #7c3aed18",
                        }}
                      >
                        <div className="flex items-center gap-3 px-3 py-3">
                          <div
                            className="shrink-0 flex items-center justify-center h-9 w-9 rounded-xl"
                            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                          >
                            <item.icon className="h-5 w-5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold" style={{ color: "#a78bfa" }}>{item.label}</span>
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                                style={{ background: "linear-gradient(90deg,#7c3aed,#4f46e5)", color: "#fff" }}
                              >
                                NEW
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{item.subtitle}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#a78bfa" }} />
                        </div>
                      </button>
                    );
                  }
                  if (item.kind === "lang") {
                    return (
                      <div key="lang-item">
                        {/* Language toggle row */}
                        <button
                          type="button"
                          onClick={() => setShowLangPicker(p => !p)}
                          className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-accent transition-colors text-left"
                          data-testid="drawer-lang-toggle"
                        >
                          <item.icon className="h-5 w-5 text-muted-foreground shrink-0" />
                          <span className="flex-1 text-sm font-medium">{item.label}</span>
                          <span className="text-xs text-muted-foreground mr-1 flex items-center gap-1">
                            <span>{currentLang?.flag}</span>
                            <span>{currentLang?.name}</span>
                          </span>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${showLangPicker ? "rotate-90" : ""}`} />
                        </button>

                        {/* Inline language list */}
                        {showLangPicker && (
                          <div className="mt-1 ml-3 border-l-2 border-primary/20 pl-3 space-y-0.5">
                            {SUPPORTED_LANGUAGES.map(lang => (
                              <button
                                key={lang.code}
                                type="button"
                                onClick={() => { setLanguage(lang.code as SupportedLanguage); apiPatch("/auth/language", { language: lang.code }).catch(() => {}); setShowLangPicker(false); onClose(); }}
                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${
                                  i18n.language === lang.code
                                    ? "bg-primary/10 text-primary font-bold"
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
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-colors text-left ${
                        isHighlightItem
                          ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                          : "hover:bg-accent"
                      }`}
                      data-testid={item.href === "/videos" ? "drawer-promo-videos" : undefined}
                    >
                      <item.icon className={`h-5 w-5 shrink-0 ${isHighlightItem ? "" : "text-muted-foreground"}`} />
                      <span className={`flex-1 text-sm ${isHighlightItem ? "font-bold" : "font-medium"}`}>{item.label}</span>
                      <ChevronRight className={`h-4 w-4 ${isHighlightItem ? "text-primary-foreground/70" : "text-muted-foreground/50"}`} />
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
export default function Layout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout, showLanguageModal, dismissLanguageModal } = useAuth();
  const { t } = useTranslation();
  const unread = useUnreadMessageCount();
  const boostAd = useBoostAdTrigger();
  const [moreOpen, setMoreOpen] = useState(false);

  // Back button: show on mobile for every page except home, messages, and auth
  const showBackButton = location !== "/" && !location.startsWith("/messages") && !location.startsWith("/auth/");
  const pageTitle = getPageTitle(location, t);

  const profileHref = user ? "/settings" : "/auth/login";

  // 5 fixed bottom tabs — the 5th opens the "More" drawer
  const tabs = [
    { href: "/",         icon: Home,          label: t("nav.home"),     key: "home" },
    { href: "/search",   icon: Search,        label: t("nav.search"),   key: "search" },
    { href: "/sell",     icon: Plus,          label: t("nav.sell"),     key: "sell",     highlight: true },
    { href: "/messages", icon: MessageCircle, label: t("nav.messages"), key: "messages", badge: unread },
    { key: "more",       icon: MoreHorizontal, label: t("nav.more"), isMore: true },
  ] as const;

  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin || (user?.role && user.role !== "user"));
  const driverStatusDesktop = useDriverStatus(user);
  const showDelivery = !!(user && (isAdmin || ["Haiti", "Dominican Republic"].includes(user.country ?? "")));
  const canSeeLoan = !!(user && (user.isSuperAdmin || ["Haiti", "Dominican Republic"].includes(user.country ?? "")));

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
        { href: "/videos",    icon: Film, label: `🔥 ${t("nav.videos")}`,   key: "videos" },
        { href: "/tv",        icon: Tv,   label: "📺 Flexa TV",              key: "flexa-tv" },
        ...(user ? [{ href: "/my-boosts", icon: Zap,  label: t("nav.myBoosts"), key: "my-boosts" }] : []),
      ],
    },
    ...(isAdmin ? [{
      heading: t("nav.adminSection"),
      items: [{ href: "/admin", icon: ShieldCheck, label: t("nav.adminDashboard"), key: "admin", adminHighlight: true }],
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
        { href: "/subscription",  icon: Crown,       label: t("nav.subscription"), key: "subscription" },
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
      heading: "💼 Sipò Finansye",
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

  // Messages page needs full-height layout (no bottom padding, overflow clipped)
  const isMessages = location.startsWith("/messages");
  // Video feed also needs full-height, immersive layout
  const isVideoFeed = location === "/videos";
  // Inside a specific conversation: hide the mobile bottom nav (WhatsApp style)
  const isMessageThread = /^\/messages\/[^/]+/.test(location);
  // Listing detail — hide footer + bottom nav for a cleaner immersive view
  const isListingDetail = /^\/listings\/[^/]+/.test(location);

  // Pages where the footer should NOT render (full-screen / chat-like UIs)
  const noFooter = [
    /^\/messages/,
    /^\/auth\//,
    /^\/checkout/,
    /^\/settings\/stripe/,
    /^\/order-label\//,
    /^\/videos$/,
    /^\/wallet/,
    /^\/chatbot/,
    /^\/calculator/,
    /^\/delivery\/apply/,
    /^\/listings\/[^/]+/,
  ].some(rx => rx.test(location));

  return (
    <div className={`bg-background flex flex-col ${isMessages || isVideoFeed ? "h-svh overflow-clip" : "min-h-dvh"}`}>

      {/* ── Top header ── */}
      {/* paddingTop covers the notch / Dynamic Island on iPhone X+ when
          viewport-fit=cover is active (see index.html viewport meta). */}
      {!isVideoFeed && <header className="sticky top-0 z-50 bg-card border-b border-border shadow-sm md:pl-56" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
        <div className="max-w-7xl mx-auto px-3 h-16 flex items-center gap-3">

          {/* Mobile back button — visible only on sub-pages, hidden on desktop */}
          {showBackButton ? (
            <>
              <button
                type="button"
                onClick={() => window.history.back()}
                className="md:hidden shrink-0 -ml-1 w-10 h-10 flex items-center justify-center rounded-full hover:bg-accent transition-colors text-foreground"
                aria-label="Retounen"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              {/* Page title — mobile only */}
              {pageTitle && (
                <span className="md:hidden flex-1 text-base font-bold text-foreground truncate">{pageTitle}</span>
              )}
              {/* Logo + brand — desktop only on sub-pages */}
              <Link href="/" aria-label="FLEXA MARKET home" className="hidden md:flex items-center gap-2 shrink-0">
                <img src="/logo.png" alt="FLEXA MARKET logo" className="h-11 w-auto" width="44" height="44" />
                <span className="font-bold text-[15px] tracking-wide whitespace-nowrap text-foreground">FLEXA MARKET</span>
              </Link>
              <div className="hidden md:block flex-1">
                <HeaderSearch />
              </div>
            </>
          ) : (
            <>
              <Link href="/" aria-label="FLEXA MARKET home" className="shrink-0 flex items-center gap-2">
                <img src="/logo.png" alt="FLEXA MARKET logo" className="h-11 w-auto" width="44" height="44" />
                <span className="hidden sm:block font-bold text-[15px] tracking-wide whitespace-nowrap text-foreground">FLEXA MARKET</span>
              </Link>
              <HeaderSearch />
            </>
          )}

          {user && <NotificationsDropdown />}
          {user && <CartIconButton />}
          {/* Visible language switcher — always shown in header */}
          <LanguageSwitcher className="shrink-0" />
          {/* Profile menu */}
          {user ? <UserMenu /> : <GuestMenu />}

        </div>
      </header>}

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
          ? `flex-1 overflow-clip flex flex-col min-h-0${isVideoFeed ? "" : " md:pl-56"}`
          : `flex-1 ${isListingDetail ? "" : "pb-safe-nav"} md:pl-56`
      }>
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
              h-12 w-12 rounded-full shadow-lg
              bg-gradient-to-br from-orange-500 to-amber-400
              hover:from-orange-600 hover:to-amber-500
              active:scale-95 transition-all duration-150
              right-4 md:right-6
              bottom-[calc(64px+env(safe-area-inset-bottom,0px)+14px)]
              md:bottom-6
            `}
          >
            <Calculator className="h-5 w-5 text-white" />
          </button>
        </Link>
      )}

      {/* ── Mobile bottom nav (5 tabs) — hidden inside an active conversation ── */}
      <nav
        className={`fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50 ${isMessageThread || isVideoFeed || isListingDetail ? "hidden" : ""}`}
        aria-label="Main navigation"
      >
        {/* Nav expands to include the home-indicator safe area — icons stay
            in the upper 64 px, extra space is padding below them. */}
        <div className="flex" style={{ height: "calc(64px + env(safe-area-inset-bottom, 0px))", paddingBottom: "env(safe-area-inset-bottom, 0px)", alignItems: "flex-start", paddingTop: "0" }}>
          {tabs.map((tab) => {
            if ("isMore" in tab && tab.isMore) {
              return (
                <button
                  key="more"
                  type="button"
                  data-testid="nav-more"
                  onClick={() => setMoreOpen(true)}
                  className="flex-1 h-16 flex flex-col items-center justify-center gap-0.5"
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
              <Link key={t2.key} href={t2.href} className="flex-1">
                <button
                  type="button"
                  data-testid={`nav-${t2.key}`}
                  className="w-full h-16 flex flex-col items-center justify-center gap-0.5"
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
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile More Drawer ── */}
      <MobileMoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />

      {/* ── Desktop sidebar ── */}
      <nav
        className={`${isVideoFeed ? "hidden" : "hidden md:flex"} fixed left-0 top-16 bottom-0 w-56 bg-card border-r border-border flex-col py-4 px-3 gap-0 z-40 overflow-y-auto`}
        aria-label="Sidebar navigation"
      >
        {desktopSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-3" : ""}>
            {section.heading && (
              <p className={`px-3 pb-1 text-[10px] font-bold uppercase tracking-wider ${section.highlight ? "text-primary" : "text-muted-foreground/60"}`}>
                {section.heading}
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
                  <Link key={key} href={href}>
                    <button
                      type="button"
                      data-testid={`nav-desktop-${key}`}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        highlight
                          ? "bg-primary text-white hover:opacity-90"
                          : adminHighlight
                          ? active
                            ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 font-semibold"
                            : "bg-purple-50 text-purple-600 dark:bg-purple-950/30 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800"
                          : active
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${adminHighlight ? "text-purple-500" : ""}`} />
                      <span className="flex-1 text-left truncate">{label}</span>
                      {adminHighlight && !active && (
                        <span className="text-[10px] font-bold bg-purple-500 text-white rounded-full px-1.5 py-0.5 leading-none shrink-0">
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
  );
}
