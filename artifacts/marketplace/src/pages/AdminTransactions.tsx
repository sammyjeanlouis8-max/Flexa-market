/**
 * AdminTransactions — Full-page Transactions Hub
 * Route: /admin/transactions
 */
import { useState, useEffect } from "react";
import { ArrowLeft, ArrowLeftRight, RefreshCw, Search, Copy, Wallet } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

async function adminFetch(path: string, method = "GET", body?: object) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

const TYPE_LABELS: Record<string, string> = {
  recharge: "Recharge", boost_debit: "Boost annons", purchase_debit: "Achèt",
  promo_purchase_debit: "Achèt (promo)", bonus: "Bonis", refund: "Ranbousman",
  transfer_sent: "Transfè voye", transfer_received: "Transfè resevwa",
  referral_pending: "Bonis parenn (atann)", referral_released: "Bonis parenn",
  promo_spend_bonus: "Bonis depans", purchase_loyalty_bonus: "Bonis fidèlite",
  promo_boost_debit: "Boost (promo)", promo_unlock: "Promo debloke",
  promo_convert: "Promo konvèti", cashout_pending: "Retre (atann)",
  cashout_debit: "Retre konfime", recharge_fee: "Frè sèvis (ansyen)",
  referral_commission_debit: "Komisyon kòd envit",
  referral_commission_income: "Komisyon parenn", seller_earnings: "Revni vant",
  loan_disbursement: "Prè resevwa", loan_repayment: "Vèsman prè",
  job_fee: "Frè pòs djòb", boost_credit: "Kreditasyon boost",
  transfer_fee: "Frè transfè", chargeback_debit: "Chajbak — dispute",
  chargeback_reversal: "Chajbak — renmèsi",
  subscription_debit: "Abòman VIP", subscription_refund: "Ranbousman abòman",
};

