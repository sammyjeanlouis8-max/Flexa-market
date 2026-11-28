import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Bell, CalendarClock, ChefHat, Clock3, LayoutGrid, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  fetchOwnerStats,
  fetchRestaurantOrders,
  fetchRestaurants,
  formatMoney,
  patchOrderStatus,
  statusLabelKey,
  updateFoodTruckLocation,
  updateRestaurant,
  type Order,
  type Restaurant,
} from "@/lib/restaurantApi";
import { cn } from "@/lib/utils";

const OWNER_LINKS = [
  { href: "/restaurant/owner/orders", titleKey: "restaurant.orders", bodyKey: "restaurant.myOrdersSubtitle", icon: ShoppingBag },
  { href: "/restaurant/owner/reservations", titleKey: "restaurant.reservations", bodyKey: "restaurant.myReservationsSubtitle", icon: CalendarClock },
  { href: "/restaurant/owner/menu", titleKey: "restaurant.dailyMenu", bodyKey: "restaurant.dailyMenuSubtitle", icon: LayoutGrid },
  { href: "/restaurant/owner/dishes", titleKey: "restaurant.dishModels", bodyKey: "restaurant.dishModelsSubtitle", icon: ChefHat },
  { href: "/restaurant/owner/settings", titleKey: "restaurant.businessHours", bodyKey: "restaurant.deliverySettings", icon: Clock3 },
  { href: "/restaurant/owner/identity", titleKey: "restaurant.identityVerification", bodyKey: "restaurant.identityVerificationSubtitle", icon: UtensilsCrossed },
  { href: "/restaurant/owner/food-safety", titleKey: "restaurant.foodSafetyQuiz", bodyKey: "restaurant.foodSafetySubtitle", icon: UtensilsCrossed },
] as const;

