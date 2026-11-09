import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowUpRight,
  Banknote,
  BellRing,
  ChevronRight,
  CreditCard,
  Film,
  Headphones,
  Package,
  RotateCcw,
  Send,
  Shield,
  ShoppingBag,
  Truck,
  Users,
  Wifi,
} from "lucide-react";
import { useAdminGetStats } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useAdminCountry } from "@/contexts/admin-country";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { MobileSelect } from "@/components/ui/mobile-select";

type TrafficResponse = {
  summary: {
    visitsToday: number;
    visitsYesterday: number;
    visitsThisWeek: number;
    visitsLastWeek: number;
    visitsThisMonth: number;
    visitsLastMonth: number;
    visitsAllTime: number;
    onlineUsers: number;
    activeSessions?: number;
    activeNow?: number;
    rangeUniqueVisitors?: number;
    rangeSessions?: number;
    rangePageViews?: number;
    rangeProductViews?: number;
    guestVisitors?: number;
    registeredVisitors?: number;
  };
  series: { date: string; visits: number; sessions?: number; pageViews?: number }[];
  countries?: { country: string; visitors: number }[];
  devices?: { device: string; visitors: number }[];
  sources?: { source: string; visitors: number }[];
  note?: string;
};

type PlatformRevenue = {
  summary?: {
    totalRevenue?: number;
    orderCount?: number;
    gmv?: number;
  };
};

type PeriodKey = "today" | "7d" | "30d" | "year";

