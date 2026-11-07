import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import BoosterLayout from "./BoosterLayout";

export default function BoosterAnalytics() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [totals, setTotals] = useState({
    impressions: 0, reach: 0, videoViews: 0, clicks: 0, skips: 0,
  });
  const [series, setSeries] = useState<Array<{ date: string; impressions: number }>>([]);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const boostId = new URLSearchParams(window.location.search).get("boostId");
    const qs = boostId ? `?boostId=${encodeURIComponent(boostId)}` : "";
    fetch(`/api/booster/analytics${qs}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        setTotals(d.totals || totals);
        setSeries(d.series || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const maxImp = Math.max(1, ...series.map((s) => s.impressions));

  return (
    <BoosterLayout
      title={t("booster.analytics.title")}
      subtitle={t("booster.analytics.subtitle")}
    >
      {loading ? (
        <div className="bp-empty"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : (
        <>
          <div className="bp-stat-grid mb-4">
            <div className="bp-stat">
              <div className="k">{t("booster.analytics.impressions")}</div>
              <div className="v">{totals.impressions.toLocaleString()}</div>
            </div>
            <div className="bp-stat">
              <div className="k">{t("booster.analytics.reach")}</div>
              <div className="v">{totals.reach.toLocaleString()}</div>
            </div>
            <div className="bp-stat">
              <div className="k">{t("booster.analytics.videoViews")}</div>
              <div className="v">{totals.videoViews.toLocaleString()}</div>
            </div>
            <div className="bp-stat">
              <div className="k">{t("booster.analytics.clicks")}</div>
              <div className="v">{totals.clicks.toLocaleString()}</div>
            </div>
          </div>
          <div className="bp-card">
            <div className="font-bold text-sm mb-2">{t("booster.analytics.chartTitle")}</div>
            <div className="bp-chart" data-testid="booster-analytics-chart">
              {series.map((s) => (
                <div
                  key={s.date}
                  className="bp-bar"
                  title={`${s.date}: ${s.impressions}`}
                  style={{ height: `${Math.max(8, (s.impressions / maxImp) * 100)}%` }}
                />
              ))}
            </div>
            <div className="text-xs text-slate-500 mt-2">
              {t("booster.analytics.skips")}: {totals.skips.toLocaleString()}
            </div>
          </div>
        </>
      )}
    </BoosterLayout>
  );
}