export default function OwnerDashboard() {
  const { t } = useTranslation();
  const search = useSearch();
  const rid = Number(new URLSearchParams(search).get("rid"));
  const [mine, setMine] = useState<Restaurant[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [stats, setStats] = useState<{
    orders: { new: number; preparing: number; ready: number; outForDelivery: number; completed: number; cancelled: number };
    reservations: { pending: number; confirmed: number; total: number };
    avgRating: number;
    ratingCount: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [truckLabel, setTruckLabel] = useState("");

  useEffect(() => {
    fetchRestaurants({ mine: true })
      .then(setMine)
      .finally(() => setLoading(false));
  }, []);

  const active = mine.find((r) => (rid ? r.id === rid : true)) ?? mine[0];

  useEffect(() => {
    if (!active) return;
    fetchOwnerStats(active.id).then(setStats).catch(() => setStats(null));
    fetchRestaurantOrders({ restaurantId: active.id }).then(setOrders).catch(() => setOrders([]));
  }, [active?.id]);

  async function publish() {
    if (!active) return;
    setMsg(null);
    try {
      const updated = await updateRestaurant(active.id, { publish: true });
      setMine((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMsg(t("restaurant.published", { defaultValue: "Published" }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Publish failed");
    }
  }

  async function toggleOpen() {
    if (!active) return;
    const updated = await updateRestaurant(active.id, { temporarilyClosed: !active.temporarilyClosed });
    setMine((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  async function setStatus(id: number, status: string) {
    const updated = await patchOrderStatus(id, status);
    setOrders((prev) => prev.map((o) => (o.id === id ? updated : o)));
    if (active) fetchOwnerStats(active.id).then(setStats).catch(() => undefined);
  }

  function isIncoming(status: string) {
    const s = String(status || "").toLowerCase();
    return ["order_placed", "pending", "placed", "pending_payment"].includes(s);
  }

  async function publishTruckLocation(opts?: { withGps?: boolean }) {
    if (!active || !truckLabel.trim()) return;
    try {
      let latitude: number | undefined;
      let longitude: number | undefined;
      if (opts?.withGps && typeof navigator !== "undefined" && navigator.geolocation) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 30_000,
          });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      }
      const updated = await updateFoodTruckLocation(active.id, {
        locationLabel: truckLabel.trim(),
        latitude,
        longitude,
      });
      setMine((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setMsg(
        t("restaurant.locationUpdated", {
          defaultValue: latitude != null
            ? "Operating location published with GPS pin"
            : "Operating location published",
        }),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Location update failed");
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.ownerDashboard")} subtitle={t("restaurant.ownerDashboardSubtitle")}>
        <RestaurantNotice>{t("restaurant.freeLaunchNote")}</RestaurantNotice>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !active ? (
          <div className="mt-4">
            <RestaurantEmpty
              title={t("restaurant.myRestaurant")}
              body={t("restaurant.emptyBody")}
              action={
                <Link href="/restaurant/add" className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
                  {t("restaurant.addRestaurant")}
                </Link>
              }
            />
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 overflow-hidden rounded-2xl bg-[hsl(152,40%,92%)]">
                  {active.logoUrl ? <img src={active.logoUrl} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-extrabold">{active.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(`restaurant.${statusLabelKey("restaurant", active.status)}`)} ·{" "}
                        {t(`restaurant.${statusLabelKey("identity", active.identityStatus)}`)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleOpen()}
                      className={cn(
                        "relative h-7 w-12 rounded-full transition",
                        !active.temporarilyClosed ? "bg-[hsl(152,55%,28%)]" : "bg-neutral-300",
                      )}
                      aria-label={t("restaurant.openToggle", { defaultValue: "Open now toggle" })}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition",
                          !active.temporarilyClosed ? "left-5" : "left-0.5",
                        )}
                      />
                    </button>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-[hsl(152,45%,30%)]">
                    {!active.temporarilyClosed ? t("restaurant.openNow") : t("restaurant.temporarilyClosed")}
                  </p>
                  <Link href={`/restaurant/${active.id}`} className="mt-2 inline-block text-sm font-semibold text-[hsl(152,55%,28%)]">
                    {t("restaurant.restaurantDetail")}
                  </Link>
                </div>
                <Bell className="h-5 w-5 text-muted-foreground" />
              </div>

              {active.status !== "published" && (
                <button type="button" onClick={() => void publish()} className="mt-3 rounded-full bg-[hsl(152,55%,28%)] px-3 py-1.5 text-xs font-bold text-white">
                  {t("restaurant.publish", { defaultValue: "Publish" })}
                </button>
              )}
              {msg && <p className="mt-2 text-sm font-semibold text-[hsl(152,55%,28%)]">{msg}</p>}
            </div>

            {stats && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatCard label={t("restaurant.statNew", { defaultValue: "New Orders" })} value={stats.orders.new} highlight />
                <StatCard label={t("restaurant.statPreparing", { defaultValue: "Preparing" })} value={stats.orders.preparing} />
                <StatCard label={t("restaurant.statReady", { defaultValue: "Ready" })} value={stats.orders.ready} />
                <StatCard label={t("restaurant.statCompleted", { defaultValue: "Completed" })} value={stats.orders.completed} />
              </div>
            )}

            {active.businessType === "food_truck" && (
              <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
                <p className="text-sm font-extrabold">{t("restaurant.updateTruckLocation", { defaultValue: "Update operating location" })}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("restaurant.truckLocationNote", {
                    defaultValue: "Publish where you are serving now. Flexa does not continuously track private GPS.",
                  })}
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={truckLabel}
                    onChange={(e) => setTruckLabel(e.target.value)}
                    className="flex-1 rounded-xl border px-3 py-2 text-sm"
                    placeholder={t("restaurant.locationPlaceholder", { defaultValue: "e.g. Near City Hall, WPB" })}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void publishTruckLocation()}
                      className="rounded-xl border border-[hsl(152,40%,70%)] px-3 py-2 text-xs font-bold text-[hsl(152,55%,28%)]"
                    >
                      {t("restaurant.publishLabel", { defaultValue: "Publish label" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => void publishTruckLocation({ withGps: true })}
                      className="rounded-xl bg-[hsl(152,55%,28%)] px-3 py-2 text-xs font-bold text-white"
                      data-testid="truck-publish-gps"
                    >
                      {t("restaurant.publishWithGps", { defaultValue: "Publish + GPS" })}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-extrabold">{t("restaurant.incomingOrders", { defaultValue: "Incoming orders" })}</h3>
                <Link href={`/restaurant/owner/orders?rid=${active.id}`} className="text-xs font-bold text-[hsl(152,55%,28%)]">
                  {t("restaurant.seeAll", { defaultValue: "See all" })}
                </Link>
              </div>
              {orders.filter((o) => isIncoming(o.status)).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("restaurant.noOrders")}</p>
              ) : (
                <ul className="space-y-2">
                  {orders.filter((o) => isIncoming(o.status)).slice(0, 5).map((o) => (
                    <li key={o.id} className="rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-extrabold">#{o.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.createdAt).toLocaleString()} · {o.fulfillment}
                          </p>
                          <p className="mt-1 text-sm font-semibold">{formatMoney(o.total, o.currency)}</p>
                          {o.specialInstructions && (
                            <p className="mt-1 text-xs text-muted-foreground">{o.specialInstructions}</p>
                          )}
                        </div>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                          {t("restaurant.orderPending")}
                        </span>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void setStatus(o.id, "confirmed")}
                          className="rounded-full bg-[hsl(152,55%,28%)] px-3 py-1.5 text-xs font-bold text-white"
                        >
                          {t("restaurant.accept", { defaultValue: "Accept" })}
                        </button>
                        <button
                          type="button"
                          onClick={() => void setStatus(o.id, "rejected")}
                          className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-bold text-red-600"
                        >
                          {t("restaurant.reject", { defaultValue: "Reject" })}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="grid gap-2 sm:grid-cols-2">
              {OWNER_LINKS.map((l) => {
                const Icon = l.icon;
                return (
                  <Link
                    key={l.href}
                    href={`${l.href}?rid=${active.id}`}
                    className="flex items-start gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-sm"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(152,45%,92%)] text-[hsl(152,55%,25%)]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-bold">{t(l.titleKey)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t(l.bodyKey)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3 text-center shadow-sm",
        highlight ? "border-[hsl(152,45%,70%)] bg-[hsl(152,45%,95%)]" : "border-black/5 bg-white",
      )}
    >
      <p className="text-2xl font-extrabold text-[hsl(152,55%,22%)]">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">{label}</p>
    </div>
  );
}
