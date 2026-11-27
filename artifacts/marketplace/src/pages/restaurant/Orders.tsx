import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchRestaurantOrders, formatMoney, patchOrderStatus, statusLabelKey, type Order } from "@/lib/restaurantApi";
import { cn } from "@/lib/utils";

const FILTERS = ["all", "pending", "preparing", "ready_pickup", "out_for_delivery", "completed", "cancelled"] as const;

export default function RestaurantOrders() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  useEffect(() => {
    fetchRestaurantOrders({ restaurantId: restaurantId || undefined })
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  const visible = useMemo(() => {
    if (filter === "all") return orders;
    if (filter === "preparing") return orders.filter((o) => ["accepted", "preparing"].includes(o.status));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  async function setStatus(id: number, status: string) {
    const updated = await patchOrderStatus(id, status);
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.orders")} subtitle={t("restaurant.ownerDashboardSubtitle")}>
        <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize",
                filter === f ? "bg-[hsl(152,55%,28%)] text-white" : "border bg-white",
              )}
            >
              {f === "all" ? t("restaurant.catAll", { defaultValue: "All" }) : t(`restaurant.${statusLabelKey("order", f === "preparing" ? "preparing" : f)}`, { defaultValue: f })}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : visible.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.noOrders")} body={t("restaurant.emptyBody")} />
        ) : (
          <ul className="space-y-3">
            {visible.map((o) => (
              <li key={o.id} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                <div className="flex justify-between gap-2">
                  <div>
                    <p className="font-extrabold">#{o.id}</p>
                    <p className="text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleString()}</p>
                  </div>
                  <span className="rounded-full bg-[hsl(152,45%,94%)] px-2 py-0.5 text-[10px] font-bold uppercase text-[hsl(152,55%,25%)]">
                    {t(`restaurant.${statusLabelKey("order", o.status)}`)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold">
                  {formatMoney(o.total, o.currency)} · {o.fulfillment}
                </p>
                {o.specialInstructions && (
                  <p className="mt-1 text-xs text-muted-foreground">{o.specialInstructions}</p>
                )}
                {o.items && o.items.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {o.items.map((item) => (
                      <li key={item.id}>{item.quantity} × {item.name}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {o.status === "pending" && (
                    <>
                      <Action onClick={() => setStatus(o.id, "accepted")} label={t("restaurant.accept", { defaultValue: "Accept" })} primary />
                      <Action onClick={() => setStatus(o.id, "rejected")} label={t("restaurant.reject", { defaultValue: "Reject" })} danger />
                    </>
                  )}
                  {["accepted", "preparing"].includes(o.status) && (
                    <>
                      <Action onClick={() => setStatus(o.id, "preparing")} label={t("restaurant.orderPreparing")} />
                      <Action onClick={() => setStatus(o.id, "ready_pickup")} label={t("restaurant.orderReadyPickup")} primary />
                      {o.fulfillment === "delivery" && (
                        <Action onClick={() => setStatus(o.id, "out_for_delivery")} label={t("restaurant.orderOutForDelivery")} />
                      )}
                    </>
                  )}
                  {["ready_pickup", "out_for_delivery"].includes(o.status) && (
                    <Action onClick={() => setStatus(o.id, "completed")} label={t("restaurant.orderCompleted")} primary />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function Action({
  onClick,
  label,
  primary,
  danger,
}: {
  onClick: () => void;
  label: string;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-bold",
        primary && "bg-[hsl(152,55%,28%)] text-white",
        danger && "border border-red-300 text-red-600",
        !primary && !danger && "border",
      )}
    >
      {label}
    </button>
  );
}
