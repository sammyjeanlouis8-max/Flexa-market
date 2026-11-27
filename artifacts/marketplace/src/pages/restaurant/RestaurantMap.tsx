import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  fetchRestaurants,
  restaurantAvailabilityLabel,
  type Restaurant,
} from "@/lib/restaurantApi";
import { cn } from "@/lib/utils";

/**
 * Lightweight map view — OSM embed + list markers.
 * Reuses existing restaurant discovery; no new paid map vendor.
 */
export default function RestaurantMapPage() {
  return (
    <RestaurantPageGate>
      <RestaurantShell title="Map">
        <RestaurantMapBody />
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function RestaurantMapBody() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const search = useSearch();
  const qs = useMemo(() => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search), [search]);
  const country = qs.get("country") || user?.country || "";
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);

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
    fetchRestaurants({
      country: country || undefined,
      menuPreview: false,
      nearby: lat != null && lng != null,
      radiusKm: 40,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      sortBy: lat != null && lng != null ? "distance" : "rating",
      status: "published",
      limit: 48,
    })
      .then((list) => {
        if (!cancelled) {
          setRows(list);
          setError(false);
          if (list[0]) setSelectedId(list[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [country, lat, lng]);

  const selected = rows.find((r) => r.id === selectedId) || rows[0] || null;
  const mapCenterLat = selected?.latitude ?? lat ?? 18.5392;
  const mapCenterLng = selected?.longitude ?? lng ?? -72.335;
  const bbox = `${mapCenterLng - 0.08},${mapCenterLat - 0.06},${mapCenterLng + 0.08},${mapCenterLat + 0.06}`;
  const osmSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${mapCenterLat}%2C${mapCenterLng}`;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-sm">
        <iframe
          title={t("restaurant.mapTitle", { defaultValue: "Nearby businesses map" })}
          src={osmSrc}
          className="h-[240px] w-full border-0 sm:h-[320px]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/15 bg-white p-4">
          <p className="text-sm font-bold text-[hsl(0,55%,40%)]">
            {t("restaurant.loadErrorNearby", { defaultValue: "Unable to load nearby businesses. Please try again." })}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const avail = restaurantAvailabilityLabel(r.availabilityStatus, r.openNow ?? r.isOpenNow);
            const openish = avail.tone === "open" || avail.tone === "soon";
            const active = selectedId === r.id;
            const directions =
              r.latitude != null && r.longitude != null
                ? `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${lat ?? mapCenterLat}%2C${lng ?? mapCenterLng}%3B${r.latitude}%2C${r.longitude}`
                : null;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border bg-white p-3 text-left shadow-sm",
                    active ? "border-[hsl(152,50%,40%)] ring-1 ring-[hsl(152,50%,40%)]" : "border-black/5",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white",
                      openish ? "bg-[hsl(152,55%,32%)]" : "bg-neutral-400",
                    )}
                  >
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-extrabold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`restaurant.${r.businessType === "traditional" ? "catRestaurants" : r.businessType === "home_kitchen" ? "catHomeKitchen" : r.businessType === "food_truck" ? "catFoodTruck" : r.businessType === "bakery" ? "catBakery" : r.businessType === "catering" ? "catCatering" : "catRestaurants"}`, {
                        defaultValue: r.businessType,
                      })}
                      {" · "}
                      {t(avail.key, { defaultValue: avail.tone })}
                      {r.distanceKm != null ? ` · ${r.distanceKm.toFixed(1)} km` : ""}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Link
                        href={`/restaurant/${r.id}`}
                        className="rounded-full bg-[hsl(152,55%,28%)] px-3 py-1 text-[11px] font-bold text-white"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {t("restaurant.viewBusiness", { defaultValue: "View business" })}
                      </Link>
                      {directions && (
                        <a
                          href={directions}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full border border-[hsl(152,40%,70%)] px-3 py-1 text-[11px] font-bold text-[hsl(152,55%,28%)]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Navigation className="h-3 w-3" />
                          {t("restaurant.directions", { defaultValue: "Directions" })}
                        </a>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
