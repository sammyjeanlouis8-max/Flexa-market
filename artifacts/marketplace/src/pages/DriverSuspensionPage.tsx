import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Ban, Calendar, Clock, ShieldAlert, Headphones, FileText, XCircle } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface SuspensionInfo {
  suspended: boolean;
  reason?: string | null;
  suspendedAt?: string | null;
  suspendedUntil?: string | null;
  isPermanent?: boolean;
  suspendedByName?: string | null;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", {
    year: "numeric", month: "long", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function DriverSuspensionPage() {
  const [, navigate] = useLocation();
  const { token } = useAuth();
  const { t } = useTranslation();
  const [info, setInfo] = useState<SuspensionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch("/api/delivery/my-suspension", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-red-50 dark:bg-red-950/10">
        <div className="animate-spin h-8 w-8 border-4 border-red-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  const isPermanent = info?.isPermanent ?? !info?.suspendedUntil;

  return (
    <div className="min-h-screen bg-gradient-to-b from-red-50 via-red-50/60 to-background dark:from-red-950/20 dark:via-red-950/10 dark:to-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-red-100 dark:border-red-900/30 bg-white/70 dark:bg-background/70 backdrop-blur-sm">
        <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          {t("driverSuspension.back")}
        </button>
        <p className="text-sm font-bold text-red-700 dark:text-red-300">{t("driverSuspension.headerTitle")}</p>
        <div className="w-12" />
      </div>

      <div className="flex-1 flex flex-col items-center px-4 py-8 max-w-md mx-auto w-full gap-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-4 pt-4">
          <div className="relative">
            <div className="h-28 w-28 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center shadow-lg shadow-red-200/50 dark:shadow-red-900/30">
              <Ban className="h-16 w-16 text-red-500" strokeWidth={1.5} />
            </div>
            <div className="absolute inset-0 rounded-full border-2 border-red-400/40 animate-ping" style={{ animationDuration: "2s" }} />
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-black text-red-600 dark:text-red-400">{t("driverSuspension.heroTitle")}</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
              {t("driverSuspension.heroSubtitle")}
            </p>
          </div>
        </div>

        {/* Suspension Details Card */}
        <div className="w-full rounded-2xl border border-red-200 dark:border-red-800/60 bg-white dark:bg-card shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-red-100 dark:border-red-900/30 bg-red-50/60 dark:bg-red-900/10">
            <ShieldAlert className="h-4 w-4 text-red-500" />
            <p className="text-sm font-bold text-red-700 dark:text-red-300">{t("driverSuspension.detailsTitle")}</p>
          </div>

          <div className="divide-y divide-border">
            {/* Reason */}
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="h-8 w-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="h-4 w-4 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{t("driverSuspension.reasonLabel")}</p>
                <p className="text-sm font-semibold mt-0.5 leading-snug">
                  {info?.reason || t("driverSuspension.defaultReason")}
                </p>
              </div>
            </div>

            {/* Suspended On */}
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="h-8 w-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0 mt-0.5">
                <Calendar className="h-4 w-4 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{t("driverSuspension.dateLabel")}</p>
                <p className="text-sm font-semibold mt-0.5">{formatDate(info?.suspendedAt)}</p>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="h-8 w-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0 mt-0.5">
                <ShieldAlert className="h-4 w-4 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground font-medium">{t("driverSuspension.statusLabel")}</p>
                <span className={`inline-flex items-center gap-1 mt-0.5 text-xs font-bold px-2.5 py-1 rounded-full ${isPermanent ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"}`}>
                  {isPermanent ? t("driverSuspension.permanent") : t("driverSuspension.temporary")}
                </span>
              </div>
            </div>

            {/* Ends On */}
            {!isPermanent && info?.suspendedUntil && (
              <div className="flex items-start gap-3 px-4 py-3.5">
                <div className="h-8 w-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-4 w-4 text-red-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground font-medium">{t("driverSuspension.endsLabel")}</p>
                  <p className="text-sm font-semibold mt-0.5">{formatDate(info.suspendedUntil)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* You Can't Card */}
        <div className="w-full rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-border">
            <p className="text-sm font-bold text-red-600 dark:text-red-400">{t("driverSuspension.cantTitle")}</p>
          </div>
          <div className="px-4 py-3 space-y-3">
            {([
              t("driverSuspension.cantAccept"),
              t("driverSuspension.cantGoOnline"),
              t("driverSuspension.cantWithdraw"),
            ]).map(item => (
              <div key={item} className="flex items-center gap-3">
                <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                <p className="text-sm text-foreground font-medium">{item}</p>
              </div>
            ))}
          </div>
          <div className="relative overflow-hidden h-0">
            <div className="absolute bottom-0 right-0 opacity-5 select-none pointer-events-none">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
            </div>
          </div>
        </div>

        {/* Appeal Notice */}
        <div className="w-full rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-900/10 p-4 flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
            <ShieldAlert className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <p className="text-xs text-blue-800 dark:text-blue-300 leading-relaxed flex-1">
            {t("driverSuspension.appealNotice")}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full grid grid-cols-2 gap-3 pb-8">
          <Button
            variant="outline"
            className="h-12 gap-2 text-sm font-bold border-border hover:bg-accent"
            onClick={() => navigate("/support")}
          >
            <Headphones className="h-4 w-4" />
            {t("driverSuspension.contactSupport")}
          </Button>
          <Button
            className="h-12 gap-2 text-sm font-bold bg-red-600 hover:bg-red-700 text-white"
            onClick={() => navigate("/support")}
          >
            <FileText className="h-4 w-4" />
            {t("driverSuspension.submitAppeal")}
          </Button>
        </div>
      </div>
    </div>
  );
}
