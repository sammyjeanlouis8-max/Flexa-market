import React, { useState, useCallback } from "react";
import {
  ShieldAlert, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2,
  RefreshCw, Search, Bot, ChevronDown, ChevronUp, DollarSign, Users,
  Activity, Eye, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  userId: number;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  isFlagged: boolean;
  isBanned: boolean;
  balanceUsd: number;
  promoBalance: number;
  sumIn: number;
  sumOut: number;
  expected: number;
  gap: number;
  txCount: number;
  lastTxAt: string | null;
  adminDebitTotal: number;
  adminDebitCount: number;
  transferSentTotal: number;
  transferCount: number;
  largeDebits30d: number;
  txLast24h: number;
  flags: string[];
  riskScore: number;
}

interface Summary {
  totalAccounts: number;
  totalBalance: number;
  totalIn: number;
  totalOut: number;
  flaggedCount: number;
  integrityIssues: number;
  highRisk: number;
}

interface TxRow {
  id: number;
  type: string;
  amount_usd: number;
  description: string;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const FLAG_LABELS: Record<string, { label: string; color: string }> = {
  integrity_gap:      { label: "Ekart Balans",   color: "bg-red-600 text-white" },
  admin_debit:        { label: "Admin Debi",      color: "bg-orange-600 text-white" },
  large_debit_30d:    { label: "Gwo Retrè",       color: "bg-amber-600 text-white" },
  high_velocity_24h:  { label: "Vitès Elve",      color: "bg-purple-600 text-white" },
  many_transfers:     { label: "Plizyè Transfè",  color: "bg-blue-600 text-white" },
  high_transfer_volume: { label: "Gwo Transfè $", color: "bg-red-700 text-white" },
};

function riskColor(score: number) {
  if (score >= 60) return "text-red-500 font-bold";
  if (score >= 40) return "text-orange-500 font-semibold";
  if (score >= 20) return "text-yellow-500";
  return "text-green-500";
}

function fmt(n: number) {
  return `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("fr-HT", { day: "2-digit", month: "short", year: "2-digit" });
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({
  icon, label, value, sub, danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 flex gap-3 items-start ${danger ? "border-red-500/40 bg-red-500/5" : "border-border bg-muted/30"}`}>
      <div className={`mt-0.5 ${danger ? "text-red-500" : "text-primary"}`}>{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-lg font-bold ${danger ? "text-red-500" : ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminWalletMonitor() {
  const { toast } = useToast();

  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState<{ summary: Summary; accounts: AccountRow[] } | null>(null);
  const [filter, setFilter]       = useState<"all" | "flagged" | "integrity" | "high_risk">("flagged");
  const [search, setSearch]       = useState("");
  const [sortField, setSortField] = useState<"riskScore" | "gap" | "balanceUsd" | "txLast24h">("riskScore");
  const [sortAsc, setSortAsc]     = useState(false);

  // Transaction drawer
  const [txUser, setTxUser]     = useState<AccountRow | null>(null);
  const [txData, setTxData]     = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);

  // AI analysis dialog
  const [aiUser, setAiUser]       = useState<AccountRow | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult]   = useState<{ analysis: string; gap: number; expected: number } | null>(null);

  // ── Load data ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const r = await fetch("/api/admin/wallet-monitor", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData(await r.json());
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // ── Load transactions for a user ──────────────────────────────────────────

  const openTx = useCallback(async (acc: AccountRow) => {
    setTxUser(acc);
    setTxLoading(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const r = await fetch(`/api/admin/wallet-monitor/${acc.userId}/transactions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await r.json();
      setTxData(json.transactions ?? []);
    } catch {
      setTxData([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  // ── AI analysis ───────────────────────────────────────────────────────────

  const analyzeAI = useCallback(async (acc: AccountRow) => {
    setAiUser(acc);
    setAiResult(null);
    setAiLoading(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const r = await fetch(`/api/admin/wallet-monitor/${acc.userId}/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setAiResult(await r.json());
    } catch (e: any) {
      toast({ title: "Analiz echwe", description: e.message, variant: "destructive" });
      setAiUser(null);
    } finally {
      setAiLoading(false);
    }
  }, [toast]);

  // ── Sort & filter ─────────────────────────────────────────────────────────

  const accounts = (data?.accounts ?? [])
    .filter((a) => {
      if (filter === "flagged")   return a.flags.length > 0;
      if (filter === "integrity") return a.flags.includes("integrity_gap");
      if (filter === "high_risk") return a.riskScore >= 40;
      return true;
    })
    .filter((a) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        a.fullName?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q) ||
        String(a.userId).includes(q)
      );
    })
    .sort((a, b) => {
      const va = a[sortField] as number;
      const vb = b[sortField] as number;
      return sortAsc ? va - vb : vb - va;
    });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortIcon = ({ f }: { f: typeof sortField }) =>
    sortField === f
      ? sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />
      : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
        <ShieldAlert className="h-12 w-12 opacity-40" />
        <p className="text-sm">Klike pou chaje done Veye Kont yo</p>
        <Button onClick={load} disabled={loading} className="gap-2">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
          {loading ? "Ap chaje…" : "Chaje Monitè"}
        </Button>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h2 className="text-base font-bold">Veye Kont — Monitè Tranzaksyon</h2>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Aktyalize
        </Button>
      </div>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />}    label="Total Kont"       value={s.totalAccounts} />
        <StatCard icon={<DollarSign className="h-4 w-4" />} label="Balans Total Sistèm" value={fmt(s.totalBalance)} sub={`Rantre: ${fmt(s.totalIn)}`} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Kont Sijere"  value={s.flaggedCount}     danger={s.flaggedCount > 0} />
        <StatCard icon={<ShieldAlert className="h-4 w-4" />}   label="Ekart Balans" value={s.integrityIssues}  danger={s.integrityIssues > 0} sub={`${s.highRisk} gwo risk`} />
      </div>

      {/* ── Filters + search ── */}
      <div className="flex flex-wrap gap-2 items-center">
        {([
          ["all",       "Tout"],
          ["flagged",   `Sijere (${s.flaggedCount})`],
          ["integrity", `Ekart Balans (${s.integrityIssues})`],
          ["high_risk", `Gwo Risk (${s.highRisk})`],
        ] as const).map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === v
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            {l}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-7 h-7 text-xs w-48"
            placeholder="Chèche non / imèl…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span className="font-medium">Kle:</span>
        {Object.entries(FLAG_LABELS).map(([k, v]) => (
          <span key={k} className={`px-1.5 py-0.5 rounded text-[10px] ${v.color}`}>{v.label}</span>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="text-xs">
              <TableHead>Itilizatè</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("balanceUsd")}>
                Balans <SortIcon f="balanceUsd" />
              </TableHead>
              <TableHead>Rantre / Soti</TableHead>
              <TableHead>Teyorik</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("gap")}>
                Ekart <SortIcon f="gap" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("txLast24h")}>
                24h <SortIcon f="txLast24h" />
              </TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("riskScore")}>
                Risk <SortIcon f="riskScore" />
              </TableHead>
              <TableHead>Flags</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground text-sm py-10">
                  Okenn rezilta pou filtre sa a
                </TableCell>
              </TableRow>
            )}
            {accounts.map((a) => {
              const hasGap = Math.abs(a.gap) > 0.01;
              return (
                <TableRow
                  key={a.userId}
                  className={`text-xs ${hasGap ? "bg-red-500/5" : a.riskScore >= 40 ? "bg-orange-500/5" : ""}`}
                >
                  {/* User info */}
                  <TableCell className="min-w-[150px]">
                    <p className="font-medium truncate max-w-[140px]">{a.fullName || "—"}</p>
                    <p className="text-muted-foreground truncate max-w-[140px]">{a.email}</p>
                    <p className="text-muted-foreground">{a.country} · #{a.userId}</p>
                  </TableCell>

                  {/* Balance */}
                  <TableCell>
                    <span className="font-semibold">{fmt(a.balanceUsd)}</span>
                    {a.promoBalance > 0 && (
                      <p className="text-muted-foreground">{fmt(a.promoBalance)} promo</p>
                    )}
                  </TableCell>

                  {/* sumIn / sumOut */}
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-green-600 flex items-center gap-0.5">
                        <TrendingUp className="h-3 w-3" />{fmt(a.sumIn)}
                      </span>
                      <span className="text-red-500 flex items-center gap-0.5">
                        <TrendingDown className="h-3 w-3" />{fmt(a.sumOut)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Expected */}
                  <TableCell className="font-mono">{fmt(a.expected)}</TableCell>

                  {/* Gap */}
                  <TableCell>
                    {hasGap ? (
                      <span className="text-red-500 font-bold flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {a.gap > 0 ? "+" : ""}{a.gap.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />OK
                      </span>
                    )}
                  </TableCell>

                  {/* 24h tx count */}
                  <TableCell>
                    <span className={a.txLast24h >= 10 ? "text-purple-500 font-bold" : "text-muted-foreground"}>
                      {a.txLast24h}
                    </span>
                  </TableCell>

                  {/* Risk score */}
                  <TableCell>
                    <span className={`font-bold ${riskColor(a.riskScore)}`}>{a.riskScore}</span>
                    <span className="text-muted-foreground">/100</span>
                  </TableCell>

                  {/* Flags */}
                  <TableCell className="max-w-[180px]">
                    <div className="flex flex-wrap gap-1">
                      {a.flags.map((f) => (
                        <span
                          key={f}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${FLAG_LABELS[f]?.color ?? "bg-gray-500 text-white"}`}
                        >
                          {FLAG_LABELS[f]?.label ?? f}
                        </span>
                      ))}
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => openTx(a)}
                      >
                        <Eye className="h-3 w-3 mr-0.5" />Tx
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-purple-500 hover:text-purple-400"
                        onClick={() => analyzeAI(a)}
                      >
                        <Bot className="h-3 w-3 mr-0.5" />AI
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {accounts.length} kont afiche · {s.totalAccounts} total
      </p>

      {/* ── Transaction Drawer ── */}
      {txUser && (
        <Dialog open onOpenChange={() => setTxUser(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Tranzaksyon — {txUser.fullName} (#{txUser.userId})
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="text-center p-2 rounded bg-muted/40">
                <p className="text-xs text-muted-foreground">Balans</p>
                <p className="font-bold text-sm">{fmt(txUser.balanceUsd)}</p>
              </div>
              <div className="text-center p-2 rounded bg-green-500/10">
                <p className="text-xs text-muted-foreground">Total Rantre</p>
                <p className="font-bold text-sm text-green-600">{fmt(txUser.sumIn)}</p>
              </div>
              <div className="text-center p-2 rounded bg-red-500/10">
                <p className="text-xs text-muted-foreground">Total Soti</p>
                <p className="font-bold text-sm text-red-500">{fmt(txUser.sumOut)}</p>
              </div>
            </div>
            {Math.abs(txUser.gap) > 0.01 && (
              <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 text-red-500 text-xs mb-3">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>
                  <strong>Ekart balans detekte:</strong> Balans aktyèl ({fmt(txUser.balanceUsd)}) ≠ Balans teyorik ({fmt(txUser.expected)}) — Ekart: <strong>{txUser.gap > 0 ? "+" : ""}{txUser.gap.toFixed(2)}</strong>
                </span>
              </div>
            )}
            {txLoading ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-1">
                {txData.map((tx, i) => {
                  const amt = parseFloat(String(tx.amount_usd));
                  return (
                    <div
                      key={i}
                      className={`flex items-center justify-between p-2 rounded text-xs border ${
                        amt < 0 ? "border-red-500/20 bg-red-500/5" : "border-green-500/20 bg-green-500/5"
                      }`}
                    >
                      <div>
                        <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded mr-2">
                          {tx.type}
                        </span>
                        <span className="text-muted-foreground">{tx.description || "—"}</span>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <span className={`font-bold ${amt < 0 ? "text-red-500" : "text-green-600"}`}>
                          {amt >= 0 ? "+" : ""}{amt.toFixed(2)}
                        </span>
                        <p className="text-muted-foreground text-[10px]">{fmtDate(tx.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* ── AI Analysis Dialog ── */}
      {aiUser && (
        <Dialog open onOpenChange={() => { setAiUser(null); setAiResult(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <Bot className="h-4 w-4 text-purple-500" />
                Analiz AI — {aiUser.fullName}
              </DialogTitle>
            </DialogHeader>
            {aiLoading ? (
              <div className="flex flex-col items-center gap-3 py-10">
                <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
                <p className="text-sm text-muted-foreground">AI ap analize kont sa a…</p>
              </div>
            ) : aiResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-muted-foreground">Balans</p>
                    <p className="font-bold">{fmt(aiUser.balanceUsd)}</p>
                  </div>
                  <div className="p-2 rounded bg-muted/40">
                    <p className="text-muted-foreground">Teyorik</p>
                    <p className="font-bold">{fmt(aiResult.expected)}</p>
                  </div>
                  <div className={`p-2 rounded ${Math.abs(aiResult.gap) > 0.01 ? "bg-red-500/10" : "bg-green-500/10"}`}>
                    <p className="text-muted-foreground">Ekart</p>
                    <p className={`font-bold ${Math.abs(aiResult.gap) > 0.01 ? "text-red-500" : "text-green-600"}`}>
                      {aiResult.gap > 0 ? "+" : ""}{aiResult.gap.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
                  <p className="text-xs font-semibold text-purple-400 mb-2 flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5" /> Rapò AI
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{aiResult.analysis}</p>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => openTx(aiUser)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />Wè Tranzaksyon
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs ml-auto" onClick={() => { setAiUser(null); setAiResult(null); }}>
                    <X className="h-3.5 w-3.5 mr-1" />Fèmen
                  </Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
