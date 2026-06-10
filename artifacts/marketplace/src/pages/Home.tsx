import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useSEO } from "@/hooks/useSEO";
import { Link, useLocation } from "wouter";

import { Search, ChevronRight, Zap, TrendingUp, Package, ArrowRight, MapPin, Navigation, AlertCircle, ShieldCheck, BadgeCheck, X, RefreshCw, ChevronDown, Pencil, CheckCircle2, Loader2, Play, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetCategories } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import ListingCard from "@/components/ListingCard";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { MobileSelect } from "@/components/ui/mobile-select";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { formatPrice } from "@/lib/currency";
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

import { COUNTRY_FLAGS, SUPPORTED_COUNTRIES, citiesFor, STATE_BY_CITY } from "@/lib/countries";

// ─── Types ────────────────────────────────────────────────────────────────────

type NormalListing = {
  id: number;
  title: string;
  price: number;
  currency?: string | null;
  images: string[];
  location: string;
  city?: string | null;
  country?: string | null;
  condition: string;
  isBoosted: boolean;
  status: string;
  sellerName: string;
  sellerRating: number;
  sellerIsVerified: boolean;
  favoriteCount: number;
  isFavorited?: boolean;
  createdAt: string;
  categoryIcon?: string | null;
  subcategory?: string | null;
  categorySlug?: string | null;
  sellerId?: number;
  distanceKm?: number | null;
  proximityLevel?: string | null;
  nearYou?: boolean;
};

type FeedItem =
  | { type: "normal"; listing: NormalListing; key: string }
  | { type: "boosted"; listing: NormalListing; key: string };

type BoostState = {
  ignored: number[];
  seenToday: { date: string; counts: Record<number, number> } | null;
  lastBoostTime: number;
};

const DEFAULT_BOOST_STATE: BoostState = { ignored: [], seenToday: null, lastBoostTime: 0 };

// ─── Boost State (localStorage) ───────────────────────────────────────────────

function getBoostKey(userId: number | undefined) {
  return userId ? `flexa_boost_${userId}` : "flexa_boost_guest";
}

function loadBoostState(userId: number | undefined): BoostState {
  try {
    const raw = localStorage.getItem(getBoostKey(userId));
    if (!raw) return { ...DEFAULT_BOOST_STATE };
    return { ...DEFAULT_BOOST_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BOOST_STATE };
  }
}

function saveBoostState(userId: number | undefined, state: BoostState) {
  try {
    localStorage.setItem(getBoostKey(userId), JSON.stringify(state));
  } catch {}
}

function useBoostState(userId: number | undefined) {
  const [state, setStateRaw] = useState<BoostState>(() => loadBoostState(userId));

  const setState = useCallback(
    (updater: (prev: BoostState) => BoostState) => {
      setStateRaw(prev => {
        const next = updater(prev);
        saveBoostState(userId, next);
        return next;
      });
    },
    [userId]
  );

  // Re-load when userId changes (login/logout)
  useEffect(() => {
    setStateRaw(loadBoostState(userId));
  }, [userId]);

  const markIgnored = useCallback(
    (listingId: number) => {
      setState(prev => ({
        ...prev,
        ignored: prev.ignored.includes(listingId)
          ? prev.ignored
          : [...prev.ignored, listingId],
      }));
    },
    [setState]
  );

  const markSeen = useCallback(
    (listingId: number) => {
      setState(prev => {
        const today = new Date().toDateString();
        const existing = prev.seenToday?.date === today ? prev.seenToday.counts : {};
        return {
          ...prev,
          lastBoostTime: Date.now(),
          seenToday: {
            date: today,
            counts: { ...existing, [listingId]: (existing[listingId] ?? 0) + 1 },
          },
        };
      });
    },
    [setState]
  );

  return { state, markIgnored, markSeen };
}

// ─── Feed builder ─────────────────────────────────────────────────────────────

