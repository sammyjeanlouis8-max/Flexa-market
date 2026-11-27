import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchRestaurantOrders, formatMoney, patchOrderStatus, statusLabelKey, type Order } from "@/lib/restaurantApi";

export default function RestaurantOrders() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurantOrders({ restaurantId: restaurantId || undefined })
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  async function setStatus(id: number, status: string) {
    const updated = await patchOrderStatus(id, status);
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.orders")} subtitle={t("restaurant.ownerDashboardSubtitle")}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : orders.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.noOrders")} body={t("restaurant.emptyBody")} />
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                <div className="flex justify-between gap-2">
                  <p className="font-semibold">#{o.id}</p>
                  <p className="text-xs font-bold uppercase">{t(`restaurant.${statusLabelKey("order", o.status)}`)}</p>
                </div>
                <p className="text-sm">{formatMoney(o.total, o.currency)} · {o.fulfillment}</p>
                {o.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setStatus(o.id, "accepted")} className="text-xs font-bold text-[hsl(152,55%,28%)]">Accept</button>
                    <button type="button" onClick={() => setStatus(o.id, "rejected")} className="text-xs font-bold text-destructive">Reject</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}