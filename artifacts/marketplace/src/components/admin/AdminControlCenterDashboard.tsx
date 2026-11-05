import { useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Banknote,
  ClipboardList,
  Download,
  Flag,
  Headphones,
  Package,
  ShieldAlert,
  Users,
  Wifi,
} from "lucide-react";
import { useAdminGetStats } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AdminAnalyticsDashboard from "./AdminAnalyticsDashboard";

type SupportAnalytics = {
  total?: number;
  open?: number;
  closed?: number;
  closedToday?: number;
  avgResponseMin?: number | null;
};

type FraudDashboard = {
  stats?: {
    open_alerts?: number;
    critical_alerts?: number;
    high_alerts?: number;
    events_24h?: number;
  };
};

type PlatformRevenue = {
  summary?: {
    totalRevenue?: number;
    merchantCommission?: number;
    boostRevenue?: number;
    subscriptionRevenue?: number;
    gmv?: number;
    orderCount?: number;
  };
};

async function adminGet<T>(path: string): Promise<T | null> {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

function MetricCard({
  label,
  value,
  hint,
  href,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "default" | "alert" | "ok";
  icon: typeof Users;
}) {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col gap-1 rounded-xl border bg-card p-3 shadow-sm transition-colors",
        tone === "alert" && "border-orange-300/80 bg-orange-50/40 dark:border-orange-800 dark:bg-orange-950/20",
        tone === "ok" && "border-emerald-300/70 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/20",
        href && "hover:border-[var(--flexa-green)]/40 hover:bg-[var(--flexa-green-soft)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none text-foreground">{value}</p>
      {hint}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full min-w-0">
        {body}
      </Link>
    );
  }
  return body;
}

function UnavailableChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-border bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
      {label}
    </span>
  );
}

/**
 * Phase 1 Super Admin Control Center overview.
 * Uses only instrumented APIs; unavailable analytics are labeled — never fabricated.
 */
