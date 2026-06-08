/**
 * Phase 4 — Open dispute dialog.
 *
 * Lightweight modal that lets the buyer / seller / driver formally raise a
 * dispute on a delivery they are a party to. The dialog gates submission
 * behind a reason (short tag) + a description (free text) and optional
 * evidence URLs (paste-only — file upload reuses the existing /api/storage
 * pipeline elsewhere and is intentionally out of scope for this MVP).
 *
 * Status of an existing open dispute is fetched on mount via
 * GET /api/deliveries/:id/dispute so the button can swap into a "Pending
 * admin review" hint instead of letting the user double-open.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

interface OpenDisputeDialogProps {
  deliveryId: number;
  /** Hide the trigger button completely if the delivery is in a status that
   *  cannot transition to "disputed" (e.g. already completed). The page knows
   *  this via the state machine on the server; we pass the boolean down. */
  disabled?: boolean;
}

type ExistingDispute = {
  id: number;
  status: "open" | "under_review" | "resolved_buyer" | "resolved_seller" | "closed";
  reason: string;
};

const REASON_OPTIONS = [
  { value: "item_damaged",    labelKey: "dispute.reason.itemDamaged",    fallback: "Item damaged" },
  { value: "wrong_item",      labelKey: "dispute.reason.wrongItem",      fallback: "Wrong item delivered" },
  { value: "never_received",  labelKey: "dispute.reason.neverReceived",  fallback: "Never received" },
  { value: "driver_no_show",  labelKey: "dispute.reason.driverNoShow",   fallback: "Driver no-show" },
  { value: "other",           labelKey: "dispute.reason.other",          fallback: "Other" },
] as const;

export function OpenDisputeDialog({ deliveryId, disabled }: OpenDisputeDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<typeof REASON_OPTIONS[number]["value"]>("item_damaged");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState(""); // newline-separated URLs
  const [submitting, setSubmitting] = useState(false);
  const [existing, setExisting] = useState<ExistingDispute | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ dispute: ExistingDispute | null }>(`/api/deliveries/${deliveryId}/dispute`);
        if (!cancelled) setExisting(data?.dispute ?? null);
      } catch {
        if (!cancelled) setExisting(null);
      } finally {
        if (!cancelled) setLoadingExisting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deliveryId]);

  async function onSubmit() {
    if (description.trim().length < 10) {
      toast({ title: t("dispute.descTooShort", { defaultValue: "Please provide at least 10 characters of detail." }), variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const evidenceUrls = evidence
        .split(/\r?\n/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0)
        .slice(0, 8);
      const res = await apiFetch<{ dispute: ExistingDispute }>(`/api/deliveries/${deliveryId}/dispute`, {
        method: "POST",
        body: JSON.stringify({ reason, description: description.trim(), evidenceUrls }),
      });
      setExisting(res.dispute);
      setOpen(false);
      toast({ title: t("dispute.openedTitle", { defaultValue: "Dispute opened" }) });
    } catch (e: any) {
      toast({
        title: t("dispute.openedFail", { defaultValue: "Could not open dispute" }),
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingExisting) return null;

  // Already-open dispute → show status pill, no button
  if (existing && (existing.status === "open" || existing.status === "under_review")) {
    return (
      <div
        data-testid={`dispute-status-${deliveryId}`}
        className="mx-5 mb-3 rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 flex gap-3 items-start"
      >
        <ShieldCheck className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs leading-relaxed">
          <p className="font-bold text-amber-900 dark:text-amber-200 mb-0.5">
            {t("dispute.pendingTitle", { defaultValue: "Dispute under review" })}
          </p>
          <p className="text-amber-800 dark:text-amber-300">
            {t("dispute.pendingBody", { defaultValue: "Our team is reviewing this delivery. You'll be notified when a decision is made." })}
          </p>
        </div>
      </div>
    );
  }

  if (disabled) return null;

  return (
    <div className="mx-5 mb-3">
      <Button
        data-testid={`open-dispute-${deliveryId}`}
        variant="outline"
        className="w-full justify-start gap-2 border-destructive/40 text-destructive hover:bg-destructive/5"
        onClick={() => setOpen(true)}
      >
        <AlertTriangle className="h-4 w-4" />
        {t("dispute.openCta", { defaultValue: "Report a problem with this delivery" })}
      </Button>

      <Dialog open={open} onOpenChange={(v) => !submitting && setOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("dispute.modalTitle", { defaultValue: "Open a dispute" })}</DialogTitle>
            <DialogDescription>
              {t("dispute.modalBody", { defaultValue: "Tell us what went wrong. An admin will review and reach out within 24 hours." })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold mb-1.5 block">
                {t("dispute.reasonLabel", { defaultValue: "Reason" })}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {REASON_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    data-testid={`dispute-reason-${r.value}`}
                    onClick={() => setReason(r.value)}
                    className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                      reason === r.value ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
                    }`}
                  >
                    {t(r.labelKey, { defaultValue: r.fallback })}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block">
                {t("dispute.descLabel", { defaultValue: "What happened?" })}
              </label>
              <Textarea
                data-testid="dispute-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder={t("dispute.descPlaceholder", { defaultValue: "Describe the issue with as much detail as possible…" })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {description.length}/2000
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold mb-1.5 block">
                {t("dispute.evidenceLabel", { defaultValue: "Evidence URLs (optional, one per line)" })}
              </label>
              <Input
                data-testid="dispute-evidence"
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                placeholder="https://…"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {t("dispute.evidenceHint", { defaultValue: "Paste links to photos / receipts you've already uploaded. Max 8." })}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button data-testid="dispute-submit" onClick={onSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("dispute.submit", { defaultValue: "Open dispute" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
