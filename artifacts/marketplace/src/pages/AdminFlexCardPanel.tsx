import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import {
  Loader2, CreditCard, User, ShieldCheck, AlertTriangle, Clock, CheckCircle,
  Wallet, Pencil, RefreshCw,
} from "lucide-react";

interface DebtRow {
  debtId: number;
  userId: number;
  userName: string;
  userEmail: string;
  userPhone: string | null;
  userAvatar: string | null;
  reason: string;
  referenceCode: string;
  originalAmountUsd: number;
  outstandingUsd: number;
  notes: string | null;
  deadline: string | null;
  status: string;
  blockedAt: string | null;
  clearedAt: string | null;
  repaidUsd: number;
  lastRepaymentUsd: number | null;
  lastRepaymentAt: string | null;
}

interface Repayment {
  id: number;
  debtId: number;
  amountUsd: number;
  outstandingAfterUsd: number;
  source: string;
  createdAt: string;
}

interface DebtHistory {
  id: number;
  reason: string;
  referenceCode: string;
  originalAmountUsd: number;
  outstandingUsd: number;
  status: string;
  blockedAt: string | null;
  clearedAt: string | null;
}

const REASON_LABEL: Record<string, string> = {
  debt: "💸 Dèt",
  merchant_complaint: "🏪 Plent Machann",
  chargeback: "↩️ Chargeback",
  fraud_investigation: "🔍 Envestigasyon Fwòd",
  policy_violation: "📋 Vyolasyon Règ",
  manual_review: "👀 Revizyon Manyèl",
  other: "➕ Lòt",
};

