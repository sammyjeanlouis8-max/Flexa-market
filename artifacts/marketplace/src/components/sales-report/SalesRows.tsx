import { Fragment, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ChevronDown, Eye, Package, Printer } from "lucide-react";
import type { SellerSalesReportRow } from "@workspace/api-client-react";
import { addKnown, formatDate, KNOWN_WARNINGS } from "@/lib/sales-report-format";
import { Money, StatusText } from "./Money";

const chip = "inline-flex items-center rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-bold text-foreground";
const linkBtn = "inline-flex items-center justify-center gap-1.5 h-11 px-4 rounded-lg border border-border bg-background text-sm font-bold hover:bg-accent";

function Warnings({ row }: { row: SellerSalesReportRow }) {
  const { t } = useTranslation();
  if (!row.warnings.length) return null;
  return (
    <ul className="space-y-1" data-testid={`warnings-${row.id}`}>
      {row.warnings.map(w => (
        <li key={w} className="flex items-start gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" aria-hidden />
          {KNOWN_WARNINGS.includes(w) ? t(`salesReport.warn.${w}`) : `${t("salesReport.unknownWarning")}: ${w}`}
        </li>
      ))}
    </ul>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground break-words">{children}</dd>
    </div>
  );
}

function RowDetails({ row, tz, locale }: { row: SellerSalesReportRow; tz: string; locale: string }) {
  const { t } = useTranslation();
  const mm = (v: string | null) => <Money value={v} exponent={row.exponent} currency={row.currency} />;
  const fc = addKnown(row.feesMinor, row.commissionsMinor);
  const payoutDate = formatDate(row.payoutDate, tz, locale, true);
  // The existing order detail/label endpoint accepts completed payments only.
  // Refunded/cancelled history is audited inline, not sent to a dead link.
  const canViewOrder = row.canViewOrder === true;
  const eligible = canViewOrder && row.orderStatus === "ready_to_ship";
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Detail label={t("salesReport.sale")}>{mm(row.originalSaleMinor)}</Detail>
        <Detail label={t("salesReport.customerPaid")}>{mm(row.customerPaymentMinor)}</Detail>
        <Detail label={t("salesReport.customerRefunds")}>{mm(row.customerRefundMinor)}</Detail>
        <Detail label={t("salesReport.refunds")}>{mm(row.refundsMinor)}</Detail>
        <Detail label={t("salesReport.netSale")}>{mm(row.netSaleMinor)}</Detail>
        <Detail label={t("salesReport.feesCommissions")}>{mm(fc)}</Detail>
        <Detail label={t("salesReport.fees")}>{mm(row.feesMinor)}</Detail>
        <Detail label={t("salesReport.commissions")}>{mm(row.commissionsMinor)}</Detail>
        {row.originalCommissionMinor !== undefined && <Detail label={t("salesReport.originalCommission")}>{mm(row.originalCommissionMinor)}</Detail>}
        {row.originalSellerEarningsMinor !== undefined && <Detail label={t("salesReport.originalNet")}>{mm(row.originalSellerEarningsMinor)}</Detail>}
        <Detail label={t("salesReport.net")}>{mm(row.netSellerAmountMinor)}</Detail>
        <Detail label={t("salesReport.transferred")}>{mm(row.transferredMinor)}</Detail>
        <Detail label={t("salesReport.returned")}>{mm(row.returnedMinor)}</Detail>
        <Detail label={t("salesReport.paymentMethod")}>{t(`salesReport.methods.${row.paymentMethod}`, { defaultValue: row.paymentMethod })}</Detail>
        <Detail label={t("salesReport.payoutDest")}>{row.payoutDestination === "FM Card" ? t("salesReport.fmCard") : row.payoutDestination ?? t("salesReport.unavailable")}</Detail>
        <Detail label={t("salesReport.payoutDate")}>{payoutDate ?? t("salesReport.noPayoutDate")}</Detail>
      </dl>
      {row.refunds.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{t("salesReport.refundEvidence")}</p>
          <ul className="space-y-1 text-xs">
            {row.refunds.map(r => (
              <li key={r.id} className="flex flex-wrap gap-x-3 gap-y-0.5 rounded-md bg-muted/40 px-2 py-1.5">
                <span className="font-mono">{r.id}</span>
                <span>{t("salesReport.refundSource")}: {t(`salesReport.sources.${r.source}`, { defaultValue: r.source })}</span>
                <Money value={r.amountMinor} exponent={row.exponent} currency={row.currency} />
                <span>{formatDate(r.date, tz, locale, true) ?? t("salesReport.unavailable")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Warnings row={row} />
      {row.refunds.length > 0 && <p className="text-xs text-muted-foreground">{t("salesReport.refundAllocationNote")}</p>}
      <div className="flex flex-wrap gap-2">
        {canViewOrder && <Link href={`/orders/${row.id}`} className={linkBtn} data-testid={`link-order-${row.id}`}>
          <Eye className="h-4 w-4" aria-hidden /> {t("salesReport.viewOrder")}
        </Link>}
        {eligible && (
          <Link href={`/orders/${row.id}/label`} className={linkBtn} data-testid={`link-label-${row.id}`}>
            <Printer className="h-4 w-4" aria-hidden /> {t("salesReport.printLabel")}
          </Link>
        )}
      </div>
    </div>
  );
}

function Statuses({ row }: { row: SellerSalesReportRow }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className={chip}>{t("salesReport.orderStatus")}: <StatusText group="status" value={row.orderStatus} /></span>
      <span className={chip}>{t("salesReport.paymentStatus")}: <StatusText group="payment" value={row.paymentStatus} /></span>
      <span className={chip}>{t("salesReport.payoutStatus")}: <StatusText group="payout" value={row.payoutStatus} /></span>
    </div>
  );
}

function Thumb({ row }: { row: SellerSalesReportRow }) {
  const img = row.images?.[0];
  return img
    ? <img src={img} alt="" loading="lazy" className="h-12 w-12 rounded-lg object-cover border border-border shrink-0" />
    : <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0"><Package className="h-5 w-5 text-muted-foreground/50" aria-hidden /></div>;
}

function Row({ row, tz, locale }: { row: SellerSalesReportRow; tz: string; locale: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const panelId = `row-panel-${row.id}`;
  const net = <Money value={row.netSellerAmountMinor} exponent={row.exponent} currency={row.currency} />;
  return (
    <li className="rounded-2xl border border-border bg-card shadow-sm" data-testid={`row-sale-${row.id}`}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4 flex gap-3 items-start min-h-[44px] rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <Thumb row={row} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-muted-foreground">#{String(row.id).padStart(6, "0")}</span>
            <span className="text-xs text-muted-foreground">{formatDate(row.createdAt, tz, locale)}</span>
          </div>
          <p className="font-bold text-foreground truncate">{row.title ?? t("salesReport.unavailable")}</p>
          <Statuses row={row} />
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{t("salesReport.net")}</span>
            <span className="font-black">{net}</span>
          </div>
          {row.warnings.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {t("salesReport.warnings")}: {row.warnings.length}
            </span>
          )}
        </div>
        <ChevronDown className={`h-5 w-5 mt-1 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-label={open ? t("salesReport.hideDetails") : t("salesReport.details")} />
      </button>
      {open && <div id={panelId} className="px-4 pb-4 pt-3 border-t border-border"><RowDetails row={row} tz={tz} locale={locale} /></div>}
    </li>
  );
}

export function SalesRows({ rows, tz, locale }: { rows: SellerSalesReportRow[]; tz: string; locale: string }) {
  const { t } = useTranslation();
  const [openId, setOpenId] = useState<number | null>(null);
  return (
    <>
      <ul className="md:hidden space-y-3" data-testid="list-sales-mobile">
        {rows.map(r => <Row key={r.id} row={r} tz={tz} locale={locale} />)}
      </ul>
      <div className="hidden md:block rounded-2xl border border-border bg-card shadow-sm overflow-x-auto" data-testid="table-sales">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border">
              <th scope="col" className="p-3">{t("salesReport.order")}</th>
              <th scope="col" className="p-3">{t("salesReport.item")}</th>
              <th scope="col" className="p-3">{t("salesReport.date")}</th>
              <th scope="col" className="p-3">{t("salesReport.orderStatus")} / {t("salesReport.paymentStatus")} / {t("salesReport.payoutStatus")}</th>
              <th scope="col" className="p-3 text-right">{t("salesReport.net")}</th>
              <th scope="col" className="p-3"><span className="sr-only">{t("salesReport.details")}</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const open = openId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className="border-b border-border/60 align-top" data-testid={`row-sale-${r.id}`}>
                    <td className="p-3 font-mono text-xs font-bold">#{String(r.id).padStart(6, "0")}</td>
                    <td className="p-3"><div className="flex items-center gap-2 min-w-[180px]"><Thumb row={r} /><span className="font-bold line-clamp-2">{r.title ?? t("salesReport.unavailable")}</span></div></td>
                    <td className="p-3 whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt, tz, locale)}</td>
                    <td className="p-3 space-y-1.5"><Statuses row={r} />{r.warnings.length > 0 && <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 dark:text-amber-300"><AlertTriangle className="h-3.5 w-3.5" aria-hidden />{r.warnings.length}</span>}</td>
                    <td className="p-3 text-right font-black whitespace-nowrap"><Money value={r.netSellerAmountMinor} exponent={r.exponent} currency={r.currency} /></td>
                    <td className="p-3">
                      <button type="button" aria-expanded={open} aria-controls={`row-panel-${r.id}`} onClick={() => setOpenId(open ? null : r.id)}
                        className="h-11 w-11 inline-flex items-center justify-center rounded-lg hover:bg-accent" aria-label={open ? t("salesReport.hideDetails") : t("salesReport.details")}>
                        <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                      </button>
                    </td>
                  </tr>
                  {open && (
                    <tr key={`${r.id}-d`} id={`row-panel-${r.id}`} className="border-b border-border/60 bg-muted/20">
                      <td colSpan={6} className="p-4"><RowDetails row={r} tz={tz} locale={locale} /></td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