export default function AdminTransactions() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [balances, setBalances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Detail sheet
  const [detailUserId, setDetailUserId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/wallet/admin/all");
      setBalances(Array.isArray(data?.balances) ? data.balances : []);
    } catch {
      setBalances([]);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = async (userId: number) => {
    setDetailUserId(userId);
    setDetailData(null);
    setDetailLoading(true);
    try {
      const data = await adminFetch(`/api/wallet/admin/user/${userId}`);
      setDetailData(data);
    } catch {
      setDetailData(null);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Guard: admin only
  if (!user?.isAdmin && !user?.isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-center px-6">
        <p className="text-lg font-bold text-red-500">Aksè Refize</p>
        <p className="text-sm text-muted-foreground">Sèlman admin ka wè paj sa a.</p>
        <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Retounen
        </Button>
      </div>
    );
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? balances.filter(w =>
        (w.userName ?? "").toLowerCase().includes(q) ||
        (w.userEmail ?? "").toLowerCase().includes(q) ||
        String(w.userId).includes(q)
      )
    : balances;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation("/admin")}
          className="p-2 rounded-xl hover:bg-muted transition-colors -ml-1 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black leading-none">💳 Transactions</h1>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Balans & istwa konplè pa itilizatè</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 mr-1 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
        {/* Info banner */}
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            💡 Klike sou yon itilizatè pou wè tout istwa tranzaksyon wallet li yo.
          </p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Chèche pa non, imèl, oswa ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full h-10 rounded-xl border border-border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          />
        </div>

        {/* User list */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-16 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : balances.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <ArrowLeftRight className="h-7 w-7 text-emerald-400" />
            </div>
            <p className="text-sm text-muted-foreground">Pa gen done. Klike Refresh.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{filtered.length} itilizatè</p>
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">
                Okenn rezilta pou "{search}"
              </p>
            ) : filtered.map((w: any) => {
              const bal = parseFloat(w.balanceUsd ?? 0);
              const initials = (w.userName ?? "?")[0].toUpperCase();
              return (
                <button
                  key={w.userId}
                  onClick={() => openDetail(w.userId)}
                  className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent hover:border-emerald-500/40 active:scale-[0.98] transition-all text-left group"
                >
                  <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-emerald-600">{initials}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{w.userName ?? `User #${w.userId}`}</p>
                    <p className="text-xs text-muted-foreground truncate">{w.userEmail ?? `ID #${w.userId}`}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black tabular-nums ${bal > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                      ${bal.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{w.userCountry ?? ""}</p>
                  </div>
                  <ArrowLeftRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-emerald-500 transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Wallet Detail Sheet */}
      <Sheet open={detailUserId !== null} onOpenChange={open => { if (!open) { setDetailUserId(null); setDetailData(null); } }}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
          <SheetHeader className="px-4 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10">
            <SheetTitle className="flex items-center gap-2 text-base">
              <button
                onClick={() => { setDetailUserId(null); setDetailData(null); }}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors -ml-1 shrink-0"
              >
                <ArrowLeft className="h-5 w-5 text-foreground" />
              </button>
              <Wallet className="h-4 w-4 text-primary" />
              Pwofil Pòtfèy
            </SheetTitle>
          </SheetHeader>

          {detailLoading ? (
            <div className="flex flex-col gap-3 p-5">
              {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : !detailData ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
              Pa gen done disponib
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* User card */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-base">{detailData.user.name}</p>
                  <div className="flex gap-1">
                    {detailData.user.isAdmin && <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-500">Admin</Badge>}
                    {detailData.user.isRestricted && <Badge variant="outline" className="text-[10px] border-red-400 text-red-500">Bloke</Badge>}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{detailData.user.email}</p>
                {detailData.user.phone && <p className="text-xs text-muted-foreground">{detailData.user.phone}</p>}
                <div className="flex items-center gap-2 pt-1">
                  {detailData.user.country && (
                    <span className="text-xs">{COUNTRY_FLAGS[detailData.user.country] ?? ""} {detailData.user.country}</span>
                  )}
                  {detailData.wallet?.accountNumber && (
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{detailData.wallet.accountNumber}</span>
                  )}
                </div>
              </div>

              {/* Balance tiles */}
              {detailData.wallet && (
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Disponib</p>
                    <p className="text-lg font-black text-emerald-500 tabular-nums">${parseFloat(detailData.wallet.balanceUsd ?? 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Promo</p>
                    <p className="text-lg font-black text-violet-400 tabular-nums">${parseFloat(detailData.wallet.promoBalance ?? 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Debloke</p>
                    <p className="text-lg font-black text-amber-400 tabular-nums">${parseFloat(detailData.wallet.unlockedBalance ?? 0).toFixed(2)}</p>
                  </div>
                </div>
              )}

              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-muted/50 px-2 py-2">
                  <p className="text-[10px] text-muted-foreground">Antre</p>
                  <p className="text-sm font-black text-emerald-500">+${detailData.totalIn.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-2">
                  <p className="text-[10px] text-muted-foreground">Depans</p>
                  <p className="text-sm font-black text-red-500">-${detailData.totalOut.toFixed(2)}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-2">
                  <p className="text-[10px] text-muted-foreground">Total tx</p>
                  <p className="text-sm font-black tabular-nums">{detailData.count}</p>
                </div>
              </div>

              {/* Transaction list */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Istwa konplè ({detailData.count} tx)
                  </p>
                  <button
                    onClick={() => {
                      const u = detailData.user;
                      const lines = [
                        `📊 Istwa Tranzaksyon — ${u.name}`,
                        `📧 ${u.email}  |  💰 Balans: $${parseFloat(detailData.wallet?.balanceUsd ?? 0).toFixed(2)}`,
                        `──────────────────────────────`,
                        ...detailData.transactions.map((tx: any) => {
                          const isIn = tx.amountUsd > 0;
                          const absAmt = Math.abs(parseFloat(tx.amountUsd));
                          const lbl = TYPE_LABELS[tx.type] ?? tx.type.replace(/_/g, " ");
                          const date = new Date(String(tx.createdAt).replace(" ", "T")).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                          const status = tx.status === "completed" ? "✓" : tx.status === "pending" ? "⏳" : "✗";
                          return `${status} ${isIn ? "+" : "-"}$${absAmt.toFixed(2)}  ${lbl}  —  ${date}${tx.note ? `  (${tx.note})` : ""}`;
                        }),
                        `──────────────────────────────`,
                        `Jenere pa FlexaMarket Admin  •  ${new Date().toLocaleDateString("fr-HT")}`,
                      ].join("\n");
                      navigator.clipboard.writeText(lines);
                      toast({ title: "✅ Kopye!", description: "Tout tranzaksyon yo kopye nan clipboard." });
                    }}
                    className="flex items-center gap-1 text-[11px] text-primary border border-primary/30 rounded-md px-2 py-1 hover:bg-primary/10 transition-colors"
                  >
                    <Copy className="h-3 w-3" /> Kopye tout
                  </button>
                </div>

                {detailData.transactions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Pa gen tranzaksyon</p>
                ) : (
                  <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-0.5">
                    {detailData.transactions.map((tx: any) => {
                      const isIn = tx.amountUsd > 0;
                      const absAmt = Math.abs(parseFloat(tx.amountUsd));
                      const label = TYPE_LABELS[tx.type] ?? tx.type.replace(/_/g, " ");
                      return (
                        <div key={tx.id} className="rounded-xl border border-border bg-background px-3 py-2.5 space-y-0.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${isIn ? "bg-emerald-500" : "bg-red-500"}`} />
                              <p className="text-xs font-semibold truncate">{label}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <p className={`text-sm font-black tabular-nums ${isIn ? "text-emerald-500" : "text-red-500"}`}>
                                {isIn ? "+" : "-"}${absAmt.toFixed(2)}
                              </p>
                              <button
                                onClick={() => {
                                  const date = new Date(String(tx.createdAt).replace(" ", "T")).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                                  const status = tx.status === "completed" ? "✓ Fini" : tx.status === "pending" ? "⏳ Atann" : "✗ Rejte";
                                  navigator.clipboard.writeText(
                                    `${isIn ? "+" : "-"}$${absAmt.toFixed(2)} — ${label}\n${status}  •  ${date}${tx.note ? `\nNote: ${tx.note}` : ""}${tx.paymentRef ? `\nRef: ${tx.paymentRef}` : ""}`
                                  );
                                  toast({ title: "✅ Kopye!" });
                                }}
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Kopye"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pl-3.5">
                            <p className={`text-[10px] font-semibold ${tx.status === "completed" ? "text-emerald-500" : tx.status === "pending" ? "text-amber-500" : "text-red-500"}`}>
                              {tx.status === "completed" ? "✓ Fini" : tx.status === "pending" ? "⏳ Atann" : "✗ Rejte"}
                            </p>
                            <span className="text-[10px] text-muted-foreground/50">·</span>
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(String(tx.createdAt).replace(" ", "T")).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                          {tx.note && <p className="text-[10px] text-muted-foreground/70 pl-3.5 italic truncate">{tx.note}</p>}
                          {tx.paymentRef && <p className="text-[10px] font-mono text-muted-foreground/50 pl-3.5 truncate">{tx.paymentRef}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
