import { useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import "./boostAnalytics.css";

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <h2 className="ba-card-title" title={hint}>
      <span>{children}</span>
      {hint ? <span className="ba-info" aria-label={hint}>i</span> : null}
    </h2>
  );
}

type Metric = { value: number | null; available: boolean; note?: string };
type Tab = "overview" | "audience" | "traffic" | "engagement" | "sales";

type DetailPayload = {
  campaign: {
    boostId: number;
    listingId: number;
    title: string;
    thumbnail: string | null;
    product: { title: string; price: number | null };
    status: string;
    budget: number;
    spend: number;
    remainingBudget: number;
    startsAt: string | null;
    endsAt: string | null;
    remainingMs: number;
    canRenew: boolean;
  };
  overview: Record<string, Metric>;
  series: Array<{ date: string; impressions: number }>;
  engagementSeries: Array<{ date: string; likes: number; shares: number; clicks: number; views: number }>;
  trafficSources: Array<{ source: string; count: number; pct: number }>;
  trafficSourcesAvailable: boolean;
  searchTerms: Array<{ query: string; count: number; pct: number }>;
  searchTermsAvailable: boolean;
  audience: {
    available: boolean;
    note?: string;
    countries: Array<{ key: string; count: number; pct: number }>;
    devices: Array<{ key: string; count: number; pct: number }>;
  };
  sales: Record<string, Metric> & { attributionWindowDays?: number };
};

const TABS: Tab[] = ["overview", "audience", "traffic", "engagement", "sales"];

