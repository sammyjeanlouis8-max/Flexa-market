import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { formatMinor } from "@/lib/sales-report-format";

export function Money({ value, exponent, currency, className }: { value: string | null | undefined; exponent: number; currency: string; className?: string }) {
  const { t, i18n } = useTranslation();
  const text = formatMinor(value, exponent, currency, i18n.language);
  if (text === null) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-medium" title={t("salesReport.unavailable")}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t("salesReport.unavailable")}
      </span>
    );
  }
  return <span className={`tabular-nums ${className ?? ""}`}>{text}</span>;
}

export function StatusText({ value, group }: { value: string; group: "status" | "payout" | "payment" }) {
  const { t } = useTranslation();
  const key = `salesReport.${group === "payment" ? "status" : group}.${group === "payment" && value === "completed" ? "paid" : value}`;
  return <>{t(key, { defaultValue: `${t("salesReport.unknownStatus")}: ${value}` })}</>;
}
