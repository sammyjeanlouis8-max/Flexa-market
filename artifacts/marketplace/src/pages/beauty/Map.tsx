import { useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { MapPin, Navigation } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyShell } from "@/components/beauty/BeautyShell";
import { fetchBeautyBusinesses, type BeautyBusiness } from "@/lib/beautyApi";
import { cn } from "@/lib/utils";

export default function BeautyMapPage() {
  return (
    <BeautyPageGate>
      <BeautyShell title="Map">
        <MapBody />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function MapBody() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const search = useSearch();
  const qs = useMemo(
    () => new URLSearchParams(search.startsWith("?") ? search.slice(1) : search),
    [search],
  );
  const country = qs.get("country") || user?.country || "";
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [rows, setRows] = useState<BeautyBusiness[]>([]);
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
    fetchBeautyBusinesses({
      country: country || undefined,
      nearby: lat != null && lng != null,
      radiusKm: 40,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      sortBy: lat != null && lng != null ? "distance" : "rating",
      limit: 48,
    })
      .then((res) => {
        if (!cancelled) {
          setRows(res.businesses);
          setError(false);
          if (res.businesses[0]) setSelectedId(res.businesses[0].id);
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
      <div className="overflow-hidden rounded-2xl border border-[hsl(350,20%,88%)] bg-white shadow-sm">
        <iframe
          title={t("beauty.mapTitle")}
          src={osmSrc}
          className="h-[240px] w-full border-0 sm:h-[320px]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/15 bg-white p-4">
          <p className="text-sm font-bold text-[hsl(0,55%,40%)]">{t("beauty.loadError")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const openish = !!r.openNow;
            const active = selectedId === r.id;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left",
                    active
                      ? "border-[hsl(350,45%,55%)] bg-[hsl(350,40%,96%)]"
                      : "border-[hsl(350,20%,88%)] bg-white",
                  )}
                >
                  <MapPin className={cn("mt-0.5 h-4 w-4 shrink-0", openish ? "text-[hsl(350,45%,40%)]" : "text-muted-foreground")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[r.distanceKm != null ? `${r.distanceKm.toFixed(1)} km` : null, r.city]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Link
                    href={`/beauty/${r.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(350,45%,40%)]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Navigation className="h-3.5 w-3.5" />
                    View
                  </Link>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
