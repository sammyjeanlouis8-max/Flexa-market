import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { createDishModel, fetchDishModels, formatMoney, type DishModel } from "@/lib/restaurantApi";

export default function DishModels() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [dishes, setDishes] = useState<DishModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    fetchDishModels(restaurantId)
      .then(setDishes)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  async function onAdd() {
    if (!restaurantId || !name.trim()) return;
    setSaving(true);
    try {
      const dish = await createDishModel(restaurantId, {
        name: name.trim(),
        price: Number(price) || 0,
        description: "",
      });
      setDishes((d) => [dish, ...d]);
      setName("");
      setPrice("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.dishModels")} subtitle={t("restaurant.dishModelsSubtitle")}>
        {!restaurantId ? (
          <p className="text-sm text-destructive">Missing restaurant</p>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("restaurant.createDish")} className="flex-1 rounded-xl border px-3 py-2 text-sm" />
              <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="w-28 rounded-xl border px-3 py-2 text-sm" />
              <button type="button" disabled={saving} onClick={onAdd} className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
                {t("restaurant.createDish")}
              </button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : dishes.length === 0 ? (
              <RestaurantEmpty title={t("restaurant.dishModels")} body={t("restaurant.emptyBody")} />
            ) : (
              <ul className="space-y-2">
                {dishes.map((d) => (
                  <li key={d.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-sm text-[hsl(152,55%,28%)]">{formatMoney(d.price, d.currency)}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}