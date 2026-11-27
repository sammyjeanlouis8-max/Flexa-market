import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  fetchDailyMenu,
  fetchRestaurant,
  formatMoney,
  type DailyMenuItem,
  type Restaurant,
} from "@/lib/restaurantApi";

export default function RestaurantDetail() {
  const { t } = useTranslation();
  const [, params] = useRoute("/restaurant/:id");
  const id = Number(params?.id);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([fetchRestaurant(id), fetchDailyMenu(id)])
      .then(([r, menu]) => {
        if (!cancelled) {
          setRestaurant(r);
          setItems(menu.items);
          setError(null);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setRestaurant(null);
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <RestaurantPageGate>
      <RestaurantShell title={restaurant?.name ?? t("restaurant.restaurantDetail")} subtitle={restaurant?.city}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : error || !restaurant ? (
          <RestaurantEmpty title={t("restaurant.notFound")} body={error ?? ""} action={<Link href="/restaurant">{t("restaurant.backDiscover")}</Link>} />
        ) : (
          <div className="space-y-4">
            <RestaurantNotice>{t("restaurant.paymentNote")}</RestaurantNotice>
            {restaurant.identityStatus === "verified" && (
              <RestaurantNotice>{t("restaurant.identityBadgeNote")}</RestaurantNotice>
            )}
            <p className="text-sm text-muted-foreground">{restaurant.description}</p>
            <h3 className="font-bold">{t("restaurant.todayMenu")}</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("restaurant.emptyBody")}</p>
            ) : (
              <ul className="space-y-2">
                {items.map((item) => (
                  <li key={item.id} className="rounded-xl border border-border/70 bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm font-bold text-[hsl(152,55%,28%)]">{formatMoney(item.price, item.currency)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.availableFrom} – {item.availableUntil}</p>
                    <div className="mt-2 flex gap-2">
                      {item.acceptsReservations && (
                        <span className="text-xs font-semibold text-[hsl(152,50%,30%)]">{t("restaurant.reserve")}</span>
                      )}
                      {!item.soldOut && (
                        <span className="text-xs font-semibold">{t("restaurant.placeOrder")}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}