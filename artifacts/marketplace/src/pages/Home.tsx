import { useEffect, useRef, useState, useMemo, useCallback, useContext } from "react";
import { DeliveryMenuCountryContext } from "@/contexts/delivery-navigation";
import { useSEO } from "@/hooks/useSEO";
import { Link, useLocation } from "wouter";

import { Search, ChevronRight, Package, MapPin, Navigation, ShieldCheck, X, RefreshCw, ChevronDown, Pencil, CheckCircle2, Loader2, Play, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetCategories } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useShoppingLocation } from "@/contexts/shopping-location";
import ListingCard from "@/components/ListingCard";
import TodaysDealCard from "@/components/TodaysDealCard";
import PromoVideoPoster from "@/components/PromoVideoPoster";
import {
  HOME_PROMO_VIDEO_CARD_LIMIT,
  HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT,
  selectHomePromoVideos,
} from "@/lib/boostAdControls";
import { selectTodaysDealSlots } from "@/lib/todaysDeals";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { MobileSelect } from "@/components/ui/mobile-select";
import { buildWebsiteJsonLd, SEO_BRAND_NAME } from "@/lib/seoBrand";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  getPromaxNextPageParam,
  getRenderablePromaxGroup,
  isPromaxSnapshotExpiredError,
  serializePromaxPageParam,
  type PromaxFeedPage,
  type PromaxPageParam,
} from "@/lib/promaxPagination";
import {
  haversineKm,
  reverseGeocode,
  matchCityToKnownList,
  loadCachedPosition,
  saveCachedPosition,
  loadLocationMode,
  saveLocationMode,
  type LocationMode,
} from "@/lib/geocoding";

type Scope = "nearby" | "city" | "country";

import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES, citiesFor } from "@/lib/countries";
import { parseAdminScopeCountriesList } from "@/lib/adminCountryAccess";
import { useAdminCountry } from "@/contexts/admin-country";
import { formatPrice } from "@/lib/currency";

