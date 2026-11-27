import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchReservations, patchReservationStatus, statusLabelKey, type Reservation } from "@/lib/restaurantApi";

export default function RestaurantReservations() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReservations({ restaurantId: restaurantId || undefined })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  async function setStatus(id: number, status: string) {
    const updated = await patchReservationStatus(id, status);
    setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.reservations")} subtitle={t("restaurant.myReservationsSubtitle")}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : rows.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.noReservations")} body={t("restaurant.emptyBody")} />
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                <p className="font-semibold">{r.dishName} × {r.quantity}</p>
                <p className="text-xs text-muted-foreground">{r.reservationDate} {r.reservationTime}</p>
                <p className="text-xs font-bold uppercase">{t(`restaurant.${statusLabelKey("reservation", r.status)}`)}</p>
                {r.status === "pending" && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setStatus(r.id, "confirmed")} className="text-xs font-bold text-[hsl(152,55%,28%)]">Confirm</button>
                    <button type="button" onClick={() => setStatus(r.id, "rejected")} className="text-xs font-bold text-destructive">Reject</button>
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