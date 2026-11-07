import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth";
import BoosterLayout from "../BoosterLayout";

interface CampaignOption {
  boostId: number;
  title: string;
}

interface AnalyticsPayload {
  totals: {
    impressions: number;
    reach: number;
    videoStarts: number;
    videoCompletions: number;
    tenSecViews: number;
    skips: number;
    clicks: number;
    messages: number;
    budget: number;
    estimatedSpentUsd: number;
    remainingBudgetUsd: number;
  };
  dailyImpressions: { date: string; impressions: number }[];
  geoPerformance: { city: string; impressions: number }[];
  reachIsEstimate: boolean;
}

export default function BoostAnalyticsPage() {
  const { token } = useAuth();
  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialBoost = params.get("boostId");

  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [boostId, setBoostId] = useState<number | null>(initialBoost ? Number(initialBoost) : null);
  const [days, setDays] = useState(7);
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/booster/campaigns", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => {
        const rows = Array.isArray(payload?.campaigns) ? payload.campaigns : [];
        setCampaigns(rows.map((c: any) => ({ boostId: c.boostId, title: c.title })));
        if (!boostId && rows[0]) setBoostId(rows[0].boostId);
      })
      .catch(() => {});
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!token || !boostId) { setLoading(false); return; }
    setLoading(true);
    fetch(`/api/booster/campaigns/${boostId}/analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((payload) => setData(payload))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token, boostId, days]);

  const chartPath = useMemo(() => {
    const series = data?.dailyImpressions ?? [];
    if (series.length < 2) return "";
    const max = Math.max(1, ...series.map((s) => s.impressions));
    const w = 320;
    const h = 120;
    return series.map((s, i) => {
      const x = (i / (series.length - 1)) * w;
      const y = h - (s.impressions / max) * (h - 12) - 6;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
  }, [data]);

  const t = data?.totals;

  return (
    <BoosterLayout
      title="Boost Analytics"
      subtitle="Estatistik reyèl soti nan evènman anons — pa gen done fo."
    >
      <div className="bp-card">
        <div className="bp-row">
          <div style={{ flex: 2, minWidth: 160 }}>
            <label className="bp-label">Campaign</label>
            <select
              className="bp-select"
              value={boostId ?? ""}
              onChange={(e) => setBoostId(e.target.value ? Number(e.target.value) : null)}
              data-testid="booster-analytics-campaign"
            >
              {campaigns.length === 0 && <option value="">Pa gen kampani</option>}
              {campaigns.map((c) => (
                <option key={c.boostId} value={c.boostId}>{c.title}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label className="bp-label">Timeframe</label>
            <select
              className="bp-select"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bp-empty">Chaje analytics…</div>
      ) : !t ? (
        <div className="bp-card bp-empty">Pa gen done pou kampani sa a.</div>
      ) : (
        <>
          <div className="bp-stat-grid">
            <div className="bp-stat"><strong>{t.impressions.toLocaleString()}</strong><span>Impressions</span></div>
            <div className="bp-stat"><strong>{t.reach.toLocaleString()}</strong><span>Reach (unique viewers)</span></div>
            <div className="bp-stat"><strong>{t.videoStarts.toLocaleString()}</strong><span>Video Views</span></div>
            <div className="bp-stat"><strong>{t.clicks.toLocaleString()}</strong><span>Clicks</span></div>
            <div className="bp-stat"><strong>{t.tenSecViews.toLocaleString()}</strong><span>10s Views</span></div>
            <div className="bp-stat"><strong>{t.skips.toLocaleString()}</strong><span>Skips</span></div>
            <div className="bp-stat"><strong>{t.messages.toLocaleString()}</strong><span>Messages</span></div>
            <div className="bp-stat">
              <strong>${t.estimatedSpentUsd.toFixed(2)}</strong>
              <span>Spent / ${t.budget.toFixed(2)}</span>
            </div>
          </div>

          <div className="bp-card" style={{ marginTop: 12 }}>
            <label className="bp-label">Impression trend</label>
            {chartPath ? (
              <svg className="bp-chart" viewBox="0 0 320 120" preserveAspectRatio="none" aria-hidden>
                <path d={chartPath} fill="none" stroke="#5b4dff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <p className="bp-empty" style={{ padding: 12 }}>Pa gen tandans jou-pa-jou ankò.</p>
            )}
          </div>

          {data?.geoPerformance?.length ? (
            <div className="bp-card">
              <label className="bp-label">Geographic performance</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data.geoPerformance.map((g) => (
                  <div key={g.city} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{g.city}</span>
                    <strong>{g.impressions.toLocaleString()}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </BoosterLayout>
  );
}
