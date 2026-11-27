import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  createRestaurantReservation,
  fetchDailyMenu,
  fetchRestaurant,
  formatMoney,
  placeRestaurantOrder,
  type DailyMenuItem,
  type Restaurant,
} from "@/lib/restaurantApi";
import { useAuth } from "@/contexts/auth";

export default function RestaurantDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, params] = useRoute("/restaurant/:id");
  const id = Number(params?.id);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

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

  async function onOrder(item: DailyMenuItem) {
    if (!user) {
      setActionMsg(t("common.loginRequired", { defaultValue: "Sign in to order." }));
      return;
    }
    setBusyId(item.id);
    setActionMsg(null);
    try {
      const order = await placeRestaurantOrder(id, {
        fulfillment: "pickup",
        items: [{ dailyMenuItemId: item.id, quantity: 1 }],
        specialInstructions: "",
      });
      setActionMsg(`${t("restaurant.placeOrder")}: #${order.id} · ${t("restaurant.paymentNote")}`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Order failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onReserve(item: DailyMenuItem) {
    if (!user) {
      setActionMsg(t("common.loginRequired", { defaultValue: "Sign in to reserve." }));
      return;
    }
    setBusyId(item.id);
    setActionMsg(null);
    try {
      const reservation = await createRestaurantReservation(id, {
        dailyMenuItemId: item.id,
        quantity: 1,
        fulfillment: "pickup",
        reservationTime: item.availableFrom,
      });
      setActionMsg(`${t("restaurant.reserve")}: #${reservation.id} · ${reservation.reservationDate}`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Reservation failed");
    } finally {
      setBusyId(null);
    }
  }

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
            {restaurant.temporarilyClosed || restaurant.vacationMode ? (
              <RestaurantNotice>
                {restaurant.vacationMode ? t("restaurant.vacationMode") : t("restaurant.temporarilyClosed")}
              </RestaurantNotice>
            ) : null}
            <p className="text-sm text-muted-foreground">{restaurant.description}</p>
            {restaurant.avgRating > 0 && (
              <p className="text-sm font-semibold">
                {t("restaurant.rating")}: {restaurant.avgRating.toFixed(1)} ({restaurant.ratingCount})
              </p>
            )}
            {actionMsg && <p className="rounded-xl border border-[hsl(152,40%,80%)] bg-[hsl(152,45%,96%)] px-3 py-2 text-sm">{actionMsg}</p>}
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
                    <div className="mt-2 flex flex-wrap gap-2">
                      {!item.soldOut && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => onOrder(item)}
                          className="rounded-full bg-[hsl(152,55%,28%)] px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {t("restaurant.placeOrder")}
                        </button>
                      )}
                      {item.acceptsReservations && restaurant.acceptsReservations && (
                        <button
                          type="button"
                          disabled={busyId === item.id}
                          onClick={() => onReserve(item)}
                          className="rounded-full border border-[hsl(152,40%,70%)] px-3 py-1 text-xs font-bold text-[hsl(152,55%,28%)] disabled:opacity-60"
                        >
                          {t("restaurant.reserve")}
                        </button>
                      )}
                      {item.soldOut && (
                        <span className="text-xs font-semibold text-muted-foreground">Sold out</span>
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
