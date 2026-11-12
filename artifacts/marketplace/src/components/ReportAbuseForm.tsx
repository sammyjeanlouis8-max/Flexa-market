import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ABUSE_REASON_KEYS = [
  { key: "harassment", labelKey: "safety.reasonHarassment", fallback: "Harassment" },
  { key: "threats", labelKey: "safety.reasonThreats", fallback: "Threats" },
  { key: "fraud", labelKey: "safety.reasonFraud", fallback: "Fraud / scam" },
  { key: "other", labelKey: "safety.reasonOther", fallback: "Other" },
] as const;

export function abuseReasonText(
  key: (typeof ABUSE_REASON_KEYS)[number]["key"],
  t: (k: string, opts?: { defaultValue?: string }) => string,
  details?: string,
): string {
  const row = ABUSE_REASON_KEYS.find((r) => r.key === key) ?? ABUSE_REASON_KEYS[3];
  const label = t(row.labelKey, { defaultValue: row.fallback });
  const extra = details?.trim();
  return extra ? `${label}: ${extra}` : label;
}

interface ReportAbuseFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { reasonKey: (typeof ABUSE_REASON_KEYS)[number]["key"]; reason: string }) => Promise<void>;
  title?: string;
  subtitle?: string;
}

export function ReportAbuseForm({ open, onClose, onSubmit, title, subtitle }: ReportAbuseFormProps) {
  const { t } = useTranslation();
  const [reasonKey, setReasonKey] = useState<(typeof ABUSE_REASON_KEYS)[number]["key"]>("harassment");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        reasonKey,
        reason: abuseReasonText(reasonKey, t, details),
      });
      setDetails("");
      onClose();
    } catch {
      setError(t("safety.reportFailed", { defaultValue: "Could not submit the report. You can try again." }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/45 p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-abuse-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0">
            <h2 id="report-abuse-title" className="text-base font-bold flex items-center gap-2">
              <Flag className="h-4 w-4 text-destructive" />
              {title ?? t("safety.reportTitle", { defaultValue: "Report abuse" })}
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {subtitle ?? t("safety.reportSubtitle", {
                defaultValue: "Choose a reason. The block stays active even if you close this form.",
              })}
            </p>
          </div>
          <button
            type="button"
            className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-muted"
            onClick={onClose}
            aria-label={t("common.close", { defaultValue: "Close" })}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 pb-4 space-y-3">
          <div className="space-y-2">
            {ABUSE_REASON_KEYS.map((r) => (
              <label
                key={r.key}
                className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/40"
              >
                <input
                  type="radio"
                  name="abuse-reason"
                  checked={reasonKey === r.key}
                  onChange={() => setReasonKey(r.key)}
                  className="accent-[hsl(152,65%,28%)]"
                />
                <span className="text-sm font-medium">{t(r.labelKey, { defaultValue: r.fallback })}</span>
              </label>
            ))}
          </div>

          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder={t("safety.reportDetailsPlaceholder", {
              defaultValue: "Optional details for the moderation team",
            })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
              {t("common.close", { defaultValue: "Close" })}
            </Button>
            <Button type="button" className="flex-1" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("safety.submitReport", { defaultValue: "Submit report" })}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
