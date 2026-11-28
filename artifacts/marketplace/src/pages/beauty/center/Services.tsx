import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  createBeautyService,
  fetchMyBeautyBusiness,
  formatBeautyPrice,
  updateBeautyService,
  type BeautyService,
} from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

export default function BeautyCenterServices() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Services">
        <Body id={Number(businessId)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [services, setServices] = useState<BeautyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("60");
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    fetchMyBeautyBusiness(id)
      .then((d) => setServices(d.services ?? []))
      .catch(() => setServices([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [id]);

  async function onAdd() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createBeautyService(id, {
        name: name.trim(),
        priceMinor: Math.round((Number(price) || 0) * 100),
        durationMinutes: Number(duration) || 60,
        currency: "USD",
        serviceLocation: "at_business",
      });
      setName("");
      setPrice("");
      load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(s: BeautyService) {
    await updateBeautyService(id, s.id, {
      status: s.status === "active" ? "inactive" : "active",
    });
    load();
  }

  return (
    <div>
      <CenterNav businessId={id} />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>
      ) : services.length === 0 ? (
        <BeautyEmpty title={t("beauty.emptyServicesTitle")} body="" />
      ) : (
        <div className="space-y-2">
          {services.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3">
              <div>
                <p className="text-sm font-bold">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBeautyPrice(s.price, s.currency)} · {s.durationMinutes} min · {s.status}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleStatus(s)}
                className="text-xs font-semibold text-[hsl(350,45%,40%)]"
              >
                {s.status === "active" ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-2 rounded-2xl border border-[hsl(350,20%,88%)] bg-white p-3">
        <p className="text-sm font-extrabold">{t("beauty.addService")}</p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("beauty.businessName")}
          className="w-full rounded-lg border border-[hsl(350,20%,88%)] px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            type="number"
            className="w-full rounded-lg border border-[hsl(350,20%,88%)] px-3 py-2 text-sm"
          />
          <input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="Min"
            type="number"
            className="w-24 rounded-lg border border-[hsl(350,20%,88%)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onAdd()}
          className="rounded-xl bg-[hsl(350,45%,38%)] px-4 py-2.5 text-sm font-bold text-white"
        >
          {t("beauty.save")}
        </button>
      </div>
    </div>
  );
}
