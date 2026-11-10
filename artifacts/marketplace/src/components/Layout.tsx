import { ReactNode, Suspense, lazy, useState, useEffect, useRef, useCallback, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useBroadcast } from "@/contexts/broadcast";
import {
  Home, Search, Plus, MessageCircle, User,
  MoreHorizontal, Heart, ShoppingBag, Tag, Briefcase, Menu, LayoutGrid,
  HelpCircle, Settings, Wallet, ArrowLeft, Crown, TrendingUp, LogOut, ShieldCheck, Film, FileVideo, Zap, Truck, ShoppingCart, Landmark, Calculator, Sparkles, Tv, Music2, Gift, Coins, MapPin, Package, Store, Bell, Lock, MapPinned, Award,
} from "lucide-react";
import { useCart } from "@/contexts/cart";
import LanguagePickerModal from "@/components/LanguagePickerModal";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import PushNotificationsBanner from "@/components/PushNotificationsBanner";
import PasswordUpgradeBanner from "@/components/PasswordUpgradeBanner";
import { FlexCardDebtBanner } from "@/components/FlexCardDebtBanner";
import OfflineBar from "@/components/OfflineBar";
import BoostVideoOverlay, { shouldShowBoostAd, markBoostAdShown } from "@/components/BoostVideoOverlay";
import { useAdminCountry } from "@/contexts/admin-country";
import { adminVideoFeedParamsKey } from "@/lib/adminCountryAccess";
import { useShoppingLocation } from "@/contexts/shopping-location";
import Footer from "@/components/Footer";
import NotificationsDropdown from "@/components/NotificationsDropdown";
import UserMenu from "@/components/UserMenu";
import GuestMenu from "@/components/GuestMenu";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PremiumSideMenu, { DarkModeToggle, useDriverStatus } from "@/components/PremiumSideMenu";
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
import { useGetCategories } from "@workspace/api-client-react";

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
  const { t } = useTranslation();
  const { count } = useCart();
  return (
    <Link href="/cart" aria-label={t("nav.cart")}>
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
  boostVideoUrl: string | null;
  boostImageUrl?: string | null;
  adFormat?: string | null;
  sellerName: string | null;
  sellerId?: number | null;
  boostCtaType: string | null;
  boostExternalLink: string | null;
  boostWhatsappNumber: string | null;
  boostCtaText: string | null;
  status?: string | null;
  isVideoOnly?: boolean;
}

function useBoostAdTrigger(): { listing: BoostAdListing | null; dismiss: () => void } {
  const [location] = useLocation();
  const { user } = useAuth();
  const { videoFeedParams, isAdminViewer, effectiveCountry } = useAdminCountry();
  const { country: shoppingCountry } = useShoppingLocation();
  const [listing, setListing] = useState<BoostAdListing | null>(null);
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef  = useRef(false); // true while the timer is armed
  const fetchGenRef = useRef(0);
  const deliveryScopeKey = isAdminViewer
    ? adminVideoFeedParamsKey(videoFeedParams)
    : `user|${user?.country ?? shoppingCountry ?? ""}`;

  const cancelTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    pendingRef.current = false;
  }, []);

  const fetchRandomAd = useCallback(async (generation: number) => {
    if (!shouldShowBoostAd()) return;
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const params = new URLSearchParams();
      if (isAdminViewer) {
        if (videoFeedParams.country) params.set("country", videoFeedParams.country);
        if (videoFeedParams.allCountries) params.set("allCountries", videoFeedParams.allCountries);
      } else if (!user && shoppingCountry) {
        // Guest browsing country — server also falls back to CF-IPCountry.
        params.set("country", shoppingCountry);
      }
      const qs = params.toString();
      const res = await fetch(`/api/boost/random-video${qs ? `?${qs}` : ""}`, {
        headers: {
          ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
          "Cache-Control": "no-store",
        },
      });
      if (!res.ok) return;
      // Discard stale responses after admin country switch / remount.
      if (generation !== fetchGenRef.current) return;
      const data = await res.json();
      if (generation !== fetchGenRef.current) return;
      if (!data?.listing || !shouldShowBoostAd()) return;
      markBoostAdShown();
      setListing(data.listing as BoostAdListing);
    } catch { /* non-critical */ }
  }, [isAdminViewer, videoFeedParams, user, shoppingCountry]);

  const armTimer = useCallback(() => {
    if (pendingRef.current) return;           // already armed — keep existing countdown
    if (!shouldShowBoostAd()) return;         // still within cooldown window
    pendingRef.current = true;
    const generation = fetchGenRef.current;
    timerRef.current = setTimeout(() => {
      timerRef.current  = null;
      pendingRef.current = false;
      void fetchRandomAd(generation);
    }, BOOST_AD_DELAY_MS);
  }, [fetchRandomAd]);

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

  // Admin country preview (or guest market) changed → drop old ad and re-query.
  // Do not depend on `location` here — route changes are handled above without
  // resetting an already-armed countdown.
  useEffect(() => {
    fetchGenRef.current += 1;
    setListing(null);
    cancelTimer();
    // Force a fresh arm after scope change (bypass pendingRef latch).
    pendingRef.current = false;
    armTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when delivery scope changes
  }, [deliveryScopeKey]);

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

