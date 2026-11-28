import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Heart } from "lucide-react";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchRestaurant, type Restaurant } from "@/lib/restaurantApi";
import { getFavoriteRestaurantIds, toggleRestaurantFavorite } from "@/lib/restaurantFavorites";

export default function RestaurantFavorites() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const ids = getFavoriteRestaurantIds();
      const list: Restaurant[] = [];
      for (const id of ids) {
        try {
          list.push(await fetchRestaurant(id));
        } catch {
          /* skip unavailable */
        }
      }
      setRows(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function remove(id: number) {
    toggleRestaurantFavorite(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <RestaurantPageGate>
      <RestaurantShell
        title={t("restaurant.favorites", { defaultValue: "Favorites" })}
        subtitle={t("restaurant.favoritesSubtitle", { defaultValue: "Restaurants you saved on this device." })}
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <RestaurantEmpty
            title={t("restaurant.noFavorites", { defaultValue: "No favorites yet" })}
            body={t("restaurant.noFavoritesBody", { defaultValue: "Tap Save on a restaurant profile to keep it here." })}
            action={
              <Link href="/restaurant/discover" className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
                {t("restaurant.discover", { defaultValue: "Discover" })}
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
                <Link href={`/restaurant/${r.id}`} className="min-w-0 flex-1">
                  <p className="font-extrabold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[r.city, r.region || r.country].filter(Boolean).join(", ")}
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(152,40%,94%)] text-[hsl(152,55%,28%)]"
                  aria-label={t("restaurant.unsave", { defaultValue: "Remove favorite" })}
                >
                  <Heart className="h-4 w-4 fill-current" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