function formatPriceHome(listing: { price: number; country?: string | null; currency?: string | null }) {
  return formatPrice(listing.price, listing.country, listing.currency);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type NormalListing = {
  id: number;
  title: string;
  description?: string | null;
  price: number;
  currency?: string | null;
  images: string[];
  location: string;
  city?: string | null;
  country?: string | null;
  condition: string;
  isBoosted: boolean;
  boostExpiresAt?: string | null;
  isFeatured?: boolean;
  boostVideoUrl?: string | null;
  listingVideoUrl?: string | null;
  moderationStatus?: string | null;
  lifecycleStatus?: string | null;
  promaxGroup?: "booster_vip" | "booster_ordinary" | "vip" | "ordinary" | null;
  promaxPosition?: number | null;
  status: string;
  sellerName: string;
  sellerRating: number;
  sellerIsVerified: boolean;
  favoriteCount: number;
  viewCount?: number;
  sharesCount?: number;
  isFavorited?: boolean;
  createdAt: string;
  category?: string | null;
  categoryIcon?: string | null;
  subcategory?: string | null;
  categorySlug?: string | null;
  sellerId?: number;
  distanceKm?: number | null;
  proximityLevel?: string | null;
  nearYou?: boolean;
};

// ─── Video promo grid items ───────────────────────────────────────────────────
// Active boosted videos participate in the same continuous grid as products so
// they never reserve a separate row or leave product-sized holes beside them.

interface PromoVideoItem {
  id: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  sellerName: string;
  boostEndAt: string | null;
  createdAt?: string | null;
  boostStartAt?: string | null;
}

function VideoPromoSection({ countryFilter }: { countryFilter: string | null }) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [videos, setVideos] = useState<PromoVideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      // Bound preview query + hard-cap selection so Home never paints >2 cards.
      const params = new URLSearchParams({
        page: "1",
        limit: String(HOME_PROMO_VIDEO_PREVIEW_QUERY_LIMIT),
        sort: "new",
      });
      if (countryFilter) params.set("country", countryFilter);
      const res = await fetch(`/api/videos/feed?${params}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      setVideos(
        selectHomePromoVideos(
          (data.videos ?? []) as PromoVideoItem[],
          HOME_PROMO_VIDEO_CARD_LIMIT,
        ),
      );
    } catch { /* non-critical */ } finally {
      setLoading(false);
    }
  }, [token, countryFilter]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 2 * 60_000);
    return () => clearInterval(poll);
  }, [load]);

  // Belt-and-suspenders: never render more than the Home hard cap, even if
  // state somehow holds a larger array (stale cache, race, etc.).
  const cards = videos.slice(0, HOME_PROMO_VIDEO_CARD_LIMIT);

  if (loading) {
    return (
      <section
        data-testid="home-promo-video-strip"
        data-promo-card-limit={HOME_PROMO_VIDEO_CARD_LIMIT}
        aria-busy="true"
        aria-label={t("home.videoPromo", { defaultValue: "Video Promo" })}
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {Array.from({ length: HOME_PROMO_VIDEO_CARD_LIMIT }).map((_, i) => (
            <Skeleton
              key={`promo-skel-${i}`}
              className="min-h-[360px] w-full rounded-2xl md:min-h-[420px]"
              data-testid="home-promo-video-skeleton"
            />
          ))}
        </div>
      </section>
    );
  }

  if (cards.length === 0) return null;

  return (
    <section
      data-testid="home-promo-video-strip"
      data-promo-card-count={cards.length}
      data-promo-card-limit={HOME_PROMO_VIDEO_CARD_LIMIT}
      aria-label={t("home.videoPromo", { defaultValue: "Video Promo" })}
    >
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
        {cards.map((v) => (
          <Link
            key={`promo-video-${v.id}`}
            href={`/videos?video=${v.id}`}
            className="group relative block h-full min-h-[360px] w-full overflow-hidden rounded-2xl bg-black shadow-lg transition-transform duration-300 hover:scale-[1.015] active:scale-[0.98] md:min-h-[420px]"
            style={{ textDecoration: "none" }}
            data-testid={`button-promo-video-${v.id}`}
            data-home-promo-video-card="true"
            data-promax-group="video_promo"
          >
            <PromoVideoPoster
              videoUrl={v.videoUrl}
              thumbnailUrl={v.thumbnailUrl}
              title={v.title}
              className="transition-transform duration-700 group-hover:scale-105"
            />

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/15 to-black/25 transition-colors group-hover:via-black/30" />

            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-black/25 shadow-xl backdrop-blur-md transition-transform group-hover:scale-110">
                <Play className="h-5 w-5 text-white fill-white ml-0.5" />
              </div>
            </div>

            {/* Sponsored badge */}
            <div className="absolute left-2 top-2 flex flex-wrap gap-1">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-primary/80 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white backdrop-blur-md">
                <Video className="h-3 w-3" />
                {t("home.videoPromo", { defaultValue: "Video Promo" })}
              </span>
              <span className="rounded-full border border-white/25 bg-black/35 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white backdrop-blur-md">
                {t("boostAd.sponsored", { defaultValue: "Sponsored" })}
              </span>
            </div>

            {/* Title at bottom */}
            <div className="absolute bottom-0 inset-x-0 px-3 pb-3">
              {v.sellerName && (
                <p className="mb-1 truncate text-[10px] font-semibold text-white/70">@{v.sellerName}</p>
              )}
              <p className="line-clamp-2 text-sm font-black leading-tight text-white">{v.title}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // Guests without GPS use country-wide discovery; logged-in shoppers keep city-first.
  const [scope, setScope] = useState<Scope>(() => (typeof window !== "undefined" && !localStorage.getItem("flexamarket_token") ? "country" : "city"));
  const { user, refreshUser } = useAuth();
  const {
    country: shoppingCountry,
    city: shoppingCity,
    guestLocation,
    setGuestCountry,
    setGuestCity,
  } = useShoppingLocation();
  const { t, i18n } = useTranslation();
  const homeSeoJsonLd = useMemo(
    () =>
      buildWebsiteJsonLd({
        name: t("seo.homeHeading", { defaultValue: SEO_BRAND_NAME }),
        description: t("seo.homeDescription"),
        inLanguage: [i18n.language?.split("-")[0] || "en", "en", "ht", "fr"],
      }),
    [t, i18n.language],
  );
  useSEO({
    title: t("seo.homeTitle"),
    description: t("seo.homeDescription"),
    path: "/",
    absoluteTitle: true,
    jsonLd: homeSeoJsonLd,
  });
  const queryClient = useQueryClient();
  const {
    selectedCountry: adminCountry,
    setSelectedCountry: setAdminCountry,
    effectiveCountry: effectiveAdminCountry,
    pickerCountries,
    canSelectAll,
    isAdminViewer: isAdmin,
    isSuperAdmin,
    isGlobalAdmin,
    isMultiCountryAdmin,
  } = useAdminCountry();

  // Flexa Fanmi is exclusive to users with an active paid subscription
  const hasActiveSubscription = !!(
    user &&
    ['standard', 'premium', 'vip'].includes(user.subscriptionPlan ?? '') &&
    user.subscriptionExpiresAt &&
    new Date(user.subscriptionExpiresAt) > new Date()
  );
  // Parse multi-country scope list from JWT / user profile
  const adminScopeCountriesList = parseAdminScopeCountriesList(user);
  // scopeLock: only for single-country admin; multi/global/super use a picker
  const scopeLock: string | null = (isSuperAdmin || isGlobalAdmin || isMultiCountryAdmin)
    ? null
    : (adminScopeCountriesList[0] ?? (user as any)?.adminScopeCountry ?? user?.country ?? null);
  const setDeliveryMenuCountry = useContext(DeliveryMenuCountryContext);
  useEffect(() => {
    setDeliveryMenuCountry(isAdmin ? effectiveAdminCountry : undefined);
    return () => setDeliveryMenuCountry(undefined);
  }, [isAdmin, effectiveAdminCountry, setDeliveryMenuCountry]);
  // Logged-in shoppers use profile country; guests use detected/manual shopping destination
  const activeCountry = user?.country ?? shoppingCountry;

  // ── Location detection state ──
  const [locationMode, setLocationModeState] = useState<LocationMode>("auto");
  const [gpsDetecting, setGpsDetecting] = useState(false);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const detectingRef = useRef(false);
  const hasGps = !!(user && (user as any).latitude != null && (user as any).longitude != null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const feedFilterKey = `${activeCategory ?? "all"}__${isAdmin ? `admin-${effectiveAdminCountry ?? "all"}` : scope}__${activeCountry ?? "none"}`;

  // ── Queries ──
  const { data: categories } = useGetCategories();

  // ── Infinite scroll feed ──
  const {
    data: feedPages,
    isLoading: feedLoading,
    error: feedError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["listings-infinite", feedFilterKey],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam.page),
        limit: "20",
        ...(activeCategory ? { category: activeCategory } : {}),
        // When a category is selected, skip scope/proximity filtering so we
        // show all country-wide results in that category (not just nearby).
        // Without this, city-scoped queries return 0 if no local results exist.
        ...(isAdmin
          ? effectiveAdminCountry ? { country: effectiveAdminCountry } : {}
          : {
              ...(activeCountry ? { country: activeCountry } : {}),
              ...(!activeCategory && scope !== "country" ? { scope } : {}),
            }),
      });
      const frozenPromaxParams = serializePromaxPageParam(pageParam);
      if (frozenPromaxParams.hourKey) params.set("hourKey", frozenPromaxParams.hourKey);
      if (frozenPromaxParams.demotedIds) {
        params.set("promaxDemotedIds", frozenPromaxParams.demotedIds);
      }
      if (frozenPromaxParams.demotionsPinned) {
        params.set("promaxDemotionsPinned", frozenPromaxParams.demotionsPinned);
      }
      if (frozenPromaxParams.freshIds) {
        params.set("promaxFreshIds", frozenPromaxParams.freshIds);
      }
      if (frozenPromaxParams.freshIdsPinned) {
        params.set("promaxFreshIdsPinned", frozenPromaxParams.freshIdsPinned);
      }
      if (frozenPromaxParams.resolvedScope) {
        params.set("promaxResolvedScope", frozenPromaxParams.resolvedScope);
      }
      if (frozenPromaxParams.promaxDisabled) {
        params.set("promaxDisabled", frozenPromaxParams.promaxDisabled);
      }
      return apiFetch<PromaxFeedPage<NormalListing>>(`/api/listings?${params}`);
    },
    initialPageParam: {
      page: 1,
      hourKey: null,
      demotedIds: [],
      demotionsPinned: false,
      freshIds: [],
      freshIdsPinned: false,
      resolvedScope: null,
      promaxDisabled: false,
    } satisfies PromaxPageParam,
    getNextPageParam: (last, allPages, _lastPageParam, allPageParams) =>
      getPromaxNextPageParam(last, allPages, allPageParams),
    staleTime: 2 * 60 * 1000,
  });

  // A cached infinite query may retain an expired PROMAX hour token. Reset
  // the whole sequence so React Query starts page one without the stale pin;
  // retrying page two with a new current snapshot would otherwise skip rows.
  useEffect(() => {
    if (!isPromaxSnapshotExpiredError(feedError)) return;
    queryClient.resetQueries({ queryKey: ["listings-infinite", feedFilterKey], exact: true });
  }, [feedError, feedFilterKey, queryClient]);

  // Flatten all pages into one list
  const allListings = useMemo(
    () => (feedPages?.pages ?? [])
      .flatMap((page) => Array.isArray(page?.listings) ? page.listings : [])
      .filter((listing): listing is NormalListing => Boolean(listing && Number.isInteger(listing.id))),
    [feedPages?.pages]
  );

  // Personalised feed — listings matching the user's top search terms
  const { data: personalizedData } = useQuery({
    queryKey: ["personalized-feed", user?.id],
    queryFn: () =>
      apiFetch<{ listings: NormalListing[]; searches: string[] }>("/api/listings/personalized"),
    enabled: !!user?.id && !isAdmin,
    staleTime: 3 * 60 * 1000,
  });
  // Respect the selected category in the personalised section.
  const personalizedListings = (personalizedData?.listings ?? []).filter(
    l => !activeCategory || l.categorySlug === activeCategory
  );
  const personalizedSearches = personalizedData?.searches ?? [];
  const personalizedIds = useMemo(
    () => new Set(personalizedListings.map((l) => l.id)),
    [personalizedListings],
  );
  const promaxGroups = useMemo(() => {
    const groupKeys = ["booster_vip", "booster_ordinary", "vip", "ordinary"] as const;
    const seen = new Set<number>();
    return groupKeys.map((key) => ({
      key,
      listings: allListings
        .filter((listing) => {
          if (seen.has(listing.id) || getRenderablePromaxGroup(listing) !== key) return false;
          if (activeCategory && listing.categorySlug !== activeCategory) return false;
          seen.add(listing.id);
          return true;
        }),
    }));
  }, [allListings, activeCategory]);

  // Real boosted listings only — used for hero (never invent promotions).
  // Country eligibility is enforced server-side; re-check client-side so a paid
  // boost can never bypass the selected marketplace country in this section.
  const boostedListings = useMemo(
    () => allListings.filter((l) => {
      if (!l.isBoosted) return false;
      if (activeCategory && l.categorySlug !== activeCategory) return false;
      if (l.boostExpiresAt && new Date(l.boostExpiresAt).getTime() <= Date.now()) return false;
      if (!isAdmin && activeCountry && l.country && l.country !== activeCountry) return false;
      return true;
    }),
    [allListings, activeCategory, activeCountry, isAdmin],
  );

  // Today's Deals / Today's Picks — always fill 2 slots: boosted first, then
  // eligible regular products. Never leave an empty half of the grid.
  const todaysDeals = useMemo(
    () =>
      selectTodaysDealSlots(allListings, {
        slotCount: 2,
        activeCategory,
        activeCountry: isAdmin ? null : activeCountry,
        skipCountryFilter: isAdmin,
      }),
    [allListings, activeCategory, activeCountry, isAdmin],
  );
  // Prefer a For You match for the hero when this account has search history,
  // so two people in the same house see different top products.
  const heroListing =
    personalizedListings[0]
    ?? boostedListings[0]
    ?? todaysDeals.slots[0]
    ?? allListings[0]
    ?? null;
  const heroIsForYou = Boolean(
    personalizedListings[0] && heroListing && personalizedListings[0].id === heroListing.id,
  );

  const recordedBoostImpressionsRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    // Impression accounting is tied to a paid booster card entering the
    // server-ordered Home feed, not to a client-side random placement.
    for (const group of promaxGroups) {
      if (group.key !== "booster_vip" && group.key !== "booster_ordinary") continue;
      for (const listing of group.listings) {
        if (recordedBoostImpressionsRef.current.has(listing.id)) continue;
        recordedBoostImpressionsRef.current.add(listing.id);
        void fetch(`/api/listings/${listing.id}/impression`, { method: "POST" }).catch(() => {
          recordedBoostImpressionsRef.current.delete(listing.id);
        });
      }
    }
  }, [promaxGroups]);

  // ── Load persisted locationMode when user is ready ──
  useEffect(() => {
    if (!user?.id) {
      if (shoppingCity) setDetectedCity(shoppingCity);
      return;
    }
    setLocationModeState(loadLocationMode(user.id));
    // Seed detectedCity from cached position if available
    const cached = loadCachedPosition(user.id);
    if (cached?.city) setDetectedCity(cached.city);
  }, [user?.id, shoppingCity]);

  // ── Persist mode helper ──
  const setLocationMode = useCallback((mode: LocationMode) => {
    setLocationModeState(mode);
    saveLocationMode(user?.id, mode);
  }, [user?.id]);

  // ── Core location detection ──
  const detectAndUpdateLocation = useCallback(async (force = false) => {
    if (!navigator.geolocation || !user?.id) return;
    if (detectingRef.current) return;

    const cached = loadCachedPosition(user.id);

    // Skip if recent enough (< 5 min) and not forced
    if (!force && cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return;

    detectingRef.current = true;
    setGpsDetecting(true);

    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: false,
          timeout: 10_000,
          maximumAge: 300_000,
        })
      );

      const { latitude: lat, longitude: lng } = pos.coords;

      // Distance threshold: only update server if moved > 5 km
      let movedEnough = !cached;
      if (cached) {
        const distKm = haversineKm(cached.lat, cached.lng, lat, lng);
        movedEnough = distKm > 5;
      }

      // Always reverse-geocode to check city change even if not moved far
      const geo = await reverseGeocode(lat, lng);
      const rawCity = geo.city;
      const city = rawCity
        ? (matchCityToKnownList(rawCity, activeCountry ?? null) ?? rawCity)
        : cached?.city ?? "";

      const cityChanged = city !== cached?.city;

      if (movedEnough || cityChanged || !cached) {
        // Persist ONLY the raw GPS coordinates (used for distance-based
        // "nearby" browsing). We deliberately DO NOT write `location`/`state`
        // here: `users.location` is the seller's pickup / business address that
        // the user sets manually, and the delivery pickup is derived from it.
        // Silently overwriting it with the phone's current city broke delivery
        // for sellers who travel — the pickup showed wherever the phone was
        // instead of the real business address the seller entered.
        await apiFetch("/api/me/location", {
          method: "PATCH",
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
          }),
        });

        // Refresh user so feed queries (keyed on user.location) re-run
        await refreshUser?.();

        // Invalidate the server-owned feed for immediate refresh
        queryClient.invalidateQueries({ queryKey: ["listings-infinite"] });
      }

      saveCachedPosition(user.id, { lat, lng, city, timestamp: Date.now() });
      if (city) setDetectedCity(city);

    } catch {
      // GPS denied or unavailable — fail silently
    } finally {
      detectingRef.current = false;
      setGpsDetecting(false);
    }
  }, [user?.id, activeCountry, refreshUser, queryClient]);

  // ── Auto-detect on mount (if permission already granted) ──
  useEffect(() => {
    if (!user?.id || locationMode !== "auto") return;
    if (!navigator.geolocation) return;

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then(p => { if (p.state === "granted") detectAndUpdateLocation(); })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ── Re-check on tab focus if > 5 min since last check ──
  useEffect(() => {
    const onVisible = () => {
      if (locationMode !== "auto") return;
      const cached = user?.id ? loadCachedPosition(user.id) : null;
      if (!cached || Date.now() - cached.timestamp > 5 * 60 * 1000) {
        detectAndUpdateLocation();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [locationMode, detectAndUpdateLocation, user?.id]);

  // ── Periodic check every 10 minutes in auto mode ──
  useEffect(() => {
    if (locationMode !== "auto") return;
    const interval = setInterval(() => detectAndUpdateLocation(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [locationMode, detectAndUpdateLocation]);

  // ── IntersectionObserver: auto-fetch next page when sentinel enters viewport ──
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // ── Manual city selection ──
  const handleManualCitySelect = useCallback(async (city: string) => {
    setShowCityPicker(false);
    setDetectedCity(city);
    setLocationMode("manual");
    if (!user?.id) {
      setGuestCity(city);
      queryClient.invalidateQueries({ queryKey: ["listings-infinite"] });
      return;
    }
    try {
      await apiFetch("/api/me/location", {
        method: "PATCH",
        body: JSON.stringify({ location: city }),
      });
      await refreshUser?.();
      queryClient.invalidateQueries({ queryKey: ["listings-infinite"] });
    } catch {}
  }, [setLocationMode, refreshUser, queryClient, user?.id, setGuestCity]);

  // ── Switch back to auto GPS mode ──
  const switchToAutoMode = useCallback(() => {
    setLocationMode("auto");
    detectAndUpdateLocation(true);
  }, [setLocationMode, detectAndUpdateLocation]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (activeCategory) params.set("category", activeCategory);
    setLocation(`/search?${params.toString()}`);
  };

  const handleCategoryClick = (slug: string) => {
    setActiveCategory(prev => (prev === slug ? null : slug));
  };

  const userCountry = activeCountry;
  const countryFlag = userCountry ? COUNTRY_FLAGS[userCountry] : null;
  // Display city: prefer freshly detected > profile/guest shopping city > country fallback
  const displayCity = detectedCity ?? user?.location ?? shoppingCity ?? null;
  const needsGuestCountry = !user && !isAdmin && !activeCountry;

  return (
    <div className="w-full fm-home-amazon">
      {/* === MOBILE: Amazon-style green search + deliver strip === */}
      <div className="md:hidden bg-[hsl(152,65%,18%)] text-white px-3 pb-2.5 pt-1 space-y-2">
        <form onSubmit={handleSearch} className="flex gap-2 items-stretch">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={t("home.searchPlaceholder")}
              className="pl-9 pr-3 h-11 rounded-lg bg-white border-0 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-[#F97316]"
              data-testid="input-search-hero-mobile"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 rounded-lg bg-[#F97316] hover:bg-[#ea6a0c] text-white shrink-0"
            data-testid="button-search-hero-mobile"
            aria-label={t("buttons.search")}
          >
            <Search className="h-5 w-5" />
          </Button>
        </form>
        {(displayCity || userCountry) && (
          <button
            type="button"
            onClick={() => !isAdmin && setShowCityPicker(true)}
            className="flex items-center gap-1.5 text-[12px] text-white/95 w-full text-left"
            data-testid="button-deliver-to"
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {t("home.deliverTo", { defaultValue: "Deliver to" })}{" "}
              <strong>{displayCity ?? userCountry}</strong>
            </span>
            <ChevronRight className="h-3.5 w-3.5 ml-auto shrink-0 opacity-80" />
          </button>
        )}
      </div>

      {/* === DESKTOP SEARCH BAR === */}
      <div className="hidden md:block sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={userCountry ? `${t("home.searchPlaceholder")} ${userCountry}...` : t("home.searchPlaceholder")}
              className="pl-9 pr-3 h-10 rounded-full bg-muted border-0 text-sm focus-visible:ring-1"
              data-testid="input-search-hero"
            />
          </div>
          <Button type="submit" size="sm" className="rounded-full px-4 shrink-0" data-testid="button-search-hero">
            {t("buttons.search")}
          </Button>
        </form>
      </div>

      <div className="px-3 py-2 space-y-4 md:px-4 md:py-4 md:space-y-6">

        {/* Brand H1 — crawlable homepage heading; keep layout compact */}
        <header className="pt-1 pb-0.5">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">
            {t("seo.homeHeading", { defaultValue: SEO_BRAND_NAME })}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            {t("seo.homeHeadingSupport")}
          </p>
        </header>

        {/* === ADMIN VIEW BANNER + COUNTRY PICKER (centralized AdminCountryContext) === */}
        {isAdmin && canSelectAll && (
          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-500 shrink-0" />
              <span className="text-sm font-semibold text-foreground">
                {t("home.adminView", "Admin View")}
              </span>
              <span className="text-xs text-muted-foreground flex-1 truncate">
                — {adminCountry
                  ? `${COUNTRY_FLAGS[adminCountry] ?? ""} ${adminCountry}`
                  : t("home.allCountriesDesc", "All Countries")}
              </span>
              {isMultiCountryAdmin && (
                <span className="text-xs bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">
                  {adminScopeCountriesList.length} {t("home.countries", "pays")}
                </span>
              )}
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
              data-testid={isMultiCountryAdmin ? "select-admin-country-scoped" : "select-admin-country"}
            />
          </div>
        )}
        {/* Single-country scoped admin: locked banner — no dropdown */}
        {isAdmin && !canSelectAll && (
          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-500 shrink-0" />
              <span className="text-sm font-semibold text-foreground">
                {t("home.adminView", "Admin View")}
              </span>
              <span className="text-xs text-muted-foreground flex-1 truncate">
                — {scopeLock
                  ? `${COUNTRY_FLAGS[scopeLock] ?? ""} ${scopeLock}`
                  : t("home.allCountriesDesc", "All Countries")}
              </span>
              <span className="text-xs bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">
                {t("home.locked", "Locked")}
              </span>
            </div>
          </div>
        )}

        {/* === NO COUNTRY → BLOCKING overlay with inline country picker === */}
        {((user && !isAdmin && !user.country) || needsGuestCountry) && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
            <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🌍</span>
                <div>
                  <p className="text-base font-bold text-foreground">
                    {t("home.selectCountryTitle", "Choose your country")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("home.selectCountryDesc", "Select a shopping country to see products available near you.")}
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {SUPPORTED_COUNTRIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-muted/60 active:scale-[0.98] transition-all text-left"
                    onClick={async () => {
                      if (!user) {
                        setGuestCountry(c);
                        queryClient.invalidateQueries({ queryKey: ["listings-infinite"] });
                        queryClient.invalidateQueries({ predicate: (q) => {
                          const key = String(q.queryKey?.[0] ?? "");
                          return key.includes("/api/listings") || key.includes("/api/videos");
                        }});
                        return;
                      }
                      try {
                        await apiFetch("/api/me/country", {
                          method: "PATCH",
                          body: JSON.stringify({ country: c }),
                        });
                      } catch {}
                      await refreshUser?.();
                      queryClient.invalidateQueries({ queryKey: ["listings-infinite"] });
                      queryClient.invalidateQueries({ predicate: (q) => {
                        const key = String(q.queryKey?.[0] ?? "");
                        return key.includes("/api/listings") || key.includes("/api/videos");
                      }});
                    }}
                  >
                    <span className="text-2xl">{COUNTRY_FLAGS[c]}</span>
                    <span className="text-sm font-semibold text-foreground">{c}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === LOCATION BANNER (auto GPS / manual city) === */}
        {!isAdmin && activeCountry && (user || guestLocation) && (
          <div className="space-y-2">
            {/* Main banner row */}
            <div className="flex items-center justify-between bg-primary/8 border border-primary/15 rounded-xl px-4 py-2.5 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl shrink-0">{countryFlag}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {displayCity
                      ? t("home.showingInCity", { city: displayCity, defaultValue: `Showing listings in ${displayCity}` })
                      : t("home.showingInCountry", { country: activeCountry, defaultValue: `Showing listings in ${activeCountry}` })}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {gpsDetecting
                      ? t("home.detectingLocation", "Detecting your location…")
                      : locationMode === "auto"
                      ? hasGps
                        ? t("home.autoDetected", "📍 Auto-detected")
                        : t("home.autoGps", "📍 Auto GPS — tap refresh to detect")
                      : t("home.manuallySelected", "✎ Manually selected")}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {locationMode === "auto" ? (
                  <>
                    {/* Refresh / trigger GPS */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      onClick={() => detectAndUpdateLocation(true)}
                      disabled={gpsDetecting}
                      title="Refresh my location"
                      data-testid="button-refresh-location"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", gpsDetecting && "animate-spin")} />
                    </Button>
                    {/* Open city picker to override */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => setShowCityPicker(p => !p)}
                      data-testid="button-open-city-picker"
                    >
                      <Pencil className="h-3 w-3" />
                      Manual
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Switch back to auto */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={switchToAutoMode}
                      disabled={gpsDetecting}
                      data-testid="button-switch-auto"
                    >
                      <Navigation className="h-3 w-3" />
                      Auto GPS
                    </Button>
                    {/* Change manual city */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowCityPicker(p => !p)}
                      data-testid="button-open-city-picker"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", showCityPicker && "rotate-180")} />
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Collapsible city picker */}
            {showCityPicker && (
              <div className="flex items-center gap-2 px-1 animate-in slide-in-from-top-1 duration-150">
                <MobileSelect
                  value={displayCity ?? ""}
                  onValueChange={handleManualCitySelect}
                  placeholder="Select a city…"
                  options={citiesFor(activeCountry).map(c => ({ value: c, label: c }))}
                  className="h-9 text-sm flex-1"
                  data-testid="select-manual-city"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setShowCityPicker(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* === GEO SCOPE FILTER CHIPS === */}
        {!isAdmin && activeCountry && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
            {(["nearby", "city", "country"] as Scope[]).map(s => (
              <button
                key={s}
                onClick={() => {
                  // Nearby needs GPS — guests without coords browse country-wide instead
                  if (!user && s === "nearby") {
                    setScope("country");
                    return;
                  }
                  setScope(s);
                }}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all whitespace-nowrap",
                  scope === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50"
                )}
                data-testid={`button-scope-${s}`}
              >
                {s === "nearby" && <MapPin className="h-3 w-3" />}
                {t(`home.scope.${s}`, {
                  defaultValue:
                    s === "nearby" ? "Near You" : s === "city" ? "My City" : `In ${userCountry ?? "country"}`,
                })}
              </button>
            ))}
            {(feedPages?.pages?.[0] as any)?.expandedFromScope && (
              <span className="flex-shrink-0 self-center text-xs text-muted-foreground italic ml-1">
                {t("home.expandedScope", { defaultValue: "Expanded results" })}
              </span>
            )}
          </div>
        )}

        {/* === HORIZONTAL CATEGORY NAV (Amazon-style underline) === */}
        {categories && categories.length > 0 && (
          <div className="-mx-3 md:-mx-4 border-b border-border bg-background">
            <div
              className="flex gap-1 overflow-x-auto px-3 md:px-4 scrollbar-none"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "flex-shrink-0 px-3 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors",
                  activeCategory === null
                    ? "border-[#F97316] text-[hsl(152,65%,22%)]"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                data-testid="button-category-all"
              >
                {t("home.allCategories")}
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => handleCategoryClick(cat.slug)}
                  className={cn(
                    "flex-shrink-0 px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                    activeCategory === cat.slug
                      ? "border-[#F97316] text-[hsl(152,65%,22%)]"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  data-testid={`button-category-${cat.slug}`}
                >
                  <span className="mr-1">{cat.icon}</span>
                  {t(`categories.${cat.slug}`, { defaultValue: cat.name })}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* === HERO — For You match preferred, else boosted / deal === */}
        {heroListing && (
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(152,65%,18%)] to-[hsl(152,50%,28%)] text-white shadow-md">
            <div className="flex items-stretch min-h-[148px]">
              <div className="flex-1 p-4 flex flex-col justify-center gap-2 min-w-0">
                {heroIsForYou ? (
                  <span className="inline-flex w-fit text-[10px] font-bold uppercase tracking-wide bg-white/20 text-white px-2 py-0.5 rounded-full">
                    {t("home.forYou", { defaultValue: "For You" })}
                  </span>
                ) : heroListing.isBoosted ? (
                  <span className="inline-flex w-fit text-[10px] font-bold uppercase tracking-wide bg-[#F97316] text-white px-2 py-0.5 rounded-full">
                    {t("home.boostedBadge", { defaultValue: "Boosted" })}
                  </span>
                ) : null}
                <h2 className="text-lg sm:text-xl font-bold leading-tight line-clamp-2">
                  {heroListing.title}
                </h2>
                <p className="text-sm text-white/85 font-semibold tabular-nums">
                  {formatPriceHome(heroListing)}
                </p>
                <Button
                  size="sm"
                  className="w-fit mt-1 rounded-full bg-[#F97316] hover:bg-[#ea6a0c] text-white font-bold"
                  onClick={() => setLocation(`/listings/${heroListing.id}`)}
                >
                  {t("home.shopNow", { defaultValue: "Shop Now" })}
                  <ChevronRight className="h-4 w-4 ml-0.5" />
                </Button>
              </div>
              {heroListing.images?.[0] && (
                <div className="w-[42%] max-w-[180px] relative bg-white/10">
                  <img
                    src={heroListing.images[0]}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          </section>
        )}

        {/* === SHOP BY CATEGORY === */}
        {categories && categories.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-base font-bold text-foreground">
                {t("home.shopByCategory", { defaultValue: "Shop by Category" })}
              </h2>
              <Link
                href="/search"
                className="text-xs font-semibold text-[hsl(152,65%,28%)] flex items-center gap-0.5"
              >
                {t("buttons.seeAll")} <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {categories.slice(0, 8).map((cat) => (
                <Link
                  key={cat.id}
                  href={`/categories/${encodeURIComponent(cat.slug)}`}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-xl bg-muted/60 border border-border p-2.5 active:scale-[0.98] transition",
                    activeCategory === cat.slug && "border-[#F97316] bg-orange-50 dark:bg-orange-950/20",
                  )}
                  data-testid={`link-shop-category-${cat.slug}`}
                >
                  <span className="text-2xl leading-none">{cat.icon}</span>
                  <span className="text-[10px] font-semibold text-foreground text-center line-clamp-2 leading-tight">
                    {t(`categories.${cat.slug}`, { defaultValue: cat.name })}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* === FOR YOU — per-account search personalization near top of Home === */}
        {user && !isAdmin && personalizedListings.length > 0 && (
          <section data-testid="for-you-section" aria-label={t("home.forYou", { defaultValue: "For You" })}>
            <div className="flex items-center justify-between mb-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Search className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-bold text-foreground">
                    {t("home.forYou", { defaultValue: "For You" })}
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("home.basedOnSearchesDesc")}
                </p>
              </div>
              <button
                onClick={() => setLocation("/search")}
                className="flex items-center gap-0.5 text-xs text-primary font-semibold flex-shrink-0"
              >
                {t("buttons.seeAll")} <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            {personalizedSearches.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none mb-3">
                {personalizedSearches.map(term => (
                  <button
                    key={term}
                    onClick={() => setLocation(`/search?q=${encodeURIComponent(term)}`)}
                    className="flex-shrink-0 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20 hover:bg-primary/20 transition-colors whitespace-nowrap"
                  >
                    {term}
                  </button>
                ))}
              </div>
            )}
            <div
              className="home-product-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3"
              data-testid="for-you-grid"
            >
              {personalizedListings.slice(0, 10).map((l, index) => (
                <div key={`for-you-${l.id}`} className="min-w-0" data-for-you="true">
                  <ListingCard listing={l} priority={index < 4} showAddToCart />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* === TODAY'S DEALS / PICKS — professional two-column product grid === */}
        {todaysDeals.slots.length > 0 && (
          <section
            className="rounded-2xl border border-orange-300/70 bg-[#FBF6EC] dark:bg-orange-950/15 dark:border-orange-900/40 p-3"
            data-testid="todays-deals-section"
            data-used-fallback={todaysDeals.usedFallback ? "true" : "false"}
          >
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-foreground">
                {todaysDeals.useNeutralHeading
                  ? t("home.todaysPicks", { defaultValue: "Today's Picks" })
                  : t("home.todaysDeals", { defaultValue: "Today's Deals" })}
              </h2>
              {!todaysDeals.useNeutralHeading && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange-600 dark:text-orange-300">
                  <span aria-hidden>⚡</span>
                  {t("home.boostedListings", { defaultValue: "Boosted listings" })}
                </span>
              )}
            </div>
            <div
              className="grid grid-cols-2 gap-2.5 sm:gap-3"
              data-testid="todays-deals-grid"
            >
              {todaysDeals.slots.map((listing) => (
                <div key={`deal-${listing.id}`} className="min-w-0 h-full">
                  <TodaysDealCard listing={listing} />
                </div>
              ))}
            </div>
            <Link
              href="/search?boosted=true"
              className="mt-3 flex w-full items-center justify-center gap-1 rounded-full border border-orange-400/80 bg-transparent px-3 py-2.5 text-[13px] font-bold text-orange-600 transition-colors hover:bg-orange-50 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-950/40"
              data-testid="view-all-boosted-listings"
            >
              {t("home.viewAllBoosted", { defaultValue: "View All Boosted Listings" })}
              <span aria-hidden>→</span>
            </Link>
          </section>
        )}

        {/* === HOME PROMO STRIP — exactly ≤2 cards; full feed opens on tap === */}
        <VideoPromoSection countryFilter={isAdmin ? effectiveAdminCountry : (activeCountry ?? null)} />

        {/* === FEATURED PRODUCTS (2-col mobile) — shared PROMAX order === */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">
            {t("home.featuredProducts", { defaultValue: "Featured Products" })}
          </h2>
        </div>

        {/* === PROMAX GROUPS — server-owned hourly order; skip For You dupes above === */}
        {feedLoading ? (
          <div className="home-product-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-xl" />
            ))}
          </div>
        ) : (
          promaxGroups.some(group => group.listings.some((l) => !personalizedIds.has(l.id))) && (
            <div
              className="home-product-grid grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3"
              aria-label="Marketplace products"
            >
              {(() => {
                let aboveFoldIndex = 0;
                return promaxGroups.flatMap(({ key, listings }) =>
                  listings
                    .filter((listing) => !personalizedIds.has(listing.id))
                    .map((listing) => {
                      const priority = aboveFoldIndex < 4;
                      aboveFoldIndex += 1;
                      return (
                        <div key={listing.id} data-promax-group={key} className="min-w-0">
                          <ListingCard listing={listing} priority={priority} showAddToCart />
                        </div>
                      );
                    }),
                );
              })()}
            </div>
          )
        )}

        {/* Infinite pagination stays in normal document flow; no reserved rows. */}
        <div ref={sentinelRef} className="h-px" />
        {isFetchingNextPage ? (
          <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t("home.loadingMore", { defaultValue: "Loading more…" })}</span>
          </div>
        ) : !hasNextPage && promaxGroups.some(group => group.listings.length > 0) ? (
          <div className="flex flex-col items-center py-8 gap-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">
              {t("home.allCaughtUp", { defaultValue: "You're all caught up!" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("home.allCaughtUpDesc", { defaultValue: "Check back later for new listings." })}
            </p>
          </div>
        ) : promaxGroups.every(group => group.listings.length === 0) && !feedLoading ? (
            <div className="text-center py-16 bg-muted/30 border border-border rounded-2xl">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("home.noListings")}</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">{t("home.noListingsDesc")}</p>
              <Button onClick={() => setLocation("/sell")} data-testid="button-start-selling">
                {t("nav.sell")}
              </Button>
            </div>
        ) : null}

        {/* === SELL CTA CARD === */}
        {!user && (
          <div className="rounded-2xl bg-gradient-to-r from-primary to-blue-400 text-white p-6 flex items-center justify-between">
            <div>
              <p className="font-bold text-lg">{t("home.sellCta")}</p>
              <p className="text-sm text-white/80">{t("home.sellCtaDesc")}</p>
            </div>
            <Button
              className="bg-white text-primary hover:bg-white/90 font-bold flex-shrink-0"
              onClick={() => setLocation("/sell")}
              data-testid="button-start-selling-cta"
            >
              {t("nav.sell")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
