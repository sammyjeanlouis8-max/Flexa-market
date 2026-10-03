import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYOUT_STATUSES } from "@/lib/sales-report-format";

export type Filters = { month: string; currency: string; orderStatus: string; paymentStatus: string; payoutStatus: string };

const sel = "h-11 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function ReportControls({
  filters, onChange, months, monthLabels, currencies, currentMonth, onRefresh, refreshing, onClear, hasFilters,
}: {
  filters: Filters; onChange: (patch: Partial<Filters>) => void; months: string[]; monthLabels: Record<string, string>;
  currencies: string[]; currentMonth: string; onRefresh: () => void; refreshing: boolean; onClear: () => void; hasFilters: boolean;
}) {
  const { t } = useTranslation();
  const opt = (g: "status" | "payout", v: string) => (
    <option key={v} value={v}>{t(`salesReport.${g}.${v}`)}</option>
  );
  return (
    <section aria-label={t("salesReport.sales")} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Field label={t("salesReport.month")}>
          <select className={sel} value={filters.month} onChange={e => onChange({ month: e.target.value })} data-testid="select-report-month">
            {months.map(m => (
              <option key={m} value={m}>{monthLabels[m]}{m === currentMonth ? ` (${t("salesReport.currentMonth")})` : ""}</option>
            ))}
          </select>
        </Field>
        <Field label={t("salesReport.currency")}>
          <select className={sel} value={filters.currency} onChange={e => onChange({ currency: e.target.value })} data-testid="select-report-currency">
            <option value="">{t("salesReport.allCurrencies")}</option>
            {currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label={t("salesReport.orderStatus")}>
          <select className={sel} value={filters.orderStatus} onChange={e => onChange({ orderStatus: e.target.value })} data-testid="select-report-order-status">
            <option value="">{t("salesReport.all")}</option>
            {ORDER_STATUSES.map(v => opt("status", v))}
          </select>
        </Field>
        <Field label={t("salesReport.paymentStatus")}>
          <select className={sel} value={filters.paymentStatus} onChange={e => onChange({ paymentStatus: e.target.value })} data-testid="select-report-payment-status">
            <option value="">{t("salesReport.all")}</option>
            {PAYMENT_STATUSES.map(v => opt("status", v))}
          </select>
        </Field>
        <Field label={t("salesReport.payoutStatus")}>
          <select className={sel} value={filters.payoutStatus} onChange={e => onChange({ payoutStatus: e.target.value })} data-testid="select-report-payout-status">
            <option value="">{t("salesReport.all")}</option>
            {PAYOUT_STATUSES.map(v => opt("payout", v))}
          </select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRefresh} disabled={refreshing} data-testid="button-refresh-report"
          className="inline-flex items-center gap-2 h-11 px-4 rounded-lg border border-border bg-background text-sm font-bold hover:bg-accent disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          {refreshing ? t("salesReport.refreshing") : t("salesReport.refresh")}
        </button>
        {hasFilters && (
          <button type="button" onClick={onClear} data-testid="button-clear-report-filters"
            className="h-11 px-3 text-sm font-bold text-primary hover:underline">{t("salesReport.clear")}</button>
        )}
      </div>
    </section>
  );
}
