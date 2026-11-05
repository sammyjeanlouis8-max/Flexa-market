import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle, BarChart3, Calendar, CalendarDays, CalendarRange, ChevronLeft,
  ChevronRight, Crown, FileBarChart, Lock, Package, RefreshCw, ShoppingCart,
  Store, Trophy, Truck, CheckCircle2,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useGetSellerSalesReport, GetSellerSalesReportReport } from "@workspace/api-client-react";
import type { GetSellerSalesReportParams } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { ReportControls, type Filters } from "@/components/sales-report/ReportControls";
import { SummaryGrid } from "@/components/sales-report/SummaryGrid";
import { SalesRows } from "@/components/sales-report/SalesRows";
import { browserTimeZone, currentMonthIn, formatDate, monthLabel } from "@/lib/sales-report-format";
import { cn } from "@/lib/utils";

const LIMIT = 20;
const POLL_MS = 60_000;
const MAX_POLLS = 10;

type DashPeriod = "overview" | "day" | "week" | "month" | "year";

type MoneyCard = { amount: number; orders: number; changePct: number | null };
type DashboardPayload = {
  period: DashPeriod;
  timezone: string;
  currency: string;
  asOf: string;
  cards: {
    total: MoneyCard;
    today: MoneyCard;
    week: MoneyCard;
    month: MoneyCard;
    year: MoneyCard;
  };
  series: { key: string; label: string; amount: number; orders: number }[];
  topProducts: { listingId: number; title: string; image: string | null; units: number; revenue: number }[];
  recentSales: {
    id: number; listingId: number | null; title: string | null; image: string | null;
    amount: number; currency: string; orderStatus: string; paymentStatus: string; createdAt: string;
    buyerName: string | null;
  }[];
};

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" role="status" aria-live="polite" data-testid="report-loading">
      <span className="sr-only">{t("salesReport.loading")}</span>
      <div className="h-36 rounded-2xl bg-muted animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
      </div>
      <div className="h-56 rounded-2xl bg-muted animate-pulse" />
    </div>
  );
}

