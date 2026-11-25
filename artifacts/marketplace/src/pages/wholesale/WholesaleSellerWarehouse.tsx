import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, Plus } from "lucide-react";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";
import {
  createWarehouse,
  fetchWarehouses,
  type WholesaleWarehouse,
} from "@/lib/wholesaleApi";

const emptyForm = () => ({
  name: "",
  country: "Haiti",
  region: "",
  city: "",
  address: "",
  latitude: "",
  longitude: "",
});

export default function WholesaleSellerWarehouse() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<WholesaleWarehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const load = useCallback(() => {
    setLoading(true);
    fetchWarehouses({ mine: true, verified: false })
      .then((list) => {
        setRows(list);
        setError(null);
      })
      .catch((err: Error) => setError(err.message || t("wholesale.failedLoadWarehouses")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2 || !form.country.trim() || !form.city.trim()) {
      setError(
        t("wholesale.warehouseRequired", {
          defaultValue: "Name, country, and city are required.",
        }),
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createWarehouse({
        name: form.name.trim(),
        country: form.country.trim(),
        region: form.region.trim() || null,
        city: form.city.trim(),
        address: form.address.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      });
      setForm(emptyForm());
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("wholesale.couldNotSaveWarehouse"));
    } finally {
      setSaving(false);
    }
  };

  const statusClass = (s: string) => {
    if (s === "verified") return "bg-emerald-100 text-emerald-800";
    if (s === "rejected") return "bg-red-100 text-red-800";
    return "bg-amber-100 text-amber-800";
  };

  return (
    <WholesalePageGate>
      <WholesaleShell
        title={t("wholesale.myDepotTitle", { defaultValue: "My warehouse" })}
        subtitle={t("wholesale.myDepotSubtitle", {
          defaultValue:
            "Separate from your home address · multi-country depots. Admin must verify before you publish in that country.",
        })}
        actions={
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-[12px] font-bold text-[hsl(152,65%,18%)]"
            data-testid="wholesale-add-warehouse"
          >
            <Plus className="h-3.5 w-3.5" />
            {showForm ? t("wholesale.close") : t("wholesale.add")}
          </button>
        }
      >
        <div className="mb-4 flex gap-2 rounded-xl bg-[hsl(152,40%,94%)] p-3 text-xs font-semibold text-[hsl(152,55%,22%)]">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>
            {t("wholesale.sellCountryHint")}
          </p>
        </div>

        {showForm ? (
          <form
            className="mb-4 space-y-3 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
            onSubmit={onSubmit}
          >
            <p className="text-xs font-extrabold uppercase tracking-wide text-foreground">
              {t("wholesale.registerWarehouse")}
            </p>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.depotName")}</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                placeholder="Delmas Depot"
                data-testid="wholesale-depot-name"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.country")}</label>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {COUNTRY_FLAGS[c]} {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.regionState")}</label>
                <input
                  value={form.region}
                  onChange={(e) => setForm({ ...form, region: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="Ouest"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.city")}</label>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="Port-au-Prince"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.address")}</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="Route de Delmas 33"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.latitude")}</label>
                <input
                  value={form.latitude}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="18.55"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase text-muted-foreground">{t("wholesale.longitude")}</label>
                <input
                  value={form.longitude}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
                  placeholder="-72.30"
                  inputMode="decimal"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("wholesale.pickupDepotOnly")}
            </p>
            <button
              type="submit"
              disabled={saving}
              className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white disabled:opacity-70"
              data-testid="wholesale-save-warehouse"
            >
              {saving ? t("wholesale.saving") : t("wholesale.submitVerification")}
            </button>
          </form>
        ) : null}

        {error ? <p className="mb-3 text-sm font-semibold text-red-600">{error}</p> : null}

        {loading ? (
          <p className="py-8 text-sm text-muted-foreground">{t("wholesale.loadingWarehouses")}</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-white px-4 py-10 text-center dark:bg-[hsl(152,16%,12%)]">
            <p className="text-sm font-extrabold text-foreground">{t("wholesale.noWarehousesYet")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("wholesale.noWarehousesBody")}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {rows.map((w) => (
              <div
                key={w.id}
                className="rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
                data-testid={`wholesale-warehouse-${w.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-extrabold text-foreground">{w.name}</h3>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ${statusClass(w.verificationStatus)}`}>
                    {w.verificationStatus === "verified" ? t("wholesale.verified") : w.verificationStatus === "pending" ? t("wholesale.unverified") : w.verificationStatus}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {w.city}
                  {w.region ? `, ${w.region}` : ""} · {w.country}
                </p>
                {w.address ? <p className="text-sm text-muted-foreground">{w.address}</p> : null}
                {w.latitude != null && w.longitude != null ? (
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">
                    GPS {w.latitude.toFixed(4)}, {w.longitude.toFixed(4)}
                  </p>
                ) : (
                  <p className="mt-2 text-xs font-semibold text-muted-foreground">{t("wholesale.noGps")}</p>
                )}
                {w.verificationStatus === "rejected" && w.rejectionReason ? (
                  <p className="mt-2 text-xs font-semibold text-red-600">{w.rejectionReason}</p>
                ) : null}
                {w.verificationStatus === "verified" ? (
                  <p className="mt-2 text-xs font-bold text-[hsl(152,55%,28%)]">
                    {t("wholesale.canPublishCountry", { country: w.country })}
                  </p>
                ) : w.verificationStatus === "pending" ? (
                  <p className="mt-2 text-xs font-bold text-amber-700">
                    {t("wholesale.awaitingVerification", { country: w.country })}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}
