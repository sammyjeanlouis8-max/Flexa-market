import { useState, useEffect, useRef, lazy, Suspense, type ComponentProps } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Wallet, ArrowUpCircle, Clock, CheckCircle2, XCircle, AlertCircle,
  Send, Copy, Share2, QrCode, CreditCard, Phone, ArrowLeft,
  ArrowDownCircle, ArrowRightLeft, ChevronRight, User, Loader2, Eye, EyeOff, Gift, Users,
  Upload, ImageIcon, CheckCircle, MapPin, KeyRound, DollarSign, Zap, RefreshCw, ShieldCheck, Truck,
  MessageCircle, Crown, LayoutGrid, BarChart3, Plus,
} from "lucide-react";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { preloadAgentChat, prepareAgentChat } from "@/lib/agentChat";
import { isNativeMobileApp } from "@/lib/nativeMobileApp";
import { HaitiCheckoutError, initiateHaitiCheckout } from "@/lib/haitiCheckout";
import { canShowFMDeliveryLinks } from "@/contexts/delivery-navigation";
import { PageSkeleton } from "@/components/PageSkeleton";
import { walletChoiceMethodLines } from "@/lib/walletChoiceMethods";

const VirtualCard = lazy(() =>
  import("./wallet/VirtualCardPanel").then((m) => ({ default: m.VirtualCard }))
);
const QRModal = lazy(() =>
  import("./wallet/VirtualCardPanel").then((m) => ({ default: m.QRModal }))
);
const AgentSelectStep = lazy(() =>
  import("./wallet/AgentSelectStep").then((m) => ({ default: m.AgentSelectStep }))
);

// ─── Virtual card helpers ─────────────────────────────────────────────────────
// ─── Types ────────────────────────────────────────────────────────────────────
interface WalletBalance {
  balanceUsd: number;
  availableUsd: number;
  securityBalance: number;
  firstRechargeDone: boolean;
  balanceHtg: number;
  balanceDop: number;
  rateHtgToUsd: number;
  cashoutRateHtgToUsd: number;
  rateDopToUsd: number;
  bonusPct: number;
  accountNumber: string | null;
  moncashPlatformNumber?: string;
  promoBalance: number;
  unlockedBalance: number;
  newUnlockableUsd: number;
  totalRealBoostSpend: number;
}

interface WalletTx {
  id: number;
  type: string;
  amountUsd: number;
  amountHtg: number | null;
  rateUsed: number | null;
  bonusPct: number | null;
  paymentRef: string | null;
  status: string;
  note: string | null;
  createdAt: string;
}

interface ReferralData {
  referralCode: string | null;
  usedPromoCode: boolean;
  totalReferred: number;
  bonusesPaid: number;
  pendingBonuses: number;
  bonusPerReferral: number;
  minRechargeForBonus: number;
  totalEarnedUsd: number;
  greenBalanceUsd: number;
  pendingBalanceUsd: number;
  promoBalance: number;
  unlockedBalance: number;
}

// ─── API helpers ──────────────────────────────────────────────────────────────
function getToken(): string | null {
  return localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
}

class ApiPostError extends Error {
  constructor(message: string, readonly status: number, readonly beforeDebit = false) {
    super(message);
    this.name = "ApiPostError";
  }
}

