import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { ArrowLeft, Clock, CheckCircle, TrendingUp, Info, Loader2 } from "lucide-react";

interface CommissionSummary {
  currentMonth: string;
  pendingAmount: number;
  pendingCount: number;
  availableAmount: number;
  availableCount: number;
  history: {
    id: number;
    commissionAmount: number;
    purchaseAmount: number;
    cycleMonth: string;
    status: string;
    isAvailable: boolean;
    createdAt: string;
  }[];
}

export default function CommissionPromo() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [, navigate] = useLocation();

  const [data, setData] = useState<CommissionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const authHeader = token ? `Bearer ${token}` : "";

  const load = () => {
    setLoading(true);
    fetch("/api/promo-purchase-commissions/my", {
      headers: { Authorization: authHeader },
    })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const handleWithdraw = async () => {
    if (!data || data.availableAmount <= 0 || withdrawing) return;
    setWithdrawing(true);
    try {
      const res = await fetch("/api/promo-purchase-commissions/withdraw", {
        method: "POST",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
      });
      const json = await res.json();
      if (!res.ok) { showToast(json.error || t("commissionPromo.withdrawError"), false); return; }
      showToast(t("commissionPromo.withdrawSuccess", { amount: json.withdrawn.toFixed(2) }), true);
      load();
    } catch {
      showToast(t("commissionPromo.withdrawError"), false);
    } finally {
      setWithdrawing(false);
    }
  };

  const formatMonth = (ym: string) => {
    const [year, month] = ym.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-slate-950/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="p-2 rounded-full hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-bold text-lg leading-tight">{t("commissionPromo.title")}</h1>
          <p className="text-xs text-slate-400">{t("commissionPromo.subtitle")}</p>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all ${toast.ok ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
          {toast.msg}
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* How it works */}
        <div className="bg-slate-900 rounded-2xl p-4 flex gap-3">
          <Info size={18} className="text-orange-400 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-slate-300 leading-relaxed">
            {t("commissionPromo.howItWorks")}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={32} className="animate-spin text-orange-400" />
          </div>
        ) : (
          <>
            {/* ─── Card 1: Pending (current month) ─── */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-orange-600 to-amber-500 p-5 shadow-lg">
              <div className="absolute top-3 right-3 opacity-20">
                <Clock size={64} />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <Clock size={16} className="text-white/80" />
                <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">
                  {t("commissionPromo.pendingLabel")}
                </span>
              </div>
              <div className="text-4xl font-extrabold text-white mb-1">
                ${(data?.pendingAmount ?? 0).toFixed(2)}
              </div>
              <p className="text-sm text-white/75">
                {t("commissionPromo.pendingCount", { count: data?.pendingCount ?? 0 })}
              </p>
              <div className="mt-4 bg-white/20 rounded-xl px-3 py-2 text-xs text-white/90">
                🔒 {t("commissionPromo.pendingLocked", { month: formatMonth(data?.currentMonth ?? new Date().toISOString().slice(0, 7)) })}
              </div>
            </div>

            {/* ─── Card 2: Available (past months) ─── */}
            <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-700 to-teal-600 p-5 shadow-lg">
              <div className="absolute top-3 right-3 opacity-20">
                <CheckCircle size={64} />
              </div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle size={16} className="text-white/80" />
                <span className="text-xs font-semibold text-white/80 uppercase tracking-wide">
                  {t("commissionPromo.availableLabel")}
                </span>
              </div>
              <div className="text-4xl font-extrabold text-white mb-1">
                ${(data?.availableAmount ?? 0).toFixed(2)}
              </div>
              <p className="text-sm text-white/75">
                {t("commissionPromo.availableCount", { count: data?.availableCount ?? 0 })}
              </p>
              <button
                onClick={handleWithdraw}
                disabled={(data?.availableAmount ?? 0) <= 0 || withdrawing}
                className="mt-4 w-full bg-white text-emerald-800 font-bold py-3 rounded-xl text-sm transition-all hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {withdrawing ? (
                  <><Loader2 size={16} className="animate-spin" /> {t("commissionPromo.withdrawing")}</>
                ) : (
                  <>{t("commissionPromo.withdraw")} {(data?.availableAmount ?? 0) > 0 ? `$${data!.availableAmount.toFixed(2)}` : ""}</>
                )}
              </button>
            </div>

            {/* ─── History ─── */}
            <div>
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <TrendingUp size={14} /> {t("commissionPromo.history")}
              </h2>

              {(data?.history ?? []).length === 0 ? (
                <div className="text-center py-10 text-slate-500">
                  <div className="text-4xl mb-3">💸</div>
                  <p className="text-sm">{t("commissionPromo.noHistory")}</p>
                  <p className="text-xs text-slate-600 mt-1">{t("commissionPromo.noHistoryHint")}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(data?.history ?? []).map(row => (
                    <div
                      key={row.id}
                      className="bg-slate-900 rounded-xl px-4 py-3 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">
                          +${row.commissionAmount.toFixed(2)}
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            {t("commissionPromo.onPurchase", { amount: row.purchaseAmount.toFixed(2) })}
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {formatMonth(row.cycleMonth)} · {new Date(row.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                        row.status === "withdrawn"
                          ? "bg-slate-700 text-slate-400"
                          : row.isAvailable
                          ? "bg-emerald-900/60 text-emerald-400"
                          : "bg-orange-900/60 text-orange-400"
                      }`}>
                        {row.status === "withdrawn"
                          ? t("commissionPromo.statusWithdrawn")
                          : row.isAvailable
                          ? t("commissionPromo.statusAvailable")
                          : t("commissionPromo.statusPending")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
