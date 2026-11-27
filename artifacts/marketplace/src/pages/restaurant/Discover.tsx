import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { MapPin, Search, Timer } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { fetchRestaurants, type Restaurant } from "@/lib/restaurantApi";
import { SUPPORTED_COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/utils";

export default function RestaurantDiscover({ embedded }: { embedded?: boolean } = {}) {
  const { t } = useTranslation();
  const body = <DiscoverBody />;
  if (embedded) return body;
  return (
    <RestaurantPageGate>
      <RestaurantShell title={t("restaurant.discoverTitle")} subtitle={t("restaurant.discoverSubtitle")}>
        {body}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function DiscoverBody() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState(user?.country ?? "");
  const [openNow, setOpenNow] = useState(false);
  const [nearby, setNearby] = useState(false);
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.country && !country) setCountry(user.country);
  }, [user?.country, country]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchRestaurants({
      q: q.trim() || undefined,
      country: country || undefined,
      openNow: openNow || undefined,
      nearby: nearby || undefined,
      status: "published",
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
  }, [q, country, openNow, nearby]);

  const inner = (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("restaurant.searchPlaceholder")}
            className="w-full rounded-xl border border-border bg-white py-2.5 pl-9 pr-3 text-sm dark:bg-[hsl(152,16%,12%)]"
          />
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-xl border border-border bg-white px-3 py-2.5 text-sm dark:bg-[hsl(152,16%,12%)]"
        >
          <option value="">{t("restaurant.cuisineAll", { defaultValue: "All" })}</option>
          {SUPPORTED_COUNTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <FilterChip active={openNow} onClick={() => setOpenNow((v) => !v)} label={t("restaurant.openNow")} icon={Timer} />
        <FilterChip active={nearby} onClick={() => setNearby((v) => !v)} label={t("restaurant.nearby")} icon={MapPin} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading", { defaultValue: "Loading…" })}</p>
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
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/restaurant/${r.id}`}
                className="block rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
              >
                <motionRow r={r} t={t} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return inner;
}

function FilterChip({
  active,
  onClick,
  label,
  icon: Icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: typeof Timer;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
        active
          ? "border-[hsl(152,50%,35%)] bg-[hsl(152,45%,92%)] text-[hsl(152,55%,22%)]"
          : "border-border bg-white text-muted-foreground dark:bg-[hsl(152,16%,12%)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function motionRow({ r, t }: { r: Restaurant; t: (k: string) => string }) {
  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">{r.name}</p>
          <p className="text-xs text-muted-foreground">{r.city}, {r.country}</p>
        </div>
        {r.isOpenNow && (
          <span className="shrink-0 rounded-md bg-[hsl(152,50%,90%)] px-2 py-0.5 text-[10px] font-bold uppercase text-[hsl(152,55%,25%)]">
            {t("restaurant.openNow")}
          </span>
        )}
      </div>
      {r.cuisineTags?.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{t("restaurant.cuisine")}: {r.cuisineTags.join(" · ")}</p>
      )}
    </>
  );
}