function buildFeedWithBoosts(
  normal: NormalListing[],
  boosted: NormalListing[],
  state: BoostState,
  boostPositions: number[]
): FeedItem[] {
  const today = new Date().toDateString();
  const seenCounts = state.seenToday?.date === today ? state.seenToday.counts : {};

  // Filter eligible boosts: not ignored, seen < 2 today, not appearing in normal feed already
  const eligible = boosted.filter(l => {
    if (state.ignored.includes(l.id)) return false;
    if ((seenCounts[l.id] ?? 0) >= 2) return false;
    return true;
  });

  // Enforce 15-min gap between boost sessions
  const canShowBoost =
    eligible.length > 0 &&
    (!state.lastBoostTime || Date.now() - state.lastBoostTime >= 15 * 60 * 1000);

  const result: FeedItem[] = normal.map((l, i) => ({
    type: "normal",
    listing: l,
    key: `normal-${l.id}-${i}`,
  }));

  if (!canShowBoost || boostPositions.length === 0) return result;

  // Insert boosts at pre-computed positions (from highest index to lowest to preserve positions)
  let boostIdx = 0;
  for (const pos of boostPositions) {
    if (boostIdx >= eligible.length) break;
    if (pos > result.length) break;
    // Never insert two boosts back-to-back (check neighbours)
    const prev = result[pos - 1];
    const next = result[pos];
    if (prev?.type === "boosted" || next?.type === "boosted") continue;
    result.splice(pos, 0, {
      type: "boosted",
      listing: eligible[boostIdx],
      key: `boosted-${eligible[boostIdx].id}-at-${pos}`,
    });
    boostIdx++;
  }

  return result;
}

// ─── VideoPromoSection ────────────────────────────────────────────────────────
// Horizontal scroll carousel of active boosted promo videos on the homepage.
// Fetches /api/videos/feed?page=1&limit=6 and refreshes every 2 min so newly
// activated boosts appear without a reload.

interface PromoVideoItem {
  id: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  sellerName: string;
  boostEndAt: string | null;
}

