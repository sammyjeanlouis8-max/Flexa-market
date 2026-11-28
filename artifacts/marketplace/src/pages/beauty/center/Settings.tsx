import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  fetchMyBeautyBusiness,
  updateBeautyHours,
  updateMyBeautyBusiness,
  type BeautyBusiness,
  type BeautyHour,
} from "@/lib/beautyApi";
import { CenterNav } from "./CenterNav";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BeautyCenterSettings() {
  const { businessId } = useParams<{ businessId: string }>();
  return (
    <BeautyPageGate requireAuth>
      <BeautyShell title="Settings">
        <Body id={Number(businessId)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function Body({ id }: { id: number }) {
  const { t } = useTranslation();
  const [biz, setBiz] = useState<BeautyBusiness | null>(null);
  const [hours, setHours] = useState<BeautyHour[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchMyBeautyBusiness(id)
      .then((d) => {
        if (cancelled) return;
        setBiz(d.business);
        setHours(d.hours ?? []);
      })
      .catch(() => {
        if (!cancelled) setBiz(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function save() {
    if (!biz) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await updateMyBeautyBusiness(id, {
        name: biz.name,
        description: biz.description,
        phone: biz.phone,
        whatsapp: biz.whatsapp,
        email: biz.email,
        vacationMode: biz.vacationMode,
        temporarilyClosed: biz.temporarilyClosed,
        homeServiceAvailable: biz.homeServiceAvailable,
        showPublicAddress: biz.showPublicAddress,
      });
      setBiz(updated);
      if (hours.length) {
        await updateBeautyHours(id, hours.map((h) => ({
          weekday: h.weekday,
          isClosed: h.isClosed,
          openTime: h.openTime,
          closeTime: h.closeTime,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
        })));
      }
      setMessage(t("beauty.draftSaved"));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : t("beauty.loadError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>;
  if (!biz) return <BeautyEmpty title={t("beauty.loadError")} body="" />;

  return (
    <div>
      <CenterNav businessId={id} />
      <div className="space-y-3">
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">{t("beauty.businessName")}</span>
          <input
            value={biz.name}
            onChange={(e) => setBiz({ ...biz, name: e.target.value })}
            className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-semibold">{t("beauty.description")}</span>
          <textarea
            value={biz.description}
            onChange={(e) => setBiz({ ...biz, description: e.target.value })}
            className="w-full rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2.5"
            rows={3}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!biz.vacationMode}
            onChange={(e) => setBiz({ ...biz, vacationMode: e.target.checked })}
          />
          {t("beauty.vacationMode")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!biz.temporarilyClosed}
            onChange={(e) => setBiz({ ...biz, temporarilyClosed: e.target.checked })}
          />
          {t("beauty.temporarilyClosed")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!biz.homeServiceAvailable}
            onChange={(e) => setBiz({ ...biz, homeServiceAvailable: e.target.checked })}
          />
          {t("beauty.homeServiceAvailable")}
        </label>

        <div className="rounded-xl border border-[hsl(350,20%,88%)] bg-white p-3">
          <p className="mb-2 text-sm font-extrabold">{t("beauty.hours")}</p>
          {hours.map((h, idx) => (
            <div key={h.weekday} className="flex flex-wrap items-center gap-2 border-b border-[hsl(350,20%,94%)] py-2 text-xs last:border-0">
              <span className="w-10 font-semibold">{WEEKDAYS[h.weekday]}</span>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={h.isClosed}
                  onChange={(e) => {
                    const next = [...hours];
                    next[idx] = { ...h, isClosed: e.target.checked };
                    setHours(next);
                  }}
                />
                Closed
              </label>
              {!h.isClosed && (
                <>
                  <input
                    type="time"
                    value={h.openTime || "09:00"}
                    onChange={(e) => {
                      const next = [...hours];
                      next[idx] = { ...h, openTime: e.target.value };
                      setHours(next);
                    }}
                    className="rounded border border-[hsl(350,20%,88%)] px-1 py-1"
                  />
                  <input
                    type="time"
                    value={h.closeTime || "18:00"}
                    onChange={(e) => {
                      const next = [...hours];
                      next[idx] = { ...h, closeTime: e.target.value };
                      setHours(next);
                    }}
                    className="rounded border border-[hsl(350,20%,88%)] px-1 py-1"
                  />
                </>
              )}
            </div>
          ))}
        </div>

        {message && <p className="text-xs font-semibold text-[hsl(350,45%,35%)]">{message}</p>}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-xl bg-[hsl(350,45%,38%)] px-4 py-2.5 text-sm font-bold text-white"
        >
          {t("beauty.save")}
        </button>
      </div>
    </div>
  );
}
