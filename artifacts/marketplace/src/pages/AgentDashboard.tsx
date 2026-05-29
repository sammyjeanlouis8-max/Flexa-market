import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck, Clock, CheckCircle2, XCircle, DollarSign,
  User, MapPin, Loader2, KeyRound, RefreshCw, LogOut,
  Wifi, WifiOff, ImageIcon, Send, ChevronDown, ChevronUp,
  CreditCard, Gift, Download, Copy, Package,
} from "lucide-react";

function getToken() {
  return localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
}

async function apiFetch(path: string, method = "GET", body?: unknown) {
  const token = getToken();
  const r = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Error");
  return data;
}

interface PendingRequest {
  id: number;
  amountUsd: number;
  method: string;
  agentLocation: string | null;
  status: string;
  createdAt: string;
  userName: string | null;
  userPhone: string | null;
}

interface AgentTransferRequest {
  id: number;
  amountUsd: number;
  method: string;
  status: string;
  screenshotUrl: string | null;
  userNote: string | null;
  createdAt: string;
  userName: string | null;
  userPhone: string | null;
  userId: number;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")  return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs"><Clock className="h-3 w-3 mr-1" />Annatant</Badge>;
  if (status === "approved") return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs"><ShieldCheck className="h-3 w-3 mr-1" />Apwouve</Badge>;
  if (status === "paid")     return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />Peye</Badge>;
  if (status === "rejected") return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs"><XCircle className="h-3 w-3 mr-1" />Rejte</Badge>;
  return <Badge className="text-xs">{status}</Badge>;
}

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "kounye a";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

