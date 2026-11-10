import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, BadgeCheck, Eye, Film, Loader2, Play, Plus, Search, ShoppingCart, Zap,
  Users, TrendingUp, BarChart3, ShieldCheck,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useAuth } from "@/contexts/auth";
import { formatPrice } from "@/lib/currency";
import PromoVideoPoster from "@/components/PromoVideoPoster";
import PromoVideosBottomNav, {
  PROMO_NAV_HEIGHT_CSS,
} from "@/components/PromoVideosBottomNav";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { useAdminCountry } from "@/contexts/admin-country";
import { useShoppingLocation } from "@/contexts/shopping-location";
import { MobileSelect } from "@/components/ui/mobile-select";
import { adminVideoFeedParamsKey } from "@/lib/adminCountryAccess";

export type DiscoverSort = "all" | "trending" | "new" | "mine";

type DiscoverVideo = {
  id: number;
  videoUrl: string;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  price: number;
  currency: string | null;
  country?: string | null;
  sellerId: number | null;
  sellerName: string;
  sellerAvatar: string | null;
  sellerIsVerified: boolean;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isVideoOnly: boolean;
  boostEndAt: string | null;
  boostStartAt: string | null;
};

const SCROLL_KEY = "fm_video_discover_scroll";
const SEED_KEY = "fm_video_discover_seed";
const STATE_KEY = "fm_video_discover_state";

function formatViews(n: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
  } catch {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
    return String(n);
  }
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return null;
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function isLiveBoost(v: DiscoverVideo): boolean {
  if (!v.boostEndAt) return true;
  return new Date(v.boostEndAt).getTime() > Date.now();
}

