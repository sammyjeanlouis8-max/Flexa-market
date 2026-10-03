import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertCircle, ChevronLeft, FileBarChart, Lock } from "lucide-react";
import { useGetSellerSalesReport, GetSellerSalesReportReport } from "@workspace/api-client-react";
import type { GetSellerSalesReportParams } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { ReportControls, type Filters } from "@/components/sales-report/ReportControls";
import { SummaryGrid } from "@/components/sales-report/SummaryGrid";
import { SalesRows } from "@/components/sales-report/SalesRows";
import { browserTimeZone, currentMonthIn, formatDate, monthLabel } from "@/lib/sales-report-format";

const LIMIT = 20;
const POLL_MS = 60_000;
const MAX_POLLS = 10;

function Skeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" role="status" aria-live="polite" data-testid="report-loading">
      <span className="sr-only">{t("salesReport.loading")}</span>
      <div className="h-48 rounded-2xl bg-muted animate-pulse" />
      {[0, 1, 2].map(i => <div key={i} className="h-24 rounded-2xl bg-muted animate-pulse" />)}
    </div>
  );
}

export default function Sales() {
  const { user, token, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t, i18n } = useTranslation();
  const locale = i18n.language || "en";
  const tz = useMemo(() => browserTimeZone(), []);
  const currentMonth = useMemo(() => currentMonthIn(tz), [tz]);

  const [filters, setFilters] = useState<Filters>({ month: currentMonth, currency: "", orderStatus: "", paymentStatus: "", payoutStatus: "" });
  const [page, setPage] = useState(1);
  const userId = user?.id ?? null;

  // Reset on account switch so no previous account's selections persist.
  useEffect(() => {
    setFilters({ month: currentMonth, currency: "", orderStatus: "", paymentStatus: "", payoutStatus: "" });
    setPage(1);
  }, [userId, currentMonth]);

  useEffect(() => {
    if (!authLoading && !user) setLocation("/auth/login");
  }, [authLoading, user, setLocation]);

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
      enabled: !!token && userId != null,
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
  const status = (q.error as { status?: number } | null)?.status;
  const authError = status === 401 || status === 403;

  if (authLoading && !user) return <div className="max-w-4xl mx-auto px-4 py-6"><Skeleton /></div>;
  if (!user) return null;

  const currencies = Array.from(new Set([...(data?.filters.availableCurrencies ?? []), ...(filters.currency ? [filters.currency] : [])]));
  const pg = data?.pagination;
  const isEmpty = !!data && data.sales.length === 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div>
        <button type="button" onClick={() => history.back()} data-testid="button-back"
          className="inline-flex items-center h-11 -ml-2 px-2 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 mr-1" aria-hidden /> {t("salesReport.back")}
        </button>
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <FileBarChart className="h-6 w-6 text-emerald-600 dark:text-emerald-400" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">{t("salesReport.title")}</h1>
            <p className="text-sm text-muted-foreground max-w-2xl">{t("salesReport.subtitle")}</p>
          </div>
        </div>
      </div>

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

      {q.isError && authError && (
        <div className="rounded-2xl border border-border bg-card p-8 text-center" role="alert" data-testid="report-auth">
          <Lock className="h-8 w-8 mx-auto mb-3 text-muted-foreground" aria-hidden />
          <p className="font-black text-foreground">{t("salesReport.authTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("salesReport.authDesc")}</p>
          <Link href="/auth/login" className="inline-flex items-center justify-center h-11 px-5 mt-4 rounded-lg bg-foreground text-background text-sm font-bold">{t("salesReport.signIn")}</Link>
        </div>
      )}

      {q.isError && !authError && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-6 text-center" role="alert" data-testid="report-error">
          <AlertCircle className="h-8 w-8 mx-auto mb-3 text-destructive" aria-hidden />
          <p className="font-black text-foreground">{t("salesReport.errorTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("salesReport.errorDesc")}</p>
          <button type="button" onClick={() => void q.refetch()} data-testid="button-retry-report"
            className="h-11 px-5 mt-4 rounded-lg bg-foreground text-background text-sm font-bold">{t("salesReport.retry")}</button>
        </div>
      )}

      {q.isLoading && <Skeleton />}

      {data && !q.isError && (
        <>
          {data.summary.length > 0 && <SummaryGrid summary={data.summary} />}

          {isEmpty ? (
            <div className="rounded-3xl border-2 border-dashed border-border bg-card/50 py-14 px-6 text-center" data-testid="report-empty">
              <FileBarChart className="h-10 w-10 mx-auto text-muted-foreground/60 mb-3" aria-hidden />
              <p className="font-black text-lg text-foreground">
                {hasFilters ? t("salesReport.filteredEmptyTitle") : t("salesReport.emptyTitle", { month: monthLabels[filters.month] })}
              </p>
              {!hasFilters && <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">{t("salesReport.emptyDesc")}</p>}
              {hasFilters && (
                <button type="button" onClick={clear} className="h-11 px-4 mt-3 text-sm font-bold text-primary hover:underline">{t("salesReport.clear")}</button>
              )}
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
  );
}
