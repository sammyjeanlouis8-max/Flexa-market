import { useMemo, type ReactNode } from "react";
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
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  Minus,
  Users,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  };
  series: { date: string; visits: number }[];
  note?: string;
};

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function ChangeBadge({ current, previous, label }: { current: number; previous: number; label: string }) {
  const pct = pctChange(current, previous);
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
        <Minus className="h-3 w-3" /> {label}
      </span>
    );
  }
  const up = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-semibold",
        up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {Math.abs(pct)}% {label}
    </span>
  );
}

function Kpi({
  title,
  value,
  hint,
  icon: Icon,
  compare,
}: {
  title: string;
  value: number;
  hint?: ReactNode;
  icon: typeof Users;
  compare?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border border-border bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold tabular-nums leading-none text-foreground">{value.toLocaleString()}</p>
      {compare}
      {hint}
    </div>
  );
}

async function fetchTraffic(rangeDays: number): Promise<TrafficResponse> {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(`/api/admin/analytics/traffic?days=${rangeDays}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Failed to load traffic analytics");
  }
  return res.json();
}

/**
 * Real traffic analytics for the enterprise admin dashboard.
 * Values come from site_daily_visits — never fabricated.
 */
export default function AdminAnalyticsDashboard({
  rangeDays = 30,
}: {
  rangeDays?: number;
}) {
  const { t } = useTranslation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-traffic", rangeDays],
    queryFn: () => fetchTraffic(rangeDays),
    staleTime: 60_000,
  });

  const chartData = useMemo(() => {
    return (data?.series ?? []).map((row) => ({
      ...row,
      label: row.date.slice(5), // MM-DD
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="mb-4 border border-border bg-background p-6 text-sm text-muted-foreground">
        {t("adminAnalytics.loading")}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mb-4 border border-amber-300 bg-amber-50/50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-200">
        {t("adminAnalytics.loadError")}
        {error instanceof Error ? ` — ${error.message}` : ""}
      </div>
    );
  }

  const s = data.summary;

  return (
    <section className="mb-4 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-bold tracking-tight text-foreground">{t("adminAnalytics.title")}</h2>
          <p className="text-xs text-muted-foreground">{t("adminAnalytics.subtitle")}</p>
        </div>
        <p className="text-[10px] text-muted-foreground">{t("adminAnalytics.realDataOnly")}</p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          title={t("adminAnalytics.today")}
          value={s.visitsToday}
          icon={Eye}
          compare={<ChangeBadge current={s.visitsToday} previous={s.visitsYesterday} label={t("adminAnalytics.vsYesterday")} />}
        />
        <Kpi title={t("adminAnalytics.yesterday")} value={s.visitsYesterday} icon={Eye} />
        <Kpi
          title={t("adminAnalytics.thisWeek")}
          value={s.visitsThisWeek}
          icon={Users}
          compare={<ChangeBadge current={s.visitsThisWeek} previous={s.visitsLastWeek} label={t("adminAnalytics.vsLastWeek")} />}
        />
        <Kpi
          title={t("adminAnalytics.thisMonth")}
          value={s.visitsThisMonth}
          icon={Users}
          compare={<ChangeBadge current={s.visitsThisMonth} previous={s.visitsLastMonth} label={t("adminAnalytics.vsLastMonth")} />}
        />
        <Kpi title={t("adminAnalytics.allTime")} value={s.visitsAllTime} icon={Users} />
        <Kpi
          title={t("adminAnalytics.onlineNow")}
          value={s.onlineUsers}
          icon={Wifi}
          hint={<span className="text-[10px] text-muted-foreground">{t("adminAnalytics.onlineHint")}</span>}
        />
      </div>

      <div className="border border-border bg-background p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-foreground">{t("adminAnalytics.chartTitle", { days: rangeDays })}</p>
          <p className="text-[10px] text-muted-foreground">{t("adminAnalytics.uniquePerDay")}</p>
        </div>
        <div className="h-56 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("adminAnalytics.noSeriesYet")}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="visitFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={32} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 0, border: "1px solid hsl(var(--border))" }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                  formatter={(value: number) => [value.toLocaleString(), t("adminAnalytics.visitors")]}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="hsl(var(--primary))"
                  fill="url(#visitFill)"
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {(data.note || true) && (
        <p className="text-[10px] text-muted-foreground">
          {t("adminAnalytics.missingDims")}
        </p>
      )}
    </section>
  );
}