// ─── Back-button helpers ───────────────────────────────────────────────────────
function getPageTitle(loc: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (loc.startsWith("/listings/")) return t("page.listingDetail");
  if (loc === "/profile/edit") return t("page.editProfile");
  if (loc.startsWith("/profile/")) return t("page.profile");
  if (loc.startsWith("/wallet")) return t("wallet.title");
  if (loc.startsWith("/settings/help")) return t("page.help");
  if (loc.startsWith("/settings/notifications")) return t("page.notifications");
  if (loc.startsWith("/settings/security")) return t("page.security");
  if (loc.startsWith("/settings/preferences")) return t("page.preferences");
  if (loc.startsWith("/settings/payments")) return t("accountCenter.paymentsWithdrawals");
  if (loc.startsWith("/settings/identity")) return t("accountCenter.profileIdentity");
  if (loc.startsWith("/settings/privacy")) return t("accountCenter.privacy");
  if (loc.startsWith("/settings/videos")) return t("accountCenter.myVideos");
  if (loc.startsWith("/settings/analytics")) return t("accountCenter.analytics");
  if (loc.startsWith("/settings")) return t("page.settings");
  if (loc.startsWith("/orders")) return t("page.orders");
  if (loc.startsWith("/order-label/")) return t("page.orderLabel");
  if (loc.startsWith("/order/")) return t("page.orderDetail");
  if (loc.startsWith("/sales")) return t("page.sales");
  if (loc.startsWith("/offers")) return t("page.offers");
  if (loc.startsWith("/saved")) return t("page.saved");
  if (loc.startsWith("/my-drafts") || loc.startsWith("/bouillon") || loc.startsWith("/brouillon")) {
    return t("myDrafts.title", { defaultValue: "My Drafts" });
  }
  if (loc.startsWith("/jobs")) return t("page.jobs");
  if (loc.startsWith("/support")) return t("page.support");
  if (loc.startsWith("/boost-analytics") || loc.startsWith("/booster/analytics")) {
    return t("boostAnalytics.title", { defaultValue: "Boost Analytics" });
  }
  if (loc.startsWith("/booster")) return t("nav.myBoosts", { defaultValue: "My Boosts" });
  if (loc.startsWith("/boost")) return t("page.boost");
  if (loc.startsWith("/checkout")) return t("page.checkout");
  if (loc.startsWith("/commission-promo")) return t("nav.commissionPromo");
  if (loc.startsWith("/subscription")) return t("page.subscription");
  if (loc.startsWith("/sell")) return t("page.sell");
  if (loc.startsWith("/search")) return t("page.search");
  if (loc.startsWith("/agent")) return t("page.agent");
  if (loc.startsWith("/chatbot")) return t("page.chatbot");
  if (loc === "/videos" || loc.startsWith("/videos/watch")) return t("videoFeed.title");
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
  const { data: marketCategories } = useGetCategories();
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
      heading: t("nav.homeDiscoverSection", { defaultValue: "Home & Discover" }),
      items: [
        { href: "/", icon: Home, label: t("nav.home"), key: "home" },
        { href: "/search", icon: Search, label: t("nav.categories", { defaultValue: "Categories" }), key: "search" },
        { href: "/sell", icon: Plus, label: t("nav.sell"), key: "sell", highlight: true },
        { href: "/messages", icon: MessageCircle, label: t("nav.messages"), key: "messages", badge: unread },
        { href: "/offers", icon: Tag, label: t("nav.offersPromos", { defaultValue: "Offers & Promotions" }), key: "offers" },
        { href: "/search?boosted=true", icon: Sparkles, label: t("nav.flexaPicks", { defaultValue: "Flexa Picks" }), key: "flexa-picks" },
        { href: "/videos", icon: Film, label: t("nav.videos"), key: "videos" },
      ],
    },
    ...(user ? [{
      heading: t("nav.boutiqueSection", { defaultValue: "Shop & Products" }),
      items: [
        { href: `/profile/${user.id}`, icon: Store, label: t("salesDashboard.myShop", { defaultValue: "My Shop" }), key: "my-shop" },
        { href: `/profile/${user.id}`, icon: Package, label: t("accountCenter.myListings", { defaultValue: "My Products" }), key: "my-products" },
        { href: "/settings/videos", icon: Film, label: t("accountCenter.myVideos", { defaultValue: "My Videos" }), key: "my-videos" },
        { href: "/settings", icon: Settings, label: t("nav.shopSettings", { defaultValue: "Shop settings" }), key: "shop-settings" },
      ],
    }] : []),
    ...(user ? [{
      heading: t("nav.ordersSalesSection"),
      items: [
        { href: "/orders", icon: ShoppingBag, label: t("nav.myOrders", { defaultValue: t("nav.orders") }), key: "orders" },
        { href: "/sales", icon: TrendingUp, label: t("nav.salesStats", { defaultValue: t("nav.sales") }), key: "sales" },
      ],
    }] : []),
    ...(showDelivery ? [{
      heading: t("nav.deliveryServicesSection", { defaultValue: t("nav.livrezonSection") }),
      items: [
        { href: "/delivery/deliveries", icon: Truck, label: t("nav.deliveryAvailable"), key: "deliveries" },
        { href: "/delivery/apply", icon: Truck, label: driverApplyLabel, key: "driver-apply" },
        ...(driverStatusDesktop === "approved"
          ? [{ href: "/driver/dashboard", icon: MapPinned, label: t("driverDash.myDeliveries", { defaultValue: "My Deliveries" }), key: "my-deliveries" }]
          : []),
        { href: "/track", icon: Search, label: t("nav.orderTracking", { defaultValue: "Order tracking" }), key: "tracking" },
      ],
    }] : []),
    ...(user ? [{
      heading: t("nav.myAccountSection", { defaultValue: t("nav.account") }),
      items: [
        { href: "/settings", icon: User, label: t("nav.profile"), key: "profile" },
        { href: "/saved", icon: Heart, label: t("nav.saved"), key: "saved" },
        { href: "/my-drafts", icon: FileVideo, label: t("myDrafts.title", { defaultValue: "My Drafts" }), key: "my-drafts" },
        { href: "/wallet", icon: Wallet, label: t("nav.walletLabel", { defaultValue: "Wallet" }), key: "wallet" },
        { href: "/wallet", icon: Gift, label: t("nav.promoAccount", { defaultValue: "Promo Account" }), key: "promo-account" },
        { href: "/subscription", icon: Crown, label: t("nav.subscription"), key: "subscription" },
        { href: "/settings/security", icon: Lock, label: t("accountCenter.securityLogin", { defaultValue: "Security & Login" }), key: "security" },
        { href: "/settings/notifications", icon: Bell, label: t("accountCenter.notifications", { defaultValue: "Notifications" }), key: "notifications" },
      ],
    }] : []),
    {
      heading: t("nav.flexaServicesSection", { defaultValue: "Flexa Services" }),
      items: [
        { href: "/tv", icon: Tv, label: "Flexa TV", key: "flexa-tv" },
        { href: "/music", icon: Music2, label: "Flexa Music", key: "flexa-music" },
        ...(user ? [
          { href: "/booster", icon: Zap, label: t("nav.myBoosts"), key: "my-boosts" },
          { href: "/commission-promo", icon: Coins, label: t("nav.commissionPromo"), key: "commission-promo" },
          { href: "/leaderboard", icon: Award, label: t("nav.referralProgram", { defaultValue: "Referral Program" }), key: "referral" },
        ] : []),
        { href: "/jobs", icon: Briefcase, label: t("nav.jobsOpportunities", { defaultValue: t("nav.jobs") }), key: "jobs" },
        { href: "/chatbot", icon: Sparkles, label: "FlexaBot AI", key: "chatbot" },
        { href: "/support", icon: HelpCircle, label: t("nav.supportHelp", { defaultValue: t("nav.support") }), key: "support" },
      ],
    },
    ...(canSeeLoan ? [{
      heading: t("nav.financialSupport", { defaultValue: "Financial support" }),
      items: [
        { href: "/credit-score", icon: TrendingUp, label: t("nav.creditScore"), key: "credit-score" },
        { href: "/loans", icon: Landmark, label: t("nav.loanApply"), key: "loans" },
      ],
    }] : []),
    ...(isAdmin ? [{
      heading: t("nav.adminSection"),
      items: [
        { href: "/admin", icon: ShieldCheck, label: t("nav.adminDashboard"), key: "admin", adminHighlight: true },
        ...(canSeeModeratorPanel ? [{ href: "/admin?tab=moderation", icon: ShieldCheck, label: t("nav.moderatorPanel", { defaultValue: "Moderator Panel" }), key: "moderator" }] : []),
      ],
    }] : []),
  ];

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    const [path, query] = href.split("?");
    if (path === "/search" && query?.includes("boosted=true")) {
      return location.startsWith("/search") && typeof window !== "undefined" && window.location.search.includes("boosted=true");
    }
    if (path === "/search") {
      return location.startsWith("/search") && (typeof window === "undefined" || !window.location.search.includes("boosted=true"));
    }
    return location === path || location.startsWith(`${path}/`) || location.startsWith(`${path}?`);
  };

  const moreActive = ["/settings", "/saved", "/my-drafts", "/bouillon", "/orders", "/sales", "/offers", "/jobs", "/support", "/wallet", "/admin", "/videos"].some(p =>
    location.startsWith(p)
  );
  const isHomePage = location === "/";
  // Messages page needs full-height layout (no bottom padding, overflow clipped)
  const isMessages = location.startsWith("/messages");
  // Video feed also needs full-height, immersive layout
  const isVideoFeed = location === "/videos/watch" || location.startsWith("/videos/watch?");
  // Entire Promotional Videos section owns its TikTok-style chrome (header + bottom nav).
  const isPromoVideosSection =
    location === "/videos"
    || location.startsWith("/videos?")
    || location.startsWith("/videos/");
  // Inside a specific conversation: hide the mobile bottom nav (WhatsApp style)
  const isMessageThread = /^\/messages\/[^/]+/.test(location);
  // Listing detail — hide footer + bottom nav for a cleaner immersive view
  const isListingDetail = /^\/listings\/[^/]+/.test(location);
  // Amazon-style dark green chrome on home + product detail (mobile)
  const isMarketGreenHeader = isHomePage || isListingDetail;
  // Commission Promo — navy app chrome matching the referral earnings page.
  const isCommissionPromoPage = /^\/commission-promo\/?$/.test(location);
  const isNavyAppHeader = isCommissionPromoPage;
  const isSubscriptionPage = /^\/subscription\/?$/.test(location);
  // Mes Boosts — immersive campaign page (no site footer / bottom nav chrome).
  const isMyBoostsPage = /^\/(my-boosts|booster)(\/|$)/.test(location);
  // Cover regular navigation and Android's inline posting screen.
  const isSellPage = showInlineSell || /^\/sell\/?(?:\?.*)?$/.test(inlineRoute ?? location);
  const isPaymentOperations =
    location === "/admin/stripe-transactions"
    || location === "/admin/moncash-transactions";
  // Full enterprise admin console — hide marketplace chrome (bottom nav / storefront sidebar).
  const isAdminConsole = /^\/admin(?:\/|$)/.test(location);

  // Pages where the footer should NOT render (full-screen / chat-like UIs)
  // Transactional / immersive surfaces share the same chrome: no storefront footer.
  const noFooter = isSellPage || isAdminConsole || isMyBoostsPage || isCommissionPromoPage || [
    /^\/messages/,
    /^\/auth\//,
    /^\/cart\/?$/,
    /^\/checkout/,
    /^\/settings(?:\/|$)/,
    /^\/order-label\//,
    /^\/orders(?:\/|$)/,
    /^\/videos(?:\/(?:watch|favorites))?\/?$/,
    /^\/wallet/,
    /^\/subscription\/?$/,
    /^\/chatbot/,
    /^\/support/,
    /^\/calculator/,
    /^\/delivery\/apply/,
    /^\/delivery\/deliveries\/?$/,
    /^\/listings\/[^/]+/,
    /^\/profile\/\d+\/?$/,
    /^\/boost(?:\/|$)/,
    /^\/saved\/?$/,
    /^\/offers\/?$/,
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
        <div
          className="app-shell admin-console-shell w-full min-w-0 max-w-full overflow-x-hidden bg-background flex flex-col min-h-dvh"
          style={{
            // Keep shell below notch/status bar; AdminTopBar also pads for sticky header.
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
        >
          <AdminShell>{children}</AdminShell>
        </div>
      </DeliveryMenuCountryContext.Provider>
    );
  }

  // Seller Center (Add Product) — full-bleed chrome lives inside Sell.tsx.
  // Do NOT early-return when showInlineSell: that overlay is rendered further
  // down, and Android WebViews need a flex-height parent (not overflow-y-auto
  // on a fixed shell) so the action footer stays at the bottom.
  const isSellRoute = /^\/sell\/?(?:\?.*)?$/.test(inlineRoute ?? location);
  if (isSellRoute && !showInlineSell) {
    return (
      <DeliveryMenuCountryContext.Provider value={setDeliveryMenuCountry}>
        {/* Prefer svh so iOS URL-bar / home-indicator cannot clip the action footer. */}
        <div className="app-shell seller-center-shell w-full min-w-0 max-w-full overflow-hidden bg-[#F3F4F6] flex flex-col h-dvh max-h-dvh supports-[height:100svh]:h-svh supports-[height:100svh]:max-h-svh">
          {children}
        </div>
      </DeliveryMenuCountryContext.Provider>
    );
  }

  // Customer Smart Support / FlexaBot — immersive chat shell (no marketplace header,
  // no bottom nav, no storefront footer). Page owns its brand chrome.
  const isSupportImmersive = /^\/support(?:\/|$)/.test(location) || /^\/chatbot(?:\/|$)/.test(location);
  if (isSupportImmersive) {
    return (
      <DeliveryMenuCountryContext.Provider value={setDeliveryMenuCountry}>
        <div
          className="app-shell support-immersive-shell w-full min-w-0 max-w-full overflow-x-hidden bg-[#F4F7F5] flex flex-col h-dvh overflow-clip"
          style={{
            paddingTop: "env(safe-area-inset-top, 0px)",
            paddingBottom: "env(safe-area-inset-bottom, 0px)",
          }}
          data-testid="support-immersive-shell"
        >
          {children}
        </div>
      </DeliveryMenuCountryContext.Provider>
    );
  }

  return (
    <DeliveryMenuCountryContext.Provider value={setDeliveryMenuCountry}>
    <div className={`app-shell w-full min-w-0 max-w-full overflow-x-hidden flex flex-col ${isMessages || isPromoVideosSection ? "h-dvh overflow-clip" : "min-h-dvh"} ${isPromoVideosSection ? "bg-black" : isCommissionPromoPage ? "bg-[#0B1B3A]" : "bg-background"}`}>

      {/* ── Top header ── */}
      {/* Safe-area top inset is applied once via .mobile-app-header CSS
          (env(safe-area-inset-top), with --sat only as WebView fallback). */}
      {!isPromoVideosSection && (
        <header
          className={cn(
            "mobile-app-header sticky top-0 z-50 border-b shadow-sm md:pl-56",
            isMarketGreenHeader
              ? "bg-[hsl(152,65%,18%)] border-[hsl(152,65%,14%)] text-white"
              : isNavyAppHeader
                ? "bg-[#0B1B3A] border-[#0B1B3A] text-white"
                : "bg-card border-border",
          )}
        >
          <div className="mobile-app-header-row w-full max-w-7xl mx-auto flex items-center gap-2 md:h-16 md:px-3 md:max-h-none">
            {/* Hamburger — mobile menu (top left). Opens left drawer with all role menus. */}
            {!isCommissionPromoPage && (
              <button
                type="button"
                data-testid="nav-hamburger"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "md:hidden shrink-0 -ml-1 w-10 h-10 flex items-center justify-center rounded-full transition-colors",
                  isMarketGreenHeader || isNavyAppHeader ? "text-white hover:bg-white/10" : "text-foreground hover:bg-accent",
                )}
                aria-label={t("nav.menu")}
              >
                <Menu className="h-6 w-6" />
              </button>
            )}

            {showBackButton ? (
              <>
                <button
                  type="button"
                  onClick={handleBack}
                  className={cn(
                    "md:hidden shrink-0 w-9 h-9 flex items-center justify-center rounded-full transition-colors",
                    isMarketGreenHeader || isNavyAppHeader ? "hover:bg-white/10 text-white" : "hover:bg-accent text-foreground",
                  )}
                  aria-label={t("common.back")}
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                {/* On PDP / Commission Promo keep brand visible instead of long page title */}
                {isListingDetail || isCommissionPromoPage ? (
                  <Link href="/" className="md:hidden flex items-center gap-1.5 min-w-0 flex-1 text-white">
                    <img src="/flexa-logo-v2.png" alt="" className="h-8 w-auto" width="32" height="32" />
                    {isCommissionPromoPage ? (
                      <span className="font-bold text-[13px] truncate">
                        Flexa <span className="text-[#F97316]">Market</span>
                      </span>
                    ) : (
                      <span className="font-bold text-[13px] truncate text-white">Flexa Market</span>
                    )}
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
                      {t("nav.taglineShort")}
                    </span>
                  </div>
                </Link>
                <div className="hidden md:block flex-1 px-4">
                  <HeaderSearch marketStyle={isMarketGreenHeader} />
                </div>
              </>
            )}

            {/* Deliver to — desktop market chrome */}
            {isMarketGreenHeader && (
              <div
                className="hidden lg:flex items-center gap-1.5 shrink-0 max-w-[140px] xl:max-w-[180px] text-white/95 px-2 py-1 rounded-lg hover:bg-white/10"
                data-testid="header-deliver-to"
                title={user?.location || user?.country || undefined}
              >
                <MapPin className="h-4 w-4 shrink-0" />
                <div className="min-w-0 leading-tight">
                  <p className="text-[10px] text-white/75 truncate">{t("home.deliverTo", { defaultValue: "Deliver to" })}</p>
                  <p className="text-[12px] font-bold truncate">{user?.location || user?.country || "—"}</p>
                </div>
              </div>
            )}

            {/* Account */}
            {!isCommissionPromoPage && (
              <Link
                href={profileHref}
                className={cn(
                  "shrink-0 rounded-xl transition-colors flex items-center gap-1.5",
                  isMarketGreenHeader || isNavyAppHeader ? "text-white hover:bg-white/10 p-2" : "text-foreground hover:bg-muted p-2",
                )}
                aria-label={t("nav.account", { defaultValue: "Account" })}
                data-testid="header-account-icon"
              >
                <User className="h-5 w-5 shrink-0" />
                <span className="hidden xl:block text-[12px] font-semibold leading-tight max-w-[90px]">
                  {user
                    ? t("nav.account", { defaultValue: "Account" })
                    : t("nav.signIn", { defaultValue: "Sign In" })}
                </span>
              </Link>
            )}
            {user && <NotificationsDropdown light={isMarketGreenHeader || isNavyAppHeader} />}
            <CartIconButton light={isMarketGreenHeader || isNavyAppHeader} />
            <CommandPalette />
            <LanguageSwitcher className={cn("header-language-switcher shrink-0 hidden md:inline-flex", (isMarketGreenHeader || isNavyAppHeader) && "text-white")} />
            <div className={cn("hidden md:block", (isMarketGreenHeader || isNavyAppHeader) && "[&_button]:text-white [&_button:hover]:bg-white/10")}>
              {user ? <UserMenu onNavigate={handleMobileTab} /> : <GuestMenu />}
            </div>
          </div>

          {/* Secondary category nav — Amazon-style under green header */}
          {isMarketGreenHeader && marketCategories && marketCategories.length > 0 && (
            <div className="hidden md:block bg-[hsl(152,65%,14%)] border-t border-white/10">
              <div className="max-w-7xl mx-auto px-3 flex items-center gap-1 overflow-x-auto scrollbar-none h-10" data-testid="header-category-nav">
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  className="flex items-center gap-1.5 shrink-0 px-2.5 h-8 rounded-md text-white text-[13px] font-bold hover:bg-white/10"
                  data-testid="header-nav-all"
                >
                  <Menu className="h-4 w-4" />
                  {t("nav.all", { defaultValue: "All" })}
                </button>
                <Link
                  href="/search?boosted=true"
                  className="shrink-0 px-2.5 h-8 inline-flex items-center rounded-md text-white/95 text-[13px] font-semibold hover:bg-white/10"
                >
                  {t("home.todaysDeals", { defaultValue: "Today's Deals" })}
                </Link>
                {(marketCategories as Array<{ id: number; name: string; slug: string }>).slice(0, 10).map((cat) => (
                  <Link
                    key={cat.id}
                    href={`/search?category=${encodeURIComponent(cat.slug || cat.name)}`}
                    className="shrink-0 px-2.5 h-8 inline-flex items-center rounded-md text-white/90 text-[13px] font-medium hover:bg-white/10 whitespace-nowrap"
                  >
                    {t(`categories.${cat.slug}`, { defaultValue: cat.name })}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </header>
      )}

      {/* Push-notification one-time prompt */}
      {!isPromoVideosSection && <PushNotificationsBanner isLoggedIn={!!user} />}

      {/* Legacy password upgrade prompt */}
      {!isPromoVideosSection && <PasswordUpgradeBanner />}

      {/* Flex Card debt block — permanent until repaid (account stays usable) */}
      {!isPromoVideosSection && <FlexCardDebtBanner />}

      {/* Slow / offline connection notice */}
      {!isPromoVideosSection && <OfflineBar />}

      {/* ── Main content ── */}
      {/* pb-safe-nav = calc(56px + env(safe-area-inset-bottom)) so content
          never hides under the fixed bottom nav on any iPhone model. */}
      <main className={
        isMessages || isPromoVideosSection
          ? `app-main-immersive flex-1 overflow-clip flex flex-col min-h-0${isMessageThread ? " message-thread-main" : ""}${isPromoVideosSection ? "" : " md:pl-56"}`
          : `app-main-scroll flex-1 min-h-0 ${isListingDetail || isPaymentOperations || isSubscriptionPage || isMyBoostsPage || isSellPage ? "" : "pb-safe-nav"} md:pl-56`
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
              bottom-[calc(56px+max(env(safe-area-inset-bottom,0px),var(--flexa-android-bottom,0px))+12px)]
              md:bottom-5
            `}
          >
            <Calculator className="h-5 w-5 text-white" aria-hidden="true" />
          </button>
        </Link>
      )}

      {/* ── Mobile bottom nav (5 tabs) — hidden inside an active conversation ── */}
      <nav
        className={`mobile-bottom-nav fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-50 ${isMessageThread || isPromoVideosSection || isListingDetail || isPaymentOperations || isSubscriptionPage || isMyBoostsPage || isSellPage || /^\/support(?:\/|$)/.test(location) || /^\/chatbot(?:\/|$)/.test(location) ? "hidden" : ""}`}
        aria-label="Main navigation"
        data-testid="mobile-bottom-nav"
      >
        {/* Content row is a fixed ~56px strip. Safe-area padding is applied
            once on .mobile-bottom-nav (CSS) — never also in height here. */}
        <div className="mobile-bottom-nav-row w-full grid grid-cols-5">
          {tabs.map((tab) => {
            if ("isMore" in tab && tab.isMore) {
              return (
                <button
                  key="more"
                  type="button"
                  data-testid="nav-more"
                  onClick={() => setMoreOpen(true)}
                  className="min-w-0 h-full flex flex-col items-center justify-center gap-0.5"
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
                className="w-full min-w-0 h-full flex flex-col items-center justify-center gap-0.5"
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
        <div className="fixed inset-0 z-[70] flex flex-col h-dvh max-h-dvh overflow-hidden bg-background md:hidden supports-[height:100svh]:h-svh supports-[height:100svh]:max-h-svh">
          <div className="shrink-0 z-10 flex h-12 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur">
            <button
              type="button"
              aria-label={t("common.back")}
              onClick={() => setShowInlineSell(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-accent"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="font-semibold text-sm">{t("page.sell")}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <Suspense fallback={<div className="p-6 text-center text-muted-foreground">{t("common.loading")}</div>}>
              <InlineSell />
            </Suspense>
          </div>
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

      {/* ── Premium side menu drawer (hamburger / All) ── */}
      <PremiumSideMenu
        open={moreOpen}
        showDelivery={showDelivery}
        onClose={() => setMoreOpen(false)}
        onNavigate={handleMobileTab}
      />

      {/* ── Desktop sidebar ── */}
      <nav
        className={`${isPromoVideosSection ? "hidden" : "hidden md:flex"} fixed left-0 top-16 bottom-0 w-56 bg-background border-r border-border flex-col py-3 px-2.5 gap-0 z-40 overflow-y-auto`}
        aria-label="Sidebar navigation"
      >
        {desktopSections.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-2.5" : ""}>
            {section.heading && (
              <p className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[hsl(152,55%,28%)] dark:text-[hsl(152,40%,62%)]">
                {section.heading.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F]+\s*/u, "")}
              </p>
            )}
            <div className="rounded-xl border border-border/70 bg-card/60 overflow-hidden divide-y divide-border/50">
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
                      className={cn(
                        "relative w-full flex items-center gap-2.5 px-2.5 py-2 text-[13px] font-medium transition-all",
                        highlight
                          ? "bg-[hsl(152,65%,22%)] text-white hover:opacity-95"
                          : adminHighlight
                          ? active
                            ? "bg-[hsl(152,45%,92%)] text-[hsl(152,65%,18%)] font-semibold dark:bg-[hsl(152,40%,16%)] dark:text-[hsl(152,60%,78%)]"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          : active
                          ? "bg-[hsl(152,45%,92%)] text-[hsl(152,65%,18%)] font-semibold dark:bg-[hsl(152,40%,16%)] dark:text-[hsl(152,60%,78%)]"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      {active && !highlight && (
                        <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-[hsl(152,65%,28%)]" />
                      )}
                      <Icon className="h-3.5 w-3.5 shrink-0" />
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
