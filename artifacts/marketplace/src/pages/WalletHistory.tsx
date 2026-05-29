import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, ArrowDownCircle, ArrowUpCircle, CheckCircle2,
  Send, Gift, Zap, ArrowRightLeft, Clock, TrendingDown, TrendingUp, ShoppingCart, ShieldAlert, ShieldCheck,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────
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

interface HistoryResponse {
  transactions: WalletTx[];
  totalIn: number;
  totalOut: number;
  count: number;
}

type Filter = "all" | "in" | "out";

// ── API helper ──────────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
}
async function apiGet(path: string) {
  const token = getToken();
  const r = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Transaction metadata ────────────────────────────────────────────────────────
function txMeta(type: string, amount: number) {
  const pos = amount >= 0;
  if (type === "recharge")               return { label: "Recharge",          Icon: ArrowDownCircle,  color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "boost_debit")            return { label: "Boost annons",       Icon: Zap,              color: "text-blue-500",    bg: "bg-blue-500/10",    sign: "-" };
  if (type === "purchase_debit")         return { label: "Achèt",              Icon: ShoppingCart,     color: "text-red-500",     bg: "bg-red-500/10",     sign: "-" };
  if (type === "promo_purchase_debit")   return { label: "Achèt (promo)",      Icon: ShoppingCart,     color: "text-violet-500",  bg: "bg-violet-500/10",  sign: "-" };
  if (type === "bonus")                  return { label: "Bonis",              Icon: CheckCircle2,     color: "text-violet-500",  bg: "bg-violet-500/10",  sign: "+" };
  if (type === "refund")                 return { label: "Ranbousman",         Icon: ArrowDownCircle,  color: "text-blue-500",    bg: "bg-blue-500/10",    sign: "+" };
  if (type === "transfer_sent")          return { label: "Transfè voye",       Icon: Send,             color: "text-red-500",     bg: "bg-red-500/10",     sign: "-" };
  if (type === "transfer_received")      return { label: "Transfè resevwa",    Icon: ArrowDownCircle,  color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "referral_pending")       return { label: "Bonis parenn (atann)",Icon: Gift,            color: "text-amber-500",   bg: "bg-amber-500/10",   sign: "+" };
  if (type === "referral_released")      return { label: "Bonis parenn",       Icon: Gift,             color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "promo_spend_bonus")      return { label: "Bonis depans",       Icon: Gift,             color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "purchase_loyalty_bonus") return { label: "Bonis fidèlite",     Icon: Gift,             color: "text-violet-500",  bg: "bg-violet-500/10",  sign: "+" };
  if (type === "promo_boost_debit")      return { label: "Boost (promo)",      Icon: Zap,              color: "text-violet-500",  bg: "bg-violet-500/10",  sign: "-" };
  if (type === "promo_unlock")           return { label: "Promo debloke",      Icon: ArrowRightLeft,   color: "text-amber-500",   bg: "bg-amber-500/10",   sign: "+" };
  if (type === "promo_convert")          return { label: "Promo konvèti",      Icon: ArrowRightLeft,   color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "cashout_pending")        return { label: "Retre (atann)",      Icon: TrendingDown,     color: "text-orange-500",  bg: "bg-orange-500/10",  sign: "-" };
  if (type === "cashout_debit")          return { label: "Retre konfime",      Icon: TrendingDown,     color: "text-red-500",     bg: "bg-red-500/10",     sign: "-" };
  if (type === "recharge_fee")           return { label: "Frè sèvis (ansyen)", Icon: TrendingDown,     color: "text-orange-500",  bg: "bg-orange-500/10",  sign: "-" };
  if (type === "referral_commission_debit")   return { label: "Komisyon kòd envit",  Icon: Gift,         color: "text-orange-500",  bg: "bg-orange-500/10",  sign: "-" };
  if (type === "referral_commission_income")  return { label: "Komisyon parenn",    Icon: Gift,         color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "seller_earnings")        return { label: "Revni vant",         Icon: TrendingUp,       color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "loan_disbursement")      return { label: "Prè resevwa",        Icon: ArrowDownCircle,  color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "loan_repayment")         return { label: "Vèsman prè",         Icon: TrendingDown,     color: "text-red-500",     bg: "bg-red-500/10",     sign: "-" };
  if (type === "job_fee")                return { label: "Frè pòs djòb",       Icon: TrendingDown,     color: "text-blue-500",    bg: "bg-blue-500/10",    sign: "-" };
  if (type === "boost_credit")           return { label: "Kreditasyon boost",   Icon: Zap,              color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  if (type === "transfer_fee")           return { label: "Frè transfè",        Icon: TrendingDown,     color: "text-orange-500",  bg: "bg-orange-500/10",  sign: "-" };
  if (type === "chargeback_debit")       return { label: "Chajbak — dispute",  Icon: ShieldAlert,      color: "text-red-600",     bg: "bg-red-600/10",     sign: "-" };
  if (type === "chargeback_reversal")    return { label: "Chajbak — renmèsi",  Icon: ShieldCheck,      color: "text-emerald-500", bg: "bg-emerald-500/10", sign: "+" };
  return { label: type.replace(/_/g, " "), Icon: ArrowRightLeft, color: pos ? "text-emerald-500" : "text-red-500", bg: "bg-muted", sign: pos ? "+" : "-" };
}

function statusBadge(status: string) {
  if (status === "completed") return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0 text-[10px] px-1.5 py-0.5">Fini</Badge>;
  if (status === "pending")   return <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0 text-[10px] px-1.5 py-0.5">Atann</Badge>;
  if (status === "rejected")  return <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-0 text-[10px] px-1.5 py-0.5">Rejte</Badge>;
  return null;
}

// ── Date group helpers ──────────────────────────────────────────────────────────
function dateGroupLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Jodi a";
  if (diff === 1) return "Yèswa";
  if (diff < 7)   return `${diff} jou pase`;
  return d.toLocaleDateString("fr-HT", { day: "2-digit", month: "long", year: diff > 365 ? "numeric" : undefined });
}

function groupByDate(txs: WalletTx[]): Array<{ label: string; items: WalletTx[] }> {
  const map = new Map<string, WalletTx[]>();
  for (const tx of txs) {
    const key = dateGroupLabel(tx.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(tx);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

function fmtTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("fr-HT", { hour: "2-digit", minute: "2-digit" });
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function WalletHistory() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: ["/wallet/history", filter],
    queryFn: () => apiGet(`/wallet/history?filter=${filter}`),
    enabled: !!user,
  });

  const txs = data?.transactions ?? [];
  const groups = groupByDate(txs);

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "Tout" },
    { key: "in",  label: "Antre 💚" },
    { key: "out", label: "Depans 🔴" },
  ];

  return (
    <div className="max-w-xl mx-auto px-0 pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/wallet">
            <button type="button" className="h-9 w-9 rounded-full flex items-center justify-center hover:bg-accent transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-extrabold text-base leading-tight">Istorik Pèman</h1>
            {data && (
              <p className="text-xs text-muted-foreground">{data.count} tranzaksyon</p>
            )}
          </div>
        </div>

        {/* ── Summary strip ── */}
        {data && (
          <div className="grid grid-cols-2 gap-2 px-4 pb-3">
            <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 px-3 py-2.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Total Antre</p>
                <p className="text-sm font-black text-emerald-500 tabular-nums">+${data.totalIn.toFixed(2)}</p>
              </div>
            </div>
            <div className="rounded-xl bg-red-500/8 border border-red-500/20 px-3 py-2.5 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-red-500/15 flex items-center justify-center shrink-0">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Total Depans</p>
                <p className="text-sm font-black text-red-500 tabular-nums">-${data.totalOut.toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Filter pills ── */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
          {FILTERS.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 h-8 px-3.5 rounded-full text-xs font-semibold border transition-all",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 pt-4 space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : txs.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
            <Clock className="h-10 w-10 opacity-20" />
            <p className="text-sm">Pa gen tranzaksyon nan kategori sa a</p>
          </div>
        ) : (
          groups.map(group => (
            <div key={group.label}>
              {/* Date label */}
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2 px-1">
                {group.label}
              </p>

              {/* Transactions */}
              <div className="space-y-1.5">
                {group.items.map(tx => {
                  const meta = txMeta(tx.type, tx.amountUsd);
                  const { Icon } = meta;
                  const absAmt = Math.abs(tx.amountUsd);
                  const isIn = tx.amountUsd > 0;

                  return (
                    <div
                      key={tx.id}
                      className="rounded-xl border border-border bg-card px-3 py-3 flex items-center gap-3"
                    >
                      {/* Icon */}
                      <div className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0", meta.bg)}>
                        <Icon className={cn("h-4 w-4", meta.color)} />
                      </div>

                      {/* Label + ref/note */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight truncate">
                          {meta.label}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <p className="text-[11px] text-muted-foreground">{fmtTime(tx.createdAt)}</p>
                          {tx.paymentRef && (
                            <p className="text-[10px] text-muted-foreground/60 truncate max-w-[100px]">· {tx.paymentRef}</p>
                          )}
                        </div>
                        {tx.note && (
                          <p className="text-[11px] text-muted-foreground/70 truncate mt-0.5">{tx.note}</p>
                        )}
                      </div>

                      {/* Amount + status */}
                      <div className="text-right shrink-0 space-y-1">
                        <p className={cn("text-sm font-black tabular-nums", isIn ? "text-emerald-500" : "text-red-500")}>
                          {isIn ? "+" : "-"}${absAmt.toFixed(2)}
                        </p>
                        {tx.amountHtg && tx.amountHtg > 0 && (
                          <p className="text-[10px] text-muted-foreground tabular-nums">{tx.amountHtg.toLocaleString()} HTG</p>
                        )}
                        {statusBadge(tx.status)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
