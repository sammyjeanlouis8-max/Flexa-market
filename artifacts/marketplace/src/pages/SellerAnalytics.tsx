import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import {
  ArrowLeft, Eye, MousePointerClick, ShoppingCart, TrendingUp,
  Calendar, Loader2, Megaphone, Package, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tab = "overview" | "listings" | "boosts" | "traffic";
type Range = "today" | "7d" | "30d" | "90d";

interface AnalyticsPayload {
  overview: {
    views: number;
    organicViews: number;
    sponsoredViews: number;
    clicks: number;
    sales: number;
    revenue: number;
    ctr: number;
    favorites: number;
  };
  channels: {
    listings: { views: number; clicks: number; sales: number };
    boosts: {
      views: number; clicks: number; sales: number;
      activeCampaigns: number; adSpend: number; remainingBudget: number;
    };
  };
  listings: Array<{
    id: number; title: string; views: number; thumbnail: string | null; isBoosted: boolean;
  }>;
  boosts: Array<{
    id: number; listingId: number; plan: string; budget: number;
    impressions: number; clicks: number; ctr: number;
    estimatedSpentUsd: number; remainingBudgetUsd: number; isActive: boolean;
  }>;
  traffic: Array<{ date: string; organic: number; sponsored: number }>;
  definitions?: { note?: string };
}

export default function SellerAnalytics() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>("7d");
  const [data, setData] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/seller/analytics?range=${range}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || t("accountCenter.analyticsLoadError"));
        setData(body);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setError(err.message || t("accountCenter.analyticsLoadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, range, t]);

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const maxTraffic = Math.max(1, ...(data?.traffic.map((d) => d.organic + d.sponsored) ?? [1]));

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-5 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label={t("settings.backToSettings")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{t("accountCenter.analytics")}</h1>
          <p className="text-xs text-muted-foreground">{t("accountCenter.analyticsPageSub")}</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-none" role="tablist">
        {([
          ["overview", t("accountCenter.tabOverview")],
          ["listings", t("accountCenter.tabListings")],
          ["boosts", t("accountCenter.tabBoosts")],
          ["traffic", t("accountCenter.tabTraffic")],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              "shrink-0 h-9 px-3.5 rounded-full text-xs font-semibold border transition-colors",
              tab === id
                ? "bg-[hsl(152,65%,18%)] text-white border-transparent"
                : "bg-card text-foreground border-border hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <label className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-card text-xs font-medium">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="bg-transparent outline-none"
            aria-label={t("accountCenter.dateRange")}
          >
            <option value="today">{t("accountCenter.rangeToday")}</option>
            <option value="7d">{t("accountCenter.range7d")}</option>
            <option value="30d">{t("accountCenter.range30d")}</option>
            <option value="90d">{t("accountCenter.range90d")}</option>
          </select>
        </label>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t("profile.loading")}</span>
        </div>
      )}

      {!loading && error && (
        <Card className="p-4 text-sm text-destructive border-destructive/30">{error}</Card>
      )}

      {!loading && data && tab === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: t("accountCenter.metricViews"), value: data.overview.views.toLocaleString(), Icon: Eye, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" },
              { label: t("accountCenter.metricClicks"), value: data.overview.clicks.toLocaleString(), Icon: MousePointerClick, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30" },
              { label: t("accountCenter.metricSales"), value: data.overview.sales.toLocaleString(), Icon: ShoppingCart, color: "text-violet-600 bg-violet-50 dark:bg-violet-950/30" },
              { label: t("accountCenter.metricCtr"), value: `${data.overview.ctr}%`, Icon: TrendingUp, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/30" },
            ].map((kpi) => (
              <Card key={kpi.label} className="rounded-2xl p-3.5">
                <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center mb-2", kpi.color)}>
                  <kpi.Icon className="h-4 w-4" />
                </div>
                <p className="text-xl font-black tabular-nums text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
              </Card>
            ))}
          </div>

          <Card className="rounded-2xl p-4 space-y-3">
            <h2 className="text-sm font-bold">{t("accountCenter.trafficChart")}</h2>
            {data.traffic.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">{t("accountCenter.noTraffic")}</p>
            ) : (
              <div className="flex items-end gap-1 h-36">
                {data.traffic.map((day) => {
                  const total = day.organic + day.sponsored;
                  const h = Math.max(4, Math.round((total / maxTraffic) * 100));
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                      <div
                        className="w-full rounded-t-md bg-[hsl(152,65%,28%)] dark:bg-emerald-500/80"
                        style={{ height: `${h}%` }}
                        title={`${day.date}: ${total}`}
                      />
                      <span className="text-[9px] text-muted-foreground truncate w-full text-center">
                        {day.date.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <div className="space-y-2">
            <h2 className="text-sm font-bold">{t("accountCenter.byChannel")}</h2>
            <Card className="rounded-2xl divide-y divide-border overflow-hidden">
              <Link href="/settings/analytics" onClick={() => setTab("listings")} className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 flex items-center justify-center">
                  <Package className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t("accountCenter.channelListings")}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.channels.listings.views.toLocaleString()} {t("accountCenter.metricViews").toLowerCase()}
                    {" · "}
                    {data.channels.listings.sales} {t("accountCenter.metricSales").toLowerCase()}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link href="/booster" className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent">
                <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex items-center justify-center">
                  <Megaphone className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t("accountCenter.channelBoosts")}</p>
                  <p className="text-xs text-muted-foreground">
                    {data.channels.boosts.views.toLocaleString()} {t("accountCenter.metricViews").toLowerCase()}
                    {" · "}
                    {data.channels.boosts.clicks} {t("accountCenter.metricClicks").toLowerCase()}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </Card>
          </div>
          {data.definitions?.note && (
            <p className="text-[11px] text-muted-foreground">{data.definitions.note}</p>
          )}
        </div>
      )}

      {!loading && data && tab === "listings" && (
        <div className="space-y-2">
          {data.listings.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
              {t("accountCenter.noListings")}
              <div className="mt-3">
                <Link href="/sell"><Button size="sm">{t("settings.addProduct")}</Button></Link>
              </div>
            </Card>
          ) : data.listings.map((item) => (
            <Link key={item.id} href={`/listings/${item.id}`}>
              <Card className="rounded-2xl p-3 flex items-center gap-3 hover:bg-accent/40 transition-colors">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{item.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.views.toLocaleString()} {t("accountCenter.metricViews").toLowerCase()}
                    {item.isBoosted ? ` · ${t("accountCenter.boosted")}` : ""}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Card>
            </Link>
          ))}
        </div>
      )}

      {!loading && data && tab === "boosts" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <Card className="rounded-2xl p-3">
              <p className="text-xs text-muted-foreground">{t("accountCenter.activeCampaigns")}</p>
              <p className="text-xl font-black">{data.channels.boosts.activeCampaigns}</p>
            </Card>
            <Card className="rounded-2xl p-3">
              <p className="text-xs text-muted-foreground">{t("accountCenter.adSpend")}</p>
              <p className="text-xl font-black">${data.channels.boosts.adSpend.toFixed(2)}</p>
            </Card>
            <Card className="rounded-2xl p-3">
              <p className="text-xs text-muted-foreground">{t("myBoosts.remainingLabel")}</p>
              <p className="text-xl font-black">${data.channels.boosts.remainingBudget.toFixed(2)}</p>
            </Card>
            <Card className="rounded-2xl p-3">
              <p className="text-xs text-muted-foreground">{t("myBoosts.ctrLabel")}</p>
              <p className="text-xl font-black">
                {data.channels.boosts.views > 0
                  ? `${((data.channels.boosts.clicks / data.channels.boosts.views) * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </Card>
          </div>
          {data.boosts.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground rounded-2xl">
              {t("accountCenter.noBoosts")}
              <div className="mt-3">
                <Link href="/booster"><Button size="sm">{t("myBoosts.boostCta")}</Button></Link>
              </div>
            </Card>
          ) : data.boosts.map((b) => (
            <Card key={b.id} className="rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{b.plan} · ${b.budget.toFixed(2)}</p>
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full",
                  b.isActive ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground",
                )}>
                  {b.isActive ? t("accountCenter.active") : t("myBoosts.expired")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {b.impressions.toLocaleString()} {t("myBoosts.impressionsLabel").toLowerCase()}
                {" · "}
                {b.clicks} {t("myBoosts.clicksLabel").toLowerCase()}
                {" · "}
                CTR {b.ctr}%
              </p>
              <p className="text-xs">
                {t("myBoosts.spentLabel")}: ${b.estimatedSpentUsd.toFixed(2)}
                {" · "}
                {t("myBoosts.remainingLabel")}: ${b.remainingBudgetUsd.toFixed(2)}
              </p>
            </Card>
          ))}
        </div>
      )}

      {!loading && data && tab === "traffic" && (
        <div className="space-y-3">
          <Card className="rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("accountCenter.organicTraffic")}</span>
              <span className="font-semibold tabular-nums">{data.overview.organicViews.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("accountCenter.sponsoredTraffic")}</span>
              <span className="font-semibold tabular-nums">{data.overview.sponsoredViews.toLocaleString()}</span>
            </div>
          </Card>
          {data.traffic.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">{t("accountCenter.noTraffic")}</p>
          ) : (
            <Card className="rounded-2xl overflow-hidden divide-y divide-border">
              {data.traffic.map((day) => (
                <div key={day.date} className="px-4 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{day.date}</span>
                  <span className="font-semibold tabular-nums">
                    {(day.organic + day.sponsored).toLocaleString()}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
