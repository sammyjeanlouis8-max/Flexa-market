import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, Star, TrendingUp, Zap, Award, RefreshCw,
  CheckCircle2, AlertCircle, XCircle, ChevronRight,
  Activity, MessageSquare, Package, Clock,
  ShoppingBag, BarChart2, Lock, Unlock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────
interface ScoreBreakdown {
  salesPts: number;
  reviewsPts: number;
  activityPts: number;
  ordersPts: number;
  agePts: number;
  responseRatePts: number;
  listingsPts: number;
  fraudPenalty: number;
}

interface ScoreMetrics {
  salesCount: number;
  avgRating: number;
  reviewCount: number;
  completedOrders: number;
  reportCount: number;
  listingCount: number;
  accountDays: number;
  daysSinceActive: number;
  responseRatePct: number;
}

interface CreditScore {
  score: number;
  level: "excellent" | "good" | "fair" | "poor" | "inactive";
  loanRecommendation: "auto_approve" | "fast_review" | "limited" | "declined";
  breakdown: ScoreBreakdown;
  metrics: ScoreMetrics;
  fraudFlags: string[];
  badges: string[];
  tips: string[];
  calculatedAt: string;
}

// ── Gauge ─────────────────────────────────────────────────────────────────────
function ScoreGauge({ score, level }: { score: number; level: string }) {
  const { t } = useTranslation();
  const circumference = 2 * Math.PI * 54;
  const dash = Math.max(0, (score - 200) / 650) * circumference;
  const colors: Record<string, string> = {
    excellent: "#22c55e", good: "#3b82f6", fair: "#f59e0b", poor: "#ef4444", inactive: "#94a3b8",
  };
  const color = colors[level] ?? "#94a3b8";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-40 h-40">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="12" />
          <circle
            cx="60" cy="60" r="54" fill="none"
            stroke={color} strokeWidth="12"
            strokeDasharray={`${dash} ${circumference}`}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-black text-gray-900 dark:text-white leading-none">{score}</span>
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 mt-0.5">/850</span>
        </div>
      </div>
      <div className="px-4 py-1.5 rounded-full text-sm font-bold text-white shadow-sm"
        style={{ backgroundColor: color }}>
        {t(`creditScore.level.${level}`)}
      </div>
    </div>
  );
}

