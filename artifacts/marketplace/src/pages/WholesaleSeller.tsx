import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Plus, Warehouse } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { WholesaleEmpty, WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { canAccessWholesale } from "@/lib/wholesaleAccess";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS, citiesFor } from "@/lib/countries";
import {
  createWholesaleProduct,
  fetchWholesaleProducts,
  formatMoney,
  type WholesaleProduct,
} from "@/lib/wholesaleApi";

export default function WholesaleSeller() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const allowed = canAccessWholesale(user);
  const [mine, setMine] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [minOrderQty, setMinOrderQty] = useState("10");
  const [stockQuantity, setStockQuantity] = useState("100");
  const [wholesaleUnitType, setWholesaleUnitType] = useState("unit");
  const [country, setCountry] = useState(user?.country ?? "Haiti");
  const [city, setCity] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseCity, setWarehouseCity] = useState("");
  const [tier2Qty, setTier2Qty] = useState("50");
  const [tier2Price, setTier2Price] = useState("");
  const [tier3Qty, setTier3Qty] = useState("100");
  const [tier3Price, setTier3Price] = useState("");

  const cities = citiesFor(country);

  const reload = () => {
    setLoading(true);
    fetchWholesaleProducts({ mine: true })
      .then((list) => {
        setMine(list);
        setError(null);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authLoading) return;
    if (!allowed) setLocation("/");
  }, [authLoading, allowed, setLocation]);

  useEffect(() => {
    if (!allowed) return;
    reload();
  }, [allowed]);

  useEffect(() => {
    if (user?.country) setCountry(user.country);
  }, [user?.country]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!country.trim() || !warehouseName.trim()) {
      setError(
        t("wholesale.warehouseRequired", {
          defaultValue: "Country and warehouse / depot name are required.",
        }),
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const price = Number(unitPrice);
      const tiers = [
        { minQuantity: Number(minOrderQty) || 1, maxQuantity: null, unitPrice: price },
      ];
      if (tier2Price && Number(tier2Price) > 0) {
        tiers.push({
          minQuantity: Number(tier2Qty) || 50,
          maxQuantity: null,
          unitPrice: Number(tier2Price),
        });
      }
      if (tier3Price && Number(tier3Price) > 0) {
        tiers.push({
          minQuantity: Number(tier3Qty) || 100,
          maxQuantity: null,
          unitPrice: Number(tier3Price),
        });
      }

      const created = await createWholesaleProduct({
        title,
        description,
        unitPrice: price,
        minOrderQty: Number(minOrderQty) || 1,
        stockQuantity: Number(stockQuantity) || 0,
        wholesaleUnitType,
        country,
        city: city || null,
        warehouseName: warehouseName.trim(),
        warehouseCity: warehouseCity.trim() || city || null,
        contactOnly: true,
        offersWarehousePickup: true,
        tiers,
      });
      setShowForm(false);
      setTitle("");
      setDescription("");
      setUnitPrice("");
      setWarehouseName("");
      setWarehouseCity("");
      setTier2Price("");
      setTier3Price("");
      setLocation(`/wholesale/products/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || !allowed) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-sm text-muted-foreground">
        {t("common.loading", { defaultValue: "Loading…" })}
      </div>
    );
  }

  return (
    <WholesaleShell
      title={t("wholesale.sellerTitle", { defaultValue: "My wholesale" })}
      subtitle={t("wholesale.sellerSubtitle", {
        defaultValue: "List bulk stock from your depot. Buyers chat you — no buy button.",
      })}
      actions={
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-[hsl(152,65%,18%)]"
          data-testid="wholesale-toggle-form"
        >
          <Plus className="h-3.5 w-3.5" />
          {showForm
            ? t("common.cancel", { defaultValue: "Cancel" })
            : t("wholesale.newProduct", { defaultValue: "New product" })}
        </button>
      }
    >
      <p className="mb-3 rounded-xl border border-[hsl(152,30%,80%)] bg-[hsl(152,40%,96%)] px-3 py-2 text-[12px] text-[hsl(152,40%,24%)] dark:border-[hsl(152,20%,28%)] dark:bg-[hsl(152,18%,14%)] dark:text-[hsl(152,30%,78%)]">
        {t("wholesale.sellerModelNote", {
          defaultValue: "Sell wholesale in your country from your warehouse. Deals close in Market chat only.",
        })}
      </p>

      {error && (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="mb-5 space-y-3 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
          data-testid="wholesale-create-form"
        >
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("wholesale.formTitle", { defaultValue: "Product title" })}
            </label>
            <input
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("wholesale.description", { defaultValue: "Description" })}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-xl border border-[hsl(152,30%,80%)] bg-[hsl(152,30%,96%)] p-3 dark:border-[hsl(152,20%,28%)] dark:bg-[hsl(152,20%,14%)]">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[hsl(152,45%,28%)]">
              <Warehouse className="h-3.5 w-3.5" />
              {t("wholesale.depotSection", { defaultValue: "Country & warehouse" })}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {t("wholesale.country", { defaultValue: "Country" })}
                </label>
                <select
                  required
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setCity("");
                  }}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  data-testid="wholesale-seller-country"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {COUNTRY_FLAGS[c] ? `${COUNTRY_FLAGS[c]} ` : ""}
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {t("wholesale.city", { defaultValue: "City" })}
                </label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  <option value="">{t("wholesale.selectCity", { defaultValue: "Select city" })}</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {t("wholesale.warehouseName", { defaultValue: "Warehouse / depot name" })}
                </label>
                <input
                  required
                  value={warehouseName}
                  onChange={(e) => setWarehouseName(e.target.value)}
                  placeholder={t("wholesale.warehousePlaceholder", { defaultValue: "e.g. Delmas Depot" })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  data-testid="wholesale-warehouse-name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">
                  {t("wholesale.warehouseCity", { defaultValue: "Depot city" })}
                </label>
                <input
                  value={warehouseCity}
                  onChange={(e) => setWarehouseCity(e.target.value)}
                  placeholder={city || t("wholesale.warehouseCityHint", { defaultValue: "City of the warehouse" })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("wholesale.unitPrice", { defaultValue: "Unit price" })}
              </label>
              <input
                required
                type="number"
                min="0.01"
                step="0.01"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("wholesale.minOrder", { defaultValue: "Min qty" })}
              </label>
              <input
                type="number"
                min="1"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("wholesale.stock", { defaultValue: "Stock" })}
              </label>
              <input
                type="number"
                min="0"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">
                {t("wholesale.unitType", { defaultValue: "Unit" })}
              </label>
              <input
                value={wholesaleUnitType}
                onChange={(e) => setWholesaleUnitType(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="rounded-xl bg-[hsl(152,30%,96%)] p-3 dark:bg-[hsl(152,20%,14%)]">
            <p className="text-xs font-bold uppercase tracking-wide text-[hsl(152,45%,28%)]">
              {t("wholesale.priceTiers", { defaultValue: "Volume price tiers (optional)" })}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <input
                type="number"
                placeholder="Qty 2"
                value={tier2Qty}
                onChange={(e) => setTier2Qty(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Price 2"
                value={tier2Price}
                onChange={(e) => setTier2Price(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
              />
              <input
                type="number"
                placeholder="Qty 3"
                value={tier3Qty}
                onChange={(e) => setTier3Qty(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Price 3"
                value={tier3Price}
                onChange={(e) => setTier3Price(e.target.value)}
                className="h-10 rounded-lg border border-border bg-background px-2 text-sm"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white disabled:opacity-60"
          >
            {saving
              ? t("common.saving", { defaultValue: "Saving…" })
              : t("wholesale.publish", { defaultValue: "Publish for chat buyers" })}
          </button>
        </form>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/70" />
          ))}
        </div>
      ) : mine.length === 0 && !showForm ? (
        <WholesaleEmpty
          title={t("wholesale.sellerEmptyTitle", { defaultValue: "No wholesale listings yet" })}
          body={t("wholesale.sellerEmptyBody", {
            defaultValue: "Add warehouse stock with volume pricing. Buyers reach you in Market chat only.",
          })}
          action={
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[hsl(152,55%,28%)] px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Plus className="h-4 w-4" />
              {t("wholesale.createFirst", { defaultValue: "Create wholesale product" })}
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {mine.map((p) => (
            <li key={p.id}>
              <Link
                href={`/wholesale/products/${p.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-white px-3 py-3 dark:bg-[hsl(152,16%,12%)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(p.unitPrice, p.currency)} · min {p.minOrderQty} · stock {p.stockQuantity}
                    {p.warehouseName ? ` · ${p.warehouseName}` : ""}
                    {p.country ? ` · ${p.country}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-md bg-[hsl(152,40%,92%)] px-2 py-0.5 text-[10px] font-bold uppercase text-[hsl(152,50%,28%)] dark:bg-[hsl(152,30%,20%)] dark:text-[hsl(152,50%,75%)]">
                  {p.status}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WholesaleShell>
  );
}
