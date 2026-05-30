import { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import QRCode from "qrcode";

// ─── Virtual card helpers ─────────────────────────────────────────────────────
function formatCardNumber(acct: string | null | undefined): string {
  if (!acct) return "•••• •••• •••• ••••";
  const raw = acct.replace(/\D/g, ""); // "482910"
  const prefix = "5288 4000 00";
  const padded = (prefix.replace(/ /g, "") + raw.padStart(6, "0")).slice(-16);
  return padded.match(/.{4}/g)?.join("  ") ?? padded;
}

function formatCardNumberShort(acct: string | null | undefined): string {
  if (!acct) return "••••";
  const raw = acct.replace(/\D/g, "");
  return raw.padStart(6, "0").slice(-4);
}

function deriveCVV(acct: string | null | undefined): string {
  if (!acct) return "•••";
  const n = parseInt(acct.replace(/\D/g, "") || "0", 10);
  return String(((n * 31 + 137) % 900) + 100);
}

function getCardExpiry(): string {
  const y = new Date().getFullYear() + 4;
  return `12/${String(y).slice(-2)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface WalletBalance {
  balanceUsd: number;
  availableUsd: number;
  securityBalance: number;
  firstRechargeDone: boolean;
  balanceHtg: number;
  rateHtgToUsd: number;
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
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Erè");
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
  if (type === "recharge_fee") return { label: "Frè Rechaj (ansyen)", color: "text-orange-400", sign: "-", Icon: AlertCircle, iconColor: "bg-orange-900/30 text-orange-400" };
  if (type === "security_lock") return { label: "Balans sekirite (ansyen)", color: "text-slate-400", sign: "", Icon: ShieldCheck, iconColor: "bg-slate-900/30 text-slate-400" };
  return { label: type, color: "text-foreground", sign: amountUsd > 0 ? "+" : "", Icon: ArrowRightLeft, iconColor: "bg-muted text-muted-foreground" };
}

function statusBadge(status: string, t: TFunc) {
  if (status === "completed") return <Badge className="bg-green-900/40 text-green-300 text-xs border-0">{t("wallet.statusCompleted")}</Badge>;
  if (status === "pending") return <Badge variant="outline" className="text-xs text-amber-300 border-amber-500 bg-amber-900/20">{t("wallet.pending")}</Badge>;
  if (status === "rejected") return <Badge variant="destructive" className="text-xs">{t("wallet.statusRejected")}</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

// ─── QR Modal ─────────────────────────────────────────────────────────────────
function QRModal({ accountNumber, onClose }: { accountNumber: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(accountNumber, {
      width: 240,
      margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setQrUrl).catch(() => {});
  }, [accountNumber]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl p-8 max-w-xs w-full text-center shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: "scaleIn 0.2s ease" }}
      >
        <p className="font-black text-lg text-slate-800 mb-1">{t("wallet.qrTitle")}</p>
        <p className="text-xs text-slate-500 mb-5">{t("wallet.qrSubtitle")}</p>
        {qrUrl ? (
          <img src={qrUrl} alt="QR Code" className="mx-auto rounded-xl" style={{ width: 200, height: 200 }} />
        ) : (
          <div className="w-[200px] h-[200px] mx-auto flex items-center justify-center bg-muted rounded-xl">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
        <p className="mt-5 font-mono font-black text-xl tracking-widest text-slate-800">{accountNumber}</p>
        <p className="text-xs text-muted-foreground mt-1 mb-5">{t("wallet.qrAccountLabel")}</p>
        <Button variant="outline" className="w-full" onClick={onClose}>{t("buttons.close") || "×"}</Button>
      </div>
    </div>
  );
}

// ─── Virtual Card Component ───────────────────────────────────────────────────
interface VirtualCardProps {
  balance: { balanceUsd: number; accountNumber: string | null } | undefined;
  isLoading: boolean;
  userName: string;
  onCopy: () => void;
  onShare: () => void;
  onQR: () => void;
}

function VirtualCard({ balance, isLoading, userName, onCopy, onShare, onQR }: VirtualCardProps) {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  const acct = balance?.accountNumber ?? null;
  const cardNum = formatCardNumber(acct);
  const lastFour = formatCardNumberShort(acct);
  const cvv = deriveCVV(acct);
  const expiry = getCardExpiry();
  const usd = balance?.balanceUsd ?? 0;

  return (
    <div className="w-full" style={{ perspective: 1000 }}>
      {/* Card container — flip on click */}
      <div
        className="relative w-full cursor-pointer select-none"
        style={{
          aspectRatio: "1.586",
          transformStyle: "preserve-3d",
          transition: "transform 0.55s cubic-bezier(.4,0,.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
        onClick={() => setFlipped(f => !f)}
        title={t("wallet.cardFlipHint")}
      >
        {/* ── FRONT ───────────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl"
          style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
        >
          {/* Gradient background */}
          <div
            className="absolute inset-0"
            style={{ background: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" }}
          />
          {/* Shimmer overlay */}
          <div
            className="absolute inset-0 opacity-20"
            style={{ background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)" }}
          />
          {/* Decorative arcs */}
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full border border-white/10" />
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full border border-white/8" />
          <div className="absolute -left-10 -bottom-10 w-48 h-48 rounded-full border border-white/6" />

          <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-6">
            {/* Top row: chip + logo + network mark */}
            <div className="flex items-start justify-between">
              {/* EMV chip */}
              <div
                className="rounded-md"
                style={{
                  width: 40, height: 30,
                  background: "linear-gradient(135deg, #d4af37 0%, #f5e17c 40%, #c8a400 100%)",
                  boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.2)",
                  position: "relative",
                }}
              >
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-around", padding: "4px 5px" }}>
                  <div style={{ height: 2, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                  <div style={{ height: 2, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                  <div style={{ height: 2, background: "rgba(0,0,0,0.25)", borderRadius: 1 }} />
                </div>
              </div>

              {/* FLEXA MARKET brand + USDT badge */}
              <div className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-white font-black text-sm tracking-tight leading-none">ZE<span className="text-yellow-400">NO</span></span>
                </div>
                <div className="mt-1 flex items-center gap-1 justify-end">
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white/85 border border-white/30 tracking-wider">USDT · USD</span>
                </div>
              </div>
            </div>

            {/* Balance (center of card) */}
            <div className="text-white">
              {isLoading ? (
                <div className="h-8 w-28 bg-white/20 rounded-lg animate-pulse" />
              ) : (
                <>
                  <p className="text-xs text-white/80 uppercase tracking-widest mb-0.5">{t("wallet.availableBalance")}</p>
                  <p className="text-3xl font-black leading-none">${usd.toFixed(2)}</p>
                  <p className="text-xs text-white/80 mt-0.5">{usd.toFixed(2)} USDT</p>
                </>
              )}
            </div>

            {/* FM Account number — PRIMARY identifier, always visible */}
            <div>
              {isLoading || !acct ? (
                <div className="h-7 w-36 bg-white/20 rounded animate-pulse" />
              ) : (
                <div>
                  <p className="text-xs text-white/80 uppercase tracking-widest mb-0.5">{t("wallet.accountNumberLabel")}</p>
                  <p className="font-mono text-white text-xl sm:text-2xl font-black tracking-widest">{acct}</p>
                </div>
              )}
            </div>

            {/* Bottom row: name + expiry + card digits */}
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs text-white/80 uppercase tracking-widest">{t("wallet.cardHolder")}</p>
                <p className="text-white text-xs sm:text-sm font-bold uppercase tracking-wide leading-tight truncate max-w-[130px]">
                  {userName || "FLEXA MARKET User"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-white/80 uppercase tracking-widest">{t("wallet.expires")}</p>
                <p className="text-white text-xs font-bold font-mono">{expiry}</p>
              </div>
              {/* Mastercard-style circles */}
              <div className="flex">
                <div className="w-8 h-8 rounded-full opacity-80" style={{ background: "#eb001b" }} />
                <div className="w-8 h-8 rounded-full opacity-80 -ml-3" style={{ background: "#f79e1b", mixBlendMode: "multiply" }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── BACK ─────────────────────────────────────────────────────────── */}
        <div
          className="absolute inset-0 rounded-3xl overflow-hidden shadow-2xl"
          style={{
            backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          }}
        >
          {/* Magnetic stripe */}
          <div className="w-full h-10 mt-8 bg-black/70" />

          <div className="px-5 pt-4 space-y-4">
            {/* Signature strip + CVV */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-9 rounded flex items-center px-3 bg-white/90">
                <div className="flex-1 border-b border-dashed border-slate-300" />
              </div>
              <div className="bg-white/90 rounded px-3 h-9 flex flex-col items-center justify-center min-w-[56px]">
                <p className="text-xs text-slate-600 uppercase tracking-wider">CVV</p>
                <p className="font-black text-slate-800 font-mono text-sm">{cvv}</p>
              </div>
            </div>

            {/* Card info */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-white/75">{t("wallet.accountNumberLabel")}</span>
                <span className="text-white font-mono font-bold">{acct ?? "—"}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/75">{t("wallet.lastFour")}</span>
                <span className="text-white font-mono font-bold">••••  ••••  ••••  {lastFour}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-white/75">{t("wallet.expiryDate")}</span>
                <span className="text-white font-mono font-bold">{expiry}</span>
              </div>
            </div>

            {/* Notice */}
            <div className="rounded-lg border border-white/15 bg-white/5 p-2.5">
              <p className="text-xs text-white/75 leading-relaxed text-center">
                {t("wallet.cardNotice")}
              </p>
            </div>
          </div>

          {/* Hint */}
          <p className="absolute bottom-4 right-5 text-xs text-white/75">{t("wallet.cardClickBack")}</p>
        </div>
      </div>

      {/* ── Action buttons below card ──────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          onClick={e => { e.stopPropagation(); onCopy(); }}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-muted/60 hover:bg-muted transition-colors"
        >
          <Copy className="h-4 w-4 text-foreground" />
          <span className="text-xs text-muted-foreground font-medium">{t("buttons.copy") || "Copy"}</span>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onShare(); }}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-muted/60 hover:bg-muted transition-colors"
        >
          <Share2 className="h-4 w-4 text-foreground" />
          <span className="text-xs text-muted-foreground font-medium">{t("buttons.share") || "Share"}</span>
        </button>
        <button
          onClick={e => { e.stopPropagation(); onQR(); }}
          className="flex flex-col items-center gap-1 px-4 py-2 rounded-2xl bg-muted/60 hover:bg-muted transition-colors"
        >
          <QrCode className="h-4 w-4 text-foreground" />
          <span className="text-xs text-muted-foreground font-medium">QR Code</span>
        </button>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-1">{t("wallet.cardFlipHint")}</p>
    </div>
  );
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
}: {
  amount: number;
  feeRatePct: number;
  mode: "transfer" | "cashout";
  balance: number;
  rateHtgToUsd?: number;
}) {
  const { t } = useTranslation();
  if (!amount || amount <= 0) return null;

  const fee = Math.round(amount * (feeRatePct / 100) * 100) / 100;
  const net = Math.round((amount - fee) * 100) / 100;
  const insufficient = amount > balance + 0.001;
  const minAmount = mode === "transfer" ? 0.01 : 1;
  const tooSmall = amount < minAmount;
  const netHtg = rateHtgToUsd && net > 0 ? Math.round(net * rateHtgToUsd) : null;

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

// ─── Agent Select Step (sub-component) ───────────────────────────────────────
function AgentSelectStep({
  cashoutAmount,
  onBack,
  onSelect,
}: {
  cashoutAmount: string;
  onBack: () => void;
  onSelect: (agent: any) => void;
}) {
  const { data, isLoading } = useQuery<{ agents: any[] }>({
    queryKey: ["/agents/public", { onlineOnly: false }],
    queryFn: async () => {
      const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
      const r = await fetch("/api/agents/public", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const agents = data?.agents ?? [];
  const online = agents.filter(a => a.isOnline);
  const offline = agents.filter(a => !a.isOnline);
  const sorted = [...online, ...offline];

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4">
      <BackButton onClick={onBack} />
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-6 w-6 text-green-500" />
          <h1 className="text-2xl font-black">Chwazi Ajan Otorize</h1>
        </div>
        <p className="text-sm text-muted-foreground">Retire <strong>${parseFloat(cashoutAmount || "0").toFixed(2)}</strong> — chwazi yon ajan ki disponib</p>
      </div>

      {online.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-bold text-green-600">{online.length} ajan online kounye a</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Users className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="font-bold">Pa gen ajan disponib nan peyi ou a</p>
          <p className="text-sm text-muted-foreground">Eseye pita oswa chwazi yon lòt metòd retrait</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(agent => {
            const fmNum = agent.fmWalletNumber ?? agent.accountNumber;
            const methods = agent.supportedMethods
              ? agent.supportedMethods.split(",").map((s: string) => s.trim()).filter(Boolean)
              : ["MonCash", "Cash"];
            return (
              <button
                key={agent.id}
                onClick={() => onSelect(agent)}
                className="w-full text-left rounded-2xl border-2 border-border bg-card hover:border-green-400/50 hover:bg-green-50/30 dark:hover:bg-green-950/10 transition-all p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-black text-lg shrink-0">
                    {agent.fullName?.charAt(0) ?? "A"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-foreground truncate">{agent.fullName}</p>
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                        agent.isOnline ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"
                      )}>
                        {agent.isOnline ? "🟢 ONLINE" : "⚫ OFFLINE"}
                      </span>
                    </div>
                    {agent.businessName && <p className="text-xs text-muted-foreground truncate">{agent.businessName}</p>}
                    <p className="text-xs text-muted-foreground">📍 {agent.city}</p>
                    {fmNum && (
                      <p className="text-xs font-mono text-primary mt-1">FM: {fmNum}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {methods.slice(0, 3).map((m: string) => (
                        <span key={m} className="text-[9px] font-semibold bg-muted px-1.5 py-0.5 rounded-full">{m}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────────
type Step = "home" | "topup" | "moncash" | "moncash_confirm" | "moncash_submit" | "moncash_done" | "send" | "send_confirm" | "card" | "cashout" | "cashout_phone_verify" | "cashout_done" | "crypto" | "cashout_agent_select" | "cashout_agent_pay" | "cashout_agent_proof" | "cashout_agent_done" | "redeem_card" | "my_card";

export default function WalletPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [step, setStep] = useState<Step>("home");
  const [showQR, setShowQR] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [showReferralDetails, setShowReferralDetails] = useState(false);

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
  const [cashoutMethod, setCashoutMethod] = useState<"moncash" | "agent" | "agent_transfer" | "stripe_card">("moncash");
  const [cashoutPhone, setCashoutPhone] = useState(user?.phone ?? "");
  const [cashoutAgentLoc, setCashoutAgentLoc] = useState("");
  const [cashoutResult, setCashoutResult] = useState<{ requestId: number } | null>(null);

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

  // Topup method selection
  const isHaiti = user?.country === "Haiti";
  const isDeliveryCountry = isHaiti || user?.country === "Dominican Republic";
  const isAdmin = !!(user?.isAdmin || user?.isSuperAdmin || user?.role === "admin" || user?.role === "super_admin");
  const isSuperAdmin = !!(user?.isSuperAdmin || user?.role === "super_admin");
  const isApprovedAgent = !!(user?.role === "agent" || isAdmin);
  const [selectedTopupMethod, setSelectedTopupMethod] = useState<"card" | "agents" | "crypto">("card");

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

  // ── Check for Stripe redirect ────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("card_success") === "1") {
      toast({ title: t("wallet.paymentReceived"), description: t("wallet.balanceUpdating") });
      window.history.replaceState({}, "", "/wallet");

      // Fallback activation: call the session endpoint so the server credits
      // the wallet even if the Stripe webhook has not fired yet.
      const sessionId = params.get("session_id");
      if (sessionId) {
        const tk = localStorage.getItem("flexamarket_token");
        fetch(`/api/stripe/checkout/session?session_id=${encodeURIComponent(sessionId)}`, {
          headers: tk ? { Authorization: `Bearer ${tk}` } : {},
        })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
            qc.invalidateQueries({ queryKey: ["/wallet/history"] });
          })
          .catch(() => {
            qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
            qc.invalidateQueries({ queryKey: ["/wallet/history"] });
          });
      } else {
        qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
        qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      }
    }
    if (params.get("card_cancel") === "1") {
      toast({ title: t("wallet.paymentCancelled"), variant: "destructive" });
      window.history.replaceState({}, "", "/wallet");
    }
  }, []);

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: balance, isLoading } = useQuery<WalletBalance>({
    queryKey: ["/wallet/balance"],
    queryFn: () => apiGet("/wallet/balance"),
    enabled: !!user,
    refetchInterval: 15000,
  });

  const availableUsd = balance?.availableUsd ?? balance?.balanceUsd ?? 0;


  const { data: historyData } = useQuery<{ transactions: WalletTx[]; totalIn: number; totalOut: number; count: number }>({
    queryKey: ["/wallet/history"],
    queryFn: () => apiGet("/wallet/history?limit=500"),
    enabled: !!user,
    refetchInterval: 30000,
  });
  const history = historyData?.transactions;

  const { data: referral } = useQuery<ReferralData>({
    queryKey: ["/wallet/referral"],
    queryFn: () => apiGet("/wallet/referral"),
    enabled: !!user,
    staleTime: 60000,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const initiateMut = useMutation({
    mutationFn: (amountHtg: number) => apiPost("/wallet/topup/initiate", { amountHtg, phone }),
    onSuccess: (data) => {
      setPendingRef(data.paymentRef);
      setPendingDetails({ amountHtg: data.amountHtg, totalUsd: data.totalUsd, bonusUsd: data.bonusUsd, baseUsd: data.baseUsd, rateUsed: data.rateUsed, bonusPct: data.bonusPct });
      setStep("moncash_confirm");
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
      setStep("home");
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.transferError"), description: e.message, variant: "destructive" }),
  });

  const cardSessionMut = useMutation({
    mutationFn: (amountUsd: number) => apiPost("/wallet/topup/card/session", { amountUsd }),
    onSuccess: (data) => { window.location.href = data.sessionUrl; },
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
    onError: (e: Error) => toast({ title: "Erè", description: e.message, variant: "destructive" }),
  });

  const promoUnlockMut = useMutation({
    mutationFn: () => apiPost("/wallet/promo/unlock", {}),
    onSuccess: (data) => {
      toast({ title: t("wallet.promoUnlocked"), description: t("wallet.promoUnlockedDesc", { amount: data.unlockedUsd?.toFixed(2) ?? "0.00" }) });
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  const promoConvertMut = useMutation({
    mutationFn: () => apiPost("/wallet/promo/convert", {}),
    onSuccess: (data) => {
      toast({ title: t("wallet.promoConverted"), description: t("wallet.promoConvertedDesc", { amount: data.convertedUsd?.toFixed(2) ?? "0.00" }) });
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      qc.invalidateQueries({ queryKey: ["/wallet/referral"] });
    },
    onError: (e: Error) => toast({ title: t("wallet.error"), description: e.message, variant: "destructive" }),
  });

  const cashoutMut = useMutation({
    mutationFn: (withdrawalToken?: string) => apiPost("/cashout/request", {
      amountUsd: parseFloat(cashoutAmount),
      method: cashoutMethod,
      phone: cashoutMethod === "moncash" ? cashoutPhone.trim() : undefined,
      agentLocation: cashoutMethod === "agent" ? cashoutAgentLoc.trim() : undefined,
      withdrawalToken,
    }),
    onSuccess: (data) => {
      setCashoutResult({ requestId: data.requestId });
      setStep("cashout_done");
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      qc.invalidateQueries({ queryKey: ["/cashout/my"] });
    },
    onError: (e: Error) => toast({ title: "Erè", description: e.message, variant: "destructive" }),
  });

  // Stripe cashout mutation — instant, no admin review
  const cashoutStripeMut = useMutation({
    mutationFn: () => apiPost("/cashout/stripe", { amountUsd: parseFloat(cashoutAmount) }),
    onSuccess: (data) => {
      setStep("cashout_done");
      setCashoutResult({ requestId: data.transferId });
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      qc.invalidateQueries({ queryKey: ["/cashout/my"] });
    },
    onError: (e: Error) => toast({ title: "Erè Stripe", description: e.message, variant: "destructive" }),
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
      setStep("cashout_agent_done");
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/wallet/history"] });
      qc.invalidateQueries({ queryKey: ["/cashout/my"] });
    },
    onError: (e: Error) => toast({ title: "Erè", description: e.message, variant: "destructive" }),
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
      toast({ title: "Erè upload", description: err.message, variant: "destructive" });
      setCashoutAgentScreenshotFile(null);
      setCashoutAgentScreenshotPreview(null);
    } finally {
      setCashoutAgentScreenshotUploading(false);
    }
  }

  const sendOtpMut = useMutation({
    mutationFn: (phone: string) => apiPost("/otp/send", { phone }),
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
    mutationFn: ({ phone, code }: { phone: string; code: string }) =>
      apiPost("/otp/verify", { phone, code }),
    onSuccess: (data) => {
      cashoutMut.mutate(data.withdrawalToken);
    },
    onError: (e: Error) => setOtpError(e.message),
  });

  // Countdown timer for OTP expiry
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const id = setInterval(() => setOtpCountdown(c => Math.max(c - 1, 0)), 1000);
    return () => clearInterval(id);
  }, [otpCountdown]);

  const { data: cashoutRequests = [] } = useQuery<any[]>({
    queryKey: ["/cashout/my"],
    queryFn: () => apiGet("/cashout/my"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const submitProofMut = useMutation({
    mutationFn: () => apiPost("/wallet/topup/submit-proof", {
      paymentRef: pendingRef,
      userTransferRef: userTransferRef.trim() || undefined,
      screenshotUrl: screenshotUrl || undefined,
    }),
    onSuccess: () => {
      setStep("moncash_done");
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
  const previewUsd = balance ? parseFloat((finalHtg / balance.rateHtgToUsd).toFixed(2)) : 0;
  const previewBonus = balance ? parseFloat((previewUsd * balance.bonusPct / 100).toFixed(2)) : 0;
  const previewTotal = parseFloat((previewUsd + previewBonus).toFixed(2));

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
        <BackButton onClick={() => setStep("moncash")} />
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

        <Button className="w-full h-14 font-bold text-base" onClick={() => setStep("moncash_submit")}>
          {t("wallet.finishedPayBtn")}
        </Button>
        <Button variant="ghost" className="w-full text-muted-foreground text-sm" onClick={() => { setStep("home"); qc.invalidateQueries({ queryKey: ["/wallet/history"] }); }}>
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
        <BackButton onClick={() => setStep("moncash_confirm")} />
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
          onClick={() => { setStep("home"); qc.invalidateQueries({ queryKey: ["/wallet/history"] }); }}
        >
          {t("wallet.backToWallet")}
        </Button>
      </div>
    );
  }

  // =========================================================================
  // ── MONCASH step ─────────────────────────────────────────────────────────
  // =========================================================================
  if (step === "moncash") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <BackButton onClick={() => setStep("topup")} />
        <div>
          <h1 className="text-2xl font-black">{t("wallet.moncashTitle")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("wallet.moncashSubtitle")}</p>
        </div>

        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between text-sm flex-wrap gap-2">
          <span className="text-muted-foreground">{t("wallet.todayRate")}</span>
          <span className="font-bold text-primary">1 USD = G {balance?.rateHtgToUsd ?? 130}</span>
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
          {customHtg && parseFloat(customHtg) >= 100 && (
            <p className="text-xs text-muted-foreground mt-1">
              ≈ <span className="font-bold text-primary">${previewTotal.toFixed(2)}</span>
              {previewBonus > 0 && <span className="text-green-400 ml-1">(+${previewBonus.toFixed(2)} bonus)</span>}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t("wallet.yourMoncashNumber")}</p>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input type="tel" placeholder="+509 ..." value={phone} onChange={e => setPhone(e.target.value)} className="pl-9" style={{ fontSize: 16 }} />
          </div>
        </div>

        <Button
          className="w-full h-12 font-bold text-base"
          disabled={!finalHtg || finalHtg < 100 || initiateMut.isPending}
          onClick={() => initiateMut.mutate(finalHtg)}
        >
          {initiateMut.isPending
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
        <BackButton onClick={() => setStep("topup")} />
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
            <p className="text-[12px] font-bold text-red-700 dark:text-red-400 leading-snug">Atansyon — Kont ou riske bloke pèmanantman</p>
            <p className="text-[11.5px] text-red-600/80 dark:text-red-400/70 leading-[1.5]">
              Si bank ou mande lajan bak (chargeback), kont ou ap bloke definitiv. Itilize <span className="font-semibold">kat ki pou ou sèlman</span> pou evite sispansyon.
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
      <div className="max-w-md mx-auto px-4 py-8 space-y-6">
        <BackButton onClick={() => { setStep("home"); setRedeemCode(""); setRedeemSuccess(null); }} />

        {redeemSuccess ? (
          <div className="flex flex-col items-center gap-6 py-6">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-2xl font-black text-foreground">Rechaj Reyisi!</h2>
              <p className="text-4xl font-black text-green-500 mt-2">${redeemSuccess.amountUsd.toFixed(2)}</p>
              <p className="text-sm text-muted-foreground">Krédite sou Wallet FM ou enstantane ⚡</p>
            </div>
            <Button className="w-full h-12 font-bold text-base" onClick={() => setStep("home")}>
              Retounen nan Wallet
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-black">Kòd Rechaj FM</h1>
              <p className="text-sm text-muted-foreground">Gratte kart ou a epi antre kòd la anba a pou kredite wallet ou enstantane.</p>
            </div>

            {/* Card visual */}
            <div className="rounded-2xl p-5 text-white relative overflow-hidden" style={{ background: "linear-gradient(135deg, #f97316 0%, #dc2626 50%, #7c3aed 100%)" }}>
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
              <p className="text-xs opacity-70 mb-1 font-semibold uppercase tracking-widest">Kòd PIN</p>
              <p className="font-mono text-2xl font-black tracking-[4px] text-white/90">
                {redeemCode.toUpperCase() || "FM-XXXX-XXXX"}
              </p>
              <p className="text-xs opacity-60 mt-3">Rechaj enstantane • 0% frè</p>
            </div>

            {/* Input */}
            <div className="space-y-3">
              <label className="text-sm font-semibold">Antre Kòd PIN ou a</label>
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
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ap verifye…</>
                  : <><CheckCircle className="h-5 w-5 mr-2" />Itilize Kòd la</>
                }
              </Button>
            </div>

            <div className="rounded-xl border border-border p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">Chak kòd pa ka itilize ke yon sèl fwa. Kòb la krédite enstantane sou wallet FM ou a san frè.</p>
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
    const methods: { id: "card" | "agents" | "crypto"; label: string; sub: string; badge?: string; icon: React.ReactNode; color: string }[] = [
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
      },
    ];

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => setStep("home")} />
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
                onClick={() => setSelectedTopupMethod(m.id)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left",
                  selected
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border bg-card hover:border-primary/30 hover:bg-muted/20"
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
                      <span className="text-[10px] font-bold bg-green-500/15 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded-full">
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
          onClick={() => {
            if (selectedTopupMethod === "agents") { setLocation("/wallet/agents"); }
            else if (selectedTopupMethod === "crypto") { setStep("crypto"); }
            else { setStep("card"); }
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
        <BackButton onClick={() => setStep("topup")} />
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
                onClick={() => { navigator.clipboard.writeText(usdtTrc20); toast({ title: "Kopi!" }); }}
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
                onClick={() => { navigator.clipboard.writeText(usdtErc20); toast({ title: "Kopi!" }); }}
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
        <BackButton onClick={() => setStep("send")} />
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

        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">{t("wallet.transferWarning")}</p>
        </div>

        <Button
          className="w-full h-12 font-bold text-base"
          disabled={transferMut.isPending}
          onClick={() => transferMut.mutate()}
        >
          {transferMut.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("wallet.submitting")}</>
            : <><Send className="h-5 w-5 mr-2" />{t("wallet.confirmSendBtn")} {sendCurrency === "USDT" ? "₮" : "$"}{sendAmt.toFixed(2)} {sendCurrency}</>
          }
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => setStep("send")}>{t("wallet.cancel")}</Button>
      </div>
    );
  }

  // =========================================================================
  // ── SEND step ─────────────────────────────────────────────────────────────
  // =========================================================================
  if (step === "send") {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => setStep("home")} />
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
          onClick={() => setStep("send_confirm")}
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
    const cashoutAmt = parseFloat(cashoutAmount) || 0;
    const hasStripe = !!(user?.stripeAccountId && user?.stripeAccountStatus === "active");
    const canSubmit = cashoutAmt >= 1 &&
      cashoutAmt <= availableUsd &&
      (cashoutMethod === "moncash" ? cashoutPhone.trim().length >= 8
        : cashoutMethod === "stripe_card" ? hasStripe
        : cashoutMethod === "agent_transfer" ? true
        : cashoutAgentLoc.trim().length >= 3);

    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-5">
        <BackButton onClick={() => setStep("home")} />

        <div>
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownCircle className="h-6 w-6 text-violet-500" />
            <h1 className="text-2xl font-black">Retire Lajan</h1>
          </div>
          <p className="text-sm text-muted-foreground">Voye lajan ou nan men ou oswa nan men yon ajant</p>
        </div>

        {/* Amount */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">Montan (USD)</label>
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
            <span>Balans disponib</span>
            <button
              className="font-bold text-primary hover:underline"
              onClick={() => setCashoutAmount(availableUsd.toFixed(2))}
            >
              ${availableUsd.toFixed(2)} (tout)
            </button>
          </div>
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
            rateHtgToUsd={balance?.rateHtgToUsd}
          />
        )}

        {/* Method */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">Metòd Retrait</label>
          <div className="grid grid-cols-3 gap-2">
            {(isHaiti
              ? (["moncash", "agent", "agent_transfer"] as const)
              : (["agent", "agent_transfer"] as const)
            ).map(m => {
              const cfg = {
                moncash:       { icon: <Phone className="h-5 w-5 text-violet-500" />,  label: "MonCash",          sub: "Via admin" },
                agent:         { icon: <MapPin className="h-5 w-5 text-orange-500" />, label: "Ajant Pickup",     sub: "Kòd sekrè" },
                agent_transfer: { icon: <Users className="h-5 w-5 text-green-500" />,  label: "Ajan Otorize",     sub: "⚡ Rapid" },
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
            {hasStripe && (
              <button
                onClick={() => setCashoutMethod("stripe_card")}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all",
                  cashoutMethod === "stripe_card" ? "border-blue-500 bg-blue-500/10" : "border-border bg-card hover:border-blue-400/30"
                )}
              >
                <CreditCard className="h-5 w-5 text-blue-500" />
                <span className="text-[11px] font-bold leading-tight">Stripe Card</span>
                <span className="text-[9px] text-muted-foreground">⚡ Imedya</span>
              </button>
            )}
          </div>
        </div>

        {/* Method-specific input */}
        {cashoutMethod === "moncash" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />Nimewo MonCash ou
            </label>
            <Input
              type="tel"
              value={cashoutPhone}
              onChange={e => setCashoutPhone(e.target.value)}
              placeholder="+509 3612 3456"
              style={{ fontSize: 16 }}
            />
            <p className="text-xs text-muted-foreground">Admin ap voye lajan nan nimewo sa a</p>
          </div>
        )}
        {cashoutMethod === "agent" && (
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />Kote ajant lan
            </label>
            <Input
              value={cashoutAgentLoc}
              onChange={e => setCashoutAgentLoc(e.target.value)}
              placeholder="ex: Pòtoprens, Delmas 31"
              style={{ fontSize: 16 }}
            />
            <p className="text-xs text-muted-foreground">Ajant an ap verifye kòd sekrè ou a</p>
          </div>
        )}
        {cashoutMethod === "agent_transfer" && (
          <div className="rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 p-3 flex items-start gap-2">
            <Users className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
            <div className="text-xs text-green-800 dark:text-green-400">
              <p className="font-bold mb-0.5">Ajan Otorize — Retrait Rapid ⚡</p>
              <p>Kontinye pou chwazi yon ajan sou rezo nou an. Ou pral voye kòb ou nan nimewo FM yo epi voye screenshot. Ajan an pral livye cash ou via metòd yo chwazi.</p>
            </div>
          </div>
        )}

        {cashoutMethod === "stripe_card" && (
          <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20 p-3 flex items-start gap-2">
            <CreditCard className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-800 dark:text-blue-400">
              <p className="font-bold mb-0.5">Stripe Card — Imedya ⚡</p>
              <p>Lajan pral ale dirèkteman nan kont Stripe ou a. Stripe pral transfere l nan kat ou oswa kont bank ou otomatikman (1-2 jou biznis).</p>
            </div>
          </div>
        )}

        {/* Warning */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            {cashoutMethod === "agent_transfer"
              ? "Lajan ou a pral dedwi imedyatman. Ajan otorize ap konfime livrezon an."
              : cashoutMethod === "stripe_card"
              ? "Lajan pral dedwi imedyatman epi transfere nan Stripe ou a. Pa gen retou posib."
              : "Lajan ou ap retire a pral dedwi nan balans ou touswit. Admin ap apwouve demann ou nan 24 zè."}
          </p>
        </div>

        <Button
          className={cn("w-full h-14 font-bold text-base", cashoutMethod === "stripe_card" ? "bg-blue-600 hover:bg-blue-700" : "bg-violet-600 hover:bg-violet-700")}
          disabled={!canSubmit || cashoutStripeMut.isPending}
          onClick={() => {
            if (cashoutMethod === "agent_transfer") {
              setStep("cashout_agent_select");
              return;
            }
            if (cashoutMethod === "stripe_card") {
              cashoutStripeMut.mutate();
              return;
            }
            setOtpPhone(cashoutMethod === "moncash" ? cashoutPhone.trim() : (user?.phone ?? ""));
            setOtpSent(false);
            setOtpCode("");
            setOtpError("");
            setOtpDevCode(null);
            setOtpCountdown(0);
            setStep("cashout_phone_verify");
          }}
        >
          {cashoutStripeMut.isPending ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : <ArrowDownCircle className="h-5 w-5 mr-2" />}
          {cashoutMethod === "agent_transfer" ? "Chwazi Ajan Otorize ⚡"
            : cashoutMethod === "stripe_card" ? "Voye nan Stripe ⚡"
            : "Kontinye — Verifye Telefòn"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Minimòm $1.00 · Maksimòm selon balans · Frè 2%</p>
      </div>
    );
  }

  // =========================================================================
  // ── CASHOUT AGENT SELECT step ─────────────────────────────────────────────
  // =========================================================================
  if (step === "cashout_agent_select") {
    return (
      <AgentSelectStep
        cashoutAmount={cashoutAmount}
        onBack={() => setStep("cashout")}
        onSelect={(agent) => { setSelectedAgent(agent); setStep("cashout_agent_pay"); }}
      />
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
        <BackButton onClick={() => setStep("cashout_agent_select")} />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-6 w-6 text-green-500" />
            <h1 className="text-2xl font-black">Voye Kòb nan Ajan</h1>
          </div>
          <p className="text-sm text-muted-foreground">Voye kòb ou nan nimewo FM ajan an epi voye screenshot</p>
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
                {selectedAgent.isOnline ? "🟢 Online" : "⚫ Offline"}
              </span>
            </div>
          </div>
          <div className="border-t border-green-200 dark:border-green-800/50 pt-3 space-y-2">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Nimewo FM Ajan</p>
            <div className="flex items-center gap-2 bg-background rounded-xl p-3 border border-green-300 dark:border-green-700">
              <code className="text-base font-black text-green-700 dark:text-green-400 flex-1 tracking-widest">{fmNum}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(fmNum); toast({ title: "✅ Kopi!" }); }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">Voye kòb nan nimewo FM sa a epi fè screenshot</p>
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-xl border bg-card p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ou ap retire</span>
            <span className="font-bold">${grossAmt.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Frè platfòm (2%)</span>
            <span className="text-red-500">−${feeAmt.toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t pt-2">
            <span className="font-bold">Ajan ap livye ou</span>
            <span className="font-black text-green-600">${netAmt.toFixed(2)}</span>
          </div>
        </div>

        {/* Payout methods agent supports */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Metòd livrezon ajan</p>
          <div className="flex flex-wrap gap-1.5">
            {methods.map(m => (
              <span key={m} className="text-xs font-semibold bg-muted px-2.5 py-1 rounded-full border border-border">{m}</span>
            ))}
          </div>
        </div>

        {/* WhatsApp button */}
        {selectedAgent.whatsappNumber && (
          <a
            href={`https://wa.me/${selectedAgent.whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(`Bonjou! M ap retire $${grossAmt.toFixed(2)} nan FM Wallet mwen. Nimewo référans: [...]`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl border-2 border-green-500 text-green-600 font-bold text-sm hover:bg-green-50 dark:hover:bg-green-950/20 transition-colors"
          >
            <span className="text-lg">📱</span>WhatsApp — Kominike ak Ajan
          </a>
        )}

        <Button className="w-full h-12 font-bold bg-green-600 hover:bg-green-700" onClick={() => setStep("cashout_agent_proof")}>
          Mwen voye kòb la — Kontinye ➜
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
        <BackButton onClick={() => setStep("cashout_agent_pay")} />
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Upload className="h-6 w-6 text-green-500" />
            <h1 className="text-2xl font-black">Voye Screenshot</h1>
          </div>
          <p className="text-sm text-muted-foreground">Pran yon screenshot prèv peman ou a epi soumèt demann lan</p>
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
                  <Loader2 className="h-3 w-3 animate-spin" />Ap upload…
                </div>
              )}
              {cashoutAgentScreenshotUrl && !cashoutAgentScreenshotUploading && (
                <p className="text-xs text-green-600 text-center mt-2 flex items-center justify-center gap-1">
                  <CheckCircle className="h-3 w-3" />Upload reyisi!
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <ImageIcon className="h-7 w-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-center">Klike pou chwazi screenshot</p>
              <p className="text-xs text-muted-foreground text-center">PNG, JPG, WEBP · Maksimòm 10 MB</p>
            </>
          )}
        </div>

        {/* Optional note */}
        <div className="space-y-2">
          <label className="text-sm font-semibold">Mesaj pou ajan (opsyonèl)</label>
          <textarea
            value={cashoutAgentNote}
            onChange={e => setCashoutAgentNote(e.target.value)}
            placeholder="ex: Mwen voye peman via MonCash nimewo…"
            rows={2}
            className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        {/* Summary */}
        <div className="rounded-xl border bg-muted/30 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Ajan</span><span className="font-bold">{selectedAgent.fullName}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Montan brut</span><span className="font-bold">${parseFloat(cashoutAmount).toFixed(2)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Ou resevwa (nèt)</span><span className="font-bold text-green-600">${Math.round((parseFloat(cashoutAmount) * 0.98) * 100) / 100}</span></div>
        </div>

        <Button
          className="w-full h-14 font-bold text-base bg-green-600 hover:bg-green-700"
          disabled={!canSubmit}
          onClick={() => cashoutAgentTransferMut.mutate()}
        >
          {cashoutAgentTransferMut.isPending
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ap soumèt…</>
            : <><CheckCircle2 className="h-5 w-5 mr-2" />Soumèt Demann Retrait</>}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Ajan an pral konfime livrezon an via metòd li chwazi</p>
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
          <h1 className="text-2xl font-black text-green-600">Demann Soumèt! ✅</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Ajan <strong>{selectedAgent?.fullName}</strong> resevwa demann ou a. Yo ap livye cash ou via metòd yo chwazi.
          </p>
        </div>
        <div className="rounded-2xl border bg-card p-4 space-y-2 text-sm text-left">
          <div className="flex justify-between"><span className="text-muted-foreground">Demann #</span><span className="font-mono font-bold">{cashoutResult?.requestId}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Montan nèt</span><span className="font-bold text-green-600">${Math.round((parseFloat(cashoutAmount) * 0.98) * 100) / 100}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Statut</span><Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">⏳ Ap tann ajan</Badge></div>
        </div>
        <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-950/20 p-3 text-xs text-blue-800 dark:text-blue-400 text-left">
          <p className="font-bold mb-1">📋 Pwochen etap</p>
          <ul className="space-y-1">
            <li>• Ajan an ap kontakte ou via WhatsApp oswa chat</li>
            <li>• Yo ap voye kòb via MonCash, Zelle, oswa cash</li>
            <li>• Si pa gen nouvèl nan 2 zè, kontakte sipò nou</li>
          </ul>
        </div>
        <Button className="w-full font-bold" onClick={() => setStep("home")}>
          Retounen nan Wallet
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
        <BackButton onClick={() => setStep("cashout")} />

        <div>
          <div className="flex items-center gap-2 mb-1">
            <KeyRound className="h-6 w-6 text-violet-500" />
            <h1 className="text-2xl font-black">Verifye Telefòn Ou</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Nou voye yon kòd 6 chif via SMS ak WhatsApp pou konfime retrait ou a
          </p>
        </div>

        {/* Summary card */}
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Montan retrait</p>
            <p className="text-2xl font-black text-violet-500">${parseFloat(cashoutAmount || "0").toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground mb-0.5">Metòd</p>
            <p className="text-sm font-bold">{cashoutMethod === "moncash" ? "📱 MonCash" : "🤝 Ajant"}</p>
          </div>
        </div>

        {/* Phone input */}
        <div className="space-y-2">
          <label className="text-sm font-semibold flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />Nimewo telefòn (E.164)
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
              disabled={otpPhone.trim().length < 8 || (otpSent && !canResend) || sendOtpMut.isPending}
              onClick={() => {
                setOtpError("");
                sendOtpMut.mutate(otpPhone.trim());
              }}
            >
              {sendOtpMut.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : otpSent && !canResend
                  ? `${mins}:${secs}`
                  : "Voye Kòd"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Kòd la pral voye via <strong>SMS</strong> ak <strong>WhatsApp</strong> an menm tan
          </p>
        </div>

        {/* Dev code hint */}
        {otpDevCode && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-400">Mode devlopman — Kòd a:</p>
              <p className="font-mono text-lg font-black tracking-widest text-amber-700 dark:text-amber-300 mt-0.5">{otpDevCode}</p>
              <p className="text-xs text-amber-400 mt-0.5">Kòd sa a pa parèt nan pwodiksyon reyèl</p>
            </div>
          </div>
        )}

        {/* OTP input — shown after send */}
        {otpSent && (
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-semibold">Kòd OTP 6 chif</label>
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
                    <Clock className="h-3 w-3" />Kòd ekspire nan
                  </span>
                  <span className={`font-mono font-bold ${otpCountdown < 60 ? "text-red-500" : "text-primary"}`}>
                    {mins}:{secs}
                  </span>
                </div>
              )}
              {otpCountdown === 0 && (
                <p className="text-xs text-red-500 text-center">Kòd la ekspire. Voye yon nouvo kòd.</p>
              )}
            </div>

            {/* Delivery channels */}
            <div className="flex gap-2 justify-center text-xs text-muted-foreground">
              <span className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />SMS livrezon
              </span>
              <span className="flex items-center gap-1 rounded-full bg-muted/50 px-2 py-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />WhatsApp livrezon
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
          disabled={!canVerify || isSubmitting || otpCountdown === 0}
          onClick={() => {
            setOtpError("");
            verifyOtpMut.mutate({ phone: otpPhone.trim(), code: otpCode.trim() });
          }}
        >
          {isSubmitting
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ap verifye…</>
            : <><CheckCircle2 className="h-5 w-5 mr-2" />Verifye ak Soumèt Retrait</>}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Pa resevwa kòd? Tcheke SMS ak WhatsApp ou. Kòd la valid pou 5 minit.
        </p>
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
          <h2 className="text-2xl font-black mb-1">Demann Soumèt!</h2>
          <p className="text-sm text-muted-foreground">Demann retrait #<span className="font-bold">{cashoutResult.requestId}</span> anrejistre</p>
        </div>

        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 text-left space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-violet-400">Kòman sa travay:</p>
          {cashoutMethod === "agent" ? (
            <ol className="space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>Admin apwouve demann ou (24h)</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>Ou resevwa yon kòd sekrè 6 karaktè</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>Ou ale jwenn ajant la epi montre l kòd la</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">4</span>Ajant verifye kòd la epi peye ou</li>
            </ol>
          ) : (
            <ol className="space-y-2 text-sm text-foreground">
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">1</span>Admin apwouve demann ou (24h)</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">2</span>Admin voye lajan nan nimewo MonCash ou</li>
              <li className="flex items-start gap-2"><span className="w-5 h-5 rounded-full bg-violet-600 text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">3</span>Ou resevwa notifikasyon peman an</li>
            </ol>
          )}
        </div>

        <div className="rounded-xl bg-muted/50 border border-border p-3">
          <p className="text-xs text-muted-foreground">Tcheke estati demann ou nan seksyon "Retrait Mwen" anba a.</p>
        </div>

        <Button
          className="w-full h-12 font-bold"
          onClick={() => { setStep("home"); qc.invalidateQueries({ queryKey: ["/cashout/my"] }); }}
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
        <BackButton onClick={() => setStep("home")} />
        <div>
          <h1 className="text-2xl font-black">Kat FM ou</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Pataje nimewo kont ou pou resevwa lajan Flexa — klike sou kat la pou vire l.
          </p>
        </div>

        <VirtualCard
          balance={balance}
          isLoading={isLoading}
          userName={user?.name ?? ""}
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
                Nimewo Kont FM
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
              <Copy className="h-3.5 w-3.5" /> Kopye
            </button>
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Bay moun yo nimewo kont ou pou yo voye lajan nan wallet FM ou dirèkteman.
        </p>

        {showQR && balance?.accountNumber && (
          <QRModal accountNumber={balance.accountNumber} onClose={() => setShowQR(false)} />
        )}
      </div>
    );
  }

  // =========================================================================
  // ── HOME ──────────────────────────────────────────────────────────────────
  // =========================================================================
  return (
    <div className="max-w-xl mx-auto px-3 py-4 pb-24 space-y-3">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => window.history.back()}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Retounen"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Wallet className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-black">{t("wallet.myWallet")}</h1>
        </div>
        <button
          onClick={() => {
            qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
            qc.invalidateQueries({ queryKey: ["/wallet/history"] });
          }}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* ══ FLEXA WALLET HERO CARD ══════════════════════════════════════════════ */}
      <div
        className="relative rounded-3xl overflow-hidden"
        style={{
          border: "1px solid rgba(139,92,246,0.30)",
          boxShadow: "0 0 40px rgba(109,40,217,0.25), 0 8px 32px rgba(0,0,0,0.6)",
        }}
      >
        {/* ── Layer 1: Base deep space bg ── */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(150deg,#060614 0%,#0b0923 45%,#100b28 100%)" }} />

        {/* ── Layer 2: Large glow orb (right-center) ── */}
        <div className="absolute pointer-events-none" style={{
          right: "-10%", top: "50%", transform: "translateY(-50%)",
          width: "65%", height: "160%",
          background: "radial-gradient(ellipse at center, rgba(139,92,246,0.70) 0%, rgba(109,40,217,0.38) 30%, rgba(76,29,149,0.12) 60%, transparent 80%)",
          filter: "blur(2px)",
        }} />

        {/* ── Layer 3: Bright diagonal streak / comet ── */}
        <div className="absolute pointer-events-none" style={{
          right: "8%", top: "-20%", width: "3px", height: "160%",
          background: "linear-gradient(180deg, transparent 0%, rgba(216,180,254,0.0) 20%, rgba(232,210,255,0.95) 45%, rgba(216,180,254,0.85) 52%, rgba(139,92,246,0.4) 65%, transparent 100%)",
          transform: "rotate(-30deg)",
          transformOrigin: "center center",
          filter: "blur(0.5px)",
          boxShadow: "0 0 12px 3px rgba(196,160,255,0.55)",
        }} />
        {/* Streak halo */}
        <div className="absolute pointer-events-none" style={{
          right: "4%", top: "-30%", width: "40px", height: "180%",
          background: "linear-gradient(180deg, transparent 10%, rgba(139,92,246,0.0) 30%, rgba(139,92,246,0.20) 48%, rgba(139,92,246,0.10) 55%, transparent 75%)",
          transform: "rotate(-30deg)",
          transformOrigin: "center center",
          filter: "blur(8px)",
        }} />

        {/* ── Layer 4: Dot grid (right half) ── */}
        <div className="absolute inset-y-0 right-0 pointer-events-none" style={{
          width: "55%",
          backgroundImage: "radial-gradient(circle, rgba(167,139,250,0.45) 1px, transparent 1px)",
          backgroundSize: "11px 11px",
          maskImage: "linear-gradient(to right, transparent 0%, black 40%)",
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 40%)",
          opacity: 0.55,
        }} />

        {/* ── Layer 5: Large faint ring (top-right) ── */}
        <div className="absolute pointer-events-none" style={{
          right: "-15%", top: "-35%",
          width: "280px", height: "280px",
          borderRadius: "50%",
          border: "1px solid rgba(167,139,250,0.18)",
        }} />
        <div className="absolute pointer-events-none" style={{
          right: "-5%", top: "-15%",
          width: "160px", height: "160px",
          borderRadius: "50%",
          border: "1px solid rgba(167,139,250,0.12)",
        }} />

        {/* ── Content ── */}
        <div className="relative p-4">

          {/* Top row */}
          <div className="flex items-center justify-between mb-3">
            {/* Logo + title */}
            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(145deg,#6d28d9 0%,#8b5cf6 50%,#7c3aed 100%)",
                  boxShadow: "0 0 14px rgba(139,92,246,0.50), inset 0 1px 0 rgba(255,255,255,0.15)",
                }}
              >
                <span className="text-white font-black text-base leading-none italic" style={{ textShadow: "0 0 10px rgba(255,255,255,0.4)" }}>F</span>
              </div>
              <div>
                <p className="text-white font-black text-sm tracking-wider leading-tight">FLEXA WALLET</p>
                <p className="font-mono text-[11px] mt-0.5" style={{ color: "rgba(167,139,250,0.65)" }}>
                  {balance?.accountNumber ?? "FM-······"}
                </p>
              </div>
            </div>

            {/* Eye + QR */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setBalanceVisible(v => !v)}
                className="flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.07)",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                }}
              >
                {balanceVisible
                  ? <Eye style={{ width: 16, height: 16, color: "rgba(255,255,255,0.75)" }} />
                  : <EyeOff style={{ width: 16, height: 16, color: "rgba(255,255,255,0.75)" }} />}
              </button>
              <button
                onClick={() => setShowQR(true)}
                disabled={!balance?.accountNumber}
                className="flex items-center justify-center transition-all active:scale-90 disabled:opacity-40"
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: "rgba(255,255,255,0.07)",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                }}
              >
                <QrCode style={{ width: 15, height: 15, color: "rgba(255,255,255,0.75)" }} />
              </button>
            </div>
          </div>

          {/* Balance */}
          <div className="mb-3">
            <p className="font-semibold mb-1" style={{ color: "#22d3ee", fontSize: 12, letterSpacing: "0.03em" }}>
              Balans Total
            </p>
            {isLoading ? (
              <div className="h-9 w-36 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.12)" }} />
            ) : (
              <p
                className="font-black leading-none text-white"
                style={{
                  fontSize: "clamp(1.6rem, 7.5vw, 2.2rem)",
                  letterSpacing: "-0.02em",
                  textShadow: "0 0 24px rgba(255,255,255,0.22), 0 0 48px rgba(139,92,246,0.18)",
                }}
              >
                {balanceVisible ? `$${(balance?.balanceUsd ?? 0).toFixed(2)}` : "$  ••••••"}
              </p>
            )}

            {/* HTG pill */}
            {!isLoading && (
              <div
                className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full"
                style={{
                  background: "rgba(15,10,40,0.65)",
                  border: "1px solid rgba(139,92,246,0.22)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <span className="font-bold text-[11px]" style={{ color: "rgba(255,255,255,0.50)" }}>G</span>
                <span className="font-mono font-semibold text-xs" style={{ color: "rgba(255,255,255,0.85)", letterSpacing: "0.05em" }}>
                  {balanceVisible
                    ? (balance?.balanceHtg ?? 0).toLocaleString().replace(/,/g, " ")
                    : "••• ••• •••"}
                </span>
                <span className="font-bold text-[11px]" style={{ color: "rgba(255,255,255,0.50)" }}>HTG</span>
              </div>
            )}
          </div>

          {/* Bottom: bonus + Copy ID / Share */}
          <div className="flex items-center justify-between">
            <div>
              {(balance?.bonusPct ?? 0) > 0 && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  +{balance?.bonusPct}% bonus
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { navigator.clipboard?.writeText(balance?.accountNumber ?? ""); toast({ title: t("wallet.accountCopied") }); }}
                disabled={!balance?.accountNumber}
                className="flex items-center gap-1 transition-all active:scale-95 disabled:opacity-30"
                style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  color: "rgba(255,255,255,0.78)",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <Copy style={{ width: 11, height: 11 }} /> Copy ID
              </button>
              <button
                onClick={handleShare}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{
                  padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600,
                  color: "rgba(255,255,255,0.78)",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <Share2 style={{ width: 11, height: 11 }} /> Share
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ══ PLATFORM REVENUE CARD (super admin only) ════════════════════════════ */}
      {isSuperAdmin && (
        <div
          className="relative overflow-hidden rounded-2xl"
          style={{
            background: "linear-gradient(145deg,#022c22 0%,#064e3b 45%,#065f46 100%)",
            border: "1.5px solid rgba(52,211,153,0.30)",
            boxShadow: "0 4px 24px rgba(16,185,129,0.18), inset 0 1px 0 rgba(52,211,153,0.12)",
            minHeight: 140,
          }}
        >
          {/* glow orb */}
          <div className="absolute pointer-events-none" style={{
            right: "-10%", top: "50%", transform: "translateY(-50%)",
            width: "55%", height: "160%",
            background: "radial-gradient(ellipse at center, rgba(16,185,129,0.55) 0%, rgba(5,150,105,0.25) 40%, transparent 75%)",
            filter: "blur(2px)",
          }} />
          {/* dot grid */}
          <div className="absolute inset-y-0 right-0 pointer-events-none" style={{
            width: "55%",
            backgroundImage: "radial-gradient(circle, rgba(52,211,153,0.35) 1px, transparent 1px)",
            backgroundSize: "11px 11px",
            maskImage: "linear-gradient(to right, transparent 0%, black 40%)",
            WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 40%)",
            opacity: 0.5,
          }} />

          <div className="relative p-4">
            {/* Top row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "linear-gradient(145deg,#047857 0%,#059669 50%,#10b981 100%)",
                    boxShadow: "0 0 14px rgba(16,185,129,0.50), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }}
                >
                  <Wallet style={{ width: 18, height: 18, color: "#fff" }} />
                </div>
                <div>
                  <p className="text-white font-black text-sm tracking-wider leading-tight">KAT FM FLEXAMARKET</p>
                  <p className="font-mono text-[11px] mt-0.5" style={{ color: "rgba(52,211,153,0.65)" }}>FM-FLEXA-MARKET</p>
                </div>
              </div>
              <button
                onClick={loadPlatformRev}
                className="flex items-center justify-center transition-all active:scale-90"
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "rgba(255,255,255,0.07)",
                  border: "1.5px solid rgba(255,255,255,0.18)",
                }}
              >
                <RefreshCw style={{ width: 13, height: 13, color: "rgba(255,255,255,0.75)" }}
                  className={platformRevLoading ? "animate-spin" : ""} />
              </button>
            </div>

            {/* Balance */}
            <div className="mb-3">
              <p className="font-semibold mb-1" style={{ color: "#34d399", fontSize: 12, letterSpacing: "0.03em" }}>
                Kont Platfòm Ofisyèl
              </p>
              {platformRevLoading || !platformRev ? (
                <div className="h-9 w-32 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.12)" }} />
              ) : (
                <p className="font-black leading-none text-white"
                  style={{ fontSize: "clamp(1.6rem, 7.5vw, 2.2rem)", letterSpacing: "-0.02em" }}>
                  ${platformRev.totalRevenue.toFixed(2)}
                </p>
              )}
              {/* Breakdown lines */}
              {platformRev && platformRev.totalRevenue > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1.5">
                  {platformRev.merchantCommission > 0 && (
                    <p style={{ color: "rgba(167,243,208,0.70)", fontSize: 11, fontWeight: 600 }}>
                      Komisyon <span className="text-white">${platformRev.merchantCommission.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.boostRevenue > 0 && (
                    <p style={{ color: "rgba(167,243,208,0.70)", fontSize: 11, fontWeight: 600 }}>
                      Boost <span className="text-white">${platformRev.boostRevenue.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.p2pTransferFees > 0 && (
                    <p style={{ color: "rgba(167,243,208,0.70)", fontSize: 11, fontWeight: 600 }}>
                      Frè Transfè <span className="text-white">${platformRev.p2pTransferFees.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.deliveryFees > 0 && (
                    <p style={{ color: "rgba(167,243,208,0.70)", fontSize: 11, fontWeight: 600 }}>
                      Livrezon 15% <span className="text-white">${platformRev.deliveryFees.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.subscriptionRevenue > 0 && (
                    <p style={{ color: "rgba(167,243,208,0.70)", fontSize: 11, fontWeight: 600 }}>
                      Abònman <span className="text-white">${platformRev.subscriptionRevenue.toFixed(2)}</span>
                    </p>
                  )}
                  {platformRev.rechargeFees > 0 && (
                    <p style={{ color: "rgba(167,243,208,0.70)", fontSize: 11, fontWeight: 600 }}>
                      Rechaj <span className="text-white">${platformRev.rechargeFees.toFixed(2)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bottom action buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => { navigator.clipboard?.writeText("FM-FLEXA-MARKET"); toast({ title: "ID kopye" }); }}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.78)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(8px)" }}
              >
                <Copy style={{ width: 11, height: 11 }} /> Copy ID
              </button>
              <button
                onClick={loadStatements}
                disabled={statementsLoading}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.90)", background: "rgba(16,185,129,0.25)", border: "1px solid rgba(52,211,153,0.45)", backdropFilter: "blur(8px)" }}
              >
                {statementsLoading ? "..." : "📊 Relevé Mwa"}
              </button>
              <button
                onClick={() => { const url = window.location.origin; navigator.share?.({ title: "FlexaMarket Platform", text: `Kont Platfòm: FM-FLEXA-MARKET\nRevni: $${platformRev?.totalRevenue?.toFixed(2) ?? "0.00"}`, url }); }}
                className="flex items-center gap-1 transition-all active:scale-95"
                style={{ padding: "5px 12px", borderRadius: 999, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.78)", background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.16)", backdropFilter: "blur(8px)" }}
              >
                <Share2 style={{ width: 11, height: 11 }} /> Share
              </button>
            </div>

            {/* ── Monthly Statements Panel ── */}
            {showStatements && statements && (
              <div className="mt-3 rounded-xl overflow-hidden" style={{ background: "rgba(0,0,0,0.35)", border: "1px solid rgba(52,211,153,0.25)" }}>
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid rgba(52,211,153,0.15)" }}>
                  <span style={{ color: "#34d399", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em" }}>RELEVÉ MANSYÈL {new Date().getFullYear()}</span>
                  <button onClick={() => setShowStatements(false)} style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1 }}>✕</button>
                </div>
                <div className="overflow-x-auto">
                  <table style={{ width: "100%", fontSize: 10.5, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "rgba(167,243,208,0.60)", borderBottom: "1px solid rgba(52,211,153,0.12)" }}>
                        {["Mwa","Total","Komisyon","Boost","Transfè","Livrezon","Abònman","Rechaj","Lòd"].map(h => (
                          <th key={h} style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {statements.filter(m => m.totalRevenue > 0).reverse().map(m => (
                        <tr key={m.month} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.85)" }}>
                          <td style={{ padding: "5px 8px", fontWeight: 700, color: "#34d399" }}>{m.month.slice(5)}/{m.month.slice(0,4)}</td>
                          <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#fff" }}>${m.totalRevenue.toFixed(2)}</td>
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
                        <tr><td colSpan={9} style={{ padding: "12px 8px", textAlign: "center", color: "rgba(255,255,255,0.35)", fontStyle: "italic" }}>Pa gen done pou ane sa a</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ QUICK ACTION BUTTONS ════════════════════════════════════════════════ */}
      <div className="flex justify-between gap-1">
        {([
          {
            label: t("wallet.actionDeposit"), Icon: ArrowUpCircle,
            iconColor: "#60a5fa",
            bg: "linear-gradient(145deg,#0f1f3d,#0d1a35)",
            border: "rgba(59,130,246,0.35)",
            glow: "rgba(59,130,246,0.15)",
            action: () => setStep(isHaiti ? "topup" : "card"),
          },
          {
            label: t("wallet.actionSend"), Icon: Send,
            iconColor: "#93c5fd",
            bg: "linear-gradient(145deg,#0c1c3a,#0b1830)",
            border: "rgba(96,165,250,0.30)",
            glow: "rgba(96,165,250,0.12)",
            action: () => setStep("send"),
          },
          {
            label: t("wallet.actionContacts"), Icon: Users,
            iconColor: "#4ade80",
            bg: "linear-gradient(145deg,#0a2318,#081e14)",
            border: "rgba(34,197,94,0.30)",
            glow: "rgba(34,197,94,0.12)",
            action: () => setLocation("/wallet/agents"),
          },
          {
            label: t("wallet.actionBonus"), Icon: Gift,
            iconColor: "#f97316",
            bg: "linear-gradient(145deg,#2d150a,#261008)",
            border: "rgba(249,115,22,0.30)",
            glow: "rgba(249,115,22,0.12)",
            action: () => { setRedeemCode(""); setRedeemSuccess(null); setStep("redeem_card"); },
          },
          {
            label: t("wallet.actionReceive"), Icon: ArrowDownCircle,
            iconColor: "#a78bfa",
            bg: "linear-gradient(145deg,#130d2e,#0f0926)",
            border: "rgba(139,92,246,0.30)",
            glow: "rgba(139,92,246,0.12)",
            action: () => setStep("cashout"),
          },
          {
            label: t("wallet.actionHistory"), Icon: Zap,
            iconColor: "#fbbf24",
            bg: "linear-gradient(145deg,#2a1d06,#231804)",
            border: "rgba(251,191,36,0.30)",
            glow: "rgba(251,191,36,0.12)",
            action: () => setLocation("/sales"),
          },
          {
            label: t("wallet.actionCard"), Icon: CreditCard,
            iconColor: "#2dd4bf",
            bg: "linear-gradient(145deg,#07231f,#061d1a)",
            border: "rgba(45,212,191,0.30)",
            glow: "rgba(45,212,191,0.12)",
            action: () => setStep("my_card"),
          },
        ]).map(({ label, Icon, iconColor, bg, border, glow, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex flex-col items-center gap-1 rounded-2xl transition-all active:scale-90"
            style={{
              width: 46, flexShrink: 0,
              paddingTop: 10, paddingBottom: 10,
              background: bg,
              border: `1.5px solid ${border}`,
              boxShadow: `0 3px 12px ${glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
            }}
          >
            <Icon style={{ width: 18, height: 18, color: iconColor, filter: `drop-shadow(0 0 4px ${iconColor}99)` }} />
            <span style={{ fontSize: 8, fontWeight: 700, color: "rgba(255,255,255,0.65)", lineHeight: 1.2, textAlign: "center" }}>
              {label}
            </span>
          </button>
        ))}
      </div>

      {/* ── 3-card Balance Breakdown ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {/* Available (Spendable) Balance */}
        <div className="rounded-xl border border-border bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-1 mb-1.5">
            <DollarSign className="h-3 w-3 text-blue-400" />
            <p className="text-xs text-muted-foreground font-medium">{t("wallet.availableLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-base font-black text-foreground">${availableUsd.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t("wallet.availableSub")}</p>
            </>
          )}
        </div>

        {/* Promo Balance (locked) */}
        <div className="rounded-xl border border-purple-200/60 dark:border-purple-700/40 bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-1 mb-1.5">
            <Gift className="h-3 w-3 text-purple-400" />
            <p className="text-xs text-muted-foreground font-medium">{t("wallet.promoBalanceLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-base font-black text-purple-500">${(balance?.promoBalance ?? 0).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t("wallet.promoBalanceSub")}</p>
            </>
          )}
        </div>

        {/* Unlocked Balance */}
        <div className={cn(
          "rounded-xl border p-2.5 shadow-sm",
          (balance?.unlockedBalance ?? 0) > 0
            ? "border-amber-300/60 dark:border-amber-600/40 bg-amber-50/40 dark:bg-amber-950/20"
            : "border-border bg-card"
        )}>
          <div className="flex items-center gap-1 mb-1.5">
            <ArrowRightLeft className="h-3 w-3 text-amber-400" />
            <p className="text-xs text-muted-foreground font-medium">{t("wallet.unlockedLabel")}</p>
          </div>
          {isLoading ? (
            <div className="h-5 w-14 bg-muted animate-pulse rounded" />
          ) : (
            <>
              <p className="text-base font-black text-amber-500">${(balance?.unlockedBalance ?? 0).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t("wallet.unlockedSub")}</p>
            </>
          )}
        </div>
      </div>


      {/* ── Promo Actions (Unlock + Convert) ───────────────────────────────── */}
      {!isLoading && ((balance?.newUnlockableUsd ?? 0) > 0 || (balance?.unlockedBalance ?? 0) > 0) && (
        <div className="rounded-xl border border-amber-200/70 dark:border-amber-700/40 bg-amber-50/30 dark:bg-amber-950/10 p-3 space-y-2.5">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Gift className="h-3.5 w-3.5" /> {t("wallet.promoActionsTitle")}
          </p>

          {/* Unlock */}
          {(balance?.newUnlockableUsd ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{t("wallet.promoUnlockTitle")}</p>
                <p className="text-xs text-muted-foreground">{t("wallet.promoUnlockDesc", { amount: (balance?.newUnlockableUsd ?? 0).toFixed(2) })}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7 text-xs border-amber-400 text-amber-600 hover:bg-amber-50"
                disabled={promoUnlockMut.isPending}
                onClick={() => promoUnlockMut.mutate()}
              >
                {promoUnlockMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : t("wallet.unlockBtn")}
              </Button>
            </div>
          )}

          {/* Convert */}
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

      {/* ── Promo Unlock Progress ───────────────────────────────────────────── */}
      {!isLoading && (balance?.promoBalance ?? 0) > 0 && (balance?.newUnlockableUsd ?? 0) === 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-foreground">{t("wallet.promoUnlockProgress")}</p>
            <p className="text-xs text-muted-foreground font-mono">{t("wallet.promoUnlockProgressDetail", {
              spent: (balance?.totalRealBoostSpend ?? 0).toFixed(2),
              next: (20 - ((balance?.totalRealBoostSpend ?? 0) % 20)).toFixed(2)
            })}</p>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-purple-500 to-amber-500 transition-all"
              style={{ width: `${Math.min(100, (((balance?.totalRealBoostSpend ?? 0) % 20) / 20) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-1.5">{t("wallet.promoUnlockHint")}</p>
        </div>
      )}

      {/* ── Aplike Pou Prè Biznis ──────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setLocation("/loans")}
        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-blue-600 to-cyan-700 p-[1.5px] shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:shadow-xl transition-all duration-300 w-full text-left"
      >
        <div className="relative rounded-2xl bg-gradient-to-br from-indigo-600/95 via-blue-600 to-cyan-700 px-4 py-4 flex items-center gap-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
          <div className="relative w-12 h-12 rounded-xl bg-white/15 ring-2 ring-white/25 flex items-center justify-center shrink-0">
            <DollarSign className="h-6 w-6 text-white" />
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center">
              <CheckCircle className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold text-white leading-tight">{t("wallet.businessLoanTitle")}</p>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">{t("wallet.businessLoanBadge")}</span>
            </div>
            <p className="text-xs text-blue-200 leading-snug">{t("wallet.businessLoanDesc")}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </button>

      {/* ── Panel Ajan Otorize (ajan ki déjà apwouve) ───────────────────────── */}
      {isApprovedAgent && (
        <button
          type="button"
          onClick={() => setLocation("/agent")}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-600 to-cyan-700 p-[1.5px] shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:shadow-xl transition-all duration-300 w-full text-left"
        >
          <div className="relative rounded-2xl bg-gradient-to-br from-emerald-500/95 via-teal-600 to-cyan-700 px-4 py-4 flex items-center gap-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
            <div className="relative w-12 h-12 rounded-xl bg-white/15 ring-2 ring-white/25 flex items-center justify-center shrink-0">
              <ShieldCheck className="h-6 w-6 text-white" />
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-yellow-400 flex items-center justify-center">
                <span className="text-[8px] font-black text-yellow-900">✓</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-white leading-tight">Panel Ajan Mwen</p>
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">Otorize</span>
              </div>
              <p className="text-xs text-emerald-100 leading-snug">Modifye taux an gro, taux an detay, estati, ak profil ou</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </button>
      )}

      {/* ── Aplike pou Ajan Otorize ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setLocation("/agents/apply")}
        className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-700 to-purple-800 p-[1.5px] shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 hover:shadow-xl transition-all duration-300 w-full text-left"
      >
        <div className="relative rounded-2xl bg-gradient-to-br from-violet-600/95 via-violet-700 to-purple-800 px-4 py-4 flex items-center gap-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
          <div className="relative w-12 h-12 rounded-xl bg-white/15 ring-2 ring-white/25 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-6 w-6 text-white" />
            <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center">
              <Zap className="h-2.5 w-2.5 text-white" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm font-bold text-white leading-tight">{t("wallet.agentApplyTitle")}</p>
              <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">
                {t("wallet.agentApplyBadge")}
              </span>
            </div>
            <p className="text-xs text-violet-200 leading-snug">{t("wallet.agentApplySubtitle")}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </button>

      {/* ── Demand Chofè / Driver Application (admin + Haiti/DR users) ───── */}
      {(isAdmin || isDeliveryCountry) && (
        <button
          type="button"
          onClick={() => setLocation("/delivery/apply")}
          className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 p-[1.5px] shadow-lg shadow-orange-500/20 hover:shadow-orange-500/40 hover:shadow-xl transition-all duration-300 w-full text-left"
        >
          <div className="relative rounded-2xl bg-gradient-to-br from-orange-500/95 via-amber-500 to-yellow-500 px-4 py-4 flex items-center gap-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
            <div className="relative w-12 h-12 rounded-xl bg-white/15 ring-2 ring-white/25 flex items-center justify-center shrink-0">
              <Truck className="h-6 w-6 text-white" />
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-white/30 flex items-center justify-center">
                <span className="text-[8px] font-black text-white">FM</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-sm font-bold text-white leading-tight">{t("nav.applyDriver")}</p>
                <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wider">{t("wallet.driverBadge")}</span>
              </div>
              <p className="text-xs text-orange-100 leading-snug">{t("nav.deliveryAvailable")} — {t("nav.driverApproved").toLowerCase()}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/70 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </button>
      )}

      {/* ── Bouton Rechaje Wallet ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setStep(isHaiti ? "topup" : "card")}
        className="group w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:shadow-xl transition-all duration-300 text-left"
      >
        <div className="px-4 py-3.5 flex items-center gap-3 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out" />
          <div className="w-10 h-10 rounded-xl bg-white/20 ring-2 ring-white/30 flex items-center justify-center shrink-0">
            <ArrowUpCircle className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black text-white leading-tight">Rechaje Wallet Ou</p>
            <p className="text-xs text-emerald-100">MonCash, Kart Kredi, Ajant, Crypto</p>
          </div>
          <ChevronRight className="h-5 w-5 text-white/80 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0" />
        </div>
      </button>

      {/* ── Compact Referral / Promo Card ──────────────────────────────────── */}
      {referral?.referralCode ? (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <Gift className="h-3.5 w-3.5 text-primary" />
              <p className="text-xs font-bold text-foreground">{t("wallet.promoTitle")}</p>
            </div>
            <button
              onClick={() => setShowReferralDetails(v => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showReferralDetails ? "Less ▲" : "Learn more ▼"}
            </button>
          </div>

          {/* Code row */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex-1 bg-background border border-primary/25 rounded-lg px-3 py-1.5 font-mono text-sm font-bold tracking-[0.15em] text-primary text-center">
              {referral.referralCode}
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(referral.referralCode ?? "").then(() => toast({ title: t("wallet.promoCopied") }))}
              className="w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted flex items-center justify-center transition-colors"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                const text = t("wallet.promoShareMsg", { code: referral.referralCode ?? "" });
                if (navigator.share) { navigator.share({ title: "FLEXA MARKET", text }).catch(() => {}); }
                else { navigator.clipboard.writeText(text).then(() => toast({ title: t("wallet.promoMsgCopied") })); }
              }}
              className="w-8 h-8 rounded-lg border border-border bg-background hover:bg-muted flex items-center justify-center transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Compact 3-stat row */}
          <div className="grid grid-cols-3 gap-1.5">
            <div className="bg-background/70 rounded-lg p-2 text-center">
              <p className="text-sm font-black text-foreground">{referral.totalReferred}</p>
              <p className="text-xs text-muted-foreground">{t("wallet.registered")}</p>
            </div>
            <div className="bg-background/70 rounded-lg p-2 text-center">
              <p className="text-sm font-black text-purple-400">${(referral.promoBalance ?? 0).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t("wallet.promoLocked")}</p>
            </div>
            <div className="bg-background/70 rounded-lg p-2 text-center">
              <p className="text-sm font-black text-amber-400">${(referral.unlockedBalance ?? 0).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">{t("wallet.unlockedLabel")}</p>
            </div>
          </div>

          {/* Expanded details */}
          {showReferralDetails && (
            <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">{t("wallet.promoDesc")}</p>
              <div className="flex items-start gap-1.5">
                <Clock className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-snug">{t("wallet.pendingConvertDesc")}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="bg-background/60 rounded-lg p-2 text-center">
                  <p className="text-sm font-black text-green-400">{referral.bonusesPaid}</p>
                  <p className="text-xs text-muted-foreground">{t("wallet.recharged20")}</p>
                </div>
                <div className="bg-background/60 rounded-lg p-2 text-center">
                  <p className="text-sm font-black text-amber-400">{referral.pendingBonuses}</p>
                  <p className="text-xs text-muted-foreground">{t("wallet.pending")}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground animate-pulse">{t("wallet.loadingPromo")}</div>
      )}

      {/* ── Recent Transactions ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{t("wallet.txHistory")}</p>
          {history && history.length > 0 && (
            <button type="button" onClick={() => setLocation("/wallet/history")} className="text-xs text-primary font-semibold hover:underline">
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
                <div key={tx.id} className="rounded-xl border border-border bg-card px-3 py-2.5 flex items-center gap-2.5">
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", meta.iconColor)}>
                    <Icon style={{ width: 15, height: 15 }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{meta.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleDateString("fr-HT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className={cn("text-sm font-black", isIn ? "text-emerald-500" : "text-red-500")}>
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
                className="block text-center text-xs text-primary font-semibold py-2.5 rounded-xl border border-border hover:bg-accent transition-colors"
              >
                Wè {history.length - 5} lòt tranzaksyon →
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Security notice (compact) ──────────────────────────────────────── */}
      <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 dark:bg-amber-950/15 px-3 py-2.5 flex items-center gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">
          <strong>{t("wallet.securityWay1Title")}</strong> — {t("wallet.securityWay1Desc")}
        </p>
      </div>

      {/* ── How it works (3 bullets) ───────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2.5">{t("wallet.howItWorks")}</p>
        <div className="space-y-2">
          {([
            { Icon: ArrowUpCircle, text: t("wallet.howTo1"), cls: "text-primary bg-primary/10" },
            { Icon: Send, text: t("wallet.howTo3"), cls: "text-blue-500 bg-blue-500/10" },
            { Icon: Zap, text: t("wallet.howTo4"), cls: "text-amber-500 bg-amber-500/10" },
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

      {/* ── Cashout Requests ──────────────────────────────────────────────── */}
      {cashoutRequests.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <ArrowDownCircle className="h-3.5 w-3.5 text-violet-500" /> Retrait Mwen
          </p>
          <div className="space-y-1.5">
            {cashoutRequests.slice(0, 3).map((r: any) => (
              <div key={r.id} className="rounded-xl border border-border bg-card px-3 py-2.5 flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  r.status === "pending" ? "bg-amber-100 dark:bg-amber-900/30" :
                  r.status === "approved" ? "bg-blue-100 dark:bg-blue-900/30" :
                  r.status === "paid" ? "bg-green-100 dark:bg-green-900/30" :
                  "bg-red-100 dark:bg-red-900/30"
                }`}>
                  {r.method === "moncash"
                    ? <Phone style={{ width: 14, height: 14 }} className={r.status === "paid" ? "text-green-400" : r.status === "rejected" ? "text-red-400" : r.status === "approved" ? "text-blue-400" : "text-amber-400"} />
                    : <MapPin style={{ width: 14, height: 14 }} className={r.status === "paid" ? "text-green-400" : r.status === "rejected" ? "text-red-400" : r.status === "approved" ? "text-blue-400" : "text-amber-400"} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-semibold">{r.method === "moncash" ? "MonCash" : "Ajant"}</span>
                    <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                      r.status === "pending" ? "bg-amber-900/30 text-amber-300" :
                      r.status === "approved" ? "bg-blue-900/30 text-blue-300" :
                      r.status === "paid" ? "bg-green-900/30 text-green-300" :
                      "bg-red-900/30 text-red-300"
                    }`}>
                      {r.status === "pending" ? "⏳" : r.status === "approved" ? "✓ Apwouve" : r.status === "paid" ? "✅ Peye" : "✗ Rejte"}
                    </span>
                    {r.status === "approved" && r.otpCode && (
                      <span className="font-mono font-black text-violet-400 dark:text-violet-300 bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded text-xs tracking-widest">
                        {r.otpCode}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString("fr-HT", { day: "2-digit", month: "short" })}
                  </p>
                </div>
                <p className="text-sm font-black text-red-500 shrink-0">-${parseFloat(r.amountUsd).toFixed(2)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQR && balance?.accountNumber && (
        <QRModal accountNumber={balance.accountNumber} onClose={() => setShowQR(false)} />
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
