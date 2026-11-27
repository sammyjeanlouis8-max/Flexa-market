import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  createDishModel,
  createDishOption,
  createDishOptionGroup,
  fetchDishModels,
  fetchDishOptions,
  formatMoney,
  uploadRestaurantFoodImage,
  type DishModel,
  type DishOptionGroup,
} from "@/lib/restaurantApi";

export default function DishModels() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [dishes, setDishes] = useState<DishModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [allergens, setAllergens] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingDishId, setEditingDishId] = useState<number | null>(null);
  const [groups, setGroups] = useState<DishOptionGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupKind, setGroupKind] = useState("size");
  const [optionName, setOptionName] = useState("");
  const [optionDelta, setOptionDelta] = useState("0");
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);

  useEffect(() => {
    if (!restaurantId) return;
    fetchDishModels(restaurantId)
      .then(setDishes)
      .finally(() => setLoading(false));
  }, [restaurantId]);

  async function loadOptions(dishId: number) {
    setEditingDishId(dishId);
    const g = await fetchDishOptions(restaurantId, dishId);
    setGroups(g);
    setActiveGroupId(g[0]?.id ?? null);
  }

  async function onPhoto(file: File | null) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const url = await uploadRestaurantFoodImage(file);
      setPhotoUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function onAdd() {
    if (!restaurantId || !name.trim()) return;
    if (!photoUrl) {
      setError(t("restaurant.photoRequired", { defaultValue: "Add at least one food photo before creating an available dish." }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dish = await createDishModel(restaurantId, {
        name: name.trim(),
        price: Number(price) || 0,
        description: "",
        photos: [photoUrl],
        allergens: allergens.trim(),
        defaultAvailable: true,
      } as any);
      setDishes((d) => [dish, ...d]);
      setName("");
      setPrice("");
      setAllergens("");
      setPhotoUrl(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create dish");
    } finally {
      setSaving(false);
    }
  }

  async function onAddGroup() {
    if (!editingDishId || !groupName.trim()) return;
    const g = await createDishOptionGroup(restaurantId, editingDishId, {
      name: groupName.trim(),
      kind: groupKind,
      required: groupKind === "size",
      minSelect: groupKind === "size" ? 1 : 0,
      maxSelect: groupKind === "topping" ? 5 : 1,
    });
    setGroupName("");
    await loadOptions(editingDishId);
    setActiveGroupId(g.id);
  }

  async function onAddOption() {
    if (!activeGroupId || !optionName.trim() || !editingDishId) return;
    await createDishOption(restaurantId, activeGroupId, {
      name: optionName.trim(),
      priceDelta: Number(optionDelta) || 0,
      allergens: "",
    });
    setOptionName("");
    setOptionDelta("0");
    await loadOptions(editingDishId);
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.dishModels")} subtitle={t("restaurant.dishModelsSubtitle")}>
        {!restaurantId ? (
          <p className="text-sm text-destructive">Missing restaurant</p>
        ) : (
          <>
            <div className="mb-4 space-y-2 rounded-2xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("restaurant.createDish")} className="flex-1 rounded-xl border px-3 py-2 text-sm" />
                <input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="w-28 rounded-xl border px-3 py-2 text-sm" />
              </div>
              <input
                value={allergens}
                onChange={(e) => setAllergens(e.target.value)}
                placeholder={t("restaurant.allergens", { defaultValue: "Allergens (optional)" })}
                className="w-full rounded-xl border px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void onPhoto(e.target.files?.[0] ?? null)}
                  />
                  {uploading
                    ? t("common.loading")
                    : t("restaurant.uploadFoodPhoto", { defaultValue: "Upload food photo" })}
                </label>
                {photoUrl && (
                  <img src={photoUrl} alt="" className="h-12 w-12 rounded-lg object-cover" />
                )}
                <button type="button" disabled={saving || uploading} onClick={() => void onAdd()} className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
                  {t("restaurant.createDish")}
                </button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
            ) : dishes.length === 0 ? (
              <RestaurantEmpty title={t("restaurant.dishModels")} body={t("restaurant.emptyBody")} />
            ) : (
              <ul className="space-y-2">
                {dishes.map((d) => (
                  <li key={d.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
                    <div className="flex items-center gap-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[hsl(152,25%,92%)]">
                        {d.photos?.[0] ? (
                          <img src={d.photos[0]} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{d.name}</p>
                        <p className="text-sm text-[hsl(152,55%,28%)]">{formatMoney(d.price, d.currency)}</p>
                        {d.allergens ? <p className="text-xs text-muted-foreground">{d.allergens}</p> : null}
                        {!d.photos?.length && (
                          <p className="text-xs text-destructive">
                            {t("restaurant.photoMissing", { defaultValue: "No photo — not shown publicly" })}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => void loadOptions(d.id)}
                        className="rounded-full border px-3 py-1.5 text-xs font-bold"
                      >
                        {t("restaurant.customize", { defaultValue: "Sizes & toppings" })}
                      </button>
                    </div>
                    {editingDishId === d.id && (
                      <div className="mt-3 space-y-3 border-t pt-3">
                        <div className="flex flex-wrap gap-2">
                          <input
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder={t("restaurant.optionGroup", { defaultValue: "Group name (e.g. Size)" })}
                            className="flex-1 rounded-xl border px-3 py-2 text-sm"
                          />
                          <select value={groupKind} onChange={(e) => setGroupKind(e.target.value)} className="rounded-xl border px-2 py-2 text-sm">
                            <option value="size">Size</option>
                            <option value="variant">Variant</option>
                            <option value="topping">Topping</option>
                            <option value="extra">Extra</option>
                          </select>
                          <button type="button" onClick={() => void onAddGroup()} className="rounded-full bg-[hsl(152,55%,28%)] px-3 py-1.5 text-xs font-bold text-white">
                            {t("restaurant.addGroup", { defaultValue: "Add group" })}
                          </button>
                        </div>
                        {groups.map((g) => (
                          <div key={g.id} className="rounded-lg border p-2">
                            <button type="button" onClick={() => setActiveGroupId(g.id)} className="text-sm font-bold">
                              {g.name} · {g.kind}{g.required ? " *" : ""}
                            </button>
                            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                              {g.options.map((o) => (
                                <li key={o.id}>
                                  {o.name}
                                  {o.priceDelta ? ` (+${formatMoney(o.priceDelta, d.currency)})` : ""}
                                  {o.soldOut ? " — sold out" : ""}
                                </li>
                              ))}
                            </ul>
                            {activeGroupId === g.id && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <input value={optionName} onChange={(e) => setOptionName(e.target.value)} placeholder="Option" className="flex-1 rounded-xl border px-2 py-1.5 text-sm" />
                                <input value={optionDelta} onChange={(e) => setOptionDelta(e.target.value)} placeholder="+0.00" className="w-20 rounded-xl border px-2 py-1.5 text-sm" />
                                <button type="button" onClick={() => void onAddOption()} className="rounded-full border px-3 py-1 text-xs font-bold">
                                  {t("restaurant.addOption", { defaultValue: "Add option" })}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
