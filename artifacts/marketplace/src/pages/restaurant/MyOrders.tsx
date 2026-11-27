import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchRestaurantOrders, formatMoney, statusLabelKey, type Order } from "@/lib/restaurantApi";

export default function MyOrders() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurantOrders({ mine: true })
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.myOrdersTitle")} subtitle={t("restaurant.myOrdersSubtitle")}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : orders.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.noOrders")} body={t("restaurant.paymentNote")} />
        ) : (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                <p className="font-semibold">{o.restaurantName ?? `#${o.restaurantId}`}</p>
                <p className="text-sm">{formatMoney(o.total, o.currency)}</p>
                <p className="text-xs font-bold uppercase">{t(`restaurant.${statusLabelKey("order", o.status)}`)}</p>
              </li>
            ))}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}