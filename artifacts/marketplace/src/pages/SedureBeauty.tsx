import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MapPin, Search } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyNotice, BeautyShell } from "@/components/beauty/BeautyShell";
import { BeautyCard, BeautyCardSkeleton } from "@/components/beauty/BeautyCard";
import { BeautyCategoryCard } from "@/components/beauty/BeautyCategoryCard";
import {
  fetchBeautyBusinesses,
  fetchBeautyFavorites,
  fetchBeautyRecentlyViewed,
  type BeautyBusiness,
} from "@/lib/beautyApi";
import { BEAUTY_HOME_CATEGORIES, BEAUTY_PRIMARY_CATEGORIES } from "@/lib/beautyCategoriesCatalog";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-2">
        <h2 className="text-base font-extrabold tracking-tight text-[hsl(350,20%,14%)] sm:text-lg">
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-xs font-semibold text-[hsl(350,45%,40%)]">
            {t("beauty.seeAll", { defaultValue: "See all" })}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function HubBody() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [country, setCountry] = useState(user?.country ?? "");
  const [q, setQ] = useState("");
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [nearby, setNearby] = useState<BeautyBusiness[]>([]);
  const [featured, setFeatured] = useState<BeautyBusiness[]>([]);
  const [topRated, setTopRated] = useState<BeautyBusiness[]>([]);
  const [recent, setRecent] = useState<BeautyBusiness[]>([]);
  const [favorites, setFavorites] = useState<BeautyBusiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    const base = {
      country: country || undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      nearby: lat != null && lng != null,
      radiusKm: lat != null && lng != null ? 40 : undefined,
      limit: 8,
    };
    Promise.all([
      fetchBeautyBusinesses({ ...base, sortBy: lat != null ? "distance" : "rating" }),
      fetchBeautyBusinesses({ ...base, featured: true, sortBy: "rating" }),
      fetchBeautyBusinesses({ ...base, minRating: 4, sortBy: "rating" }),
      user ? fetchBeautyRecentlyViewed().catch(() => []) : Promise.resolve([]),
      user ? fetchBeautyFavorites().catch(() => []) : Promise.resolve([]),
    ])
      .then(([nearRes, featRes, topRes, recentRows, favRows]) => {
        if (cancelled) return;
        setNearby(nearRes.businesses);
        setFeatured(featRes.businesses);
        setTopRated(topRes.businesses);
        setRecent(recentRows);
        setFavorites(favRows);
        setError(null);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setNearby([]);
        setFeatured([]);
        setTopRated([]);
        const raw = String(err?.message || "");
        if (/401|unauthorized/i.test(raw)) setError("auth");
        else if (/403|restricted|preview|country/i.test(raw)) setError("restricted");
        else setError("load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country, lat, lng, user]);

  const friendlyError =
    error === "auth"
      ? t("beauty.authRequired")
      : error === "restricted"
        ? t("beauty.accessRestricted")
        : error
          ? t("beauty.loadError")
          : null;

  const searchHref = q.trim()
    ? `/beauty/discover?q=${encodeURIComponent(q.trim())}${country ? `&country=${encodeURIComponent(country)}` : ""}`
    : `/beauty/discover${country ? `?country=${encodeURIComponent(country)}` : ""}`;

  return (
    <div className="space-y-6">
      <BeautyNotice>{t("beauty.privacyNotice")}</BeautyNotice>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2.5 text-sm shadow-sm">
            <MapPin className="h-4 w-4 shrink-0 text-[hsl(350,40%,42%)]" />
            <select
              className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              aria-label={t("beauty.chooseLocation")}
            >
              <option value="">{t("beauty.chooseLocation")}</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Link
            href={`/beauty/map${country ? `?country=${encodeURIComponent(country)}` : ""}`}
            className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2.5 text-xs font-bold text-[hsl(350,40%,35%)] shadow-sm"
          >
            {t("beauty.viewMap")}
          </Link>
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            window.location.assign(searchHref);
          }}
        >
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2.5 shadow-sm">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("beauty.searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <Link
            href={searchHref}
            className="inline-flex items-center rounded-xl bg-[hsl(350,45%,38%)] px-4 py-2.5 text-sm font-bold text-white"
          >
            {t("beauty.discoverTitle", { defaultValue: "Discover" })}
          </Link>
        </form>
      </div>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-base font-extrabold tracking-tight text-[hsl(350,20%,14%)]">
            {t("beauty.categoriesTitle", { defaultValue: "Beauty Categories" })}
          </h2>
          <Link
            href="/beauty/categories"
            className="text-xs font-semibold text-[hsl(350,45%,40%)]"
          >
            {t("beauty.seeAllCount", {
              defaultValue: "See all ({{count}})",
              count: BEAUTY_PRIMARY_CATEGORIES.length,
            })}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {BEAUTY_HOME_CATEGORIES.map((tile) => (
            <BeautyCategoryCard
              key={tile.slug}
              href={tile.href}
              labelKey={tile.labelKey}
              fallback={tile.slug}
              photo={tile.photo}
              icon={tile.icon}
            />
          ))}
        </div>
        <Link
          href="/beauty/categories"
          className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-[hsl(350,45%,38%)] bg-white px-4 py-3 text-sm font-bold text-[hsl(350,45%,32%)]"
          data-testid="beauty-view-all-categories"
        >
          {t("beauty.viewAllCategories", { defaultValue: "View All Categories" })}
          <span aria-hidden>→</span>
        </Link>
      </section>

      {friendlyError && (
        <div className="rounded-2xl border border-destructive/15 bg-white p-4 text-sm font-semibold text-[hsl(0,55%,40%)]">
          {friendlyError}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <BeautyCardSkeleton />
          <BeautyCardSkeleton />
        </div>
      ) : (
        <>
          <Section title={t("beauty.nearYou")} href="/beauty/discover">
            {nearby.length === 0 ? (
              <BeautyEmpty title={t("beauty.emptyNearbyTitle")} body={t("beauty.emptyNearbyBody")} />
            ) : (
              <div className="space-y-3">
                {nearby.map((b) => (
                  <BeautyCard key={b.id} business={b} />
                ))}
              </div>
            )}
          </Section>

          {featured.length > 0 && (
            <Section title={t("beauty.featured")} href="/beauty/discover?featured=1">
              <div className="space-y-3">
                {featured.map((b) => (
                  <BeautyCard key={b.id} business={b} />
                ))}
              </div>
            </Section>
          )}

          {topRated.length > 0 && (
            <Section title={t("beauty.topRated")} href="/beauty/discover?minRating=4">
              <div className="space-y-3">
                {topRated.map((b) => (
                  <BeautyCard key={b.id} business={b} />
                ))}
              </div>
            </Section>
          )}

          {/* Promotions: only show when featured list doubles as promo inventory from API */}
          {featured.some((b) => b.featured) && (
            <Section title={t("beauty.promotions")}>
              <div className="space-y-3">
                {featured.filter((b) => b.featured).map((b) => (
                  <BeautyCard key={`promo-${b.id}`} business={b} />
                ))}
              </div>
            </Section>
          )}

          {recent.length > 0 && (
            <Section title={t("beauty.recentlyViewed")}>
              <div className="space-y-3">
                {recent.map((b) => (
                  <BeautyCard key={b.id} business={b} compact />
                ))}
              </div>
            </Section>
          )}

          {favorites.length > 0 && (
            <Section title={t("beauty.favorites")} href="/beauty/favorites">
              <div className="space-y-3">
                {favorites.map((b) => (
                  <BeautyCard key={b.id} business={b} compact />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      <div className="rounded-2xl border border-[hsl(350,25%,88%)] bg-gradient-to-br from-[hsl(350,40%,97%)] to-white p-5 text-center">
        <p className="text-sm font-semibold text-[hsl(350,25%,28%)]">
          {t("beauty.registerBusiness")}
        </p>
        <Link
          href="/beauty/onboarding"
          className="mt-3 inline-flex rounded-xl bg-[hsl(350,45%,38%)] px-4 py-2.5 text-sm font-bold text-white"
        >
          {t("beauty.onboardingTitle")}
        </Link>
      </div>
    </div>
  );
}

export default function SedureBeauty() {
  return (
    <BeautyPageGate>
      <BeautyShell>
        <HubBody />
      </BeautyShell>
    </BeautyPageGate>
  );
}