export default function AgentDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { t } = useTranslation();

  const [otpInputs, setOtpInputs] = useState<Record<number, string>>({});
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [paidIds, setPaidIds] = useState<Set<number>>(new Set());

  const [confirmingTransferId, setConfirmingTransferId] = useState<number | null>(null);
  const [transferNotes, setTransferNotes] = useState<Record<number, string>>({});
  const [expandedScreenshot, setExpandedScreenshot] = useState<number | null>(null);
  const [doneTransferIds, setDoneTransferIds] = useState<Set<number>>(new Set());

  // Kart Digital state
  const [cardAmount, setCardAmount] = useState("5");
  const [cardQty, setCardQty] = useState("5");
  const [cardResult, setCardResult] = useState<{ codes: string[]; amountUsd: number; totalCost: number; batchId: string } | null>(null);
  const [showCardHistory, setShowCardHistory] = useState(false);

  const isAgent = (user as any)?.role === "agent" || user?.isAdmin || user?.isSuperAdmin;

  const { data: myAgentData, refetch: refetchAgent } = useQuery<any>({
    queryKey: ["/agents/my"],
    queryFn: () => apiFetch("/agents/my"),
    enabled: !!user && isAgent,
  });

  // Wallet balance for card purchase
  const { data: walletData } = useQuery<any>({
    queryKey: ["/wallet/balance"],
    queryFn: () => apiFetch("/wallet/balance"),
    enabled: !!user && isAgent,
  });

  // Agent card purchase mutation
  const purchaseCardMut = useMutation({
    mutationFn: ({ amountUsd, quantity }: { amountUsd: number; quantity: number }) =>
      apiFetch("/agents/cards/purchase", "POST", { amountUsd, quantity }),
    onSuccess: (data) => {
      setCardResult({ codes: data.codes, amountUsd: parseFloat(cardAmount), totalCost: data.totalCost, batchId: data.batchId });
      qc.invalidateQueries({ queryKey: ["/wallet/balance"] });
      qc.invalidateQueries({ queryKey: ["/agents/cards"] });
    },
    onError: (e: Error) => toast({ title: "Erè", description: e.message, variant: "destructive" }),
  });

  // Agent card history
  const { data: cardHistoryData, refetch: refetchCards } = useQuery<any>({
    queryKey: ["/agents/cards"],
    queryFn: () => apiFetch("/agents/cards"),
    enabled: !!user && isAgent && showCardHistory,
  });
  const myCards: any[] = cardHistoryData?.cards ?? [];

  function downloadAgentCSV(codes: string[], amountUsd: number, batchId: string) {
    const rows = codes.map(c => `${c},${amountUsd},${batchId}`);
    const csv = ["Code,Amount USD,Batch ID", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `FM-Kart-${batchId}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  const isOnline: boolean = !!(myAgentData?.application?.isOnline);

  const onlineMut = useMutation({
    mutationFn: (online: boolean) => apiFetch("/agents/set-online", "PATCH", { isOnline: online }),
    onSuccess: () => { refetchAgent(); toast({ title: t("agentDashboard.statusUpdated") }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const { data: pending = [], isLoading, refetch } = useQuery<PendingRequest[]>({
    queryKey: ["/cashout/agent/pending"],
    queryFn: () => apiFetch("/cashout/agent/pending"),
    enabled: !!user && isAgent,
    refetchInterval: 20000,
  });

  const { data: transferPending = [], isLoading: transferLoading, refetch: refetchTransfer } = useQuery<AgentTransferRequest[]>({
    queryKey: ["/cashout/agent-transfer/pending"],
    queryFn: () => apiFetch("/cashout/agent-transfer/pending"),
    enabled: !!user && isAgent,
    refetchInterval: 20000,
  });

  const verifyMut = useMutation({
    mutationFn: ({ requestId, otpCode }: { requestId: number; otpCode: string }) =>
      apiFetch("/cashout/agent/verify", "POST", { requestId, otpCode }),
    onSuccess: (_data, vars) => {
      setPaidIds(prev => new Set([...prev, vars.requestId]));
      setOtpInputs(prev => { const n = { ...prev }; delete n[vars.requestId]; return n; });
      toast({ title: `✅ ${t("agentDashboard.paymentConfirmed")}` });
      qc.invalidateQueries({ queryKey: ["/cashout/agent/pending"] });
      setVerifyingId(null);
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setVerifyingId(null);
    },
  });

  const completeMut = useMutation({
    mutationFn: ({ requestId, payoutMethodNote }: { requestId: number; payoutMethodNote?: string }) =>
      apiFetch(`/cashout/agent-transfer/${requestId}/complete`, "PATCH", { payoutMethodNote }),
    onSuccess: (_data, vars) => {
      setDoneTransferIds(prev => new Set([...prev, vars.requestId]));
      setConfirmingTransferId(null);
      toast({ title: `✅ ${t("agentDashboard.deliveryConfirmed")}` });
      qc.invalidateQueries({ queryKey: ["/cashout/agent-transfer/pending"] });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      setConfirmingTransferId(null);
    },
  });

  function handleVerify(id: number) {
    const code = otpInputs[id]?.trim();
    if (!code || code.length < 6) {
      toast({ title: "Antre kòd 6 karaktè a", variant: "destructive" });
      return;
    }
    setVerifyingId(id);
    verifyMut.mutate({ requestId: id, otpCode: code });
  }

  if (!user) {
    Promise.resolve().then(() => setLocation("/auth/login"));
    return null;
  }
  if (!isAgent) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          <XCircle className="h-12 w-12 text-red-500 mx-auto" />
          <p className="text-lg font-bold">{t("agentDashboard.accessDenied")}</p>
          <p className="text-sm text-muted-foreground">{t("agentDashboard.notAgent")}</p>
          <Button variant="outline" onClick={() => setLocation("/")}>{t("agentDashboard.goHome")}</Button>
        </div>
      </div>
    );
  }

  const activePending = pending.filter(r => r.status === "pending" || r.status === "approved");
  const activeTransfer = transferPending.filter(r => r.status === "pending" || r.status === "approved");

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="bg-gradient-to-br from-violet-900/80 via-purple-900/60 to-background border-b border-border">
        <div className="max-w-lg mx-auto px-4 pt-10 pb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-violet-600 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-violet-300 font-semibold uppercase tracking-widest">FLEXA MARKET</p>
                <h1 className="text-xl font-black">{t("agentDashboard.panelTitle")}</h1>
              </div>
            </div>
            <button
              onClick={() => { localStorage.removeItem("flexamarket_token"); setLocation("/auth/login"); }}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              <LogOut className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center">
                <User className="h-4 w-4 text-violet-300" />
              </div>
              <div>
                <p className="font-semibold text-sm">{user.name}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Badge className="ml-auto bg-violet-600/20 text-violet-300 border-violet-500/30 text-xs">
                <ShieldCheck className="h-3 w-3 mr-1" />{t("agentDashboard.agentBadge")}
              </Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">

        {/* ── Online / Offline Toggle ── */}
        <div className={`rounded-2xl border p-4 flex items-center justify-between gap-4 transition-all ${
          isOnline
            ? "border-green-500/40 bg-green-500/5"
            : "border-border bg-card"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              isOnline ? "bg-green-500/20" : "bg-muted/50"
            }`}>
              {isOnline
                ? <Wifi className="h-5 w-5 text-green-500" />
                : <WifiOff className="h-5 w-5 text-muted-foreground" />
              }
            </div>
            <div>
              <p className="font-bold text-sm">
                {isOnline ? t("agentDashboard.onlineStatus") : t("agentDashboard.offlineStatus")}
              </p>
              <p className="text-xs text-muted-foreground">
                {isOnline ? t("agentDashboard.onlineDesc") : t("agentDashboard.offlineDesc")}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant={isOnline ? "outline" : "default"}
            disabled={onlineMut.isPending}
            onClick={() => onlineMut.mutate(!isOnline)}
            className={`shrink-0 font-bold h-9 px-4 ${
              isOnline
                ? "border-green-500/40 text-green-600 hover:bg-green-500/10"
                : "bg-green-600 hover:bg-green-700 text-white border-0"
            }`}
          >
            {onlineMut.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : isOnline
                ? t("agentDashboard.setOffline")
                : t("agentDashboard.setOnline")
            }
          </Button>
        </div>

        {/* SECTION A — Agent Transfer (Screenshot-proof) requests */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base">{t("agentDashboard.transferSection")}</h2>
                {activeTransfer.length > 0 && (
                  <span className="text-[10px] font-black bg-green-500 text-white rounded-full px-2 py-0.5">
                    {activeTransfer.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("agentDashboard.transferSub")}</p>
            </div>
            <button
              onClick={() => refetchTransfer()}
              className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
            <p className="text-xs font-semibold text-green-400 mb-2">📋 Kòman sa travay:</p>
            <ol className="space-y-1 text-xs text-green-300/80">
              <li>1. Klient voye kòb nan nimewo FM ou a epi fè screenshot</li>
              <li>2. Ou wè screenshot prèv la isit la</li>
              <li>3. Verifye peman an rive, livye cash via metòd ou</li>
              <li>4. Klike "{t("agentDashboard.confirmDelivery")}" — sistèm fèmen demann lan</li>
            </ol>
          </div>

          {transferLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : activeTransfer.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-semibold text-sm">{t("agentDashboard.noTransfer")}</p>
              <p className="text-xs text-muted-foreground">{t("agentDashboard.noTransferSub")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activeTransfer.map(req => {
                const isDone = doneTransferIds.has(req.id);
                const isConfirming = confirmingTransferId === req.id;
                const note = transferNotes[req.id] ?? "";
                const netAmt = Math.round(req.amountUsd * 0.98 * 100) / 100;
                const screenshotExpanded = expandedScreenshot === req.id;

                return (
                  <div
                    key={req.id}
                    className={`rounded-2xl border p-4 space-y-3 transition-all ${
                      isDone
                        ? "border-green-500/40 bg-green-500/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xl font-black text-green-400">${netAmt.toFixed(2)}</span>
                          <span className="text-xs text-muted-foreground">nèt (kliyan resevwa)</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          #{req.id} · {timeAgo(req.createdAt)} · brut ${req.amountUsd.toFixed(2)}
                        </p>
                      </div>
                      <StatusBadge status={isDone ? "paid" : req.status} />
                    </div>

                    <div className="bg-muted/30 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{req.userName ?? "—"}</span>
                      </div>
                      {req.userPhone && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">📱 {req.userPhone}</span>
                        </div>
                      )}
                      {req.userNote && (
                        <div className="flex items-start gap-2 text-xs">
                          <span className="text-muted-foreground shrink-0">💬</span>
                          <span className="text-foreground">{req.userNote}</span>
                        </div>
                      )}
                    </div>

                    {req.screenshotUrl ? (
                      <div className="space-y-1.5">
                        <button
                          onClick={() => setExpandedScreenshot(screenshotExpanded ? null : req.id)}
                          className="flex items-center gap-2 text-xs font-semibold text-primary hover:underline"
                        >
                          <ImageIcon className="h-3.5 w-3.5" />
                          Screenshot prèv peman
                          {screenshotExpanded
                            ? <ChevronUp className="h-3 w-3" />
                            : <ChevronDown className="h-3 w-3" />}
                        </button>
                        {screenshotExpanded && (
                          <a href={req.screenshotUrl} target="_blank" rel="noopener noreferrer">
                            <img
                              src={req.screenshotUrl}
                              alt="Screenshot prèv"
                              className="w-full max-h-64 object-contain rounded-xl border border-border"
                            />
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-500 flex items-center gap-1">
                        <ImageIcon className="h-3.5 w-3.5" />Pa gen screenshot
                      </p>
                    )}

                    {isDone ? (
                      <div className="flex items-center gap-2 text-green-400 text-sm font-semibold justify-center py-1">
                        <CheckCircle2 className="h-5 w-5" />
                        {t("agentDashboard.deliveryConfirmed")}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="space-y-1.5">
                          <label className="text-xs font-semibold text-muted-foreground">Metòd ou te livye (opsyonèl)</label>
                          <Input
                            placeholder="ex: MonCash, Zelle, Cash nan men..."
                            value={note}
                            onChange={e => setTransferNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                            className="h-9 text-xs bg-muted/40"
                          />
                        </div>
                        <Button
                          className="w-full h-11 font-bold bg-green-600 hover:bg-green-700 text-white"
                          disabled={isConfirming && completeMut.isPending}
                          onClick={() => {
                            setConfirmingTransferId(req.id);
                            completeMut.mutate({ requestId: req.id, payoutMethodNote: note.trim() || undefined });
                          }}
                        >
                          {isConfirming && completeMut.isPending
                            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("agentDashboard.confirming")}</>
                            : <><Send className="h-4 w-4 mr-2" />{t("agentDashboard.confirmDelivery")}</>}
                        </Button>
                        <p className="text-xs text-muted-foreground text-center">
                          Klike sèlman apre ou fin livye cash nan men kliyan
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* SECTION B — Classic agent (OTP) requests */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base">{t("agentDashboard.classicSection")}</h2>
                {activePending.length > 0 && (
                  <span className="text-[10px] font-black bg-amber-500 text-white rounded-full px-2 py-0.5">
                    {activePending.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t("agentDashboard.classicSub")}</p>
            </div>
            <button
              onClick={() => refetch()}
              className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
            >
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4">
            <p className="text-xs font-semibold text-blue-400 mb-2">📋 Kòman sa travay:</p>
            <ol className="space-y-1 text-xs text-blue-300/80">
              <li>1. Klient montre ou kòd sekrè 6 karaktè a</li>
              <li>2. Antre kòd la anba epi klike "{t("agentDashboard.confirm")}"</li>
              <li>3. Peye klient lan montan ki endike a</li>
              <li>4. Sistèm lan anrejistre peman an otomatikman</li>
            </ol>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            </div>
          ) : activePending.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="font-semibold text-sm">{t("agentDashboard.noClassic")}</p>
              <p className="text-xs text-muted-foreground">{t("agentDashboard.noClassicSub")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activePending.map(req => {
                const justPaid = paidIds.has(req.id);
                return (
                  <div
                    key={req.id}
                    className={`rounded-2xl border p-5 space-y-4 transition-all ${
                      justPaid
                        ? "border-green-500/40 bg-green-500/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="h-4 w-4 text-green-400" />
                          <span className="text-xl font-black text-green-400">
                            ${req.amountUsd.toFixed(2)}
                          </span>
                          <span className="text-xs text-muted-foreground">USD</span>
                        </div>
                        <p className="text-xs text-muted-foreground">#{req.id} · {timeAgo(req.createdAt)}</p>
                      </div>
                      <StatusBadge status={justPaid ? "paid" : req.status} />
                    </div>

                    <div className="bg-muted/30 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium">{req.userName ?? "—"}</span>
                      </div>
                      {req.agentLocation && (
                        <div className="flex items-center gap-2 text-xs">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">{req.agentLocation}</span>
                        </div>
                      )}
                    </div>

                    {justPaid ? (
                      <div className="flex items-center gap-2 text-green-400 text-sm font-semibold justify-center py-2">
                        <CheckCircle2 className="h-5 w-5" />
                        {t("agentDashboard.paymentConfirmed")}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <KeyRound className="h-3.5 w-3.5" />
                          <span>{t("agentDashboard.enterClientCode")}</span>
                        </div>
                        <div className="flex gap-2">
                          <Input
                            placeholder="EX: A1B2C3"
                            value={otpInputs[req.id] ?? ""}
                            onChange={e => setOtpInputs(prev => ({
                              ...prev,
                              [req.id]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6),
                            }))}
                            className="font-mono text-lg text-center tracking-widest h-12 uppercase bg-muted/40"
                            maxLength={6}
                            autoCapitalize="characters"
                            data-testid={`input-otp-${req.id}`}
                          />
                          <Button
                            className="h-12 px-5 bg-violet-600 hover:bg-violet-700 font-bold shrink-0"
                            onClick={() => handleVerify(req.id)}
                            disabled={verifyingId === req.id || (otpInputs[req.id]?.length ?? 0) < 6}
                            data-testid={`button-verify-${req.id}`}
                          >
                            {verifyingId === req.id
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : t("agentDashboard.confirm")}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground text-center">
                          Kòd la 6 karaktè — chif ak lèt (pa ka itilize 2 fwa)
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── SECTION C — Kart Digital (Recharge Card Sales) ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-orange-400" />
              <h2 className="font-bold text-base">Kart Rechaj Digital</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Balans: <span className="font-black text-green-400">${(walletData?.balance ?? 0).toFixed(2)}</span>
              </span>
            </div>
          </div>

          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
            <p className="text-xs font-semibold text-orange-400 mb-2">🎁 Kòman sa travay:</p>
            <ol className="space-y-1 text-xs text-orange-300/80">
              <li>1. Chwazi valè kart ak kantite ou vle achte</li>
              <li>2. Kòb la dedwi nan wallet FM ou enstantane</li>
              <li>3. Ou jwenn kòd PIN yo — bay kliyan yo fizikman</li>
              <li>4. Kliyan yo itilize kòd la sou app pou rechaje wallet yo</li>
            </ol>
          </div>

          {/* Purchase form */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Valè pa kart</label>
                <select
                  className="w-full h-10 rounded-lg border border-input bg-background px-3 text-sm"
                  value={cardAmount}
                  onChange={e => { setCardAmount(e.target.value); setCardResult(null); }}
                >
                  {[1, 2, 5, 10, 25, 50, 100].map(v => (
                    <option key={v} value={v}>${v}.00</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Kantite (maks 50)</label>
                <Input
                  type="number" min={1} max={50}
                  value={cardQty}
                  onChange={e => { setCardQty(e.target.value); setCardResult(null); }}
                  className="h-10 text-sm"
                />
              </div>
            </div>

            {/* Cost preview */}
            {cardAmount && cardQty && (
              <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2">
                <span className="text-xs text-muted-foreground">{cardQty} × ${cardAmount} =</span>
                <span className="font-black text-orange-400">${(parseFloat(cardAmount) * parseInt(cardQty || "0", 10)).toFixed(2)}</span>
              </div>
            )}

            <Button
              className="w-full h-11 font-bold bg-orange-600 hover:bg-orange-700 text-white border-0"
              disabled={purchaseCardMut.isPending || !cardAmount || !cardQty}
              onClick={() => {
                const amt = parseFloat(cardAmount);
                const qty = parseInt(cardQty, 10);
                if (!amt || !qty || qty < 1) return;
                setCardResult(null);
                purchaseCardMut.mutate({ amountUsd: amt, quantity: qty });
              }}
            >
              {purchaseCardMut.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ap achte…</>
                : <><Gift className="h-4 w-4 mr-2" />Achte {cardQty} Kart a ${cardAmount}</>
              }
            </Button>
          </div>

          {/* Purchase result */}
          {cardResult && (
            <div className="rounded-2xl border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-orange-500" />
                  <p className="font-black text-orange-800 dark:text-orange-300">
                    {cardResult.codes.length} kòd aktif ✓ — ${cardResult.totalCost.toFixed(2)} dedwi
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => downloadAgentCSV(cardResult.codes, cardResult.amountUsd, cardResult.batchId)}>
                  <Download className="h-3.5 w-3.5 mr-1.5" />CSV
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-1 max-h-52 overflow-y-auto">
                {cardResult.codes.map((c, i) => (
                  <div key={c} className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-3 py-2 border border-orange-200 dark:border-orange-800">
                    <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                    <span className="font-mono text-sm font-black text-gray-900 dark:text-white flex-1 tracking-wider">{c}</span>
                    <span className="text-xs font-bold text-orange-500 shrink-0">${cardResult.amountUsd}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(c); toast({ title: "Kopye ✓" }); }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card history toggle */}
          <button
            className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-muted/50 transition-colors"
            onClick={() => { setShowCardHistory(h => !h); if (!showCardHistory) refetchCards(); }}
          >
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span>Istorik Kart Mwen</span>
            </div>
            {showCardHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showCardHistory && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                <span className="text-xs font-semibold text-muted-foreground">
                  {myCards.length} kòd total · {myCards.filter((c: any) => c.status === "active").length} aktif · {myCards.filter((c: any) => c.status === "redeemed").length} itilize
                </span>
                <button onClick={() => refetchCards()}><RefreshCw className="h-4 w-4 text-muted-foreground" /></button>
              </div>
              {myCards.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Okenn kòd ankò</div>
              ) : (
                <div className="divide-y divide-border max-h-72 overflow-y-auto">
                  {myCards.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="font-mono text-xs font-bold flex-1">{c.code}</span>
                      <span className="text-xs font-black text-orange-500">${c.amountUsd}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        c.status === "active"   ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        c.status === "redeemed" ? "bg-gray-100 text-gray-500 dark:bg-gray-800" :
                        "bg-red-100 text-red-600"
                      }`}>
                        {c.status === "active" ? "Aktif" : c.status === "redeemed" ? "Itilize" : c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