export default function AdminControlCenterDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const role = user?.role ?? (user?.isSuperAdmin ? "superadmin" : user?.isAdmin ? "admin" : "user");
  const isSuperAdmin = !!(user?.isSuperAdmin || role === "superadmin");
  const isModerator = role === "moderator";
  const canFinance = isSuperAdmin || role === "admin";
  const [rangeDays, setRangeDays] = useState(30);

  const { data: stats, isLoading: statsLoading } = useAdminGetStats();
  const s = stats as Record<string, number | string | null | undefined> | undefined;

  const supportQ = useQuery({
    queryKey: ["admin-support-analytics"],
    queryFn: () => adminGet<SupportAnalytics>("/api/admin/support/analytics"),
    staleTime: 60_000,
    enabled: !isModerator,
  });

  const fraudQ = useQuery({
    queryKey: ["admin-fraud-dashboard"],
    queryFn: () => adminGet<FraudDashboard>("/api/admin/fraud/dashboard"),
    staleTime: 60_000,
    enabled: canFinance,
  });

  const revenueQ = useQuery({
    queryKey: ["admin-platform-revenue-overview"],
    queryFn: () => adminGet<PlatformRevenue>("/api/admin/platform-revenue?period=month"),
    staleTime: 60_000,
    enabled: isSuperAdmin,
  });

  const money = useMemo(() => {
    const rev = revenueQ.data?.summary;
    return {
      total: rev?.totalRevenue,
      commission: rev?.merchantCommission,
      boost: rev?.boostRevenue,
      subs: rev?.subscriptionRevenue,
      gmv: rev?.gmv,
      orders: rev?.orderCount,
    };
  }, [revenueQ.data]);

  const fmtMoney = (n: number | undefined | null) =>
    n == null || Number.isNaN(Number(n)) ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

  const fmtInt = (n: number | string | null | undefined) => {
    if (n == null || n === "") return "—";
    const v = Number(n);
    return Number.isFinite(v) ? v.toLocaleString() : "—";
  };

  if (isModerator) {
    return null;
  }

  return (
    <div className="mb-5 space-y-4" data-testid="admin-control-center-dashboard">
      {/* Hero strip */}
      <div className="overflow-hidden rounded-2xl border border-[var(--flexa-green)]/20 bg-gradient-to-br from-[var(--flexa-green)] via-[var(--flexa-green-deep)] to-[#0a3d2e] p-4 text-white shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">
              {t("adminControl.eyebrow")}
            </p>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("adminControl.title")}</h2>
            <p className="max-w-2xl text-sm text-white/80">{t("adminControl.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="border-0 bg-[var(--flexa-orange)] text-white hover:bg-[var(--flexa-orange)]">
              {t("adminControl.liveBadge")}
            </Badge>
            <Badge variant="outline" className="border-white/30 bg-white/10 text-white">
              {t("adminControl.realDataBadge")}
            </Badge>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" className="bg-white text-[var(--flexa-green-deep)] hover:bg-white/90">
            <Link href="/admin?tab=operations">
              <ClipboardList className="mr-1.5 h-3.5 w-3.5" />
              {t("adminControl.quickOps")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="border-white/35 bg-transparent text-white hover:bg-white/10">
            <Link href="/admin?tab=support">
              <Headphones className="mr-1.5 h-3.5 w-3.5" />
              {t("adminControl.quickSupport")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="border-white/35 bg-transparent text-white hover:bg-white/10">
            <Link href="/admin?tab=moderation">
              <Flag className="mr-1.5 h-3.5 w-3.5" />
              {t("adminControl.quickModeration")}
            </Link>
          </Button>
          {canFinance && (
            <Button asChild size="sm" variant="outline" className="border-white/35 bg-transparent text-white hover:bg-white/10">
              <Link href="/admin?tab=revenue">
                <Banknote className="mr-1.5 h-3.5 w-3.5" />
                {t("adminControl.quickFinance")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Operations + people KPIs from /admin/stats */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-foreground">{t("adminControl.opsHeading")}</h3>
            <p className="text-xs text-muted-foreground">{t("adminControl.opsSub")}</p>
          </div>
          {statsLoading && <span className="text-xs text-muted-foreground">{t("adminAnalytics.loading")}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <MetricCard
            label={t("adminDash.users")}
            value={fmtInt(s?.totalUsers as number | undefined)}
            icon={Users}
            href="/admin?tab=users"
          />
          <MetricCard
            label={t("adminDash.activeListings")}
            value={fmtInt(s?.activeListings as number | undefined)}
            icon={Package}
            href="/admin?tab=listings"
          />
          <MetricCard
            label={t("adminDash.reports")}
            value={fmtInt(s?.pendingReports as number | undefined)}
            icon={Flag}
            href="/admin?tab=reports"
            tone={Number(s?.pendingReports ?? 0) > 0 ? "alert" : "default"}
          />
          <MetricCard
            label={t("adminDash.flagged")}
            value={fmtInt(s?.flaggedUsers as number | undefined)}
            icon={AlertTriangle}
            href="/admin?tab=flagged"
            tone={Number(s?.flaggedUsers ?? 0) > 0 ? "alert" : "default"}
          />
          <MetricCard
            label={t("adminDash.onlineNow")}
            value={fmtInt(s?.onlineUsers as number | undefined)}
            icon={Wifi}
            hint={<span className="text-[10px] text-muted-foreground">{t("adminAnalytics.onlineHint")}</span>}
          />
          <MetricCard
            label={t("adminDash.flexaVip")}
            value={fmtInt(s?.activeSubscriptions as number | undefined)}
            icon={Activity}
            href="/admin/vip-subscriptions"
            tone={Number(s?.graceSubscriptions ?? 0) > 0 ? "alert" : "default"}
            hint={
              Number(s?.graceSubscriptions ?? 0) > 0 ? (
                <span className="text-[10px] text-orange-700 dark:text-orange-300">
                  {t("adminControl.graceSubs", { count: Number(s?.graceSubscriptions ?? 0) })}
                </span>
              ) : undefined
            }
          />
        </div>
      </section>

      {/* Support + risk + revenue (role-gated, real APIs only) */}
      <section className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">{t("adminControl.supportHeading")}</h3>
            <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
              <Link href="/admin?tab=support">{t("adminControl.open")}</Link>
            </Button>
          </div>
          {supportQ.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("adminAnalytics.loading")}</p>
          ) : supportQ.data ? (
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label={t("adminControl.openTickets")} value={fmtInt(supportQ.data.open)} icon={Headphones} tone={Number(supportQ.data.open ?? 0) > 0 ? "alert" : "ok"} />
              <MetricCard label={t("adminControl.closedToday")} value={fmtInt(supportQ.data.closedToday)} icon={ClipboardList} />
              <MetricCard label={t("adminControl.totalTickets")} value={fmtInt(supportQ.data.total)} icon={ClipboardList} />
              <MetricCard
                label={t("adminControl.avgResponse")}
                value={
                  supportQ.data.avgResponseMin == null
                    ? "—"
                    : `${Math.round(supportQ.data.avgResponseMin)}m`
                }
                icon={Activity}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("adminControl.supportUnavailable")}</p>
          )}
        </div>

        <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">{t("adminControl.riskHeading")}</h3>
            {canFinance && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link href="/admin/fraud">{t("adminControl.open")}</Link>
              </Button>
            )}
          </div>
          {!canFinance ? (
            <p className="text-xs text-muted-foreground">{t("adminControl.restricted")}</p>
          ) : fraudQ.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("adminAnalytics.loading")}</p>
          ) : fraudQ.data?.stats ? (
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label={t("adminControl.openAlerts")} value={fmtInt(fraudQ.data.stats.open_alerts)} icon={ShieldAlert} tone={Number(fraudQ.data.stats.open_alerts ?? 0) > 0 ? "alert" : "ok"} />
              <MetricCard label={t("adminControl.criticalAlerts")} value={fmtInt(fraudQ.data.stats.critical_alerts)} icon={AlertTriangle} tone={Number(fraudQ.data.stats.critical_alerts ?? 0) > 0 ? "alert" : "default"} />
              <MetricCard label={t("adminControl.highAlerts")} value={fmtInt(fraudQ.data.stats.high_alerts)} icon={Flag} />
              <MetricCard label={t("adminControl.events24h")} value={fmtInt(fraudQ.data.stats.events_24h)} icon={Activity} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("adminControl.fraudUnavailable")}</p>
          )}
        </div>

        <div className="space-y-2 rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold">{t("adminControl.financeHeading")}</h3>
            {isSuperAdmin && (
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link href="/admin?tab=revenue">{t("adminControl.open")}</Link>
              </Button>
            )}
          </div>
          {!isSuperAdmin ? (
            <p className="text-xs text-muted-foreground">{t("adminControl.superAdminOnly")}</p>
          ) : revenueQ.isLoading ? (
            <p className="text-xs text-muted-foreground">{t("adminAnalytics.loading")}</p>
          ) : revenueQ.data?.summary ? (
            <div className="grid grid-cols-2 gap-2">
              <MetricCard label={t("adminControl.platformRevenue")} value={fmtMoney(money.total)} icon={Banknote} tone="ok" />
              <MetricCard label={t("adminControl.commissions")} value={fmtMoney(money.commission)} icon={Banknote} />
              <MetricCard label={t("adminControl.boostRevenue")} value={fmtMoney(money.boost)} icon={Activity} />
              <MetricCard label={t("adminControl.gmvMonth")} value={fmtMoney(money.gmv)} icon={Package} />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("adminControl.financeUnavailable")}</p>
          )}
        </div>
      </section>

      {/* Traffic — reuse real instrumented component with range + export */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {[7, 14, 30, 90].map((d) => (
              <Button
                key={d}
                type="button"
                size="sm"
                variant={rangeDays === d ? "default" : "outline"}
                className={cn(
                  "h-7 px-2.5 text-xs",
                  rangeDays === d && "bg-[var(--flexa-green)] hover:bg-[var(--flexa-green-deep)]",
                )}
                onClick={() => setRangeDays(d)}
                data-testid={`admin-traffic-range-${d}`}
              >
                {t("adminControl.days", { count: d })}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 text-xs"
            data-testid="admin-traffic-export"
            onClick={async () => {
              const token = localStorage.getItem("flexamarket_token");
              const res = await fetch(`/api/admin/analytics/traffic?days=${rangeDays}`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              if (!res.ok) return;
              const data = await res.json();
              const rows: { date: string; visits: number }[] = data?.series ?? [];
              const csv = ["date,unique_visitors", ...rows.map((r) => `${r.date},${r.visits}`)].join("\n");
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `flexa-traffic-${rangeDays}d.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            {t("adminControl.exportCsv")}
          </Button>
        </div>
        <AdminAnalyticsDashboard rangeDays={rangeDays} />
      </div>

      {/* Explicitly unavailable advanced analytics — never fake */}
      <section className="rounded-xl border border-dashed border-border bg-muted/20 p-3">
        <h3 className="text-sm font-bold text-foreground">{t("adminControl.unavailableHeading")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{t("adminControl.unavailableSub")}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <UnavailableChip label={t("adminControl.missing.sources")} />
          <UnavailableChip label={t("adminControl.missing.devices")} />
          <UnavailableChip label={t("adminControl.missing.countries")} />
          <UnavailableChip label={t("adminControl.missing.funnels")} />
          <UnavailableChip label={t("adminControl.missing.abandonedCarts")} />
          <UnavailableChip label={t("adminControl.missing.pagePaths")} />
          <UnavailableChip label={t("adminControl.missing.systemHealthDo")} />
          <UnavailableChip label={t("adminControl.missing.wasabi")} />
        </div>
      </section>
    </div>
  );
}