async function adminGet<T>(path: string): Promise<T | null> {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(path, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

function fmtInt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return Number(n).toLocaleString();
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function KpiTile({
  label,
  value,
  delta,
  tone,
  icon: Icon,
}: {
  label: string;
  value: string;
  delta?: number | null;
  tone: "green" | "blue" | "orange" | "purple";
  icon: typeof Users;
}) {
  const tones = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-50",
    blue: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-50",
    orange: "border-orange-200 bg-orange-50 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-50",
    purple: "border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900/50 dark:bg-violet-950/30 dark:text-violet-50",
  };
  const iconTone = {
    green: "bg-emerald-600 text-white",
    blue: "bg-sky-600 text-white",
    orange: "bg-orange-500 text-white",
    purple: "bg-violet-600 text-white",
  };
  return (
    <div className={cn("rounded-2xl border p-3 shadow-sm", tones[tone])} data-testid={`admin-kpi-${label}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
          <p className="mt-1 text-2xl font-black tabular-nums leading-none">{value}</p>
          {delta != null && (
            <p className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
              <ArrowUpRight className="h-3 w-3" />
              {delta >= 0 ? "+" : ""}{delta}%
            </p>
          )}
        </div>
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", iconTone[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

function ModuleCard({
  href,
  title,
  desc,
  icon: Icon,
  color,
}: {
  href: string;
  title: string;
  desc: string;
  icon: typeof Users;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition-colors hover:border-[hsl(152,65%,18%)]/40 hover:bg-muted/40"
      data-testid={`admin-module-${href.replace(/\W+/g, "-")}`}
    >
      <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white", color)}>
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{desc}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * Flexa Control — Super Admin Command Center (2026 enterprise redesign).
 * Real visitor analytics (guests + registered); never fabricates missing dimensions.
 */
export default function AdminControlCenterDashboard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const {
    selectedCountry,
    setSelectedCountry,
    canSelectAll,
    pickerCountries,
    isSuperAdmin: countryIsSA,
    effectiveCountry,
  } = useAdminCountry();
  const role = user?.role ?? (user?.isSuperAdmin ? "superadmin" : user?.isAdmin ? "admin" : "user");
  const isSuperAdmin = !!(user?.isSuperAdmin || role === "superadmin" || countryIsSA);
  const isModerator = role === "moderator";
  const [period, setPeriod] = useState<PeriodKey>("today");

  const periodDays = period === "today" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 365;

  const { data: stats } = useAdminGetStats();
  const s = stats as Record<string, number | string | null | undefined> | undefined;

  const trafficQ = useQuery({
    queryKey: ["admin-control-traffic", period],
    queryFn: () => adminGet<TrafficResponse>(`/api/admin/analytics/traffic?period=${period}&days=${periodDays}`),
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !isModerator,
  });

  const revenueQ = useQuery({
    queryKey: ["admin-control-revenue", period],
    queryFn: () => adminGet<PlatformRevenue>(
      `/api/admin/platform-revenue?period=${period === "today" ? "today" : period === "7d" ? "week" : period === "year" ? "all" : "month"}`,
    ),
    staleTime: 60_000,
    enabled: isSuperAdmin,
  });

  const traffic = trafficQ.data?.summary;
  const visitors = period === "today"
    ? traffic?.visitsToday ?? 0
    : period === "7d"
      ? traffic?.visitsThisWeek ?? traffic?.rangeUniqueVisitors ?? 0
      : period === "30d"
        ? traffic?.visitsThisMonth ?? traffic?.rangeUniqueVisitors ?? 0
        : traffic?.visitsAllTime ?? traffic?.rangeUniqueVisitors ?? 0;

  const visitorsPrev = period === "today"
    ? traffic?.visitsYesterday ?? 0
    : period === "7d"
      ? traffic?.visitsLastWeek ?? 0
      : traffic?.visitsLastMonth ?? 0;

  const guests = traffic?.guestVisitors ?? 0;
  const registered = traffic?.registeredVisitors ?? 0;
  const guestRegTotal = Math.max(guests + registered, 1);
  const guestPct = Math.round((guests / guestRegTotal) * 100);
  const regPct = Math.max(0, 100 - guestPct);

  const chartData = useMemo(() => {
    const series = trafficQ.data?.series ?? [];
    return series.map((row) => ({
      ...row,
      label: period === "today"
        ? row.date.slice(5)
        : row.date.slice(5),
    }));
  }, [trafficQ.data?.series, period]);

  const countries = trafficQ.data?.countries ?? [];
  const countryTotal = Math.max(countries.reduce((a, c) => a + Number(c.visitors || 0), 0), 1);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  if (isModerator) return null;

  return (
    <div className="mb-20 space-y-4 lg:mb-5" data-testid="admin-control-center-dashboard">
      {/* Context bar — role · country · date */}
      <div
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-sm shadow-sm"
        data-testid="admin-control-context-bar"
      >
        <Badge className="border-0 bg-[hsl(152,65%,18%)] text-white hover:bg-[hsl(152,65%,18%)]">
          {isSuperAdmin
            ? t("adminNav.roleSuper", { defaultValue: "Super Admin" })
            : t("adminNav.roleStaff", { defaultValue: "Admin" })}
        </Badge>
        {canSelectAll ? (
          <div className="min-w-[160px] flex-1 sm:flex-none">
            <MobileSelect
              value={selectedCountry ?? "all"}
              onValueChange={(v) => setSelectedCountry(v === "all" ? null : v)}
              placeholder={`🌍 ${t("home.allCountriesDesc", "All Countries")}`}
              options={[
                { value: "all", label: `🌍 ${t("home.allCountriesDesc", "All Countries")}` },
                ...pickerCountries.map((c) => ({
                  value: c,
                  label: `${COUNTRY_FLAGS[c] ?? ""} ${c}`,
                })),
              ]}
              className="h-8 w-full text-xs"
              data-testid="admin-control-country-select"
            />
          </div>
        ) : effectiveCountry ? (
          <span className="text-xs font-semibold text-muted-foreground">
            {COUNTRY_FLAGS[effectiveCountry] ?? ""} {effectiveCountry}
          </span>
        ) : null}
        <span className="ml-auto text-xs font-medium text-muted-foreground tabular-nums">
          {todayLabel}
        </span>
      </div>

      {/* Title */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            {t("adminControl.title", { defaultValue: "Command Center" })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("adminControl.subtitle", { defaultValue: "Real-time overview of Flexa Market" })}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wide">
          {t("adminControl.realDataBadge", { defaultValue: "LIVE DATA" })}
        </Badge>
      </div>

      {/* Time filters */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none" data-testid="admin-period-tabs">
        {([
          ["today", t("adminControl.periodToday", { defaultValue: "Today" })],
          ["7d", t("adminControl.period7d", { defaultValue: "7 Days" })],
          ["30d", t("adminControl.period30d", { defaultValue: "30 Days" })],
          ["year", t("adminControl.periodYear", { defaultValue: "Year" })],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPeriod(id)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
              period === id
                ? "bg-[hsl(152,65%,18%)] text-white"
                : "border border-border bg-card text-foreground hover:bg-muted/60",
            )}
            data-testid={`admin-period-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiTile
          label={t("adminControl.visitors", { defaultValue: "Visitors" })}
          value={fmtInt(visitors)}
          delta={pctDelta(Number(visitors), Number(visitorsPrev))}
          tone="green"
          icon={Users}
        />
        <KpiTile
          label={t("adminControl.activeNow", { defaultValue: "Active Now" })}
          value={fmtInt(traffic?.activeNow ?? traffic?.activeSessions ?? traffic?.onlineUsers ?? s?.onlineUsers as number)}
          tone="blue"
          icon={Wifi}
        />
        <KpiTile
          label={t("adminControl.orders", { defaultValue: "Orders" })}
          value={fmtInt(revenueQ.data?.summary?.orderCount)}
          tone="orange"
          icon={ShoppingBag}
        />
        <KpiTile
          label={t("adminControl.revenue", { defaultValue: "Revenue" })}
          value={isSuperAdmin ? fmtMoney(revenueQ.data?.summary?.totalRevenue) : "—"}
          tone="purple"
          icon={Banknote}
        />
      </div>

      {/* Visitors overview chart */}
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4" data-testid="admin-visitors-chart">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black text-foreground">
              {t("adminControl.visitorsOverview", { defaultValue: "Visitors Overview" })}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {t("adminControl.uniqueHint", {
                defaultValue: "Unique visitors (guests + registered). Refreshes are not new uniques.",
              })}
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">{period === "today" ? "Today" : period}</Badge>
        </div>
        <div className="h-44 w-full min-w-0">
          {trafficQ.isLoading ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="flexaVisitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(152,65%,28%)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(152,65%,28%)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis width={28} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }}
                  formatter={(v: number) => [v.toLocaleString(), "Unique visitors"]}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="hsl(152,65%,22%)"
                  strokeWidth={2}
                  fill="url(#flexaVisitFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
          <StatPill label="Sessions" value={fmtInt(traffic?.rangeSessions)} />
          <StatPill label="Page views" value={fmtInt(traffic?.rangePageViews)} />
          <StatPill label="Product views" value={fmtInt(traffic?.rangeProductViews)} />
          <StatPill label="Online users" value={fmtInt(traffic?.onlineUsers)} />
        </div>
      </section>

      {/* Traffic breakdown */}
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4" data-testid="admin-traffic-breakdown">
        <h3 className="mb-3 text-sm font-black">
          {t("adminControl.trafficBreakdown", { defaultValue: "Traffic Breakdown" })}
        </h3>
        <BreakdownRow
          label={t("adminControl.guests", { defaultValue: "Guests" })}
          count={guests}
          pct={guestPct}
          barClass="bg-emerald-300"
        />
        <BreakdownRow
          label={t("adminControl.registered", { defaultValue: "Registered" })}
          count={registered}
          pct={regPct}
          barClass="bg-[hsl(152,65%,22%)]"
          className="mt-3"
        />
      </section>

      {/* Top countries */}
      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4" data-testid="admin-top-countries">
        <h3 className="mb-3 text-sm font-black">
          {t("adminControl.topCountries", { defaultValue: "Top Countries (Visitors)" })}
        </h3>
        {countries.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("adminControl.noCountryData", {
              defaultValue: "Country distribution appears as visitor beacons collect CF/geo signals.",
            })}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {countries.slice(0, 5).map((c) => {
              const pct = Math.round((Number(c.visitors) / countryTotal) * 1000) / 10;
              return (
                <li key={c.country} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-base">{COUNTRY_FLAGS[c.country] ?? "🌍"}</span>
                  <span className="min-w-0 flex-1 font-semibold">{c.country}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{fmtInt(c.visitors)}</span>
                  <span className="w-12 text-right text-xs font-bold tabular-nums">{pct}%</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Push CTA */}
      <Link
        href="/admin/push-notifications"
        className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm transition-colors hover:bg-emerald-100 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-50"
        data-testid="admin-push-cta"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(152,65%,22%)] text-white">
          <Send className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black">
            {t("adminControl.sendPush", { defaultValue: "Send Push Notification" })}
          </span>
          <span className="block text-[11px] opacity-80">
            {t("adminControl.sendPushSub", { defaultValue: "Target by country, region or all users." })}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0" />
      </Link>

      {/* Module grid */}
      <section className="space-y-2" data-testid="admin-module-grid">
        <h3 className="text-sm font-black">
          {t("adminControl.modules", { defaultValue: "Modules" })}
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ModuleCard href="/admin/push-notifications" title="Push Notifications" desc="Campaigns & alerts" icon={BellRing} color="bg-emerald-600" />
          <ModuleCard href="/admin/stripe-transactions" title="Stripe Payments" desc="Charges & payouts" icon={CreditCard} color="bg-slate-800" />
          <ModuleCard href="/admin?tab=payments" title="Refunds & Disputes" desc="Payment recovery" icon={RotateCcw} color="bg-violet-600" />
          <ModuleCard href="/videos" title="Promotional Videos" desc="Discover & analytics" icon={Film} color="bg-pink-600" />
          <ModuleCard href="/admin/deliveries" title="Deliveries" desc="Drivers & tracking" icon={Truck} color="bg-orange-500" />
          <ModuleCard href="/admin/support" title="Support & Tickets" desc="Live help desk" icon={Headphones} color="bg-sky-500" />
          <ModuleCard href="/admin/users" title="Users" desc="Accounts & roles" icon={Users} color="bg-teal-600" />
          <ModuleCard href="/admin/team" title="Admin Team" desc="Staff & scopes" icon={Shield} color="bg-indigo-500" />
          <ModuleCard href="/admin/listings" title="Listings" desc="Catalog moderation" icon={Package} color="bg-[hsl(152,65%,28%)]" />
          <ModuleCard href="/admin/operations" title="Operations" desc="Queue & appeals" icon={ShoppingBag} color="bg-amber-600" />
        </div>
      </section>

      {trafficQ.data?.note && (
        <p className="text-[10px] leading-relaxed text-muted-foreground" data-testid="admin-analytics-note">
          {trafficQ.data.note}
        </p>
      )}
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-muted/30 px-2.5 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function BreakdownRow({
  label,
  count,
  pct,
  barClass,
  className,
}: {
  label: string;
  count: number;
  pct: number;
  barClass: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {fmtInt(count)} <span className="font-bold text-foreground">({pct}%)</span>
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all", barClass)} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
    </div>
  );
}