function money(amount: number, currency: string, locale: string) {
  try {
    return new Intl.NumberFormat(locale.startsWith("ht") ? "fr-HT" : locale, {
      style: "currency", currency, maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function ChangePill({ pct }: { pct: number | null }) {
  if (pct == null) return null;
  const up = pct >= 0;
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold",
      up ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
    )}>
      {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (["delivered", "completed", "paid"].includes(s)) return "bg-emerald-100 text-emerald-800";
  if (["shipped", "processing", "confirmed", "ready_to_ship", "in_transit"].includes(s)) return "bg-amber-100 text-amber-800";
  if (["cancelled", "canceled", "failed", "refunded", "return_refunded"].includes(s)) return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

export default function Sales() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const tz = useMemo(() => browserTimeZone(), []);
  const currentMonth = useMemo(() => currentMonthIn(tz), [tz]);

  const [period, setPeriod] = useState<DashPeriod>("overview");
  const [showDetail, setShowDetail] = useState(false);
  const [filters, setFilters] = useState<Filters>({ month: currentMonth, currency: "", orderStatus: "", paymentStatus: "", payoutStatus: "" });
  const [page, setPage] = useState(1);
  const userId = user?.id ?? null;

  useEffect(() => {
    setFilters({ month: currentMonth, currency: "", orderStatus: "", paymentStatus: "", payoutStatus: "" });
    setPage(1);
  }, [userId, currentMonth]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/auth/login");
  }, [authLoading, user, setLocation]);

  const dashQ = useQuery({
    queryKey: ["sellerSalesDashboard", userId, period, tz],
    enabled: !!token && userId != null,
    staleTime: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<DashboardPayload> => {
      const qs = new URLSearchParams({ period, timezone: tz });
      const r = await fetch(`/api/sales/dashboard?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const err = new Error("dashboard_failed") as Error & { status?: number };
        err.status = r.status;
        throw err;
      }
      return r.json();
    },
  });

  const params: GetSellerSalesReportParams = {
    report: GetSellerSalesReportReport.monthly,
    month: filters.month,
    timezone: tz,
    page,
    limit: LIMIT,
    ...(filters.currency ? { currency: filters.currency } : {}),
    ...(filters.orderStatus ? { orderStatus: filters.orderStatus } : {}),
    ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
    ...(filters.payoutStatus ? { payoutStatus: filters.payoutStatus } : {}),
  };

  const pollsUntilRef = useRef(Date.now() + MAX_POLLS * POLL_MS);
  const keyStr = JSON.stringify([userId, params]);
  useEffect(() => { pollsUntilRef.current = Date.now() + MAX_POLLS * POLL_MS; }, [keyStr]);

  const q = useGetSellerSalesReport(params, {
    query: {
      queryKey: ["sellerSalesReport", userId, params],
      enabled: !!token && userId != null && showDetail,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchInterval: () => (Date.now() < pollsUntilRef.current ? POLL_MS : false),
    },
    request: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });

  const data = q.data;
  const months = useMemo(() => {
    const set = new Set<string>([currentMonth, filters.month, ...(data?.filters.availableMonths ?? [])]);
    return Array.from(set).sort().reverse();
  }, [data, currentMonth, filters.month]);
  const monthLabels = useMemo(() => Object.fromEntries(months.map(m => [m, monthLabel(m, locale)])), [months, locale]);

  const hasFilters = !!(filters.currency || filters.orderStatus || filters.paymentStatus || filters.payoutStatus);
  const change = (patch: Partial<Filters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); };
  const clear = () => change({ currency: "", orderStatus: "", paymentStatus: "", payoutStatus: "" });
  const dashStatus = (dashQ.error as { status?: number } | null)?.status;
  const authError = dashStatus === 401 || dashStatus === 403;

  if (authLoading && !user) return <div className="max-w-6xl mx-auto px-4 py-6"><Skeleton /></div>;
  if (!user) return null;

  const currencies = Array.from(new Set([...(data?.filters.availableCurrencies ?? []), ...(filters.currency ? [filters.currency] : [])]));
  const pg = data?.pagination;
  const isEmpty = !!data && data.sales.length === 0;
  const dash = dashQ.data;
  const currency = dash?.currency ?? "USD";

  const periodTabs: { id: DashPeriod; label: string; Icon: typeof BarChart3 }[] = [
    { id: "overview", label: t("salesDashboard.tabOverview"), Icon: BarChart3 },
    { id: "day", label: t("salesDashboard.tabDay"), Icon: Calendar },
    { id: "week", label: t("salesDashboard.tabWeek"), Icon: CalendarDays },
    { id: "month", label: t("salesDashboard.tabMonth"), Icon: CalendarRange },
    { id: "year", label: t("salesDashboard.tabYear"), Icon: Crown },
  ];

  const secondaryCards = dash ? [
    { key: "today", label: t("salesDashboard.today"), card: dash.cards.today, tone: "bg-emerald-50 border-emerald-100", icon: Calendar, iconCls: "text-emerald-700" },
    { key: "week", label: t("salesDashboard.thisWeek"), card: dash.cards.week, tone: "bg-sky-50 border-sky-100", icon: CalendarDays, iconCls: "text-sky-700" },
    { key: "month", label: t("salesDashboard.thisMonth"), card: dash.cards.month, tone: "bg-violet-50 border-violet-100", icon: CalendarRange, iconCls: "text-violet-700" },
    { key: "year", label: t("salesDashboard.thisYear"), card: dash.cards.year, tone: "bg-amber-50 border-amber-100", icon: Crown, iconCls: "text-amber-700" },
  ] as const : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-4 lg:px-6 py-4 sm:py-5 space-y-4 pb-24">
      {/* Header */}
      <div>
        <button type="button" onClick={() => history.back()} data-testid="button-back"
          className="inline-flex items-center h-10 -ml-2 px-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 mr-1" aria-hidden /> {t("salesReport.back")}
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <BarChart3 className="h-5 w-5 text-emerald-700" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground">{t("salesDashboard.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("salesDashboard.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => void dashQ.refetch()}
              disabled={dashQ.isFetching}
              className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-emerald-100 bg-white text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
              aria-label={t("salesReport.refresh")}
            >
              <RefreshCw className={cn("h-4 w-4", dashQ.isFetching && "animate-spin")} />
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-900">
              <Store className="h-3.5 w-3.5" /> {t("salesDashboard.myShop")}
            </span>
          </div>
        </div>
      </div>

      {/* Period tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label={t("salesDashboard.periods")}>
        {periodTabs.map(({ id, label, Icon }) => {
          const active = period === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setPeriod(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap border transition-colors",
                active
                  ? "bg-emerald-800 text-white border-emerald-800 shadow-sm"
                  : "bg-white text-foreground border-border hover:bg-emerald-50"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      {dashQ.isError && authError && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center" role="alert" data-testid="report-auth">
          <Lock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="font-black text-foreground">{t("salesReport.authTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("salesReport.authDesc")}</p>
          <Link href="/auth/login" className="inline-flex items-center justify-center h-11 px-5 mt-4 rounded-lg bg-foreground text-background text-sm font-bold">{t("salesReport.signIn")}</Link>
        </div>
      )}

      {dashQ.isError && !authError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center" role="alert">
          <AlertCircle className="h-8 w-8 mx-auto mb-3 text-destructive" aria-hidden />
          <p className="font-black text-foreground">{t("salesReport.errorTitle")}</p>
          <button type="button" onClick={() => void dashQ.refetch()} className="h-11 px-5 mt-4 rounded-lg bg-foreground text-background text-sm font-bold">{t("salesReport.retry")}</button>
        </div>
      )}

      {dashQ.isLoading && <Skeleton />}

      {dash && !dashQ.isError && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
            <article className="relative overflow-hidden rounded-2xl lg:col-span-1 p-4 text-white shadow-md"
              style={{ background: "linear-gradient(145deg,#064e3b 0%,#047857 55%,#059669 100%)" }}>
              <div className="absolute right-0 top-0 opacity-20 pointer-events-none" aria-hidden>
                <ShoppingCart className="h-28 w-28 -mr-6 -mt-4" />
              </div>
              <div className="relative space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-emerald-100">{t("salesDashboard.totalSales")}</p>
                  <ChangePill pct={dash.cards.total.changePct} />
                </div>
                <p className="text-2xl font-black tracking-tight">{money(dash.cards.total.amount, currency, locale)}</p>
                <p className="text-xs text-emerald-100/90">{t("salesDashboard.ordersCount", { count: dash.cards.total.orders })}</p>
              </div>
            </article>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:col-span-4 gap-2 sm:gap-3">
              {secondaryCards.map(({ key, label, card, tone, icon: Icon, iconCls }) => (
                <article key={key} className={cn("rounded-2xl border p-3 shadow-sm", tone)}>
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={cn("h-4 w-4", iconCls)} />
                    <ChangePill pct={card.changePct} />
                  </div>
                  <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
                  <p className="text-base sm:text-lg font-black text-foreground mt-0.5">{money(card.amount, currency, locale)}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t("salesDashboard.ordersCount", { count: card.orders })}</p>
                </article>
              ))}
            </div>
          </div>

          {/* Chart + Top products */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            <section className="lg:col-span-3 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-black text-foreground inline-flex items-center gap-1.5">
                  <BarChart3 className="h-4 w-4 text-emerald-700" /> {t("salesDashboard.chartTitle")}
                </h2>
                <span className="text-[11px] font-semibold text-muted-foreground rounded-full border border-border px-2 py-1">
                  {periodTabs.find(p => p.id === period)?.label}
                </span>
              </div>
              {dash.series.length === 0 || dash.series.every(p => p.amount === 0) ? (
                <div className="h-52 flex flex-col items-center justify-center text-muted-foreground gap-2">
                  <FileBarChart className="h-8 w-8 opacity-40" />
                  <p className="text-xs">{t("salesDashboard.chartEmpty")}</p>
                </div>
              ) : (
                <div className="h-52 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dash.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#059669" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip
                        formatter={(value: number) => [money(Number(value) || 0, currency, locale), t("salesDashboard.totalSales")]}
                        contentStyle={{ borderRadius: 12, borderColor: "#d1fae5", fontSize: 12 }}
                      />
                      <Area type="monotone" dataKey="amount" stroke="#047857" strokeWidth={2.5} fill="url(#salesFill)"
                        dot={{ r: 3, fill: "#fff", stroke: "#047857", strokeWidth: 2 }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            <section className="lg:col-span-2 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-black text-foreground inline-flex items-center gap-1.5">
                  <Trophy className="h-4 w-4 text-amber-600" /> {t("salesDashboard.topProducts")}
                </h2>
                <Link href="/sell" className="text-[11px] font-bold text-emerald-700 hover:underline">
                  {t("salesDashboard.viewAll")} →
                </Link>
              </div>
              {dash.topProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">{t("salesDashboard.topEmpty")}</p>
              ) : (
                <ul className="space-y-2.5">
                  {dash.topProducts.map((p, i) => (
                    <li key={p.listingId}>
                      <Link href={`/listings/${p.listingId}`} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-emerald-50/80 transition-colors">
                        {p.image ? (
                          <img src={p.image} alt="" className="h-11 w-11 rounded-lg object-cover border border-border shrink-0" loading="lazy" />
                        ) : (
                          <div className="h-11 w-11 rounded-lg bg-muted flex items-center justify-center shrink-0"><Package className="h-4 w-4 text-muted-foreground" /></div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-foreground truncate">{i + 1}. {p.title}</p>
                          <p className="text-[11px] text-muted-foreground">{t("salesDashboard.unitsSold", { count: p.units })}</p>
                        </div>
                        <p className="text-xs font-black text-emerald-700 shrink-0">{money(p.revenue, currency, locale)}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* Recent sales */}
          <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-foreground inline-flex items-center gap-1.5">
                <FileBarChart className="h-4 w-4 text-emerald-700" /> {t("salesDashboard.recentSales")}
              </h2>
              <button type="button" onClick={() => setShowDetail(true)} className="text-[11px] font-bold text-emerald-700 hover:underline">
                {t("salesDashboard.viewAll")} →
              </button>
            </div>

            {dash.recentSales.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">{t("salesDashboard.recentEmpty")}</p>
            ) : (
              <>
                {/* Mobile cards */}
                <ul className="space-y-2 md:hidden">
                  {dash.recentSales.map(sale => (
                    <li key={sale.id}>
                      <Link href={`/orders/${sale.id}`} className="block rounded-xl border border-border p-3 hover:bg-emerald-50/50 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-foreground">FM-{sale.id}</p>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{sale.title ?? t("salesDashboard.product")}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">{formatDate(sale.createdAt, tz, locale, true)}</p>
                          </div>
                          <div className="text-right shrink-0 space-y-1">
                            <p className="text-sm font-black text-emerald-700">{money(sale.amount, sale.currency, locale)}</p>
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", statusTone(sale.orderStatus))}>
                              {["delivered", "completed"].includes(sale.orderStatus) ? <CheckCircle2 className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                              {t(`salesReport.status.${sale.orderStatus}`, { defaultValue: sale.orderStatus })}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
                        <th className="py-2 pr-3 font-bold">{t("salesDashboard.colOrder")}</th>
                        <th className="py-2 pr-3 font-bold">{t("salesDashboard.colProduct")}</th>
                        <th className="py-2 pr-3 font-bold">{t("salesDashboard.colAmount")}</th>
                        <th className="py-2 pr-3 font-bold">{t("salesDashboard.colDate")}</th>
                        <th className="py-2 font-bold">{t("salesDashboard.colStatus")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dash.recentSales.map(sale => (
                        <tr key={sale.id} className="border-b border-border/60 hover:bg-emerald-50/40">
                          <td className="py-3 pr-3">
                            <Link href={`/orders/${sale.id}`} className="font-black text-foreground hover:text-emerald-700">FM-{sale.id}</Link>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2 min-w-0">
                              {sale.image ? <img src={sale.image} alt="" className="h-8 w-8 rounded-md object-cover border" loading="lazy" /> : <Package className="h-4 w-4 text-muted-foreground" />}
                              <span className="truncate max-w-[220px] font-medium">{sale.title ?? t("salesDashboard.product")}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-3 font-black text-emerald-700">{money(sale.amount, sale.currency, locale)}</td>
                          <td className="py-3 pr-3 text-muted-foreground whitespace-nowrap">{formatDate(sale.createdAt, tz, locale, true)}</td>
                          <td className="py-3">
                            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", statusTone(sale.orderStatus))}>
                              {t(`salesReport.status.${sale.orderStatus}`, { defaultValue: sale.orderStatus })}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {/* Existing detailed monthly report — preserved */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <button
          type="button"
          onClick={() => setShowDetail(v => !v)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
          data-testid="toggle-detailed-report"
        >
          <span className="inline-flex items-center gap-2 text-sm font-black text-foreground">
            <FileBarChart className="h-4 w-4 text-emerald-700" />
            {t("salesDashboard.detailedReport")}
          </span>
          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showDetail && "rotate-90")} />
        </button>

        {showDetail && (
          <div className="border-t border-border p-4 space-y-4">
            <ReportControls filters={filters} onChange={change} months={months} monthLabels={monthLabels}
              currencies={currencies} currentMonth={currentMonth} onRefresh={() => { pollsUntilRef.current = Date.now() + MAX_POLLS * POLL_MS; void q.refetch(); }}
              refreshing={q.isFetching} onClear={clear} hasFilters={hasFilters} />

            <div className="text-xs text-muted-foreground space-y-0.5" data-testid="text-report-basis">
              <p>{t("salesReport.zone", { zone: data?.filters.timezone ?? tz })}</p>
              <p>{t("salesReport.basis")}</p>
              {data && (
                <>
                  <p>{t("salesReport.period", { start: formatDate(data.filters.periodStart, tz, locale) ?? "", end: formatDate(new Date(new Date(data.filters.periodEnd).getTime() - 1).toISOString(), tz, locale) ?? "" })}</p>
                  <p>{t("salesReport.updated", { time: formatDate(data.filters.asOf, tz, locale, true) ?? "" })}</p>
                </>
              )}
            </div>

            {q.isLoading && <Skeleton />}
            {data && !q.isError && (
              <>
                {data.summary.length > 0 && <SummaryGrid summary={data.summary} />}
                {isEmpty ? (
                  <div className="rounded-3xl border-2 border-dashed border-border bg-card/50 py-10 px-6 text-center" data-testid="report-empty">
                    <FileBarChart className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" aria-hidden />
                    <p className="font-black text-lg text-foreground">
                      {hasFilters ? t("salesReport.filteredEmptyTitle") : t("salesReport.emptyTitle", { month: monthLabels[filters.month] })}
                    </p>
                  </div>
                ) : (
                  <section aria-labelledby="sales-h" className="space-y-3" aria-busy={q.isFetching}>
                    <div className="flex items-baseline justify-between gap-2">
                      <h2 id="sales-h" className="text-lg font-black text-foreground">{t("salesReport.sales")}</h2>
                      {pg && <span className="text-xs text-muted-foreground">{t("salesReport.showing", { count: pg.total })}</span>}
                    </div>
                    <SalesRows rows={data.sales} tz={tz} locale={locale} />
                    {pg && pg.totalPages > 1 && (
                      <nav className="flex items-center justify-between gap-2 pt-2" aria-label={t("salesReport.sales")}>
                        <button type="button" disabled={pg.page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} data-testid="button-prev-page"
                          className="h-11 px-4 rounded-lg border border-border bg-card text-sm font-bold disabled:opacity-40">{t("salesReport.prev")}</button>
                        <span className="text-sm font-medium text-muted-foreground">{t("salesReport.page", { page: pg.page, total: pg.totalPages })}</span>
                        <button type="button" disabled={pg.page >= pg.totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-next-page"
                          className="h-11 px-4 rounded-lg border border-border bg-card text-sm font-bold disabled:opacity-40">{t("salesReport.next")}</button>
                      </nav>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
