import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Filter, MapPin, Search } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import { BeautyCard, BeautyCardSkeleton } from "@/components/beauty/BeautyCard";
import { fetchBeautyBusinesses, type BeautyBusiness } from "@/lib/beautyApi";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

export default function BeautyDiscover({
  embedded,
  initialType = "all",
  initialCategorySlug,
  title,
  subtitle,
}: {
  embedded?: boolean;
  initialType?: string;
  initialCategorySlug?: string;
  title?: string;
  subtitle?: string;
} = {}) {
  const body = (
    <DiscoverBody initialType={initialType} initialCategorySlug={initialCategorySlug} />
  );
  if (embedded) return body;
  return (
    <BeautyPageGate>
      <BeautyShell title={title} subtitle={subtitle}>
        {body}
      </BeautyShell>
    </BeautyPageGate>
  );
}

/** Route entry for `/beauty/discover` (no custom props from wouter). */
export function BeautyDiscoverPage() {
  return <BeautyDiscover />;
}

function DiscoverBody({
  initialType = "all",
  initialCategorySlug,
}: {
  initialType?: string;
  initialCategorySlug?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const search = useSearch();
  const qs = useMemo(
    () => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
    [search],
  );

  const [q, setQ] = useState(qs.get("q") || "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [country, setCountry] = useState(qs.get("country") || user?.country || "");
  const [businessType, setBusinessType] = useState(initialType);
  const [categorySlug] = useState(initialCategorySlug || qs.get("categorySlug") || "");
  const [openNow, setOpenNow] = useState(false);
  const [homeService, setHomeService] = useState(
    !!initialCategorySlug && initialCategorySlug === "mobile-beauty",
  );
  const [minRating, setMinRating] = useState(qs.get("minRating") ? Number(qs.get("minRating")) : 0);
  const [maxPrice, setMaxPrice] = useState("");
  const [radiusKm, setRadiusKm] = useState(40);
  const [sortBy, setSortBy] = useState<"rating" | "distance" | "name" | "price">("distance");
  const [view, setView] = useState<"list" | "map">("list");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const featuredOnly = qs.get("featured") === "1";

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
    const effectiveSort =
      lat != null && lng != null && sortBy === "distance"
        ? "distance"
        : sortBy === "distance"
          ? "rating"
          : sortBy;
    const maxPriceMinor = maxPrice.trim()
      ? Math.round(Number(maxPrice) * 100)
      : undefined;
    fetchBeautyBusinesses({
      q: debouncedQ || undefined,
      country: country || undefined,
      businessType: categorySlug
        ? undefined
        : businessType === "all"
          ? undefined
          : businessType,
      categorySlug: categorySlug || undefined,
      openNow: openNow || undefined,
      homeService: homeService || undefined,
      featured: featuredOnly || undefined,
      minRating: minRating > 0 ? minRating : undefined,
      maxPriceMinor: maxPriceMinor != null && Number.isFinite(maxPriceMinor) ? maxPriceMinor : undefined,
      nearby: lat != null && lng != null,
      radiusKm: lat != null && lng != null ? radiusKm : undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      sortBy: effectiveSort,
      limit: 48,
    })
      .then((res) => {
        if (!cancelled) {
          setRows(res.businesses);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setRows([]);
          const raw = String(err?.message || "");
          if (/401|unauthorized/i.test(raw)) setError("auth");
          else if (/403|restricted|preview|country/i.test(raw)) setError("restricted");
          else setError("load");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    debouncedQ,
    country,
    businessType,
    categorySlug,
    openNow,
    homeService,
    minRating,
    maxPrice,
    radiusKm,
    sortBy,
    lat,
    lng,
    featuredOnly,
  ]);

  const friendlyError =
    error === "auth"
      ? t("beauty.authRequired")
      : error === "restricted"
        ? t("beauty.accessRestricted")
        : error
          ? t("beauty.loadError")
          : null;

  const mapCenterLat = rows[0]?.latitude ?? lat ?? 18.5392;
  const mapCenterLng = rows[0]?.longitude ?? lng ?? -72.335;
  const bbox = `${mapCenterLng - 0.08},${mapCenterLat - 0.06},${mapCenterLng + 0.08},${mapCenterLat + 0.06}`;
  const osmSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${mapCenterLat}%2C${mapCenterLng}`;

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="flex items-center gap-2 rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2.5 shadow-sm">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("beauty.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 rounded-xl border border-[hsl(350,20%,88%)] bg-white px-2.5 py-2 text-xs shadow-sm">
            <MapPin className="h-3.5 w-3.5 text-[hsl(350,40%,42%)]" />
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="">{t("beauty.country")}</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold shadow-sm",
              showFilters
                ? "border-[hsl(350,40%,70%)] bg-[hsl(350,40%,95%)] text-[hsl(350,40%,32%)]"
                : "border-[hsl(350,20%,88%)] bg-white",
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            {t("beauty.filters")}
          </button>
          <div className="ml-auto flex overflow-hidden rounded-xl border border-[hsl(350,20%,88%)] bg-white text-xs font-semibold shadow-sm">
            <button
              type="button"
              className={cn("px-3 py-2", view === "list" && "bg-[hsl(350,40%,95%)] text-[hsl(350,40%,32%)]")}
              onClick={() => setView("list")}
            >
              {t("beauty.viewList")}
            </button>
            <button
              type="button"
              className={cn("px-3 py-2", view === "map" && "bg-[hsl(350,40%,95%)] text-[hsl(350,40%,32%)]")}
              onClick={() => setView("map")}
            >
              {t("beauty.viewMap")}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid gap-2 rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-3 text-xs sm:grid-cols-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={openNow} onChange={(e) => setOpenNow(e.target.checked)} />
              {t("beauty.openNow")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={homeService} onChange={(e) => setHomeService(e.target.checked)} />
              {t("beauty.homeService")}
            </label>
            <label className="flex flex-col gap-1">
              <span>{t("beauty.minRating")}</span>
              <select
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                className="rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1.5"
              >
                <option value={0}>—</option>
                <option value={3}>3+</option>
                <option value={4}>4+</option>
                <option value={4.5}>4.5+</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span>{t("beauty.maxPrice")}</span>
              <input
                type="number"
                min={0}
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>{t("beauty.radius")} (km)</span>
              <input
                type="number"
                min={1}
                max={200}
                value={radiusKm}
                onChange={(e) => setRadiusKm(Number(e.target.value) || 40)}
                className="rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1.5"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Sort</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1.5"
              >
                <option value="distance">{t("beauty.sortDistance")}</option>
                <option value="rating">{t("beauty.sortRating")}</option>
                <option value="name">{t("beauty.sortName")}</option>
                <option value="price">{t("beauty.sortPrice")}</option>
              </select>
            </label>
            {initialType === "all" && (
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span>{t("beauty.businessType", { defaultValue: "Category" })}</span>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  className="rounded-lg border border-[hsl(350,20%,88%)] px-2 py-1.5"
                >
                  <option value="all">All</option>
                  <option value="beauty_studio">{t("beauty.catBeautyStudio")}</option>
                  <option value="barbershop">{t("beauty.catBarbershop")}</option>
                  <option value="independent_beauty">{t("beauty.catIndependent")}</option>
                  <option value="mobile_beauty">{t("beauty.catMobile")}</option>
                </select>
              </label>
            )}
          </div>
        )}
      </div>

      {friendlyError && (
        <div className="rounded-2xl border border-destructive/15 bg-white p-4 text-sm font-semibold text-[hsl(0,55%,40%)]">
          {friendlyError}
        </div>
      )}

      {view === "map" && (
        <div className="overflow-hidden rounded-2xl border border-[hsl(350,20%,88%)] bg-white shadow-sm">
          <iframe
            title={t("beauty.mapTitle")}
            src={osmSrc}
            className="h-[220px] w-full border-0 sm:h-[280px]"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <BeautyCardSkeleton />
          <BeautyCardSkeleton />
          <BeautyCardSkeleton />
        </div>
      ) : rows.length === 0 ? (
        <BeautyEmpty
          title={t("beauty.emptyTitle")}
          body={t("beauty.emptyBody")}
          action={
            <Link href="/beauty" className="text-sm font-semibold text-[hsl(350,45%,40%)]">
              {t("beauty.back")}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((b) => (
            <BeautyCard key={b.id} business={b} />
          ))}
        </div>
      )}
    </div>
  );
}
