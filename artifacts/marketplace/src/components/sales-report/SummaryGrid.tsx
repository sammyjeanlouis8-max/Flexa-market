import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { SellerSalesMoneySummary } from "@workspace/api-client-react";
import { addKnown } from "@/lib/sales-report-format";
import { Money } from "./Money";

function Stat({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={strong ? "text-xl font-black text-foreground break-words" : "text-sm font-semibold text-foreground break-words"}>{children}</dd>
    </div>
  );
}

export function SummaryGrid({ summary }: { summary: SellerSalesMoneySummary[] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="summary-h" className="space-y-3">
      <div>
        <h2 id="summary-h" className="text-lg font-black text-foreground">{t("salesReport.summaryTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("salesReport.currencyNote")}</p>
      </div>
      {summary.map(s => {
        const m = (v: string | null, strong?: boolean) => <Money value={v} exponent={s.exponent} currency={s.currency} className={strong ? "" : ""} />;
        const fc = addKnown(s.feesMinor, s.commissionsMinor);
        return (
          <article key={s.currency} data-testid={`summary-${s.currency}`} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <header className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border bg-muted/40">
              <h3 className="font-black tracking-wide text-foreground">{s.currency}</h3>
              <span className="text-xs font-semibold text-muted-foreground">{t("salesReport.orders")}: {s.orderCount}</span>
            </header>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
              <Stat label={t("salesReport.gross")} strong>{m(s.grossSalesMinor)}</Stat>
              <Stat label={t("salesReport.customerRefunds")}>{m(s.customerRefundsMinor)}</Stat>
              <Stat label={t("salesReport.refunds")}>{m(s.refundsMinor)}</Stat>
              <Stat label={t("salesReport.feesCommissions")}>{m(fc)}</Stat>
              <Stat label={t("salesReport.net")} strong>{m(s.netSellerAmountMinor)}</Stat>
              <Stat label={t("salesReport.pending")}>{m(s.pendingAmountMinor)}</Stat>
              <Stat label={t("salesReport.processing")}>{m(s.processingAmountMinor)}</Stat>
              <Stat label={t("salesReport.transferred")}>{m(s.transferredAmountMinor)}</Stat>
              <Stat label={t("salesReport.returned")}>{m(s.returnedAmountMinor)}</Stat>
            </dl>
            <footer className={`px-4 py-2.5 text-xs font-medium flex items-start gap-2 ${s.complete ? "text-emerald-800 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20"}`}>
              {s.complete
                ? <><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />{t("salesReport.complete")}</>
                : <><AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />{t("salesReport.incomplete")}</>}
            </footer>
          </article>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("salesReport.transferNote")}</p>
    </section>
  );
}
