import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Bell,
  ChefHat,
  Cookie,
  Filter,
  MapPin,
  Search,
  Store,
  Truck,
  UtensilsCrossed,
  Soup,
} from "lucide-react";
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

const CATEGORY_ICONS: Record<string, typeof Store> = {
  all: UtensilsCrossed,
  traditional: Store,
  home_kitchen: ChefHat,
  food_truck: Truck,
  bakery: Cookie,
  catering: Soup,
};

const CATEGORY_COLORS: Record<string, string> = {
  all: "bg-[hsl(152,55%,28%)] text-white",
  traditional: "text-red-600",
  home_kitchen: "text-[hsl(152,55%,32%)]",
  food_truck: "text-orange-500",
  bakery: "text-amber-700",
  catering: "text-[hsl(152,45%,35%)]",
};

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
  const [sortBy, setSortBy] = useState<"rating" | "distance" | "name">("rating");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => {
    if (user?.country && !country) setCountry(user.country);
  }, [user?.country, country]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 8000 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const fulfillment = pickup && !delivery ? "pickup" : delivery && !pickup ? "delivery" : undefined;
    fetchRestaurants({
      q: debouncedQ || undefined,
      country: country || undefined,
      businessType: businessType === "all" ? undefined : businessType,
      openNow: openNow || undefined,
      topRated: topRated || undefined,
      fulfillment,
      menuPreview: true,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      sortBy: lat != null && lng != null && sortBy === "distance" ? "distance" : sortBy === "name" ? "name" : "rating",
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
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, country, businessType, openNow, pickup, delivery, topRated, sortBy, lat, lng]);

  const featured = useMemo(
    () => rows.filter((r) => r.avgRating >= 4.5).slice(0, 8),
    [rows],
  );
  const availableNow = useMemo(
    () => rows.filter((r) => r.openNow || r.isOpenNow),
    [rows],
  );
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
    return {
      title: t("restaurant.bannerAllTitle", { defaultValue: "Discover Local Restaurants" }),
      body: t("restaurant.bannerAllBody", { defaultValue: "Order or reserve meals — zero Flexa commission." }),
    };
  }, [businessType, t]);

  const sectionTitle =
    businessType === "all"
      ? t("restaurant.nearYou", { defaultValue: "Restaurants Near You" })
      : t(`restaurant.${businessTypeLabelSection(businessType)}`, {
          defaultValue: "Establishments Near You",
        });

  return (
    <div className="space-y-5">
      {/* Location + search */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex max-w-[70%] items-center gap-1.5 text-sm font-semibold text-[hsl(152,40%,22%)]"
            onClick={() => setShowFilters((v) => !v)}
          >
            <MapPin className="h-4 w-4 text-[hsl(152,55%,32%)]" />
            <span className="truncate">
              {country || t("restaurant.chooseLocation", { defaultValue: "Choose location" })}
            </span>
          </button>
          <Link
            href="/restaurant/my-orders"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white text-[hsl(152,45%,28%)] shadow-sm"
            aria-label={t("restaurant.notifications", { defaultValue: "Notifications" })}
          >
            <Bell className="h-4 w-4" />
          </Link>
        </div>

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

      {/* Categories */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" data-testid="restaurant-categories">
        {BUSINESS_TYPES.map((cat) => {
          const Icon = CATEGORY_ICONS[cat.id] || UtensilsCrossed;
          const active = businessType === cat.id;
          const dedicatedHref =
            cat.id === "traditional" ? "/restaurant/restaurants"
              : cat.id === "food_truck" ? "/restaurant/food-trucks"
                : cat.id === "home_kitchen" ? "/restaurant/home-kitchens"
                  : cat.id === "all" ? "/restaurant" : null;
          const className = cn(
            "flex w-[76px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border px-2 py-2.5 text-center transition",
            active
              ? "border-[hsl(152,50%,40%)] bg-[hsl(152,55%,28%)] text-white shadow-md"
              : "border-black/5 bg-white text-[hsl(152,25%,20%)] shadow-sm",
          );
          const inner = (
            <>
              <span
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  active ? "bg-white/15" : "bg-[hsl(152,30%,96%)]",
                  !active && CATEGORY_COLORS[cat.id],
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-[10px] font-bold leading-tight">
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
      <div className="relative overflow-hidden rounded-2xl bg-[hsl(152,55%,18%)] text-white shadow-md">
        <div className="absolute inset-0 opacity-30">
          <div className="h-full w-full bg-[radial-gradient(circle_at_80%_30%,rgba(255,255,255,0.35),transparent_55%)]" />
        </div>
        <div className="relative flex items-center gap-3 p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold tracking-tight sm:text-xl">{bannerCopy.title}</p>
            <p className="mt-1 text-sm text-white/80">{bannerCopy.body}</p>
          </div>
          <span className="hidden h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/10 sm:flex">
            <ChefHat className="h-10 w-10" />
          </span>
        </div>
      </div>

      {/* Featured strip */}
      {featured.length > 0 && businessType === "all" && (
        <section>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-base font-extrabold tracking-tight">{t("restaurant.featured", { defaultValue: "Featured" })}</h2>
            <span className="text-xs font-semibold text-[hsl(152,55%,28%)]">{featured.length}</span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {featured.map((r) => (
              <Link
                key={r.id}
                href={`/restaurant/${r.id}`}
                className="w-[220px] shrink-0 overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm"
              >
                <div className="h-28 bg-[hsl(152,25%,92%)]">
                  {(r.coverUrl || r.menuPreview?.[0]?.photos?.[0]) && (
                    <img
                      src={r.coverUrl || r.menuPreview![0].photos[0]}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="p-3">
                  <p className="truncate text-sm font-extrabold">{r.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.avgRating > 0 ? `★ ${r.avgRating.toFixed(1)}` : typeLabel(r.businessType, t)}
                    {r.cuisineTags?.[0] ? ` · ${r.cuisineTags[0]}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Available now */}
      {availableNow.length > 0 && businessType === "all" && !openNow && (
        <section>
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-base font-extrabold tracking-tight">{t("restaurant.availableNowSection", { defaultValue: "Available Now" })}</h2>
            <button type="button" className="text-xs font-bold text-[hsl(152,55%,28%)]" onClick={() => setOpenNow(true)}>
              {t("restaurant.seeAll", { defaultValue: "See all" })} ({availableNow.length})
            </button>
          </div>
          <div className="space-y-3">
            {availableNow.slice(0, 3).map((r) => (
              <RestaurantCard key={`open-${r.id}`} restaurant={r} compact />
            ))}
          </div>
        </section>
      )}

      {/* Main list */}
      <section>
        <div className="mb-3 flex items-end justify-between gap-2">
          <h2 className="text-base font-extrabold tracking-tight sm:text-lg">
            {sectionTitle}
            {!loading && !error ? (
              <span className="ml-1.5 text-sm font-semibold text-muted-foreground">({rows.length})</span>
            ) : null}
          </h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
            <RestaurantCardSkeleton />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-white p-5 shadow-sm">
            <p className="text-sm font-bold text-destructive">
              {/403|restricted|disabled|preview|country/i.test(error)
                ? t("restaurant.accessRestricted", {
                    defaultValue: "Flexa Restaurant is not available for this location or account.",
                  })
                : t("restaurant.loadError", {
                    defaultValue: "We could not load restaurants. Please try again.",
                  })}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <button
              type="button"
              className="mt-4 rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white"
              onClick={() => {
                setError(null);
                setLoading(true);
                fetchRestaurants({
                  q: debouncedQ || undefined,
                  country: country || undefined,
                  businessType: businessType === "all" ? undefined : businessType,
                  openNow: openNow || undefined,
                  topRated: topRated || undefined,
                  fulfillment: pickup && !delivery ? "pickup" : delivery && !pickup ? "delivery" : undefined,
                  menuPreview: true,
                  lat: lat ?? undefined,
                  lng: lng ?? undefined,
                  sortBy: lat != null && lng != null && sortBy === "distance" ? "distance" : sortBy === "name" ? "name" : "rating",
                  status: "published",
                  limit: 48,
                })
                  .then((list) => { setRows(list); setError(null); })
                  .catch((err: Error) => { setRows([]); setError(err.message); })
                  .finally(() => setLoading(false));
              }}
            >
              {t("common.retry", { defaultValue: "Retry" })}
            </button>
          </div>
        ) : rows.length === 0 ? (
          <RestaurantEmpty
            title={t("restaurant.emptyTitle")}
            body={t("restaurant.emptyBody")}
            action={
              <Link href="/restaurant/add" className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
                {t("restaurant.addRestaurant")}
              </Link>
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

function businessTypeLabelSection(type: string) {
  const map: Record<string, string> = {
    traditional: "nearYouRestaurants",
    home_kitchen: "nearYouHomeKitchens",
    food_truck: "nearYouFoodTrucks",
    bakery: "nearYouBakeries",
    catering: "nearYouCatering",
  };
  return map[type] || "nearYou";
}

function typeLabel(type: string, t: (k: string, o?: Record<string, unknown>) => string) {
  const key = BUSINESS_TYPES.find((b) => b.id === type)?.labelKey || "restaurant.catRestaurants";
  return t(key);
}
