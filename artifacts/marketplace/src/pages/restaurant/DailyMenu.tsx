import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { fetchDailyMenu, formatMoney, saveDailyMenuItem, type DailyMenuItem } from "@/lib/restaurantApi";

export default function DailyMenu() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [items, setItems] = useState<DailyMenuItem[]>([]);
  const [menuDate, setMenuDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    fetchDailyMenu(restaurantId)
      .then((m) => {
        setItems(m.items);
        setMenuDate(m.menuDate);
      })
      .finally(() => setLoading(false));
  }, [restaurantId]);

  async function onSave() {
    if (!restaurantId || !name.trim()) return;
    const item = await saveDailyMenuItem(restaurantId, {
      name: name.trim(),
      price: Number(price) || 0,
      menuDate,
      availableFrom: "11:00",
      availableUntil: "20:00",
    });
    setItems((prev) => [...prev, item]);
    setName("");
    setPrice("");
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.dailyMenu")} subtitle={t("restaurant.dailyMenuSubtitle")}>
        {menuDate && <p className="mb-2 text-xs text-muted-foreground">{menuDate}</p>}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-xl border px-3 py-2 text-sm" placeholder={t("restaurant.todayMenu")} />
          <input value={price} onChange={(e) => setPrice(e.target.value)} className="w-28 rounded-xl border px-3 py-2 text-sm" />
          <button type="button" onClick={onSave} className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
            {t("restaurant.saveMenu")}
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : items.length === 0 ? (
          <RestaurantEmpty title={t("restaurant.dailyMenu")} body={t("restaurant.emptyBody")} />
        ) : (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                <p className="font-semibold">{i.name}</p>
                <p className="text-sm">{formatMoney(i.price, i.currency)} · {i.availableFrom}–{i.availableUntil}</p>
              </li>
            ))}
          </ul>
        )}
      </RestaurantShell>
    </RestaurantPageGate>
  );
}