export default function VideoDiscover() {
  const { t, i18n } = useTranslation();
  useSEO({ title: t("videoFeed.title"), description: t("tr.videoFeedSeoDesc"), path: "/videos" });
  const [, navigate] = useLocation();
  const { token, user } = useAuth();
  const { country: shoppingCountry } = useShoppingLocation();
  const browsingCountry = user?.country ?? shoppingCountry ?? null;
  const {
    selectedCountry: adminCountry,
    setSelectedCountry: setAdminCountry,
    effectiveCountry,
    videoFeedParams,
    showCountryFlags,
    canSelectAll,
    pickerCountries,
    isAdminViewer,
    isSuperAdmin,
    isMultiCountryAdmin,
  } = useAdminCountry();
  const [allVideosMode, setAllVideosMode] = useState(false);
  const [scopeBannerDismissed, setScopeBannerDismissed] = useState(false);
  // Viewing worldwide / multi-country union → show flags on each card.
  const canViewAllCountries = showCountryFlags || (isAdminViewer && !effectiveCountry);

  useEffect(() => {
    if (isAndroidApp() || /Android/i.test(navigator.userAgent)) {
      document.documentElement.style.setProperty("--flexa-android-bottom", "48px");
    }
  }, []);

  const [sort, setSort] = useState<DiscoverSort>(() => {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { sort?: DiscoverSort };
        if (parsed.sort && ["all", "trending", "new", "mine"].includes(parsed.sort)) return parsed.sort;
      }
    } catch { /* ok */ }
    return "all";
  });
  const [query, setQuery] = useState(() => {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (raw) return (JSON.parse(raw) as { q?: string }).q ?? "";
    } catch { /* ok */ }
    return "";
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [videos, setVideos] = useState<DiscoverVideo[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalHint, setTotalHint] = useState(0);
  const [durations, setDurations] = useState<Record<number, number>>({});
  const [activeCampaignCount, setActiveCampaignCount] = useState(0);

  const seedRef = useRef<number>(0);
  if (seedRef.current === 0) {
    try {
      const existing = sessionStorage.getItem(SEED_KEY);
      const n = existing ? parseInt(existing, 10) : NaN;
      if (Number.isFinite(n) && n > 0) {
        seedRef.current = n;
      } else {
        seedRef.current = Math.floor(Math.random() * 1_000_000) + 1;
        sessionStorage.setItem(SEED_KEY, String(seedRef.current));
      }
    } catch {
      seedRef.current = Math.floor(Math.random() * 1_000_000) + 1;
    }
  }

  const scrollRootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedQ, setDebouncedQ] = useState(query);

  // Deep-link: /videos?video=ID → fullscreen watch (preserve legacy Home links)
  // Also restore sort/q from query when returning from the watch player.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const videoId = parseInt(params.get("video") ?? "", 10);
    const sortParam = params.get("sort")?.trim().toLowerCase();
    const qParam = params.get("q") ?? "";
    if (sortParam && ["all", "trending", "new", "mine"].includes(sortParam)) {
      setSort(sortParam as DiscoverSort);
    }
    if (qParam) {
      setQuery(qParam);
      setSearchOpen(true);
    }
    if (Number.isFinite(videoId) && videoId > 0) {
      const country = params.get("country");
      let url = `/videos/watch?video=${videoId}&sort=${encodeURIComponent(sortParam || sort)}&seed=${seedRef.current}`;
      if (qParam) url += `&q=${encodeURIComponent(qParam)}`;
      if (country) url += `&country=${encodeURIComponent(country)}`;
      navigate(url, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(query.trim()), 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    if (!token) { setActiveCampaignCount(0); return; }
    let cancelled = false;
    fetch("/api/booster/campaigns", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const list = Array.isArray(d.campaigns) ? d.campaigns : [];
        setActiveCampaignCount(list.filter((c: { status?: string }) => c.status === "active").length);
      })
      .catch(() => { if (!cancelled) setActiveCampaignCount(0); });
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify({ sort, q: query }));
    } catch { /* ok */ }
  }, [sort, query]);

  const fetchPage = useCallback(async (p: number, replace: boolean) => {
    if (replace) setLoading(true); else setLoadingMore(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const params = new URLSearchParams({
        page: String(p),
        limit: "12",
        seed: String(seedRef.current),
        sort,
      });
      if (debouncedQ) params.set("q", debouncedQ);
      // Centralized admin country context drives the feed scope.
      // Specific country → ?country=X. All Countries (SA/global) → allCountries=1.
      // Multi-country All → omit both (server returns assigned union).
      if (videoFeedParams.country) params.set("country", videoFeedParams.country);
      if (videoFeedParams.allCountries) params.set("allCountries", videoFeedParams.allCountries);
      // Guests: pass browsing/shopping country so the feed matches their selection.
      // Authenticated non-admins are scoped server-side to account country (param ignored).
      if (!user && !isAdminViewer && browsingCountry && !videoFeedParams.country) {
        params.set("country", browsingCountry);
      }
      // "All Videos" chip for non-admin users opens watch; for admins already scoped
      // by videoFeedParams — do not force worldwide over a specific country pick.
      if (allVideosMode && !videoFeedParams.country && (isSuperAdmin || canSelectAll)) {
        params.set("allCountries", "1");
      }
      const res = await fetch(`/api/videos/feed?${params}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      // Public Discover tabs only keep live boosts. My Videos is the owner
      // library — include expired so the creator (and SA for their uploads)
      // can still open and re-boost without re-uploading.
      const incoming: DiscoverVideo[] = (data.videos ?? []).filter((v: DiscoverVideo) =>
        sort === "mine" ? true : isLiveBoost(v),
      );
      if (replace) {
        setVideos(incoming);
        // Prefer server total when present so All (N) matches filtered results.
        const serverTotal = typeof data.total === "number" && Number.isFinite(data.total)
          ? Math.max(0, data.total)
          : null;
        setTotalHint(serverTotal ?? (incoming.length + (data.hasMore ? 1 : 0)));
      } else {
        setVideos(prev => {
          const seen = new Set(prev.map(v => v.id));
          return [...prev, ...incoming.filter(v => !seen.has(v.id))];
        });
      }
      setHasMore(!!data.hasMore);
      setPage(p);
    } catch { /* non-critical */ } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [token, user, browsingCountry, isAdminViewer, sort, debouncedQ, videoFeedParams, allVideosMode, isSuperAdmin, canSelectAll]);

  const feedScopeKey = adminVideoFeedParamsKey(videoFeedParams);

  useEffect(() => {
    setVideos([]);
    setHasMore(true);
    setTotalHint(0);
    void fetchPage(1, true);
  }, [fetchPage, feedScopeKey]);

  // Restore grid scroll after returning from watch (inner scroller — not window)
  useEffect(() => {
    if (loading) return;
    try {
      const y = parseInt(sessionStorage.getItem(SCROLL_KEY) ?? "", 10);
      if (Number.isFinite(y) && y > 0) {
        requestAnimationFrame(() => {
          scrollRootRef.current?.scrollTo?.(0, y);
        });
      }
    } catch { /* ok */ }
  }, [loading, videos.length]);

  useEffect(() => {
    const el = scrollRootRef.current;
    if (!el) return;
    const onScroll = () => {
      try {
        sessionStorage.setItem(SCROLL_KEY, String(el.scrollTop || 0));
      } catch { /* ok */ }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // Infinite scroll against the Discover scroller (not the clipped window)
  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollRootRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting) && !loading && !loadingMore && hasMore) {
        void fetchPage(page + 1, false);
      }
    }, { root: root ?? null, rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchPage, hasMore, loading, loadingMore, page]);

  // Probe durations lazily for badges (real metadata only)
  useEffect(() => {
    videos.slice(0, 24).forEach((v) => {
      if (durations[v.id] || !v.videoUrl) return;
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.src = v.videoUrl;
      const onMeta = () => {
        if (Number.isFinite(video.duration) && video.duration > 0) {
          setDurations(prev => (prev[v.id] ? prev : { ...prev, [v.id]: video.duration }));
        }
        video.removeAttribute("src");
        video.load();
      };
      video.addEventListener("loadedmetadata", onMeta, { once: true });
    });
  }, [videos, durations]);

  const openWatch = (videoId?: number) => {
    try {
      sessionStorage.setItem(SCROLL_KEY, String(scrollRootRef.current?.scrollTop || 0));
      sessionStorage.setItem(SEED_KEY, String(seedRef.current));
    } catch { /* ok */ }
    const params = new URLSearchParams({
      sort: videoId ? sort : "all",
      seed: String(seedRef.current),
    });
    if (videoId) params.set("video", String(videoId));
    if (debouncedQ) params.set("q", debouncedQ);
    if (videoFeedParams.country) params.set("country", videoFeedParams.country);
    if (videoFeedParams.allCountries) params.set("allCountries", videoFeedParams.allCountries);
    if (!user && !isAdminViewer && browsingCountry && !videoFeedParams.country) {
      params.set("country", browsingCountry);
    }
    navigate(`/videos/watch?${params}`);
  };

  const activateAllVideos = () => {
    setAllVideosMode(true);
    setScopeBannerDismissed(false);
    setSort("all");
    // Admins who can view multiple countries stay on the grid.
    // Everyone else: open the fullscreen feed (existing All Videos behavior).
    if (!(isAdminViewer && canSelectAll)) {
      openWatch();
    }
  };

  const filters = useMemo(() => ([
    { id: "all" as const, label: t("videoFeed.filterAll", { defaultValue: "All" }), count: sort === "all" && !allVideosMode ? Math.max(totalHint, videos.length) : undefined },
    { id: "trending" as const, label: t("videoFeed.filterTrending", { defaultValue: "🔥 Trending" }) },
    { id: "new" as const, label: t("videoFeed.filterNew", { defaultValue: "✨ New" }) },
    { id: "mine" as const, label: t("videoFeed.filterMine", { defaultValue: "📹 My Videos" }) },
    {
      id: "all-videos" as const,
      label: t("videoFeed.filterAllVideos", { defaultValue: "All Videos" }),
      allVideos: true as const,
    },
  ]), [t, sort, totalHint, videos.length, allVideosMode]);

  const emptyTitle = sort === "mine"
    ? t("videoFeed.emptyMineTitle", { defaultValue: "You have no active promotional videos" })
    : t("videoFeed.emptyTitle");
  const emptyDesc = sort === "mine"
    ? t("videoFeed.emptyMineDesc", { defaultValue: "Boost a product video to appear here while the campaign is active." })
    : t("videoFeed.emptyDesc");

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-background text-foreground"
      data-testid="video-discover-page"
    >
      {/* Own header — marketplace Layout chrome is hidden on /videos* */}
      <div
        className="shrink-0 z-30 border-b border-border/70 bg-white/95 dark:bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/"))}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
            aria-label={t("common.back", { defaultValue: "Back" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(152,65%,18%)] text-white shrink-0">
            <Play className="h-3.5 w-3.5 fill-white ml-0.5" />
          </div>
          <h1 className="flex-1 truncate text-[15px] font-black tracking-tight text-foreground">
            {t("videoFeed.title")}
          </h1>
          <button
            type="button"
            onClick={() => setSearchOpen(v => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
            aria-label={t("common.search", { defaultValue: "Search" })}
          >
            <Search className="h-5 w-5" />
          </button>
        </div>

        {searchOpen && (
          <div className="mx-auto max-w-5xl px-3 pb-2.5">
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t("videoFeed.searchPlaceholder", { defaultValue: "Search promotional videos…" })}
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:border-[hsl(152,65%,18%)] focus:ring-1 focus:ring-[hsl(152,65%,18%)]/30"
            />
          </div>
        )}

        <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-3 pb-3 scrollbar-none">
          {filters.map(f => {
            const isAllVideos = "allVideos" in f && f.allVideos;
            const active = isAllVideos
              ? allVideosMode
              : (!allVideosMode && sort === f.id);
            const label = f.id === "all" && typeof f.count === "number"
              ? `${t("videoFeed.filterAll", { defaultValue: "All" })} (${Math.max(f.count, videos.length)})`
              : isAllVideos && allVideosMode && canViewAllCountries
                ? `${t("videoFeed.filterAllVideos", { defaultValue: "All Videos" })} (${Math.max(totalHint, videos.length)})`
                : f.label;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  if (isAllVideos) {
                    activateAllVideos();
                    return;
                  }
                  if (f.id === "mine" && !user) {
                    navigate("/auth/login");
                    return;
                  }
                  setAllVideosMode(false);
                  setSort(f.id as DiscoverSort);
                }}
                className={cn(
                  "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] font-bold transition-colors",
                  active
                    ? "border-[hsl(152,65%,18%)] bg-[hsl(152,65%,18%)] text-white"
                    : "border-border bg-white text-foreground hover:bg-muted/60 dark:bg-card",
                )}
                data-testid={`video-filter-${f.id}`}
                aria-label={isAllVideos
                  ? t("videoFeed.filterAllVideos", { defaultValue: "All Videos" })
                  : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={scrollRootRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain touch-pan-y"
        data-testid="video-discover-scroll"
      >
      <div
        className="mx-auto max-w-5xl px-3 pt-3"
        style={{ paddingBottom: `calc(${PROMO_NAV_HEIGHT_CSS} + 24px)` }}
      >
        {!isAdminViewer && browsingCountry && (
          <div
            className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
            data-testid="promo-user-country-banner"
          >
            <span className="text-sm font-black">
              {t("videoFeed.yourCountry", { defaultValue: "Your Country" })}:
            </span>
            <span className="text-sm font-semibold">
              {COUNTRY_FLAGS[browsingCountry] ?? ""} {browsingCountry}
            </span>
          </div>
        )}
        {isAdminViewer && canSelectAll && (
          <div
            className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-100"
            data-testid="promo-admin-country-picker"
          >
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 text-violet-500" />
              <span className="text-sm font-black">
                {t("home.adminView", "Admin View")}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-violet-800/90 dark:text-violet-200/90">
                — {effectiveCountry
                  ? `${COUNTRY_FLAGS[effectiveCountry] ?? ""} ${effectiveCountry}`
                  : t("home.allCountriesDesc", "All Countries")}
              </span>
            </div>
            <MobileSelect
              value={adminCountry ?? "all"}
              onValueChange={v => setAdminCountry(v === "all" ? null : v)}
              placeholder={`🌍 ${t("home.allCountriesDesc", "All Countries")}`}
              options={[
                { value: "all", label: `🌍 ${t("home.allCountriesDesc", "All Countries")}` },
                ...pickerCountries.map(c => ({ value: c, label: `${COUNTRY_FLAGS[c] ?? ""} ${c}` })),
              ]}
              className="h-9 w-full text-sm"
              data-testid="select-promo-admin-country"
            />
          </div>
        )}
        {isAdminViewer && !effectiveCountry && !scopeBannerDismissed && (allVideosMode || canSelectAll) && (
          <div
            className="mb-4 flex items-start gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-100"
            data-testid="all-videos-sa-banner"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-black">
                {t("videoFeed.allVideosAdminTitle", {
                  defaultValue: isSuperAdmin
                    ? "👑 All Videos — All Countries (Super Admin)"
                    : isMultiCountryAdmin
                      ? "👑 All Videos — Authorized Countries"
                      : "👑 All Videos — All Countries",
                })}
              </div>
              <p className="mt-0.5 text-[12px] text-violet-800/90 dark:text-violet-200/90">
                {t("videoFeed.allVideosAdminDesc", {
                  defaultValue: isMultiCountryAdmin
                    ? "You are viewing promotional videos from your authorized countries only."
                    : "You are viewing promotional videos from all countries. Your registered account country is unchanged.",
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setScopeBannerDismissed(true)}
              className="shrink-0 rounded-full px-2 py-1 text-sm font-bold text-violet-700 hover:bg-violet-100 dark:text-violet-200 dark:hover:bg-violet-900/40"
              aria-label={t("common.close", { defaultValue: "Close" })}
            >
              ×
            </button>
          </div>
        )}
        <div className="mb-4 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Eye, label: t("videoFeed.quickMoreViews", { defaultValue: "More Views" }) },
                { icon: Users, label: t("videoFeed.quickMoreCustomers", { defaultValue: "More Customers" }) },
                { icon: TrendingUp, label: t("videoFeed.quickGrow", { defaultValue: "Grow Your Business" }) },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="rounded-2xl border border-border/70 bg-white dark:bg-card px-2 py-3 text-center">
                  <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-violet-50 text-violet-700 dark:bg-violet-950/40">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="text-[11px] font-bold leading-tight text-foreground">{label}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => navigate(user ? "/booster/create" : "/auth/login")}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3.5 text-sm font-black text-white shadow-md hover:bg-violet-800"
              data-testid="button-create-promo-video"
            >
              <Plus className="h-4 w-4" />
              {t("videoFeed.createPromo", { defaultValue: "Create Promotional Video" })}
            </button>
            <button
              type="button"
              onClick={() => navigate(user ? "/booster" : "/auth/login")}
              className="flex w-full items-center justify-between rounded-2xl border border-border/70 bg-white px-4 py-3 text-left dark:bg-card"
              data-testid="button-my-video-campaigns"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700 dark:bg-violet-950/40">
                  <BarChart3 className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-foreground truncate">
                    {t("videoFeed.myCampaigns", { defaultValue: "My Video Campaigns" })}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {t("videoFeed.activeCount", {
                      defaultValue: "{{count}} Active",
                      count: activeCampaignCount,
                    })}
                  </div>
                </div>
              </div>
              <Zap className="h-4 w-4 text-violet-600 shrink-0" />
            </button>
          </div>

        {loading && videos.length === 0 ? (
          <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center px-6 text-center" data-testid="video-discover-empty">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-50 dark:bg-emerald-950/40">
              <Film className="h-10 w-10 text-[hsl(152,65%,18%)]" />
            </div>
            <h2 className="text-lg font-black text-foreground">{emptyTitle}</h2>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">{emptyDesc}</p>
            {isAdminViewer && canSelectAll && effectiveCountry && (
              <button
                type="button"
                onClick={() => setAdminCountry(null)}
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-5 py-3 text-sm font-black text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
                data-testid="button-promo-all-countries"
              >
                🌍 {t("home.allCountriesDesc", "All Countries")}
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/booster/create")}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[hsl(152,65%,18%)] px-5 py-3 text-sm font-black text-white shadow-md"
            >
              <Zap className="h-4 w-4" />
              {t("videoFeed.emptyCta")}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
            {videos.map(v => {
              const duration = formatDuration(durations[v.id]);
              const canBuy = !v.isVideoOnly && typeof v.price === "number" && v.price > 0;
              return (
                <article
                  key={v.id}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-border/70 bg-white dark:bg-card shadow-sm"
                  data-testid={`video-card-${v.id}`}
                >
                  <button
                    type="button"
                    onClick={() => openWatch(v.id)}
                    className="relative aspect-[3/4] w-full overflow-hidden bg-muted text-left"
                  >
                    <PromoVideoPoster
                      videoUrl={v.videoUrl}
                      thumbnailUrl={v.thumbnailUrl}
                      title={v.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
                    {duration && (
                      <span className="absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                        {duration}
                      </span>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/70 bg-black/25 backdrop-blur-sm">
                        <Play className="h-5 w-5 fill-white text-white ml-0.5" />
                      </span>
                    </span>
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-violet-700 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                      {t("boostAd.sponsored", { defaultValue: t("videoFeed.promoBadge") })}
                    </span>
                    {(isAdminViewer || showCountryFlags || canViewAllCountries) && v.country && (
                      <span className="absolute top-2 right-2 inline-flex items-center rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                        {COUNTRY_FLAGS[v.country] ?? "🌍"} {v.country}
                      </span>
                    )}
                  </button>

                  <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                    <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">{v.title}</h3>
                    {v.sellerId ? (
                      <Link
                        href={`/videos/profile/${v.sellerId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 min-w-0"
                        data-testid={`discover-seller-${v.sellerId}`}
                      >
                        <Avatar className="h-5 w-5 shrink-0">
                          <AvatarImage src={v.sellerAvatar ?? undefined} />
                          <AvatarFallback className="text-[9px] bg-[hsl(152,65%,18%)] text-white">
                            {(v.sellerName || "?")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-[11px] font-semibold text-muted-foreground">{v.sellerName}</span>
                        {v.sellerIsVerified && (
                          <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        )}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Avatar className="h-5 w-5 shrink-0">
                          <AvatarImage src={v.sellerAvatar ?? undefined} />
                          <AvatarFallback className="text-[9px] bg-[hsl(152,65%,18%)] text-white">
                            {(v.sellerName || "?")[0]?.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate text-[11px] font-semibold text-muted-foreground">{v.sellerName}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Eye className="h-3 w-3" />
                      <span className="tabular-nums">{formatViews(v.viewCount, i18n.language)} {t("videoFeed.views")}</span>
                      {v.likeCount > 0 && (
                        <>
                          <span className="opacity-40">·</span>
                          <span className="tabular-nums">{formatViews(v.likeCount, i18n.language)} ♥</span>
                        </>
                      )}
                    </div>
                    {canBuy && (
                      <Link
                        href={`/listings/${v.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-lg border border-[hsl(152,65%,18%)] px-2 py-1.5 text-[11px] font-bold text-[hsl(152,65%,18%)] hover:bg-emerald-50"
                      >
                        <ShoppingCart className="h-3.5 w-3.5" />
                        {t("videoFeed.buy")}
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div ref={sentinelRef} className="h-8" />
        {loadingMore && (
          <div className="flex justify-center py-4 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {/* Boost CTA section */}
        {videos.length > 0 && (
          <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/70 dark:bg-emerald-950/20 dark:border-emerald-900/40 p-5 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm dark:bg-card">
              <Film className="h-7 w-7 text-[hsl(152,65%,18%)]" />
            </div>
            <h2 className="text-base font-black text-foreground">
              {t("videoFeed.boostSectionTitle", { defaultValue: "Boost your videos" })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("videoFeed.boostSectionDesc", { defaultValue: "Increase product visibility with a promotional video." })}
            </p>
            <button
              type="button"
              onClick={() => navigate("/booster/create")}
              className="mt-4 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-black text-white hover:bg-violet-800"
              data-testid="button-boost-video"
            >
              <Zap className="h-4 w-4" />
              {t("videoFeed.boostSectionCta", { defaultValue: "Boost your video to appear here" })}
            </button>
          </div>
        )}
      </div>
      </div>

      <PromoVideosBottomNav
        active="discover"
        onAdd={() => navigate(user ? "/booster/create" : "/auth/login?next=%2Fbooster%2Fcreate")}
      />

    </div>
  );
}
