import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  fetchRestaurantOrders,
  formatMoney,
  rateRestaurant,
  statusLabelKey,
  type Order,
} from "@/lib/restaurantApi";

const TRACK_STEPS = [
  "pending_payment",
  "order_placed",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "completed",
] as const;

function stepIndex(status: string) {
  const s = String(status || "").toLowerCase();
  const alias =
    s === "pending" || s === "placed"
      ? "order_placed"
      : s === "accepted"
        ? "confirmed"
        : s === "ready" || s === "ready_pickup"
          ? "ready_for_pickup"
          : s;
  const i = TRACK_STEPS.indexOf(alias as (typeof TRACK_STEPS)[number]);
  return i >= 0 ? i : 0;
}

export default function MyOrders() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [ratingBusy, setRatingBusy] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchRestaurantOrders({ mine: true })
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  async function onRate(order: Order, stars: number) {
    setRatingBusy(order.id);
    setMsg(null);
    try {
      await rateRestaurant(order.restaurantId, { orderId: order.id, stars });
      setMsg(t("restaurant.ratingThanks", { defaultValue: "Thanks for your rating." }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Rating failed");
    } finally {
      setRatingBusy(null);
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.myOrdersTitle")} subtitle={t("restaurant.myOrdersSubtitle")}>
        {msg && <p className="mb-3 text-sm font-semibold text-[hsl(152,55%,28%)]">{msg}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : orders.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.noOrders")} body={t("restaurant.paymentNote")} />
        ) : (
          <ul className="space-y-3">
            {orders.map((o) => {
              const active = stepIndex(o.status);
              const showPin =
                Boolean(o.confirmationPin) &&
                ["confirmed", "preparing", "ready_for_pickup", "out_for_delivery", "order_placed"].includes(
                  String(o.status).toLowerCase(),
                ) &&
                !o.pinConfirmedAt;
              return (
                <li key={o.id} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm dark:bg-[hsl(152,16%,12%)]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-extrabold">{o.restaurantName ?? `#${o.restaurantId}`}</p>
                      <p className="text-sm font-semibold text-[hsl(152,55%,28%)]">
                        {formatMoney(o.total, o.currency)} · #{o.id}
                      </p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                        {t(`restaurant.${statusLabelKey("order", o.status)}`)} · {o.fulfillment}
                      </p>
                    </div>
                    {showPin && (
                      <div
                        className="rounded-xl bg-[hsl(152,40%,94%)] px-3 py-2 text-center"
                        data-testid="order-confirmation-pin"
                      >
                        <p className="text-[10px] font-bold uppercase text-[hsl(152,45%,30%)]">
                          {t("restaurant.confirmationPin", { defaultValue: "Confirmation PIN" })}
                        </p>
                        <p className="font-mono text-lg font-extrabold tracking-widest text-[hsl(152,55%,22%)]">
                          {o.confirmationPin}
                        </p>
                        <p className="mt-0.5 max-w-[9rem] text-[10px] text-muted-foreground">
                          {t("restaurant.pinHint", {
                            defaultValue: "Show this PIN to the business when you receive your order.",
                          })}
                        </p>
                      </div>
                    )}
                  </div>

                  <ol className="mt-3 flex flex-wrap gap-1" aria-label={t("restaurant.orderTracking", { defaultValue: "Order tracking" })}>
                    {TRACK_STEPS.filter((s) => !["pending_payment", "out_for_delivery"].includes(s) || o.fulfillment === "delivery" || s !== "out_for_delivery").map((s, i) => (
                      <li
                        key={s}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          i <= active
                            ? "bg-[hsl(152,55%,28%)] text-white"
                            : "bg-neutral-100 text-neutral-400"
                        }`}
                      >
                        {t(`restaurant.${statusLabelKey("order", s)}`, { defaultValue: s.replace(/_/g, " ") })}
                      </li>
                    ))}
                  </ol>

                  {o.status === "completed" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2" data-testid="order-rate">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {t("restaurant.rateOrder", { defaultValue: "Rate this order" })}
                      </span>
                      {[1, 2, 3, 4, 5].map((stars) => (
                        <button
                          key={stars}
                          type="button"
                          disabled={ratingBusy === o.id}
                          onClick={() => void onRate(o, stars)}
                          className="rounded-full border border-amber-300 px-2 py-0.5 text-xs font-bold text-amber-700 hover:bg-amber-50"
                        >
                          {stars}★
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
