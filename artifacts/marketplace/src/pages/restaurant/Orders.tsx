import { useEffect, useMemo, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  assignRestaurantOrderStaff,
  confirmRestaurantOrderPin,
  deliveryMethodCustomerLabel,
  fetchRestaurantDeliveryStaff,
  fetchRestaurantOrders,
  formatMoney,
  patchOrderStatus,
  refundRestaurantOrder,
  reportRestaurantFailedDelivery,
  statusLabelKey,
  type Order,
} from "@/lib/restaurantApi";
import { cn } from "@/lib/utils";

const FILTERS = [
  "all",
  "pending_payment",
  "order_placed",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "completed",
  "canceled",
] as const;

export default function RestaurantOrders() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [pinDraft, setPinDraft] = useState<Record<number, string>>({});
  const [staff, setStaff] = useState<Array<{ id: number; displayName: string; phone: string; active: boolean }>>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchRestaurantOrders({ restaurantId: restaurantId || undefined })
      .then(setOrders)
      .finally(() => setLoading(false));
    if (restaurantId) {
      fetchRestaurantDeliveryStaff(restaurantId).then(setStaff).catch(() => setStaff([]));
    }
  }, [restaurantId]);

  const visible = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  async function setStatus(id: number, status: string) {
    setMsg(null);
    try {
      const updated = await patchOrderStatus(id, status);
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function confirmPin(id: number) {
    setMsg(null);
    try {
      const updated = await confirmRestaurantOrderPin(id, pinDraft[id] || "");
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
      setPinDraft((d) => ({ ...d, [id]: "" }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "PIN failed");
    }
  }

  async function refund(id: number) {
    setMsg(null);
    try {
      const updated = await refundRestaurantOrder(id, "Owner refund");
      setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Refund failed");
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.orders")} subtitle={t("restaurant.ownerDashboardSubtitle")}>
        <p className="mb-3 text-xs text-muted-foreground">
          {t("restaurant.deliveryManagedByBusiness", {
            defaultValue: "Delivery is managed directly by this business.",
          })}
        </p>
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
              {f === "all"
                ? t("restaurant.catAll", { defaultValue: "All" })
                : t(`restaurant.${statusLabelKey("order", f)}`, { defaultValue: f.replace(/_/g, " ") })}
            </button>
          ))}
        </div>

        {msg && <p className="mb-2 text-sm text-destructive">{msg}</p>}

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
                    {t(`restaurant.${statusLabelKey("order", o.status)}`, { defaultValue: o.status })}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold">
                  {formatMoney(o.total, o.currency)} · {deliveryMethodCustomerLabel(o.deliveryMethod, o.fulfillment)}
                </p>
                {o.estimatedDeliveryMinutes != null && o.fulfillment === "delivery" && (
                  <p className="text-xs text-muted-foreground">
                    {t("restaurant.etaShort", { defaultValue: "~{{m}} min", m: o.estimatedDeliveryMinutes })}
                  </p>
                )}
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
                  {["order_placed", "pending"].includes(o.status) && (
                    <>
                      <Action onClick={() => setStatus(o.id, "confirmed")} label={t("restaurant.accept", { defaultValue: "Confirm" })} primary />
                      <Action onClick={() => setStatus(o.id, "rejected")} label={t("restaurant.reject", { defaultValue: "Reject" })} danger />
                    </>
                  )}
                  {["confirmed", "preparing"].includes(o.status) && (
                    <>
                      <Action onClick={() => setStatus(o.id, "preparing")} label={t("restaurant.orderPreparing")} />
                      <Action onClick={() => setStatus(o.id, "ready_for_pickup")} label={t("restaurant.orderReadyPickup")} primary />
                      {o.fulfillment === "delivery" && (
                        <Action onClick={() => setStatus(o.id, "out_for_delivery")} label={t("restaurant.orderOutForDelivery")} />
                      )}
                    </>
                  )}
                  {["confirmed", "preparing", "ready_for_pickup", "out_for_delivery"].includes(o.status)
                    && (o.fulfillment === "delivery" || o.deliveryMethod === "merchant")
                    && staff.length > 0 && (
                    <select
                      className="rounded-full border px-3 py-1.5 text-xs"
                      defaultValue=""
                      onChange={(e) => {
                        const staffId = Number(e.target.value);
                        if (!staffId) return;
                        void assignRestaurantOrderStaff(o.id, staffId)
                          .then((updated) => setOrders((prev) => prev.map((x) => (x.id === o.id ? updated : x))))
                          .catch((err) => setMsg(err instanceof Error ? err.message : "Assign failed"));
                      }}
                    >
                      <option value="">{t("restaurant.assignCourier", { defaultValue: "Assign courier…" })}</option>
                      {staff.filter((s) => s.active).map((s) => (
                        <option key={s.id} value={s.id}>{s.displayName}</option>
                      ))}
                    </select>
                  )}
                  {["ready_for_pickup", "out_for_delivery"].includes(o.status) && (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      <input
                        value={pinDraft[o.id] || ""}
                        onChange={(e) => setPinDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                        placeholder={t("restaurant.confirmPin", { defaultValue: "Customer PIN" })}
                        className="w-28 rounded-full border px-3 py-1.5 text-xs"
                        inputMode="numeric"
                      />
                      <Action onClick={() => confirmPin(o.id)} label={t("restaurant.confirmWithPin", { defaultValue: "Confirm PIN" })} primary />
                      {o.fulfillment === "pickup" && (
                        <Action onClick={() => setStatus(o.id, "completed")} label={t("restaurant.orderCompleted")} />
                      )}
                      {o.fulfillment === "delivery" && (
                        <Action
                          onClick={() => {
                            const note = window.prompt(
                              t("restaurant.failedDeliveryPrompt", { defaultValue: "Describe the failed delivery attempt" }),
                            );
                            if (!note) return;
                            void reportRestaurantFailedDelivery(o.id, note)
                              .then((updated) => setOrders((prev) => prev.map((x) => (x.id === o.id ? updated : x))))
                              .catch((err) => setMsg(err instanceof Error ? err.message : "Report failed"));
                          }}
                          label={t("restaurant.failedDelivery", { defaultValue: "Failed attempt" })}
                          danger
                        />
                      )}
                    </div>
                  )}
                  {o.status === "delivered" && (
                    <Action onClick={() => setStatus(o.id, "completed")} label={t("restaurant.orderCompleted")} primary />
                  )}
                  {["rejected", "canceled", "completed", "delivered"].includes(o.status) && (
                    <Action onClick={() => refund(o.id)} label={t("restaurant.orderRefundPending", { defaultValue: "Refund" })} danger />
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
