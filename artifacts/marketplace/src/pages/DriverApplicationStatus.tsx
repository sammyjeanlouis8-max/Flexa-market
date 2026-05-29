import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/contexts/auth";
import {
  CheckCircle, Clock, XCircle, AlertCircle, Truck,
  ArrowLeft, ChevronRight, Star, Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DriverApplication {
  id: number;
  status: string;
  firstName: string;
  lastName: string;
  submittedAt: string;
  adminNote?: string | null;
  rejectionReason?: string | null;
  city?: string | null;
  country?: string | null;
  vehicleType?: string | null;
  reviewedAt?: string | null;
  updatedAt?: string | null;
}

interface Driver {
  id: number;
  status: string;
  rating: number;
  deliveryCount: number;
  earningsTotal: number;
}

interface ApplicationResponse {
  application: DriverApplication | null;
  driver: Driver | null;
}

function formatDate(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

export default function DriverApplicationStatus() {
  const [, navigate] = useLocation();
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [data, setData] = useState<ApplicationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { navigate("/login"); return; }
    apiFetch<ApplicationResponse>("/api/driver/my-application")
      .then((d) => setData(d))
      .catch(() => setError(t("driverApply.errorSubmit")))
      .finally(() => setLoading(false));
  }, [user, navigate, t]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-4 px-6">
        <XCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-500 text-center">{error}</p>
        <button onClick={() => navigate("/")}
          className="px-6 py-2 rounded-xl bg-orange-500 text-white font-bold text-sm">
          {t("driverApply.btnHome")}
        </button>
      </div>
    );
  }

  const app = data?.application;
  const driver = data?.driver;

  if (!app) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col items-center justify-center gap-6 px-6">
        <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <Truck className="h-10 w-10 text-gray-400" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-black text-gray-900 dark:text-white">{t("driverApply.statusNoApp")}</h2>
          <p className="text-gray-500 text-sm mt-1">{t("driverApply.statusNoAppDesc")}</p>
        </div>
        <button onClick={() => navigate("/delivery/apply")}
          className="w-full max-w-xs h-12 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm transition-all active:scale-[0.98]">
          {t("driverApply.landingStart")}
        </button>
        <button onClick={() => navigate("/")}
          className="text-sm text-gray-400 hover:text-gray-600">
          {t("driverApply.btnHome")}
        </button>
      </div>
    );
  }

  const status = app.status;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
          <ArrowLeft className="h-4 w-4 text-gray-600 dark:text-gray-300" />
        </button>
        <h1 className="font-black text-gray-900 dark:text-white text-base">{t("driverApply.statusPageTitle")}</h1>
      </div>

      <div className="max-w-md mx-auto px-4 pt-6 space-y-4">

        {/* Status card */}
        <StatusCard status={status} app={app} driver={driver ?? null} t={t} locale={i18n.language} />

        {/* Application ID */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl px-4 py-3 flex items-center justify-between border border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">{t("driverApply.successAppId")}</p>
            <p className="font-black text-gray-900 dark:text-white text-lg mt-0.5">#{app.id}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">{t("driverApply.pendingSubmittedOn")}</p>
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mt-0.5">
              {formatDate(app.submittedAt, i18n.language)}
            </p>
          </div>
        </div>

        {/* Rejection / changes reason */}
        {(status === "rejected" || status === "needs_changes") && (app.rejectionReason ?? app.adminNote) && (
          <div className={cn(
            "rounded-2xl px-4 py-4 border",
            status === "rejected"
              ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900"
              : "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900"
          )}>
            <p className={cn(
              "text-xs font-bold uppercase tracking-widest mb-2",
              status === "rejected" ? "text-red-500" : "text-amber-500"
            )}>
              {status === "rejected" ? t("driverApply.rejectedAdminNote") : t("driverApply.changesReason")}
            </p>
            <p className={cn(
              "text-sm leading-relaxed",
              status === "rejected" ? "text-red-700 dark:text-red-300" : "text-amber-700 dark:text-amber-300"
            )}>
              {app.rejectionReason ?? app.adminNote}
            </p>
          </div>
        )}

        {/* Approved driver stats */}
        {status === "approved" && driver && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-bold">{t("driverApply.statDeliveries")}</p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-gray-100 dark:divide-gray-800">
              <StatCell icon={<Package className="h-4 w-4" />} label={t("driverApply.approvedDeliveries")} value={String(driver.deliveryCount)} />
              <StatCell icon={<Star className="h-4 w-4" />} label={t("driverApply.approvedRating")} value={driver.rating ? driver.rating.toFixed(1) : "—"} />
              <StatCell icon={<span className="text-sm font-bold">$</span>} label={t("driverApply.approvedEarnings")} value={driver.earningsTotal > 0 ? `$${driver.earningsTotal.toFixed(0)}` : "$0"} />
            </div>
          </div>
        )}

        {/* Next steps for rejected */}
        {status === "rejected" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-4 py-4">
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">{t("driverApply.rejectedNext")}</p>
            <div className="space-y-2">
              {[
                t("driverApply.rejectedStep1"),
                t("driverApply.rejectedStep2"),
                t("driverApply.rejectedStep3"),
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{step}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending timeline */}
        {status === "pending" && (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 px-4 py-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-bold mb-4">{t("driverApply.pendingSummary")}</p>
            <div className="space-y-4">
              {[
                { label: t("driverApply.pendingStep1"), sub: t("driverApply.pendingStep1Sub"), done: true },
                { label: t("driverApply.pendingStep2"), sub: t("driverApply.pendingStep2Sub"), done: false },
                { label: t("driverApply.pendingStep3"), sub: t("driverApply.pendingStep3Sub"), done: false },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    step.done ? "bg-green-500" : "bg-gray-100 dark:bg-gray-800"
                  )}>
                    {step.done
                      ? <CheckCircle className="h-4 w-4 text-white" />
                      : <span className="text-xs font-bold text-gray-400">{i + 1}</span>}
                  </div>
                  <div>
                    <p className={cn("text-sm font-semibold", step.done ? "text-green-700 dark:text-green-400" : "text-gray-700 dark:text-gray-200")}>
                      {step.label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{step.sub}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTA buttons */}
        <div className="space-y-3 pt-2">
          {status === "approved" && (
            <button onClick={() => navigate("/delivery/deliveries")}
              className="w-full h-13 rounded-2xl bg-green-600 hover:bg-green-700 text-white font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-green-200 dark:shadow-green-900/30 py-3.5">
              {t("driverApply.approvedCta")} <ChevronRight className="h-4 w-4" />
            </button>
          )}
          {(status === "rejected" || status === "needs_changes") && (
            <button onClick={() => navigate("/delivery/apply")}
              className="w-full h-13 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-orange-200 dark:shadow-orange-900/30 py-3.5">
              {t("driverApply.landingStart")} <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => navigate("/")}
            className="w-full py-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
            {t("driverApply.btnHome")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusCard({ status, app, driver, t, locale }: {
  status: string;
  app: DriverApplication;
  driver: Driver | null;
  t: (key: string) => string;
  locale: string;
}) {
  const config: Record<string, {
    bg: string; icon: React.ReactNode; badge: string; badgeBg: string;
    title: string; subtitle: string;
  }> = {
    pending: {
      bg: "from-blue-600 to-blue-800",
      icon: <Clock className="h-10 w-10 text-white" />,
      badge: "🔍 " + t("driverApply.pendingTitle"),
      badgeBg: "bg-blue-500/30",
      title: t("driverApply.pendingTitle"),
      subtitle: t("driverApply.pendingSubtitle"),
    },
    approved: {
      bg: "from-green-600 to-emerald-700",
      icon: <CheckCircle className="h-10 w-10 text-white" />,
      badge: "✅ " + t("driverApply.statusActiveBadge"),
      badgeBg: "bg-green-500/30",
      title: t("driverApply.approvedTitle"),
      subtitle: t("driverApply.approvedSubtitle"),
    },
    rejected: {
      bg: "from-red-600 to-red-800",
      icon: <XCircle className="h-10 w-10 text-white" />,
      badge: "❌ " + t("driverApply.rejectedTitle"),
      badgeBg: "bg-red-500/30",
      title: t("driverApply.rejectedTitle"),
      subtitle: t("driverApply.rejectedDesc"),
    },
    needs_changes: {
      bg: "from-amber-500 to-orange-600",
      icon: <AlertCircle className="h-10 w-10 text-white" />,
      badge: "⚠️ " + t("driverApply.changesTitle"),
      badgeBg: "bg-amber-500/30",
      title: t("driverApply.changesTitle"),
      subtitle: t("driverApply.changesSubtitle"),
    },
  };

  const cfg = config[status] ?? config["pending"];

  return (
    <div className={cn("rounded-3xl bg-gradient-to-br p-6 text-white shadow-xl", cfg.bg)}>
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center", cfg.badgeBg)}>
          {cfg.icon}
        </div>
        {status === "approved" && driver && (
          <div className="text-right">
            <p className="text-white/60 text-xs uppercase tracking-widest">Driver ID</p>
            <p className="text-white font-black text-xl">#{driver.id}</p>
          </div>
        )}
      </div>

      <div className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold mb-3", cfg.badgeBg)}>
        {cfg.badge}
      </div>

      <h2 className="text-xl font-black leading-tight">{cfg.title}</h2>
      <p className="text-white/70 text-sm mt-1 leading-relaxed">{cfg.subtitle}</p>

      <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-2">
        <Truck className="h-3.5 w-3.5 text-white/50" />
        <span className="text-white/60 text-xs">{app.firstName} {app.lastName}</span>
        {app.city && <span className="text-white/40 text-xs">· {app.city}</span>}
      </div>
    </div>
  );
}

function StatCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center py-4 gap-1">
      <div className="text-gray-400">{icon}</div>
      <p className="text-lg font-black text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