// ── Breakdown bar ─────────────────────────────────────────────────────────────
function BreakdownBar({ label, pts, max, icon: Icon, color }: {
  label: string; pts: number; max: number; icon: React.ElementType; color: string;
}) {
  const pct = Math.max(0, Math.min(100, (pts / max) * 100));
  return (
    <div className="flex items-center gap-3">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{label}</span>
          <span className="text-xs font-black text-gray-900 dark:text-white ml-2 shrink-0">{pts}/{max}</span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, backgroundColor: pct >= 80 ? "#22c55e" : pct >= 50 ? "#3b82f6" : "#f59e0b" }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Badge pill ────────────────────────────────────────────────────────────────
const BADGE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  trusted_seller:    { icon: Shield,       color: "text-blue-700 dark:text-blue-300",   bg: "bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800" },
  fast_repayer:      { icon: Zap,          color: "text-green-700 dark:text-green-300", bg: "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-800" },
  top_vendor:        { icon: Award,        color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800" },
  verified_merchant: { icon: CheckCircle2, color: "text-purple-700 dark:text-purple-300", bg: "bg-purple-50 dark:bg-purple-950/40 border-purple-200 dark:border-purple-800" },
};

function BadgePill({ badge }: { badge: string }) {
  const { t } = useTranslation();
  const cfg = BADGE_CONFIG[badge] ?? { icon: Star, color: "text-gray-700", bg: "bg-gray-50 border-gray-200" };
  const Icon = cfg.icon;
  return (
    <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-semibold", cfg.bg, cfg.color)}>
      <Icon className="h-3.5 w-3.5" />
      {t(`creditScore.badges.${badge}`)}
    </div>
  );
}

// ── Tip card ──────────────────────────────────────────────────────────────────
const TIP_ICONS: Record<string, React.ElementType> = {
  increase_sales:      ShoppingBag,
  improve_reviews:     Star,
  stay_active:         Activity,
  complete_orders:     Package,
  respond_faster:      MessageSquare,
  resolve_disputes:    AlertCircle,
  reduce_spam:         XCircle,
  maintain_excellence: Award,
};

function TipCard({ tip }: { tip: string }) {
  const { t } = useTranslation();
  const Icon = TIP_ICONS[tip] ?? TrendingUp;
  return (
    <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
      </div>
      <div>
        <p className="text-xs font-bold text-blue-900 dark:text-blue-300">{t(`creditScore.tips.${tip}.title`)}</p>
        <p className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">{t(`creditScore.tips.${tip}.desc`)}</p>
      </div>
    </div>
  );
}

// ── Loan recommendation banner ────────────────────────────────────────────────
function LoanBanner({ rec }: { rec: string }) {
  const { t } = useTranslation();
  const cfg: Record<string, { icon: React.ElementType; bg: string; border: string; text: string; sub: string }> = {
    auto_approve: { icon: Zap,         bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-200 dark:border-green-800", text: "text-green-800 dark:text-green-300", sub: "text-green-700 dark:text-green-400" },
    fast_review:  { icon: RefreshCw,   bg: "bg-blue-50 dark:bg-blue-950/30",   border: "border-blue-200 dark:border-blue-800",   text: "text-blue-800 dark:text-blue-300",   sub: "text-blue-700 dark:text-blue-400" },
    limited:      { icon: AlertCircle, bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-200 dark:border-amber-800", text: "text-amber-800 dark:text-amber-300", sub: "text-amber-700 dark:text-amber-400" },
    declined:     { icon: Lock,        bg: "bg-red-50 dark:bg-red-950/30",     border: "border-red-200 dark:border-red-800",     text: "text-red-800 dark:text-red-300",     sub: "text-red-700 dark:text-red-400" },
  };
  const c = cfg[rec] ?? cfg.limited;
  const Icon = c.icon;
  return (
    <div className={cn("flex items-start gap-3 p-4 rounded-2xl border", c.bg, c.border)}>
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", c.text)} />
      <div>
        <p className={cn("text-sm font-bold", c.text)}>{t(`creditScore.loan.${rec}.title`)}</p>
        <p className={cn("text-xs mt-0.5", c.sub)}>{t(`creditScore.loan.${rec}.desc`)}</p>
      </div>
    </div>
  );
}

// ── Fraud notices ─────────────────────────────────────────────────────────────
function FraudNotice({ flags }: { flags: string[] }) {
  const { t } = useTranslation();
  if (flags.length === 0) return null;
  return (
    <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <p className="text-sm font-bold text-red-800 dark:text-red-300">{t("creditScore.fraudDetected")}</p>
      </div>
      <ul className="space-y-1">
        {flags.map(f => (
          <li key={f} className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            {t(`creditScore.fraud.${f}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-700/50">
      <Icon className="h-5 w-5 text-blue-500 mb-0.5" />
      <span className="text-lg font-black text-gray-900 dark:text-white leading-none">{value}</span>
      {sub && <span className="text-[10px] text-gray-500">{sub}</span>}
      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CreditScorePage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [data, setData] = useState<CreditScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadScore(showFeedback = false) {
    if (!token) return;
    if (showFeedback) setRefreshing(true);
    try {
      const res = await fetch("/api/credit-score/my", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("fetch failed");
      setData(await res.json());
      if (showFeedback) toast({ title: t("creditScore.refreshed") });
    } catch {
      toast({ title: t("creditScore.loadError"), variant: "destructive" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadScore(); }, [token]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8">
        <Lock className="h-12 w-12 text-gray-300" />
        <p className="text-gray-500 font-medium text-center">{t("creditScore.loginRequired")}</p>
        <button onClick={() => setLocation("/auth/login")}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors">
          {t("creditScore.loginBtn")}
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-xl w-48" />
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded-3xl" />
        <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-3xl" />
        <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded-3xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 p-8">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-gray-500 font-medium text-center">{t("creditScore.loadError")}</p>
        <button onClick={() => loadScore()} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm">
          {t("creditScore.retry")}
        </button>
      </div>
    );
  }

  const breakdown = [
    { key: "sales",        pts: data.breakdown.salesPts,        max: 20, icon: ShoppingBag,  color: "bg-orange-500" },
    { key: "reviews",      pts: data.breakdown.reviewsPts,      max: 25, icon: Star,          color: "bg-yellow-500" },
    { key: "activity",     pts: data.breakdown.activityPts,     max: 15, icon: Activity,      color: "bg-blue-500" },
    { key: "orders",       pts: data.breakdown.ordersPts,       max: 15, icon: Package,       color: "bg-green-500" },
    { key: "age",          pts: data.breakdown.agePts,          max: 10, icon: Clock,         color: "bg-purple-500" },
    { key: "responseRate", pts: data.breakdown.responseRatePts, max: 5,  icon: MessageSquare, color: "bg-teal-500" },
    { key: "listings",     pts: data.breakdown.listingsPts,     max: 10, icon: BarChart2,     color: "bg-indigo-500" },
  ];

  const calcDate = new Date(data.calculatedAt).toLocaleDateString();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">{t("creditScore.pageTitle")}</h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t("creditScore.calcAt")} {calcDate}</p>
        </div>
        <button
          onClick={() => loadScore(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 transition-colors disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {t("creditScore.refresh")}
        </button>
      </div>

      {/* Score card */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm p-6">
        <div className="flex flex-col items-center gap-4">
          <ScoreGauge score={data.score} level={data.level} />
          {data.badges.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              {data.badges.map(b => <BadgePill key={b} badge={b} />)}
            </div>
          )}
          <div className="w-full">
            <LoanBanner rec={data.loanRecommendation} />
          </div>
        </div>
      </div>

      {/* Fraud notices */}
      <FraudNotice flags={data.fraudFlags} />

      {/* 10-post threshold progress banner */}
      {data.metrics.listingCount < 10 && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center shrink-0">
              <BarChart2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-indigo-800 dark:text-indigo-300">
                {t("creditScore.listingThreshold.title")}
              </p>
              <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-0.5">
                {t("creditScore.listingThreshold.desc", { current: data.metrics.listingCount, needed: 10 })}
              </p>
              <div className="mt-2.5 space-y-1">
                <div className="h-2 bg-indigo-100 dark:bg-indigo-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                    style={{ width: `${(data.metrics.listingCount / 10) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                  {data.metrics.listingCount}/10 {t("creditScore.listingThreshold.posts")}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key metrics grid */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
        <h2 className="text-sm font-black text-gray-800 dark:text-gray-200 mb-4">{t("creditScore.metricsTitle")}</h2>
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={ShoppingBag}   label={t("creditScore.metrics.sales")}    value={data.metrics.salesCount} />
          <StatCard icon={Star}          label={t("creditScore.metrics.rating")}   value={data.metrics.reviewCount > 0 ? data.metrics.avgRating.toFixed(1) : "—"}
            sub={data.metrics.reviewCount > 0 ? `${data.metrics.reviewCount} ${t("creditScore.metrics.reviews")}` : undefined} />
          <StatCard icon={Package}       label={t("creditScore.metrics.orders")}   value={data.metrics.completedOrders} />
          <StatCard icon={Activity}      label={t("creditScore.metrics.active")}   value={data.metrics.daysSinceActive <= 1 ? t("creditScore.metrics.today") : `${data.metrics.daysSinceActive}j`} />
          <StatCard icon={MessageSquare} label={t("creditScore.metrics.response")} value={`${data.metrics.responseRatePct}%`} />
          <StatCard icon={Clock}         label={t("creditScore.metrics.age")}      value={data.metrics.accountDays} sub={t("creditScore.metrics.days")} />
        </div>
      </div>

      {/* Score breakdown */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
        <h2 className="text-sm font-black text-gray-800 dark:text-gray-200 mb-4">{t("creditScore.breakdownTitle")}</h2>
        <div className="space-y-4">
          {breakdown.map(b => (
            <BreakdownBar
              key={b.key}
              label={t(`creditScore.breakdown.${b.key}`)}
              pts={b.pts} max={b.max} icon={b.icon} color={b.color}
            />
          ))}
          {data.breakdown.fraudPenalty > 0 && (
            <div className="flex items-center gap-3 pt-2 border-t border-dashed border-red-200 dark:border-red-800">
              <div className="w-8 h-8 rounded-lg bg-red-500 flex items-center justify-center shrink-0">
                <XCircle className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">{t("creditScore.breakdown.penalty")}</span>
                  <span className="text-xs font-black text-red-600 dark:text-red-400">−{data.breakdown.fraudPenalty}</span>
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-700">
            <span className="text-sm font-black text-gray-800 dark:text-gray-200">{t("creditScore.totalScore")}</span>
            <span className="text-lg font-black text-blue-600">{data.score}/850</span>
          </div>
        </div>
      </div>

      {/* Tips */}
      {data.tips.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
          <h2 className="text-sm font-black text-gray-800 dark:text-gray-200 mb-4">{t("creditScore.tipsTitle")}</h2>
          <div className="space-y-3">
            {data.tips.map(tip => <TipCard key={tip} tip={tip} />)}
          </div>
        </div>
      )}

      {/* CTA to loan page */}
      <button
        onClick={() => setLocation("/loans")}
        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-2xl shadow-md transition-all active:scale-[0.98]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
            <Unlock className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold">{t("creditScore.loanCta.title")}</p>
            <p className="text-xs text-blue-200">{t("creditScore.loanCta.sub")}</p>
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-blue-200" />
      </button>

      {/* Score levels legend */}
      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
        <h2 className="text-sm font-black text-gray-800 dark:text-gray-200 mb-4">{t("creditScore.levelsTitle")}</h2>
        <div className="space-y-2">
          {[
            { range: "780–850", level: "excellent", dot: "bg-green-500" },
            { range: "600–779", level: "good",      dot: "bg-blue-500" },
            { range: "450–599", level: "fair",       dot: "bg-amber-500" },
            { range: "200–449", level: "poor",       dot: "bg-red-500" },
            { range: "150–199", level: "inactive",   dot: "bg-gray-400" },
          ].map(l => (
            <div key={l.level} className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full shrink-0", l.dot)} />
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-16">{l.range}</span>
              <span className="text-xs text-gray-600 dark:text-gray-400">{t(`creditScore.levelDesc.${l.level}`)}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
