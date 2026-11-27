import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchRestaurants, statusLabelKey, type Restaurant } from "@/lib/restaurantApi";

const OWNER_LINKS = [
  { href: "/restaurant/owner/dishes", titleKey: "restaurant.dishModels", bodyKey: "restaurant.dishModelsSubtitle" },
  { href: "/restaurant/owner/menu", titleKey: "restaurant.dailyMenu", bodyKey: "restaurant.dailyMenuSubtitle" },
  { href: "/restaurant/owner/orders", titleKey: "restaurant.orders", bodyKey: "restaurant.myOrdersSubtitle" },
  { href: "/restaurant/owner/reservations", titleKey: "restaurant.reservations", bodyKey: "restaurant.myReservationsSubtitle" },
  { href: "/restaurant/owner/identity", titleKey: "restaurant.identityVerification", bodyKey: "restaurant.identityVerificationSubtitle" },
  { href: "/restaurant/owner/food-safety", titleKey: "restaurant.foodSafetyQuiz", bodyKey: "restaurant.foodSafetySubtitle" },
] as const;

export default function OwnerDashboard() {
  const { t } = useTranslation();
  const search = useSearch();
  const rid = Number(new URLSearchParams(search).get("rid"));
  const [mine, setMine] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurants({ mine: true })
      .then(setMine)
      .finally(() => setLoading(false));
  }, []);

  const active = mine.find((r) => (rid ? r.id === rid : true)) ?? mine[0];

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
            <div className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]">
              <p className="font-bold">{active.name}</p>
              <p className="text-xs text-muted-foreground">
                {t(`restaurant.${statusLabelKey("restaurant", active.status)}`)} ·{" "}
                {t(`restaurant.${statusLabelKey("identity", active.identityStatus)}`)}
              </p>
              <Link href={`/restaurant/${active.id}`} className="mt-2 inline-block text-sm font-semibold text-[hsl(152,55%,28%)]">
                {t("restaurant.restaurantDetail")}
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {OWNER_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={`${l.href}?rid=${active.id}`}
                  className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
                >
                  <p className="font-bold">{t(l.titleKey)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t(l.bodyKey)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}