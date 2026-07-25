import { useState, useEffect, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Lock, CheckCircle2, Calendar, TrendingUp, Star, Truck,
  Shield, ShieldCheck, Banknote, Clock, Zap, Gift, Phone, Upload, ChevronRight,
  AlertCircle, XCircle, Info, RefreshCcw, ArrowRight, RotateCcw,
  Wallet, CheckCheck, AlertTriangle, ChevronDown, ChevronUp
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface EligibilityData {
  eligible: boolean;
  countryEligible: boolean;
  country: string;
  accountCreatedAt?: string;
  daysOnPlatform: number;
  daysRemaining: number;
  minDays: number;
  interestRate: number;
  minAmount: number;
  maxAmount: number;
  isSuperAdmin?: boolean;
  isAdminUser?: boolean;
  adminWillAutoReject?: boolean;
  listingEligible?: boolean;
  activeListingCount?: number;
  minListings?: number;
  metrics: {
    salesCount: number;
    activeListingCount: number;
    avgRating: number;
    reviewCount: number;
    deliverySuccessRate: number;
    reportCount: number;
  };
  existingApplication: {
    id: number;
    status: string;
    amountRequested: string;
    termMonths: number;
    createdAt: string;
    reviewerNote: string | null;
    approvedAt?: string | null;
    completedAt?: string | null;
    totalRepaymentUsd?: string | null;
    amountPaidUsd?: string | null;
  } | null;
}

const ELIGIBLE_COUNTRIES = ["Haiti", "Dominican Republic"];

// ── Loan simulator ─────────────────────────────────────────────────────────────
function calcRepayment(principal: number, months: number, rate: number) {
  const total = principal * (1 + rate);
  const monthly = total / months;
  return { total: parseFloat(total.toFixed(2)), monthly: parseFloat(monthly.toFixed(2)), interest: parseFloat((total - principal).toFixed(2)) };
}

// ── Upload helper ──────────────────────────────────────────────────────────────
async function uploadFile(file: File, token: string): Promise<string> {
  const presignRes = await fetch("/api/s3-upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  if (!presignRes.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, publicUrl } = await presignRes.json();
  const putRes = await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
  if (!putRes.ok) throw new Error("Upload failed");
  return publicUrl as string;
}

// ── Installment type ───────────────────────────────────────────────────────────
interface Installment {
  id: number;
  loan_id: number;
  installment_number: number;
  due_date: string;
  amount_usd: string;
  status: string;
  paid_at: string | null;
  retry_count: number;
  last_retry_at: string | null;
}

// ── Status badge helper ────────────────────────────────────────────────────────
type AppStatusEntry = { label: string; color: string; icon: React.ElementType; desc: string };
function getAppStatus(t: (k: string) => string): Record<string, AppStatusEntry> {
  return {
    pending_review:     { label: t("loanPage.statusPendingReview"),     color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",   icon: Clock,       desc: t("loanPage.descPendingReview") },
    under_verification: { label: t("loanPage.statusUnderVerification"), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",         icon: Info,        desc: t("loanPage.descUnderVerification") },
    approved:           { label: t("loanPage.statusApproved"),          color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300", icon: CheckCircle2, desc: t("loanPage.descApproved") },
    active:             { label: t("loanPage.statusActive"),            color: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300", icon: Wallet,      desc: t("loanPage.descActive") },
    completed:          { label: t("loanPage.statusCompleted"),         color: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",         icon: CheckCheck,  desc: t("loanPage.descCompleted") },
    rejected:           { label: t("loanPage.statusRejected"),          color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",             icon: XCircle,     desc: t("loanPage.descRejected") },
    auto_rejected:      { label: t("loanPage.statusAutoRejected"),      color: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",             icon: XCircle,     desc: t("loanPage.descAutoRejected") },
    more_info_required: { label: t("loanPage.statusMoreInfo"),          color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300", icon: AlertCircle, desc: t("loanPage.descMoreInfo") },
  };
}

const INST_COLOR: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  paid:    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed:  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  overdue: "bg-rose-200 text-rose-900 dark:bg-rose-900/40 dark:text-rose-300",
};
function getInstLabel(t: (k: string) => string): Record<string, string> {
  return {
    pending: t("loanPage.instPending"),
    paid:    t("loanPage.instPaid"),
    failed:  t("loanPage.instFailed"),
    overdue: t("loanPage.instOverdue"),
  };
}

// ── SVG circular ring unit — memoized so only seconds forces a redraw ──────────
const RingUnit = memo(function RingUnit({
  value, max, label, gradId,
}: { value: number; max: number; label: string; gradId: string }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  const pct  = max > 0 ? Math.min(1, value / max) : 0;
  const offset = circ * (1 - pct);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-[62px] h-[62px]">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 60 60">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7dd3fc" />
              <stop offset="100%" stopColor="#0ea5e9" />
            </linearGradient>
          </defs>
          <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4.5" />
          <circle
            cx="30" cy="30" r={r} fill="none"
            stroke={`url(#${gradId})`} strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={`${circ}`}
            strokeDashoffset={`${offset}`}
            style={{ transition: "stroke-dashoffset 0.85s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[17px] font-black text-white tabular-nums leading-none">
            {String(value).padStart(2, "0")}
          </span>
        </div>
      </div>
      <p className="text-[9px] font-bold text-sky-200 uppercase tracking-widest">{label}</p>
    </div>
  );
});

// ── Compute countdown snapshot from eligibility data (runs synchronously) ──────
function computeUnlockAt(eligData: EligibilityData): number {
  const minDays  = eligData.minDays ?? 90;
  const createdMs = eligData.accountCreatedAt
    ? new Date(eligData.accountCreatedAt).getTime()
    : NaN;
  if (!isNaN(createdMs)) return createdMs + minDays * 24 * 60 * 60 * 1000;
  // Fall back: use server-supplied daysRemaining (guard against NaN)
  const dr = Number.isFinite(eligData.daysRemaining) ? eligData.daysRemaining : 0;
  return Date.now() + dr * 24 * 60 * 60 * 1000;
}

function computeTimeLeft(eligData: EligibilityData | null): {
  days: number; hours: number; minutes: number; seconds: number; total: number;
} | null {
  if (!eligData) return null;
  const unlockAt = computeUnlockAt(eligData);
  if (!Number.isFinite(unlockAt)) return null;
  const diff    = Math.max(0, unlockAt - Date.now());
  const days    = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours   = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  return { days, hours, minutes, seconds, total: diff };
}

// ── Live countdown for locked eligibility ──────────────────────────────────────
function LockedCountdown({
  eligData,
  progressPct,
}: {
  eligData: EligibilityData | null;
  progressPct: number;
}) {
  const { t } = useTranslation();
  // Initialize immediately from eligData so there is never a "—" flash
  const [timeLeft, setTimeLeft] = useState(() => computeTimeLeft(eligData));

  useEffect(() => {
    if (!eligData) return;
    function tick() { setTimeLeft(computeTimeLeft(eligData)); }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [eligData?.accountCreatedAt, eligData?.daysRemaining, eligData?.minDays]);

  const maxDays = eligData?.minDays ?? 90;

  return (
    <div className="space-y-4">
      {/* Progress bar row */}
      <div className="px-5 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">
            {t("loanPage.lockedProgress", { done: eligData?.daysOnPlatform ?? 0, total: maxDays })}
          </span>
          <span className="font-semibold text-violet-600">{Math.round(progressPct)}%</span>
        </div>
        <div className="h-2.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-sky-400 to-sky-600 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Live countdown — sky blue fintech card with SVG rings */}
      <div className="mx-5 rounded-2xl overflow-hidden shadow-lg">
        <div className="px-4 pt-4 pb-5" style={{ background: "linear-gradient(135deg, #0369a1 0%, #0284c7 40%, #38bdf8 100%)" }}>
          <p className="text-center text-[10px] font-bold text-sky-100 mb-4 uppercase tracking-[0.18em]">
            ⏳ {t("loanPage.countdownLabel")}
          </p>

          {timeLeft && timeLeft.total > 0 ? (
            <div className="grid grid-cols-4 gap-2 justify-items-center">
              <RingUnit value={timeLeft.days}    max={maxDays} label={t("loanPage.cdDays")}    gradId="ring-d" />
              <RingUnit value={timeLeft.hours}   max={23}      label={t("loanPage.cdHours")}   gradId="ring-h" />
              <RingUnit value={timeLeft.minutes} max={59}      label={t("loanPage.cdMinutes")} gradId="ring-m" />
              <RingUnit value={timeLeft.seconds} max={59}      label={t("loanPage.cdSeconds")} gradId="ring-s" />
            </div>
          ) : (
            <div className="text-center py-2">
              <p className="text-sm font-bold text-emerald-300">
                {t("loanPage.timeComplete")}
              </p>
            </div>
          )}

          {/* When time is done but listing count is still blocking — show days-left only if counting */}
          {timeLeft && timeLeft.total > 0 && eligData?.listingEligible === false && (
            <p className="text-center text-[10px] text-sky-200 mt-2">
              {t("loanPage.listingProgressLabel", {
                done: eligData?.activeListingCount ?? 0,
                total: eligData?.minListings ?? 10,
              })}
            </p>
          )}
        </div>
      </div>

      {/* Listing progress blocker — visible whenever listing count is insufficient */}
      {eligData?.listingEligible === false && (
        <div className="mx-5 rounded-2xl overflow-hidden shadow-md">
          <div className="px-4 py-4" style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 60%, #4c1d95 100%)" }}>
            <p className="text-center text-[10px] font-bold text-purple-200 mb-3 uppercase tracking-[0.18em]">
              {t("loanPage.listingBlockerTitle")}
            </p>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-purple-200">
                {t("loanPage.listingProgressLabel", {
                  done: eligData?.activeListingCount ?? 0,
                  total: eligData?.minListings ?? 10,
                })}
              </span>
              <span className="text-xs font-bold text-white">
                {Math.round(Math.min(100, ((eligData?.activeListingCount ?? 0) / (eligData?.minListings ?? 10)) * 100))}%
              </span>
            </div>
            <div className="h-2.5 bg-purple-900/60 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-purple-400 to-violet-300 rounded-full transition-all duration-700"
                style={{ width: `${Math.min(100, ((eligData?.activeListingCount ?? 0) / (eligData?.minListings ?? 10)) * 100)}%` }}
              />
            </div>
            <p className="text-center text-xs text-purple-200">
              {t("loanPage.listingBlockerDesc", {
                need: Math.max(0, (eligData?.minListings ?? 10) - (eligData?.activeListingCount ?? 0)),
              })}
            </p>
          </div>
        </div>
      )}

      {/* Tip banner */}
      <div className="mx-5 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-300">
        💡 {t("loanPage.lockedTip")}
      </div>
    </div>
  );
}

// ── Active loan dashboard component ───────────────────────────────────────────
function ActiveLoanDashboard({
  app, installments, onRetry, retrying,
}: {
  app: EligibilityData["existingApplication"] & {};
  installments: Installment[];
  onRetry: (instId: number) => void;
  retrying: number | null;
}) {
  const { t } = useTranslation();
  const INST_LABEL = getInstLabel(t);
  const total = parseFloat((app as any).totalRepaymentUsd ?? "0");
  const paid  = parseFloat((app as any).amountPaidUsd ?? "0");
  const pct   = total > 0 ? Math.round((paid / total) * 100) : 0;
  const remaining = Math.max(0, total - paid);
  const isCompleted = (app as any).status === "completed";
  const [showAll, setShowAll] = useState(false);

  const nextInst = installments.find(i => i.status !== "paid");
  const failedInsts = installments.filter(i => i.status === "failed" || i.status === "overdue");
  const displayedInsts = showAll ? installments : installments.slice(0, 4);

  const daysUntil = nextInst
    ? Math.ceil((new Date(nextInst.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  // SVG circle progress
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = circ - (pct / 100) * circ;

  return (
    <div className="space-y-4">
      {isCompleted && (
        <div className="rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 p-6 text-white text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h3 className="text-xl font-extrabold mb-1">{t("loanPage.congratsTitle")}</h3>
          <p className="text-white/90 text-sm">{t("loanPage.congratsDesc")}</p>
        </div>
      )}

      {/* Progress ring + stats */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-5">
          <div className="shrink-0 relative">
            <svg width="120" height="120" className="-rotate-90">
              <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10"
                className="text-muted/30" />
              <circle cx="60" cy="60" r={r} fill="none"
                stroke={isCompleted ? "#14b8a6" : "#7c3aed"}
                strokeWidth="10" strokeDasharray={circ}
                strokeDashoffset={dash} strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 0.8s ease" }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-black">{pct}%</span>
              <span className="text-[10px] text-muted-foreground">{t("loanPage.completed")}</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">{t("loanPage.amountBorrowed")}</p>
              <p className="font-bold text-lg">${parseFloat((app as any).amountRequested).toFixed(2)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-2.5">
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">{t("loanPage.paid")}</p>
                <p className="font-bold text-emerald-700 dark:text-emerald-300">${paid.toFixed(2)}</p>
              </div>
              <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-2.5">
                <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">{t("loanPage.remaining")}</p>
                <p className="font-bold text-violet-700 dark:text-violet-300">${remaining.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Next payment */}
        {nextInst && !isCompleted && (
          <div className="mt-4 flex items-center gap-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3">
            <Calendar className="h-5 w-5 text-violet-500 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">{t("loanPage.nextPayment")}</p>
              <p className="font-semibold text-sm">
                ${parseFloat(nextInst.amount_usd).toFixed(2)} —{" "}
                {new Date(nextInst.due_date).toLocaleDateString("fr-HT", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <div className={`text-xs font-bold px-2 py-1 rounded-full ${
              (daysUntil ?? 0) < 0 ? "bg-red-100 text-red-700" :
              (daysUntil ?? 0) <= 5 ? "bg-orange-100 text-orange-700" :
              "bg-emerald-100 text-emerald-700"
            }`}>
              {(daysUntil ?? 0) < 0 ? t("loanPage.daysLate", { n: Math.abs(daysUntil ?? 0) }) :
               (daysUntil ?? 0) === 0 ? t("loanPage.today") : t("loanPage.daysShort", { n: daysUntil })}
            </div>
          </div>
        )}
      </div>

      {/* Failed payment alert */}
      {failedInsts.length > 0 && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="font-semibold text-sm">{t("loanPage.failedCount", { count: failedInsts.length })}</p>
          </div>
          {failedInsts.map(inst => (
            <div key={inst.id} className="flex items-center justify-between gap-3 bg-white/60 dark:bg-white/5 rounded-xl p-3">
              <div>
                <p className="text-sm font-semibold">{t("loanPage.installmentNum", { n: inst.installment_number })} — ${parseFloat(inst.amount_usd).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  {t("loanPage.due")}: {new Date(inst.due_date).toLocaleDateString("fr-HT")}
                  {inst.retry_count > 0 && ` · ${inst.retry_count} ${t("loanPage.attempts")}`}
                </p>
              </div>
              <Button size="sm" variant="destructive" className="shrink-0 h-8 text-xs"
                disabled={retrying === inst.id}
                onClick={() => onRetry(inst.id)}>
                {retrying === inst.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><RotateCcw className="h-3 w-3 mr-1" />{t("loanPage.retry")}</>}
              </Button>
            </div>
          ))}
          <p className="text-xs text-red-600 dark:text-red-400">💡 {t("loanPage.rechargeHint")}</p>
        </div>
      )}

      {/* Installment table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h4 className="font-bold text-sm">{t("loanPage.allInstallments", { count: installments.length })}</h4>
        </div>
        <div className="divide-y divide-border">
          {displayedInsts.map(inst => {
            const statusColor = INST_COLOR[inst.status] ?? INST_COLOR.pending;
            const statusLabel = INST_LABEL[inst.status] ?? inst.status;
            return (
              <div key={inst.id} className="flex items-center gap-3 px-4 py-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  inst.status === "paid" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {inst.installment_number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">${parseFloat(inst.amount_usd).toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground">
                    {inst.status === "paid" && inst.paid_at
                      ? `${t("loanPage.paidOn")} ${new Date(inst.paid_at).toLocaleDateString("fr-HT")}`
                      : `${t("loanPage.dueOn")} ${new Date(inst.due_date).toLocaleDateString("fr-HT")}`}
                  </p>
                </div>
                <Badge className={`text-xs border-0 shrink-0 ${statusColor}`}>{statusLabel}</Badge>
              </div>
            );
          })}
        </div>
        {installments.length > 4 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="w-full py-2.5 text-xs text-primary font-medium flex items-center justify-center gap-1 hover:bg-muted/30 transition-colors border-t border-border"
          >
            {showAll ? <><ChevronUp className="h-3 w-3" />{t("loanPage.showLess")}</> : <><ChevronDown className="h-3 w-3" />{t("loanPage.seeAllInstallments", { count: installments.length })}</>}
          </button>
        )}
      </div>

      {/* Auto-payment info */}
      {!isCompleted && (
        <div className="bg-violet-50 dark:bg-violet-950/30 rounded-2xl p-4 text-sm text-violet-800 dark:text-violet-300">
          <p className="font-semibold mb-1">🤖 {t("loanPage.autoPayTitle")}</p>
          <p className="text-xs opacity-80">{t("loanPage.autoPayDesc")}</p>
        </div>
      )}
    </div>
  );
}

// ── Multi-step form state ──────────────────────────────────────────────────────
interface FormData {
  amountRequested: number;
  termMonths: number;
  fullName: string;
  dob: string;
  whatsapp: string;
  businessPhone: string;
  emergencyPhone: string;
  address: string;
  city: string;
  businessName: string;
  businessCategory: string;
  businessDescription: string;
  businessAgeYears: string;
  monthlySalesUsd: string;
  identityDoc: string;
  businessPhotos: string[];
  productPhotos: string[];
  businessDocs: string[];
  facebookUrl: string;
  tiktokUrl: string;
  instagramUrl: string;
}

const BUSINESS_CATEGORIES = [
  "Kòmès Jeneral", "Restorasyon / Manje", "Elektwoniks", "Rad ak Chosèt",
  "Bote ak Swen", "Materyèl Konstriksyon", "Agrikilti", "Transpò",
  "Sèvis Pwofesyonèl", "Santé ak Famakopeya", "Edikasyon", "Lòt",
];

// ── File upload picker component ───────────────────────────────────────────────
function FileUploadPicker({
  label, multiple = false, onUploaded, token, existing = [],
}: {
  label: string; multiple?: boolean; onUploaded: (urls: string[]) => void;
  token: string; existing?: string[];
}) {
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [urls, setUrls] = useState<string[]>(existing);
  const ref = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const url = await uploadFile(file, token);
        newUrls.push(url);
      }
      const combined = multiple ? [...urls, ...newUrls] : newUrls;
      setUrls(combined);
      onUploaded(combined);
    } catch {
      // silently ignore — user sees no preview
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <div
        onClick={() => ref.current?.click()}
        className="border-2 border-dashed border-border rounded-xl p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> {t("loanPage.uploading")}
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">
            <Upload className="h-5 w-5 mx-auto mb-1 opacity-50" />
            <p>{urls.length > 0 ? t("loanPage.filesUploaded", { count: urls.length }) : t("loanPage.clickToChoose")}</p>
          </div>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*,.pdf" multiple={multiple} className="hidden" onChange={e => handleFiles(e.target.files)} />
      {urls.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {urls.map((u, i) => (
            <img key={i} src={u} alt="" className="h-14 w-14 object-cover rounded-lg border border-border" />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Credit Score mini-widget (shown at top of LoanPage) ───────────────────────
interface MiniScore {
  score: number;
  level: string;
  loanRecommendation: string;
  badges: string[];
}

function CreditScoreWidget({ token, onViewFull }: { token: string | null; onViewFull: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<MiniScore | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch("/api/credit-score/my", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="h-9 bg-muted/60 animate-pulse" />
        <div className="px-5 py-4 flex items-center gap-5">
          <div className="w-28 h-28 rounded-full bg-muted/60 animate-pulse shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-5 w-20 rounded-full bg-muted/60 animate-pulse" />
            <div className="h-4 w-36 rounded bg-muted/60 animate-pulse" />
            <div className="h-3 w-48 rounded bg-muted/60 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <button
        onClick={onViewFull}
        className="w-full text-left rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow active:scale-[0.99]"
      >
        <div className="bg-gradient-to-r from-gray-500 to-gray-600 px-4 py-2.5 flex items-center justify-between">
          <span className="text-xs font-bold text-white tracking-wide uppercase opacity-90">
            {t("creditScore.pageTitle")}
          </span>
          <span className="text-xs text-white/80">{t("loanPage.viewDetails")} →</span>
        </div>
        <div className="px-5 py-4 flex items-center gap-5">
          <div className="relative shrink-0 w-28 h-28">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="12" className="dark:stroke-gray-700" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-muted-foreground">—</span>
              <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">/850</span>
            </div>
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <span className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white bg-gray-400">
              {t(`creditScore.level.poor`)}
            </span>
            <p className="text-sm font-bold text-foreground">📊 {t("creditScore.pageTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("loanPage.viewDetails")} →</p>
          </div>
        </div>
      </button>
    );
  }

  const levelColors: Record<string, string> = {
    excellent: "from-green-500 to-emerald-600",
    good:      "from-blue-500 to-blue-600",
    fair:      "from-amber-500 to-orange-500",
    poor:      "from-red-500 to-red-600",
    inactive:  "from-gray-500 to-gray-600",
  };
  const recIcons: Record<string, string> = {
    auto_approve: "🚀",
    fast_review:  "⚡",
    limited:      "⚠️",
    declined:     "🔒",
  };

  const scoreColors: Record<string, string> = {
    excellent: "#22c55e", good: "#3b82f6", fair: "#f59e0b", poor: "#ef4444", inactive: "#94a3b8",
  };
  const gradient = levelColors[data.level] ?? "from-gray-400 to-gray-500";
  const icon = recIcons[data.loanRecommendation] ?? "📊";
  const arcColor = scoreColors[data.level] ?? "#94a3b8";
  const circumference = 2 * Math.PI * 54;
  const dash = Math.max(0, (data.score - 200) / 650) * circumference;

  return (
    <button
      onClick={onViewFull}
      className="w-full text-left rounded-2xl border border-border bg-card overflow-hidden hover:shadow-md transition-shadow active:scale-[0.99]"
    >
      {/* Header strip */}
      <div className={`bg-gradient-to-r ${gradient} px-4 py-2.5 flex items-center justify-between`}>
        <span className="text-xs font-bold text-white tracking-wide uppercase opacity-90">
          {t("creditScore.pageTitle")}
        </span>
        <span className="text-xs text-white/80">
          {t("loanPage.viewDetails")} →
        </span>
      </div>

      {/* Body: gauge left + info right */}
      <div className="px-5 py-4 flex items-center gap-5">
        {/* Circular gauge */}
        <div className="relative shrink-0 w-28 h-28">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="#e2e8f0" strokeWidth="12" className="dark:stroke-gray-700" />
            <circle
              cx="60" cy="60" r="54" fill="none"
              stroke={arcColor} strokeWidth="12"
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-foreground leading-none">{data.score}</span>
            <span className="text-[10px] font-semibold text-muted-foreground mt-0.5">/850</span>
          </div>
        </div>

        {/* Level pill + recommendation */}
        <div className="flex-1 min-w-0 space-y-2">
          <span
            className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
            style={{ backgroundColor: arcColor }}
          >
            {t(`creditScore.level.${data.level}`)}
          </span>
          <p className="text-sm font-bold text-foreground leading-snug">
            {icon} {t(`creditScore.loan.${data.loanRecommendation}.title`)}
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {t(`creditScore.loan.${data.loanRecommendation}.desc`)}
          </p>
          {data.badges.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {data.badges.slice(0, 2).map(b => (
                <span key={b} className="bg-muted rounded-full px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  🏅 {b.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Score range bar */}
      <div className="px-5 pb-4">
        <div className="relative h-2 bg-gradient-to-r from-red-400 via-amber-400 via-blue-400 to-green-500 rounded-full overflow-hidden">
          <div
            className="absolute top-0 w-3 h-3 -mt-0.5 rounded-full border-2 border-white shadow bg-white"
            style={{ left: `calc(${Math.max(0, (data.score - 200) / 650) * 100}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>200</span><span>450</span><span>600</span><span>780</span><span>850</span>
        </div>
      </div>
    </button>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function LoanPage() {
  const { t } = useTranslation();
  const APP_STATUS = getAppStatus(t);
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [eligData, setEligData] = useState<EligibilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [eligError, setEligError] = useState(false);
  const [eligRetry, setEligRetry] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [formStep, setFormStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showWaitDialog, setShowWaitDialog] = useState(false);

  // Installment tracking
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [retrying, setRetrying] = useState<number | null>(null);

  // Simulator state
  const [simAmount, setSimAmount] = useState(500);
  const [simMonths, setSimMonths] = useState(6);

  // Form state
  const [form, setForm] = useState<FormData>({
    amountRequested: 1000, termMonths: 6,
    fullName: user?.name ?? "", dob: "", whatsapp: "", businessPhone: "", emergencyPhone: "",
    address: "", city: "",
    businessName: "", businessCategory: "", businessDescription: "",
    businessAgeYears: "", monthlySalesUsd: "",
    identityDoc: "", businessPhotos: [], productPhotos: [], businessDocs: [],
    facebookUrl: "", tiktokUrl: "", instagramUrl: "",
  });

  const setF = <K extends keyof FormData>(k: K, v: FormData[K]) => setForm(p => ({ ...p, [k]: v }));

  // Load eligibility
  useEffect(() => {
    if (!user || !token) { setLoading(false); return; }
    setLoading(true);
    setEligError(false);
    setEligData(null);
    (async () => {
      try {
        const res = await fetch("/api/loans/eligibility", { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          setEligData(await res.json());
        } else {
          setEligError(true);
        }
      } catch {
        setEligError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, token, eligRetry]);

  // Load installments when loan is active or completed
  useEffect(() => {
    const app = eligData?.existingApplication;
    if (!app || !token) return;
    if (app.status !== "active" && app.status !== "completed") return;
    (async () => {
      const res = await fetch(`/api/loans/my/installments?loanId=${app.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setInstallments(d.installments ?? []);
      }
    })();
  }, [eligData?.existingApplication?.status, token]);

  const handleRetry = async (instId: number) => {
    const app = eligData?.existingApplication;
    if (!app || !token) return;
    setRetrying(instId);
    try {
      const res = await fetch(`/api/loans/${app.id}/retry-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ installmentId: instId }),
      });
      const d = await res.json();
      if (res.ok && d.result === "success") {
        toast({ title: t("loanPage.toastPaymentSuccess") });
        const r2 = await fetch("/api/loans/eligibility", { headers: { Authorization: `Bearer ${token}` } });
        if (r2.ok) setEligData(await r2.json());
        const r3 = await fetch(`/api/loans/my/installments?loanId=${app.id}`, { headers: { Authorization: `Bearer ${token}` } });
        if (r3.ok) { const d3 = await r3.json(); setInstallments(d3.installments ?? []); }
      } else if (d.result === "failed") {
        toast({ title: t("loanPage.toastPaymentFailed"), description: t("loanPage.toastPaymentFailedDesc"), variant: "destructive" });
      } else {
        toast({ title: d.error ?? "Erè. Eseye ankò.", variant: "destructive" });
      }
    } finally { setRetrying(null); }
  };

  // Sync simulator to form
  useEffect(() => { setF("amountRequested", simAmount); setF("termMonths", simMonths); }, [simAmount, simMonths]);

  // Per-step validation before advancing
  const handleNext = () => {
    if (formStep === 1) {
      if (!form.fullName.trim()) {
        toast({ title: t("loanPage.toastFullNameRequired"), variant: "destructive" });
        return;
      }
    } else if (formStep === 2) {
      if (!form.businessName.trim()) {
        toast({ title: t("loanPage.toastBizNameRequired"), variant: "destructive" });
        return;
      }
      if (!form.businessCategory) {
        toast({ title: t("loanPage.toastBizCatRequired"), variant: "destructive" });
        return;
      }
    } else if (formStep === 3) {
      if (!form.identityDoc) {
        toast({ title: t("loanPage.toastIdRequired"), variant: "destructive" });
        return;
      }
    }
    setFormStep(p => p + 1);
  };

  // Submit application
  const handleSubmit = async () => {
    if (!form.fullName.trim()) { toast({ title: t("loanPage.toastFullNameRequired"), variant: "destructive" }); return; }
    if (!form.identityDoc) { toast({ title: t("loanPage.toastIdRequired"), variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/loans/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          amountRequested: form.amountRequested,
          termMonths: form.termMonths,
          fullName: form.fullName,
          dob: form.dob,
          whatsapp: form.whatsapp,
          businessPhone: form.businessPhone,
          emergencyPhone: form.emergencyPhone,
          address: form.address,
          city: form.city,
          businessName: form.businessName,
          businessCategory: form.businessCategory,
          businessDescription: form.businessDescription,
          businessAgeYears: form.businessAgeYears ? parseInt(form.businessAgeYears, 10) : null,
          monthlySalesUsd: form.monthlySalesUsd ? parseFloat(form.monthlySalesUsd) : null,
          identityDoc: form.identityDoc,
          businessPhotos: form.businessPhotos,
          productPhotos: form.productPhotos,
          businessDocs: form.businessDocs,
          facebookUrl: form.facebookUrl || null,
          tiktokUrl: form.tiktokUrl || null,
          instagramUrl: form.instagramUrl || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: t("loanPage.toastSubmitted") });
        setShowForm(false);
        // Reload eligibility
        const r2 = await fetch("/api/loans/eligibility", { headers: { Authorization: `Bearer ${token}` } });
        if (r2.ok) setEligData(await r2.json());
      } else {
        toast({ title: data.error ?? "Erè. Eseye ankò.", variant: "destructive" });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ── Redirect if not logged in ──────────────────────────────────────────────
  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <Banknote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h2 className="text-xl font-bold mb-2">{t("loanPage.loginRequired")}</h2>
        <p className="text-muted-foreground mb-4">{t("loanPage.loginRequiredDesc")}</p>
        <Button onClick={() => setLocation("/auth/login")}>{t("loanPage.loginBtn")}</Button>
      </div>
    );
  }

  // ── Country guard (skip for admins) ────────────────────────────────────────
  if (!loading && eligData && !eligData.countryEligible && !eligData.isSuperAdmin && !eligData.isAdminUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <div className="text-6xl mb-4">🌍</div>
        <h2 className="text-xl font-bold mb-2">{t("loanPage.notAvailable")}</h2>
        <p className="text-muted-foreground">
          {t("loanPage.notAvailableDesc")}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (eligError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">{t("loanPage.errorTitle")}</h2>
        <p className="text-muted-foreground mb-4">{t("loanPage.errorDesc")}</p>
        <Button onClick={() => setEligRetry(n => n + 1)}>
          <RefreshCcw className="h-4 w-4 mr-2" /> {t("loanPage.retry")}
        </Button>
      </div>
    );
  }

  const rep = calcRepayment(simAmount, simMonths, eligData?.interestRate ?? 0.15);
  const progressPct = eligData ? Math.min(100, (eligData.daysOnPlatform / eligData.minDays) * 100) : 0;
  const existingApp = eligData?.existingApplication;
  const appStatus = existingApp ? APP_STATUS[existingApp.status] : null;
  const countryFlag = eligData?.country === "Haiti" ? "🇭🇹" : eligData?.country === "Dominican Republic" ? "🇩🇴" : "";
  const isSuperAdmin = !!eligData?.isSuperAdmin;
  const isAdminUser  = !!eligData?.isAdminUser;
  // Admins can always re-apply (for testing), except when they have an active loan
  const canApply = !existingApp
    || existingApp.status === "rejected"
    || existingApp.status === "auto_rejected"
    || existingApp.status === "completed"
    || ((isSuperAdmin || isAdminUser) && existingApp.status !== "active");

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6 pb-20">

      {/* ── Hero Header ──────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-purple-700 p-6 text-white">
        <div className="absolute top-0 right-0 w-32 h-32 opacity-10 bg-white rounded-full -translate-y-8 translate-x-8" />
        <div className="absolute bottom-0 left-0 w-24 h-24 opacity-10 bg-white rounded-full translate-y-8 -translate-x-8" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <Badge className="bg-white/20 text-white border-0 text-xs mb-3">
              {countryFlag} {eligData?.country}
            </Badge>
            <h1 className="text-2xl font-extrabold leading-tight mb-2">
              {t("loanPage.heroTitle")}
            </h1>
            <p className="text-white/80 text-sm leading-relaxed">
              {t("loanPage.heroSubtitle")}
            </p>
          </div>
          <div className="text-5xl shrink-0 select-none drop-shadow-lg">💰</div>
        </div>
      </div>

      {/* ── AI Credit Score mini-widget ──────────────────────────────────── */}
      <CreditScoreWidget token={token} onViewFull={() => setLocation("/credit-score")} />

      {/* ── Active / Completed loan dashboard ───────────────────────────── */}
      {existingApp && (existingApp.status === "active" || existingApp.status === "completed") && (
        <ActiveLoanDashboard
          app={existingApp as any}
          installments={installments}
          onRetry={handleRetry}
          retrying={retrying}
        />
      )}

      {/* ── Completed — re-apply CTA ─────────────────────────────────────── */}
      {existingApp?.status === "completed" && (
        <Button className="w-full" onClick={() => { setShowForm(true); setFormStep(1); }}>
          <ArrowRight className="h-4 w-4 mr-2" /> {t("loanPage.reApply")}
        </Button>
      )}

      {/* ── Other application statuses (pending/rejected/etc) ────────────── */}
      {existingApp && appStatus && existingApp.status !== "active" && existingApp.status !== "completed" && (
        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <appStatus.icon className="h-5 w-5" />
            <h3 className="font-bold">{t("loanPage.appStatus")}</h3>
            <Badge className={`ml-auto text-xs border-0 ${appStatus.color}`}>{appStatus.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{appStatus.desc}</p>
          <div className="flex items-center gap-4 text-sm">
            <span className="font-bold text-primary text-lg">${parseFloat(existingApp.amountRequested).toFixed(0)}</span>
            <span className="text-muted-foreground">{existingApp.termMonths} {t("loanPage.months")}</span>
            <span className="text-muted-foreground ml-auto">
              {new Date(existingApp.createdAt).toLocaleDateString("fr-HT")}
            </span>
          </div>
          {existingApp.reviewerNote && (
            <div className="bg-muted/50 rounded-xl p-3 text-sm">
              <p className="text-xs font-semibold text-muted-foreground mb-1">{t("loanPage.agentNote")}</p>
              <p>{existingApp.reviewerNote}</p>
            </div>
          )}
          {(existingApp.status === "rejected" || existingApp.status === "auto_rejected" ||
            (isSuperAdmin && existingApp.status !== "active")) && (
            <Button variant="outline" className="w-full" onClick={() => { setShowForm(true); setFormStep(1); }}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              {isSuperAdmin && existingApp.status !== "rejected" && existingApp.status !== "auto_rejected"
                ? t("loanPage.cancelAndReset")
                : t("loanPage.applyAgain")}
            </Button>
          )}
        </div>
      )}

      {/* ── Super Admin Test Mode banner ──────────────────────────────────── */}
      {isSuperAdmin && (
        <div className="rounded-2xl border border-violet-400 bg-violet-50 dark:bg-violet-950/40 p-4 flex items-start gap-3">
          <div className="bg-violet-500 rounded-full p-1.5 shrink-0 mt-0.5">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-violet-800 dark:text-violet-300 text-sm">{t("loanPage.superAdminTestMode")}</p>
            <p className="text-xs text-violet-700 dark:text-violet-400 mt-0.5 leading-relaxed">
              {t("loanPage.superAdminTestDesc")}
            </p>
          </div>
        </div>
      )}

      {/* ── Regular admin restriction warning ────────────────────────────── */}
      {isAdminUser && !isSuperAdmin && (
        <div className="rounded-2xl border border-red-400 bg-red-50 dark:bg-red-950/30 p-4 flex items-start gap-3">
          <div className="bg-red-500 rounded-full p-1.5 shrink-0 mt-0.5">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-red-800 dark:text-red-400 text-sm">{t("loanPage.adminRestrictTitle")}</p>
            <p className="text-xs text-red-700 dark:text-red-400 mt-0.5 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: t("loanPage.adminRestrictDesc") }}
            />
          </div>
        </div>
      )}

      {/* ── Eligibility card ─────────────────────────────────────────────── */}
      {canApply && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          {(eligData?.eligible || isSuperAdmin || isAdminUser
            || existingApp?.status === "rejected"
            || existingApp?.status === "auto_rejected"
            || existingApp?.status === "completed") ? (
            /* UNLOCKED / ADMIN OVERRIDE */
            <div className={`p-5 text-white ${isSuperAdmin
              ? "bg-gradient-to-r from-violet-600 to-indigo-600"
              : isAdminUser
                ? "bg-gradient-to-r from-red-600 to-rose-600"
                : "bg-gradient-to-r from-emerald-500 to-teal-500"}`}>
              <div className="flex items-center gap-3">
                <div className="bg-white/20 rounded-full p-2">
                  {isSuperAdmin
                    ? <ShieldCheck className="h-6 w-6" />
                    : isAdminUser
                      ? <ShieldCheck className="h-6 w-6" />
                      : <CheckCircle2 className="h-6 w-6" />}
                </div>
                <div>
                  {isSuperAdmin ? (
                    <>
                      <p className="font-bold text-lg">{t("loanPage.eligSuperAdmin")}</p>
                      <p className="text-white/80 text-sm">{t("loanPage.eligSuperAdminSub")}</p>
                    </>
                  ) : isAdminUser ? (
                    <>
                      <p className="font-bold text-lg">{t("loanPage.eligAdmin")}</p>
                      <p className="text-white/80 text-sm">{t("loanPage.eligAdminSub")}</p>
                    </>
                  ) : (
                    <>
                      <p className="font-bold text-lg">{t("loanPage.eligUser")}</p>
                      <p className="text-white/80 text-sm">{t("loanPage.eligUserSub", { days: eligData?.daysOnPlatform })}</p>
                    </>
                  )}
                </div>
              </div>
              <Button
                className="w-full mt-4 bg-white font-bold hover:bg-white/90 text-foreground"
                onClick={() => { setShowForm(true); setFormStep(1); }}
              >
                {isAdminUser && !isSuperAdmin
                  ? <><ShieldCheck className="h-4 w-4 mr-2 text-red-600" /> {t("loanPage.submitTestApp")}</>
                  : <>{t("loanPage.applyForLoan")} <ArrowRight className="h-4 w-4 ml-2" /></>
                }
              </Button>
            </div>
          ) : (
            /* LOCKED — live countdown */
            <LockedCountdown eligData={eligData} progressPct={progressPct} />
          )}
        </div>
      )}

      {/* ── Loan terms cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: "💵", label: t("loanPage.cardAmount"),   value: "$200 – $3,000", sub: "USD" },
          { icon: "📊", label: t("loanPage.cardInterest"), value: "15%", sub: t("loanPage.cardInterestSub") },
          { icon: "📅", label: t("loanPage.cardTerm"),     value: "1 – 12", sub: t("loanPage.months") },
          { icon: "🔄", label: t("loanPage.cardAfterPay"), value: t("loanPage.cardAfterPayValue"), sub: "" },
        ].map((c, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4">
            <div className="text-2xl mb-2">{c.icon}</div>
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className="font-bold text-sm">{c.value}</p>
            {c.sub && <p className="text-xs text-muted-foreground">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Loan simulator ────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
        <h2 className="font-bold text-base">{t("loanPage.simTitle")}</h2>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm text-muted-foreground">{t("loanPage.simAmountLabel")}</label>
            <span className="font-black text-xl text-primary">${simAmount.toLocaleString()}</span>
          </div>
          <input
            type="range" min={200} max={3000} step={50} value={simAmount}
            onChange={e => setSimAmount(Number(e.target.value))}
            className="w-full accent-primary h-2 rounded-full"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>$200</span><span>$3,000</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">{t("loanPage.simTermLabel")}</label>
          <div className="flex gap-2 flex-wrap">
            {[1, 3, 6, 9, 12].map(m => (
              <button
                key={m}
                onClick={() => setSimMonths(m)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
                  simMonths === m
                    ? "bg-primary text-white border-primary"
                    : "border-border text-muted-foreground hover:border-primary/50"
                }`}
              >
                {m} {t("loanPage.monthAbbr")}
              </button>
            ))}
          </div>
        </div>

        {/* Repayment plan */}
        <div className="bg-muted/40 rounded-2xl p-4 space-y-2.5">
          <p className="font-semibold text-sm mb-3">{t("loanPage.repaymentSummary")}</p>
          {[
            { label: t("loanPage.principal"), value: `$${simAmount.toLocaleString()}` },
            { label: `${t("loanPage.interest")} (${Math.round((eligData?.interestRate ?? 0.15) * 100)}%)`, value: `$${rep.interest.toFixed(2)}` },
            { label: t("loanPage.totalDue"), value: `$${rep.total.toFixed(2)}`, bold: true, color: "text-primary" },
            { label: t("loanPage.termLabel"), value: `${simMonths} ${t("loanPage.months")}` },
          ].map((r, i) => (
            <div key={i} className={`flex justify-between text-sm ${r.bold ? "border-t border-border pt-2 mt-1" : ""}`}>
              <span className="text-muted-foreground">{r.label}</span>
              <span className={`font-semibold ${r.color ?? ""}`}>{r.value}</span>
            </div>
          ))}
          <div className="bg-primary rounded-xl p-3 flex justify-between items-center mt-2">
            <span className="text-white text-sm font-medium">{t("loanPage.monthlyPayment")}</span>
            <span className="text-white font-black text-xl">${rep.monthly.toFixed(2)}</span>
          </div>
        </div>

        <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2.5 text-amber-700 dark:text-amber-300">
          ⚠️ {t("loanPage.earlyPayNote")}
        </p>
      </div>

      {/* ── Benefits ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { icon: Zap,      label: t("loanPage.benFast"),     desc: t("loanPage.benFastDesc") },
          { icon: Gift,     label: t("loanPage.benNoFees"),   desc: t("loanPage.benNoFeesDesc") },
          { icon: Calendar, label: t("loanPage.benFlex"),     desc: t("loanPage.benFlexDesc") },
          { icon: Phone,    label: t("loanPage.benSupport"),  desc: t("loanPage.benSupportDesc") },
        ].map(({ icon: Icon, label, desc }, i) => (
          <div key={i} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
            <div className="bg-primary/10 rounded-xl p-2 shrink-0">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="font-bold text-base mb-4">{t("loanPage.howItWorks")}</h2>
        <div className="space-y-0">
          {[
            { n: 1, text: t("loanPage.howStep1") },
            { n: 2, text: t("loanPage.howStep2") },
            { n: 3, text: t("loanPage.howStep3") },
            { n: 4, text: t("loanPage.howStep4") },
            { n: 5, text: t("loanPage.howStep5") },
            { n: 6, text: t("loanPage.howStep6") },
          ].map(({ n, text }, i, arr) => (
            <div key={n} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${n <= 4 ? "bg-primary text-white" : "bg-emerald-500 text-white"}`}>
                  {n}
                </div>
                {i < arr.length - 1 && <div className="w-0.5 h-6 bg-border my-1" />}
              </div>
              <p className="text-sm pt-1.5 pb-3">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Eligibility conditions + Stats ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4">
        <div className="bg-card border border-border rounded-2xl p-5">
          <h3 className="font-bold text-sm mb-3">{t("loanPage.eligConditions")}</h3>
          <div className="space-y-2">
            {[
              t("loanPage.cond1"), t("loanPage.cond2"), t("loanPage.cond3"),
              t("loanPage.cond4"), t("loanPage.cond5"), t("loanPage.cond6"),
            ].map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>

        {eligData && (
          <div className="bg-card border border-border rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-3">{t("loanPage.perfStats")}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: TrendingUp, label: t("loanPage.statListings"), value: `${eligData.metrics.activeListingCount ?? 0}/10`, sub: (eligData.metrics.activeListingCount ?? 0) >= 10 ? t("loanPage.statListingsOk") : t("loanPage.statListingsNeed"), color: (eligData.metrics.activeListingCount ?? 0) >= 10 ? "text-emerald-600" : "text-orange-500" },
                { icon: Truck,      label: t("loanPage.statDelivery"), value: `${eligData.metrics.deliverySuccessRate}%`, sub: t("loanPage.statDeliverySub"), color: "text-blue-600" },
                { icon: Star,       label: t("loanPage.statRating"),   value: `${eligData.metrics.avgRating.toFixed(1)} / 5`, sub: "⭐".repeat(Math.round(eligData.metrics.avgRating)), color: "text-yellow-600" },
                { icon: Shield,     label: t("loanPage.statReports"),  value: `${eligData.metrics.reportCount}`, sub: eligData.metrics.reportCount === 0 ? t("loanPage.statReportsGood") : t("loanPage.statReportsReview"), color: eligData.metrics.reportCount === 0 ? "text-emerald-600" : "text-red-600" },
              ].map(({ icon: Icon, label, value, sub, color }, i) => (
                <div key={i} className="bg-muted/30 rounded-xl p-3">
                  <Icon className={`h-4 w-4 ${color} mb-1`} />
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-black text-base ${color}`}>{value}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Inspiration section ───────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/30 dark:to-violet-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-2xl p-5">
        <div className="text-3xl mb-2">📈</div>
        <h3 className="font-bold text-base mb-2">{t("loanPage.growTitle")}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("loanPage.growDesc")}
        </p>
      </div>

      {/* ── Security badge ────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
        <div className="bg-primary/10 rounded-2xl p-3">
          <Shield className="h-7 w-7 text-primary" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-sm">{t("loanPage.secureTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("loanPage.secureDesc")}</p>
        </div>
        <div className="text-center shrink-0">
          <div className="bg-primary/10 rounded-full h-12 w-12 flex items-center justify-center">
            <span className="text-xs font-black text-primary leading-none">100%<br/>SEC</span>
          </div>
        </div>
      </div>

      {/* ── CTA button at bottom — visible for all users without active/pending app ── */}
      {canApply && (
        <>
          {eligData?.eligible || isSuperAdmin || isAdminUser ? (
            <Button
              className="w-full py-6 text-base font-bold rounded-2xl"
              onClick={() => { setShowForm(true); setFormStep(1); }}
            >
              {t("loanPage.applyNowCTA")} <ChevronRight className="h-5 w-5 ml-1" />
            </Button>
          ) : (
            <button
              className="w-full py-5 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 flex flex-col items-center gap-1.5 transition-all hover:border-violet-500 hover:bg-violet-100 dark:hover:bg-violet-950/50 group"
              onClick={() => setShowWaitDialog(true)}
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-violet-500 group-hover:text-violet-700" />
                <span className="text-base font-bold text-violet-700 dark:text-violet-300">
                  {t("loanPage.applyForLoan")}
                </span>
              </div>
              <span className="text-xs text-violet-500 dark:text-violet-400">
                {t("loanPage.clickToSeeProgress")}
              </span>
            </button>
          )}
        </>
      )}

      {/* ── Not-eligible wait dialog ──────────────────────────────────────── */}
      <Dialog open={showWaitDialog} onOpenChange={setShowWaitDialog}>
        <DialogContent className="max-w-sm rounded-3xl p-0 overflow-hidden">
          <DialogHeader className="pt-5 px-5 text-center">
            <div className="text-4xl mb-1">⏳</div>
            <DialogTitle className="text-xl font-extrabold">
              {t("loanPage.notYetEligible")}
            </DialogTitle>
          </DialogHeader>
          <LockedCountdown eligData={eligData} progressPct={progressPct} />
          <div className="px-5 pb-5 -mt-1">
            <Button className="w-full" onClick={() => setShowWaitDialog(false)}>
              {t("loanPage.understood")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Multi-step application dialog ────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) setShowForm(false); }}>
        <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t("loanPage.formTitle", { step: formStep })}
            </DialogTitle>
            {/* Step dots */}
            <div className="flex gap-2 mt-2">
              {[1,2,3,4].map(s => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= formStep ? "bg-primary" : "bg-muted"}`} />
              ))}
            </div>
          </DialogHeader>

          <div className="space-y-4 pb-4">

            {/* ── Step 1: Personal Info ── */}
            {formStep === 1 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground font-medium">{t("loanPage.step1Title")}</p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldFullName")} *</label>
                    <Input value={form.fullName} onChange={e => setF("fullName", e.target.value)} placeholder="Jean Baptiste" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldDob")}</label>
                    <Input type="date" value={form.dob} onChange={e => setF("dob", e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldWhatsapp")}</label>
                    <Input value={form.whatsapp} onChange={e => setF("whatsapp", e.target.value)} placeholder="+509 XXXX XXXX" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldBizPhone")}</label>
                    <Input value={form.businessPhone} onChange={e => setF("businessPhone", e.target.value)} placeholder="+509 XXXX XXXX" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldEmergency")}</label>
                    <Input value={form.emergencyPhone} onChange={e => setF("emergencyPhone", e.target.value)} placeholder="+509 XXXX XXXX" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldAddress")}</label>
                    <Input value={form.address} onChange={e => setF("address", e.target.value)} placeholder="Ri, Katye..." className="mt-1" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldCity")}</label>
                    <Input value={form.city} onChange={e => setF("city", e.target.value)} placeholder="Pòtoprens, Okay..." className="mt-1" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2.5 text-blue-700 dark:text-blue-300">
                  📍 {t("loanPage.agentVisitNote")}
                </p>
              </div>
            )}

            {/* ── Step 2: Business Info ── */}
            {formStep === 2 && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground font-medium">{t("loanPage.step2Title")}</p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldBizName")}</label>
                  <Input value={form.businessName} onChange={e => setF("businessName", e.target.value)} placeholder="Mon Biznis SARL" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldBizCategory")}</label>
                  <Select value={form.businessCategory} onValueChange={v => setF("businessCategory", v)}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder={t("loanPage.chooseCategory")} /></SelectTrigger>
                    <SelectContent>{BUSINESS_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldBizDesc")}</label>
                  <Textarea value={form.businessDescription} onChange={e => setF("businessDescription", e.target.value)} placeholder={t("loanPage.fldBizDescPlaceholder")} rows={3} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldBizAge")}</label>
                  <Input type="number" min={0} value={form.businessAgeYears} onChange={e => setF("businessAgeYears", e.target.value)} placeholder="Ex: 3" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">{t("loanPage.fldMonthlySales")}</label>
                  <Input type="number" min={0} value={form.monthlySalesUsd} onChange={e => setF("monthlySalesUsd", e.target.value)} placeholder="Ex: 500" className="mt-1" />
                </div>

                {/* Loan amount + term in step 2 */}
                <div className="bg-primary/5 rounded-xl p-4 space-y-3 border border-primary/20">
                  <p className="text-sm font-semibold text-primary">{t("loanPage.loanDetails")}</p>
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{t("loanPage.amountLabel")}: <strong className="text-foreground">${form.amountRequested}</strong></span>
                    </div>
                    <input type="range" min={200} max={3000} step={50} value={form.amountRequested}
                      onChange={e => setF("amountRequested", Number(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">{t("loanPage.termLabel")}:</p>
                    <div className="flex gap-2 flex-wrap">
                      {[1,3,6,9,12].map(m => (
                        <button key={m} onClick={() => setF("termMonths", m)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${form.termMonths===m ? "bg-primary text-white border-primary" : "border-border hover:border-primary/50"}`}>
                          {m}m
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-2.5 flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("loanPage.monthlyPayment")}</span>
                    <span className="font-black text-primary">${calcRepayment(form.amountRequested, form.termMonths, 0.15).monthly.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 3: Documents & Photos ── */}
            {formStep === 3 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground font-medium">{t("loanPage.step3Title")}</p>

                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                  💡 {t("loanPage.docsOptionalHint")}
                </div>

                <FileUploadPicker
                  label={`📋 ${t("loanPage.labelIdPhoto")}`}
                  token={token ?? ""}
                  onUploaded={urls => setF("identityDoc", urls[0] ?? "")}
                  existing={form.identityDoc ? [form.identityDoc] : []}
                />

                <FileUploadPicker
                  label={`🏪 ${t("loanPage.labelBizPhoto")}`}
                  multiple
                  token={token ?? ""}
                  onUploaded={urls => setF("businessPhotos", urls)}
                  existing={form.businessPhotos}
                />

                <FileUploadPicker
                  label={`📦 ${t("loanPage.labelProductPhoto")}`}
                  multiple
                  token={token ?? ""}
                  onUploaded={urls => setF("productPhotos", urls)}
                  existing={form.productPhotos}
                />

                <FileUploadPicker
                  label={`📄 ${t("loanPage.labelBizDocs")}`}
                  multiple
                  token={token ?? ""}
                  onUploaded={urls => setF("businessDocs", urls)}
                  existing={form.businessDocs}
                />
              </div>
            )}

            {/* ── Step 4: Social + Review ── */}
            {formStep === 4 && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground font-medium">{t("loanPage.step4Title")}</p>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Facebook {t("loanPage.profileUrl")}</label>
                  <Input value={form.facebookUrl} onChange={e => setF("facebookUrl", e.target.value)} placeholder="https://facebook.com/..." className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">TikTok {t("loanPage.profileUrl")}</label>
                  <Input value={form.tiktokUrl} onChange={e => setF("tiktokUrl", e.target.value)} placeholder="https://tiktok.com/@..." className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Instagram {t("loanPage.profileUrl")}</label>
                  <Input value={form.instagramUrl} onChange={e => setF("instagramUrl", e.target.value)} placeholder="https://instagram.com/..." className="mt-1" />
                </div>

                {/* Summary */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-2 text-sm">
                  <p className="font-semibold mb-2">{t("loanPage.finalReview")}</p>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("loanPage.reviewName")}</span><span className="font-medium">{form.fullName || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("loanPage.reviewAmount")}</span><span className="font-bold text-primary">${form.amountRequested}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("loanPage.reviewTerm")}</span><span>{form.termMonths} {t("loanPage.months")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("loanPage.reviewMonthly")}</span><span className="font-semibold">${calcRepayment(form.amountRequested, form.termMonths, 0.15).monthly.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("loanPage.reviewBiz")}</span><span>{form.businessName || "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("loanPage.reviewId")}</span><span>{form.identityDoc ? "✅ " + t("loanPage.yes") : "❌ " + t("loanPage.no")}</span></div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-xs text-emerald-700 dark:text-emerald-400">
                  🔒 {t("loanPage.dataProtected")}
                </div>
              </div>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3 pt-2 border-t border-border">
            {formStep > 1 ? (
              <Button variant="outline" className="flex-1" onClick={() => setFormStep(p => p - 1)}>
                {t("loanPage.back")}
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                {t("loanPage.cancel")}
              </Button>
            )}
            {formStep < 4 ? (
              <Button className="flex-1" onClick={handleNext}>
                {t("loanPage.continue")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("loanPage.submitApp")}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