async function apiGet(path: string) {
  const token = getToken();
  const r = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPost(path: string, body: unknown) {
  const token = getToken();
  const r = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  let data: any;
  try {
    data = await r.json();
  } catch {
    // An upstream error page is not proof that a cash-out failed.
    console.warn("Unexpected API response", { path, status: r.status, contentType: r.headers.get("content-type") });
    throw new Error(`Unexpected API response (HTTP ${r.status})`);
  }
  if (!r.ok) throw new ApiPostError(
    typeof data?.error === "string" ? data.error : `HTTP ${r.status}`,
    r.status,
    data?.beforeDebit === true,
  );
  return data;
}

const TOPUP_AMOUNTS_HTG = [500, 1000, 2000, 5000];
const TOPUP_AMOUNTS_USD = [5, 10, 25, 50];

// ─── Helpers ──────────────────────────────────────────────────────────────────
type TFunc = (key: string) => string;

function typeLabel(type: string, amountUsd: number, t: TFunc) {
  if (type === "recharge") return { label: t("wallet.txRecharge"), color: "text-green-400", sign: "+", Icon: ArrowDownCircle, iconColor: "bg-green-900/30 text-green-400" };
  if (type === "boost_debit") return { label: t("wallet.txBoost"), color: "text-blue-400", sign: "-", Icon: ArrowUpCircle, iconColor: "bg-blue-900/30 text-blue-400" };
  if (type === "bonus") return { label: t("wallet.txBonus"), color: "text-purple-400", sign: "+", Icon: CheckCircle2, iconColor: "bg-purple-900/30 text-purple-400" };
  if (type === "refund") return { label: t("wallet.txRefund"), color: "text-blue-400", sign: "+", Icon: ArrowDownCircle, iconColor: "bg-blue-900/30 text-blue-400" };
  if (type === "transfer_sent") return { label: t("wallet.txSent"), color: "text-red-400", sign: "-", Icon: Send, iconColor: "bg-red-900/30 text-red-400" };
  if (type === "transfer_received") return { label: t("wallet.txReceived"), color: "text-green-400", sign: "+", Icon: ArrowDownCircle, iconColor: "bg-green-900/30 text-green-400" };
  if (type === "referral_pending") return { label: t("wallet.txReferralPending"), color: "text-red-400", sign: "+", Icon: Gift, iconColor: "bg-red-900/30 text-red-400" };
  if (type === "referral_released") return { label: t("wallet.txReferralReleased"), color: "text-green-400", sign: "+", Icon: Gift, iconColor: "bg-green-900/30 text-green-400" };
  if (type === "promo_spend_bonus") return { label: t("wallet.txSpendBonus"), color: "text-green-400", sign: "+", Icon: Gift, iconColor: "bg-green-900/30 text-green-400" };
  if (type === "purchase_loyalty_bonus") return { label: t("wallet.txLoyaltyBonus"), color: "text-purple-400", sign: "+", Icon: Gift, iconColor: "bg-purple-900/30 text-purple-400" };
  if (type === "promo_boost_debit") return { label: t("wallet.txPromoBoost"), color: "text-purple-400", sign: "-", Icon: Zap, iconColor: "bg-purple-900/30 text-purple-400" };
  if (type === "promo_unlock") return { label: t("wallet.txPromoUnlock"), color: "text-amber-400", sign: "+", Icon: ArrowRightLeft, iconColor: "bg-amber-900/30 text-amber-400" };
  if (type === "promo_convert") return { label: t("wallet.txPromoConvert"), color: "text-green-400", sign: "+", Icon: ArrowRightLeft, iconColor: "bg-green-900/30 text-green-400" };
  if (type === "recharge_fee") return { label: t("wallet.txRechargeFeeLegacy", { defaultValue: "Recharge fee (legacy)" }), color: "text-orange-400", sign: "-", Icon: AlertCircle, iconColor: "bg-orange-900/30 text-orange-400" };
  if (type === "security_lock") return { label: t("wallet.txSecurityLockLegacy", { defaultValue: "Security balance (legacy)" }), color: "text-slate-400", sign: "", Icon: ShieldCheck, iconColor: "bg-slate-900/30 text-slate-400" };
  return { label: type, color: "text-foreground", sign: amountUsd > 0 ? "+" : "", Icon: ArrowRightLeft, iconColor: "bg-muted text-muted-foreground" };
}

function statusBadge(status: string, t: TFunc) {
  if (status === "completed") return <Badge className="bg-green-900/40 text-green-300 text-xs border-0">{t("wallet.statusCompleted")}</Badge>;
  if (status === "pending") return <Badge variant="outline" className="text-xs text-amber-300 border-amber-500 bg-amber-900/20">{t("wallet.pending")}</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="text-xs">{t("wallet.statusRejected")}</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

// ─── Fee Breakdown Component ──────────────────────────────────────────────────
const TRANSFER_FEE_PCT = 2;  // 2%
const CASHOUT_FEE_PCT  = 2;  // 2%

function FeeBreakdown({
  amount,
  feeRatePct,
  mode,
  balance,
  rateHtgToUsd,
  serverQuote,
}: {
  amount: number;
  feeRatePct: number;
  mode: "transfer" | "cashout";
  balance: number;
  rateHtgToUsd?: number;
  serverQuote?: any;
}) {
  const { t } = useTranslation();
  if (!amount || amount <= 0) return null;

  const fee = serverQuote?.feeUsd ?? Math.round(amount * (feeRatePct / 100) * 100) / 100;
  const net = serverQuote?.netAmountUsd ?? Math.round((amount - fee) * 100) / 100;
  const insufficient = amount > balance + 0.001;
  const minAmount = mode === "transfer" ? 0.01 : 1;
  const tooSmall = amount < minAmount;
  const netHtg = serverQuote?.amountHtg ?? (rateHtgToUsd && net > 0 ? Math.round(net * rateHtgToUsd) : null);

  return (
    <div className={`rounded-xl border p-4 space-y-2.5 transition-all ${insufficient ? "border-red-300 dark:border-red-700 bg-red-50/60 dark:bg-red-950/20" : "border-border bg-muted/30"}`}>
      <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
        <DollarSign className="h-3 w-3" />
        {t("wallet.feeBreakdown")}
      </p>
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">{mode === "transfer" ? t("wallet.feeYouSend") : t("wallet.feeYouCashout")}</span>
          <span className="font-semibold tabular-nums">${amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-orange-500 dark:text-orange-400">{t("wallet.feePlatform", { pct: feeRatePct })}</span>
          <span className="font-semibold text-orange-500 dark:text-orange-400 tabular-nums">-${fee.toFixed(2)}</span>
        </div>
        <div className="h-px bg-border" />
        <div className="flex justify-between items-center">
          <span className="font-bold text-sm">{mode === "transfer" ? t("wallet.feeReceiverGets") : t("wallet.feeYouReceive")}</span>
          <div className="text-right">
            <span className="text-xl font-black text-green-500 tabular-nums">${net.toFixed(2)}</span>
            {netHtg !== null && (
              <p className="text-xs font-semibold text-violet-500 tabular-nums mt-0.5">
                ≈ G {netHtg.toLocaleString()} HTG
              </p>
            )}
          </div>
        </div>
      </div>
      {insufficient && (
        <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {t("wallet.feeInsufficient")}
        </p>
      )}
      {tooSmall && !insufficient && (
        <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
          <AlertCircle className="h-3 w-3 shrink-0" />
          {mode === "transfer" ? t("wallet.feeMinTransfer") : t("wallet.feeMinCashout")}
        </p>
      )}
    </div>
  );
}


function LazyVirtualCard(props: ComponentProps<typeof VirtualCard>) {
  return (
    <Suspense fallback={<div className="h-48 animate-pulse rounded-3xl bg-muted" />}>
      <VirtualCard {...props} />
    </Suspense>
  );
}
// ─── Main Component ───────────────────────────────────────────────────────────
type Step = "home" | "choice" | "topup" | "moncash" | "natcash" | "moncash_confirm" | "moncash_submit" | "moncash_done" | "send" | "send_confirm" | "card" | "cashout" | "cashout_phone_verify" | "cashout_done" | "crypto" | "cashout_agent_select" | "cashout_agent_pay" | "cashout_agent_proof" | "cashout_agent_done" | "redeem_card" | "my_card";

export default function WalletPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const purchasesDisabled = isAndroidApp();
  const isHaiti = user?.country === "Haiti";
  const isDominican = user?.country === "Dominican Republic";
  const isDeliveryCountry = isHaiti || isDominican;
  const walletFundingDisabled = purchasesDisabled && !isDeliveryCountry;

  const [step, setStep] = useState<Step>("home");
  const [stepStack, setStepStack] = useState<Step[]>([]);

  function navigateTo(next: Step) {
    const isFundingStep = ["choice", "topup", "moncash", "natcash", "moncash_confirm", "moncash_submit", "moncash_done", "card"].includes(next);
    if ((walletFundingDisabled && isFundingStep) || (purchasesDisabled && next === "crypto")) {
      toast({ title: t("androidPurchasePolicy.unavailable") });
      return;
    }
    setStepStack(prev => [...prev, step]);
    setStep(next);
  }
  function goBack() {
    setStepStack(prev => {
      const arr = [...prev];
      const previous = arr.pop() ?? "home";
      setStep(previous);
      return arr;
    });
  }
  function resetToHome() {
    setStepStack([]);
    setStep("home");
  }

  const [showQR, setShowQR] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showReferralDetails, setShowReferralDetails] = useState(false);
  /** Presentation-only home section filter (matches PRO MAX wallet tabs). */
  const [homeTab, setHomeTab] = useState<"overview" | "promo" | "transactions">("overview");

  // MonCash state
  const [selectedHtg, setSelectedHtg] = useState(1000);
  const [customHtg, setCustomHtg] = useState("");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [pendingRef, setPendingRef] = useState<string | null>(null);
  const [pendingDetails, setPendingDetails] = useState<{
    amountHtg: number; totalUsd: number; bonusUsd: number; baseUsd: number; rateUsed: number; bonusPct: number;
  } | null>(null);

  // MonCash proof state
  const [userTransferRef, setUserTransferRef] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);

  // Send state
  const [toAccount, setToAccount] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendCurrency, setSendCurrency] = useState<"USD" | "USDT">("USD");
  const [recipient, setRecipient] = useState<{ name: string; accountNumber: string } | null>(null);
  const lookupTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lookupState, setLookupState] = useState<"idle" | "loading" | "found" | "error">("idle");
  const [lookupError, setLookupError] = useState("");

  // Card state
  const [cardAmountUsd, setCardAmountUsd] = useState(10);
  const [customCardUsd, setCustomCardUsd] = useState("");

  // Cashout state
  const [cashoutAmount, setCashoutAmount] = useState("");
  const [cashoutMethod, setCashoutMethod] = useState<"moncash" | "natcash" | "agent" | "agent_transfer">("moncash");
  const [cashoutRetraitOnly, setCashoutRetraitOnly] = useState(false);
  const [cashoutPhone, setCashoutPhone] = useState(user?.phone ?? "");
  const [cashoutRecipientFirstName, setCashoutRecipientFirstName] = useState("");
  const [cashoutRecipientLastName, setCashoutRecipientLastName] = useState("");
  const [cashoutAgentLoc, setCashoutAgentLoc] = useState("");
  const [cashoutResult, setCashoutResult] = useState<{ requestId: number; payoutStatus?: "paid" | "pending" | "unknown" | "refunded"; payoutAmountHtg?: number } | null>(null);

  // Agent-transfer cashout state
  const [selectedAgent, setSelectedAgent] = useState<null | {
    id: number; userId: number; fullName: string; businessName?: string | null;
    city: string; country: string; accountNumber: string | null; fmWalletNumber: string | null;
    whatsappNumber: string; isOnline: boolean; supportedMethods?: string | null; userAvatar?: string | null;
  }>(null);
  const [cashoutAgentNote, setCashoutAgentNote] = useState("");
  const [cashoutAgentScreenshotFile, setCashoutAgentScreenshotFile] = useState<File | null>(null);
  const [cashoutAgentScreenshotPreview, setCashoutAgentScreenshotPreview] = useState<string | null>(null);
  const [cashoutAgentScreenshotUrl, setCashoutAgentScreenshotUrl] = useState<string | null>(null);
  const [cashoutAgentScreenshotUploading, setCashoutAgentScreenshotUploading] = useState(false);

  // OTP phone-verify state
  const [otpPhone, setOtpPhone] = useState(user?.phone ?? "");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpDevCode, setOtpDevCode] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpError, setOtpError] = useState("");

  const makeIdempotencyKey = () => {
    try {
      if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    } catch {
      // A browser crypto failure must not mask an already accepted cash-out.
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  };
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);
  const [cashoutOutcomeUnknown, setCashoutOutcomeUnknown] = useState(false);

  // Topup method selection
  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin || user?.role === "admin" || user?.role === "super_admin");
  const isSuperAdmin = !!(user?.isSuperAdmin || user?.role === "super_admin");
  const isApprovedAgent = !!(user?.role === "agent" || isAdmin);
  const [selectedTopupMethod, setSelectedTopupMethod] = useState<string>("moncash");

  const { data: haitiProviders, isLoading: isLoadingProviders } = useQuery({
    queryKey: ["/wallet/haiti/providers"],
    queryFn: () => apiGet("/wallet/haiti/providers"),
    enabled: !!isHaiti,
  });

  const { data: monCashReconciliation } = useQuery({
    queryKey: ["/wallet/haiti/reconcile"],
    queryFn: () => apiPost("/wallet/haiti/reconcile", {}),
    enabled: !!isHaiti,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (!monCashReconciliation) return;
    qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
    qc.invalidateQueries({ queryKey: ["/wallet/history"] });
  }, [monCashReconciliation, qc]);

  const { mutate: getQuote, data: quoteData, isPending: isQuoteLoading } = useMutation({
    mutationFn: (body: any) => apiPost("/wallet/haiti/quote", body),
  });

  const haitiInitiateMut = useMutation({
    // Offline mutations must settle visibly instead of staying paused forever.
    networkMode: "always",
    retry: false,
    mutationFn: (body: { provider: string, amountHtg: number, phone?: string }) =>
      walletFundingDisabled
        ? Promise.reject(new Error(t("androidPurchasePolicy.unavailable") || "Purchases disabled on Android"))
        : initiateHaitiCheckout(body, getToken()),
    onSuccess: (data) => {
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    },
    onError: (e: Error) => toast({
      title: t("wallet.error"),
      description: e instanceof HaitiCheckoutError ? t(e.translationKey) : e.message,
      variant: "destructive",
    }),
  });

  const debouncedQuote = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Platform revenue card (super admin only) ─────────────────────────────
  const [platformRev, setPlatformRev] = useState<{
    totalRevenue: number; boostRevenue: number; merchantCommission: number;
    rechargeFees: number; subscriptionRevenue: number; transferFees: number;
    p2pTransferFees: number; deliveryFees: number;
  } | null>(null);
  const [showStatements, setShowStatements] = useState(false);
  const [statements, setStatements] = useState<Array<{
    month: string; totalRevenue: number; boostRevenue: number;
    merchantCommission: number; rechargeFees: number; subscriptionRevenue: number;
    p2pTransferFees: number; deliveryFees: number; orderCount: number;
  }> | null>(null);
  const [statementsLoading, setStatementsLoading] = useState(false);
  const loadStatements = async () => {
    if (statements) { setShowStatements(true); return; }
    setStatementsLoading(true);
    try {
      const tk = getToken();
      const year = new Date().getFullYear();
      const r = await fetch(`/api/admin/platform-revenue/monthly?year=${year}`, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.ok) { const d = await r.json(); setStatements(d.months); setShowStatements(true); }
    } finally { setStatementsLoading(false); }
  };
  const [platformRevLoading, setPlatformRevLoading] = useState(false);
  const loadPlatformRev = async () => {
    if (!isSuperAdmin) return;
    setPlatformRevLoading(true);
    try {
      const tk = getToken();
      const r = await fetch("/api/admin/platform-revenue?period=all", { headers: { Authorization: `Bearer ${tk}` } });
      if (r.ok) { const d = await r.json(); setPlatformRev(d.summary); }
    } finally { setPlatformRevLoading(false); }
  };
  useEffect(() => { loadPlatformRev(); }, [isSuperAdmin]);

  const [showReturnApp, setShowReturnApp] = useState(false);

  // ── Recharge polling — credit reflects immediately after Stripe payment ──
  const [rechargePending, setRechargePending] = useState(false);
  const rechargeBaseRef  = useRef<number | null>(null);   // balance before payment
  const pollTimerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPolling      = () => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    setRechargePending(false);
    rechargeBaseRef.current = null;
  };

  // ── Auto-retry ALL pending Stripe recharges on every authenticated load ────
  // Covers: old stuck txs (July 3, July 24...), Safari session drops, missed webhooks.
  // Also clears any localStorage pending session as a belt-and-suspenders.
  useEffect(() => {
    if (!user) return;
    const tk = localStorage.getItem("flexamarket_token");
    fetch("/api/wallet/stripe/auto-retry", {
      headers: tk ? { Authorization: `Bearer ${tk}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        if (data.credited > 0) {
          localStorage.removeItem("pending_stripe_session");
          qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
          qc.invalidateQueries({ queryKey: ["/wallet/history"] });
          toast({
            title: "✅ Rechaj Stripe konfime!",
            description: `${data.credited} pèman ajoute sou kont ou a.`,
          });
        } else {
          // Also try the localStorage session as a quick fallback
          const pendingId = localStorage.getItem("pending_stripe_session");
          if (pendingId) {
            fetch(`/api/stripe/checkout/activate?session_id=${encodeURIComponent(pendingId)}`)
              .then(r => r.json())
              .then(d => {
                if (d.activated) {
                  localStorage.removeItem("pending_stripe_session");
                  qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
                  qc.invalidateQueries({ queryKey: ["/wallet/history"] });
                }
              }).catch(() => {});
          }
        }
      })
      .catch(() => {}); // silent failure — will retry on next load
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Check for Stripe redirect ────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("return_app") === "1") {
      setShowReturnApp(true);
    }
    // ── NEW: server already credited the wallet before redirect ─────────────
    if (params.get("recharged") === "1") {
      window.history.replaceState({}, "", "/wallet");
      localStorage.removeItem("pending_stripe_session");
      const amount = params.get("amount");
      // Wallet credited server-side — just refresh queries and toast
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      toast({
        title: "✅ Kat FM rechaje!",
        description: amount ? `+$${amount} disponib kounye a` : "Balans ou mize ajou.",
      });
    }

    // ── FALLBACK: old flow (activate client-side if complete-redirect failed) ─
    if (params.get("card_success") === "1") {
      window.history.replaceState({}, "", "/wallet");
      localStorage.removeItem("pending_stripe_session");

      rechargeBaseRef.current = balanceRef.current;
      setRechargePending(true);

      const sessionId = params.get("session_id");
      const activateUrl = sessionId
        ? `/api/stripe/checkout/activate?session_id=${encodeURIComponent(sessionId)}`
        : null;
      if (activateUrl) {
        fetch(activateUrl)
          .then(r => r.json())
          .then(data => {
            // Credit confirmed — refresh immediately
            qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
            qc.invalidateQueries({ queryKey: ["/wallet/history"] });
            if (data.activated) stopPolling();
          })
          .catch(() => qc.invalidateQueries({ queryKey: ["/wallet/balance"] }));
      } else {
        qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      }

      // Poll every 2s as safety net — stops when balance rises or after 30s
      pollTimerRef.current = setInterval(() => {
        qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
        qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      }, 2000);
      setTimeout(() => { if (pollTimerRef.current) stopPolling(); }, 30000);
    }
    if (params.get("card_cancel") === "1") {
      toast({ title: t("wallet.paymentCancelled"), variant: "destructive" });
      window.history.replaceState({}, "", "/wallet");
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: balance, isLoading } = useQuery<WalletBalance>({
    queryKey: ["/wallet/balance"],
    queryFn: () => apiGet("/wallet/balance"),
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const availableUsd = balance?.availableUsd ?? balance?.balanceUsd ?? 0;


  const { data: historyData } = useQuery<{ transactions: WalletTx[]; totalIn: number; totalOut: number; count: number }>({
    queryKey: ["/wallet/history"],
    queryFn: () => apiGet("/wallet/history?limit=500"),
    enabled: !!user,
    refetchInterval: 90_000,
  });
  const history = historyData?.transactions;

  // Stop polling as soon as balance actually goes up (declared after balance query to avoid TDZ)
  const balanceRef = useRef<number>(0);
  useEffect(() => {
    const current = balance?.balanceUsd ?? 0;
    if (
      rechargePending &&
      rechargeBaseRef.current !== null &&
      current > rechargeBaseRef.current + 0.001
    ) {
      stopPolling();
      toast({ title: "✅ Kat FM rechaje!", description: `$${current.toFixed(2)} disponib kounye a` });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    }
    balanceRef.current = current;
  }, [balance?.balanceUsd, rechargePending]);


  const { data: referral } = useQuery<ReferralData>({
    queryKey: ["/wallet/referral"],
    queryFn: () => apiGet("/wallet/referral"),
    enabled: !!user,
    staleTime: 60000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const initiateMut = useMutation({
    mutationFn: (amountHtg: number) => walletFundingDisabled
      ? Promise.reject(new Error(t("androidPurchasePolicy.unavailable")))
      : apiPost("/wallet/topup/initiate", { amountHtg, phone }),
    onSuccess: (data) => {
      setPendingRef(data.paymentRef);
      setPendingDetails({ amountHtg: data.amountHtg, totalUsd: data.totalUsd, bonusUsd: data.bonusUsd, baseUsd: data.baseUsd, rateUsed: data.rateUsed, bonusPct: data.bonusPct });
      navigateTo("moncash_confirm");
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  const transferMut = useMutation({
    mutationFn: () => apiPost("/wallet/transfer", { toAccountNumber: toAccount.trim().toUpperCase(), amountUsd: parseFloat(sendAmount) }),
    onSuccess: (data) => {
      const gross = (data.amountUsd ?? 0).toFixed(2);
      const fee   = (data.feeUsd ?? 0).toFixed(2);
      const net   = (data.netAmountUsd ?? data.amountUsd ?? 0).toFixed(2);
      toast({ title: t("wallet.moneySent"), description: t("wallet.moneySentFeeDesc", { gross, fee, net, name: data.receiverName }) });
      setToAccount(""); setSendAmount(""); setRecipient(null); setLookupState("idle");
      resetToHome();
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.transferError"), description: e.message, variant: "destructive" }),
  });

  const cardSessionMut = useMutation({
    mutationFn: (amountUsd: number) => walletFundingDisabled
      ? Promise.reject(new Error(t("androidPurchasePolicy.unavailable")))
      : apiPost("/wallet/topup/card/session", { amountUsd }),
    onSuccess: (data) => {
      // Store session so we can retry credit if Safari drops the session
      if (data.sessionId) {
        localStorage.setItem("pending_stripe_session", data.sessionId);
      }
      window.location.href = data.sessionUrl;
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  // Recharge card redeem
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState<{ amountUsd: number } | null>(null);
  const redeemMut = useMutation({
    mutationFn: (code: string) => apiPost("/wallet/redeem-card", { code }),
    onSuccess: (data) => {
      setRedeemSuccess({ amountUsd: data.amountUsd });
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" }),
  });

  const promoUnlockMut = useMutation({
    mutationFn: () => purchasesDisabled
      ? Promise.reject(new Error(t("androidPurchasePolicy.unavailable")))
      : apiPost("/wallet/promo/unlock", {}),
    onSuccess: (data) => {
      toast({ title: t("wallet.promoUnlocked"), description: t("wallet.promoUnlockedDesc", { amount: data.unlockedUsd?.toFixed(2) ?? "0.00" }) });
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  const promoConvertMut = useMutation({
    mutationFn: () => purchasesDisabled
      ? Promise.reject(new Error(t("androidPurchasePolicy.unavailable")))
      : apiPost("/wallet/promo/convert", {}),
    onSuccess: (data) => {
      toast({ title: t("wallet.promoConverted"), description: t("wallet.promoConvertedDesc", { amount: data.convertedUsd?.toFixed(2) ?? "0.00" }) });
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      qc.invalidateQueries({ queryKey: ["/wallet/referral"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  const cashoutMut = useMutation({
    mutationFn: async (withdrawalToken?: string) => {
      const data = await apiPost("/cashout/request", {
        amountUsd: parseFloat(cashoutAmount),
        method: cashoutMethod,
        phone: (cashoutMethod === "moncash" || cashoutMethod === "natcash") ? cashoutPhone.trim() : undefined,
        recipientFirstName: cashoutMethod === "moncash" ? cashoutRecipientFirstName.trim() : undefined,
        recipientLastName: cashoutMethod === "moncash" ? cashoutRecipientLastName.trim() : undefined,
        agentLocation: cashoutMethod === "agent" ? cashoutAgentLoc.trim() : undefined,
        withdrawalToken,
        idempotencyKey,
      });
      if (data?.ok !== true || !Number.isInteger(data.requestId)) {
        throw new Error("Unexpected cash-out response");
      }
      return data;
    },
    onSuccess: (data) => {
      setCashoutOutcomeUnknown(false);
      setIdempotencyKey(makeIdempotencyKey());
      setCashoutResult({ requestId: data.requestId, payoutStatus: data.payoutStatus, payoutAmountHtg: data.payoutAmountHtg });
      navigateTo("cashout_done");
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      qc.invalidateQueries({ queryKey: ["/cashout/my"] });
    },
    onError: (e: Error) => {
      void qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      void qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      void qc.invalidateQueries({ queryKey: ["/cashout/my"] });
      const rejectedBeforeDebit = e instanceof ApiPostError && (
        e.beforeDebit || (e.status >= 400 && e.status < 500)
      );
      setCashoutOutcomeUnknown(!rejectedBeforeDebit);
      toast({
        title: t("wallet.error"),
        description: rejectedBeforeDebit ? e.message : t("wallet.cashoutUnconfirmed"),
        variant: "destructive",
      });
    },
  });

  // Agent-transfer cashout mutation (no OTP needed — screenshot is the proof)
  const cashoutAgentTransferMut = useMutation({
    mutationFn: () => apiPost("/cashout/request", {
      amountUsd: parseFloat(cashoutAmount),
      method: "agent_transfer",
      assignedAgentAppId: selectedAgent?.id,
      screenshotUrl: cashoutAgentScreenshotUrl,
      userNote: cashoutAgentNote.trim() || undefined,
    }),
    onSuccess: (data) => {
      setCashoutResult({ requestId: data.requestId });
      navigateTo("cashout_agent_done");
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      qc.invalidateQueries({ queryKey: ["/cashout/my"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  const startChatAgentMut = useMutation({
    mutationFn: (agentUserId: number) => {
      preloadAgentChat();
      return apiPost(`/agents/${agentUserId}/start-chat`, {});
    },
    onSuccess: (data) => {
      prepareAgentChat(qc, data);
      toast({ title: t("wallet.agentChatOpened"), description: t("wallet.agentChatOpenedDesc") });
      setLocation(`/messages/${data.conversationId}`);
    },
    onError: (e: Error) => toast({ title: t("wallet.agentChatError"), description: e.message, variant: "destructive" }),
  });

  async function handleAgentScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCashoutAgentScreenshotFile(file);
    setCashoutAgentScreenshotPreview(URL.createObjectURL(file));
    setCashoutAgentScreenshotUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = getToken();
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Upload echoue");
      setCashoutAgentScreenshotUrl(data.url);
    } catch (err: any) {
      toast({ title: t("wallet.uploadError", { defaultValue: "Upload error" }), description: err.message, variant: "destructive" });
      setCashoutAgentScreenshotFile(null);
      setCashoutAgentScreenshotPreview(null);
    } finally {
      setCashoutAgentScreenshotUploading(false);
    }
  }

  const sendOtpMut = useMutation({
    mutationFn: () => apiPost("/otp/send", {}),
    onSuccess: (data) => {
      setOtpSent(true);
      setOtpError("");
      setOtpCode("");
      setOtpDevCode(data.devCode ?? null);
      setOtpExpiresAt(data.expiresAt ?? null);
      // Start 5-minute countdown
      setOtpCountdown(300);
    },
    onError: (e: Error) => setOtpError(e.message),
  });

  const verifyOtpMut = useMutation({
    mutationFn: ({ code }: { code: string }) =>
      apiPost("/otp/verify", { code }),
    onSuccess: (data) => {
      cashoutMut.mutate(data.withdrawalToken);
    },
    onError: (e: Error) => {
      setOtpError(e.message);
      if (e.message.includes("Twòp eseye") || e.message.includes("Kòd la bloke")) {
        setOtpSent(false);
        setOtpCode("");
        setOtpCountdown(0);
      }
    },
  });

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const id = setInterval(() => setOtpCountdown(c => Math.max(c - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [otpCountdown]);

  const {
    data: cashoutRequestData,
    isLoading: cashoutRequestsLoading,
    isError: cashoutRequestsError,
    refetch: refetchCashoutRequests,
  } = useQuery<any[]>({
    queryKey: ["/cashout/my"],
    queryFn: () => apiGet("/cashout/my"),
    enabled: !!user,
    refetchInterval: 60_000,
  });
  const cashoutRequests = cashoutRequestData ?? [];

  const submitProofMut = useMutation({
    mutationFn: () => walletFundingDisabled
      ? Promise.reject(new Error(t("androidPurchasePolicy.unavailable")))
      : apiPost("/wallet/topup/submit-proof", {
      paymentRef: pendingRef,
      userTransferRef: userTransferRef.trim() || undefined,
      screenshotUrl: screenshotUrl || undefined,
    }),
    onSuccess: () => {
      navigateTo("moncash_done");
      setUserTransferRef("");
      setScreenshotFile(null);
      setScreenshotPreview(null);
      setScreenshotUrl(null);
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  async function handleScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setScreenshotUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = getToken();
      const r = await fetch("/api/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? t("wallet.uploadError"));
      setScreenshotUrl(data.url);
    } catch (err: any) {
      toast({ title: t("wallet.uploadError"), description: err.message, variant: "destructive" });
      setScreenshotFile(null);
      setScreenshotPreview(null);
    } finally {
      setScreenshotUploading(false);
    }
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!user) { Promise.resolve().then(() => setLocation("/auth/login")); return null; }

  // ── Account lookup (debounced) ────────────────────────────────────────────
  function handleAccountInput(val: string) {
    const upper = val.toUpperCase();
    setToAccount(upper);
    setRecipient(null);
    setLookupState("idle");
    setLookupError("");
    if (lookupTimeout.current) clearTimeout(lookupTimeout.current);
    if (upper.length >= 8) {
      setLookupState("loading");
      lookupTimeout.current = setTimeout(async () => {
        try {
          const token = getToken();
          const r = await fetch(`/api/wallet/lookup/${encodeURIComponent(upper)}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          const data = await r.json();
          if (!r.ok) { setLookupState("error"); setLookupError(data.error ?? t("wallet.notFound")); }
          else { setLookupState("found"); setRecipient(data); }
        } catch { setLookupState("error"); setLookupError(t("wallet.connectionError")); }
      }, 700);
    }
  }

  // ── Computed values ────────────────────────────────────────────────────────
  const finalHtg = customHtg ? parseFloat(customHtg) : selectedHtg;

  useEffect(() => {
    if ((step === "moncash" || step === "natcash") && finalHtg >= 100) {
      if (debouncedQuote.current) clearTimeout(debouncedQuote.current);
      debouncedQuote.current = setTimeout(() => {
        getQuote({ direction: "topup", provider: step, amountHtg: finalHtg });
      }, 400);
    }
  }, [step, finalHtg, getQuote]);

  const previewUsd = quoteData ? quoteData.amountUsd : (balance ? parseFloat((finalHtg / (parseFloat(String(balance.rateHtgToUsd)) || 1)).toFixed(2)) : 0);
  const previewBonus = quoteData ? quoteData.bonusUsd : (balance ? parseFloat((previewUsd * (parseFloat(String(balance.bonusPct)) || 0) / 100).toFixed(2)) : 0);
  const previewTotal = quoteData ? quoteData.netAmountUsd || quoteData.creditAmountUsd || (previewUsd + previewBonus) : parseFloat((previewUsd + previewBonus).toFixed(2));

  const cashoutAmt = parseFloat(cashoutAmount) || 0;
  const isMoncashOrNatcash = cashoutMethod === "moncash" || cashoutMethod === "natcash";

  useEffect(() => {
    if (step !== "cashout" || !isMoncashOrNatcash || cashoutAmt < 1) return;

    if (debouncedQuote.current) clearTimeout(debouncedQuote.current);
    debouncedQuote.current = setTimeout(() => {
      getQuote({ direction: "cashout", provider: cashoutMethod, amountUsd: cashoutAmt });
    }, 400);

    return () => {
      if (debouncedQuote.current) clearTimeout(debouncedQuote.current);
    };
  }, [step, cashoutAmt, cashoutMethod, getQuote, isMoncashOrNatcash]);


  const finalCardUsd = customCardUsd ? parseFloat(customCardUsd) : cardAmountUsd;
  const sendAmt = parseFloat(sendAmount) || 0;
  const maxTransferUsd = availableUsd;
  const canSendConfirm = recipient && sendAmt >= 0.01 && sendAmt <= maxTransferUsd;

  // ── Share ─────────────────────────────────────────────────────────────────
  async function handleShare() {
    if (!balance?.accountNumber) return;
    const text = t("wallet.shareText", { account: balance.accountNumber });
    try {
      if (navigator.share) {
        await navigator.share({ title: t("wallet.shareTitle"), text });
      } else {
        await navigator.clipboard.writeText(text);
        toast({ title: t("wallet.shareCopied"), description: t("wallet.shareCopiedDesc") });
      }
    } catch { /* user cancelled */ }
  }

  // =========================================================================
  // ── MONCASH CONFIRM step ─────────────────────────────────────────────────
  // =========================================================================
  if (step === "moncash_confirm" && pendingRef && pendingDetails) {
    const platformNum = balance?.moncashPlatformNumber;
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div className="text-center space-y-1">
          <p className="text-2xl font-black">{t("wallet.mcConfirmTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("wallet.mcConfirmSubtitle")}</p>
        </div>

        {/* Amount summary */}
        <div className="rounded-2xl border bg-card p-5 space-y-3">
          <Row label={t("wallet.amountHtg")} value={`G ${pendingDetails.amountHtg.toLocaleString()}`} />
          <Row label={t("wallet.conversionRate")} value={`1 USD = G ${pendingDetails.rateUsed}`} />
          <Row label={t("wallet.baseValue")} value={`$${pendingDetails.baseUsd.toFixed(2)}`} />
          {pendingDetails.bonusPct > 0 && (
            <Row label={t("wallet.bonusLabel", { pct: pendingDetails.bonusPct })} value={`+$${pendingDetails.bonusUsd.toFixed(2)}`} valueClass="text-green-400 font-bold" />
          )}
          <div className="h-px bg-border" />
          <div className="flex justify-between">
            <span className="font-bold text-foreground">{t("wallet.totalCredited")}</span>
            <span className="text-xl font-black text-primary">${pendingDetails.totalUsd.toFixed(2)}</span>
          </div>
        </div>

        {/* Platform MonCash number */}
        <div className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-5 text-center space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("wallet.sendToMoncash")}</p>
          {platformNum ? (
            <>
              <p className="text-3xl font-black text-primary tracking-widest">{platformNum}</p>
              <button
                onClick={() => { navigator.clipboard?.writeText(platformNum); toast({ title: t("wallet.numberCopied") }); }}
                className="flex items-center gap-1.5 mx-auto text-xs text-primary hover:underline"
              >
                <Copy className="h-3 w-3" /> {t("wallet.copyNumberBtn")}
              </button>
            </>
          ) : (
            <p className="text-sm text-muted-foreground italic">{t("wallet.noMoncashNumber")}</p>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            {t("wallet.sendAmountTo", { amount: pendingDetails.amountHtg.toLocaleString() })}
          </p>
        </div>

        {/* Simple step guide */}
        <div className="space-y-2">
          {[
            t("wallet.mcStep1", { amount: pendingDetails.amountHtg.toLocaleString() }),
            t("wallet.mcStep2"),
            t("wallet.mcStep3"),
          ].map((text, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
              <p className="text-sm text-foreground leading-relaxed">{text}</p>
            </div>
          ))}
        </div>

        <Button className="w-full h-14 font-bold text-base" onClick={() => navigateTo("moncash_submit")}>
          {t("wallet.finishedPayBtn")}
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={() => { resetToHome(); qc.invalidateQueries({ queryKey: ["/wallet/history"] }); }}>
          {t("wallet.doLater")}
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── MONCASH SUBMIT PROOF step ─────────────────────────────────────────────
  // =========================================================================
  if (step === "moncash_submit" && pendingRef) {
    const canSubmit = (userTransferRef.trim().length >= 4 || !!screenshotUrl) && !screenshotUploading;
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div className="text-center space-y-1">
          <p className="text-2xl font-black">{t("wallet.submitProofTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("wallet.submitProofSubtitle")}</p>
        </div>

        {/* Transfer number input */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("wallet.transferNumberLabel")} <span className="text-primary">*</span></p>
          <Input
            type="text"
            placeholder={t("wallet.transferNumberPlaceholder")}
            value={userTransferRef}
            onChange={e => setUserTransferRef(e.target.value)}
            className="text-base font-mono"
            style={{ fontSize: 16 }}
          />
          <p className="text-xs text-muted-foreground">{t("wallet.transferNumberHint")}</p>
        </div>

        {/* Screenshot upload */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("wallet.screenshotProof")} <span className="text-primary">*</span></p>
          <label className={cn(
            "flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed cursor-pointer transition-all py-6 gap-2",
            screenshotPreview ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20"
          )}>
            {screenshotUploading ? (
              <><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="text-sm text-muted-foreground">{t("wallet.uploading")}</p></>
            ) : screenshotPreview ? (
              <div className="space-y-2 text-center">
                <img src={screenshotPreview} alt="Screenshot" className="max-h-40 mx-auto rounded-lg object-contain" />
                {screenshotUrl ? (
                  <p className="text-xs text-green-400 font-semibold flex items-center gap-1 justify-center"><CheckCircle className="h-3 w-3" /> {t("wallet.uploadSuccess")}</p>
                ) : (
                  <p className="text-xs text-amber-400">{t("wallet.uploading")}</p>
                )}
              </div>
            ) : (
              <><ImageIcon className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground text-center px-4">{t("wallet.chooseScreenshot")}<br /><span className="text-xs">{t("wallet.screenshotFormats")}</span></p></>
            )}
            <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleScreenshotChange} />
          </label>
          {screenshotPreview && (
            <button className="text-xs text-muted-foreground hover:text-destructive" onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); setScreenshotUrl(null); }}>
              {t("wallet.changeScreenshot")}
            </button>
          )}
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800 dark:text-blue-300">{t("wallet.submitProofInfo")}</p>
        </div>

        <Button
          className="w-full h-14 font-bold text-base"
          disabled={!canSubmit || submitProofMut.isPending}
          onClick={() => submitProofMut.mutate()}
        >
          {submitProofMut.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.submitting")}</>
            : <><Upload className="h-5 w-5 mr-2" />{t("wallet.submitProofTitle")}</>
          }
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── MONCASH DONE step ─────────────────────────────────────────────────────
  // =========================================================================
  if (step === "moncash_done") {
    return (
      <div className="max-w-md mx-auto px-4 py-16 flex flex-col items-center text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
          <CheckCircle className="h-12 w-12 text-green-500" />
        </div>

        <div className="space-y-2">
          <p className="text-2xl font-black text-foreground">{t("wallet.proofReceived")}</p>
          <p className="text-base text-muted-foreground leading-relaxed">
            {t("wallet.adminVerifying")}
          </p>
          <p className="text-2xl font-black text-primary">{t("wallet.within12h")}</p>
        </div>

        <div className="w-full rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-5 space-y-2 text-left">
          <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold text-sm">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>{t("wallet.proofSubmitted")}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Clock className="h-4 w-4 shrink-0" />
            <span>{t("wallet.processingDelay")}</span>
          </div>
          {pendingDetails && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <ArrowUpCircle className="h-4 w-4 shrink-0" />
              <span>{t("wallet.amountToCredit", { htg: pendingDetails.amountHtg.toLocaleString(), usd: pendingDetails.totalUsd.toFixed(2) })}</span>
            </div>
          )}
        </div>

        <Button
          className="w-full h-12 font-bold"
          onClick={() => { resetToHome(); qc.invalidateQueries({ queryKey: ["/wallet/history"] }); }}
        >
          {t("wallet.backToWallet")}
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── MONCASH / NATCASH step ───────────────────────────────────────────────
  // =========================================================================
  if (step === "moncash" || step === "natcash") {
    const isReady = step === "moncash" ? haitiProviders?.moncash?.ready : haitiProviders?.natcash?.ready;
    const providerName = step === "moncash" ? "MonCash" : "NatCash";

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <BackButton onClick={() => goBack()} />
        <div>
          <h1 className="text-2xl font-black">{providerName} Recharge</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("wallet.moncashSubtitle")}</p>
        </div>

        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-muted-foreground">{t("wallet.todayRate")}</span>
          <span className="font-bold text-primary">1 USD = G {quoteData?.rateUsed ?? balance?.rateHtgToUsd ?? 130}</span>
          {(balance?.bonusPct ?? 0) > 0 && (
            <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 font-bold">
              +{balance?.bonusPct}% bonus
            </Badge>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("wallet.quickAmounts")}</p>
          <div className="grid grid-cols-2 gap-2">
            {TOPUP_AMOUNTS_HTG.map(htg => {
              const usd = balance ? (htg / balance.rateHtgToUsd) : htg / 130;
              const bonus = balance ? usd * (balance.bonusPct / 100) : 0;
              return (
                <button
                  key={htg}
                  onClick={() => { setSelectedHtg(htg); setCustomHtg(""); }}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    selectedHtg === htg && !customHtg ? "border-primary/60 bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/30"
                  )}
                >
                  <p className="text-base font-black">G {htg.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    ≈ <span className="font-semibold text-primary">${(usd + bonus).toFixed(2)}</span>
                    {bonus > 0 && <span className="text-green-400 ml-1">(+${bonus.toFixed(2)} bonus)</span>}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t("wallet.customAmountHtg")}</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">G</span>
            <Input type="number" min={100} placeholder="500" value={customHtg} onChange={e => setCustomHtg(e.target.value)} className="pl-8" style={{ fontSize: 16 }} />
          </div>
          {finalHtg >= 100 && (
            <div className="mt-2 text-sm text-muted-foreground p-3 rounded-lg border border-border bg-muted/30 flex items-center justify-between">
              {isQuoteLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Loading quote...</span>
                </div>
              ) : (
                <>
                  <span className="font-medium text-foreground">Net Credit</span>
                  <div className="text-right">
                    <span className="font-bold text-primary">${previewTotal.toFixed(2)}</span>
                    {previewBonus > 0 && <span className="text-green-500 text-xs ml-1">(+${previewBonus.toFixed(2)} bonus)</span>}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">Phone Number</p>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="tel" placeholder="+509 ..." value={phone} onChange={e => setPhone(e.target.value)} className="pl-9" style={{ fontSize: 16 }} />
          </div>
        </div>

        {isReady ? (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-3">
            <p className="text-xs text-blue-800 dark:text-blue-300">
              You will be redirected securely to {providerName}. Flexa does not store your PIN or OTP.
            </p>
          </div>
        ) : step === "natcash" ? (
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl p-3">
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {t("wallet.awaitingApiActivation", "Awaiting API activation")}
            </p>
          </div>
        ) : null}

        <Button
          className="w-full h-12 font-bold text-base"
          disabled={!finalHtg || finalHtg < 100 || initiateMut.isPending || haitiInitiateMut.isPending || (step === "natcash" && !isReady) || isQuoteLoading || !phone}
          onClick={() => {
            if (isReady) {
              haitiInitiateMut.mutate({ provider: step, amountHtg: finalHtg, phone });
            } else if (step === "moncash") {
              initiateMut.mutate(finalHtg);
            }
          }}
        >
          {initiateMut.isPending || haitiInitiateMut.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.creating")}</>
            : t("wallet.continueRecharge", { amount: finalHtg.toLocaleString() })
          }
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── CARD step ────────────────────────────────────────────────────────────
  // =========================================================================
  if (step === "card") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <BackButton onClick={() => goBack()} />
        <div>
          <h1 className="text-2xl font-black">{t("wallet.cardTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("wallet.cardTitleSub")}</p>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
          <CreditCard className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-foreground">{t("wallet.cardStripeDesc")}</p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("wallet.quickAmountsUsd")}</p>
          <div className="grid grid-cols-4 gap-2">
            {TOPUP_AMOUNTS_USD.map(usd => (
              <button
                key={usd}
                onClick={() => { setCardAmountUsd(usd); setCustomCardUsd(""); }}
                className={cn(
                  "rounded-xl border p-3 text-center transition-all",
                  cardAmountUsd === usd && !customCardUsd ? "border-primary/60 bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-muted/30"
                )}
              >
                <p className="text-sm font-black">${usd}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t("wallet.customAmountUsd")}</p>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">$</span>
            <Input
              type="number" min={1} max={500} placeholder="10.00"
              value={customCardUsd} onChange={e => setCustomCardUsd(e.target.value)}
              className="pl-8" style={{ fontSize: 16 }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{t("wallet.cardMinMax")}</p>
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-4 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">{t("wallet.youAreCharging")}</span>
          <span className="text-2xl font-black text-primary">${finalCardUsd > 0 ? finalCardUsd.toFixed(2) : "0.00"}</span>
        </div>

        {/* ── Chargeback warning ────────────────────────────────────────── */}
        <div className="flex items-start gap-3 rounded-2xl border border-red-200/70 bg-red-50/60 dark:bg-red-950/20 dark:border-red-900/40 px-4 py-3.5 shadow-[0_1px_4px_0_rgba(220,38,38,0.06)]">
          <div className="shrink-0 mt-0.5 w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800 flex items-center justify-center">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-red-500">
              <path d="M6.5 1a5.5 5.5 0 1 0 0 11A5.5 5.5 0 0 0 6.5 1Zm0 10a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z" fill="currentColor"/>
              <path d="M6.5 7.5a.5.5 0 0 1-.5-.5V4a.5.5 0 0 1 1 0v3a.5.5 0 0 1-.5.5ZM6.5 9.25a.625.625 0 1 0 0-1.25.625.625 0 0 0 0 1.25Z" fill="currentColor"/>
            </svg>
          </div>
          <div className="space-y-0.5">
            <p className="text-[12px] font-bold text-red-700 dark:text-red-400 leading-snug">
              {t("wallet.chargebackWarningTitle")}
            </p>
            <p className="text-[11.5px] text-red-600/80 dark:text-red-400/70 leading-[1.5]">
              {t("wallet.chargebackWarningBody")}
            </p>
          </div>
        </div>

        <Button
          className="w-full h-12 font-bold text-base"
          disabled={!finalCardUsd || finalCardUsd < 1 || finalCardUsd > 500 || cardSessionMut.isPending}
          onClick={() => cardSessionMut.mutate(finalCardUsd)}
        >
          {cardSessionMut.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.preparing")}</>
            : <><CreditCard className="h-5 w-5 mr-2" />{t("wallet.payWithCard", { amount: finalCardUsd.toFixed(2) })}</>
          }
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("wallet.stripeNotice")}</p>
      </div>
    );
  }

  // =========================================================================
  // ── REDEEM CARD step (Kòd Rechaj FM) ─────────────────────────────────────
  // =========================================================================
  if (step === "redeem_card") {
    return (
      <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-5">
        <BackButton onClick={() => { goBack(); setRedeemCode(""); setRedeemSuccess(null); }} />

        {redeemSuccess ? (
          <div className="flex flex-col items-center gap-6 py-6">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black text-foreground">{t("wallet.redeemSuccessTitle")}</h2>
              <p className="text-4xl font-black text-green-500 mt-2">${redeemSuccess.amountUsd.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">{t("wallet.redeemSuccessSub")}</p>
            </div>
            <Button className="w-full h-12 font-bold text-base" onClick={() => resetToHome()}>
              {t("wallet.redeemBackWallet")}
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-[21px] sm:text-2xl font-bold tracking-tight text-[#0B1F3A] dark:text-foreground">{t("wallet.redeemTitle")}</h1>
              <p className="text-sm text-slate-500 dark:text-muted-foreground">{t("wallet.redeemSubtitle")}</p>
            </div>

            {/* Card visual */}
            <div className="rounded-2xl p-5 text-white relative overflow-hidden shadow-sm" style={{ background: "linear-gradient(135deg, #f97316 0%, #dc2626 50%, #7c3aed 100%)" }}>
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.3) 10px, rgba(255,255,255,0.3) 11px)" }} />
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                    <span className="text-xs font-black">FM</span>
                  </div>
                  <span className="font-black text-sm tracking-wider">FLEXA MARKET</span>
                </div>
                <Gift className="h-6 w-6 opacity-70" />
              </div>
              <p className="text-xs opacity-70 mb-1 font-semibold uppercase tracking-widest">{t("wallet.redeemPinLabel")}</p>
              <p className="font-mono text-2xl font-black tracking-[4px] text-white/90">
                {redeemCode.toUpperCase() || "FM-XXXX-XXXX"}
              </p>
              <p className="text-xs opacity-60 mt-3">{t("wallet.redeemInstant")}</p>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <label className="text-sm font-semibold">{t("wallet.redeemEnterPin")}</label>
              <Input
                type="text"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                placeholder="FM-XXXX-XXXX"
                className="h-14 text-center font-mono text-lg font-bold tracking-[3px] uppercase"
                maxLength={12}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                onKeyDown={e => { if (e.key === "Enter" && redeemCode.trim().length >= 5) redeemMut.mutate(redeemCode.trim()); }}
              />
              <Button
                className="w-full h-12 font-bold text-base bg-green-600 hover:bg-green-700"
                disabled={!redeemCode.trim() || redeemMut.isPending}
                onClick={() => redeemMut.mutate(redeemCode.trim())}
              >
                {redeemMut.isPending
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.redeemVerifying")}</>
                  : <><CheckCircle className="h-5 w-5 mr-2" />{t("wallet.redeemUseCode")}</>
                }
              </Button>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">{t("wallet.redeemHint")}</p>
            </div>
          </>
        )}
      </div>
    );
  }

  // =========================================================================
  // ── TOPUP step ───────────────────────────────────────────────────────────
  // =========================================================================
  if (step === "topup") {
    const methods: { id: string; label: string; sub: string; badge?: string; disabled?: boolean; icon: React.ReactNode; color: string }[] = [];

    if (isHaiti) {
      methods.push({
        id: "moncash",
        label: "MonCash (HTG)",
        sub: "Recharge via MonCash (Official)",
        badge: haitiProviders?.moncash?.ready ? "Ready" : undefined,
        icon: <Phone className="h-6 w-6" />,
        color: "text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400",
      });
      methods.push({
        id: "natcash",
        label: "NatCash (HTG)",
        sub: "Recharge via NatCash",
        badge: haitiProviders?.natcash?.ready ? "Ready" : t("wallet.awaitingApiActivation", "Awaiting API activation"),
        disabled: !haitiProviders?.natcash?.ready,
        icon: <Phone className="h-6 w-6" />,
        color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
      });
    }

    methods.push(
      {
        id: "card",
        label: t("wallet.topupMethodCard"),
        sub: t("wallet.topupMethodCardSub"),
        icon: <CreditCard className="h-6 w-6" />,
        color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400",
      },
      {
        id: "agents",
        label: t("wallet.topupMethodAgents"),
        sub: t("wallet.topupMethodAgentsSub"),
        badge: "⚡ Rapid",
        icon: <Users className="h-6 w-6" />,
        color: "text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400",
      },
      {
        id: "crypto",
        label: t("wallet.topupMethodCrypto"),
        sub: t("wallet.topupMethodCryptoSub"),
        icon: <span className="text-2xl font-black leading-none">₮</span>,
        color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30 dark:text-purple-400",
      }
    );

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div>
          <h1 className="text-2xl font-black">{t("wallet.topupTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("wallet.topupSubtitle")}</p>
        </div>

        {/* Method cards */}
        <div className="space-y-3">
          {methods.map(m => {
            const selected = selectedTopupMethod === m.id;
            return (
              <button
                key={m.id}
                type="button"
                disabled={m.disabled}
                onClick={() => setSelectedTopupMethod(m.id)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : m.disabled ? "border-border bg-muted/20 opacity-60 cursor-not-allowed" : "border-border bg-card hover:border-primary/30 hover:bg-muted/20"
                )}
              >
                <div className={cn(
                  "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                  selected ? "border-primary" : "border-muted-foreground/40"
                )}>
                  {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </div>

                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", m.color)}>
                  {m.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-foreground">{m.label}</p>
                    {m.badge && (
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                        m.disabled ? "bg-muted text-muted-foreground" : "bg-green-500/15 text-green-600 dark:text-green-400"
                      )}>
                        {m.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>
                </div>
              </button>
            );
          })}
        </div>

        <Button
          className="w-full h-12 font-bold text-base"
          disabled={methods.find(m => m.id === selectedTopupMethod)?.disabled}
          onClick={() => {
            if (selectedTopupMethod === "agents") { setLocation("/wallet/agents"); }
            else if (selectedTopupMethod === "crypto") { navigateTo("crypto"); }
            else if (selectedTopupMethod === "moncash" || selectedTopupMethod === "natcash") { navigateTo(selectedTopupMethod as Step); }
            else { navigateTo("card"); }
          }}
        >
          {t("wallet.continueBtn")}
        </Button>

        <div className="rounded-xl border border-border p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{t("wallet.paymentSecure")}</p>
        </div>
      </div>
    );
  }

  if (step === "crypto") {
    const usdtTrc20 = "TFleXaMarketUSDTAddressTRC20Placeholder";
    const usdtErc20 = "0xFleXaMarketUSDTAddressERC20Placeholder";
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-xl font-black">₮</div>
            <div>
              <h1 className="text-xl font-black">USDT Transfer</h1>
              <p className="text-xs text-muted-foreground">Tether USD · Crypto recharge</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">TRC-20 (Tron)</p>
            <div className="flex items-center gap-2 bg-muted/40 rounded-xl p-3">
              <code className="text-xs break-all flex-1 font-mono text-foreground">{usdtTrc20}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(usdtTrc20); toast({ title: t("wallet.shareCopied", { defaultValue: "Copied!" }) }); }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
              >
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">ERC-20 (Ethereum)</p>
            <div className="flex items-center gap-2 bg-muted/40 rounded-xl p-3">
              <code className="text-xs break-all flex-1 font-mono text-foreground">{usdtErc20}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(usdtErc20); toast({ title: t("wallet.shareCopied", { defaultValue: "Copied!" }) }); }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0"
              >
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1.5">
          <p className="text-xs font-bold text-amber-800 dark:text-amber-400">⚠️ Enpòtan / Important</p>
          <ul className="text-xs text-amber-700 dark:text-amber-500 space-y-1">
            <li>• Voye sèlman USDT — pa BNB, ETH, TRON oswa lòt</li>
            <li>• Minimòm: $10 USDT · Maksimòm: $5,000 USDT</li>
            <li>• 3-6 konfòmasyon blòk yo obligatwa</li>
            <li>• Kredi otomatik apre konfòmasyon (5–30 min)</li>
          </ul>
        </div>

        <div className="rounded-xl border border-border p-3 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">Apre voye, kontakte sipò ak prèv tranzaksyon ou a pou konfirmasyon rapide.</p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ── SEND CONFIRM step ─────────────────────────────────────────────────────
  // =========================================================================
  if (step === "send_confirm" && recipient) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div className="text-center space-y-1">
          <p className="text-2xl font-black">{t("wallet.confirmTransfer")}</p>
          <p className="text-sm text-muted-foreground">{t("wallet.confirmTransferSub")}</p>
        </div>

        {/* Recipient card */}
        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-black text-xl shrink-0">
            {recipient.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="font-black text-lg text-foreground truncate">{recipient.name}</p>
            <p className="font-mono text-sm text-muted-foreground tracking-widest">{recipient.accountNumber}</p>
          </div>
        </div>

        {/* Amount + fee breakdown */}
        <FeeBreakdown
          amount={sendAmt}
          feeRatePct={TRANSFER_FEE_PCT}
          mode="transfer"
          balance={availableUsd}
        />
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {t("wallet.balanceAfter")} <span className="font-bold text-foreground">${Math.max(0, (balance?.balanceUsd ?? 0) - sendAmt).toFixed(2)}</span>
          </p>
        </div>

        {sendAmt >= availableUsd - 0.005 && availableUsd > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-300">{t("wallet.minBalanceWarning")}</p>
          </div>
        )}

        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">{t("wallet.transferWarning")}</p>
        </div>

        <Button
          className="w-full h-12 font-bold text-base"
          disabled={!!user?.flexCardBlocked || transferMut.isPending}
          onClick={() => transferMut.mutate()}
        >
          {transferMut.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.submitting")}</>
            : <><Send className="h-5 w-5 mr-2" />{t("wallet.confirmSendBtn")} {sendCurrency === "USDT" ? "₮" : "$"}{sendAmt.toFixed(2)} {sendCurrency}</>
          }
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => goBack()}>{t("wallet.cancel")}</Button>
      </div>
    );
  }

  // =========================================================================
  // ── SEND step ─────────────────────────────────────────────────────────────
  // =========================================================================
  if (step === "send") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div className="space-y-1">
          <h2 className="text-2xl font-black">{t("wallet.sendTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("wallet.sendSubtitle")}</p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-4">
          {/* Account number field */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("wallet.recipientAccount")}</label>
            <div className="relative">
              <Input
                value={toAccount}
                onChange={e => handleAccountInput(e.target.value)}
                placeholder="FM-XXXXXX"
                className={cn(
                  "font-mono text-base tracking-widest pr-10",
                  lookupState === "found" && "border-green-400 focus-visible:ring-green-400",
                  lookupState === "error" && "border-red-400 focus-visible:ring-red-400",
                )}
                style={{ fontSize: 16 }}
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {lookupState === "loading" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {lookupState === "found" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {lookupState === "error" && <XCircle className="h-4 w-4 text-red-500" />}
              </div>
            </div>
            {lookupState === "found" && recipient && (
              <div className="flex items-center gap-2 mt-1 text-sm text-green-400 font-medium">
                <User className="h-4 w-4" />
                {recipient.name}
              </div>
            )}
            {lookupState === "error" && (
              <p className="text-xs text-red-500 mt-1">{lookupError}</p>
            )}
          </div>

          {/* Currency toggle */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("wallet.currency")}</label>
            <div className="flex gap-2">
              {(["USD", "USDT"] as const).map(cur => (
                <button
                  key={cur}
                  onClick={() => setSendCurrency(cur)}
                  className={cn(
                    "flex-1 py-2 rounded-xl text-sm font-bold border transition-colors",
                    sendCurrency === cur
                      ? "bg-primary text-white border-primary"
                      : "bg-muted/40 text-muted-foreground border-border hover:border-primary/40"
                  )}
                >
                  {cur === "USDT" ? t("wallet.usdtCurrency") : t("wallet.usdCurrency")}
                </button>
              ))}
            </div>
            {sendCurrency === "USDT" && (
              <p className="text-xs text-emerald-400">{t("wallet.usdtRate")}</p>
            )}
          </div>

          {/* Amount field */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("wallet.amountLabel", { currency: sendCurrency })}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold">
                {sendCurrency === "USDT" ? "₮" : "$"}
              </span>
              <Input
                type="number"
                value={sendAmount}
                onChange={e => setSendAmount(e.target.value)}
                placeholder="0.00"
                min="0.01"
                step="0.01"
                max={availableUsd}
                className="pl-7"
                style={{ fontSize: 16 }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("wallet.availBalance")}</span>
              <button
                className="font-bold text-primary hover:underline"
                onClick={() => setSendAmount(availableUsd.toFixed(2))}
              >
                {sendCurrency === "USDT" ? "₮" : "$"}{availableUsd.toFixed(2)} {t("wallet.allBalance")}
              </button>
            </div>
          </div>

          {/* Quick amounts */}
          {availableUsd > 0 && (
            <div className="flex gap-2 flex-wrap">
              {[1, 5, 10, 25].filter(a => a <= availableUsd).map(a => (
                <button
                  key={a}
                  onClick={() => setSendAmount(String(a))}
                  className="rounded-lg border border-border bg-muted/40 px-3 py-1 text-xs font-bold hover:bg-primary/10 hover:border-primary/40 transition-colors"
                >
                  {sendCurrency === "USDT" ? "₮" : "$"}{a}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Live fee breakdown */}
        {sendAmt > 0 && (
          <FeeBreakdown
            amount={sendAmt}
            feeRatePct={TRANSFER_FEE_PCT}
            mode="transfer"
            balance={availableUsd}
          />
        )}

        <Button
          className="w-full h-12 font-bold text-base"
          disabled={!canSendConfirm || lookupState !== "found"}
          onClick={() => navigateTo("send_confirm")}
        >
          {t("wallet.verifyAndConfirm")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("wallet.transferImmediate")}</p>
      </div>
    );
  }

  // =========================================================================
  // ── CASHOUT step ─────────────────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout") {
    const canSubmit = cashoutAmt >= 1 &&
      cashoutAmt <= availableUsd &&
      (cashoutMethod !== "moncash" || (
        cashoutRecipientFirstName.trim().length > 0 &&
        cashoutRecipientLastName.trim().length > 0
      )) &&
      (isMoncashOrNatcash ? cashoutPhone.trim().length >= 8
        : cashoutMethod === "agent_transfer" ? true
        : cashoutAgentLoc.trim().length >= 3);

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => { setCashoutRetraitOnly(false); goBack(); }} />

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownCircle className="h-6 w-6 text-violet-500" />
            <h1 className="text-2xl font-black">{t("wallet.cashoutTitle")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t("wallet.cashoutSubtitle")}</p>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">{t("wallet.amountLabel", { currency: "USD" })}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-sm">$</span>
            <Input
              type="number"
              min={1}
              step={0.01}
              value={cashoutAmount}
              onChange={e => setCashoutAmount(e.target.value)}
              placeholder="0.00"
              className="pl-7 text-lg font-bold"
              style={{ fontSize: 16 }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{t("wallet.availBalance")}</span>
            <button
              className="font-bold text-primary hover:underline"
              onClick={() => setCashoutAmount(availableUsd.toFixed(2))}
            >
              ${availableUsd.toFixed(2)} {t("wallet.allBalance")}
            </button>
          </div>
          {balance?.cashoutRateHtgToUsd ? (
            <div className="flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs dark:border-violet-800/60 dark:bg-violet-950/20">
              <span className="font-semibold text-violet-800 dark:text-violet-300">{t("wallet.cashoutRateLabel")}</span>
              <span className="font-black text-violet-700 dark:text-violet-300">
                {t("wallet.cashoutRateDisplay", { rate: balance.cashoutRateHtgToUsd })}
              </span>
            </div>
          ) : null}
          <div className="flex gap-2 flex-wrap">
            {[5, 10, 25, 50].filter(a => a <= availableUsd).map(a => (
              <button
                key={a}
                onClick={() => setCashoutAmount(String(a))}
                className="rounded-lg border border-border bg-muted/40 px-3 py-1 text-xs font-bold hover:bg-primary/10 hover:border-primary/40 transition-colors"
              >
                ${a}
              </button>
            ))}
          </div>
        </div>

        {/* Live fee breakdown */}
        {cashoutAmt > 0 && (
          <FeeBreakdown
            amount={cashoutAmt}
            feeRatePct={CASHOUT_FEE_PCT}
            mode="cashout"
            balance={availableUsd}
            rateHtgToUsd={balance?.cashoutRateHtgToUsd}
            serverQuote={(isMoncashOrNatcash && quoteData) ? quoteData : undefined}
          />
        )}

        {/* Method */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">{t("wallet.cashoutMethodLabel")}</label>
          <div className="grid grid-cols-2 gap-2">
            {(cashoutRetraitOnly
              ? (["agent_transfer"] as const)
              : isHaiti
                ? (["moncash", "natcash", "agent", "agent_transfer"] as const)
                : (["agent", "agent_transfer"] as const)
            ).map(m => {
              const cfg = {
                moncash:       { icon: <Phone className="h-5 w-5 text-red-500" />,     label: "MonCash",          sub: t("wallet.viaApi") },
                natcash:       { icon: <Phone className="h-5 w-5 text-blue-500" />,    label: "NatCash",          sub: t("wallet.viaApi") },
                agent:         { icon: <MapPin className="h-5 w-5 text-orange-500" />, label: t("wallet.agentPickup"), sub: t("wallet.secretCode") },
                agent_transfer: { icon: <Users className="h-5 w-5 text-green-500" />,  label: t("wallet.authorizedAgent"), sub: t("wallet.rapid") },
              }[m];
              return (
                <button
                  key={m}
                  onClick={() => setCashoutMethod(m)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all",
                    cashoutMethod === m ? "border-violet-500 bg-violet-500/10" : "border-border bg-card hover:border-violet-400/30"
                  )}
                >
                  {cfg.icon}
                  <span className="text-[11px] font-bold leading-tight">{cfg.label}</span>
                  <span className="text-[9px] text-muted-foreground">{cfg.sub}</span>
                </button>
              );
            })}

          </div>
        </div>

        {/* Method-specific input */}
        {isMoncashOrNatcash && (
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              {cashoutMethod === "moncash" ? t("wallet.moncashRecipientPhone") : t("wallet.yourNatcashNumber")}
            </label>
            <Input
              type="tel"
              value={cashoutPhone}
              onChange={e => setCashoutPhone(e.target.value)}
              placeholder="+509 3612 3456"
              autoComplete="tel"
              style={{ fontSize: 16 }}
            />
            <p className="text-xs text-muted-foreground">{cashoutMethod === "moncash" ? t("wallet.moncashRecipientPhoneHint") : t("wallet.cashoutPhoneHint")}</p>
          </div>
        )}
        {cashoutMethod === "moncash" && (
          <div className="space-y-3 rounded-xl border border-violet-500/25 bg-violet-500/5 p-4">
            <p className="text-sm font-semibold">{t("wallet.moncashRecipientNameTitle")}</p>
            <p className="text-xs text-muted-foreground">{t("wallet.moncashRecipientNameHint")}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="moncash-first-name" className="text-xs font-semibold">{t("wallet.moncashRecipientFirstName")}</label>
                <Input
                  id="moncash-first-name"
                  value={cashoutRecipientFirstName}
                  onChange={e => setCashoutRecipientFirstName(e.target.value)}
                  maxLength={80}
                  autoComplete="off"
                  autoCapitalize="words"
                  style={{ fontSize: 16 }}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="moncash-last-name" className="text-xs font-semibold">{t("wallet.moncashRecipientLastName")}</label>
                <Input
                  id="moncash-last-name"
                  value={cashoutRecipientLastName}
                  onChange={e => setCashoutRecipientLastName(e.target.value)}
                  maxLength={80}
                  autoComplete="off"
                  autoCapitalize="words"
                  style={{ fontSize: 16 }}
                />
              </div>
            </div>
          </div>
        )}
        {cashoutMethod === "agent" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />{t("wallet.agentLocation")}
            </label>
            <Input
              value={cashoutAgentLoc}
              onChange={e => setCashoutAgentLoc(e.target.value)}
              placeholder={t("wallet.agentLocationPlaceholder")}
              style={{ fontSize: 16 }}
            />
            <p className="text-xs text-muted-foreground">{t("wallet.agentSecretHint")}</p>
          </div>
        )}
        {cashoutMethod === "agent_transfer" && (
          <div className="rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 p-3 flex items-start gap-2">
            <Users className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            <div className="text-xs text-green-800 dark:text-green-400">
              <p className="font-bold mb-0.5">{t("wallet.authorizedAgentInfoTitle")}</p>
              <p>{t("wallet.authorizedAgentInfo")}</p>
            </div>
          </div>
        )}

        {cashoutAmt >= availableUsd - 0.005 && availableUsd > 0 && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 dark:text-blue-300">{t("wallet.minBalanceWarning")}</p>
          </div>
        )}

        {/* Warning */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {cashoutMethod === "agent_transfer"
              ? t("wallet.authorizedAgentWarning")
              : cashoutMethod === "moncash"
                ? t("wallet.moncashCashoutWarning")
              : t("wallet.cashoutDigitalWarning")}
          </p>
        </div>

        <Button
          className="w-full h-14 font-bold text-base bg-violet-600 hover:bg-violet-700"
          disabled={!!user?.flexCardBlocked || !canSubmit}
          onClick={() => {
            if (cashoutMethod === "agent_transfer") {
              navigateTo("cashout_agent_select");
              return;
            }
            setOtpPhone(isMoncashOrNatcash ? cashoutPhone.trim() : (user?.phone ?? ""));
            setOtpSent(false);
            setOtpCode("");
            setOtpError("");
            setOtpDevCode(null);
            setOtpCountdown(0);
            navigateTo("cashout_phone_verify");
          }}
        >
          <ArrowDownCircle className="h-5 w-5 mr-2" />
          {cashoutMethod === "agent_transfer" ? t("wallet.chooseAuthorizedAgent", "Chwazi Ajan Otorize ⚡")
            : t("wallet.continueVerifyPhone", "Continue — Verify Phone")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("wallet.cashoutLimitsDesc", "Minimum $1.00 · Maximum based on balance · 2% fee")}</p>
      </div>
    );
  }

  // =========================================================================
  // ── CASHOUT AGENT SELECT step ─────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout_agent_select") {
    return (
      <Suspense fallback={<PageSkeleton />}>
        <AgentSelectStep
          cashoutAmount={cashoutAmount}
          onBack={() => goBack()}
          onSelect={(agent) => { setSelectedAgent(agent); navigateTo("cashout_agent_pay"); }}
        />
      </Suspense>
    );
  }

  // =========================================================================
  // ── CASHOUT AGENT PAY step ────────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout_agent_pay" && selectedAgent) {
    const fmNum = selectedAgent.fmWalletNumber ?? selectedAgent.accountNumber ?? "—";
    const grossAmt = parseFloat(cashoutAmount) || 0;
    const feeAmt = Math.round(grossAmt * 0.02 * 100) / 100;
    const netAmt = Math.round((grossAmt - feeAmt) * 100) / 100;
    const methods = selectedAgent.supportedMethods
      ? selectedAgent.supportedMethods.split(",").map(s => s.trim()).filter(Boolean)
      : ["MonCash", "Zelle", "Cash"];

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-6 w-6 text-green-500" />
            <h1 className="text-2xl font-black">{t("wallet.cashoutAgentTitle")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t("wallet.cashoutAgentSubtitle")}</p>
        </div>

        {/* Agent card */}
        <div className="rounded-2xl border border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 font-black text-lg">
              {selectedAgent.fullName?.charAt(0) ?? "A"}
            </div>
            <div>
              <p className="font-bold">{selectedAgent.fullName}</p>
              {selectedAgent.businessName && <p className="text-xs text-muted-foreground">{selectedAgent.businessName}</p>}
              <p className="text-xs text-muted-foreground">📍 {selectedAgent.city}</p>
            </div>
            <div className="ml-auto flex flex-col items-end gap-1">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", selectedAgent.isOnline ? "bg-green-500/15 text-green-600" : "bg-muted text-muted-foreground")}>
                {selectedAgent.isOnline ? `🟢 ${t("wallet.agentOnline")}` : `⚫ ${t("wallet.agentOffline")}`}
              </span>
            </div>
          </div>
          <div className="border-t border-green-200 dark:border-green-800/50 pt-3 space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t("wallet.cashoutAgentFmLabel")}</p>
            <div className="flex items-center gap-2 bg-background rounded-xl p-3 border border-green-300 dark:border-green-700">
              <code className="text-base font-black text-green-700 dark:text-green-400 flex-1 tracking-widest">{fmNum}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(fmNum); toast({ title: t("wallet.cashoutAgentFmCopied") }); }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">{t("wallet.cashoutAgentFmHint")}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl border bg-card p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("wallet.cashoutAgentYouWithdraw")}</span>
            <span className="font-bold">${grossAmt.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("wallet.cashoutAgentFee")}</span>
            <span className="text-red-500">−${feeAmt.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-bold">{t("wallet.cashoutAgentDelivers")}</span>
            <span className="font-black text-green-600">${netAmt.toFixed(2)}</span>
          </div>
        </div>

        {/* Payout methods agent supports */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t("wallet.cashoutAgentMethodsLabel")}</p>
          <div className="flex flex-wrap gap-1.5">
            {methods.map(m => (
              <span key={m} className="text-xs font-semibold bg-muted px-2.5 py-1 rounded-full border border-border">{m}</span>
            ))}
          </div>
        </div>

        {/* Chat button */}
        <Button
          variant="outline"
          className="w-full h-11 border-2 border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20 font-bold text-sm gap-2"
          onClick={() => startChatAgentMut.mutate(selectedAgent.userId)}
          disabled={startChatAgentMut.isPending}
        >
          {startChatAgentMut.isPending
            ? <><Loader2 className="h-4 w-4 animate-spin" />{t("wallet.agentChatOpening")}</>
            : <><MessageCircle className="h-5 w-5" />{t("wallet.cashoutAgentChatBtn")}</>}
        </Button>

        {/* WhatsApp button */}
        {selectedAgent.whatsappNumber ? (
          <a
            href={`https://wa.me/${selectedAgent.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjou! M ap retire $${grossAmt.toFixed(2)} nan FM Wallet mwen. Nimewo ajan: ${fmNum}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl border-2 border-green-500 text-green-600 font-bold text-sm hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors"
          >
            <span className="text-lg">📱</span>{t("wallet.cashoutAgentWhatsappBtn")}
          </a>
        ) : (
          <div className="flex items-center justify-center gap-2 w-full h-11 rounded-xl border-2 border-muted text-muted-foreground text-sm">
            <span className="text-lg">📱</span>{t("wallet.cashoutAgentNoWhatsapp")}
          </div>
        )}

        <Button className="w-full h-12 font-bold bg-green-600 hover:bg-green-700" onClick={() => navigateTo("cashout_agent_proof")}>
          {t("wallet.cashoutAgentContinueBtn")}
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── CASHOUT AGENT PROOF step ──────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout_agent_proof" && selectedAgent) {
    const canSubmit = !!cashoutAgentScreenshotUrl && !cashoutAgentScreenshotUploading && !cashoutAgentTransferMut.isPending;

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Upload className="h-6 w-6 text-green-500" />
            <h1 className="text-2xl font-black">{t("wallet.cashoutAgentProofTitle")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{t("wallet.cashoutAgentProofSubtitle")}</p>
        </div>

        {/* Upload zone */}
        <div
          className={cn(
            "relative rounded-2xl border-2 border-dashed p-6 flex flex-col items-center gap-3 cursor-pointer transition-colors",
            cashoutAgentScreenshotFile ? "border-green-500 bg-green-50/50 dark:bg-green-950/20" : "border-border hover:border-green-400/50 hover:bg-muted/20"
          )}
          onClick={() => document.getElementById("agent-screenshot-input")?.click()}
        >
          <input
            id="agent-screenshot-input"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAgentScreenshotChange}
          />
          {cashoutAgentScreenshotPreview ? (
            <div className="w-full">
              <img src={cashoutAgentScreenshotPreview} alt="Screenshot" className="w-full max-h-64 object-contain rounded-xl" />
              {cashoutAgentScreenshotUploading && (
                <div className="flex items-center gap-2 justify-center mt-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />{t("wallet.uploading")}
                </div>
              )}
              {cashoutAgentScreenshotUrl && !cashoutAgentScreenshotUploading && (
                <p className="text-xs text-green-600 text-center mt-2 flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />{t("wallet.uploadSuccess")}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-center">{t("wallet.cashoutAgentChooseScreenshot")}</p>
              <p className="text-xs text-muted-foreground text-center">{t("wallet.cashoutAgentScreenshotFormats")}</p>
            </>
          )}
        </div>

        {/* Optional note */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">{t("wallet.cashoutAgentNoteLabel")}</label>
          <textarea
            value={cashoutAgentNote}
            onChange={e => setCashoutAgentNote(e.target.value)}
            placeholder={t("wallet.cashoutAgentNotePlaceholder")}
            rows={2}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        {/* Summary */}
        <div className="rounded-xl border bg-muted/30 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("wallet.cashoutAgentProofAgentLabel")}</span><span className="font-bold">{selectedAgent.fullName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("wallet.cashoutAgentProofGross")}</span><span className="font-bold">${parseFloat(cashoutAmount).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("wallet.cashoutAgentProofNet")}</span><span className="font-bold text-green-600">${Math.round((parseFloat(cashoutAmount) * 0.98) * 100) / 100}</span></div>
        </div>

        <Button
          className="w-full h-14 font-bold text-base bg-green-600 hover:bg-green-700"
          disabled={!!user?.flexCardBlocked || !canSubmit}
          onClick={() => cashoutAgentTransferMut.mutate()}
        >
          {cashoutAgentTransferMut.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.cashoutAgentSubmitting")}</>
            : <><CheckCircle2 className="h-5 w-5 mr-2" />{t("wallet.cashoutAgentSubmitBtn")}</>}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("wallet.cashoutAgentSubmitHint")}</p>
      </div>
    );
  }

  // =========================================================================
  // ── CASHOUT AGENT DONE step ───────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout_agent_done") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5 text-center">
        <div className="w-20 h-20 rounded-2xl bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-green-600">{t("wallet.cashoutAgentDoneTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {t("wallet.cashoutAgentDoneDesc", { name: selectedAgent?.fullName ?? "" })}
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4 space-y-2 text-sm text-left">
          <div className="flex justify-between"><span className="text-muted-foreground">{t("wallet.cashoutAgentDoneRequest")}</span><span className="font-mono font-bold">{cashoutResult?.requestId}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("wallet.cashoutAgentDoneNet")}</span><span className="font-bold text-green-600">${Math.round((parseFloat(cashoutAmount) * 0.98) * 100) / 100}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{t("wallet.cashoutAgentDoneStatus")}</span><Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">⏳ {t("wallet.cashoutAgentDoneStatusPending")}</Badge></div>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-800 dark:text-blue-400 text-left">
          <p className="font-bold mb-1">📋 {t("wallet.cashoutAgentDoneNextTitle")}</p>
          <ul className="space-y-1">
            <li>• {t("wallet.cashoutAgentDoneNext1")}</li>
            <li>• {t("wallet.cashoutAgentDoneNext2")}</li>
            <li>• {t("wallet.cashoutAgentDoneNext3")}</li>
          </ul>
        </div>
        {selectedAgent && (
          <Button
            variant="outline"
            className="w-full font-bold border-blue-500 text-blue-600 hover:bg-blue-50 gap-2"
            onClick={() => startChatAgentMut.mutate(selectedAgent.userId)}
            disabled={startChatAgentMut.isPending}
          >
            <MessageCircle className="h-4 w-4" />
            {startChatAgentMut.isPending ? t("wallet.agentChatOpening") : t("wallet.cashoutAgentChatBtn")}
          </Button>
        )}
        <Button className="w-full font-bold" onClick={() => resetToHome()}>
          {t("wallet.cashoutAgentDoneBack")}
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── CASHOUT PHONE VERIFY step ─────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout_phone_verify") {
    const mins = Math.floor(otpCountdown / 60);
    const secs = String(otpCountdown % 60).padStart(2, "0");
    const canResend = otpCountdown === 0;
    const canVerify = otpCode.trim().length === 6 && /^\d{6}$/.test(otpCode.trim()) && otpSent;
    const isSubmitting = verifyOtpMut.isPending || cashoutMut.isPending;

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />

        <div>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="h-6 w-6 text-violet-500" />
            <h1 className="text-2xl font-black">{t("wallet.verifyPhoneTitle")}</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("wallet.verifyPhoneDescription")}
          </p>
        </div>

        {/* Summary card */}
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{t("wallet.withdrawalAmount")}</p>
            <p className="text-2xl font-black text-violet-500">${parseFloat(cashoutAmount || "0").toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-0.5">{t("wallet.methodLabel")}</p>
            <p className="text-sm font-bold">{cashoutMethod === "moncash" ? "MonCash" : cashoutMethod === "natcash" ? "NatCash" : "Agent"}</p>
          </div>
        </div>

        {cashoutMethod === "moncash" && (
          <div className="rounded-xl border bg-card p-4 space-y-2 text-sm">
            <Row label={t("wallet.moncashRecipientNameTitle")} value={`${cashoutRecipientFirstName.trim()} ${cashoutRecipientLastName.trim()}`} />
            <Row label={t("wallet.moncashRecipientPhone")} value={cashoutPhone.trim()} />
            <p className="text-xs text-muted-foreground">{t("wallet.moncashRecipientReviewHint")}</p>
          </div>
        )}

        {/* Phone input */}
        <div className="space-y-2">
          <label className="text-sm font-semibold flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />{t("wallet.phoneNumberE164")}
          </label>
          <div className="flex gap-2">
            <Input
              type="tel"
              value={otpPhone}
              onChange={e => { setOtpPhone(e.target.value); setOtpSent(false); setOtpCode(""); setOtpError(""); }}
              placeholder="+509XXXXXXXX"
              className="flex-1"
              disabled={otpSent && otpCountdown > 0}
              style={{ fontSize: 16 }}
            />
            <Button
              variant="outline"
              className="shrink-0 border-violet-500 text-violet-500 hover:bg-violet-500/10"
              disabled={!!user?.flexCardBlocked || otpPhone.trim().length < 8 || (otpSent && !canResend) || sendOtpMut.isPending}
              onClick={() => {
                setOtpError("");
                sendOtpMut.mutate();
              }}
            >
              {sendOtpMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : otpSent && !canResend
                  ? `${mins}:${secs}`
                  : t("wallet.sendCodeBtn")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("wallet.codeSentViaHint")}
          </p>
        </div>

        {/* Dev code hint */}
        {otpDevCode && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-400">{t("wallet.developmentCode")}</p>
              <p className="font-mono text-lg font-black tracking-widest text-amber-700 dark:text-amber-300 mt-0.5">{otpDevCode}</p>
              <p className="text-xs text-amber-400 mt-0.5">{t("wallet.developmentCodeHint")}</p>
            </div>
          </div>
        )}

        {/* OTP input — shown after send */}
        {otpSent && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold">{t("wallet.otpCodeLabel")}</label>
              <Input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={otpCode}
                onChange={e => { setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(""); }}
                placeholder="000000"
                className="text-center text-3xl font-black tracking-[0.4em] h-16"
                style={{ fontSize: 28, letterSpacing: "0.4em" }}
                autoFocus
              />
              {otpCountdown > 0 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{t("wallet.codeExpiresIn")}
                  </span>
                  <span className={`font-mono font-bold ${otpCountdown < 60 ? "text-red-500" : "text-primary"}`}>
                    {mins}:{secs}
                  </span>
                </div>
              )}
              {otpCountdown === 0 && (
                <p className="text-xs text-red-500 text-center">{t("wallet.codeExpired")}</p>
              )}
            </div>

            {/* Delivery channel */}
            <div className="flex gap-2 justify-center text-xs text-muted-foreground">
              <span className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />{t("wallet.emailDelivery")}
              </span>
            </div>
          </div>
        )}

        {/* Error */}
        {otpError && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 p-3 flex gap-2">
            <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-700 dark:text-red-400">{otpError}</p>
          </div>
        )}

        {/* Verify button */}
        <Button
          className="w-full h-14 font-bold text-base bg-violet-600 hover:bg-violet-700"
          disabled={!canVerify || isSubmitting || otpCountdown === 0 || cashoutOutcomeUnknown}
          onClick={() => {
            setOtpError("");
            verifyOtpMut.mutate({ code: otpCode.trim() });
          }}
        >
          {isSubmitting
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.verifying")}</>
            : <><CheckCircle2 className="h-5 w-5 mr-2" />{t("wallet.verifyAndSubmitCashout")}</>}
        </Button>
        {cashoutOutcomeUnknown && (
          <div role="alert" className="rounded-xl border border-amber-400 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
            <p>{t("wallet.cashoutUnconfirmed")}</p>
            <Button type="button" variant="link" onClick={() => {
              resetToHome();
              setTimeout(() => document.getElementById("wallet-withdrawals")?.scrollIntoView({ behavior: "smooth" }), 80);
            }}>
              {t("wallet.myWithdrawals")}
            </Button>
          </div>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground">{t("wallet.didNotReceiveCode")}</p>
          {(!otpSent || otpCountdown === 0) && (
            <Button
              type="button"
              variant="link"
              className="text-violet-600 font-bold"
              disabled={sendOtpMut.isPending}
              onClick={() => {
                setOtpError("");
                sendOtpMut.mutate();
              }}
            >
              {sendOtpMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : t("wallet.sendCodeBtn")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // ── CASHOUT DONE step ─────────────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout_done" && cashoutResult) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5 text-center">
        <div className="w-16 h-16 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-violet-500" />
        </div>

        <div>
          <h2 className="text-2xl font-black mb-1">{t("wallet.requestSubmitted")}</h2>
          <p className="text-sm text-muted-foreground">{t("wallet.cashoutRequestId")}<span className="font-bold">{cashoutResult.requestId}</span> {t("wallet.registered").toLowerCase()}</p>
        </div>

        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 text-left space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">{t("wallet.howItWorks")}:</p>
          {cashoutMethod === "moncash" && cashoutResult.payoutStatus ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("wallet.moncashPayoutStatus")}</span>
                <span className="font-bold">
                  {t(`wallet.moncashPayoutStatus_${cashoutResult.payoutStatus}`)}
                </span>
              </div>
              {cashoutResult.payoutAmountHtg !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("wallet.amountToReceive")}</span>
                  <span className="font-black text-violet-500">
                    {cashoutResult.payoutAmountHtg.toLocaleString()} HTG
                  </span>
                </div>
              )}
              <p className="text-muted-foreground">
                {cashoutResult.payoutStatus === "paid"
                  ? t("wallet.moncashPayoutPaidHelp")
                  : cashoutResult.payoutStatus === "refunded"
                    ? t("wallet.moncashPayoutRefundedHelp")
                    : t("wallet.moncashPayoutPendingHelp")}
              </p>
            </div>
          ) : cashoutMethod === "agent" ? (
            <ol className="space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>{t("wallet.cashoutAgentStep1", "Admin approves your request (24h)")}</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>{t("wallet.cashoutAgentStep2", "You receive a 6-character secret code")}</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>{t("wallet.cashoutAgentStep3", "Go to the agent and show the code")}</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>{t("wallet.cashoutAgentStep4", "Agent verifies the code and pays you")}</li>
            </ol>
          ) : (
            <ol className="space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>{t("wallet.cashoutDigitalStep1", "Admin approves your request (24h)")}</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>{t("wallet.cashoutDigitalStep2", "Funds are sent to your digital account")}</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>{t("wallet.cashoutDigitalStep3", "You receive a payment notification")}</li>
            </ol>
          )}
        </div>

        <div className="rounded-xl bg-muted/50 border border-border p-3">
          <p className="text-xs text-muted-foreground">{t("wallet.cashoutCheckStatus")}</p>
        </div>

        <Button
          className="w-full h-12 font-bold"
          onClick={() => { resetToHome(); qc.invalidateQueries({ queryKey: ["/cashout/my"] }); }}
        >
          {t("wallet.backToWallet")}
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── MY CARD (Kat FM) ──────────────────────────────────────────────────────
  // =========================================================================
  if (step === "my_card") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => goBack()} />
        <div>
          <h1 className="text-2xl font-black">{t("wallet.myCardTitle", { defaultValue: "Your FM Card" })}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("wallet.myCardDesc", { defaultValue: "Share your account number to receive Flexa money — tap the card to flip it." })}
          </p>
        </div>

        <LazyVirtualCard
          balance={balance}
          isLoading={isLoading}
          userName={user?.name ?? ""}
          rechargePending={rechargePending}
          onCopy={() => {
            navigator.clipboard?.writeText(balance?.accountNumber ?? "");
            toast({ title: t("wallet.accountCopied") });
          }}
          onShare={handleShare}
          onQR={() => setShowQR(true)}
        />

        {/* Account number pill for easy copying */}
        {balance?.accountNumber && (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 px-5 py-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest mb-1">
                {t("wallet.fmAccountNumber", { defaultValue: "FM Account Number" })}
              </p>
              <p className="font-mono font-black text-xl text-primary tracking-widest">
                {balance.accountNumber}
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(balance.accountNumber ?? "");
                toast({ title: t("wallet.accountCopied") });
              }}
              className="flex items-center gap-1.5 text-xs text-primary font-bold hover:underline shrink-0"
            >
              <Copy className="h-3.5 w-3.5" /> {t("wallet.copyBtn", { defaultValue: "Copy" })}
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          {t("wallet.shareAccountHint", { defaultValue: "Give people your account number so they can send money directly to your FM wallet." })}
        </p>

        {showQR && balance?.accountNumber && (
          <Suspense fallback={null}>
            <QRModal accountNumber={balance.accountNumber} onClose={() => setShowQR(false)} />
          </Suspense>
        )}
      </div>
    );
  }

  // =========================================================================
  // ── CHOICE (Recharge / Cash Out selection — visual redesign only) ────────
  // =========================================================================
  if (step === "choice") {
    // Method lines use saved account country only (user.country) — never GPS/IP.
    const { recharge: rechargeMethods, withdraw: withdrawMethods } = walletChoiceMethodLines(isHaiti, {
      monCash: t("wallet.methodMonCash", { defaultValue: "MonCash" }),
      card: t("wallet.methodCard", { defaultValue: "Card" }),
      agent: t("wallet.methodAgent", { defaultValue: "Agent" }),
      crypto: t("wallet.methodCrypto", { defaultValue: "Crypto" }),
      transfer: t("wallet.methodTransfer", { defaultValue: "Transfer" }),
    });

    return (
      <div
        className="mx-auto w-full max-w-lg px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-4"
        data-testid="wallet-choice-page"
      >
        <BackButton onClick={() => goBack()} />

        <header className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0B1F3A]/10 text-[#0B1F3A] dark:bg-primary/15 dark:text-primary">
              <Wallet className="h-5 w-5" aria-hidden />
            </span>
            <h1 className="text-[21px] sm:text-2xl font-bold tracking-tight text-[#0B1F3A] dark:text-foreground">
              {t("wallet.choiceTitle", { defaultValue: "Choose an option" })}
            </h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-muted-foreground leading-snug">
            {t("wallet.choiceSubtitle", {
              defaultValue: "Select the transaction type you want to continue with",
            })}
          </p>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => navigateTo(isHaiti ? "topup" : "card")}
            className="group relative flex min-h-[152px] sm:min-h-[164px] flex-col rounded-2xl text-left overflow-hidden shadow-[0_6px_20px_rgba(16,185,129,0.18)] transition-[transform,filter] active:scale-[0.98] hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2"
            style={{
              background: "linear-gradient(165deg, #4ade80 0%, #22c55e 42%, #16a34a 100%)",
            }}
            data-testid="wallet-choice-recharge"
            aria-label={t("wallet.panelRechargeTitle")}
          >
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 opacity-40"
              style={{
                background:
                  "radial-gradient(90% 100% at 30% 120%, rgba(255,255,255,0.45), transparent 65%)",
              }}
              aria-hidden
            />
            <div className="relative flex h-full flex-col gap-2.5 px-3.5 py-4 sm:px-4 sm:py-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 ring-1 ring-white/35">
                  <ArrowUpCircle className="h-5 w-5 text-white" strokeWidth={1.75} aria-hidden />
                </div>
                <ChevronRight className="mt-1 h-4 w-4 text-white/75 opacity-80 group-hover:translate-x-0.5 transition-transform" aria-hidden />
              </div>
              <div className="mt-auto space-y-1 pr-1">
                <p className="text-[15px] sm:text-base font-bold text-white leading-tight">
                  {t("wallet.panelRechargeTitle")}
                </p>
                <p className="text-[11px] sm:text-xs text-white/90 leading-snug">
                  {t("wallet.panelRechargeDesc", {
                    defaultValue: "Add funds to your account",
                  })}
                </p>
                <p className="text-[10px] sm:text-[11px] font-medium text-white/80 leading-snug pt-0.5">
                  {rechargeMethods}
                </p>
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              setCashoutRetraitOnly(false);
              setCashoutMethod(isHaiti ? "moncash" : "agent");
              navigateTo("cashout");
            }}
            className="group relative flex min-h-[152px] sm:min-h-[164px] flex-col rounded-2xl text-left overflow-hidden shadow-[0_6px_20px_rgba(249,115,22,0.18)] transition-[transform,filter] active:scale-[0.98] hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 focus-visible:ring-offset-2"
            style={{
              background: "linear-gradient(165deg, #fb923c 0%, #f97316 45%, #ea580c 100%)",
            }}
            data-testid="wallet-choice-cashout"
            aria-label={t("wallet.panelWithdrawTitle")}
          >
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12 opacity-40"
              style={{
                background:
                  "radial-gradient(90% 100% at 70% 120%, rgba(255,255,255,0.45), transparent 65%)",
              }}
              aria-hidden
            />
            <div className="relative flex h-full flex-col gap-2.5 px-3.5 py-4 sm:px-4 sm:py-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 ring-1 ring-white/35">
                  <ArrowDownCircle className="h-5 w-5 text-white" strokeWidth={1.75} aria-hidden />
                </div>
                <ChevronRight className="mt-1 h-4 w-4 text-white/75 opacity-80 group-hover:translate-x-0.5 transition-transform" aria-hidden />
              </div>
              <div className="mt-auto space-y-1 pr-1">
                <p className="text-[15px] sm:text-base font-bold text-white leading-tight">
                  {t("wallet.panelWithdrawTitle")}
                </p>
                <p className="text-[11px] sm:text-xs text-white/90 leading-snug">
                  {t("wallet.panelWithdrawDesc", {
                    defaultValue: "Withdraw funds from your account",
                  })}
                </p>
                <p className="text-[10px] sm:text-[11px] font-medium text-white/80 leading-snug pt-0.5">
                  {withdrawMethods}
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ── HOME (PRO MAX responsive visual redesign — logic unchanged) ──────────
  // =========================================================================
  const showOverview = homeTab === "overview";
  const showPromo = homeTab === "promo";
  const showTx = homeTab === "transactions";

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4 pb-24 space-y-3 sm:px-4 lg:px-6">

      {/* ── Return-to-app banner ──────────────────────────────────────────── */}
      {showReturnApp && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-950/20 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">📱</span>
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300 truncate">
              Tap to return to Flexa Market app.
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 active:bg-orange-700 transition-colors"
            onClick={() => { window.location.href = "flexamarket://"; }}
          >
            Open App
          </button>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => stepStack.length > 0 ? goBack() : window.history.back()}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label={t("wallet.back", { defaultValue: "Back" })}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Wallet className="h-5 w-5 text-emerald-700 shrink-0" />
          <h1 className="text-lg font-black text-foreground truncate">{t("wallet.myWallet")}</h1>
          {isSuperAdmin && (
            <span
              className="hidden xs:inline-flex sm:inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold shrink-0"
              style={{
                background: "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)",
                color: "#1a1205",
                boxShadow: "0 1px 4px rgba(217,119,6,0.35)",
              }}
            >
              <Crown className="h-3 w-3" /> Super Admin
            </span>
          )}
        </div>
        <button
          onClick={async () => {
            if (isHaiti) {
              await qc.invalidateQueries({ queryKey: ["/wallet/haiti/reconcile"] });
            }
            await Promise.all([
              qc.invalidateQueries({ queryKey: ["/wallet/balance"] }),
              qc.invalidateQueries({ queryKey: ["/wallet/history"] }),
            ]);
            if (isSuperAdmin) await loadPlatformRev();
          }}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label={t("wallet.refresh")}
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* ── Presentation tabs (scroll/filter existing home sections) ──────── */}
      <div
        className="flex items-center gap-1 rounded-full p-1 bg-white border border-emerald-100 shadow-sm"
        role="tablist"
        aria-label={t("wallet.title", { defaultValue: "Wallet" })}
      >
        {([
          { id: "overview" as const, label: t("wallet.tabOverview", { defaultValue: "Overview" }), Icon: LayoutGrid },
          { id: "promo" as const, label: t("wallet.tabPromo", { defaultValue: "Promo Account" }), Icon: Gift },
          { id: "transactions" as const, label: t("wallet.tabTransactions", { defaultValue: "Transactions" }), Icon: Clock },
        ]).map(({ id, label, Icon }) => {
          const active = homeTab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setHomeTab(id)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-2 text-xs font-bold transition-all",
                active
                  ? "bg-emerald-800 text-white shadow-sm"
                  : "text-emerald-900/70 hover:bg-emerald-50"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {showOverview && (
        <>
      {/* ══ Admin + personal wallet cards — side-by-side from md when Super Admin ══ */}
      <div className={cn(
        "grid grid-cols-1 gap-3",
        isSuperAdmin && "md:grid-cols-2 md:items-stretch"
      )}>
      {/* ══ FLEXA WALLET HERO CARD ══════════════════════════════════════════════ */}
      <div
        className="relative rounded-2xl overflow-hidden h-full"
        style={{
          border: "1px solid rgba(16,185,129,0.35)",
          boxShadow: "0 8px 28px rgba(6,78,59,0.22)",
          background: "linear-gradient(145deg,#064e3b 0%,#065f46 42%,#047857 100%)",
        }}
      >
        {/* gold light streak */}
        <div className="absolute pointer-events-none" style={{
          right: "12%", top: "-30%", width: "2px", height: "170%",
          background: "linear-gradient(180deg, transparent 0%, rgba(251,191,36,0) 20%, rgba(252,211,77,0.85) 48%, rgba(245,158,11,0.45) 58%, transparent 100%)",
          transform: "rotate(-28deg)",
          filter: "blur(0.4px)",
        }} />
        <div className="absolute pointer-events-none opacity-40" style={{
          right: "-8%", bottom: "-20%", width: "55%", height: "70%",
          background: "radial-gradient(ellipse at center, rgba(251,191,36,0.28) 0%, transparent 70%)",
        }} />

        <div className="relative p-3.5 sm:p-4 flex flex-col h-full min-h-[168px]">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(145deg,#059669 0%,#10b981 100%)",
                  boxShadow: "0 0 0 2px rgba(251,191,36,0.35)",
                }}
              >
                <span className="text-white font-black text-sm leading-none italic">F</span>
              </div>
              <div className="min-w-0">
                <p className="text-white font-black text-xs sm:text-sm tracking-wider leading-tight truncate">{t("wallet.flexaWallet", { defaultValue: "FLEXA WALLET" })}</p>
                <p className="font-mono text-[10px] mt-0.5 truncate" style={{ color: "rgba(167,243,208,0.75)" }}>
                  {balance?.accountNumber ?? "FM-······"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setBalanceVisible(v => !v)}
                className="flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(252,211,77,0.35)",
                }}
                aria-label={balanceVisible ? t("wallet.hideBalance", { defaultValue: "Hide balance" }) : t("wallet.showBalance", { defaultValue: "Show balance" })}
              >
                {balanceVisible
                  ? <Eye style={{ width: 14, height: 14, color: "rgba(255,255,255,0.85)" }} />
                  : <EyeOff style={{ width: 14, height: 14, color: "rgba(255,255,255,0.85)" }} />}
              </button>
              <button
                onClick={() => setShowQR(true)}
                disabled={!balance?.accountNumber}
                className="flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(252,211,77,0.35)",
                }}
                aria-label="QR"
              >
                <QrCode style={{ width: 14, height: 14, color: "rgba(255,255,255,0.85)" }} />
              </button>
            </div>
          </div>

          <div className="mb-2.5 flex-1">
            <p className="font-semibold mb-0.5" style={{ color: "rgba(167,243,208,0.9)", fontSize: 11, letterSpacing: "0.04em" }}>
              {t("wallet.totalBalance")}
            </p>
            {isLoading ? (
              <div className="h-8 w-36 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.12)" }} />
            ) : (
              <p
                className="font-black leading-none text-white"
                style={{ fontSize: "clamp(1.45rem, 5vw, 1.85rem)", letterSpacing: "-0.02em" }}
              >
                {balanceVisible ? `$${(balance?.balanceUsd ?? 0).toFixed(2)}` : "$  ••••••"}
              </p>
            )}
            {!isLoading && (
              <div className="inline-flex items-center gap-1.5 mt-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.82)" }}>
                {isDominican ? (
                  <>
                    <span className="font-bold opacity-70">RD$</span>
                    <span className="font-mono font-semibold tracking-wide">
                      {balanceVisible
                        ? (balance?.balanceDop ?? 0).toLocaleString().replace(/,/g, " ")
                        : "••• ••• •••"}
                    </span>
                    <span className="font-bold opacity-70">DOP</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold opacity-70">G</span>
                    <span className="font-mono font-semibold tracking-wide">
                      {balanceVisible
                        ? (balance?.balanceHtg ?? 0).toLocaleString().replace(/,/g, " ")
                        : "••• ••• •••"}
                    </span>
                    <span className="font-bold opacity-70">HTG</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-auto">
            <div>
              {(balance?.bonusPct ?? 0) > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-100 border border-amber-300/40">
                  {t("wallet.bonusPctLabel", { pct: balance?.bonusPct, defaultValue: `+${balance?.bonusPct}% bonus` })}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { navigator.clipboard?.writeText(balance?.accountNumber ?? ""); toast({ title: t("wallet.accountCopied") }); }}
                disabled={!balance?.accountNumber}
                className="flex items-center gap-1 transition-all active:scale-95 disabled:opacity-30"
                style={{
                  padding: "5px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                  color: "rgba(255,255,255,0.9)",
                  background: "rgba(0,0,0,0.18)",
                  border: "1px solid rgba(252,211,77,0.45)",
                }}
              >
                <Copy style={{ width: 11, height: 11 }} /> {t("wallet.copyId", { defaultValue: "Copy ID" })}
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{
                  padding: "5px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600,
                  color: "rgba(255,255,255,0.9)",
                  background: "rgba(0,0,0,0.18)",
                  border: "1px solid rgba(252,211,77,0.45)",
                }}
              >
                <Share2 style={{ width: 11, height: 11 }} /> {t("wallet.share", { defaultValue: "Share" })}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ PLATFORM REVENUE CARD (super admin only) ════════════════════════════ */}
      {isSuperAdmin && (
        <div
          className="relative overflow-hidden rounded-2xl h-full bg-white"
          style={{
            border: "1.5px solid rgba(16,185,129,0.35)",
            boxShadow: "0 6px 22px rgba(6,78,59,0.10)",
            minHeight: 168,
          }}
        >
          <div className="relative p-3.5 sm:p-4 flex flex-col h-full">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(145deg,#047857 0%,#10b981 100%)",
                    boxShadow: "0 2px 8px rgba(16,185,129,0.35)",
                  }}
                >
                  <Wallet style={{ width: 16, height: 16, color: "#fff" }} />
                </div>
                <div className="min-w-0">
                  <p className="text-emerald-950 font-black text-xs sm:text-sm tracking-wider leading-tight truncate">{t("wallet.platformCardTitle", { defaultValue: "FM FLEXAMARKET CARD" })}</p>
                  <p className="font-mono text-[10px] mt-0.5 text-emerald-700/70 truncate">FM-FLEXA-MARKET</p>
                </div>
              </div>
              <button
                onClick={loadPlatformRev}
                className="flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(16,185,129,0.10)",
                  border: "1px solid rgba(16,185,129,0.30)",
                }}
                aria-label={t("wallet.refresh", { defaultValue: "Refresh" })}
              >
                <RefreshCw style={{ width: 13, height: 13, color: "#047857" }}
                  className={platformRevLoading ? "animate-spin" : ""} />
              </button>
            </div>

            <div className="mb-2.5 flex-1">
              <p className="font-semibold mb-0.5 text-emerald-700" style={{ fontSize: 11, letterSpacing: "0.03em" }}>
                {t("wallet.platformOfficial", { defaultValue: "Official Platform Account" })}
              </p>
              {platformRevLoading || !platformRev ? (
                <div className="h-8 w-32 rounded-lg animate-pulse bg-emerald-50" />
              ) : (
                <p className="font-black leading-none text-emerald-950"
                  style={{ fontSize: "clamp(1.45rem, 5vw, 1.85rem)", letterSpacing: "-0.02em" }}>
                  ${platformRev.totalRevenue.toFixed(2)}
                </p>
              )}
              {platformRev && platformRev.totalRevenue > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2">
                  {platformRev.merchantCommission > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-800/70">
                      {t("wallet.platformCommission", { defaultValue: "Commission" })} <span className="text-emerald-950">${platformRev.merchantCommission.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.boostRevenue > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-800/70">
                      {t("wallet.platformBoost", { defaultValue: "Boost" })} <span className="text-emerald-950">${platformRev.boostRevenue.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.p2pTransferFees > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-800/70">
                      {t("wallet.platformTransferFee", { defaultValue: "Transfer Fee" })} <span className="text-emerald-950">${platformRev.p2pTransferFees.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.deliveryFees > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-800/70">
                      {t("wallet.platformDelivery", { defaultValue: "Delivery 15%" })} <span className="text-emerald-950">${platformRev.deliveryFees.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.subscriptionRevenue > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-800/70">
                      {t("wallet.platformSubscription", { defaultValue: "Subscription" })} <span className="text-emerald-950">${platformRev.subscriptionRevenue.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.rechargeFees > 0 && (
                    <p className="text-[11px] font-semibold text-emerald-800/70">
                      {t("wallet.platformRecharge", { defaultValue: "Recharge" })} <span className="text-emerald-950">${platformRev.rechargeFees.toFixed(2)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap mt-auto">
              <button
                onClick={() => { navigator.clipboard?.writeText("FM-FLEXA-MARKET"); toast({ title: t("wallet.idCopied", { defaultValue: "ID copied" }) }); }}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{ padding: "5px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, color: "#065f46", background: "#fff", border: "1px solid rgba(16,185,129,0.35)" }}
              >
                <Copy style={{ width: 11, height: 11 }} /> {t("wallet.copyId", { defaultValue: "Copy ID" })}
              </button>
              <button
                onClick={loadStatements}
                disabled={statementsLoading}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{ padding: "5px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: "#fff", background: "#065f46", border: "1px solid #047857" }}
              >
                <BarChart3 style={{ width: 12, height: 12, color: "#fbbf24" }} />
                {statementsLoading ? "..." : t("wallet.monthlyStatement", { defaultValue: "Monthly Statement" })}
              </button>
              <button
                onClick={() => {
                  const url = window.location.origin;
                  navigator.share?.({
                    title: t("wallet.platformShareTitle", { defaultValue: "FlexaMarket Platform" }),
                    text: t("wallet.platformShareText", {
                      amount: platformRev?.totalRevenue?.toFixed(2) ?? "0.00",
                      defaultValue: `Platform Account: FM-FLEXA-MARKET\nRevenue: $${platformRev?.totalRevenue?.toFixed(2) ?? "0.00"}`,
                    }),
                    url,
                  });
                }}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{ padding: "5px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, color: "#065f46", background: "#fff", border: "1px solid rgba(16,185,129,0.35)" }}
              >
                <Share2 style={{ width: 11, height: 11 }} /> {t("wallet.share", { defaultValue: "Share" })}
              </button>
            </div>

            {showStatements && statements && (
              <div className="mt-3 rounded-xl overflow-hidden border border-emerald-200 bg-emerald-50/60">
                <div className="flex items-center justify-between px-3 py-2 border-b border-emerald-200">
                  <span className="text-emerald-800 text-[11px] font-bold tracking-wider">
                    {t("wallet.monthlyStatementTitle", { year: new Date().getFullYear(), defaultValue: `MONTHLY STATEMENT ${new Date().getFullYear()}` })}
                  </span>
                  <button type="button" onClick={() => setShowStatements(false)} className="text-emerald-700/60 text-sm leading-none">✕</button>
                </div>
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", fontSize: 10.5, borderCollapse: "collapse" }}>
                    <thead>
                      <tr className="text-emerald-800/60 border-b border-emerald-100">
                        {[
                          t("wallet.stmtMonth", { defaultValue: "Month" }),
                          t("wallet.stmtTotal", { defaultValue: "Total" }),
                          t("wallet.stmtCommission", { defaultValue: "Commission" }),
                          t("wallet.stmtBoost", { defaultValue: "Boost" }),
                          t("wallet.stmtTransfer", { defaultValue: "Transfer" }),
                          t("wallet.stmtDelivery", { defaultValue: "Delivery" }),
                          t("wallet.stmtSubscription", { defaultValue: "Subscription" }),
                          t("wallet.stmtRecharge", { defaultValue: "Recharge" }),
                          t("wallet.stmtOrders", { defaultValue: "Orders" }),
                        ].map(h => (
                          <th key={h} style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {statements.filter(m => m.totalRevenue > 0).reverse().map(m => (
                        <tr key={m.month} className="border-b border-emerald-50 text-emerald-950/85">
                          <td style={{ padding: "5px 8px", fontWeight: 700, color: "#047857" }}>{m.month.slice(5)}/{m.month.slice(0,4)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700 }}>${m.totalRevenue.toFixed(2)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>${m.merchantCommission.toFixed(2)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>${m.boostRevenue.toFixed(2)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>${m.p2pTransferFees.toFixed(2)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>${m.deliveryFees.toFixed(2)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>${m.subscriptionRevenue.toFixed(2)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>${m.rechargeFees.toFixed(2)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right" }}>{m.orderCount}</td>
                        </tr>
                      ))}
                      {statements.every(m => m.totalRevenue === 0) && (
                        <tr><td colSpan={9} style={{ padding: "12px 8px", textAlign: "center", color: "rgba(6,95,70,0.45)", fontStyle: "italic" }}>{t("wallet.stmtNoData", { defaultValue: "No data for this year" })}</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* ══ QUICK ACTION BUTTONS ════════════════════════════════════════════════ */}
      <div className="flex flex-wrap justify-start sm:justify-between gap-2">
        {([
          ...(walletFundingDisabled ? [] : [{
            label: t("wallet.actionDeposit"), Icon: Plus,
            accent: "deposit" as const,
            action: () => navigateTo(isHaiti ? "topup" : "card"),
          }]),
          {
            label: t("wallet.actionSend"), Icon: Send,
            accent: "green" as const,
            action: () => navigateTo("send"),
          },
          ...(purchasesDisabled ? [] : [{
            label: t("wallet.actionContacts"), Icon: Users,
            accent: "gold" as const,
            action: () => setLocation("/wallet/agents"),
          }]),
          {
            label: t("wallet.actionBonus"), Icon: Gift,
            accent: "gold" as const,
            action: () => { setRedeemCode(""); setRedeemSuccess(null); navigateTo("redeem_card"); },
          },
          {
            label: t("wallet.actionReceive"), Icon: ArrowDownCircle,
            accent: "green" as const,
            action: () => navigateTo("cashout"),
          },
          {
            label: t("wallet.actionHistory"), Icon: Clock,
            accent: "gold" as const,
            action: () => setLocation("/sales"),
          },
          {
            label: t("wallet.actionCard"), Icon: CreditCard,
            accent: "green" as const,
            action: () => navigateTo("my_card"),
          },
        ]).map(({ label, Icon, accent, action }) => {
          const isDeposit = accent === "deposit";
          const iconColor = isDeposit ? "#fff" : accent === "gold" ? "#b45309" : "#047857";
          return (
          <button
            key={label}
            onClick={action}
            className="flex flex-col items-center justify-center gap-1 rounded-xl transition-all active:scale-95 hover:shadow-md"
            style={{
              width: 56, minHeight: 58, flexShrink: 0,
              paddingTop: 8, paddingBottom: 8,
              background: isDeposit ? "#065f46" : "#ffffff",
              border: isDeposit ? "1px solid #047857" : "1px solid rgba(6,95,70,0.18)",
              boxShadow: isDeposit ? "0 4px 12px rgba(6,95,70,0.25)" : "0 2px 8px rgba(6,78,59,0.06)",
            }}
          >
            <Icon style={{ width: 18, height: 18, color: iconColor }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: isDeposit ? "rgba(255,255,255,0.92)" : "#134e4a", lineHeight: 1.15, textAlign: "center", maxWidth: 52 }}>
              {label}
            </span>
          </button>
          );
        })}
      </div>

      {/* ── 3-card Balance Breakdown ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        <div className="rounded-xl border border-emerald-100 bg-white p-2.5 shadow-sm">
          <div className="flex items-center gap-1 mb-1.5">
            <DollarSign className="h-3 w-3 text-emerald-600" />
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{t("wallet.availableLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-sm sm:text-base font-black text-foreground">${availableUsd.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t("wallet.availableSub")}</p>
            </>
          )}
        </div>

        <div className="rounded-xl border border-violet-100 bg-white p-2.5 shadow-sm">
          <div className="flex items-center gap-1 mb-1.5">
            <Gift className="h-3 w-3 text-violet-500" />
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{t("wallet.promoBalanceLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-sm sm:text-base font-black text-violet-600">${(balance?.promoBalance ?? 0).toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t("wallet.promoBalanceSub")}</p>
            </>
          )}
        </div>

        <div className={cn(
          "rounded-xl border p-2.5 shadow-sm bg-white",
          (balance?.unlockedBalance ?? 0) > 0
            ? "border-amber-200"
            : "border-emerald-100"
        )}>
          <div className="flex items-center gap-1 mb-1.5">
            <ArrowRightLeft className="h-3 w-3 text-amber-500" />
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{t("wallet.unlockedLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-sm sm:text-base font-black text-amber-600">${(balance?.unlockedBalance ?? 0).toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t("wallet.unlockedSub")}</p>
            </>
          )}
        </div>
      </div>

      {/* ── Recharge / Retrait — bouton entry → choice screen ──────────────── */}
      <div className={cn(
        "grid grid-cols-1 gap-3",
        "md:grid-cols-2 xl:grid-cols-3"
      )}>
      <button
        type="button"
        onClick={() => {
          if (walletFundingDisabled) {
            setCashoutRetraitOnly(false);
            setCashoutMethod("agent");
            navigateTo("cashout");
          } else {
            navigateTo("choice");
          }
        }}
        className="w-full group relative overflow-hidden rounded-2xl text-left shadow-md md:col-span-2 xl:col-span-1"
        style={{
          background: "linear-gradient(135deg,#064e3b 0%,#047857 55%,#059669 100%)",
          border: "1px solid rgba(16,185,129,0.4)",
        }}
      >
        <div className="px-4 py-3.5 flex items-center justify-between relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-400/25 ring-1 ring-white/30 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-amber-200" />
              </div>
              <div className="w-9 h-9 rounded-lg bg-white/15 ring-1 ring-white/30 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-white" />
              </div>
            </div>
            <div>
              <p className="text-sm font-black text-white">
                {walletFundingDisabled ? t("wallet.panelWithdrawTitle") : `${t("wallet.panelRechargeTitle")} · ${t("wallet.panelWithdrawTitle")}`}
              </p>
              <p className="text-[11px] text-emerald-100/85">
                {walletFundingDisabled ? `${t("wallet.agentPickup")} · ${t("wallet.authorizedAgent")}` : t("wallet.panelRechargeSub")}
              </p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </button>

      {!isNativeMobileApp() && <button
        type="button"
        onClick={() => setLocation("/loans")}
        className="group relative overflow-hidden rounded-2xl p-[1.5px] shadow-md hover:shadow-lg transition-all duration-300 w-full text-left"
        style={{ background: "linear-gradient(135deg,#0e7490,#0369a1)" }}
      >
        <div className="relative rounded-2xl px-4 py-3.5 flex items-center gap-3 overflow-hidden" style={{ background: "linear-gradient(135deg,#0e7490,#0369a1)" }}>
          <div className="relative w-10 h-10 rounded-xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0">
            <DollarSign className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold text-white leading-tight">{t("wallet.businessLoanTitle")}</p>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">{t("wallet.businessLoanBadge")}</span>
            </div>
            <p className="text-xs text-cyan-100 leading-snug">{t("wallet.businessLoanDesc")}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </button>}

      {isApprovedAgent && (
        <button
          type="button"
          onClick={() => setLocation("/agent")}
          className="group relative overflow-hidden rounded-2xl bg-white border border-emerald-200 shadow-sm hover:shadow-md transition-all duration-300 w-full text-left px-4 py-3.5 flex items-center gap-3"
        >
          <div className="relative w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold text-emerald-950 leading-tight">Panel Ajan Mwen</p>
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800 uppercase tracking-wider">Otorize</span>
            </div>
            <p className="text-xs text-emerald-800/70 leading-snug">Modifye taux an gro, taux an detay, estati, ak profil ou</p>
          </div>
          <ChevronRight className="h-5 w-5 text-emerald-600/70 group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      )}

      <button
        type="button"
        onClick={() => setLocation("/agents/apply")}
        className="group relative overflow-hidden rounded-2xl bg-white border border-amber-200 shadow-sm hover:shadow-md transition-all duration-300 w-full text-left px-4 py-3.5 flex items-center gap-3"
      >
        <div className="relative w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
          <Crown className="h-5 w-5 text-amber-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-sm font-bold text-amber-950 leading-tight">{t("wallet.agentApplyTitle")}</p>
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-800 uppercase tracking-wider">
              {t("wallet.agentApplyBadge")}
            </span>
          </div>
          <p className="text-xs text-amber-800/70 leading-snug">{t("wallet.agentApplySubtitle")}</p>
        </div>
        <ChevronRight className="h-5 w-5 text-amber-600/70 group-hover:translate-x-0.5 transition-all shrink-0" />
      </button>

      {canShowFMDeliveryLinks(user?.country) && (
        <button
          type="button"
          onClick={() => setLocation("/delivery/apply")}
          className="group relative overflow-hidden rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 w-full text-left px-4 py-3.5 flex items-center gap-3"
          style={{ background: "linear-gradient(135deg,#f59e0b 0%,#d97706 100%)" }}
        >
          <div className="relative w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold text-white leading-tight">{t("nav.applyDriver")}</p>
              <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">{t("wallet.driverBadge")}</span>
            </div>
            <p className="text-xs text-amber-50 leading-snug">{t("nav.deliveryAvailable")} — {t("nav.driverApproved").toLowerCase()}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/80 group-hover:translate-x-0.5 transition-all shrink-0" />
        </button>
      )}
      </div>
        </>
      )}


      {/* Promo tab: show balance breakdown without full overview chrome */}
      {showPromo && !showOverview && (
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        <div className="rounded-xl border border-emerald-100 bg-white p-2.5 shadow-sm">
          <div className="flex items-center gap-1 mb-1.5">
            <DollarSign className="h-3 w-3 text-emerald-600" />
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{t("wallet.availableLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-sm sm:text-base font-black text-foreground">${availableUsd.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t("wallet.availableSub")}</p>
            </>
          )}
        </div>
        <div className="rounded-xl border border-violet-100 bg-white p-2.5 shadow-sm">
          <div className="flex items-center gap-1 mb-1.5">
            <Gift className="h-3 w-3 text-violet-500" />
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{t("wallet.promoBalanceLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-sm sm:text-base font-black text-violet-600">${(balance?.promoBalance ?? 0).toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t("wallet.promoBalanceSub")}</p>
            </>
          )}
        </div>
        <div className={cn(
          "rounded-xl border p-2.5 shadow-sm bg-white",
          (balance?.unlockedBalance ?? 0) > 0 ? "border-amber-200" : "border-emerald-100"
        )}>
          <div className="flex items-center gap-1 mb-1.5">
            <ArrowRightLeft className="h-3 w-3 text-amber-500" />
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium truncate">{t("wallet.unlockedLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-sm sm:text-base font-black text-amber-600">${(balance?.unlockedBalance ?? 0).toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{t("wallet.unlockedSub")}</p>
            </>
          )}
        </div>
      </div>
      )}

      {(showOverview || showPromo) && (
        <>
      {/* ── Promo Actions (Unlock + Convert) ───────────────────────────────── */}
      {!purchasesDisabled && !isLoading && ((balance?.newUnlockableUsd ?? 0) > 0 || (balance?.unlockedBalance ?? 0) > 0) && (
        <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-700 flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" /> {t("wallet.promoActionsTitle")}
          </p>

          {(balance?.newUnlockableUsd ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{t("wallet.promoUnlockTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("wallet.promoUnlockDesc", { amount: (balance?.newUnlockableUsd ?? 0).toFixed(2) })}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-xs border-amber-400 text-amber-700 hover:bg-amber-50"
                disabled={promoUnlockMut.isPending}
                onClick={() => promoUnlockMut.mutate()}
              >
                {promoUnlockMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("wallet.unlockBtn")}
              </Button>
            </div>
          )}

          {(balance?.unlockedBalance ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{t("wallet.convertTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("wallet.convertDesc", { amount: (balance?.unlockedBalance ?? 0).toFixed(2) })}</p>
              </div>
              <Button
                size="sm"
                className="shrink-0 h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                disabled={promoConvertMut.isPending}
                onClick={() => promoConvertMut.mutate()}
              >
                {promoConvertMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("wallet.convertBtn")}
              </Button>
            </div>
          )}
        </div>
      )}

      {!purchasesDisabled && !isLoading && (balance?.promoBalance ?? 0) > 0 && (balance?.newUnlockableUsd ?? 0) === 0 && (
        <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-foreground">{t("wallet.promoUnlockProgress")}</p>
            <p className="text-xs text-muted-foreground font-mono">{t("wallet.promoUnlockProgressDetail", {
              spent: (balance?.totalRealBoostSpend ?? 0).toFixed(2),
              next: (20 - ((balance?.totalRealBoostSpend ?? 0) % 20)).toFixed(2)
            })}</p>
          </div>
          <div className="w-full h-2 rounded-full bg-emerald-50 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-amber-500 transition-all"
              style={{ width: `${Math.min(100, (((balance?.totalRealBoostSpend ?? 0) % 20) / 20) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t("wallet.promoUnlockHint")}</p>
        </div>
      )}

      {!purchasesDisabled && (referral?.referralCode ? (
        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5 text-emerald-700" />
              <p className="text-xs font-bold text-foreground">{t("wallet.promoTitle")}</p>
            </div>
            <button
              onClick={() => setShowReferralDetails(v => !v)}
              className="text-xs text-emerald-700 hover:underline"
            >
              {showReferralDetails ? "Less ▲" : "Learn more ▼"}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex-1 bg-white border border-emerald-200 rounded-lg px-3 py-1.5 font-mono text-sm font-bold tracking-[0.15em] text-emerald-800 text-center">
              {referral.referralCode}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(referral.referralCode ?? "").then(() => toast({ title: t("wallet.promoCopied") }))}
              className="w-8 h-8 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 flex items-center justify-center transition-colors"
            >
              <Copy className="h-3.5 w-3.5 text-emerald-700" />
            </button>
            <button
              onClick={() => {
                const text = t("wallet.promoShareMsg", { code: referral.referralCode ?? "" });
                if (navigator.share) { navigator.share({ title: "FLEXA MARKET", text }).catch(() => {}); }
                else { navigator.clipboard.writeText(text).then(() => toast({ title: t("wallet.promoMsgCopied") })); }
              }}
              className="w-8 h-8 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 flex items-center justify-center transition-colors"
            >
              <Share2 className="h-3.5 w-3.5 text-emerald-700" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
              <p className="text-sm font-black text-foreground">{referral.totalReferred}</p>
              <p className="text-xs text-muted-foreground">{t("wallet.registered")}</p>
            </div>
            <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
              <p className="text-sm font-black text-violet-600">${parseFloat(String(referral.promoBalance ?? 0)).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t("wallet.promoLocked")}</p>
            </div>
            <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
              <p className="text-sm font-black text-amber-600">${parseFloat(String(referral.unlockedBalance ?? 0)).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t("wallet.unlockedLabel")}</p>
            </div>
          </div>

          {showReferralDetails && (
            <div className="mt-3 pt-3 border-t border-emerald-200/60 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">{t("wallet.promoDesc")}</p>
              <div className="flex items-start gap-1.5">
                <Clock className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-snug">{t("wallet.pendingConvertDesc")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                  <p className="text-sm font-black text-emerald-600">{referral.bonusesPaid}</p>
                  <p className="text-xs text-muted-foreground">{t("wallet.recharged20")}</p>
                </div>
                <div className="bg-white rounded-lg p-2 text-center border border-emerald-100">
                  <p className="text-sm font-black text-amber-600">{referral.pendingBonuses}</p>
                  <p className="text-xs text-muted-foreground">{t("wallet.pending")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        showPromo ? <div className="text-xs text-muted-foreground animate-pulse">{t("wallet.loadingPromo")}</div> : null
      ))}
        </>
      )}

      {(showOverview || showTx) && (
        <>
      {/* ── Recent Transactions ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("wallet.txHistory")}</p>
          {history && history.length > 0 && (
            <button type="button" onClick={() => setLocation("/wallet/history")} className="text-xs text-emerald-700 font-semibold hover:underline">
              {t("wallet.viewAll")}
            </button>
          )}
        </div>

        {!history ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center py-8 gap-2 text-muted-foreground">
            <Clock className="h-8 w-8 opacity-20" />
            <p className="text-xs">{t("wallet.noTx")}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {history.slice(0, 5).map(tx => {
              const meta = typeLabel(tx.type, tx.amountUsd, t);
              const { Icon } = meta;
              const isIn = tx.amountUsd > 0;
              return (
                <div key={tx.id} className="rounded-xl border border-emerald-100 bg-white px-3 py-2.5 flex items-center gap-2.5 shadow-sm">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", meta.iconColor)}>
                    <Icon style={{ width: 15, height: 15 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {(() => { try { const d = new Date(String(tx.createdAt).replace(" ", "T")); return isNaN(d.getTime()) ? "" : d.toLocaleString("fr-HT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } })()}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className={cn("text-sm font-black", isIn ? "text-emerald-600" : "text-red-500")}>
                      {isIn ? "+" : "-"}${Math.abs(tx.amountUsd).toFixed(2)}
                    </p>
                    {statusBadge(tx.status, t)}
                  </div>
                </div>
              );
            })}
            {history.length > 5 && (
              <a
                href="/wallet/history"
                className="block text-center text-xs text-emerald-700 font-semibold py-2.5 rounded-xl border border-emerald-100 hover:bg-emerald-50 transition-colors"
              >
                Wè {history.length - 5} lòt tranzaksyon →
              </a>
            )}
          </div>
        )}
      </div>

      {showOverview && (
      <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 px-3 py-2.5 flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-800 leading-snug">
          <strong>{t("wallet.securityWay1Title")}</strong> — {t("wallet.securityWay1Desc")}
        </p>
      </div>
      )}

      {showOverview && (
      <div className="rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">{t("wallet.howItWorks")}</p>
        <div className="space-y-2">
          {([
            { Icon: ArrowUpCircle, text: t("wallet.howTo1"), cls: "text-emerald-700 bg-emerald-50" },
            { Icon: Send, text: t("wallet.howTo3"), cls: "text-emerald-600 bg-emerald-50" },
            { Icon: Zap, text: t("wallet.howTo4"), cls: "text-amber-600 bg-amber-50" },
          ] as const).map(({ Icon, text, cls }, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs text-foreground">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${cls}`}>
                <Icon style={{ width: 12, height: 12 }} />
              </div>
              {text}
            </div>
          ))}
        </div>
      </div>
      )}

      <div id="wallet-withdrawals">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" /> {t("wallet.myWithdrawals")}
          </p>
          {cashoutRequestsLoading ? (
            <p role="status" className="text-sm text-muted-foreground">{t("wallet.withdrawalsLoading")}</p>
          ) : cashoutRequestsError ? (
            <div role="alert" className="rounded-xl border border-amber-400 bg-amber-50 p-3 text-sm">
              <p>{t("wallet.withdrawalsLoadError")}</p>
              <Button type="button" variant="outline" className="mt-2" onClick={() => void refetchCashoutRequests()}>
                {t("wallet.withdrawalsRetry")}
              </Button>
            </div>
          ) : cashoutRequests.length === 0 ? (
            <p className="rounded-xl border border-emerald-100 bg-white p-3 text-sm text-muted-foreground shadow-sm">{t("wallet.noWithdrawals")}</p>
          ) : (
            <div className="space-y-1.5">
            {cashoutRequests.slice(0, 3).map((r: any) => {
              const isPending = ["pending", "provider_ready", "provider_submitting", "provider_pending", "provider_unknown"].includes(r.status);
              const statusKey = r.status === "provider_unknown" ? "unknown"
                : isPending ? "pending"
                : ["paid", "approved", "refunded", "rejected"].includes(r.status) ? r.status
                : r.status === "request_failed" ? "failed" : "unknown";
              return (
              <div key={r.id} className="rounded-xl border border-emerald-100 bg-white px-3 py-2.5 flex items-center gap-2.5 shadow-sm">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  isPending ? "bg-amber-100" :
                  r.status === "approved" ? "bg-blue-100" :
                  r.status === "paid" ? "bg-emerald-100" :
                  "bg-red-100"
                }`}>
                  {r.method === "moncash"
                    ? <Phone style={{ width: 14, height: 14 }} className={r.status === "paid" ? "text-emerald-600" : r.status === "rejected" ? "text-red-500" : r.status === "approved" ? "text-blue-500" : "text-amber-500"} />
                    : <MapPin style={{ width: 14, height: 14 }} className={r.status === "paid" ? "text-emerald-600" : r.status === "rejected" ? "text-red-500" : r.status === "approved" ? "text-blue-500" : "text-amber-500"} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold">{r.method === "moncash" ? "MonCash" : "Ajant"}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      isPending ? "bg-amber-100 text-amber-700" :
                      r.status === "approved" ? "bg-blue-100 text-blue-700" :
                      r.status === "paid" ? "bg-emerald-100 text-emerald-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {t(`wallet.withdrawalStatus_${statusKey}`)}
                    </span>
                    {r.status === "approved" && r.otpCode && (
                      <span className="font-mono font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-xs tracking-widest">
                        {r.otpCode}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(() => { try { const d = new Date(String(r.createdAt).replace(" ", "T")); return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-HT", { day: "2-digit", month: "short" }); } catch { return ""; } })()}
                  </p>
                </div>
                <p className="text-sm font-black text-red-500 shrink-0">-${parseFloat(r.amountUsd).toFixed(2)}</p>
              </div>
              );
            })}
          </div>
          )}
      </div>
        </>
      )}

      {/* QR Modal */}
      {showQR && balance?.accountNumber && (
        <Suspense fallback={null}>
          <QRModal accountNumber={balance.accountNumber} onClose={() => setShowQR(false)} />
        </Suspense>
      )}
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
      <ArrowLeft className="h-4 w-4" /> {t("wallet.back")}
    </button>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold", valueClass)}>{value}</span>
    </div>
  );
}
