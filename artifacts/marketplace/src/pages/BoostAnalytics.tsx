import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, BarChart3, Loader2, Search } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import "./boostAnalytics.css";

type Metric = { value: number | null; available: boolean; note?: string };
type RangeKey = "today" | "7d" | "30d" | "90d" | "all";

type Campaign = {
  boostId: number;
  listingId: number;
  title: string;
  thumbnail: string | null;
  status: string;
  spend: number;
  impressions: number;
  videoViews: number;
  clicks: number;
  remainingMs: number;
};

type Payload = {
  summary: Record<string, Metric>;
  series: Array<{ date: string; impressions: number }>;
  trafficSources: Array<{ source: string; count: number; pct: number }>;
  trafficSourcesAvailable: boolean;
  campaigns: Campaign[];
};

const RANGE_KEYS: RangeKey[] = ["today", "7d", "30d", "90d", "all"];
const STATUS_KEYS = ["all", "active", "paused", "expired", "draft", "pending"] as const;

const SUMMARY_ORDER = [
  "totalBoostSpend",
  "totalVideoViews",
  "uniqueViewers",
  "totalImpressions",
  "totalLikes",
  "totalComments",
  "totalShares",
  "totalSaves",
  "productClicks",
  "addToCartEvents",
  "purchases",
  "attributedRevenue",
  "clickThroughRate",
  "conversionRate",
  "costPerClick",
  "costPerMille",
  "returnOnAdSpend",
] as const;

function fmtMetric(m: Metric | undefined, t: (k: string, o?: object) => string, kind?: "money" | "pct"): string {
  if (!m || !m.available || m.value == null) return t("boostAnalytics.notAvailable");
  if (kind === "money") return `$${Number(m.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (kind === "pct") return `${Number(m.value).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
  return Number(m.value).toLocaleString();
}

function moneyKind(key: string): "money" | "pct" | undefined {
  if (["totalBoostSpend", "attributedRevenue", "costPerClick", "costPerMille"].includes(key)) return "money";
  if (["clickThroughRate", "conversionRate"].includes(key)) return "pct";
  return undefined;
}

export default function BoostAnalytics() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [range, setRange] = useState<RangeKey>("30d");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ range, status, q });
    fetch(`/api/boost-analytics?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ac.signal,
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || t("boostAnalytics.loadError"));
        setData(body);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || t("boostAnalytics.loadError"));
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    return () => ac.abort();
  }, [token, range, status, q, t]);

  const maxImp = useMemo(
    () => Math.max(1, ...(data?.series.map((s) => s.impressions) ?? [1])),
    [data?.series],
  );

  if (!user) {
    return (
      <div className="ba-page">
        <div className="ba-empty">
          <p>{t("settings.loginRequired")}</p>
          <Link href="/auth/login" className="ba-btn primary">{t("auth.signIn")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ba-page" data-testid="boost-analytics-page">
      <div className="ba-header">
        <Link href="/booster" className="ba-back" aria-label={t("common.back", { defaultValue: "Back" })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1>{t("boostAnalytics.title")}</h1>
          <p>{t("boostAnalytics.subtitle")}</p>
        </div>
        <BarChart3 className="h-5 w-5 text-blue-600 ml-auto shrink-0" />
      </div>

      <div className="ba-filters">
        {RANGE_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`ba-chip${range === key ? " active" : ""}`}
            onClick={() => setRange(key)}
          >
            {t(`boostAnalytics.range.${key}`)}
          </button>
        ))}
      </div>

      <div className="ba-filters">
        {STATUS_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            className={`ba-chip${status === key ? " active" : ""}`}
            onClick={() => setStatus(key)}
          >
            {t(`boostAnalytics.status.${key}`)}
          </button>
        ))}
        <label className="relative flex-1 min-w-[140px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            className="ba-search w-full pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("boostAnalytics.searchPlaceholder")}
            aria-label={t("boostAnalytics.searchPlaceholder")}
          />
        </label>
      </div>

      {loading ? (
        <div className="ba-empty"><Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" /></div>
      ) : error ? (
        <div className="ba-empty">{error}</div>
      ) : (
        <>
          <div className="ba-kpi-grid">
            {SUMMARY_ORDER.map((key) => {
              const m = data?.summary?.[key];
              return (
                <div className="ba-kpi" key={key} title={m?.note}>
                  <div className="k">{t(`boostAnalytics.metrics.${key}`)}</div>
                  <div className={`v${!m?.available ? " na" : ""}`}>
                    {fmtMetric(m, t, moneyKind(key))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="ba-card">
            <h2>{t("boostAnalytics.performanceChart")}</h2>
            {data?.series?.length ? (
              <div className="ba-chart" data-testid="boost-analytics-chart">
                {data.series.map((s) => (
                  <div
                    key={s.date}
                    className="ba-bar"
                    title={`${s.date}: ${s.impressions}`}
                    style={{ height: `${Math.max(6, (s.impressions / maxImp) * 100)}%` }}
                  />
                ))}
              </div>
            ) : (
              <p className="ba-note">{t("boostAnalytics.noSeries")}</p>
            )}
          </div>

          <div className="ba-card">
            <h2 className="ba-card-title">
              <span>{t("boostAnalytics.trafficSources")}</span>
              <span className="ba-info">i</span>
            </h2>
            {data?.trafficSourcesAvailable && data.trafficSources.length > 0 ? (
              <div className="ba-src-list">
                {data.trafficSources.map((src) => (
                  <div className="ba-src-row" key={src.source}>
                    <span className="label">{t(`boostAnalytics.sources.${src.source}`, { defaultValue: src.source })}</span>
                    <span className="pct">{src.pct.toFixed(1)}%</span>
                    <div className="ba-track"><div className="ba-fill" style={{ width: `${Math.min(100, src.pct)}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ba-note">{t("boostAnalytics.trafficUnavailable")}</p>
            )}
          </div>

          <div className="ba-card">
            <h2>{t("boostAnalytics.campaigns")}</h2>
            {data?.campaigns?.length ? (
              data.campaigns.map((c) => (
                <Link key={c.boostId} href={`/boost-analytics/${c.boostId}`} className="ba-campaign">
                  {c.thumbnail ? (
                    <img className="ba-thumb" src={c.thumbnail} alt="" />
                  ) : (
                    <div className="ba-thumb" />
                  )}
                  <div className="meta">
                    <div className="title">{c.title}</div>
                    <div className="sub">
                      {c.videoViews.toLocaleString()} {t("boostAnalytics.metrics.totalVideoViews").toLowerCase()}
                      {" · "}
                      {c.impressions.toLocaleString()} {t("boostAnalytics.metrics.totalImpressions").toLowerCase()}
                      {" · "}
                      ${c.spend.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <span className={`ba-badge ${c.status}`}>
                    {t(`boostAnalytics.status.${c.status}`, { defaultValue: c.status })}
                  </span>
                </Link>
              ))
            ) : (
              <div className="ba-empty">
                <p>{t("boostAnalytics.noCampaigns")}</p>
                <Link href="/booster/create" className="ba-btn primary">{t("boostAnalytics.createBoost")}</Link>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