export default function AdminFlexCardPanel() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<DebtRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("active");

  // Detail dialog state
  const [selected, setSelected] = useState<DebtRow | null>(null);
  const [repayments, setRepayments] = useState<Repayment[]>([]);
  const [debts, setDebts] = useState<DebtHistory[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adjustValue, setAdjustValue] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: filterStatus });
      const res = await fetch(`/api/admin/flex-card?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setRows(data.items ?? []);
        setTotal(data.total ?? 0);
        setTotalOutstanding(data.totalOutstandingUsd ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [token, filterStatus]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (row: DebtRow) => {
    setSelected(row);
    setAdjustValue(String(row.outstandingUsd));
    setAdjustNotes("");
    setRepayments([]);
    setDebts([]);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/admin/flex-card/${row.userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setRepayments(d.repayments ?? []);
        setDebts(d.debts ?? []);
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const apiPost = async (path: string, body: object) => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error ?? "Erè entèn");
    }
    return res.json();
  };

  const handleAdjust = async () => {
    if (!selected) return;
    const amt = parseFloat(adjustValue);
    if (!Number.isFinite(amt) || amt < 0) {
      toast({ title: "Antre yon montan ki valab.", variant: "destructive" });
      return;
    }
    setActing(true);
    try {
      await apiPost("/api/admin/flex-card/adjust", {
        userId: selected.userId,
        outstandingUsd: amt,
        notes: adjustNotes || null,
      });
      toast({ title: amt <= 0.001 ? "Dèt efase — Flex Card debloke." : "Dèt ajiste avèk siksè." });
      setSelected(null);
      load();
    } catch (e: any) {
      toast({ title: e.message ?? "Erè: pa kapab ajiste dèt la.", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const handleUnblock = async () => {
    if (!selected) return;
    setActing(true);
    try {
      await apiPost("/api/admin/flex-card/unblock", { userId: selected.userId });
      toast({ title: "Flex Card debloke — dèt efase." });
      setSelected(null);
      load();
    } catch (e: any) {
      toast({ title: e.message ?? "Erè: pa kapab debloke.", variant: "destructive" });
    } finally {
      setActing(false);
    }
  };

  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("fr-HT", { year: "numeric", month: "short", day: "numeric" }) : "—";
  const fmtDateTime = (d?: string | null) =>
    d ? new Date(d).toLocaleString("fr-HT", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const isOverdue = (deadline: string | null, status: string) =>
    status === "active" && deadline ? new Date(deadline).getTime() < Date.now() : false;

  return (
    <div className="space-y-4">
      {/* Header + summary + filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-violet-600" />
            Dèt Flex Card
          </h2>
          <p className="text-sm text-muted-foreground">
            {total} dosye · ${totalOutstanding.toFixed(2)} dèt aktif total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="h-9">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">🔒 Aktif (bloke)</SelectItem>
              <SelectItem value="cleared">✅ Efase</SelectItem>
              <SelectItem value="all">Tout</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {filterStatus === "active" ? "Pa gen okenn itilizatè ki gen dèt aktif." : "Pa gen okenn dosye."}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const overdue = isOverdue(row.deadline, row.status);
            const pct = row.originalAmountUsd > 0
              ? Math.min(100, Math.round((row.repaidUsd / row.originalAmountUsd) * 100))
              : 0;
            return (
              <div
                key={row.debtId}
                className="bg-card border border-border rounded-2xl p-4 cursor-pointer hover:border-violet-400/50 transition-all"
                onClick={() => openDetail(row)}
                data-testid={`flex-debt-row-${row.userId}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {row.userAvatar ? (
                      <img src={row.userAvatar} className="h-10 w-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{row.userName}</p>
                      <p className="text-xs text-muted-foreground truncate">{row.userEmail}</p>
                      <p className="text-[11px] font-mono text-muted-foreground">{row.referenceCode}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-lg text-violet-700 dark:text-violet-400">
                      ${row.outstandingUsd.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">sou ${row.originalAmountUsd.toFixed(2)}</p>
                    {row.status === "active" ? (
                      <Badge className="text-[10px] mt-1 bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 border-0">
                        <CreditCard className="h-3 w-3 mr-1" />Bloke
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] mt-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0">
                        <CheckCircle className="h-3 w-3 mr-1" />Efase
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Repayment progress */}
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-muted-foreground">Ranbouse ${row.repaidUsd.toFixed(2)}</span>
                    <span className="font-semibold text-violet-600">{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                  <span>{REASON_LABEL[row.reason] ?? row.reason}</span>
                  <span className={`flex items-center gap-1 ${overdue ? "text-red-600 font-semibold" : ""}`}>
                    {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                    {row.deadline ? `Limit ${fmtDate(row.deadline)}` : "Pa gen limit"}
                    {overdue && " · Anreta"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3 w-3" />
                    {row.lastRepaymentAt
                      ? `Dènye peman $${(row.lastRepaymentUsd ?? 0).toFixed(2)} · ${fmtDate(row.lastRepaymentAt)}`
                      : "Okenn peman"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail / manage dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => { if (!v) setSelected(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-violet-600" />
              {selected?.userName}
            </DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-5 text-sm">
              {/* Summary */}
              <div className="rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 p-3 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dèt aktyèl</span>
                  <span className="font-bold text-violet-700 dark:text-violet-400">${selected.outstandingUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Montan orijinal</span>
                  <span className="font-medium">${selected.originalAmountUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Referans</span>
                  <span className="font-mono">{selected.referenceCode}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Rezon</span>
                  <span>{REASON_LABEL[selected.reason] ?? selected.reason}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Dat limit</span>
                  <span className={isOverdue(selected.deadline, selected.status) ? "text-red-600 font-semibold" : ""}>
                    {fmtDate(selected.deadline)}{isOverdue(selected.deadline, selected.status) && " · Anreta"}
                  </span>
                </div>
                {selected.notes && (
                  <div className="text-xs pt-1 border-t border-violet-200 dark:border-violet-800">
                    <span className="text-muted-foreground">Nòt: </span>{selected.notes}
                  </div>
                )}
              </div>

              {/* Adjust / unblock actions — only for active debts */}
              {selected.status === "active" && (
                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Jere dèt</h4>
                  <div className="bg-muted/30 rounded-xl p-3 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Ajiste montan dèt (USD) — mete 0 pou efase
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={adjustValue}
                        onChange={(e) => setAdjustValue(e.target.value)}
                        data-testid="input-adjust-amount"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Nòt (opsyonèl)</label>
                      <Textarea
                        value={adjustNotes}
                        onChange={(e) => setAdjustNotes(e.target.value)}
                        rows={2}
                        placeholder="Rezon ajisteman an…"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        className="flex-1 bg-violet-600 hover:bg-violet-700 text-white"
                        onClick={handleAdjust}
                        disabled={acting}
                        data-testid="button-adjust-debt"
                      >
                        {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Pencil className="h-4 w-4 mr-1" />Ajiste</>}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 text-emerald-600 border-emerald-300 dark:border-emerald-700"
                        onClick={handleUnblock}
                        disabled={acting}
                        data-testid="button-unblock-debt"
                      >
                        <ShieldCheck className="h-4 w-4 mr-1" />Debloke
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Repayment history */}
              <div>
                <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Istwa Ranbousman</h4>
                {loadingDetail ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : repayments.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">Pa gen okenn ranbousman.</p>
                ) : (
                  <div className="space-y-2">
                    {repayments.map((rp) => (
                      <div key={rp.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                          <Wallet className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold">${rp.amountUsd.toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtDateTime(rp.createdAt)} · {rp.source}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          rete ${rp.outstandingAfterUsd.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Debt history (multiple events) */}
              {debts.length > 1 && (
                <div>
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground mb-2">Tout Dèt</h4>
                  <div className="space-y-2">
                    {debts.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 bg-muted/30 rounded-lg px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <p className="font-mono truncate">{d.referenceCode}</p>
                          <p className="text-[10px] text-muted-foreground">{fmtDate(d.blockedAt)} · {REASON_LABEL[d.reason] ?? d.reason}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold">${d.outstandingUsd.toFixed(2)} / ${d.originalAmountUsd.toFixed(2)}</p>
                          <Badge className={`text-[9px] border-0 ${d.status === "active"
                            ? "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"}`}>
                            {d.status === "active" ? "Aktif" : "Efase"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Fèmen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
