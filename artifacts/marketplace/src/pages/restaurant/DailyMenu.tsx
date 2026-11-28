import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  fetchDailyMenu,
  fetchDishModels,
  formatMoney,
  saveDailyMenuItem,
  type DailyMenuItem,
  type DishModel,
} from "@/lib/restaurantApi";

export default function DailyMenu() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [dishes, setDishes] = useState<DishModel[]>([]);
  const [menuDate, setMenuDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [dishModelId, setDishModelId] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!restaurantId) return;
    Promise.all([fetchDailyMenu(restaurantId), fetchDishModels(restaurantId)])
      .then(([m, d]) => {
        setItems(m.items);
        setMenuDate(m.menuDate);
        setDishes(d);
      })
      .finally(() => setLoading(false));
  }, [restaurantId]);

  function onPickDish(id: string) {
    setDishModelId(id);
    const dish = dishes.find((d) => String(d.id) === id);
    if (dish) {
      setName(dish.name);
      setPrice(String(dish.price));
    }
  }

  async function onSave() {
    if (!restaurantId) return;
    setError(null);
    const model = dishes.find((d) => String(d.id) === dishModelId);
    if (!model || !(model.photos?.length)) {
      setError(
        t("restaurant.dailyNeedsDishPhoto", {
          defaultValue: "Add a dish from Dish models that already has a food photo.",
        }),
      );
      return;
    }
    setSaving(true);
    try {
      const item = await saveDailyMenuItem(restaurantId, {
        name: (name.trim() || model.name).trim(),
        price: Number(price) || model.price,
        menuDate,
        dishModelId: model.id,
        photos: model.photos,
        availableFrom: "11:00",
        availableUntil: "20:00",
      });
      setItems((prev) => [...prev, item]);
      setName("");
      setPrice("");
      setDishModelId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save menu item");
    } finally {
      setSaving(false);
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.dailyMenu")} subtitle={t("restaurant.dailyMenuSubtitle")}>
        {menuDate && <p className="mb-2 text-xs text-muted-foreground">{menuDate}</p>}
        <p className="mb-2 text-xs text-muted-foreground">
          {t("restaurant.dailyMenuPhotoNote", {
            defaultValue: "Daily items must reuse a dish model with at least one food photo.",
          })}
        </p>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <select
            value={dishModelId}
            onChange={(e) => onPickDish(e.target.value)}
            className="min-w-[12rem] flex-1 rounded-xl border px-3 py-2 text-sm"
            data-testid="daily-menu-dish-select"
          >
            <option value="">{t("restaurant.pickDishModel", { defaultValue: "Pick dish model…" })}</option>
            {dishes.map((d) => (
              <option key={d.id} value={d.id} disabled={!d.photos?.length}>
                {d.name}
                {!d.photos?.length ? ` (${t("restaurant.noPhoto", { defaultValue: "no photo" })})` : ""}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
            placeholder={t("restaurant.todayMenu")}
          />
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-28 rounded-xl border px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving}
            className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {t("restaurant.saveMenu")}
          </button>
        </div>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : items.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.dailyMenu")} body={t("restaurant.emptyBody")} />
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                <div className="flex gap-3">
                  {i.photos?.[0] ? (
                    <img src={i.photos[0]} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-[hsl(152,40%,92%)]" />
                  )}
                  <div>
                    <p className="font-semibold">{i.name}</p>
                    <p className="text-sm">
                      {formatMoney(i.price, i.currency)} · {i.availableFrom}–{i.availableUntil}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
