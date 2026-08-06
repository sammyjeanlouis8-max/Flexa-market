import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Search, CreditCard, ShieldBan, ShieldCheck,
  Wallet, Loader2, ChevronLeft, ChevronRight, X,
} from "lucide-react";

interface UserRow {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  country: string | null;
  flexCardBlocked: boolean;
  flexCardDebtUsd: number;
  walletBalanceUsd: number;
}

const REASON_OPTIONS = [
  { value: "debt",               label: "💸 Dèt" },
  { value: "merchant_complaint", label: "🏪 Plent Machann" },
  { value: "chargeback",         label: "↩️ Chargeback" },
  { value: "fraud_investigation",label: "🔍 Envestigasyon Fwòd" },
  { value: "policy_violation",   label: "📋 Vyolasyon Règ" },
  { value: "manual_review",      label: "👀 Revizyon Manyèl" },
  { value: "other",              label: "➕ Lòt" },
];

export default function AdminFlexCardUsers() {
  const [, nav] = useLocation();
  const { token } = useAuth();
  const { toast } = useToast();

  const [users, setUsers]       = useState<UserRow[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [page, setPage]         = useState(1);
  const [q, setQ]               = useState("");
  const [blockedOnly, setBlockedOnly] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  // Inline block form
  const [blocking, setBlocking]         = useState<UserRow | null>(null);
  const [blockAmt, setBlockAmt]         = useState("");
  const [blockReason, setBlockReason]   = useState("debt");
  const [blockNotes, setBlockNotes]     = useState("");
  const [blockDeadline, setBlockDeadline] = useState("");
  const [saving, setSaving]             = useState(false);

  // Unblock confirm
  const [unblocking, setUnblocking] = useState<UserRow | null>(null);
  const [unblockSaving, setUnblockSaving] = useState(false);

  const LIMIT = 30;

  const load = useCallback(async (p = page, search = q, bo = blockedOnly) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p), limit: String(LIMIT),
        ...(search ? { q: search } : {}),
        ...(bo ? { blocked: "1" } : {}),
      });
      const res = await fetch(`/api/admin/flex-card/users?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const d = await res.json();
        setUsers(d.items ?? []);
        setTotal(d.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [token, page, q, blockedOnly]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = (v: string) => {
    setQ(v);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setPage(1); load(1, v, blockedOnly); }, 350);
  };

  const toggleBlocked = () => {
    const bo = !blockedOnly;
    setBlockedOnly(bo);
    setPage(1);
    load(1, q, bo);
  };

  const openBlock = (u: UserRow) => {
    setBlocking(u);
    setBlockAmt("");
    setBlockReason("debt");
    setBlockNotes("");
    setBlockDeadline("");
  };

  const submitBlock = async () => {
    if (!blocking) return;
    const amt = parseFloat(blockAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast({ title: "Antre yon montan ki valab.", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/flex-card/block", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: blocking.id, amountUsd: amt, reason: blockReason,
          notes: blockNotes || null, deadline: blockDeadline || null,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erè");
      toast({ title: `✅ Flex Card ${blocking.name} bloke — dèt $${amt.toFixed(2)}.` });
      setBlocking(null);
      load();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const submitUnblock = async () => {
    if (!unblocking) return;
    setUnblockSaving(true);
    try {
      const res = await fetch("/api/admin/flex-card/unblock", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: unblocking.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Erè");
      toast({ title: `✅ Flex Card ${unblocking.name} debloke.` });
      setUnblocking(null);
      load();
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally { setUnblockSaving(false); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => nav("/admin")} className="p-2 rounded-xl hover:bg-muted/60 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-black flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-violet-600" />
            Bloke Kat FM
          </h1>
          <p className="text-xs text-muted-foreground">{total} itilizatè</p>
        </div>
        <button
          onClick={toggleBlocked}
          className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
            blockedOnly
              ? "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-700 text-red-700 dark:text-red-400"
              : "bg-muted border-border text-muted-foreground"
          }`}
        >
          🔒 Bloke sèlman
        </button>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Chèche pa non, imèl, oswa telefòn…"
            className="pl-9 rounded-xl"
          />
        </div>

        {/* User list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Pa gen rezilta.
          </div>
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className={`rounded-2xl border bg-card p-3.5 transition-all ${
                u.flexCardBlocked
                  ? "border-red-300 dark:border-red-700/60 bg-red-50/40 dark:bg-red-950/10"
                  : "border-border"
              }`}>
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    {u.avatar ? (
                      <img src={u.avatar} alt={u.name} className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center text-white font-bold text-base">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {u.flexCardBlocked && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                        <ShieldBan className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{u.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <Wallet className="h-3 w-3" /> ${u.walletBalanceUsd.toFixed(2)}
                      </span>
                      {u.flexCardBlocked && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4">
                          Bloke · ${u.flexCardDebtUsd.toFixed(2)} dèt
                        </Badge>
                      )}
                      {u.country && (
                        <span className="text-[10px] text-muted-foreground uppercase">{u.country}</span>
                      )}
                    </div>
                  </div>

                  {/* Action button */}
                  {u.flexCardBlocked ? (
                    <button
                      onClick={() => setUnblocking(u)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" /> Debloke
                    </button>
                  ) : (
                    <button
                      onClick={() => openBlock(u)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all"
                    >
                      <ShieldBan className="h-3.5 w-3.5" /> Bloke Kat
                    </button>
                  )}
                </div>

                {/* Inline block form */}
                {blocking?.id === u.id && (
                  <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800/50 space-y-2.5">
                    <p className="text-xs font-black text-red-700 dark:text-red-400 flex items-center gap-1.5">
                      <ShieldBan className="h-3.5 w-3.5" /> Bloke Flex Card — {u.name}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Montan Dèt ($)</p>
                        <Input
                          type="number" min="0.01" step="0.01"
                          value={blockAmt} onChange={e => setBlockAmt(e.target.value)}
                          placeholder="0.00" className="h-8 text-sm rounded-lg"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Rezon</p>
                        <select
                          value={blockReason}
                          onChange={e => setBlockReason(e.target.value)}
                          className="w-full h-8 rounded-lg border border-input bg-background text-sm px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          {REASON_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Dat Limit (opsyonèl)</p>
                        <Input
                          type="date" value={blockDeadline}
                          onChange={e => setBlockDeadline(e.target.value)}
                          className="h-8 text-sm rounded-lg"
                        />
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground mb-1 font-semibold">Nòt (opsyonèl)</p>
                        <Input
                          value={blockNotes} onChange={e => setBlockNotes(e.target.value)}
                          placeholder="Eksplikasyon…" className="h-8 text-sm rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm" variant="destructive" onClick={submitBlock} disabled={saving}
                        className="flex-1 text-xs font-bold"
                      >
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldBan className="h-3.5 w-3.5 mr-1" />}
                        Konfime Blokaj
                      </Button>
                      <Button
                        size="sm" variant="outline" onClick={() => setBlocking(null)} disabled={saving}
                        className="text-xs"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Inline unblock confirm */}
                {unblocking?.id === u.id && (
                  <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800/50 space-y-2.5">
                    <p className="text-xs text-muted-foreground">
                      Èske ou vle debloke Flex Card <strong>{u.name}</strong> epi efase dèt $<strong>{u.flexCardDebtUsd.toFixed(2)}</strong> a?
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm" onClick={submitUnblock} disabled={unblockSaving}
                        className="flex-1 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        {unblockSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                        Wi, Debloke
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setUnblocking(null)} className="text-xs">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <Button
              variant="outline" size="sm" disabled={page <= 1}
              onClick={() => { const p = page - 1; setPage(p); load(p); }}
              className="text-xs"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Anvan
            </Button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline" size="sm" disabled={page >= totalPages}
              onClick={() => { const p = page + 1; setPage(p); load(p); }}
              className="text-xs"
            >
              Apre <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