function VideoPromoSection() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [, setLocation] = useLocation();
  const [videos, setVideos] = useState<PromoVideoItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const res = await fetch("/api/videos/feed?page=1&limit=6", { headers });
      if (!res.ok) return;
      const data = await res.json();
      const live = (data.videos ?? []).filter((v: PromoVideoItem) => {
        if (!v.boostEndAt) return true;
        return new Date(v.boostEndAt).getTime() > Date.now();
      });
      setVideos(live);
    } catch { /* non-critical */ } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 2 * 60_000);
    return () => clearInterval(poll);
  }, [load]);

  if (loading) {
    return (
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Video className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-foreground">{t("home.videoPromo", { defaultValue: "Video Promo" })}</h2>
        </div>
        <div className="flex gap-3 overflow-x-hidden -mx-4 px-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex-shrink-0 w-36 h-52 bg-muted rounded-xl animate-pulse" />
          ))}
        </div>
      </section>
    );
  }

  if (videos.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Video className="h-4 w-4 text-primary" />
          <h2 className="text-base font-bold text-foreground">{t("home.videoPromo", { defaultValue: "Video Promo" })}</h2>
          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse inline-block" />
            LIVE
          </span>
        </div>
        <button
          onClick={() => setLocation("/videos")}
          className="flex items-center gap-0.5 text-xs text-primary font-semibold"
          data-testid="button-video-promo-see-all"
        >
          {t("buttons.seeAll", { defaultValue: "See All" })} <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {videos.map(v => (
          <Link
            key={v.id}
            href={`/videos?start=${v.id}`}
            className="flex-shrink-0 w-36 rounded-xl overflow-hidden relative bg-black shadow-md active:scale-95 transition-transform block"
            style={{ height: "200px", textDecoration: "none" }}
            data-testid={`button-promo-video-${v.id}`}
          >
            {/* Thumbnail */}
            {v.thumbnailUrl ? (
              <img
                src={v.thumbnailUrl}
                alt={v.title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-primary/30 to-primary/10" />
            )}

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            {/* Play button */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-white/20 border-2 border-white/60 backdrop-blur-sm flex items-center justify-center">
                <Play className="h-5 w-5 text-white fill-white ml-0.5" />
              </div>
            </div>

            {/* Sponsored badge */}
            <div className="absolute top-2 left-2">
              <span className="bg-yellow-400 text-black text-[9px] font-bold uppercase px-1.5 py-0.5 rounded">
                {t("boostAd.sponsored", { defaultValue: "Sponsored" })}
              </span>
            </div>

            {/* Title at bottom */}
            <div className="absolute bottom-0 inset-x-0 px-2 pb-2">
              <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{v.title}</p>
              {v.sellerName && (
                <p className="text-white/60 text-[10px] truncate mt-0.5">{v.sellerName}</p>
              )}
            </div>
          </Link>
        ))}

        {/* "See all" card at end */}
        <Link
          href="/videos"
          className="flex-shrink-0 w-36 rounded-xl border-2 border-dashed border-primary/30 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform bg-primary/5 block"
          style={{ height: "200px", textDecoration: "none" }}
          data-testid="button-video-promo-all"
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Play className="h-5 w-5 text-primary fill-primary ml-0.5" />
          </div>
          <p className="text-xs font-semibold text-primary text-center px-2">
            {t("home.watchAllVideos", { defaultValue: "Watch All Videos" })}
          </p>
        </Link>
      </div>
    </section>
  );
}

// ─── BoostedPostCard ──────────────────────────────────────────────────────────

function BoostedPostCard({
  listing,
  onSkip,
  onSeen,
}: {
  listing: NormalListing;
  onSkip: (id: number) => void;
  onSeen: (id: number) => void;
}) {
  const [, setLocation] = useLocation();
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [skippable, setSkippable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const seenRef = useRef(false);

  // Mark seen once on mount
  useEffect(() => {
    if (!seenRef.current) {
      seenRef.current = true;
      onSeen(listing.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 10-second countdown
  useEffect(() => {
    if (secondsLeft <= 0) {
      setSkippable(true);
      return;
    }
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const handleSkip = () => {
    if (!skippable) return;
    setDismissed(true);
    onSkip(listing.id);
  };

  if (dismissed) return null;

  const img =
    listing.images?.[0] ??
    `https://placehold.co/400x300/f97316/white?text=${encodeURIComponent(listing.title.slice(0, 10))}`;

  return (
    <div className="col-span-2 sm:col-span-3 lg:col-span-4">
      <div className="rounded-xl border-2 border-amber-400/70 bg-card overflow-hidden shadow-[0_2px_12px_rgba(251,191,36,0.2)] transition-all">
        {/* Sponsor header bar */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-amber-500 fill-amber-500" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wide">
              Piblisite
            </span>
          </div>
          <button
            onClick={handleSkip}
            disabled={!skippable}
            className={cn(
              "flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold transition-all border",
              skippable
                ? "bg-white dark:bg-card text-foreground border-border hover:bg-muted cursor-pointer"
                : "bg-muted text-muted-foreground border-transparent cursor-not-allowed opacity-70"
            )}
          >
            {skippable ? (
              <>
                <X className="h-3 w-3" />
                Pase
              </>
            ) : (
              `Pase ${secondsLeft}s`
            )}
          </button>
        </div>

        {/* Listing preview — horizontal layout */}
        <button
          className="flex gap-3 p-3 w-full text-left hover:bg-muted/40 transition-colors"
          onClick={() => setLocation(`/listings/${listing.id}`)}
        >
          <img
            src={img}
            alt={listing.title}
            className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://placehold.co/96x96/f97316/white?text=Ad";
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-foreground text-base">
              {formatPrice(listing.price, listing.country, listing.currency)}
            </p>
            <p className="text-sm text-foreground font-medium mt-0.5 line-clamp-2 leading-snug">
              {listing.title}
            </p>
            <div className="flex items-center gap-1 mt-1.5 text-muted-foreground">
              <MapPin className="h-3 w-3 flex-shrink-0" />
              <span className="text-xs truncate">{listing.city ?? listing.location}</span>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {listing.sellerIsVerified && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 px-1.5 py-0.5 text-xs font-bold">
                  <BadgeCheck className="h-3 w-3 fill-blue-500 text-white dark:text-blue-950" />
                  Verifye
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                pa {listing.sellerName}
              </span>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground self-center flex-shrink-0" />
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Home() {
  useSEO({ path: "/" });
  const [, setLocation] = useLocation();
  const [q, setQ] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>("city");
  const [adminCountry, setAdminCountry] = useState<string | null>(null);
  const { user, refreshUser } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();


  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin);
  const isSuperAdmin = !!(user?.isSuperAdmin);
  // Parse multi-country scope list from JWT
  const adminScopeCountriesList: string[] = (() => {
    if (!isAdmin || isSuperAdmin) return [];
    const raw = (user as any)?.adminScopeCountries;
    if (raw) { try { const p = JSON.parse(raw) as string[]; if (p.length > 0) return p; } catch { /* ignore */ } }
    const single = (user as any)?.adminScopeCountry;
    return single ? [single] : [];
  })();
  const isMultiCountryAdmin = isAdmin && !isSuperAdmin && adminScopeCountriesList.length > 1;
  // scopeLock: only for single-country admin; multi-country and super admin use a picker
  const scopeLock: string | null = (isSuperAdmin || isMultiCountryAdmin) ? null : ((user as any)?.adminScopeCountry ?? user?.country ?? null);
  // The country actually used in all queries
  const effectiveAdminCountry: string | null = isSuperAdmin ? adminCountry : (isMultiCountryAdmin ? adminCountry : scopeLock);
  // Country comes from profile only — GPS handles it server-side for logged-in users
  const activeCountry = user?.country ?? undefined;

  // ── Location detection state ──
  const [locationMode, setLocationModeState] = useState<LocationMode>("auto");
  const [gpsDetecting, setGpsDetecting] = useState(false);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const detectingRef = useRef(false);
  const hasGps = !!(user && (user as any).latitude != null && (user as any).longitude != null);

  // ── Boost state (localStorage) ──
  const { state: boostState, markIgnored, markSeen } = useBoostState(user?.id);

  // ── Stable boost positions (extend as pages load, reset on filter change) ──
  const boostPositionsRef = useRef<number[]>([]);
  const lastFilterKeyRef = useRef("");
  const lastProcessedLengthRef = useRef(0);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // ── Queries ──
  // Pass the correct country so recentListings/featuredListings are always
  // scoped to what the viewer is allowed to see:
  //   • super admin + specific country → filter to that country
  //   • super admin + "All Countries"  → no filter (see everything)
  //   • scoped admin                   → locked to their assigned country
  //   • regular user                   → filter to their country
  const statsCountry = isAdmin ? (effectiveAdminCountry ?? null) : (activeCountry ?? null);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/stats/home", statsCountry],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statsCountry) params.set("country", statsCountry);
      return apiFetch<any>(`/api/stats/home${statsCountry ? `?${params}` : ""}`);
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: categories } = useGetCategories();

  // ── Infinite scroll feed ──
  const {
    data: feedPages,
    isLoading: feedLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["listings-infinite", activeCategory, isAdmin ? `admin-${effectiveAdminCountry ?? "all"}` : scope, activeCountry ?? "none"],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: "20",
        ...(activeCategory ? { category: activeCategory } : {}),
        ...(isAdmin
          ? effectiveAdminCountry ? { country: effectiveAdminCountry } : {}
          : scope !== "country" ? { scope } : {}),
      });
      return apiFetch<{ listings: NormalListing[]; page: number; totalPages: number }>(
        `/api/listings?${params}`
      );
    },
    initialPageParam: 1,
    getNextPageParam: (last) => last.page < last.totalPages ? last.page + 1 : undefined,
    staleTime: 2 * 60 * 1000,
  });

  // Flatten all pages into one list
  const allListings = useMemo(
    () => (feedPages?.pages ?? []).flatMap(p => p.listings),
    [feedPages?.pages]
  );

  // Boosted feed — audience-targeted boosted listings
  const { data: boostedFeedData } = useQuery({
    queryKey: ["boosted-feed", user?.id, activeCategory],
    queryFn: () =>
      apiFetch<{ listings: NormalListing[] }>("/api/listings/boosted-feed"),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const boostedListings = useMemo(
    () => (boostedFeedData?.listings ?? []).filter(l =>
      !activeCategory || l.categorySlug === activeCategory
    ),
    [boostedFeedData?.listings, activeCategory]
  );

  // ── Build interleaved feed (stable boost positions that grow with pages) ──
  const feedItems = useMemo((): FeedItem[] => {
    const filterKey = `${activeCategory ?? "all"}__${isAdmin ? `admin-${effectiveAdminCountry ?? "all"}` : scope}`;
    const normal = allListings.filter(l => !activeCategory || l.categorySlug === activeCategory);

    if (normal.length === 0) return [];

    // Reset boost positions when query filter changes (new feed)
    if (filterKey !== lastFilterKeyRef.current) {
      lastFilterKeyRef.current = filterKey;
      boostPositionsRef.current = [];
      lastProcessedLengthRef.current = 0;
    }

    // Extend boost positions as more items load (1 boost per 12–20 normal items)
    if (normal.length > lastProcessedLengthRef.current) {
      let pos = boostPositionsRef.current.length > 0
        ? boostPositionsRef.current[boostPositionsRef.current.length - 1] + Math.floor(Math.random() * 9) + 12
        : Math.floor(Math.random() * 9) + 12;
      while (pos <= normal.length) {
        boostPositionsRef.current.push(pos);
        pos += Math.floor(Math.random() * 9) + 12;
      }
      lastProcessedLengthRef.current = normal.length;
    }

    return buildFeedWithBoosts(normal, boostedListings, boostState, boostPositionsRef.current);
  }, [allListings, boostedListings, boostState, activeCategory, isAdmin, effectiveAdminCountry, scope]);

  // ── Load persisted locationMode when user is ready ──
  useEffect(() => {
    if (!user?.id) return;
    setLocationModeState(loadLocationMode(user.id));
    // Seed detectedCity from cached position if available
    const cached = loadCachedPosition(user.id);
    if (cached?.city) setDetectedCity(cached.city);
  }, [user?.id]);

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
        // Resolve state: prefer GPS-geocoded state, fall back to city→state map
        const geoState = geo.state ?? STATE_BY_CITY[city] ?? null;

        // Update server — include state so state-level feed filtering works
        await apiFetch("/api/me/location", {
          method: "PATCH",
          body: JSON.stringify({
            latitude: lat,
            longitude: lng,
            ...(city ? { location: city } : {}),
            ...(geoState ? { state: geoState } : {}),
          }),
        });

        // Refresh user so feed queries (keyed on user.location) re-run
        await refreshUser?.();

        // Invalidate feed + boosted queries for immediate refresh
        queryClient.invalidateQueries({ queryKey: ["listings"] });
        queryClient.invalidateQueries({ queryKey: ["boosted-feed"] });
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
    try {
      await apiFetch("/api/me/location", {
        method: "PATCH",
        body: JSON.stringify({ location: city }),
      });
      await refreshUser?.();
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["boosted-feed"] });
    } catch {}
  }, [setLocationMode, refreshUser, queryClient]);

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
  // Display city: prefer freshly detected > user profile location > country fallback
  const displayCity = detectedCity ?? user?.location ?? null;

  return (
    <div className="w-full">
      {/* === TOP SEARCH BAR === */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
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

      <div className="px-4 py-4 space-y-6">

        {/* === ADMIN VIEW BANNER + COUNTRY PICKER === */}
        {/* Super admin: full dropdown with "All Countries" option */}
        {isAdmin && isSuperAdmin && (
          <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-500 shrink-0" />
              <span className="text-sm font-semibold text-foreground">
                {t("home.adminView", "Admin View")}
              </span>
              <span className="text-xs text-muted-foreground flex-1 truncate">
                — {adminCountry
                  ? t("home.filteringByCountry", { country: adminCountry, defaultValue: adminCountry })
                  : t("home.allCountriesDesc", "All Countries")}
              </span>
            </div>
            <MobileSelect
              value={adminCountry ?? "all"}
              onValueChange={v => setAdminCountry(v === "all" ? null : v)}
              placeholder={`🌍 ${t("home.allCountriesDesc", "All Countries")}`}
              options={[
                { value: "all", label: `🌍 ${t("home.allCountriesDesc", "All Countries")}` },
                ...SUPPORTED_COUNTRIES.map(c => ({ value: c, label: `${COUNTRY_FLAGS[c]} ${c}` })),
              ]}
              className="h-9 w-full text-sm"
              data-testid="select-admin-country"
            />
          </div>
        )}
        {/* Multi-country scoped admin: dropdown limited to their assigned countries */}
        {isAdmin && !isSuperAdmin && isMultiCountryAdmin && (
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
              <span className="text-xs bg-violet-200 dark:bg-violet-800 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full font-medium">
                {adminScopeCountriesList.length} {t("home.countries", "pays")}
              </span>
            </div>
            <MobileSelect
              value={adminCountry ?? "all"}
              onValueChange={v => setAdminCountry(v === "all" ? null : v)}
              placeholder={`🌍 ${t("home.allCountriesDesc", "All Countries")}`}
              options={[
                { value: "all", label: `🌍 ${t("home.allCountriesDesc", "All Countries")}` },
                ...adminScopeCountriesList.map(c => ({ value: c, label: `${COUNTRY_FLAGS[c] ?? ""} ${c}` })),
              ]}
              className="h-9 w-full text-sm"
              data-testid="select-admin-country-scoped"
            />
          </div>
        )}
        {/* Single-country scoped admin: locked banner — no dropdown */}
        {isAdmin && !isSuperAdmin && !isMultiCountryAdmin && (
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
        {user && !isAdmin && !user.country && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-6 sm:pb-0">
            <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🌍</span>
                <div>
                  <p className="text-base font-bold text-foreground">
                    {t("home.selectCountryTitle", "Chwazi peyi ou")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("home.selectCountryDesc", "Ou bezwen chwazi peyi ou pou wè pwodwi nan zòn ou.")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {SUPPORTED_COUNTRIES.map(c => (
                  <button
                    key={c}
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border hover:bg-muted/60 active:scale-[0.98] transition-all text-left"
                    onClick={async () => {
                      try {
                        await apiFetch("/api/me/country", {
                          method: "PATCH",
                          body: JSON.stringify({ country: c }),
                        });
                      } catch {}
                      await refreshUser?.();
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
        {user && !isAdmin && activeCountry && (
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
        {user && !isAdmin && (
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4">
            {(["nearby", "city", "country"] as Scope[]).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
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

        {/* === CATEGORY CHIPS === */}
        {categories && categories.length > 0 && (
          <div>
            <div
              className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-4 px-4"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <button
                onClick={() => setActiveCategory(null)}
                className={cn(
                  "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all",
                  activeCategory === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-foreground border-border hover:border-primary/50"
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
                    "flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all whitespace-nowrap",
                    activeCategory === cat.slug
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-foreground border-border hover:border-primary/50"
                  )}
                  data-testid={`button-category-${cat.slug}`}
                >
                  <span className="text-base leading-none">{cat.icon}</span>
                  {t(`categories.${cat.slug}`, { defaultValue: cat.name })}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* === FEATURED BOOSTED LISTINGS (horizontal carousel) === */}
        {isLoading ? (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-amber-500" />
              <h2 className="text-base font-bold text-foreground">{t("home.featured")}</h2>
            </div>
            <div className="flex gap-3 overflow-x-hidden">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="flex-shrink-0 w-48 h-52 rounded-xl" />
              ))}
            </div>
          </section>
        ) : stats?.featuredListings && stats.featuredListings.length > 0 ? (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                <h2 className="text-base font-bold text-foreground">{t("home.featured")}</h2>
              </div>
              <button
                onClick={() => setLocation("/search?boosted=true")}
                className="flex items-center gap-0.5 text-xs text-primary font-semibold"
              >
                {t("buttons.seeAll")} <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div
              className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              {stats.featuredListings.map((l: NormalListing) => (
                <div key={l.id} className="flex-shrink-0 w-44 sm:w-52">
                  <ListingCard listing={l} compact />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* === VIDEO PROMO SECTION === */}
        <VideoPromoSection />

        {/* === MAIN FEED (city-first, boosted interleaved) === */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" />
              <h2 className="text-base font-bold text-foreground">
                {activeCategory
                  ? categories?.find(c => c.slug === activeCategory)?.name ?? t("home.justListed")
                  : t("home.justListed")}
              </h2>
            </div>
            <button
              onClick={() => setLocation(activeCategory ? `/search?category=${activeCategory}` : "/search")}
              className="flex items-center gap-0.5 text-xs text-primary font-semibold"
              data-testid="button-view-all"
            >
              {t("buttons.seeAll")} <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {feedLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))}
            </div>
          ) : feedItems.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {feedItems.map(item => {
                  if (item.type === "boosted") {
                    return (
                      <BoostedPostCard
                        key={item.key}
                        listing={item.listing}
                        onSkip={markIgnored}
                        onSeen={markSeen}
                      />
                    );
                  }
                  return <ListingCard key={item.key} listing={item.listing} />;
                })}
                {isFetchingNextPage && [...Array(4)].map((_, i) => (
                  <Skeleton key={`skel-next-${i}`} className="aspect-[3/4] rounded-xl" />
                ))}
              </div>

              {/* Sentinel: triggers next page load when scrolled into view */}
              <div ref={sentinelRef} className="h-px" />

              {/* Bottom state: spinner while fetching, "all caught up" when done */}
              {isFetchingNextPage ? (
                <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">{t("home.loadingMore", { defaultValue: "Loading more…" })}</span>
                </div>
              ) : !hasNextPage ? (
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
              ) : null}
            </>
          ) : stats?.recentListings && stats.recentListings.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {stats.recentListings.map((l: NormalListing) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 bg-muted/30 border border-border rounded-2xl">
              <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold text-foreground">{t("home.noListings")}</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4">{t("home.noListingsDesc")}</p>
              <Button onClick={() => setLocation("/sell")} data-testid="button-start-selling">
                {t("nav.sell")}
              </Button>
            </div>
          )}
        </section>

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
