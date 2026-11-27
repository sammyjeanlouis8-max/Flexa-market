import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchReservations, statusLabelKey, type Reservation } from "@/lib/restaurantApi";

export default function MyReservations() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReservations({ mine: true })
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.myReservationsTitle")} subtitle={t("restaurant.myReservationsSubtitle")}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.noReservations")} body={t("restaurant.emptyBody")} />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                <p className="font-semibold">{r.dishName}</p>
                <p className="text-xs text-muted-foreground">{r.reservationDate} {r.reservationTime}</p>
                <p className="text-xs font-bold uppercase">{t(`restaurant.${statusLabelKey("reservation", r.status)}`)}</p>
              </li>
            ))}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}