function fmt(m: Metric | undefined, t: (k: string) => string, kind?: "money" | "pct") {
  if (!m || !m.available || m.value == null) return t("boostAnalytics.notAvailable");
  if (kind === "money") return `$${Number(m.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (kind === "pct") return `${Number(m.value)}%`;
  return Number(m.value).toLocaleString();
}

function remainingLabel(ms: number, t: (k: string, o?: object) => string) {
  if (ms <= 0) return t("boostAnalytics.ended");
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return t("boostAnalytics.endsInDays", { d, h, m });
  if (h > 0) return t("boostAnalytics.endsInHours", { h, m });
  return t("boostAnalytics.endsInMins", { m });
}

export default function BoostAnalyticsDetail() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [, params] = useRoute("/boost-analytics/:boostId");
  const boostId = params?.boostId;
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DetailPayload | null>(null);

  useEffect(() => {
    if (!token || !boostId) { setLoading(false); return; }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/boost-analytics/${boostId}`, {
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
  }, [token, boostId, t]);

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
    <div className="ba-page" data-testid="boost-analytics-detail">
      <div className="ba-header">
        <Link href="/boost-analytics" className="ba-back" aria-label={t("common.back", { defaultValue: "Back" })}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1>{t("boostAnalytics.videoAnalytics")}</h1>
          <p>{t("boostAnalytics.subtitle")}</p>
        </div>
      </div>

      {loading ? (
        <div className="ba-empty"><Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" /></div>
      ) : error || !data ? (
        <div className="ba-empty">{error || t("boostAnalytics.loadError")}</div>
      ) : (
        <>
          <div className="ba-hero">
            {data.campaign.thumbnail ? (
              <img src={data.campaign.thumbnail} alt="" />
            ) : (
              <div style={{ width: 88, height: 118, borderRadius: 12, background: "#e2e8f0" }} />
            )}
            <div className="min-w-0">
              <div className="font-extrabold text-[0.95rem] leading-snug truncate">{data.campaign.title}</div>
              <div className="text-xs text-slate-500 mt-1 truncate">
                {data.campaign.product?.title}
                {data.campaign.product?.price != null ? ` · $${data.campaign.product.price}` : ""}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                <span className={`ba-badge ${data.campaign.status}`}>
                  {t(`boostAnalytics.status.${data.campaign.status}`, { defaultValue: data.campaign.status })}
                </span>
                <span className="text-[11px] text-slate-500">
                  {t("boostAnalytics.budget")}: ${data.campaign.budget.toLocaleString()}
                  {" · "}
                  {t("boostAnalytics.spent")}: ${data.campaign.spend.toLocaleString()}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {data.campaign.status === "active"
                  ? remainingLabel(data.campaign.remainingMs, t)
                  : data.campaign.endsAt
                    ? `${t("boostAnalytics.ended")}: ${new Date(data.campaign.endsAt).toLocaleDateString()}`
                    : null}
              </div>
              <div className="ba-actions">
                {data.campaign.canRenew && (
                  <Link href={`/boost/${data.campaign.listingId}`} className="ba-btn primary">
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("boostAnalytics.renewBoost")}
                  </Link>
                )}
                <Link href={`/listings/${data.campaign.listingId}`} className="ba-btn">
                  {t("boostAnalytics.openListing")}
                </Link>
              </div>
            </div>
          </div>

          <div className="ba-tabs">
            {TABS.map((key) => (
              <button
                key={key}
                type="button"
                className={`ba-tab${tab === key ? " active" : ""}`}
                onClick={() => setTab(key)}
              >
                {t(`boostAnalytics.tabs.${key}`)}
              </button>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <div className="ba-kpi-grid">
                {(["videoViews", "impressions", "uniqueViewers", "productClicks", "likes", "comments", "shares", "ctr", "spend", "totalWatchTime", "averageWatchDuration", "videoCompletionRate", "retention3s", "retention5s", "completion25", "completion50", "completion75", "completion100", "newFollowers"] as const).map((key) => (
                  <div className="ba-kpi" key={key} title={data.overview[key]?.note}>
                    <div className="k">{t(`boostAnalytics.detail.${key}`)}</div>
                    <div className={`v${!data.overview[key]?.available ? " na" : ""}`}>
                      {fmt(data.overview[key], t, key === "ctr" || key.includes("completion") || key.includes("retention") ? "pct" : key === "spend" ? "money" : undefined)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="ba-card">
                <h2>{t("boostAnalytics.performanceChart")}</h2>
                {data.series.length ? (
                  <div className="ba-chart">
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
            </>
          )}

          {tab === "audience" && (
            <div className="ba-card">
              <h2>{t("boostAnalytics.tabs.audience")}</h2>
              {!data.audience.available ? (
                <p className="ba-note">{data.audience.note || t("boostAnalytics.audienceUnavailable")}</p>
              ) : (
                <>
                  {data.audience.countries.map((c) => (
                    <div className="ba-src-row" key={c.key}>
                      <span className="label">{c.key}</span>
                      <span className="pct">{c.pct}%</span>
                      <div className="ba-track"><div className="ba-fill" style={{ width: `${Math.min(100, c.pct)}%` }} /></div>
                    </div>
                  ))}
                  {data.audience.devices.map((d) => (
                    <div className="ba-src-row" key={d.key}>
                      <span className="label">{d.key}</span>
                      <span className="pct">{d.pct}%</span>
                      <div className="ba-track"><div className="ba-fill" style={{ width: `${Math.min(100, d.pct)}%` }} /></div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {tab === "traffic" && (
            <>
              <div className="ba-card">
                <SectionTitle hint={t("boostAnalytics.trafficUnavailable")}>
                  {t("boostAnalytics.trafficSources")}
                </SectionTitle>
                {data.trafficSourcesAvailable ? (
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
                <SectionTitle hint={t("boostAnalytics.searchUnavailable")}>
                  {t("boostAnalytics.searchAnalytics")}
                </SectionTitle>
                {data.searchTermsAvailable ? (
                  <div className="ba-src-list">
                    {data.searchTerms.map((s) => (
                      <div className="ba-src-row" key={s.query}>
                        <span className="label">{s.query}</span>
                        <span className="pct">{s.pct.toFixed(1)}%</span>
                        <div className="ba-track"><div className="ba-fill" style={{ width: `${Math.min(100, s.pct)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ba-note">{t("boostAnalytics.searchUnavailable")}</p>
                )}
              </div>
              <Link href={`/boost/${data.campaign.listingId}`} className="ba-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", textDecoration: "none", color: "inherit" }}>
                <span className="font-extrabold text-[0.95rem]">{t("boostAnalytics.wantMoreTraffic")}</span>
                <ChevronRight className="h-5 w-5 text-slate-400" />
              </Link>
            </>
          )}

          {tab === "engagement" && (
            <div className="ba-card">
              <h2>{t("boostAnalytics.tabs.engagement")}</h2>
              <div className="ba-kpi-grid">
                {(["likes", "comments", "shares", "productClicks"] as const).map((key) => (
                  <div className="ba-kpi" key={key}>
                    <div className="k">{t(`boostAnalytics.detail.${key}`)}</div>
                    <div className="v">{fmt(data.overview[key], t)}</div>
                  </div>
                ))}
              </div>
              {data.engagementSeries?.length ? (
                <div className="ba-chart mt-3">
                  {data.engagementSeries.map((s) => {
                    const v = s.likes + s.shares + s.clicks + s.views;
                    const max = Math.max(1, ...data.engagementSeries.map((x) => x.likes + x.shares + x.clicks + x.views));
                    return (
                      <div
                        key={s.date}
                        className="ba-bar"
                        title={`${s.date}: ${v}`}
                        style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="ba-note">{t("boostAnalytics.noSeries")}</p>
              )}
            </div>
          )}

          {tab === "sales" && (
            <div className="ba-card">
              <h2>{t("boostAnalytics.tabs.sales")}</h2>
              <div className="ba-kpi-grid">
                {(["productClicks", "addToCartEvents", "checkoutStarts", "purchases", "attributedRevenue", "conversionRate", "costPerPurchase", "returnOnAdSpend"] as const).map((key) => (
                  <div className="ba-kpi" key={key} title={data.sales[key]?.note}>
                    <div className="k">{t(`boostAnalytics.sales.${key}`)}</div>
                    <div className={`v${!data.sales[key]?.available ? " na" : ""}`}>
                      {fmt(
                        data.sales[key],
                        t,
                        key === "attributedRevenue" || key === "costPerPurchase" ? "money"
                          : key === "conversionRate" ? "pct"
                            : key === "returnOnAdSpend" ? undefined
                              : undefined,
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <p className="ba-note">
                {t("boostAnalytics.attributionNote", { days: data.sales.attributionWindowDays ?? 7 })}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
