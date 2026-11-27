import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Filter, MapPin, Search } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantCard, RestaurantCardSkeleton } from "@/components/restaurant/RestaurantCard";
import {
  BUSINESS_TYPES,
  fetchRestaurants,
  type Restaurant,
} from "@/lib/restaurantApi";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

export default function RestaurantDiscover({
  embedded,
  initialType = "all",
}: {
  embedded?: boolean;
  initialType?: string;
} = {}) {
  const { t } = useTranslation();
  const body = <DiscoverBody initialType={initialType} />;
  if (embedded) return body;
  return (
    <RestaurantPageGate>
      <RestaurantShell>
        {body}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function DiscoverBody({ initialType = "all" }: { initialType?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [country, setCountry] = useState(user?.country ?? "");
  const [businessType, setBusinessType] = useState(initialType);
  const [openNow, setOpenNow] = useState(false);
  const [pickup, setPickup] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [topRated, setTopRated] = useState(false);
  const [sortBy, setSortBy] = useState<"rating" | "distance" | "name">("distance");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (user?.country && !country) setCountry(user.country);
  }, [user?.country, country]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setGeoDenied(false);
      },
      () => setGeoDenied(true),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  // Refresh availability when returning to the tab/app.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setReloadToken((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fulfillment = pickup && !delivery ? "pickup" : delivery && !pickup ? "delivery" : undefined;
    const effectiveSort =
      lat != null && lng != null && sortBy === "distance"
        ? "distance"
        : sortBy === "name"
          ? "name"
          : sortBy === "distance"
            ? "rating"
            : sortBy;
    fetchRestaurants({
      q: debouncedQ || undefined,
      country: country || undefined,
      businessType: businessType === "all" ? undefined : businessType,
      openNow: openNow || undefined,
      topRated: topRated || undefined,
      fulfillment,
      menuPreview: true,
      nearby: lat != null && lng != null,
      radiusKm: lat != null && lng != null ? 40 : undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      sortBy: effectiveSort,
      status: "published",
      limit: 48,
    })
      .then((list) => {
        if (!cancelled) {
          setRows(list);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setRows([]);
          // Never show raw Internal server error / SQL to customers.
          const raw = String(err?.message || "");
          if (/401|unauthorized/i.test(raw)) {
            setError("auth");
          } else if (/403|restricted|disabled|preview|country/i.test(raw)) {
            setError("restricted");
          } else {
            setError("load");
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, country, businessType, openNow, pickup, delivery, topRated, sortBy, lat, lng, reloadToken]);

  const bannerCopy = useMemo(() => {
    if (businessType === "home_kitchen") {
      return {
        title: t("restaurant.bannerHomeKitchenTitle", { defaultValue: "Home Kitchen" }),
        body: t("restaurant.bannerHomeKitchenBody", {
          defaultValue: "Fresh, homemade meals from local cooks.",
        }),
      };
    }
    if (businessType === "food_truck") {
      return {
        title: t("restaurant.bannerFoodTruckTitle", { defaultValue: "Food Trucks" }),
        body: t("restaurant.bannerFoodTruckBody", {
          defaultValue: "Find trucks nearby and today’s specials.",
        }),
      };
    }
    if (businessType === "bakery") {
      return {
        title: t("restaurant.bannerBakeryTitle", { defaultValue: "Bakeries" }),
        body: t("restaurant.bannerBakeryBody", { defaultValue: "Fresh bread, pastries, and cakes nearby." }),
      };
    }
    if (businessType === "catering") {
      return {
        title: t("restaurant.bannerCateringTitle", { defaultValue: "Catering" }),
        body: t("restaurant.bannerCateringBody", { defaultValue: "Professional buffets for your next event." }),
      };
    }
    return {
      title: t("restaurant.bannerAllTitle", { defaultValue: "Discover Local Restaurants" }),
      body: t("restaurant.bannerAllBody", { defaultValue: "Order or reserve meals — zero Flexa commission." }),
    };
  }, [businessType, t]);

  const sectionTitle = t("restaurant.nearYouShort", { defaultValue: "Near You" });

  const friendlyError =
    error === "auth"
      ? t("restaurant.authRequired", { defaultValue: "Sign in to browse Flexa Restaurant (staff preview)." })
      : error === "restricted"
        ? t("restaurant.accessRestricted", {
            defaultValue: "Flexa Restaurant is not available for this location or account.",
          })
        : error
          ? t("restaurant.loadErrorNearby", {
              defaultValue: "Unable to load nearby businesses. Please try again.",
            })
          : null;

  return (
    <div className="space-y-4">
      {/* Location + search */}
      <div className="space-y-3">
        <button
          type="button"
          className="inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-[hsl(152,40%,22%)]"
          onClick={() => setShowFilters((v) => !v)}
        >
          <MapPin className="h-4 w-4 text-[hsl(152,55%,32%)]" />
          <span className="truncate">
            {country || t("restaurant.chooseLocation", { defaultValue: "Choose location" })}
            {geoDenied ? ` · ${t("restaurant.locationManual", { defaultValue: "manual location" })}` : ""}
          </span>
        </button>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("restaurant.searchPlaceholder")}
            className="w-full rounded-2xl border border-black/5 bg-white py-3 pl-10 pr-12 text-sm shadow-sm outline-none ring-[hsl(152,55%,28%)] focus:ring-2"
            data-testid="restaurant-search"
          />
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl bg-[hsl(152,45%,94%)] text-[hsl(152,55%,28%)]"
            aria-label={t("restaurant.filters", { defaultValue: "Filters" })}
          >
            <Filter className="h-4 w-4" />
          </button>
        </div>

        {showFilters && (
          <div className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm space-y-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("restaurant.country", { defaultValue: "Country" })}
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm"
            >
              <option value="">{t("restaurant.cuisineAll", { defaultValue: "All" })}</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={openNow} onClick={() => setOpenNow((v) => !v)} label={t("restaurant.openNow")} />
              <FilterChip active={pickup} onClick={() => setPickup((v) => !v)} label={t("restaurant.pickup")} />
              <FilterChip active={delivery} onClick={() => setDelivery((v) => !v)} label={t("restaurant.delivery")} />
              <FilterChip active={topRated} onClick={() => setTopRated((v) => !v)} label={t("restaurant.topRated", { defaultValue: "Top rated" })} />
            </div>
            <div className="flex flex-wrap gap-2">
              <FilterChip active={sortBy === "rating"} onClick={() => setSortBy("rating")} label={t("restaurant.sortRating", { defaultValue: "Rating" })} />
              <FilterChip active={sortBy === "distance"} onClick={() => setSortBy("distance")} label={t("restaurant.sortDistance", { defaultValue: "Distance" })} />
              <FilterChip active={sortBy === "name"} onClick={() => setSortBy("name")} label={t("restaurant.sortName", { defaultValue: "Name" })} />
            </div>
          </div>
        )}
      </div>

      {/* Photographic categories */}
      <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 scrollbar-thin" data-testid="restaurant-categories">
        {BUSINESS_TYPES.map((cat) => {
          const active = businessType === cat.id;
          const dedicatedHref =
            cat.id === "traditional" ? "/restaurant/restaurants"
              : cat.id === "food_truck" ? "/restaurant/food-trucks"
                : cat.id === "home_kitchen" ? "/restaurant/home-kitchens"
                  : cat.id === "bakery" ? "/restaurant/bakeries"
                    : cat.id === "catering" ? "/restaurant/catering"
                      : cat.id === "all" ? "/restaurant" : null;
          const className = cn(
            "flex w-[78px] shrink-0 flex-col items-center gap-1.5 rounded-2xl px-1.5 py-2 text-center transition",
            active
              ? "bg-[hsl(152,55%,28%)] text-white shadow-md"
              : "bg-white text-[hsl(152,25%,20%)] shadow-sm border border-black/5",
          );
          const inner = (
            <>
              <span className="relative h-[58px] w-[58px] overflow-hidden rounded-xl bg-[hsl(152,20%,92%)] ring-1 ring-black/5">
                <img
                  src={cat.photo}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="lazy"
                  width={58}
                  height={58}
                />
              </span>
              <span className={cn("text-[11px] font-bold leading-tight", active ? "text-white" : "text-[hsl(152,40%,22%)]")}>
                {t(cat.labelKey, { defaultValue: cat.id })}
              </span>
            </>
          );
          if (dedicatedHref) {
            return (
              <Link key={cat.id} href={dedicatedHref} className={className} data-testid={`restaurant-cat-${cat.id}`}>
                {inner}
              </Link>
            );
          }
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setBusinessType(cat.id)}
              className={className}
              data-testid={`restaurant-cat-${cat.id}`}
            >
              {inner}
            </button>
          );
        })}
      </div>

      {/* Promo banner */}
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(152,55%,18%)] px-4 py-4 text-white shadow-md sm:px-5 sm:py-5">
        <p className="text-lg font-extrabold tracking-tight sm:text-xl">{bannerCopy.title}</p>
        <p className="mt-1 text-sm text-white/80">{bannerCopy.body}</p>
      </div>

      {/* Main list — Near You */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-base font-extrabold tracking-tight sm:text-lg">
            {sectionTitle}
            {!loading && !error ? (
              <span className="ml-1.5 text-sm font-semibold text-muted-foreground">({rows.length})</span>
            ) : null}
          </h2>
          <Link
            href={`/restaurant/map${country ? `?country=${encodeURIComponent(country)}` : ""}`}
            className="inline-flex items-center gap-1 text-xs font-bold text-[hsl(152,55%,28%)]"
            data-testid="restaurant-view-map"
          >
            <MapPin className="h-3.5 w-3.5" />
            {t("restaurant.viewMap", { defaultValue: "View Map" })}
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/15 bg-white p-5 shadow-sm" data-testid="restaurant-discover-error">
            <p className="text-sm font-bold text-[hsl(0,55%,40%)]">{friendlyError}</p>
            <button
              type="button"
              className="mt-4 rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white"
              onClick={() => setReloadToken((n) => n + 1)}
            >
              {t("common.retry", { defaultValue: "Retry" })}
            </button>
          </div>
        ) : rows.length === 0 ? (
          <RestaurantEmpty
            title={t("restaurant.emptyNearbyTitle", { defaultValue: "No businesses found near you." })}
            body={t("restaurant.emptyNearbyBody", {
              defaultValue: "Try another location, expand your search, or add your kitchen.",
            })}
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="rounded-full border border-[hsl(152,40%,70%)] px-4 py-2 text-sm font-bold text-[hsl(152,55%,28%)]"
                  onClick={() => setShowFilters(true)}
                >
                  {t("restaurant.changeLocation", { defaultValue: "Change location" })}
                </button>
                <Link href="/restaurant/add" className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
                  {t("restaurant.addRestaurant")}
                </Link>
              </div>
            }
          />
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.id}>
                <RestaurantCard restaurant={r} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold",
        active
          ? "border-[hsl(152,50%,35%)] bg-[hsl(152,45%,92%)] text-[hsl(152,55%,22%)]"
          : "border-border bg-white text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

