import React, { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import SupportAdminPanel from "@/components/SupportAdminPanel";
import AdminDeliveryPanel from "@/components/AdminDeliveryPanel";
import AdminOrdersPanel from "@/components/AdminOrdersPanel";
import AdminAuditPanel from "@/pages/AdminAuditPanel";
import AdminReferralPanel from "@/pages/AdminReferralPanel";
import AdminApplicationsPanel from "@/pages/AdminApplicationsPanel";
import AdminTranslationPanel from "@/pages/AdminTranslationPanel";
import AdminLoanPanel from "@/pages/AdminLoanPanel";
import AdminFlexCardPanel from "@/pages/AdminFlexCardPanel";
import AdminWalletMonitor from "@/components/AdminWalletMonitor";
import { useTranslation } from "react-i18next";
import { useLocation, Link } from "wouter";
import {
  Shield, Users, Package, Flag, DollarSign, Ban, Trash2, AlertTriangle,
  CheckCircle2, UserX, RotateCcw, Zap, Star, Crown, Activity,
  ChevronDown, ChevronUp, Edit3, X, Plus, LogOut, Eye, Globe, Lock, Unlock,
  Wifi, Monitor, Link2, ShieldAlert, ShieldCheck, LogIn, UserPlus, KeyRound, BadgeCheck, CreditCard, Copy,
  MessageSquare, Send, Briefcase, MapPin, Clock, Wallet, ArrowUpCircle, ArrowDownCircle, CheckCircle, XCircle, RefreshCw,
  Search, Check, Gift, Ticket, Timer, Download, Truck, ArrowRight, Bell, Landmark, ExternalLink, Loader2, Banknote, Phone, Navigation,
  TrendingUp, BarChart3, Receipt, ArrowLeft, Trophy, Tv, Music2, ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAdminGetStats, useAdminGetUsers, useAdminGetListings, useAdminGetReports, useAdminBanUser, useAdminRemoveListing, getAdminGetUsersQueryKey, getAdminGetListingsQueryKey, getAdminGetReportsQueryKey, getAdminGetStatsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// ─── API Helpers ───────────────────────────────────────────────────────────────

async function adminFetch(path: string, method = "POST", body?: object) {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(path, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Request failed");
  }
  return res.json();
}

// ─── Sub-components ───────────────────────────────────────────────────────────

// ─── Broadcast Email Panel ─────────────────────────────────────────────────────
function BroadcastEmailPanel() {
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const token = () => localStorage.getItem("flexamarket_token");

  const [subject, setSubject] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState<"idle" | "test" | "broadcast">("idle");
  const [result, setResult] = useState<{ mode: string; sent: number; total?: number } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const send = async (mode: "test" | "broadcast") => {
    if (!subject.trim() || !htmlBody.trim()) {
      toast({ title: "Ranpli tit ak kò mesaj la", variant: "destructive" });
      return;
    }
    if (mode === "test" && !testEmail.trim()) {
      toast({ title: "Mete yon email pou tès", variant: "destructive" });
      return;
    }
    setSending(mode);
    setResult(null);
    try {
      const body: any = { subject, htmlBody };
      if (mode === "test") body.testEmail = testEmail.trim();
      const r = await fetch(`${BASE}/api/admin/broadcast-email`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Erè");
      setResult(d);
      toast({ title: mode === "test" ? "✅ Tès voye!" : `✅ ${d.sent} / ${d.total} email voye!` });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setSending("idle");
      setConfirmOpen(false);
    }
  };

  const QUICK_VARS = [
    { label: "Bold", tag: (t: string) => `<strong>${t}</strong>` },
    { label: "Koulè wouj", tag: (t: string) => `<span style="color:#e53e3e">${t}</span>` },
    { label: "Lyen", tag: () => `<a href="https://flexamarket.com" style="color:#3182ce">Klike la</a>` },
    { label: "Separatè", tag: () => `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">` },
  ];

  const insertAt = (text: string) => {
    const ta = document.getElementById("broadcast-body") as HTMLTextAreaElement | null;
    if (!ta) { setHtmlBody(prev => prev + text); return; }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = htmlBody.slice(start, end);
    const insert = text.includes("{{}}") ? text.replace("{{}}", selected) : text;
    setHtmlBody(htmlBody.slice(0, start) + insert + htmlBody.slice(end));
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-2">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
          <Send className="h-5 w-5 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h2 className="font-bold text-foreground text-lg">Broadcast Email</h2>
          <p className="text-xs text-muted-foreground">Voye yon mesaj pa email tout itilizatè ki gen adrès email sou Flexa Market.</p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
        <span>Fè yon tès an premye anvan voye a tout moun. Email yo pa ka retire apre yo voye.</span>
      </div>

      {/* Subject */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Tit / Sijè</Label>
        <Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Egz: Nouvo fonksyon sou Flexa Market 🎉"
          className="h-10"
        />
      </div>

      {/* HTML body */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Kò Mesaj (HTML)</Label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {QUICK_VARS.map(v => (
            <button
              key={v.label}
              onClick={() => insertAt(v.tag("{{}}").includes("{{}}") ? v.tag("") : v.tag(""))}
              className="text-[10px] font-medium bg-muted hover:bg-muted/80 border border-border rounded-md px-2 py-1 transition-colors"
            >
              {v.label}
            </button>
          ))}
        </div>
        <Textarea
          id="broadcast-body"
          value={htmlBody}
          onChange={e => setHtmlBody(e.target.value)}
          placeholder={`<p>Bonjou <strong>{{name}}</strong>,</p>\n<p>Nou gen yon bèl nouvèl pou ou...</p>`}
          className="font-mono text-xs min-h-[200px] resize-y"
        />
        <p className="text-[10px] text-muted-foreground">HTML valab. Itilize &lt;p&gt;, &lt;strong&gt;, &lt;a href="..."&gt;, &lt;ul&gt;&lt;li&gt;.</p>
      </div>

      {/* Live preview */}
      {htmlBody.trim() && (
        <div className="space-y-1.5">
          <Label className="text-sm font-semibold">Aperçu</Label>
          <div
            className="border border-border rounded-xl p-4 bg-white dark:bg-zinc-900 text-sm prose prose-sm dark:prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: htmlBody }}
          />
        </div>
      )}

      {/* Test email */}
      <div className="space-y-1.5">
        <Label className="text-sm font-semibold">Email Tès (opsyonèl)</Label>
        <div className="flex gap-2">
          <Input
            value={testEmail}
            onChange={e => setTestEmail(e.target.value)}
            placeholder="admin@example.com"
            type="email"
            className="h-9"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-4 shrink-0"
            onClick={() => send("test")}
            disabled={sending !== "idle"}
          >
            {sending === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Voye Tès
          </Button>
        </div>
      </div>

      {/* Send to all */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <p className="text-xs text-muted-foreground">Voye a <strong>tout itilizatè</strong> ki gen email valab sou platfòm nan.</p>
        <Button
          className="bg-rose-600 hover:bg-rose-700 text-white h-9 px-5"
          onClick={() => setConfirmOpen(true)}
          disabled={sending !== "idle" || !subject.trim() || !htmlBody.trim()}
        >
          {sending === "broadcast" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
          Voye a Tout Moun
        </Button>
      </div>

      {/* Result */}
      {result && (
        <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3 text-sm text-green-700 dark:text-green-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {result.mode === "test"
            ? `Tès voye ✓`
            : `${result.sent} email voye sou ${result.total} itilizatè.`
          }
        </div>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" /> Konfime Broadcast
            </DialogTitle>
          </DialogHeader>
          <div className="text-sm text-muted-foreground space-y-2 py-2">
            <p>Ou pral voye email sa a <strong className="text-foreground">tout itilizatè</strong> ki gen adrès email valab sou Flexa Market.</p>
            <p className="font-medium text-foreground">Sijè: <span className="text-muted-foreground font-normal">{subject}</span></p>
            <p className="text-amber-600 dark:text-amber-400 text-xs font-medium">⚠️ Aksyon sa pa ka ranvèse. Asire ou tès la reyisi an premye.</p>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Anile</Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => send("broadcast")}
              disabled={sending !== "idle"}
            >
              {sending === "broadcast" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Wi, voye a tout moun
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value, color, bg, alert = false, onClick,
}: {
  icon: any; label: string; value: number | string; color: string; bg: string; alert?: boolean; onClick?: () => void;
}) {
  const isAlert = alert && Number(value) > 0;
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? e => e.key === "Enter" && onClick() : undefined}
      className={`relative overflow-hidden rounded-2xl border p-4 transition-all select-none
        ${isAlert ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20" : `${bg} border-border/60`}
        ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]" : ""}
      `}
    >
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${color} mb-3 shadow-sm`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className={`text-2xl font-black leading-none ${isAlert ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground mt-1 font-medium">{label}</p>
      {isAlert && (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
      )}
    </div>
  );
}

function RoleBadge({ user }: { user: any }) {
  if (user.isSuperAdmin) return <Badge className="text-[10px] bg-purple-600 hover:bg-purple-600 gap-0.5"><Crown className="h-2.5 w-2.5" /> Super Admin</Badge>;
  if (user.isAdmin) return <Badge className="text-[10px] gap-0.5"><Shield className="h-2.5 w-2.5" /> Admin</Badge>;
  return null;
}

function RiskBadge({ user }: { user: any }) {
  if (user.isTrusted) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"><ShieldAlert className="h-2.5 w-2.5" /> Trusted</span>;
  if (user.isBanned) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">● HIGH</span>;
  if (user.isFlagged) return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">● MED</span>;
  return <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">● LOW</span>;
}

function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; color: string; icon?: ReactNode }> = {
    ban_user: { label: "Banned user", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    unban_user: { label: "Unbanned user", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
    restrict_user: { label: "Restricted user", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    unrestrict_user: { label: "Lifted restriction", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    delete_user: { label: "Deleted user", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    unflag_user: { label: "Cleared flag", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    add_admin: { label: "Added admin", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
    set_role: { label: "Changed role", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
    boost_listing: { label: "Boosted listing", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    remove_boost: { label: "Removed boost", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
    extend_boost: { label: "Extended boost", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    remove_listing: { label: "Removed listing", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    edit_listing: { label: "Edited listing", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
    feature_listing: { label: "Featured listing", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
    unfeature_listing: { label: "Unfeatured listing", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400" },
    reset_nudge_cooldown: { label: "Reset cooldown", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", icon: <RotateCcw className="h-2.5 w-2.5" /> },
    notify_legacy_password_users: { label: "Sent nudge blast", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", icon: <Send className="h-2.5 w-2.5" /> },
    notify_legacy_password_users_blocked: { label: "Blast blocked", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: <Ban className="h-2.5 w-2.5" /> },
  };
  const info = map[action] ?? { label: action, color: "bg-secondary text-secondary-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${info.color}`}>
      {info.icon}{info.label}
    </span>
  );
}

// ─── Audit log action category sets (shared between badge counts and filtering) ─

const LOG_COOLDOWN_ACTIONS = new Set(["reset_nudge_cooldown", "notify_legacy_password_users", "notify_legacy_password_users_blocked"]);
const LOG_USER_ACTIONS = new Set(["ban_user", "unban_user", "delete_user", "unflag_user", "add_admin", "set_role", "verify_user", "trust_user", "restrict_user", "unrestrict_user"]);
const LOG_LISTING_ACTIONS = new Set(["boost_listing", "remove_boost", "extend_boost", "remove_listing", "edit_listing", "feature_listing", "unfeature_listing"]);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Admin() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = (user as any)?.isSuperAdmin;
  const [me, setMe] = useState<{
    role: string;
    permissions: Record<string, boolean>;
    scopeLevel?: string;
    scopeCountry?: string | null;
    scopeCountries?: string[] | null;
    scopeDepartment?: string | null;
    scopeCity?: string | null;
  } | null>(null);
  const can = (perm: string) => !!me?.permissions?.[perm];
  // Wallet admin state
  const [walletRecharges, setWalletRecharges] = useState<any[]>([]);
  const [walletBalances, setWalletBalances] = useState<any[]>([]);
  const [walletSettings, setWalletSettings] = useState<{ rateHtgToUsd: number; bonusPct: number; moncashPlatformNumber: string }>({ rateHtgToUsd: 130, bonusPct: 0, moncashPlatformNumber: "" });
  const [walletRateInput, setWalletRateInput] = useState("130");
  const [walletBonusInput, setWalletBonusInput] = useState("0");
  const [walletMoncashNumber, setWalletMoncashNumber] = useState("");
  const [walletSettingsSaving, setWalletSettingsSaving] = useState(false);
  const [walletConfirmingId, setWalletConfirmingId] = useState<number | null>(null);
  // Admin transaction history (scoped by country)
  const [adminTxData, setAdminTxData] = useState<{ transactions: any[]; totalIn: number; totalOut: number; count: number; scopeCountry: string | null } | null>(null);
  const [adminTxFilter, setAdminTxFilter] = useState<"all" | "in" | "out">("all");
  const [adminTxSearch, setAdminTxSearch] = useState("");
  const [adminTxLoading, setAdminTxLoading] = useState(false);
  const [walletDetailUserId, setWalletDetailUserId] = useState<number | null>(null);
  const [walletDetailData, setWalletDetailData] = useState<any>(null);
  const [walletDetailLoading, setWalletDetailLoading] = useState(false);
  const [walletQuickSearch, setWalletQuickSearch] = useState("");
  const [showUsersSheet, setShowUsersSheet] = useState(false);
  const [usersSheetSearch, setUsersSheetSearch] = useState("");
  // Admin credit
  const [walletCreditUserId, setWalletCreditUserId] = useState("");
  const [walletCreditAmount, setWalletCreditAmount] = useState("");
  const [walletCreditNote, setWalletCreditNote] = useState("");
  const [walletCreditSaving, setWalletCreditSaving] = useState(false);
  // Recharge Cards (Kart Rechaj)
  const [rechargeCards, setRechargeCards] = useState<any[]>([]);
  const [rcCardsLoading, setRcCardsLoading] = useState(false);
  const [rcGenAmount, setRcGenAmount] = useState("10");
  const [rcGenQty, setRcGenQty] = useState("10");
  const [rcGenExpiry, setRcGenExpiry] = useState("");
  const [rcGenLoading, setRcGenLoading] = useState(false);
  const [rcGenResult, setRcGenResult] = useState<{ batchId: string; codes: string[] } | null>(null);
  // BNPL Admin
  const [bnplAdminSettings, setBnplAdminSettings] = useState<{ klarnaEnabled: boolean; affirmEnabled: boolean; afterpayEnabled: boolean; minAmountUsd: number; maxAmountUsd: number; platformFeePercent: number } | null>(null);
  const [bnplAdminLoading, setBnplAdminLoading] = useState(false);
  const [bnplAdminSaving, setBnplAdminSaving] = useState(false);
  const [bnplAdminAnalytics, setBnplAdminAnalytics] = useState<{ totalSessions: number; completedSessions: number; totalRevenue: number; byProvider: Record<string, number> } | null>(null);

  // ── Chargebacks admin state ──────────────────────────────────────────────
  const [chargebacks, setChargebacks] = useState<any[]>([]);
  const [chargebacksLoading, setChargebacksLoading] = useState(false);
  const [chargebackResolving, setChargebackResolving] = useState<number | null>(null);

  // ── Order Returns admin state ────────────────────────────────────────────
  const [returnsList, setReturnsList] = useState<any[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [returnsFilter, setReturnsFilter] = useState("all");
  const [returnsActioning, setReturnsActioning] = useState<number | null>(null);
  const [returnsDecideId, setReturnsDecideId] = useState<number | null>(null);
  const [returnsDecision, setReturnsDecision] = useState<"approve" | "reject">("approve");
  const [returnsNote, setReturnsNote] = useState("");

  const _initParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const _rawPaymentsFilter = _initParams.get("paymentsFilter");

  const [payments, setPayments] = useState<any[]>([]);
  const [paymentsFilter, setPaymentsFilter] = useState<"all" | "suspicious" | "pending" | "failed" | "refunded">(
    _rawPaymentsFilter === "suspicious" || _rawPaymentsFilter === "pending" || _rawPaymentsFilter === "failed" || _rawPaymentsFilter === "refunded" ? _rawPaymentsFilter : "all"
  );
  const [stripeTransactions, setStripeTransactions] = useState<any[]>([]);
  const [stripeVendors, setStripeVendors] = useState<any[]>([]);
  const [stripeCommission, setStripeCommission] = useState<number>(8);
  const [stripeCommissionInput, setStripeCommissionInput] = useState<string>("8");
  const [stripeLoading, setStripeLoading] = useState(false);
  const [resetPwResult, setResetPwResult] = useState<{ name: string; tempPassword: string } | null>(null);
  const [refundTarget, setRefundTarget] = useState<any | null>(null);
  const [refundReason, setRefundReason] = useState("");

  // Restriction dialog
  const [restrictTarget, setRestrictTarget] = useState<{ id: number; name: string } | null>(null);
  const [restrictReason, setRestrictReason] = useState("spam");
  const [restrictDuration, setRestrictDuration] = useState("7");
  const [restrictNotes, setRestrictNotes] = useState("");

  // Modals
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string; type: "user" | "listing" } | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [editListing, setEditListing] = useState<any | null>(null);
  const [boostModal, setBoostModal] = useState<{ id: number; title: string; isBoosted: boolean; boostExpiresAt?: string | null } | null>(null);
  const [boostDays, setBoostDays] = useState("7");
  const [editForm, setEditForm] = useState({ title: "", description: "", price: "", condition: "", status: "" });
  const [addAdminEmail, setAddAdminEmail] = useState("");
  const [addAdminRole, setAddAdminRole] = useState("admin");
  const [addAdminScopeCountry, setAddAdminScopeCountry] = useState("");
  const [addAdminScopeCountries, setAddAdminScopeCountries] = useState<string[]>([]);
  const [addAdminScopeDepartment, setAddAdminScopeDepartment] = useState("");
  const [addAdminScopeCity, setAddAdminScopeCity] = useState("");
  const [scopeOptions, setScopeOptions] = useState<Array<{ country: string; departments: string[]; citiesByDept: Record<string, string[]> }>>([]);
  const [setScopeForAdmin, setSetScopeForAdmin] = useState<{ id: number; name: string; scopeCountry: string | null; scopeCountries: string[] | null; scopeDepartment: string | null; scopeCity: string | null } | null>(null);
  const [setScopeCountry, setSetScopeCountry] = useState("");
  const [setScopeCountries, setSetScopeCountries] = useState<string[]>([]);
  const [setScopeDepartment, setSetScopeDepartment] = useState("");
  const [setScopeCity, setSetScopeCity] = useState("");
  const [adminPickerSearch, setAdminPickerSearch] = useState("");
  const [adminPickerUserId, setAdminPickerUserId] = useState<number | null>(null);
  const [addAdminScopeType, setAddAdminScopeType] = useState<"global" | "multi-country" | "country" | "department" | "city">("global");
  const [pickerLoanStatus, setPickerLoanStatus] = useState<{ blocked: boolean; status: string | null; amountOwed: number } | null>(null);
  const [pickerLoanLoading, setPickerLoanLoading] = useState(false);
  const [adminAuditId, setAdminAuditId] = useState<number | null>(null);
  const [adminAuditData, setAdminAuditData] = useState<any | null>(null);
  const [adminAuditLoading, setAdminAuditLoading] = useState(false);
  const [adminAuditTab, setAdminAuditTab] = useState<"actions" | "messages">("actions");
  const [activityUser, setActivityUser] = useState<any | null>(null);
  const [activityData, setActivityData] = useState<any | null>(null);
  const [securityUser, setSecurityUser] = useState<any | null>(null);
  const [securityData, setSecurityData] = useState<any | null>(null);
  const [editPhoneOpen, setEditPhoneOpen] = useState(false);
  const [editPhoneValue, setEditPhoneValue] = useState("");
  const [editPhoneLoading, setEditPhoneLoading] = useState(false);
  const [viewAnalytics, setViewAnalytics] = useState<{
    topListings: any[];
    byCountry: any[];
    byHour: any[];
    suspiciousIps: any[];
  } | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const _rawLogsFilter = _initParams.get("filter");
  const _rawDateRange = _initParams.get("dateRange");
  const [logsFilter, setLogsFilter] = useState<"all" | "cooldown" | "user" | "listing">(
    _rawLogsFilter === "cooldown" || _rawLogsFilter === "user" || _rawLogsFilter === "listing" ? _rawLogsFilter : "all"
  );
  const [logsDateRange, setLogsDateRange] = useState<"all" | "7d" | "30d" | "90d" | "custom">(
    _rawDateRange === "7d" || _rawDateRange === "30d" || _rawDateRange === "90d" || _rawDateRange === "custom" ? _rawDateRange : "all"
  );
  const [logsDateFrom, setLogsDateFrom] = useState(_initParams.get("dateFrom") || "");
  const [logsDateTo, setLogsDateTo] = useState(_initParams.get("dateTo") || "");

  // Tab state is URL-driven so deep links like /admin?tab=support&thread=42
  // (used by support push notifications) land users in the right place.
  // We default to "users" here (a safe value that is always available) and
  // let an effect promote to "flagged" later once the user list has loaded —
  // referencing `flaggedUsers` directly here would be a TDZ access since it
  // is derived from `users` further down in this component.
  const initialQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialTab = initialQuery.get("tab") || "users";
  const initialDeepThread = initialQuery.get("thread");
  const [adminTab, setAdminTabState] = useState<string>(initialTab);
  const [tabExplicitlySet, setTabExplicitlySet] = useState<boolean>(initialQuery.has("tab"));
  const setAdminTab = (next: string) => {
    setAdminTabState(next);
    setTabExplicitlySet(true);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      if (next !== "support") url.searchParams.delete("thread");
      window.history.replaceState({}, "", url.toString());
    }
  };
  const goToTab = (next: string, extra?: () => void) => {
    extra?.();
    setAdminTab(next);
    setTimeout(() => tabsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (logsFilter !== "all") url.searchParams.set("filter", logsFilter); else url.searchParams.delete("filter");
    if (logsDateRange !== "all") url.searchParams.set("dateRange", logsDateRange); else url.searchParams.delete("dateRange");
    if (logsDateFrom) url.searchParams.set("dateFrom", logsDateFrom); else url.searchParams.delete("dateFrom");
    if (logsDateTo) url.searchParams.set("dateTo", logsDateTo); else url.searchParams.delete("dateTo");
    window.history.replaceState({}, "", url.toString());
  }, [logsFilter, logsDateRange, logsDateFrom, logsDateTo]);

  // Jobs admin state
  const [adminJobs, setAdminJobs] = useState<any[]>([]);
  const [jobsFilter, setJobsFilter] = useState<"all" | "draft" | "open" | "claimed" | "cancelled">("all");
  const [jobsSearch, setJobsSearch] = useState("");
  const [editJob, setEditJob] = useState<any | null>(null);
  const [editJobForm, setEditJobForm] = useState({ title: "", description: "", budget: "", location: "", status: "" });
  const [jobActioning, setJobActioning] = useState<number | null>(null);

  const [supportThreads, setSupportThreads] = useState<any[]>([]);
  const [supportActiveId, setSupportActiveId] = useState<number | null>(null);
  const [supportDetail, setSupportDetail] = useState<any | null>(null);
  const [supportReply, setSupportReply] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const _rawSupportFilter = _initParams.get("supportFilter");
  const [supportFilter, setSupportFilter] = useState<"open" | "closed" | "all">(
    _rawSupportFilter === "open" || _rawSupportFilter === "closed" || _rawSupportFilter === "all" ? _rawSupportFilter : "open"
  );
  const [supportUnread, setSupportUnread] = useState(0);

  // ── Admin-to-admin chat state ────────────────────────────────────────────
  const [adminChatAdmins, setAdminChatAdmins] = useState<any[]>([]);
  const [adminChatActiveId, setAdminChatActiveId] = useState<number | null>(null);
  const [adminChatDetail, setAdminChatDetail] = useState<{ other: any; messages: any[] } | null>(null);
  const [adminChatMessage, setAdminChatMessage] = useState("");
  const [adminChatSending, setAdminChatSending] = useState(false);
  const [adminChatUnread, setAdminChatUnread] = useState(0);
  const adminChatBottomRef = useRef<HTMLDivElement>(null);
  const tabsSectionRef = useRef<HTMLDivElement>(null);
  const _rawUserCountry = _initParams.get("userCountry");
  const [userCountryFilter, setUserCountryFilter] = useState(
    _rawUserCountry && SUPPORTED_COUNTRIES.includes(_rawUserCountry) ? _rawUserCountry : "all"
  );
  const [userSearch, setUserSearch] = useState("");
  const [listingCountryFilter, setListingCountryFilter] = useState("all");
  const [usersPage, setUsersPage] = useState(0);
  const [listingsPage, setListingsPage] = useState(0);
  const ADMIN_PAGE_SIZE = 50;

  // ── Multi-country admin view switcher (super admin only) ──────────────────
  // Persisted in localStorage so the preference survives page refreshes.
  const [adminViewCountry, setAdminViewCountry] = useState<"all" | "HT" | "DO">(() => {
    if (typeof window === "undefined") return "all";
    const stored = localStorage.getItem("admin_view_country");
    return (stored === "HT" || stored === "DO") ? stored : "all";
  });

  // Apply the global admin view country filter to all sub-filters at once.
  const applyAdminViewCountry = (c: "all" | "HT" | "DO") => {
    setAdminViewCountry(c);
    if (typeof window !== "undefined") localStorage.setItem("admin_view_country", c);
    const v = c === "all" ? "all" : c;
    setUserCountryFilter(v);
    setListingCountryFilter(v);
    setBoostCountryFilter(v);
  };

  // Scope lock: when me loads, non-superAdmin with a scopeCountry (or scopeCountries) gets their
  // filters auto-locked to that country/countries so they never see data outside their zone.
  const scopeLock: string | null = isSuperAdmin ? null : (me?.scopeCountry ?? (me?.scopeCountries?.[0] ?? null));
  // All countries available to this admin in country-switcher
  const scopeCountriesLock: string[] | null = isSuperAdmin ? null : (me?.scopeCountries ?? (me?.scopeCountry ? [me.scopeCountry] : null));
  const _rawRiskFilter = _initParams.get("riskFilter");
  const [riskFilter, setRiskFilter] = useState(
    _rawRiskFilter === "high" || _rawRiskFilter === "medium" || _rawRiskFilter === "low" || _rawRiskFilter === "trusted" || _rawRiskFilter === "flagged" ? _rawRiskFilter : "all"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (paymentsFilter !== "all") url.searchParams.set("paymentsFilter", paymentsFilter); else url.searchParams.delete("paymentsFilter");
    if (supportFilter !== "open") url.searchParams.set("supportFilter", supportFilter); else url.searchParams.delete("supportFilter");
    if (userCountryFilter !== "all") url.searchParams.set("userCountry", userCountryFilter); else url.searchParams.delete("userCountry");
    if (riskFilter !== "all") url.searchParams.set("riskFilter", riskFilter); else url.searchParams.delete("riskFilter");
    window.history.replaceState({}, "", url.toString());
  }, [paymentsFilter, supportFilter, userCountryFilter, riskFilter]);

  const [boostRecords, setBoostRecords] = useState<any[]>([]);
  const [moderationQueue, setModerationQueue] = useState<any[]>([]);
  const [pwHashStats, setPwHashStats] = useState<{ sha256: number; bcrypt: number; total: number; eligibleForNudge: number; lastNudgeSentAt: string | null; nudgeCooldownEndsAt: string | null; nudgeCooldownHours: number; lastCooldownResetBy: string | null; lastCooldownResetAt: string | null } | null>(null);
  const [refreshingPwStats, setRefreshingPwStats] = useState(false);
  const [sendingNudge, setSendingNudge] = useState(false);
  const [resettingCooldown, setResettingCooldown] = useState(false);
  const [cooldownHours, setCooldownHours] = useState<number>(24);
  const [savingCooldown, setSavingCooldown] = useState(false);
  const cooldownHoursDirty = useRef(false);
  const [moderationFilter, setModerationFilter] = useState<"pending" | "rejected" | "approved" | "all">("pending");
  const [boostPayFilter, setBoostPayFilter] = useState("all");
  const [boostStatusFilter, setBoostStatusFilter] = useState("all");
  const [boostCountryFilter, setBoostCountryFilter] = useState("all");

  // ── Cashout admin state ──────────────────────────────────────────────────
  const [cashoutRequests, setCashoutRequests] = useState<any[]>([]);
  const [cashoutLoading, setCashoutLoading] = useState(false);
  const [cashoutFilter, setCashoutFilter] = useState<"all" | "pending" | "approved" | "paid" | "rejected">("all");
  const [cashoutNote, setCashoutNote] = useState<Record<number, string>>({});
  const [cashoutActioning, setCashoutActioning] = useState<number | null>(null);

  // ── Seller MonCash Payouts admin state ──────────────────────────────────
  const [sellerPayouts, setSellerPayouts] = useState<any[]>([]);
  const [sellerPayoutsLoading, setSellerPayoutsLoading] = useState(false);
  const [sellerPayoutsFilter, setSellerPayoutsFilter] = useState<"all" | "pending" | "paid">("pending");
  const [sellerPayoutNote, setSellerPayoutNote] = useState<Record<number, string>>({});
  const [sellerPayoutActioning, setSellerPayoutActioning] = useState<number | null>(null);
  const [sellerPayoutAccounts, setSellerPayoutAccounts] = useState<any[]>([]);
  const [sellerAccountsLoading, setSellerAccountsLoading] = useState(false);

  // ── Promo codes & campaign ──────────────────────────────────────────────────
  const [promoCodes, setPromoCodes] = useState<any[]>([]);
  const [promoCodesLoading, setPromoCodesLoading] = useState(false);
  const [promoCodeSaving, setPromoCodeSaving] = useState(false);
  const [campaignSettings, setCampaignSettings] = useState<any | null>(null);
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [newCode, setNewCode] = useState({ code: "", discountType: "percent", discountValue: "", minOrderValue: "", maxUses: "", maxUsesPerUser: "1", expiresAt: "", description: "" });
  const [campaignDraft, setCampaignDraft] = useState<any | null>(null);

  // ── Admin Subscriptions ──────────────────────────────────────────────────
  const [adminSubs, setAdminSubs] = useState<any[]>([]);
  const [adminSubsLoading, setAdminSubsLoading] = useState(false);
  const [grantForm, setGrantForm] = useState({ userId: "", plan: "standard", months: "1" });
  const [grantSaving, setGrantSaving] = useState(false);
  const [adminSubsSearch, setAdminSubsSearch] = useState("");
  const [adminSubsFilter, setAdminSubsFilter] = useState<"all" | "active" | "grace" | "vip">("all");

  const [sellerAccountActioning, setSellerAccountActioning] = useState<number | null>(null);
  const [sellerAccountRejectId, setSellerAccountRejectId] = useState<number | null>(null);
  const [sellerAccountRejectReason, setSellerAccountRejectReason] = useState("");

  // ── Agents admin state ──────────────────────────────────────────────────
  const [agentsList, setAgentsList] = useState<any[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentSearch, setAgentSearch] = useState("");
  const [agentPickerUserId, setAgentPickerUserId] = useState<number | null>(null);
  const [agentTogglingId, setAgentTogglingId] = useState<number | null>(null);

  // ── Driver Applications (Demands Chofe) state ────────────────────────────
  const [driverApps, setDriverApps] = useState<any[]>([]);
  const [driverAppsLoading, setDriverAppsLoading] = useState(false);
  const [driverAppsFilter, setDriverAppsFilter] = useState<"all" | "pending" | "approved" | "rejected" | "suspended">("pending");
  const [driverAppExpanded, setDriverAppExpanded] = useState<number | null>(null);
  const [driverAppActioning, setDriverAppActioning] = useState<number | null>(null);
  const [driverAppNote, setDriverAppNote] = useState("");
  const [driverAppNoteId, setDriverAppNoteId] = useState<number | null>(null);
  const [driverAppVehicleType, setDriverAppVehicleType] = useState("motorcycle");
  // Suspension form state for drivers
  const [driverSuspendFormId, setDriverSuspendFormId] = useState<number | null>(null);
  const [driverSuspendReason, setDriverSuspendReason] = useState("");
  const [driverSuspendDuration, setDriverSuspendDuration] = useState("7");

  // ── Loan Applications admin state ────────────────────────────────────────
  const [loanAdminPending, setLoanAdminPending] = useState(0);

  // ── Employer Verification Applications (Djòb) state ─────────────────────
  const [employerApps, setEmployerApps] = useState<any[]>([]);
  const [employerAppsLoading, setEmployerAppsLoading] = useState(false);
  const [employerAppsFilter, setEmployerAppsFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [employerAppActioning, setEmployerAppActioning] = useState<number | null>(null);
  const [employerRejectNote, setEmployerRejectNote] = useState("");
  const [employerRejectId, setEmployerRejectId] = useState<number | null>(null);

  const loadEmployerApps = useCallback(async (status = employerAppsFilter) => {
    setEmployerAppsLoading(true);
    const data = await adminFetch(`/api/admin/employer-verifications?status=${status}`, "GET");
    setEmployerApps(data ?? []);
    setEmployerAppsLoading(false);
  }, [employerAppsFilter]);

  const handleEmployerAction = async (id: number, action: "approve" | "reject", reason?: string) => {
    setEmployerAppActioning(id);
    try {
      await adminFetch(`/api/admin/employer-verifications/${id}`, "PATCH", { action, rejectionReason: reason });
      await loadEmployerApps();
      setEmployerRejectId(null);
      setEmployerRejectNote("");
    } finally {
      setEmployerAppActioning(null);
    }
  };

  // ── Authorized Agent Applications (Demands Anje Otorizé) state ──────────
  const [kycAgentApps, setKycAgentApps] = useState<any[]>([]);
  const [kycAgentAppsLoading, setKycAgentAppsLoading] = useState(false);
  const [kycAgentAppsFilter, setKycAgentAppsFilter] = useState<"all" | "pending" | "approved" | "rejected" | "suspended">("pending");
  const [kycAgentAppExpanded, setKycAgentAppExpanded] = useState<number | null>(null);
  const [kycAgentAppActioning, setKycAgentAppActioning] = useState<number | null>(null);
  const [kycAgentAppNote, setKycAgentAppNote] = useState("");
  const [kycAgentAppNoteId, setKycAgentAppNoteId] = useState<number | null>(null);
  const [kycAgentMonthlyLimit, setKycAgentMonthlyLimit] = useState("15000");
  // Suspension form state for agents
  const [agentSuspendFormId, setAgentSuspendFormId] = useState<number | null>(null);

  // ── KYC Identity Verification state ─────────────────────────────────────
  const [kycIdApps, setKycIdApps] = useState<any[]>([]);
  const [kycIdLoading, setKycIdLoading] = useState(false);
  const [kycIdFilter, setKycIdFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [kycIdActioning, setKycIdActioning] = useState<number | null>(null);
  const [kycIdRejectReason, setKycIdRejectReason] = useState<Record<number, string>>({});
  const [agentSuspendReason, setAgentSuspendReason] = useState("");
  const [agentSuspendDuration, setAgentSuspendDuration] = useState("7");
  // Admin/Mod suspension state (super admin only)
  const [adminSuspendFormId, setAdminSuspendFormId] = useState<number | null>(null);
  const [adminSuspendReason, setAdminSuspendReason] = useState("");
  const [adminSuspendDuration, setAdminSuspendDuration] = useState("30");
  const [adminSuspendActioning, setAdminSuspendActioning] = useState<number | null>(null);

  useEffect(() => { if (user && !user.isAdmin && !(user as any).isSuperAdmin) setLocation("/"); else if (!user) setLocation("/auth/login"); }, [user]);

  // Poll the support unread badge so admins see new help requests in real time.
  useEffect(() => {
    if (!user || (!user.isAdmin && !(user as any).isSuperAdmin)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await adminFetch("/api/support/unread-count", "GET");
        if (!cancelled) setSupportUnread(r?.count ?? 0);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  // Poll admin-to-admin chat unread count.
  useEffect(() => {
    if (!user || (!user.isAdmin && !(user as any).isSuperAdmin)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await adminFetch("/api/admin/chat/unread-count", "GET");
        if (!cancelled) setAdminChatUnread(r?.count ?? 0);
      } catch { /* ignore */ }
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user]);

  useEffect(() => {
    if (!user || (!user.isAdmin && !(user as any).isSuperAdmin)) return;
    (async () => {
      try {
        const data = await adminFetch("/api/admin/me", "GET");
        setMe(data);
        // Auto-lock country filters to scope for non-superAdmin with a scope country or countries
        if (!(user as any).isSuperAdmin) {
          const firstCountry = data?.scopeCountry ?? data?.scopeCountries?.[0] ?? null;
          if (firstCountry) {
            setUserCountryFilter(firstCountry);
            setListingCountryFilter(firstCountry);
            setBoostCountryFilter(firstCountry);
          }
        }
      } catch {}
      if ((user as any)?.isSuperAdmin) {
        try { const opts = await adminFetch("/api/admin/scope-options", "GET"); setScopeOptions(opts); } catch {}
      }
    })();
  }, [user]);

  // Eagerly load data for tabs the current user can access.
  useEffect(() => {
    if (!user || (!user.isAdmin && !(user as any).isSuperAdmin)) return;
    // Load application queues so stat cards show live counts immediately.
    loadDriverApps("pending");
    loadKycAgentApps("pending");
    adminFetch("/api/admin/loans?status=pending_review&limit=1", "GET")
      .then((d: any) => setLoanAdminPending(d?.total ?? 0))
      .catch(() => {});
    // Commission settings are super_admin only (global config).
    if ((user as any)?.isSuperAdmin) {
      loadCommission();
      loadPaymentProviders();
      loadUsdtWallet();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load password hash stats and keep them live (poll every 30 s).
  const fetchPwHashStats = useCallback(async (opts?: { manual?: boolean }) => {
    if (opts?.manual) setRefreshingPwStats(true);
    try {
      const data = await adminFetch("/api/admin/password-hash-stats", "GET");
      setPwHashStats(data);
      if (typeof data?.nudgeCooldownHours === "number" && !cooldownHoursDirty.current) {
        setCooldownHours(data.nudgeCooldownHours);
      }
    } catch { /* ignore */ } finally {
      if (opts?.manual) setRefreshingPwStats(false);
    }
  }, []);

  useEffect(() => {
    if (!user || (!user.isAdmin && !(user as any).isSuperAdmin)) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await fetchPwHashStats();
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, fetchPwHashStats]);

  const { data: stats } = useAdminGetStats();
  const { data: users } = useAdminGetUsers();
  const { data: listings } = useAdminGetListings();
  const { data: reports } = useAdminGetReports();
  const banUser = useAdminBanUser();
  const removeListing = useAdminRemoveListing();

  const s = stats as any;
  const allUsers = (users as any[]) ?? [];
  const allListings = (listings as any[]) ?? [];
  const flaggedUsers = allUsers.filter((u: any) => u.isFlagged && !u.isBanned);

  // If the user landed on /admin without an explicit ?tab and there are
  // flagged users to triage, surface that tab automatically. Only runs
  // until the user picks a tab themselves.
  useEffect(() => {
    if (!tabExplicitlySet && adminTab === "users" && flaggedUsers.length > 0) {
      setAdminTabState("flagged");
    }
  }, [tabExplicitlySet, adminTab, flaggedUsers.length]);
  const bannedUsers = allUsers.filter((u: any) => u.isBanned);
  const adminTeam = allUsers.filter((u: any) => u.isAdmin || u.isSuperAdmin);
  const boostedListings = allListings.filter((l: any) => l.isBoosted);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getAdminGetUsersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetListingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getAdminGetStatsQueryKey() });
  };

  const act = async (key: string, fn: () => Promise<void>) => {
    setActioning(key);
    try { await fn(); invalidate(); }
    catch (e: any) { toast({ title: e.message ?? "Error", variant: "destructive" }); }
    finally { setActioning(null); }
  };

  const loadActivity = async (u: any) => {
    setActivityUser(u);
    try {
      const data = await adminFetch(`/api/admin/users/${u.id}/activity`, "GET");
      setActivityData(data);
    } catch {
      setActivityData(null);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
  };

  const loadSecurity = async (u: any) => {
    setSecurityUser(u);
    setSecurityData(null);
    setEditPhoneOpen(false);
    setEditPhoneValue("");
    try {
      const data = await adminFetch(`/api/admin/users/${u.id}/security`, "GET");
      setSecurityData(data);
    } catch {
      setSecurityData(null);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
  };

  const handlePhoneOverride = async () => {
    if (!securityUser || !editPhoneValue.trim()) return;
    setEditPhoneLoading(true);
    try {
      const data = await adminFetch(`/api/admin/users/${securityUser.id}/phone`, "PATCH", { phone: editPhoneValue.trim() });
      if (data?.success) {
        setSecurityData((prev: any) => prev ? { ...prev, phone: data.phone } : prev);
        setSecurityUser((prev: any) => prev ? { ...prev, phone: data.phone } : prev);
        toast({ title: "Telefòn mete ajou", description: data.phone });
        setEditPhoneOpen(false);
        setEditPhoneValue("");
      } else {
        toast({ title: data?.error ?? "Erè", variant: "destructive" });
      }
    } catch { toast({ title: "Erè rezo", variant: "destructive" }); }
    finally { setEditPhoneLoading(false); }
  };

  const loadViewAnalytics = async () => {
    try {
      const data = await adminFetch("/api/admin/analytics/views", "GET");
      setViewAnalytics(data);
    } catch { setViewAnalytics(null); }
  };

  const loadLogs = async (opts?: { since?: string; until?: string }) => {
    try {
      const params = new URLSearchParams();
      const since = opts?.since;
      const until = opts?.until;
      if (since) params.set("since", since);
      if (until) params.set("until", until);
      const qs = params.toString();
      const data = await adminFetch(`/api/admin/logs${qs ? `?${qs}` : ""}`, "GET");
      setLogs(data);
    }
    catch {
      setLogs([]);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
  };

  const buildLogsParams = (dateRange: typeof logsDateRange, dateFrom: string, dateTo: string) => {
    if (dateRange === "7d") return { since: new Date(Date.now() - 7 * 86400_000).toISOString() };
    if (dateRange === "30d") return { since: new Date(Date.now() - 30 * 86400_000).toISOString() };
    if (dateRange === "90d") return { since: new Date(Date.now() - 90 * 86400_000).toISOString() };
    if (dateRange === "custom") {
      const p: { since?: string; until?: string } = {};
      if (dateFrom) p.since = new Date(dateFrom).toISOString();
      if (dateTo) p.until = new Date(dateTo + "T23:59:59").toISOString();
      return p;
    }
    return {};
  };

  const handleExportCsv = () => {
    const now = new Date();
    const presetCutoff = logsDateRange === "7d" ? new Date(now.getTime() - 7 * 86400_000)
      : logsDateRange === "30d" ? new Date(now.getTime() - 30 * 86400_000)
      : logsDateRange === "90d" ? new Date(now.getTime() - 90 * 86400_000)
      : null;
    const customFrom = logsDateRange === "custom" && logsDateFrom ? new Date(logsDateFrom) : null;
    const customTo = logsDateRange === "custom" && logsDateTo ? new Date(logsDateTo + "T23:59:59") : null;
    const filtered = logs.filter((l: any) => {
      if (logsFilter === "cooldown" && !LOG_COOLDOWN_ACTIONS.has(l.action)) return false;
      if (logsFilter === "user" && !LOG_USER_ACTIONS.has(l.action)) return false;
      if (logsFilter === "listing" && !LOG_LISTING_ACTIONS.has(l.action)) return false;
      const ts = new Date(l.createdAt);
      if (presetCutoff && ts < presetCutoff) return false;
      if (customFrom && ts < customFrom) return false;
      if (customTo && ts > customTo) return false;
      return true;
    });
    const escape = (v: string | null | undefined) => {
      const s = v == null ? "" : String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = ["date", "admin", "action", "target", "details"].join(",");
    const rows = filtered.map((l: any) => [
      escape(new Date(l.createdAt).toISOString()),
      escape(l.adminName),
      escape(l.action),
      escape(l.targetType && l.targetId != null ? `${l.targetType}:${l.targetId}` : (l.targetType ?? "")),
      escape(l.details),
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadSupport = async () => {
    try {
      const data = await adminFetch("/api/support/threads?all=1", "GET");
      setSupportThreads(data);
    } catch { setSupportThreads([]); }
  };

  // ── Seller MonCash Payouts loaders / actions ───────────────────────────────
  const loadPromo = async () => {
    setPromoCodesLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const [r1, r2] = await Promise.all([
        fetch("/api/admin/promo/codes", { headers: { Authorization: `Bearer ${tk}` } }),
        fetch("/api/admin/promo/campaign", { headers: { Authorization: `Bearer ${tk}` } }),
      ]);
      if (r1.ok) setPromoCodes(await r1.json());
      if (r2.ok) { const s = await r2.json(); setCampaignSettings(s); setCampaignDraft(s); }
    } catch { /* noop */ }
    finally { setPromoCodesLoading(false); }
  };

  const createPromoCode = async () => {
    if (!newCode.code.trim() || !newCode.discountValue) return;
    setPromoCodeSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/promo/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({
          code: newCode.code.trim().toUpperCase(),
          discountType: newCode.discountType,
          discountValue: parseFloat(newCode.discountValue),
          minOrderValue: newCode.minOrderValue ? parseFloat(newCode.minOrderValue) : 0,
          maxUses: newCode.maxUses ? parseInt(newCode.maxUses) : null,
          maxUsesPerUser: parseInt(newCode.maxUsesPerUser) || 1,
          expiresAt: newCode.expiresAt || null,
          description: newCode.description || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: data?.error || "Echèk kreye kòd", variant: "destructive" }); return; }
      toast({ title: `Kòd "${data.code}" kreye` });
      setNewCode({ code: "", discountType: "percent", discountValue: "", minOrderValue: "", maxUses: "", maxUsesPerUser: "1", expiresAt: "", description: "" });
      await loadPromo();
    } finally { setPromoCodeSaving(false); }
  };

  const togglePromoCode = async (id: number, active: boolean) => {
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch(`/api/admin/promo/codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ active }),
      });
      if (res.ok) { toast({ title: active ? "Kòd aktive" : "Kòd dezaktive" }); await loadPromo(); }
    } catch { /* noop */ }
  };

  const saveCampaign = async () => {
    if (!campaignDraft) return;
    setCampaignSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/promo/campaign", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify(campaignDraft),
      });
      if (res.ok) { const s = await res.json(); setCampaignSettings(s); setCampaignDraft(s); toast({ title: "Paramèt sove" }); }
    } finally { setCampaignSaving(false); }
  };

  const loadAdminSubscriptions = async () => {
    setAdminSubsLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const r = await fetch("/api/admin/subscriptions", { headers: { Authorization: `Bearer ${tk}` } });
      if (r.ok) setAdminSubs(await r.json());
    } finally { setAdminSubsLoading(false); }
  };

  const grantSubscription = async () => {
    if (!grantForm.userId || !grantForm.plan) return;
    setGrantSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/subscriptions/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ userId: parseInt(grantForm.userId), plan: grantForm.plan, months: parseInt(grantForm.months) || 1 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: data?.error || "Echèk", variant: "destructive" }); return; }
      toast({ title: `Plan ${grantForm.plan} ba itilizatè #${grantForm.userId}` });
      setGrantForm({ userId: "", plan: "standard", months: "1" });
      await loadAdminSubscriptions();
    } finally { setGrantSaving(false); }
  };

  const revokeSubscription = async (userId: number) => {
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/subscriptions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) { toast({ title: "Abònman révokè" }); await loadAdminSubscriptions(); }
    } catch { /* noop */ }
  };

  const loadSellerPayouts = async () => {
    setSellerPayoutsLoading(true);
    setSellerAccountsLoading(true);
    try {
      const [payouts, accounts] = await Promise.all([
        adminFetch("/api/admin/seller-payouts", "GET"),
        adminFetch("/api/admin/seller-payout-accounts", "GET"),
      ]);
      setSellerPayouts(Array.isArray(payouts) ? payouts : []);
      setSellerPayoutAccounts(Array.isArray(accounts) ? accounts : []);
    } catch {
      setSellerPayouts([]);
      setSellerPayoutAccounts([]);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    } finally {
      setSellerPayoutsLoading(false);
      setSellerAccountsLoading(false);
    }
  };

  const handleMarkPayoutPaid = async (payoutId: number) => {
    setSellerPayoutActioning(payoutId);
    try {
      await adminFetch(`/api/admin/seller-payouts/${payoutId}/mark-paid`, "POST", { notes: sellerPayoutNote[payoutId] ?? "" });
      toast({ title: t("adminBanner.toastPaymentMarked") });
      await loadSellerPayouts();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSellerPayoutActioning(null); }
  };

  const handleVerifySellerAccount = async (accountId: number) => {
    setSellerAccountActioning(accountId);
    try {
      await adminFetch(`/api/admin/seller-payout-accounts/${accountId}/verify`, "POST");
      toast({ title: "✅ Nimewo MonCash vendè verifye" });
      await loadSellerPayouts();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSellerAccountActioning(null); }
  };

  const handleRejectSellerAccount = async (accountId: number, reason: string) => {
    setSellerAccountActioning(accountId);
    try {
      await adminFetch(`/api/admin/seller-payout-accounts/${accountId}/reject`, "POST", { reason });
      toast({ title: "✅ Nimewo rejte" });
      setSellerAccountRejectId(null);
      setSellerAccountRejectReason("");
      await loadSellerPayouts();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSellerAccountActioning(null); }
  };

  const handleVerifyBankAccount = async (accountId: number) => {
    setSellerAccountActioning(accountId);
    try {
      await adminFetch(`/api/admin/seller-payout-accounts/${accountId}/verify-bank`, "POST");
      toast({ title: "✅ Kont labank vendè verifye" });
      await loadSellerPayouts();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSellerAccountActioning(null); }
  };

  const handleRejectBankAccount = async (accountId: number, reason: string) => {
    setSellerAccountActioning(accountId);
    try {
      await adminFetch(`/api/admin/seller-payout-accounts/${accountId}/reject-bank`, "POST", { reason });
      toast({ title: "✅ Kont labank rejte" });
      setSellerAccountRejectId(null);
      setSellerAccountRejectReason("");
      await loadSellerPayouts();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setSellerAccountActioning(null); }
  };

  // ── Cashout admin loaders / actions ────────────────────────────────────────
  const loadCashout = async () => {
    setCashoutLoading(true);
    try { const data = await adminFetch("/api/cashout/admin/all", "GET"); setCashoutRequests(Array.isArray(data) ? data : []); }
    catch {
      setCashoutRequests([]);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
    finally { setCashoutLoading(false); }
  };

  const handleCashoutReview = async (requestId: number, action: "approve" | "reject" | "paid") => {
    setCashoutActioning(requestId);
    try {
      const data = await adminFetch("/api/cashout/admin/review", "POST", { requestId, action, adminNote: cashoutNote[requestId] ?? "" });
      toast({ title: action === "approve" ? `✅ Apwouve — Kòd: ${data.otpCode}` : action === "paid" ? "✅ Mak kòm peye" : "✅ Rejte ak rembourseman" });
      await loadCashout();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setCashoutActioning(null); }
  };

  // ── Agents admin loaders / actions ─────────────────────────────────────────
  const loadAgents = async () => {
    setAgentsLoading(true);
    try { const data = await adminFetch("/api/cashout/admin/agents", "GET"); setAgentsList(Array.isArray(data) ? data : []); }
    catch {
      setAgentsList([]);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
    finally { setAgentsLoading(false); }
  };

  // ── Driver Applications loaders / actions ───────────────────────────────
  const loadDriverApps = async (statusFilter = driverAppsFilter) => {
    setDriverAppsLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await adminFetch(`/api/admin/delivery/applications${qs}`, "GET");
      setDriverApps(Array.isArray(data?.applications) ? data.applications : []);
    } catch {
      setDriverApps([]);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
    finally { setDriverAppsLoading(false); }
  };

  const handleDriverAppApprove = async (appId: number) => {
    setDriverAppActioning(appId);
    try {
      await adminFetch(`/api/admin/delivery/applications/${appId}/approve`, "PATCH", {
        adminNote: driverAppNote || null,
        vehicleType: driverAppVehicleType,
      });
      toast({ title: t("adminBanner.toastDriverApproved") });
      setDriverAppNoteId(null); setDriverAppNote(""); setDriverAppExpanded(null);
      await loadDriverApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setDriverAppActioning(null); }
  };

  const handleDriverAppReject = async (appId: number) => {
    setDriverAppActioning(appId);
    try {
      await adminFetch(`/api/admin/delivery/applications/${appId}/reject`, "PATCH", { adminNote: driverAppNote || null });
      toast({ title: t("adminBanner.toastDriverRejected") });
      setDriverAppNoteId(null); setDriverAppNote(""); setDriverAppExpanded(null);
      await loadDriverApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setDriverAppActioning(null); }
  };

  const handleDriverAppSuspend = async (appId: number) => {
    setDriverAppActioning(appId);
    try {
      const durationDays = driverSuspendDuration === "0" ? 0 : parseInt(driverSuspendDuration, 10);
      await adminFetch(`/api/admin/delivery/applications/${appId}/suspend`, "PATCH", {
        reason: driverSuspendReason || "Vyolasyon règleman livrezon",
        durationDays: durationDays > 0 ? durationDays : undefined,
      });
      toast({ title: "⏸️ Chofe suspann" });
      setDriverSuspendFormId(null); setDriverSuspendReason(""); setDriverSuspendDuration("7");
      await loadDriverApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setDriverAppActioning(null); }
  };

  const handleDriverAppUnsuspend = async (appId: number) => {
    setDriverAppActioning(appId);
    try {
      await adminFetch(`/api/admin/delivery/applications/${appId}/unsuspend`, "PATCH", {});
      toast({ title: "✅ Suspansyon leve" });
      await loadDriverApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setDriverAppActioning(null); }
  };

  // ── KYC Identity Verification loaders / actions ─────────────────────────
  const loadKycIdApps = async (statusFilter = kycIdFilter) => {
    setKycIdLoading(true);
    try {
      const data = await adminFetch(`/api/admin/kyc?status=${statusFilter}`, "GET");
      setKycIdApps(Array.isArray(data?.applications) ? data.applications : []);
    } catch { setKycIdApps([]); }
    finally { setKycIdLoading(false); }
  };

  const handleKycIdDecide = async (userId: number, decision: "approve" | "reject") => {
    const reason = kycIdRejectReason[userId]?.trim();
    if (decision === "reject" && !reason) {
      toast({ title: "Rezon obligatwa pou rejeksyon", variant: "destructive" });
      return;
    }
    setKycIdActioning(userId);
    try {
      await adminFetch(`/api/admin/kyc/${userId}/decide`, "PATCH", { decision, rejectionReason: reason ?? null });
      toast({ title: decision === "approve" ? "✅ KYC apwouve" : "❌ KYC rejte" });
      loadKycIdApps();
    } catch (e: any) {
      toast({ title: "Erè", description: e?.message, variant: "destructive" });
    } finally { setKycIdActioning(null); }
  };

  // ── KYC Agent Applications loaders / actions ────────────────────────────
  const loadKycAgentApps = async (statusFilter = kycAgentAppsFilter) => {
    setKycAgentAppsLoading(true);
    try {
      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const data = await adminFetch(`/api/admin/agents${qs}`, "GET");
      setKycAgentApps(Array.isArray(data?.applications) ? data.applications : []);
    } catch { setKycAgentApps([]); }
    finally { setKycAgentAppsLoading(false); }
  };

  const handleKycAgentApprove = async (appId: number) => {
    setKycAgentAppActioning(appId);
    try {
      await adminFetch(`/api/admin/agents/${appId}/approve`, "PATCH", {
        adminNote: kycAgentAppNote || null,
        monthlyLimitUsd: parseFloat(kycAgentMonthlyLimit) || 15000,
      });
      toast({ title: "✅ Anje otorizé aprouve!" });
      setKycAgentAppNoteId(null); setKycAgentAppNote(""); setKycAgentAppExpanded(null);
      await loadKycAgentApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setKycAgentAppActioning(null); }
  };

  const handleKycAgentReject = async (appId: number) => {
    setKycAgentAppActioning(appId);
    try {
      await adminFetch(`/api/admin/agents/${appId}/reject`, "PATCH", { adminNote: kycAgentAppNote || null });
      toast({ title: t("adminBanner.toastAgentRejected") });
      setKycAgentAppNoteId(null); setKycAgentAppNote(""); setKycAgentAppExpanded(null);
      await loadKycAgentApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setKycAgentAppActioning(null); }
  };

  const handleKycAgentSuspend = async (appId: number) => {
    setKycAgentAppActioning(appId);
    try {
      const durationDays = agentSuspendDuration === "0" ? 0 : parseInt(agentSuspendDuration, 10);
      await adminFetch(`/api/admin/agents/${appId}/suspend`, "PATCH", {
        reason: agentSuspendReason || "Vyolasyon règleman anje",
        durationDays: durationDays > 0 ? durationDays : undefined,
      });
      toast({ title: "⏸️ Anje suspann" });
      setAgentSuspendFormId(null); setAgentSuspendReason(""); setAgentSuspendDuration("7");
      await loadKycAgentApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setKycAgentAppActioning(null); }
  };

  const handleKycAgentUnsuspend = async (appId: number) => {
    setKycAgentAppActioning(appId);
    try {
      await adminFetch(`/api/admin/agents/${appId}/unsuspend`, "PATCH", {});
      toast({ title: "✅ Suspansyon anje leve" });
      await loadKycAgentApps();
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setKycAgentAppActioning(null); }
  };

  const handleAdminSuspend = async (userId: number) => {
    setAdminSuspendActioning(userId);
    try {
      const durationDays = adminSuspendDuration === "0" ? 0 : parseInt(adminSuspendDuration, 10);
      await adminFetch(`/api/admin/users/${userId}/admin-suspend`, "POST", {
        reason: adminSuspendReason || "Vyolasyon règleman admin",
        durationDays: durationDays > 0 ? durationDays : undefined,
      });
      toast({ title: "⏸️ Admin/Moderatè suspann" });
      setAdminSuspendFormId(null); setAdminSuspendReason(""); setAdminSuspendDuration("30");
      queryClient.invalidateQueries({ queryKey: getAdminGetUsersQueryKey() });
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setAdminSuspendActioning(null); }
  };

  const handleAdminUnsuspend = async (userId: number) => {
    setAdminSuspendActioning(userId);
    try {
      await adminFetch(`/api/admin/users/${userId}/admin-unsuspend`, "POST", {});
      toast({ title: "✅ Suspansyon admin leve" });
      queryClient.invalidateQueries({ queryKey: getAdminGetUsersQueryKey() });
    } catch (e: any) { toast({ title: e.message ?? "Erè", variant: "destructive" }); }
    finally { setAdminSuspendActioning(null); }
  };

  const handleToggleAgent = async (userId: number, makeAgent: boolean) => {
    setAgentTogglingId(userId);
    try {
      await adminFetch("/api/cashout/admin/agent/toggle", "POST", { userId, makeAgent });
      toast({ title: makeAgent ? "✅ Itilizatè vin ajant" : "✅ Wòl ajant retire" });
      await loadAgents();
    } catch (e: any) { toast({ title: e.message, variant: "destructive" }); }
    finally { setAgentTogglingId(null); }
  };

  // Jobs admin loaders / actions ─────────────────────────────────────────────
  const loadAdminJobs = async () => {
    try {
      const params = new URLSearchParams();
      if (jobsFilter !== "all") params.set("status", jobsFilter);
      if (jobsSearch.trim()) params.set("q", jobsSearch.trim());
      const qs = params.toString();
      const data = await adminFetch(`/api/admin/jobs${qs ? `?${qs}` : ""}`, "GET");
      setAdminJobs(Array.isArray(data) ? data : []);
    } catch { setAdminJobs([]); }
  };

  const openEditJob = (job: any) => {
    setEditJob(job);
    setEditJobForm({
      title: job.title ?? "",
      description: job.description ?? "",
      budget: job.budget != null ? String(job.budget) : "",
      location: job.location ?? "",
      status: job.status ?? "open",
    });
  };

  const saveEditJob = async () => {
    if (!editJob) return;
    setJobActioning(editJob.id);
    try {
      const payload: Record<string, unknown> = {
        title: editJobForm.title,
        description: editJobForm.description,
        location: editJobForm.location,
        status: editJobForm.status,
      };
      payload.budget = editJobForm.budget === "" ? null : editJobForm.budget;
      await adminFetch(`/api/admin/jobs/${editJob.id}`, "PUT", payload);
      toast({ title: "Travay sove" });
      setEditJob(null);
      loadAdminJobs();
    } catch (e: any) {
      toast({ title: "Erè", description: e?.message ?? "", variant: "destructive" });
    } finally { setJobActioning(null); }
  };

  const deleteAdminJob = async (id: number, title: string) => {
    if (!confirm(`Efase travay "${title}" ? Aksyon sa a definitif.`)) return;
    setJobActioning(id);
    try {
      await adminFetch(`/api/admin/jobs/${id}`, "DELETE");
      toast({ title: "Travay efase" });
      loadAdminJobs();
    } catch (e: any) {
      toast({ title: "Erè", description: e?.message ?? "", variant: "destructive" });
    } finally { setJobActioning(null); }
  };

  const setJobStatus = async (id: number, status: string) => {
    setJobActioning(id);
    try {
      await adminFetch(`/api/admin/jobs/${id}`, "PUT", { status });
      loadAdminJobs();
    } catch (e: any) {
      toast({ title: "Erè", description: e?.message ?? "", variant: "destructive" });
    } finally { setJobActioning(null); }
  };

  // If we landed on /admin?tab=support&thread=N (e.g. from a push
  // notification), open that thread once on mount.
  useEffect(() => {
    if (initialTab === "support") {
      loadSupport();
      const tid = initialDeepThread ? Number(initialDeepThread) : NaN;
      if (Number.isFinite(tid)) loadSupportThread(tid);
    }
    if (initialTab === "jobs") loadAdminJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load jobs whenever the user switches *into* the Travay tab (deep links
  // already handled above on mount, this covers in-page tab clicks too).
  useEffect(() => {
    if (adminTab === "jobs" && adminJobs.length === 0) loadAdminJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab]);

  const loadSupportThread = async (id: number) => {
    try {
      const data = await adminFetch(`/api/support/threads/${id}`, "GET");
      setSupportDetail(data);
      setSupportActiveId(id);
      // Reload list so unread badges refresh.
      loadSupport();
    } catch (e: any) {
      toast({ title: "Failed to load thread", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const sendSupportReply = async () => {
    if (!supportActiveId || !supportReply.trim() || supportSending) return;
    setSupportSending(true);
    try {
      await adminFetch(`/api/support/threads/${supportActiveId}/messages`, "POST", { content: supportReply.trim() });
      setSupportReply("");
      const data = await adminFetch(`/api/support/threads/${supportActiveId}`, "GET");
      setSupportDetail(data);
      loadSupport();
    } catch (e: any) {
      toast({ title: "Failed to send", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setSupportSending(false);
    }
  };

  const closeSupport = async (id: number) => {
    try {
      await adminFetch(`/api/support/threads/${id}/close`, "POST");
      if (supportActiveId === id) await loadSupportThread(id);
      loadSupport();
    } catch (e: any) {
      toast({ title: "Close failed", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const reopenSupport = async (id: number) => {
    try {
      await adminFetch(`/api/support/threads/${id}/reopen`, "POST");
      if (supportActiveId === id) await loadSupportThread(id);
      loadSupport();
    } catch (e: any) {
      toast({ title: "Reopen failed", description: e?.message ?? "", variant: "destructive" });
    }
  };

  // ── Admin-to-admin chat handlers ─────────────────────────────────────────
  const loadAdminChatAdmins = async () => {
    try {
      const data = await adminFetch("/api/admin/chat/admins", "GET");
      setAdminChatAdmins(data ?? []);
    } catch { setAdminChatAdmins([]); }
  };

  const loadAdminChatMessages = async (otherId: number) => {
    try {
      const data = await adminFetch(`/api/admin/chat/messages/${otherId}`, "GET");
      setAdminChatDetail(data);
      setAdminChatActiveId(otherId);
      // Refresh unread count after reading.
      try { const r = await adminFetch("/api/admin/chat/unread-count", "GET"); setAdminChatUnread(r?.count ?? 0); } catch {}
      // Refresh admin list to clear unread badges.
      loadAdminChatAdmins();
      setTimeout(() => adminChatBottomRef.current?.scrollIntoView({ behavior: "instant" as ScrollBehavior }), 50);
    } catch (e: any) {
      toast({ title: "Erè chajman", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const sendAdminChatMessage = async () => {
    if (!adminChatActiveId || !adminChatMessage.trim() || adminChatSending) return;
    setAdminChatSending(true);
    try {
      await adminFetch(`/api/admin/chat/messages/${adminChatActiveId}`, "POST", { content: adminChatMessage.trim() });
      setAdminChatMessage("");
      await loadAdminChatMessages(adminChatActiveId);
    } catch (e: any) {
      toast({ title: "Erè anvoy", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setAdminChatSending(false);
    }
  };

  const loadModerationQueue = async (status: string = moderationFilter) => {
    try {
      const qs = status === "all" ? "" : `?status=${status}`;
      const data = await adminFetch(`/api/admin/moderation${qs}`, "GET");
      setModerationQueue(data);
    } catch (e: any) {
      toast({ title: "Failed to load queue", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const handleModerationApprove = async (id: number) => {
    try {
      await adminFetch(`/api/admin/moderation/${id}/approve`, "POST");
      toast({ title: "Listing approved" });
      await loadModerationQueue();
      invalidate();
    } catch (e: any) {
      toast({ title: "Failed to approve", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const handleModerationReject = async (id: number) => {
    try {
      await adminFetch(`/api/admin/moderation/${id}/reject`, "POST", {});
      toast({ title: "Listing rejected" });
      await loadModerationQueue();
      invalidate();
    } catch (e: any) {
      toast({ title: "Failed to reject", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const loadBoostRecords = async () => {
    try { const data = await adminFetch("/api/admin/boosts", "GET"); setBoostRecords(data); }
    catch {
      setBoostRecords([]);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
  };

  const loadWalletAdmin = async () => {
    try {
      const [allData, settings] = await Promise.all([
        adminFetch("/api/wallet/admin/all", "GET"),
        adminFetch("/api/wallet/admin/settings", "GET"),
      ]);
      setWalletRecharges(Array.isArray(allData?.transactions) ? allData.transactions : []);
      setWalletBalances(Array.isArray(allData?.balances) ? allData.balances : []);
      if (settings?.rateHtgToUsd != null) {
        setWalletSettings(settings);
        setWalletRateInput(String(settings.rateHtgToUsd));
        setWalletBonusInput(String(settings.bonusPct));
        setWalletMoncashNumber(settings.moncashPlatformNumber ?? "");
      }
    } catch {
      setWalletRecharges([]); setWalletBalances([]);
      toast({ title: t("admin.loadError"), variant: "destructive" });
    }
    // Also load scoped transaction history
    loadAdminTxHistory({});
  };

  const openWalletDetail = async (userId: number) => {
    setWalletDetailUserId(userId);
    setWalletDetailData(null);
    setWalletDetailLoading(true);
    try {
      const data = await adminFetch(`/api/wallet/admin/user/${userId}`, "GET");
      setWalletDetailData(data);
    } catch { setWalletDetailData(null); }
    finally { setWalletDetailLoading(false); }
  };

  const loadRechargeCards = async () => {
    setRcCardsLoading(true);
    try {
      const data = await adminFetch("/api/admin/recharge-cards", "GET");
      setRechargeCards(Array.isArray(data?.cards) ? data.cards : []);
    } catch { setRechargeCards([]); }
    finally { setRcCardsLoading(false); }
  };

  const loadBnplAdmin = async () => {
    setBnplAdminLoading(true);
    try {
      const [settings, analytics] = await Promise.all([
        fetch("/api/bnpl/settings").then(r => r.json()),
        adminFetch("/api/admin/bnpl/analytics", "GET").catch(() => null),
      ]);
      setBnplAdminSettings({
        klarnaEnabled: settings.klarnaEnabled ?? false,
        affirmEnabled: settings.affirmEnabled ?? false,
        afterpayEnabled: settings.afterpayEnabled ?? false,
        minAmountUsd: settings.minAmountUsd ?? 50,
        maxAmountUsd: settings.maxAmountUsd ?? 5000,
        platformFeePercent: settings.platformFeePercent ?? 2,
      });
      if (analytics) setBnplAdminAnalytics(analytics);
    } catch { /* ignore */ }
    finally { setBnplAdminLoading(false); }
  };

  const loadChargebacks = async () => {
    setChargebacksLoading(true);
    try {
      const data = await adminFetch("/api/admin/chargebacks");
      setChargebacks(data);
    } catch (e: any) { toast({ title: "Erè", description: e?.message ?? "Echèk chajbak", variant: "destructive" }); }
    finally { setChargebacksLoading(false); }
  };

  const resolveChargeback = async (id: number, opts: { notes?: string; restoreWallet?: boolean; unrestrictUser?: boolean; banUser?: boolean }) => {
    setChargebackResolving(id);
    try {
      await adminFetch(`/api/admin/chargebacks/${id}/resolve`, "POST", opts);
      toast({ title: "Chajbak rezoud ✅" });
      await loadChargebacks();
    } catch (e: any) { toast({ title: "Erè", description: e?.message ?? "Echèk rezoud", variant: "destructive" }); }
    finally { setChargebackResolving(null); }
  };

  const saveBnplSettings = async () => {
    if (!bnplAdminSettings) return;
    setBnplAdminSaving(true);
    try {
      await adminFetch("/api/admin/bnpl/settings", "PATCH", bnplAdminSettings);
      toast({ title: "Paramèt BNPL sovgade ✅" });
    } catch (e: any) { toast({ title: "Erè", description: e?.message ?? "Echèk sovgade", variant: "destructive" }); }
    finally { setBnplAdminSaving(false); }
  };

  const loadReturns = async (status = returnsFilter) => {
    setReturnsLoading(true);
    try {
      const data = await adminFetch(`/api/admin/returns?status=${status}&page=1`, "GET");
      setReturnsList(Array.isArray(data?.returns) ? data.returns : []);
    } catch { setReturnsList([]); }
    finally { setReturnsLoading(false); }
  };

  const handleReturnDecide = async (returnId: number, decision: "approve" | "reject", note: string) => {
    setReturnsActioning(returnId);
    try {
      await adminFetch(`/api/admin/returns/${returnId}/decide`, "POST", { decision, note });
      toast({ title: decision === "approve" ? "Retou apwouve — ranbousman akòde ✅" : "Retou refize." });
      setReturnsDecideId(null);
      setReturnsNote("");
      await loadReturns();
    } catch (e: any) { toast({ title: "Erè", description: e?.message ?? "Echèk aksyon", variant: "destructive" }); }
    finally { setReturnsActioning(null); }
  };

  const handleGenerateCards = async () => {
    const amt = parseFloat(rcGenAmount);
    const qty = parseInt(rcGenQty, 10);
    if (!amt || amt <= 0 || !qty || qty <= 0) { alert("Antre valè ak kantite valid"); return; }
    if (!confirm(t("admin.confirmGenerateCards", { qty, amount: amt.toFixed(2) }))) return;
    setRcGenLoading(true);
    setRcGenResult(null);
    try {
      const data = await adminFetch("/api/admin/recharge-cards/generate", "POST", {
        amountUsd: amt, quantity: qty,
        ...(rcGenExpiry ? { expiresAt: rcGenExpiry } : {}),
      });
      setRcGenResult({ batchId: data.batchId, codes: data.codes ?? [] });
      toast({ title: `✅ ${qty} kat jenere — $${amt.toFixed(2)} chak` });
      await loadRechargeCards();
    } catch (e: any) {
      toast({ title: e?.message ?? t("admin.loadError"), variant: "destructive" });
    } finally { setRcGenLoading(false); }
  };

  const downloadCardsCSV = (codes: string[], amountUsd: number, batchId: string) => {
    const header = "Code,Amount USD,Batch ID";
    const rows = codes.map(c => `${c},${amountUsd},${batchId}`);
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `FM-Kart-Rechaj-${batchId}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const loadAdminTxHistory = async ({ filter = adminTxFilter, search = adminTxSearch }: { filter?: string; search?: string }) => {
    setAdminTxLoading(true);
    try {
      const params = new URLSearchParams({ filter, ...(search.trim() ? { search: search.trim() } : {}) });
      const data = await adminFetch(`/api/wallet/admin/transactions?${params}`, "GET");
      setAdminTxData(data);
    } catch { setAdminTxData(null); }
    finally { setAdminTxLoading(false); }
  };

  const handleWalletConfirm = async (txId: number, status: "completed" | "rejected") => {
    setWalletConfirmingId(txId);
    // Find the transaction's paymentRef from the loaded data
    const tx = walletRecharges.find((t: any) => t.id === txId);
    if (!tx) { setWalletConfirmingId(null); return; }
    try {
      await adminFetch("/api/wallet/topup/confirm", "POST", {
        paymentRef: tx.paymentRef,
        action: status === "completed" ? "confirm" : "reject",
      });
      await loadWalletAdmin();
    } catch (e: any) {
      alert(e?.error ?? "Erè");
    } finally { setWalletConfirmingId(null); }
  };

  const handleWalletSettings = async () => {
    setWalletSettingsSaving(true);
    try {
      await adminFetch("/api/wallet/admin/settings", "POST", {
        rateHtgToUsd: parseFloat(walletRateInput),
        bonusPct: parseFloat(walletBonusInput),
        moncashPlatformNumber: walletMoncashNumber.trim(),
      });
      await loadWalletAdmin();
    } catch (e: any) {
      alert(e?.error ?? "Erè");
    } finally { setWalletSettingsSaving(false); }
  };

  const handleWalletCredit = async () => {
    if (!walletCreditUserId || !walletCreditAmount) return;
    const amt = parseFloat(walletCreditAmount);
    if (!confirm(t("admin.confirmWalletCredit", { amount: amt.toFixed(2), userId: walletCreditUserId }))) return;
    setWalletCreditSaving(true);
    try {
      await adminFetch("/api/wallet/admin/credit", "POST", {
        userId: parseInt(walletCreditUserId),
        amountUsd: amt,
        note: walletCreditNote || "Admin credit",
      });
      toast({ title: `✅ $${amt.toFixed(2)} kredite nan kont #${walletCreditUserId}` });
      setWalletCreditUserId(""); setWalletCreditAmount(""); setWalletCreditNote("");
      await loadWalletAdmin();
    } catch (e: any) {
      toast({ title: e?.error ?? t("admin.loadError"), variant: "destructive" });
    } finally { setWalletCreditSaving(false); }
  };

  const filteredBoostRecords = boostRecords.filter(r => {
    if (boostPayFilter !== "all" && r.paymentMethod !== boostPayFilter) return false;
    if (boostStatusFilter !== "all" && r.paymentStatus !== boostStatusFilter) return false;
    if (boostCountryFilter !== "all" && r.listingCountry !== boostCountryFilter) return false;
    return true;
  });

  const openBoost = (l: any) => { setBoostModal(l); setBoostDays("7"); };

  const openEdit = (l: any) => {
    setEditListing(l);
    setEditForm({ title: l.title, description: l.description, price: String(l.price), condition: l.condition, status: l.status });
  };

  const handleBan = (id: number) => {
    if (!confirm(t("admin.confirmBan"))) return;
    act(`ban-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/ban`);
      toast({ title: "🚫 Itilizatè a sipande avèk siksè." });
    });
  };

  const handleUnban = (id: number) => {
    if (!confirm(t("admin.confirmUnban"))) return;
    act(`unban-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/unban`);
      toast({ title: "✅ Kont itilizatè a debloke avèk siksè." });
    });
  };

  const handleUnflag = (id: number) => {
    if (!confirm(t("admin.confirmUnflag"))) return;
    act(`unflag-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/unflag`);
      toast({ title: t("admin.accountCleared") });
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const key = `del-${deleteTarget.id}`;
    const path = deleteTarget.type === "user" ? `/api/admin/users/${deleteTarget.id}` : undefined;
    setDeleteTarget(null);
    await act(key, async () => {
      if (deleteTarget.type === "user") await adminFetch(path!, "DELETE");
      else removeListing.mutate({ id: deleteTarget.id });
      toast({ title: t("admin.deleted", { type: deleteTarget.type === "user" ? t("admin.tabUsers") : t("admin.tabListings") }) });
    });
  };

  const handleBoost = async () => {
    if (!boostModal) return;
    const days = parseInt(boostDays, 10);
    await act(`boost-${boostModal.id}`, async () => {
      await adminFetch(`/api/admin/listings/${boostModal.id}/boost`, "POST", { days });
      toast({ title: t("admin.listingBoosted", { days }) });
    });
    setBoostModal(null);
  };

  const handleRemoveBoost = async (id: number) => {
    if (!confirm(t("admin.confirmRemoveBoost"))) return;
    await act(`rboost-${id}`, async () => {
      await adminFetch(`/api/admin/listings/${id}/boost`, "DELETE");
      toast({ title: t("admin.boostRemoved") });
    });
  };

  const handleFeature = async (id: number, featured: boolean) => {
    if (!confirm(featured ? t("admin.confirmFeature") : t("admin.confirmUnfeature"))) return;
    await act(`feat-${id}`, async () => {
      await adminFetch(`/api/admin/listings/${id}/feature`, "POST", { featured });
      toast({ title: featured ? t("admin.featured") : t("admin.unfeatured") });
    });
  };

  const handleEditSave = async () => {
    if (!editListing) return;
    await act(`edit-${editListing.id}`, async () => {
      await adminFetch(`/api/admin/listings/${editListing.id}`, "PUT", {
        title: editForm.title, description: editForm.description,
        price: parseFloat(editForm.price), condition: editForm.condition, status: editForm.status,
      });
      toast({ title: t("admin.listingUpdated") });
    });
    setEditListing(null);
  };

  const handleTrustUser = (id: number) => {
    if (!confirm(t("admin.confirmTrust"))) return;
    act(`trust-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/trust`, "POST");
      toast({ title: t("admin.trusted") });
      if (securityUser?.id === id) {
        const data = await adminFetch(`/api/admin/users/${id}/security`, "GET");
        setSecurityData(data);
      }
    });
  };

  const handleUntrustUser = (id: number) => {
    if (!confirm(t("admin.confirmUntrust"))) return;
    act(`untrust-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/untrust`, "POST");
      toast({ title: t("admin.untrusted") });
      if (securityUser?.id === id) {
        const data = await adminFetch(`/api/admin/users/${id}/security`, "GET");
        setSecurityData(data);
      }
    });
  };

  const handleRestrictConfirm = async () => {
    if (!restrictTarget) return;
    const durationDays = restrictDuration === "0" ? null : parseInt(restrictDuration, 10);
    await act(`restrict-${restrictTarget.id}`, async () => {
      await adminFetch(`/api/admin/users/${restrictTarget.id}/restrict`, "POST", {
        reason: restrictReason,
        durationDays,
        notes: restrictNotes || null,
      });
      toast({ title: `${restrictTarget.name} restriksyon an aplike` });
    });
    setRestrictTarget(null);
    setRestrictNotes("");
  };

  const handleUnrestrict = (id: number, name: string) => {
    if (!confirm(t("admin.confirmUnrestrict", { name }))) return;
    act(`unrestrict-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/unrestrict`, "POST");
      toast({ title: `Restriksyon ${name} retire` });
    });
  };

  const handleResetCountryLock = (id: number) => {
    if (!confirm(t("admin.confirmResetCountryLock"))) return;
    act(`reset-country-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/reset-country-lock`, "POST");
      toast({ title: t("admin.countryLockReset") });
    });
  };

  const handleSetCountry = (id: number, country: string) => act(`set-country-${id}`, async () => {
    await adminFetch(`/api/admin/users/${id}/set-country`, "POST", { country });
    toast({ title: t("admin.countrySet", { country }) });
  });

  const getUserRiskLevel = (u: any) => {
    if (u.isTrusted) return "trusted";
    if (u.isBanned) return "high";
    if (u.isFlagged) return "medium";
    return "low";
  };

  const filteredUsers = allUsers.filter((u: any) => {
    if (userCountryFilter !== "all" && u.country !== userCountryFilter) return false;
    if (riskFilter === "high" && getUserRiskLevel(u) !== "high") return false;
    if (riskFilter === "medium" && getUserRiskLevel(u) !== "medium") return false;
    if (riskFilter === "low" && getUserRiskLevel(u) !== "low") return false;
    if (riskFilter === "trusted" && !u.isTrusted) return false;
    if (riskFilter === "flagged" && !u.isFlagged) return false;
    if (userSearch.trim()) {
      const q = userSearch.trim().toLowerCase();
      const nameMatch = (u.name ?? "").toLowerCase().includes(q);
      const emailMatch = (u.email ?? "").toLowerCase().includes(q);
      const phoneMatch = (u.phone ?? "").includes(q);
      if (!nameMatch && !emailMatch && !phoneMatch) return false;
    }
    return true;
  });
  // reset page when filters change
  useEffect(() => { setUsersPage(0); }, [userCountryFilter, riskFilter, userSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  const pagedUsers = filteredUsers.slice(usersPage * ADMIN_PAGE_SIZE, (usersPage + 1) * ADMIN_PAGE_SIZE);
  const filteredListings = listingCountryFilter === "all" ? allListings : allListings.filter((l: any) => l.country === listingCountryFilter);
  useEffect(() => { setListingsPage(0); }, [listingCountryFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  const pagedListings = filteredListings.slice(listingsPage * ADMIN_PAGE_SIZE, (listingsPage + 1) * ADMIN_PAGE_SIZE);
  const filteredBoostedListings = filteredListings.filter((l: any) => l.isBoosted);

  const handleSetRole = async (id: number, role: string, scopeCountry?: string, scopeDepartment?: string, scopeCity?: string) => {
    await act(`role-${id}`, async () => {
      await adminFetch(`/api/admin/users/${id}/set-role`, "POST", { role, scopeCountry, scopeDepartment, scopeCity });
      toast({ title: `Role updated to "${role}"` });
    });
  };

  const loadAdminAudit = async (id: number) => {
    if (adminAuditId === id) { setAdminAuditId(null); setAdminAuditData(null); return; }
    setAdminAuditId(id);
    setAdminAuditData(null);
    setAdminAuditLoading(true);
    try {
      const data = await adminFetch(`/api/admin/users/${id}/admin-audit`, "GET");
      setAdminAuditData(data);
      setAdminAuditTab("actions");
    } finally {
      setAdminAuditLoading(false);
    }
  };

  const handleSetScope = async (adminId: number) => {
    await act(`scope-${adminId}`, async () => {
      const hasMulti = setScopeCountries.length > 1;
      await adminFetch(`/api/admin/users/${adminId}/set-scope`, "POST", {
        scopeCountries: hasMulti ? setScopeCountries : undefined,
        scopeCountry: !hasMulti ? (setScopeCountry || null) : undefined,
        scopeDepartment: setScopeDepartment || null,
        scopeCity: setScopeCity || null,
      });
      const label = setScopeCity || setScopeDepartment || (setScopeCountries.length > 1 ? setScopeCountries.join("+") : setScopeCountry) || "Global";
      toast({ title: `Scope updated to "${label}"` });
      setSetScopeForAdmin(null);
      setSetScopeCountry(""); setSetScopeCountries([]); setSetScopeDepartment(""); setSetScopeCity("");
    });
  };

  const handleVerify = (id: number) => act(`verify-${id}`, async () => {
    await adminFetch(`/api/admin/users/${id}/verify`, "POST", {});
    toast({ title: "User identity verified" });
  });

  const handleUnverify = (id: number) => act(`unverify-${id}`, async () => {
    await adminFetch(`/api/admin/users/${id}/unverify`, "POST", {});
    toast({ title: "Verification removed" });
  });

  const handleResetPassword = async (u: any) => {
    if (!confirm(`Reset password for ${u.name}? They will be notified and you'll receive a temporary password to share securely.`)) return;
    await act(`resetpw-${u.id}`, async () => {
      const r = await adminFetch(`/api/admin/users/${u.id}/reset-password`, "POST", {});
      setResetPwResult({ name: u.name, tempPassword: r.tempPassword });
    });
  };

  // Commission tab state
  const [commissionSettings, setCommissionSettings] = useState<{ rate: number; minRate: number; maxRate: number; newSellerPromoDays: number } | null>(null);
  const [commissionDraft, setCommissionDraft] = useState<number>(0.07);
  const [commissionSummary, setCommissionSummary] = useState<{ totals: { orderCount: number; gmv: number; platformEarnings: number; sellerEarnings: number }; perSeller: Array<{ sellerId: number; sellerName: string; orderCount: number; gmv: number; platformEarnings: number; sellerEarnings: number }> } | null>(null);
  const [commissionSaving, setCommissionSaving] = useState(false);
  // Per-method rates (MonCash / NatCash share the moncash rate; card / Apple Pay / SEPA share the stripe rate)
  const [methodRates, setMethodRates] = useState<{ moncash: number; stripe: number; minRate: number; maxRate: number } | null>(null);
  const [moncashDraft, setMoncashDraft] = useState<number>(0.07);
  const [stripeDraft, setStripeDraft] = useState<number>(0.10);
  const [methodRatesSaving, setMethodRatesSaving] = useState(false);
  // Exchange rate (HTG/USD) + spread
  const [exchangeRateInfo, setExchangeRateInfo] = useState<{ rate: number; spread: number; displayRate: number; dopRate?: number } | null>(null);
  const [exchangeRateDraft, setExchangeRateDraft] = useState<string>("130");
  const [spreadDraft, setSpreadDraft] = useState<string>("2");
  const [dopRateDraft, setDopRateDraft] = useState<string>("59");
  const [exchangeRateSaving, setExchangeRateSaving] = useState(false);
  const [tauxOpen, setTauxOpen] = useState(false);
  const openTaux = async () => {
    setTauxOpen(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/exchange-rate", { headers: { Authorization: `Bearer ${tk}` } });
      if (res.ok) {
        const e = await res.json();
        setExchangeRateInfo(e);
        if (e.rate) setExchangeRateDraft(String(e.rate));
        if (e.spread !== undefined && e.spread !== null) setSpreadDraft(String(e.spread));
        if (e.dopRate) setDopRateDraft(String(e.dopRate));
      }
    } catch { /* noop */ }
  };
  // Buyer fee rate (card payments)
  const [buyerFeeInfo, setBuyerFeeInfo] = useState<{ buyerFeeRate: number; buyerFeePercent: number } | null>(null);
  const [buyerFeeDraft, setBuyerFeeDraft] = useState<number>(0.025);
  const [buyerFeeSaving, setBuyerFeeSaving] = useState(false);

  // ── Platform Fees — super-admin configurable revenue rates ──────────────────
  type PlatformFees = {
    transfer_fee_pct: number;
    recharge_fee_pct: number;
    music_platform_fee_pct: number;
    delivery_platform_fee_pct: number;
    sub_price_standard: number;
    sub_price_premium: number;
    sub_price_vip: number;
    artist_plan_price_usd: number;
  };
  const [platformFees, setPlatformFees] = useState<PlatformFees | null>(null);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesDraft, setFeesDraft] = useState<Partial<Record<keyof PlatformFees, string>>>({});
  const [feesSaving, setFeesSaving] = useState<string | null>(null);

  const loadPlatformFees = async () => {
    setFeesLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const r = await fetch("/api/admin/platform-fees", { headers: { Authorization: `Bearer ${tk}` } });
      if (r.ok) {
        const data = await r.json();
        setPlatformFees(data);
        setFeesDraft({});
      }
    } finally { setFeesLoading(false); }
  };

  const saveFee = async (key: keyof PlatformFees) => {
    const raw = feesDraft[key];
    if (raw === undefined) return;
    const value = parseFloat(raw);
    if (!isFinite(value) || value < 0) { toast({ title: "Valè envalid", variant: "destructive" }); return; }
    setFeesSaving(key);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const r = await fetch("/api/admin/platform-fees", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ key, value }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { toast({ title: "Erè", description: (data as any)?.error || "Eseye ankò", variant: "destructive" }); return; }
      setPlatformFees(prev => prev ? { ...prev, [key]: value } : prev);
      setFeesDraft(prev => { const n = { ...prev }; delete n[key]; return n; });
      toast({ title: `✓ ${key} chanje a ${value}` });
    } finally { setFeesSaving(null); }
  };

  // Platform revenue analytics
  const [platformRevenue, setPlatformRevenue] = useState<{
    period: string;
    summary: {
      totalRevenue: number; rechargeFees: number; activationFees: number;
      totalRechargeRevenue: number; merchantCommission: number;
      boostRevenue: number; subscriptionRevenue: number; transferFees: number; walletFees: number;
      musicRevenue: number; musicCount: number;
      rechargeCount: number; activationCount: number; orderCount: number; gmv: number;
      boostCount: number; subscriptionCount: number; transferFeeCount: number;
    };
    daily: Array<{ date: string; merchantCommission: number; boostRevenue: number; boostCount: number; gmv: number; orderCount: number }>;
  } | null>(null);
  const [revenuePeriod, setRevenuePeriod] = useState<string>("month");
  const [revenueLoading, setRevenueLoading] = useState(false);

  const loadPlatformRevenue = async (period = revenuePeriod) => {
    setRevenueLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const r = await fetch(`/api/admin/platform-revenue?period=${period}`, { headers: { Authorization: `Bearer ${tk}` } });
      if (r.ok) setPlatformRevenue(await r.json());
    } finally { setRevenueLoading(false); }
  };

  const loadCommission = async () => {
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetch("/api/admin/commission/settings", { headers: { Authorization: `Bearer ${tk}` } }),
        fetch("/api/admin/commission/summary", { headers: { Authorization: `Bearer ${tk}` } }),
        fetch("/api/admin/commission/method-rates", { headers: { Authorization: `Bearer ${tk}` } }),
        fetch("/api/admin/exchange-rate", { headers: { Authorization: `Bearer ${tk}` } }),
        fetch("/api/admin/commission/buyer-fee", { headers: { Authorization: `Bearer ${tk}` } }),
      ]);
      if (r1.ok) {
        const s = await r1.json();
        setCommissionSettings(s);
        setCommissionDraft(s.rate);
      }
      if (r2.ok) setCommissionSummary(await r2.json());
      if (r3.ok) {
        const m = await r3.json();
        setMethodRates(m);
        setMoncashDraft(m.moncash);
        setStripeDraft(m.stripe);
      }
      if (r4.ok) {
        const e = await r4.json();
        setExchangeRateInfo(e);
        setExchangeRateDraft(String(e.rate));
        setSpreadDraft(String(e.spread));
        if (e.dopRate) setDopRateDraft(String(e.dopRate));
      }
      if (r5.ok) {
        const b = await r5.json();
        setBuyerFeeInfo(b);
        setBuyerFeeDraft(b.buyerFeeRate);
      }
    } catch { /* noop */ }
  };

  const saveExchangeRate = async () => {
    setExchangeRateSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const r = parseFloat(exchangeRateDraft);
      const s = parseFloat(spreadDraft);
      const d = parseFloat(dopRateDraft);
      if (!isFinite(r) || r <= 0) { toast({ title: "Taux HTG pa valab", variant: "destructive" }); return; }
      if (!isFinite(s) || s < 0)  { toast({ title: "Spread pa valab", variant: "destructive" }); return; }
      if (!isFinite(d) || d <= 0) { toast({ title: "Taux DOP pa valab", variant: "destructive" }); return; }
      const res = await fetch("/api/admin/exchange-rate", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ rate: r, spread: s, dopRate: d }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: "Erè", description: (data as any)?.error || "Eseye ankò", variant: "destructive" }); return; }
      setExchangeRateInfo(data);
      toast({ title: `Taux chanje ✓ HTG: ${r} (+${s} spread=${data.displayRate}) · DOP: ${d}` });
    } finally { setExchangeRateSaving(false); }
  };

  const saveBuyerFee = async () => {
    setBuyerFeeSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/commission/buyer-fee", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ rate: buyerFeeDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: "Erè", description: (data as any)?.error || "Eseye ankò", variant: "destructive" }); return; }
      setBuyerFeeInfo(data);
      toast({ title: `Frè achte (kat) fikse a ${(buyerFeeDraft * 100).toFixed(1)}%` });
    } finally { setBuyerFeeSaving(false); }
  };
  const saveCommission = async () => {
    setCommissionSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/commission/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ rate: commissionDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: "Could not save", description: (data as any)?.error || "Try again", variant: "destructive" }); return; }
      toast({ title: `Default commission set to ${(commissionDraft * 100).toFixed(1)}%` });
      await loadCommission();
    } finally { setCommissionSaving(false); }
  };
  const saveMethodRates = async () => {
    setMethodRatesSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/commission/method-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ moncash: moncashDraft, stripe: stripeDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast({ title: "Could not save", description: (data as any)?.error || "Try again", variant: "destructive" }); return; }
      toast({ title: `Rates saved — MonCash ${(moncashDraft * 100).toFixed(1)}% · Stripe ${(stripeDraft * 100).toFixed(1)}%` });
      await loadCommission();
    } finally { setMethodRatesSaving(false); }
  };

  // ── Payment-provider API config (Stripe / MonCash / NatCash) ─────────
  // Each entry holds:
  //   .saved      -> what the server returned (secrets shown masked, plus *Set flags)
  //   .draft      -> the form values the admin is currently editing
  // We keep them separate so we can detect "dirty" state and disable Save.
  const [providers, setProviders] = useState<Record<string, { saved: any; draft: any }> | null>(null);
  const [providerSaving, setProviderSaving] = useState<string | null>(null);
  const [usdtWalletSaved, setUsdtWalletSaved] = useState("");
  const [usdtWalletDraft, setUsdtWalletDraft] = useState("");
  const [usdtWalletSaving, setUsdtWalletSaving] = useState(false);
  const loadPaymentProviders = async () => {
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/payment-providers", { headers: { Authorization: `Bearer ${tk}` } });
      if (!res.ok) return;
      const data = await res.json();
      const next: Record<string, { saved: any; draft: any }> = {};
      for (const k of Object.keys(data)) {
        // For the form, start secret fields BLANK (so the masked placeholder
        // shows but typing replaces it). Non-secret fields preload from saved.
        const draft: any = { ...data[k] };
        for (const key of Object.keys(draft)) {
          if (key.endsWith("Set")) continue;
          if (typeof draft[key] === "string" && draft[key].startsWith("••••")) draft[key] = "";
        }
        next[k] = { saved: data[k], draft };
      }
      setProviders(next);
    } catch { /* noop */ }
  };
  const saveProvider = async (provider: string) => {
    if (!providers) return;
    setProviderSaving(provider);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const draft = providers[provider].draft;
      // Build the body: only send keys the server accepts.
      // Empty secret strings are dropped — the server treats them as
      // "leave alone" but it's cleaner to just not send them.
      const body: any = {};
      for (const [k, v] of Object.entries(draft)) {
        if (k.endsWith("Set")) continue;
        body[k] = v;
      }
      const res = await fetch(`/api/admin/payment-providers/${provider}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Could not save", description: (data as any)?.error || "Try again", variant: "destructive" });
        return;
      }
      toast({ title: `${provider.charAt(0).toUpperCase() + provider.slice(1)} settings saved` });
      await loadPaymentProviders();
    } finally { setProviderSaving(null); }
  };
  const updateProviderDraft = (provider: string, field: string, value: any) => {
    setProviders((prev) => prev ? { ...prev, [provider]: { ...prev[provider], draft: { ...prev[provider].draft, [field]: value } } } : prev);
  };

  const loadUsdtWallet = async () => {
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/usdt-wallet", { headers: { Authorization: `Bearer ${tk}` } });
      if (!res.ok) return;
      const data = await res.json();
      setUsdtWalletSaved(data.address ?? "");
      setUsdtWalletDraft(data.address ?? "");
    } catch { /* noop */ }
  };

  const saveUsdtWallet = async () => {
    setUsdtWalletSaving(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/usdt-wallet", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ address: usdtWalletDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Could not save", description: (data as any)?.error || "Try again", variant: "destructive" });
        return;
      }
      setUsdtWalletSaved(data.address ?? usdtWalletDraft);
      setUsdtWalletDraft(data.address ?? usdtWalletDraft);
      toast({ title: "USDT wallet address saved" });
    } finally {
      setUsdtWalletSaving(false);
    }
  };

  const loadPayments = async () => {
    try { const data = await adminFetch("/api/admin/payments", "GET"); setPayments(data); }
    catch (e: any) { toast({ title: "Failed to load payments", description: e?.message ?? "", variant: "destructive" }); }
  };

  const loadStripeData = async () => {
    setStripeLoading(true);
    try {
      const [txData, vendorData, commData] = await Promise.all([
        adminFetch("/api/admin/stripe/transactions", "GET"),
        adminFetch("/api/admin/stripe/vendors", "GET"),
        adminFetch("/api/admin/stripe/commission", "GET"),
      ]);
      setStripeTransactions(txData.transactions ?? []);
      setStripeVendors(vendorData.vendors ?? []);
      const pct = commData.commissionPercent ?? 8;
      setStripeCommission(pct);
      setStripeCommissionInput(String(pct));
    } catch (e: any) {
      toast({ title: "Failed to load Stripe data", description: e?.message ?? "", variant: "destructive" });
    } finally {
      setStripeLoading(false);
    }
  };

  const saveStripeCommission = async () => {
    const pct = parseFloat(stripeCommissionInput);
    if (isNaN(pct) || pct < 0 || pct > 50) {
      toast({ title: "Invalid commission", description: "Must be between 0 and 50", variant: "destructive" });
      return;
    }
    try {
      await adminFetch("/api/admin/stripe/commission", "POST", { commissionPercent: pct });
      setStripeCommission(pct);
      toast({ title: "Stripe commission updated", description: `Set to ${pct}%` });
    } catch (e: any) {
      toast({ title: "Failed to update commission", description: e?.message ?? "", variant: "destructive" });
    }
  };

  const handleMarkVerified = (id: number) => act(`mverify-${id}`, async () => {
    await adminFetch(`/api/admin/payments/${id}/mark-verified`, "POST", {});
    toast({ title: "Payment marked verified" });
    await loadPayments();
  });

  const handleRefund = async () => {
    if (!refundTarget) return;
    const id = refundTarget.id;
    const reason = refundReason;
    setRefundTarget(null); setRefundReason("");
    await act(`refund-${id}`, async () => {
      await adminFetch(`/api/admin/payments/${id}/refund`, "POST", { reason });
      toast({ title: "Refund issued" });
      await loadPayments();
    });
  };

  const filteredPayments = payments.filter(p => {
    if (paymentsFilter === "all") return true;
    if (paymentsFilter === "suspicious") return p.isSuspicious;
    return p.status === paymentsFilter;
  });

  const handleAddAdmin = async () => {
    await act("add-admin", async () => {
      const isMulti = addAdminScopeType === "multi-country";
      const result = await adminFetch("/api/admin/users/add-admin-by-email", "POST", {
        email: addAdminEmail,
        role: addAdminRole,
        scopeCountries: isMulti && addAdminScopeCountries.length > 0 ? addAdminScopeCountries : undefined,
        scopeCountry: !isMulti ? (addAdminScopeCountry || null) : undefined,
        scopeDepartment: addAdminScopeDepartment || null,
        scopeCity: addAdminScopeCity || null,
      });
      toast({ title: t("adminManage.addByEmailToast", { name: result.name, role: addAdminRole === "superadmin" ? t("adminManage.superAdmin") : addAdminRole }) });
      setAddAdminEmail("");
    });
  };

  // Fetch loan status whenever a user is selected in the promotion picker
  useEffect(() => {
    if (!adminPickerUserId) { setPickerLoanStatus(null); return; }
    setPickerLoanLoading(true);
    adminFetch(`/api/admin/users/${adminPickerUserId}/loan-status`, "GET")
      .then((d: any) => setPickerLoanStatus(d))
      .catch(() => setPickerLoanStatus(null))
      .finally(() => setPickerLoanLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminPickerUserId]);

  const handlePromoteUser = async () => {
    if (!adminPickerUserId) return;
    if (pickerLoanStatus?.blocked && addAdminRole !== "user") {
      toast({ title: "Promotion blokée — Prè Aktif", description: "Itilizatè sa a gen yon prè aktif. Fòk li fin peye anvan li ka vin admin.", variant: "destructive" });
      return;
    }
    await act("add-admin", async () => {
      const isMulti = addAdminScopeType === "multi-country";
      await adminFetch(`/api/admin/users/${adminPickerUserId}/set-role`, "POST", {
        role: addAdminRole,
        scopeCountries: isMulti && addAdminScopeCountries.length > 0 ? addAdminScopeCountries : undefined,
        scopeCountry: !isMulti ? (addAdminScopeCountry || null) : undefined,
        scopeDepartment: addAdminScopeDepartment || null,
        scopeCity: addAdminScopeCity || null,
      });
      const u = allUsers.find((x: any) => x.id === adminPickerUserId);
      toast({ title: t("adminManage.promoteToast", { name: u?.name ?? "User", role: addAdminRole === "superadmin" ? t("adminManage.superAdmin") : addAdminRole }) });
      setAdminPickerUserId(null);
      setAdminPickerSearch("");
      setPickerLoanStatus(null);
    });
  };

  const handleSendPasswordNudge = async () => {
    setSendingNudge(true);
    try {
      const result = await adminFetch("/api/admin/notify-legacy-password-users", "POST", {});
      toast({
        title: "Emails sent",
        description: result.message ?? `Sent ${result.sent} reminder email(s).`,
      });
      await fetchPwHashStats({ manual: false });
    } catch (e: any) {
      toast({ title: "Failed to send emails", description: e?.message ?? "An error occurred.", variant: "destructive" });
      await fetchPwHashStats({ manual: false });
    } finally {
      setSendingNudge(false);
    }
  };

  const handleResetNudgeCooldown = async () => {
    if (!confirm("Reset the email blast cooldown? This will allow the blast to be sent immediately. This action is recorded in the audit log.")) return;
    setResettingCooldown(true);
    try {
      await adminFetch("/api/admin/reset-nudge-cooldown", "POST", {});
      toast({ title: "Cooldown reset", description: "The email blast can now be sent immediately." });
      await fetchPwHashStats({ manual: false });
    } catch (e: any) {
      toast({ title: "Failed to reset cooldown", description: e?.message ?? "An error occurred.", variant: "destructive" });
    } finally {
      setResettingCooldown(false);
    }
  };

  const handleSaveCooldownDuration = async () => {
    setSavingCooldown(true);
    try {
      await adminFetch("/api/admin/nudge-cooldown-settings", "POST", { hours: cooldownHours });
      cooldownHoursDirty.current = false;
      toast({ title: "Cooldown updated", description: `Email blast cooldown set to ${cooldownHours}h.` });
      await fetchPwHashStats({ manual: false });
    } catch (e: any) {
      toast({ title: "Failed to update cooldown", description: e?.message ?? "An error occurred.", variant: "destructive" });
    } finally {
      setSavingCooldown(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-3 py-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-5">
        <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${isSuperAdmin ? "bg-purple-600" : "bg-primary"}`}>
          {isSuperAdmin ? <Crown className="h-5 w-5 text-white" /> : <Shield className="h-5 w-5 text-white" />}
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-foreground leading-tight">Admin Panel</h1>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            <p className="text-xs text-muted-foreground">{isSuperAdmin ? "Super Admin — full access" : "Admin — limited access"}</p>
            {me?.scopeLevel && !isSuperAdmin && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full
                ${me.scopeCity ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : me.scopeDepartment ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                  : me.scopeCountry ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-secondary text-secondary-foreground"}`}>
                <MapPin className="h-2.5 w-2.5" />
                {me.scopeCity ?? me.scopeDepartment ?? me.scopeCountry ?? "Global"}
                {" · "}{me.scopeLevel}
              </span>
            )}
          </div>
        </div>
        {s?.flaggedUsers > 0 && <Badge variant="destructive" className="ml-auto animate-pulse">{s.flaggedUsers} Flagged</Badge>}
      </div>

      {/* Stats Grid */}
      {s && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
          <StatCard icon={Users} label="Itilizatè" value={s.totalUsers} color="bg-blue-600 text-white shadow-blue-200 dark:shadow-blue-900" bg="bg-blue-50/60 dark:bg-blue-950/20" onClick={() => { loadWalletAdmin(); setShowUsersSheet(true); }} />
          <StatCard icon={Wifi} label="Online Kounye a" value={s.onlineUsers ?? 0} color="bg-green-600 text-white" bg="bg-green-50/60 dark:bg-green-950/20" />
          <StatCard icon={Package} label="Anons Aktif" value={s.activeListings} color="bg-emerald-600 text-white" bg="bg-emerald-50/60 dark:bg-emerald-950/20" onClick={() => setAdminTab("listings")} />
          <StatCard icon={Zap} label="Boosté" value={s.boostedListings ?? 0} color="bg-amber-500 text-white" bg="bg-amber-50/60 dark:bg-amber-950/20" onClick={() => setAdminTab("boosts")} />
          <StatCard icon={Star} label="Featured" value={s.featuredListings ?? 0} color="bg-yellow-500 text-white" bg="bg-yellow-50/60 dark:bg-yellow-950/20" onClick={() => setAdminTab("listings")} />
          <StatCard icon={AlertTriangle} label="Flagged" value={s.flaggedUsers ?? 0} color="bg-orange-600 text-white" bg="bg-orange-50/60 dark:bg-orange-950/20" alert onClick={() => setAdminTab("flagged")} />
          <StatCard icon={Flag} label="Rapò" value={s.pendingReports} color="bg-red-600 text-white" bg="bg-red-50/60 dark:bg-red-950/20" alert onClick={() => setAdminTab("reports")} />
          <StatCard icon={Truck} label="Chofe Atant" value={driverApps.filter((a: any) => a.status === "pending").length} color="bg-orange-500 text-white" bg="bg-orange-50/60 dark:bg-orange-950/20" alert onClick={() => setLocation("/admin/driver-applications")} />
          <StatCard icon={ShieldCheck} label="Anje Atant" value={kycAgentApps.filter((a: any) => a.status === "pending").length} color="bg-violet-600 text-white" bg="bg-violet-50/60 dark:bg-violet-950/20" alert onClick={() => setLocation("/admin/agent-applications")} />
          <StatCard icon={Landmark} label="Prè Atant" value={loanAdminPending} color="bg-emerald-700 text-white" bg="bg-emerald-50/60 dark:bg-emerald-950/20" alert onClick={() => goToTab("loans")} />
          <StatCard icon={Briefcase} label="Anplwayè Atant" value={employerApps.filter((a: any) => a.status === "pending").length} color="bg-teal-600 text-white" bg="bg-teal-50/60 dark:bg-teal-950/20" alert onClick={() => { loadEmployerApps(); setAdminTab("employer-apps"); }} />
          <StatCard icon={Crown} label="Flexa VIP" value={s?.activeSubscriptions ?? 0} color="bg-purple-600 text-white" bg="bg-purple-50/60 dark:bg-purple-950/20" alert={(s?.graceSubscriptions ?? 0) > 0} onClick={() => { loadAdminSubscriptions(); setAdminTab("subscriptions"); }} />
        </div>
      )}

      {/* ── Pending Applications Urgent Banner ── */}
      {(driverApps.filter((a: any) => a.status === "pending").length > 0 || kycAgentApps.filter((a: any) => a.status === "pending").length > 0 || loanAdminPending > 0 || employerApps.filter((a: any) => a.status === "pending").length > 0) && (
        <div className="mb-4 rounded-2xl border-2 border-orange-400 dark:border-orange-600 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 overflow-hidden shadow-sm shadow-orange-100 dark:shadow-orange-900/20">
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white">
            <Bell className="h-3.5 w-3.5 animate-pulse" />
            <span className="text-xs font-black uppercase tracking-widest">{t("adminBanner.title")}</span>
          </div>
          <div className="px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex-1 space-y-1">
              {driverApps.filter((a: any) => a.status === "pending").length > 0 && (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-orange-600 shrink-0" />
                  <span className="text-sm font-bold text-orange-800 dark:text-orange-300">
                    {t("adminBanner.driverPending", { count: driverApps.filter((a: any) => a.status === "pending").length })}
                  </span>
                </div>
              )}
              {kycAgentApps.filter((a: any) => a.status === "pending").length > 0 && (
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-violet-600 shrink-0" />
                  <span className="text-sm font-bold text-violet-800 dark:text-violet-300">
                    {t("adminBanner.agentPending", { count: kycAgentApps.filter((a: any) => a.status === "pending").length })}
                  </span>
                </div>
              )}
              {loanAdminPending > 0 && (
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-emerald-700 shrink-0" />
                  <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300">
                    {loanAdminPending} demand prè annatant
                  </span>
                </div>
              )}
              {employerApps.filter((a: any) => a.status === "pending").length > 0 && (
                <div className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-teal-600 shrink-0" />
                  <span className="text-sm font-bold text-teal-800 dark:text-teal-300">
                    {employerApps.filter((a: any) => a.status === "pending").length} demand anplwayè annatant
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap shrink-0">
              {driverApps.filter((a: any) => a.status === "pending").length > 0 && (
                <button
                  type="button"
                  onClick={() => setLocation("/admin/driver-applications")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-black transition-all shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Truck className="h-3.5 w-3.5" />
                  {t("adminBanner.reviewDriver")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              {kycAgentApps.filter((a: any) => a.status === "pending").length > 0 && (
                <button
                  type="button"
                  onClick={() => setLocation("/admin/agent-applications")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black transition-all shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("adminBanner.reviewAgent")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              {loanAdminPending > 0 && (
                <button
                  type="button"
                  onClick={() => goToTab("loans")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black transition-all shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Landmark className="h-3.5 w-3.5" />
                  Revize Prè
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
              {employerApps.filter((a: any) => a.status === "pending").length > 0 && (
                <button
                  type="button"
                  onClick={() => { loadEmployerApps(); setAdminTab("employer-apps"); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-black transition-all shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  Revize Anplwayè
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Application Management Hub — always visible ── */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Driver Applications */}
        <button
          type="button"
          onClick={() => setLocation("/admin/driver-applications")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 hover:from-orange-100 hover:to-amber-100 dark:hover:from-orange-900/40 dark:hover:to-amber-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center shrink-0 shadow shadow-orange-200 dark:shadow-orange-900/50">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-orange-900 dark:text-orange-100">{t("adminBanner.driverHubTitle")}</p>
              {driverApps.filter((a: any) => a.status === "pending").length > 0 && (
                <span className="bg-orange-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none">
                  {driverApps.filter((a: any) => a.status === "pending").length} {t("adminBanner.hubNewBadge")}
                </span>
              )}
            </div>
            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
              {driverApps.length > 0
                ? t("adminBanner.driverHubSummary", { total: driverApps.length, pending: driverApps.filter((a: any) => a.status === "pending").length })
                : t("adminBanner.driverHubEmpty")}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-orange-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Agent Applications */}
        <button
          type="button"
          onClick={() => setLocation("/admin/agent-applications")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 hover:from-violet-100 hover:to-purple-100 dark:hover:from-violet-900/40 dark:hover:to-purple-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shrink-0 shadow shadow-violet-200 dark:shadow-violet-900/50">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-violet-900 dark:text-violet-100">{t("adminBanner.agentHubTitle")}</p>
              {kycAgentApps.filter((a: any) => a.status === "pending").length > 0 && (
                <span className="bg-violet-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none">
                  {kycAgentApps.filter((a: any) => a.status === "pending").length} {t("adminBanner.hubNewBadge")}
                </span>
              )}
            </div>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
              {kycAgentApps.length > 0
                ? t("adminBanner.agentHubSummary", { total: kycAgentApps.length, pending: kycAgentApps.filter((a: any) => a.status === "pending").length })
                : t("adminBanner.agentHubEmpty")}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-violet-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Loan Applications */}
        <button
          type="button"
          onClick={() => setLocation("/admin/loans")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 hover:from-emerald-100 hover:to-teal-100 dark:hover:from-emerald-900/40 dark:hover:to-teal-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shrink-0 shadow shadow-emerald-200 dark:shadow-emerald-900/50">
            <Landmark className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">{t("adminBanner.loanHubTitle")}</p>
              {loanAdminPending > 0 && (
                <span className="bg-emerald-600 text-white text-[9px] font-black rounded-full px-1.5 py-0.5 leading-none animate-pulse">
                  {loanAdminPending} {t("adminBanner.loanHubNew")}
                </span>
              )}
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
              {loanAdminPending > 0 ? t("adminBanner.loanHubPending", { count: loanAdminPending }) : t("adminBanner.loanHubEmpty")}
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-emerald-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Livrezon — Deliveries hub */}
        <button
          type="button"
          onClick={() => setLocation("/admin/deliveries")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/20 hover:from-blue-100 hover:to-cyan-100 dark:hover:from-blue-900/40 dark:hover:to-cyan-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0 shadow shadow-blue-200 dark:shadow-blue-900/50">
            <Truck className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-blue-900 dark:text-blue-100">{t("adminBanner.deliveriesHubTitle")}</p>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">{t("adminBanner.deliveriesHubDesc")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-blue-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Flexa TV */}
        <button
          type="button"
          onClick={() => setLocation("/admin/tv")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 hover:from-violet-100 hover:to-purple-100 dark:hover:from-violet-900/40 dark:hover:to-purple-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shrink-0 shadow shadow-violet-200 dark:shadow-violet-900/50">
            <Tv className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-violet-900 dark:text-violet-100">📺 Flexa TV</p>
              <span className="text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">LIVE</span>
            </div>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">{t("tv.adminSubtitle")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-violet-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Flexa Music */}
        <button
          type="button"
          onClick={() => setLocation("/admin/music")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-fuchsia-200 dark:border-fuchsia-800 bg-gradient-to-br from-fuchsia-50 to-pink-50 dark:from-fuchsia-950/30 dark:to-pink-950/20 hover:from-fuchsia-100 hover:to-pink-100 dark:hover:from-fuchsia-900/40 dark:hover:to-pink-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-fuchsia-600 to-pink-600 flex items-center justify-center shrink-0 shadow shadow-fuchsia-200 dark:shadow-fuchsia-900/50">
            <Music2 className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-fuchsia-900 dark:text-fuchsia-100">🎵 Flexa Music</p>
            <p className="text-xs text-fuchsia-600 dark:text-fuchsia-400 mt-0.5">{t("adminBanner.musicHubSubtitle")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-fuchsia-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Taux (exchange rates) */}
        {isSuperAdmin && (
        <button
          type="button"
          onClick={openTaux}
          data-testid="button-admin-taux"
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 hover:from-emerald-100 hover:to-teal-100 dark:hover:from-emerald-900/40 dark:hover:to-teal-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shrink-0 shadow shadow-emerald-200 dark:shadow-emerald-900/50">
            <ArrowLeftRight className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">💱 Taux</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">Mete taux ajou — 🇭🇹 Ayiti (HTG) & 🇩🇴 St Domingue (DOP)</p>
          </div>
          <ArrowRight className="h-4 w-4 text-emerald-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
        )}

        <Dialog open={tauxOpen} onOpenChange={setTauxOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ArrowLeftRight className="h-5 w-5 text-emerald-600" /> 💱 Taux Chanj
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 p-3 space-y-2">
                <p className="text-sm font-black">🇭🇹 Ayiti — HTG / USD</p>
                <Label className="text-xs">Taux mache a (HTG pou 1 USD)</Label>
                <Input type="number" inputMode="decimal" value={exchangeRateDraft} onChange={(e) => setExchangeRateDraft(e.target.value)} data-testid="input-taux-htg" />
                <Label className="text-xs">Spread (benefis platfòm)</Label>
                <Input type="number" inputMode="decimal" value={spreadDraft} onChange={(e) => setSpreadDraft(e.target.value)} data-testid="input-taux-spread" />
                <p className="text-xs text-muted-foreground">
                  Afichaj kliyan: <strong>{(parseFloat(exchangeRateDraft || "0") + parseFloat(spreadDraft || "0")) || 0} HTG/USD</strong>
                </p>
              </div>
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 p-3 space-y-2">
                <p className="text-sm font-black">🇩🇴 St Domingue — DOP / USD</p>
                <Label className="text-xs">Taux (DOP pou 1 USD)</Label>
                <Input type="number" inputMode="decimal" value={dopRateDraft} onChange={(e) => setDopRateDraft(e.target.value)} data-testid="input-taux-dop" />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setTauxOpen(false)}>Fèmen</Button>
              <Button onClick={saveExchangeRate} disabled={exchangeRateSaving} className="bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-save-taux">
                {exchangeRateSaving ? "Ap anrejistre…" : "Anrejistre Taux"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Flexa VIP Subscriptions */}
        <button
          type="button"
          onClick={() => setLocation("/admin/vip-subscriptions")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-amber-200 dark:border-amber-800 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20 hover:from-amber-100 hover:to-yellow-100 dark:hover:from-amber-900/40 dark:hover:to-yellow-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shrink-0 shadow shadow-amber-200 dark:shadow-amber-900/50">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-amber-900 dark:text-amber-100">👑 Flexa VIP</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">{t("adminBanner.vipHubSubtitle")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-amber-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Dèt Flex Card */}
        <button
          type="button"
          onClick={() => setLocation("/admin/flex-card")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 hover:from-violet-100 hover:to-purple-100 dark:hover:from-violet-900/40 dark:hover:to-purple-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shrink-0 shadow shadow-violet-200 dark:shadow-violet-900/50">
            <CreditCard className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-violet-900 dark:text-violet-100">💳 {t("adminBanner.flexCardHubTitle")}</p>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">{t("adminBanner.flexCardHubSubtitle")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-violet-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Transactions */}
        <button
          type="button"
          onClick={() => setLocation("/admin/transactions")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/20 hover:from-emerald-100 hover:to-teal-100 dark:hover:from-emerald-900/40 dark:hover:to-teal-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center shrink-0 shadow shadow-emerald-200 dark:shadow-emerald-900/50">
            <ArrowLeftRight className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-emerald-900 dark:text-emerald-100">💳 {t("adminBanner.txHubTitle")}</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{t("adminBanner.txHubSubtitle")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-emerald-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Aksyon Admin — Admin Action Feed */}
        <button
          type="button"
          onClick={() => setLocation("/admin/actions")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-rose-200 dark:border-rose-800 bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/30 dark:to-red-950/20 hover:from-rose-100 hover:to-red-100 dark:hover:from-rose-900/40 dark:hover:to-red-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shrink-0 shadow shadow-rose-200 dark:shadow-rose-900/50">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-rose-900 dark:text-rose-100">{t("adminActions.hubTitle")}</p>
            <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">{t("adminActions.hubSubtitle")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-rose-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Aktivite — User Activity Hub */}
        <button
          type="button"
          onClick={() => setLocation("/admin/activity")}
          className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-cyan-200 dark:border-cyan-800 bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-950/30 dark:to-sky-950/20 hover:from-cyan-100 hover:to-sky-100 dark:hover:from-cyan-900/40 dark:hover:to-sky-900/30 transition-all text-left group shadow-sm hover:shadow-md"
        >
          <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center shrink-0 shadow shadow-cyan-200 dark:shadow-cyan-900/50">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-cyan-900 dark:text-cyan-100">{t("adminActivity.hubTitle")}</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">{t("adminActivity.hubSubtitle")}</p>
          </div>
          <ArrowRight className="h-4 w-4 text-cyan-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>

        {/* Broadcast Email — super admin only */}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setLocation("/admin/broadcast")}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-rose-200 dark:border-rose-800 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-950/30 dark:to-pink-950/20 hover:from-rose-100 hover:to-pink-100 dark:hover:from-rose-900/40 dark:hover:to-pink-900/30 transition-all text-left group shadow-sm hover:shadow-md"
          >
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shrink-0 shadow shadow-rose-200 dark:shadow-rose-900/50">
              <Send className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-rose-900 dark:text-rose-100">📧 Broadcast Email</p>
              <p className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">Voye mesaj pa email tout itilizatè yo</p>
            </div>
            <ArrowRight className="h-4 w-4 text-rose-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Broadcast SMS — super admin only */}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setLocation("/admin/broadcast-sms")}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-sky-200 dark:border-sky-800 bg-gradient-to-br from-sky-50 to-cyan-50 dark:from-sky-950/30 dark:to-cyan-950/20 hover:from-sky-100 hover:to-cyan-100 dark:hover:from-sky-900/40 dark:hover:to-cyan-900/30 transition-all text-left group shadow-sm hover:shadow-md"
          >
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 flex items-center justify-center shrink-0 shadow shadow-sky-200 dark:shadow-sky-900/50">
              <MessageSquare className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-sky-900 dark:text-sky-100">📱 Broadcast SMS</p>
              <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">Voye SMS a tout itilizatè via Twilio</p>
            </div>
            <ArrowRight className="h-4 w-4 text-sky-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

        {/* Push Notifications — super admin only */}
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setLocation("/admin/push-notifications")}
            className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/20 hover:from-orange-100 hover:to-amber-100 dark:hover:from-orange-900/40 dark:hover:to-amber-900/30 transition-all text-left group shadow-sm hover:shadow-md"
          >
            <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center shrink-0 shadow shadow-orange-200 dark:shadow-orange-900/50">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-orange-900 dark:text-orange-100">🔔 Push Notifications</p>
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">Tokens APNs iOS — Estatistik ak tès notifikasyon</p>
            </div>
            <ArrowRight className="h-4 w-4 text-orange-400 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        )}

      </div>

      {/* Super Admin shortcut — Add Admin */}
      {isSuperAdmin && (
        <button
          type="button"
          onClick={() => setAdminTab("admins")}
          className="w-full mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-700 bg-purple-50/60 dark:bg-purple-950/20 hover:bg-purple-100/80 dark:hover:bg-purple-900/30 transition-colors text-left group"
        >
          <div className="h-9 w-9 rounded-xl bg-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-700 transition-colors">
            <Crown className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-purple-800 dark:text-purple-200">{t("adminManage.shortcutTitle")}</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
              {t("adminManage.shortcutDesc", { count: (adminTeam as any[]).length })}
            </p>
          </div>
          <span className="text-purple-500 dark:text-purple-400 text-xs font-semibold shrink-0">{t("adminManage.shortcutLink")}</span>
        </button>
      )}

      {/* ── Multi-country view switcher (super admin OR multi-country scoped admin) ── */}
      {(isSuperAdmin || (scopeCountriesLock && scopeCountriesLock.length > 1)) && (
        <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-gradient-to-r from-blue-50/80 to-indigo-50/60 dark:from-blue-950/30 dark:to-indigo-950/20 px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 shrink-0">
            <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-xs font-bold text-blue-800 dark:text-blue-200">{t("adminBanner.countryViewLabel")}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {(() => {
              // Build switcher options: super admin sees all, multi-country admin sees their countries only
              const allOpts = [
                { code: "all" as const, flag: "🌐", label: "Tout peyi" },
                { code: "HT" as const,  flag: "🇭🇹", label: "Haïti" },
                { code: "DO" as const,  flag: "🇩🇴", label: "Dominikani" },
              ];
              const COUNTRY_TO_CODE: Record<string, "HT" | "DO"> = { Haiti: "HT", "Dominican Republic": "DO" };
              if (!isSuperAdmin && scopeCountriesLock) {
                const allowedCodes = new Set(scopeCountriesLock.map(c => COUNTRY_TO_CODE[c]).filter(Boolean));
                return allOpts.filter(o => o.code === "all" || allowedCodes.has(o.code));
              }
              return allOpts;
            })().map(opt => (
              <button
                key={opt.code}
                type="button"
                onClick={() => applyAdminViewCountry(opt.code)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  adminViewCountry === opt.code
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-white/70 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/50 border border-blue-200 dark:border-blue-700"
                }`}
              >
                <span className="text-base leading-none">{opt.flag}</span>
                {opt.label}
                {adminViewCountry === opt.code && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-white/80 inline-block" />
                )}
              </button>
            ))}
          </div>
          {adminViewCountry !== "all" && (
            <span className="ml-auto text-[10px] text-blue-500 dark:text-blue-400 font-medium shrink-0">
              Filtre aktif · tout done yo filtered
            </span>
          )}
        </div>
      )}

      {/* Password upgrade status card */}
      {pwHashStats !== null && (() => {
        const isInCooldown = pwHashStats.nudgeCooldownEndsAt != null && new Date(pwHashStats.nudgeCooldownEndsAt) > new Date();
        const cooldownEndsLabel = pwHashStats.nudgeCooldownEndsAt
          ? new Date(pwHashStats.nudgeCooldownEndsAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
          : null;
        const lastSentLabel = pwHashStats.lastNudgeSentAt
          ? new Date(pwHashStats.lastNudgeSentAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
          : null;
        const lastCooldownResetLabel = pwHashStats.lastCooldownResetAt
          ? new Date(pwHashStats.lastCooldownResetAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
          : null;
        return (
          <div className="mb-6 rounded-xl border border-border bg-card p-4 flex items-center gap-4 flex-wrap">
            <div className="flex-shrink-0 rounded-lg p-2 bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">Password Security</p>
                <button
                  onClick={() => fetchPwHashStats({ manual: true })}
                  disabled={refreshingPwStats}
                  title="Refresh"
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshingPwStats ? "animate-spin" : ""}`} />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pwHashStats.sha256 === 0
                  ? "All users have been migrated to a secure bcrypt password."
                  : `${pwHashStats.sha256} user${pwHashStats.sha256 === 1 ? "" : "s"} still ${pwHashStats.sha256 === 1 ? "has" : "have"} a legacy SHA-256 password and ${pwHashStats.sha256 === 1 ? "has" : "have"} not yet logged in to trigger an upgrade.`
                }
              </p>
              {lastSentLabel && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Last blast sent: <span className="font-medium">{lastSentLabel}</span>
                  {isInCooldown && cooldownEndsLabel && (
                    <span className="ml-1 text-amber-600 dark:text-amber-400"> · Next allowed after {cooldownEndsLabel}</span>
                  )}
                </p>
              )}
              {pwHashStats.lastCooldownResetBy && lastCooldownResetLabel && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cooldown last reset by <span className="font-medium">{pwHashStats.lastCooldownResetBy}</span> at <span className="font-medium">{lastCooldownResetLabel}</span>
                </p>
              )}
              {isSuperAdmin && (
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-xs text-muted-foreground">Cooldown period:</span>
                  <select
                    value={cooldownHours}
                    onChange={(e) => { cooldownHoursDirty.current = true; setCooldownHours(Number(e.target.value)); }}
                    disabled={savingCooldown}
                    className="text-xs rounded border border-border bg-background px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    {[6, 12, 24, 48, 72].map((h) => (
                      <option key={h} value={h}>{h}h</option>
                    ))}
                  </select>
                  {cooldownHours !== (pwHashStats?.nudgeCooldownHours ?? 24) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-6 px-2 gap-1"
                      onClick={handleSaveCooldownDuration}
                      disabled={savingCooldown}
                    >
                      {savingCooldown ? "Saving…" : "Save"}
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center gap-4 text-center">
              <div>
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{pwHashStats.sha256}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Legacy</p>
              </div>
              <div>
                <p className="text-lg font-bold text-green-600 dark:text-green-400">{pwHashStats.bcrypt}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Upgraded</p>
              </div>
            </div>
            {isSuperAdmin && pwHashStats.eligibleForNudge > 0 && (
              <div className="flex-shrink-0 flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 gap-1.5"
                  onClick={handleSendPasswordNudge}
                  disabled={sendingNudge || isInCooldown || resettingCooldown}
                  title={isInCooldown && cooldownEndsLabel ? `Cooldown active — next blast allowed after ${cooldownEndsLabel}` : undefined}
                >
                  <Send className="h-3.5 w-3.5" />
                  {sendingNudge
                    ? "Sending…"
                    : isInCooldown
                      ? "Cooldown active"
                      : `Send upgrade email${pwHashStats.eligibleForNudge === 1 ? "" : "s"} (${pwHashStats.eligibleForNudge})`}
                </Button>
                {isInCooldown && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs border-red-400 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 gap-1.5"
                    onClick={handleResetNudgeCooldown}
                    disabled={resettingCooldown || sendingNudge}
                    title={`Emergency override: clear the ${pwHashStats.nudgeCooldownHours ?? 24}-hour cooldown so the blast can be sent immediately`}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {resettingCooldown ? "Resetting…" : "Reset cooldown"}
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      <div ref={tabsSectionRef} />
      <Tabs value={adminTab} onValueChange={setAdminTab}>
        <div className="overflow-x-auto pb-1 mb-5">
          <TabsList className="flex w-max gap-1 h-auto p-1">
            <TabsTrigger value="users" className="text-xs">{t("admin.tabUsers")}</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="admins" className="text-xs font-bold text-purple-700 dark:text-purple-400"><Crown className="h-3 w-3 mr-1" />Ekip Admin</TabsTrigger>}
            <TabsTrigger value="orders" className="text-xs font-bold text-blue-700 dark:text-blue-400" data-testid="tab-orders"><Package className="h-3 w-3 mr-1" />Òd</TabsTrigger>
            <TabsTrigger value="flex-card" className="text-xs font-bold text-violet-700 dark:text-violet-400" data-testid="tab-flex-card"><CreditCard className="h-3 w-3 mr-1" />Dèt Flex</TabsTrigger>
            <TabsTrigger value="flagged" className="text-xs relative">
              {t("admin.tabFlagged")} {flaggedUsers.length > 0 && <span className="ml-1 bg-red-500 text-white text-[9px] font-black rounded-full px-1 leading-none">{flaggedUsers.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="banned" className="text-xs">{t("admin.tabBanned")}</TabsTrigger>
            <TabsTrigger value="restricted" className="text-xs">
              {t("admin.tabRestricted")} {allUsers.filter((u: any) => u.isRestricted).length > 0 && <span className="ml-1 bg-amber-500 text-white text-[9px] font-black rounded-full px-1 leading-none">{allUsers.filter((u: any) => u.isRestricted).length}</span>}
            </TabsTrigger>
            <TabsTrigger value="listings" className="text-xs">{t("admin.tabListings")}</TabsTrigger>
            <TabsTrigger value="jobs" className="text-xs" onClick={loadAdminJobs} data-testid="tab-jobs"><Briefcase className="h-3 w-3 mr-1" />Travay</TabsTrigger>
            <TabsTrigger value="moderation" className="text-xs relative" onClick={() => loadModerationQueue()}>
              <ShieldAlert className="h-3 w-3 mr-1" />{t("admin.tabModeration")}
              {moderationQueue.filter((m: any) => m.moderationStatus === "pending").length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[9px] font-black rounded-full px-1 leading-none">
                  {moderationQueue.filter((m: any) => m.moderationStatus === "pending").length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="fraud" className="text-xs font-bold text-red-600 dark:text-red-400" onClick={() => setLocation("/admin/fraud")} data-testid="tab-fraud">
              <Shield className="h-3 w-3 mr-1" />{t("admin.tabFraud")}
            </TabsTrigger>
            <TabsTrigger value="boosts" className="text-xs" onClick={loadBoostRecords}><Zap className="h-3 w-3 mr-1" />{t("admin.tabBoosts")}</TabsTrigger>
            {can("payments") && (
              <TabsTrigger value="payments" className="text-xs" onClick={loadPayments} data-testid="tab-payments"><CreditCard className="h-3 w-3 mr-1" />{t("admin.tabPayments")}</TabsTrigger>
            )}
            {can("payments") && (
              <TabsTrigger value="stripe" className="text-xs" onClick={loadStripeData} data-testid="tab-stripe"><CreditCard className="h-3 w-3 mr-1" />{t("admin.tabStripe")}</TabsTrigger>
            )}
            {isSuperAdmin && (
              <TabsTrigger value="commission" className="text-xs" onClick={loadCommission} data-testid="tab-commission">% Commission</TabsTrigger>
            )}
            {isSuperAdmin && <TabsTrigger value="payment-apis" className="text-xs" onClick={() => { loadPaymentProviders(); loadUsdtWallet(); }} data-testid="tab-payment-apis"><KeyRound className="h-3 w-3 mr-1" />{t("adminBanner.tabPaymentApis")}</TabsTrigger>}
            <TabsTrigger value="reports" className="text-xs">{t("admin.tabReports")}</TabsTrigger>
            {/* Admin Team moved to top — hidden here to avoid duplicate */}
            <TabsTrigger value="support" className="text-xs relative" data-testid="tab-support"><MessageSquare className="h-3 w-3 mr-1" />Sipò{supportUnread > 0 && <Badge className="ml-1 h-4 px-1 text-[9px] bg-red-600 hover:bg-red-600">{supportUnread}</Badge>}</TabsTrigger>
            <TabsTrigger value="adminchat" className="text-xs relative" onClick={loadAdminChatAdmins} data-testid="tab-adminchat"><MessageSquare className="h-3 w-3 mr-1" />{t("admin.tabAdminChat")}{adminChatUnread > 0 && <Badge className="ml-1 h-4 px-1 text-[9px] bg-blue-600 hover:bg-blue-600">{adminChatUnread}</Badge>}</TabsTrigger>
            {can("payments") && (
              <TabsTrigger value="wallet" className="text-xs" onClick={loadWalletAdmin}><Wallet className="h-3 w-3 mr-1" />{t("admin.tabWallet")}</TabsTrigger>
            )}
            {can("payments") && (
              <TabsTrigger value="cashout" className="text-xs" onClick={loadCashout} data-testid="tab-cashout"><ArrowDownCircle className="h-3 w-3 mr-1" />Retrait{cashoutRequests.filter((r: any) => r.status === "pending").length > 0 && <Badge className="ml-1 h-4 px-1 text-[9px] bg-amber-600 hover:bg-amber-600">{cashoutRequests.filter((r: any) => r.status === "pending").length}</Badge>}</TabsTrigger>
            )}
            {can("payments") && (
              <TabsTrigger value="seller-payouts" className="text-xs" onClick={loadSellerPayouts} data-testid="tab-seller-payouts"><Wallet className="h-3 w-3 mr-1" />{t("adminBanner.tabSellerPayouts")}{sellerPayouts.filter((p: any) => p.status === "pending").length > 0 && <Badge className="ml-1 h-4 px-1 text-[9px] bg-orange-600 hover:bg-orange-600">{sellerPayouts.filter((p: any) => p.status === "pending").length}</Badge>}</TabsTrigger>
            )}
            <TabsTrigger value="promo" className="text-xs" onClick={loadPromo} data-testid="tab-promo"><Gift className="h-3 w-3 mr-1" />Promo</TabsTrigger>
            <TabsTrigger value="subscriptions" className="text-xs" onClick={loadAdminSubscriptions} data-testid="tab-subscriptions"><Crown className="h-3 w-3 mr-1" />Abònman</TabsTrigger>
            <TabsTrigger value="transactions-hub" className="text-xs" onClick={loadWalletAdmin} data-testid="tab-transactions-hub"><ArrowLeftRight className="h-3 w-3 mr-1" />{t("adminBanner.txHubTitle")}</TabsTrigger>
            {can("payments") && (
              <TabsTrigger value="agents" className="text-xs" onClick={loadAgents} data-testid="tab-agents"><ShieldCheck className="h-3 w-3 mr-1" />Ajant</TabsTrigger>
            )}
            <TabsTrigger value="chofe-apps" className="text-xs relative" onClick={() => loadDriverApps(driverAppsFilter)} data-testid="tab-chofe-apps">
              <Truck className="h-3 w-3 mr-1" />{t("adminBanner.tabDriverApps")}
              {driverApps.filter((a: any) => a.status === "pending").length > 0 && (
                <span className="ml-1 bg-orange-500 text-white text-[9px] font-black rounded-full px-1 leading-none">{driverApps.filter((a: any) => a.status === "pending").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="loans" className="text-xs relative" data-testid="tab-loans">
              <Landmark className="h-3 w-3 mr-1" />{t("adminBanner.tabLoanApps")}
              {loanAdminPending > 0 && (
                <span className="ml-1 bg-emerald-600 text-white text-[9px] font-black rounded-full px-1 leading-none animate-pulse">{loanAdminPending}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="employer-apps" className="text-xs relative" onClick={() => loadEmployerApps()} data-testid="tab-employer-apps">
              <Briefcase className="h-3 w-3 mr-1" />Anplwayè
              {employerApps.filter((a: any) => a.status === "pending").length > 0 && (
                <span className="ml-1 bg-emerald-500 text-white text-[9px] font-black rounded-full px-1 leading-none">{employerApps.filter((a: any) => a.status === "pending").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="anje-apps" className="text-xs relative" onClick={() => loadKycAgentApps(kycAgentAppsFilter)} data-testid="tab-anje-apps">
              <ShieldCheck className="h-3 w-3 mr-1" />{t("adminBanner.tabAgentApps")}
              {kycAgentApps.filter((a: any) => a.status === "pending").length > 0 && (
                <span className="ml-1 bg-violet-500 text-white text-[9px] font-black rounded-full px-1 leading-none">{kycAgentApps.filter((a: any) => a.status === "pending").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="kyc-identity" className="text-xs relative" onClick={() => loadKycIdApps("pending")} data-testid="tab-kyc-identity">
              <BadgeCheck className="h-3 w-3 mr-1" />KYC
              {kycIdApps.filter((a: any) => a.kyc_status === "pending").length > 0 && (
                <span className="ml-1 bg-blue-500 text-white text-[9px] font-black rounded-full px-1 leading-none">{kycIdApps.filter((a: any) => a.kyc_status === "pending").length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="deliveries" className="text-xs" data-testid="tab-deliveries"><Truck className="h-3 w-3 mr-1" />Livrezon</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="revenue" className="text-xs font-bold text-emerald-700 dark:text-emerald-400" onClick={() => loadPlatformRevenue()} data-testid="tab-revenue"><TrendingUp className="h-3 w-3 mr-1" />Revni</TabsTrigger>}
            {isSuperAdmin && <TabsTrigger value="fees" className="text-xs font-bold text-blue-700 dark:text-blue-400" onClick={loadPlatformFees} data-testid="tab-fees"><DollarSign className="h-3 w-3 mr-1" />Taux & Frè</TabsTrigger>}
            {isSuperAdmin && <TabsTrigger value="views" className="text-xs" onClick={loadViewAnalytics} data-testid="tab-views"><Eye className="h-3 w-3 mr-1" />Vues</TabsTrigger>}
            <TabsTrigger value="logs" className="text-xs" onClick={() => loadLogs(buildLogsParams(logsDateRange, logsDateFrom, logsDateTo))}><Activity className="h-3 w-3 mr-1" />Log</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="audit" className="text-xs font-bold text-red-600 dark:text-red-400" data-testid="tab-audit"><ShieldAlert className="h-3 w-3 mr-1" />Audit Trail</TabsTrigger>}
            <TabsTrigger value="translation" className="text-xs" data-testid="tab-translation"><Globe className="h-3 w-3 mr-1" />Tradiksyon</TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="recharge-cards" className="text-xs" onClick={loadRechargeCards} data-testid="tab-recharge-cards"><CreditCard className="h-3 w-3 mr-1" />Kart Rechaj</TabsTrigger>
            )}
            <TabsTrigger value="bnpl" className="text-xs" onClick={loadBnplAdmin} data-testid="tab-bnpl"><Banknote className="h-3 w-3 mr-1" />BNPL</TabsTrigger>
            {isSuperAdmin && (
              <TabsTrigger value="chargebacks" className="text-xs" onClick={loadChargebacks} data-testid="tab-chargebacks">
                <AlertTriangle className="h-3 w-3 mr-1 text-red-500" />
                Chajbak
                {chargebacks.filter((c: any) => c.status === "open").length > 0 && (
                  <Badge className="ml-1 h-4 px-1 text-[9px] bg-red-600 hover:bg-red-600">{chargebacks.filter((c: any) => c.status === "open").length}</Badge>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="returns" className="text-xs" onClick={() => loadReturns(returnsFilter)} data-testid="tab-returns"><RotateCcw className="h-3 w-3 mr-1" />Retou</TabsTrigger>
            <TabsTrigger value="referrals" className="text-xs font-bold text-amber-600 dark:text-amber-400" data-testid="tab-referrals"><Trophy className="h-3 w-3 mr-1" />Referrals</TabsTrigger>
            {isSuperAdmin && <TabsTrigger value="broadcast" className="text-xs font-bold text-rose-600 dark:text-rose-400" data-testid="tab-broadcast"><Send className="h-3 w-3 mr-1" />Broadcast Email</TabsTrigger>}
            {isSuperAdmin && (
              <TabsTrigger value="veye-kont" className="text-xs font-bold text-red-600 dark:text-red-400" data-testid="tab-veye-kont">
                <ShieldAlert className="h-3 w-3 mr-1" />Veye Kont
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* ── All Users ── */}
        <TabsContent value="users">
          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              className="w-full h-9 rounded-xl border border-input bg-background pl-9 pr-9 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/50 transition-all"
              placeholder={t("adminApps.adminUserSearchPlaceholder")}
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
            />
            {userSearch && (
              <button
                type="button"
                onClick={() => setUserSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            {scopeLock ? (
              <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-green-400 bg-green-50 dark:bg-green-950/30 text-xs font-semibold text-green-700 dark:text-green-400">
                <MapPin className="h-3 w-3" />{COUNTRY_FLAGS[scopeLock]} {scopeLock}
              </span>
            ) : (
              <div className="relative">
                <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "10rem" }} value={userCountryFilter} onChange={e => setUserCountryFilter(e.target.value)}>
                  <option value="all">All Countries</option>
                  {SUPPORTED_COUNTRIES.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
            )}
            <ShieldAlert className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="relative">
              <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "9rem" }} value={riskFilter} onChange={e => setRiskFilter(e.target.value)}>
                <option value="all">All Risk Levels</option>
                <option value="high">🔴 HIGH Risk</option>
                <option value="medium">🟡 MEDIUM Risk</option>
                <option value="low">🟢 LOW Risk</option>
                <option value="trusted">🔵 Trusted</option>
                <option value="flagged">⚠ Flagged</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-secondary/60 text-muted-foreground text-xs">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">User</th>
                  <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Email / Phone</th>
                  <th className="text-left px-4 py-2.5 font-medium">Country</th>
                  <th className="text-left px-4 py-2.5 font-medium">Risk</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedUsers.map((u: any) => {
                  const countryLocked = u.countryChangedAt && !u.isAdmin && !u.isSuperAdmin
                    ? Math.ceil(30 - (Date.now() - new Date(u.countryChangedAt).getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const isLocked = countryLocked > 0;
                  return (
                  <tr key={u.id} className={`border-t border-border hover:bg-accent/50 ${u.isFlagged ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`} data-testid={`admin-user-${u.id}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage src={u.avatar} />
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">{u.name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <button
                            className="font-medium text-foreground hover:text-primary text-sm text-left flex items-center gap-1 group"
                            onClick={() => openWalletDetail(u.id)}
                            title="Wè pòtfèy + tranzaksyon"
                          >
                            {u.name}
                            <Wallet className="h-3 w-3 opacity-0 group-hover:opacity-60 text-primary transition-opacity" />
                          </button>
                          <div className="flex gap-1 flex-wrap mt-0.5">
                            <RoleBadge user={u} />
                            {u.isFlagged && <Badge variant="outline" className="text-[9px] py-0 h-4 border-amber-400 text-amber-600">⚠ Flagged</Badge>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      <p className="text-xs text-muted-foreground font-mono">{u.phone ?? "—"}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{u.country ?? "—"}</span>
                        {isLocked && (
                          <span title={`Country locked — ${countryLocked} day${countryLocked === 1 ? "" : "s"} remaining`} className="inline-flex items-center gap-0.5 text-[9px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 px-1 py-0.5 rounded font-semibold">
                            <Lock className="h-2 w-2" /> {countryLocked}d
                          </span>
                        )}
                      </div>
                      <div className="relative mt-1">
                        <select className="h-6 rounded border border-dashed border-input bg-background pl-1.5 pr-5 appearance-none cursor-pointer text-[10px] focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed" style={{ fontSize: "16px", transform: "scale(0.65)", transformOrigin: "left center", width: "calc(8rem / 0.65)", marginLeft: 0 }} disabled={!!actioning} value="" onChange={e => { if (e.target.value) handleSetCountry(u.id, e.target.value); e.target.value = ""; }}>
                          <option value="">Set country…</option>
                          {SUPPORTED_COUNTRIES.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-1">
                        <RiskBadge user={u} />
                        {u.isTrusted && <span className="text-[9px] text-blue-600 dark:text-blue-400">✓ Admin verified</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      {u.isBanned ? <Badge variant="destructive" className="text-xs">Banned</Badge> : u.isRestricted ? <Badge className="text-xs bg-amber-500 hover:bg-amber-500">Restricted</Badge> : <Badge variant="secondary" className="text-xs">Active</Badge>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-emerald-600" onClick={() => openWalletDetail(u.id)} title="Wè pòtfèy itilizatè a"><Wallet className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => loadActivity(u)} data-testid={`button-activity-${u.id}`} title="Activity"><Eye className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-blue-600" onClick={() => loadSecurity(u)} data-testid={`button-security-${u.id}`} title="Security / IP info"><ShieldAlert className="h-3 w-3" /></Button>
                        {can("bans") && !u.isVerified && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-emerald-600 border-emerald-300" onClick={() => handleVerify(u.id)} disabled={actioning === `verify-${u.id}`} data-testid={`button-verify-user-${u.id}`} title="Verify identity"><BadgeCheck className="h-3 w-3" /></Button>
                        )}
                        {can("bans") && u.isVerified && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => handleUnverify(u.id)} disabled={actioning === `unverify-${u.id}`} data-testid={`button-unverify-user-${u.id}`} title="Remove verification"><BadgeCheck className="h-3 w-3 opacity-50" /></Button>
                        )}
                        {can("resetPasswords") && u.id !== user?.id && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-purple-600 border-purple-300" onClick={() => handleResetPassword(u)} disabled={actioning === `resetpw-${u.id}`} data-testid={`button-reset-password-${u.id}`} title="Reset password"><KeyRound className="h-3 w-3" /></Button>
                        )}
                        {isLocked && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-orange-600 border-orange-300" onClick={() => handleResetCountryLock(u.id)} disabled={actioning === `reset-country-${u.id}`} title="Unlock country change">
                            <Unlock className="h-3 w-3" />
                          </Button>
                        )}
                        {!u.isAdmin && !u.isSuperAdmin && !u.isBanned && !u.isRestricted && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-amber-600 border-amber-300 dark:border-amber-700" onClick={() => setRestrictTarget({ id: u.id, name: u.name })} disabled={!!actioning} title="Restrict user"><ShieldAlert className="h-3 w-3" /></Button>
                        )}
                        {!u.isAdmin && !u.isSuperAdmin && u.isRestricted && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-emerald-600 border-emerald-300" onClick={() => handleUnrestrict(u.id, u.name)} disabled={actioning === `unrestrict-${u.id}`} title="Lift restriction"><RotateCcw className="h-3 w-3" /></Button>
                        )}
                        {!u.isAdmin && !u.isSuperAdmin && !u.isBanned && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-destructive border-destructive/30" onClick={() => handleBan(u.id)} disabled={actioning === `ban-${u.id}`} data-testid={`button-ban-user-${u.id}`} title="Ban user"><Ban className="h-3 w-3" /></Button>
                        )}
                        {u.isBanned && (
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs text-emerald-600 border-emerald-300 dark:border-emerald-700" onClick={() => handleUnban(u.id)} disabled={actioning === `unban-${u.id}`} data-testid={`button-unban-inline-${u.id}`} title="Unban user"><RotateCcw className="h-3 w-3" /></Button>
                        )}
                        {!u.isSuperAdmin && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => setDeleteTarget({ id: u.id, name: u.name, type: "user" })} disabled={actioning === `del-${u.id}`} data-testid={`button-delete-user-${u.id}`}><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          {filteredUsers.length > ADMIN_PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
              <span>Paj {usersPage + 1} / {Math.ceil(filteredUsers.length / ADMIN_PAGE_SIZE)} ({filteredUsers.length} total)</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 px-3 text-xs" disabled={usersPage === 0} onClick={() => setUsersPage(p => p - 1)}>← Prev</Button>
                <Button size="sm" variant="outline" className="h-7 px-3 text-xs" disabled={(usersPage + 1) * ADMIN_PAGE_SIZE >= filteredUsers.length} onClick={() => setUsersPage(p => p + 1)}>Next →</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Flagged ── */}
        <TabsContent value="flagged">
          {flaggedUsers.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="font-semibold">No flagged accounts</p>
              <p className="text-sm text-muted-foreground mt-1">All accounts look clean</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span className="text-amber-800 dark:text-amber-300">Flagged automatically during registration (same device, same IP as existing account, or other suspicious patterns). Review security info, then ban, clear, or delete.</span>
              </div>
              {flaggedUsers.map((u: any) => (
                <div key={u.id} className="bg-card border border-amber-300 dark:border-amber-800 rounded-xl p-4" data-testid={`admin-flagged-${u.id}`}>
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarImage src={u.avatar} /><AvatarFallback className="bg-amber-100 text-amber-700 font-bold">{u.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/profile/${u.id}`}><span className="font-semibold text-foreground hover:text-primary">{u.name}</span></Link>
                        <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">⚠ Suspicious</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{u.email} · {u.phone ?? "no phone"} · {u.country ?? "?"}</p>
                      {u.flagReason && <p className="text-xs text-amber-800 dark:text-amber-300 mt-1.5 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded border border-amber-100 dark:border-amber-900"><strong>Reason:</strong> {u.flagReason}</p>}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-700" onClick={() => loadSecurity(u)} data-testid={`button-security-flagged-${u.id}`}><ShieldAlert className="h-3 w-3 mr-1" />Security</Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleBan(u.id)} disabled={!!actioning} data-testid={`button-ban-flagged-${u.id}`}><Ban className="h-3 w-3 mr-1" />Ban</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs border-green-400 text-green-700 hover:bg-green-50" onClick={() => handleUnflag(u.id)} disabled={!!actioning} data-testid={`button-clear-flagged-${u.id}`}><CheckCircle2 className="h-3 w-3 mr-1" />Clear</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setDeleteTarget({ id: u.id, name: u.name, type: "user" })} disabled={!!actioning} data-testid={`button-delete-flagged-${u.id}`}><Trash2 className="h-3 w-3 mr-1" />Delete</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── Banned ── */}
        <TabsContent value="banned">
          {bannedUsers.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <Shield className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No banned users</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-secondary/60 text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">User</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Contact</th>
                    <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bannedUsers.map((u: any) => (
                    <tr key={u.id} className="border-t border-border hover:bg-accent/50" data-testid={`admin-banned-${u.id}`}>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 opacity-40 flex-shrink-0"><AvatarFallback className="text-xs bg-muted">{u.name[0]}</AvatarFallback></Avatar>
                          <p className="font-medium text-muted-foreground line-through text-sm">{u.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell"><p className="text-xs text-muted-foreground">{u.email}</p><p className="text-xs font-mono text-muted-foreground">{u.phone ?? "—"}</p></td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-300 dark:border-emerald-700" onClick={() => handleUnban(u.id)} disabled={actioning === `unban-${u.id}`} data-testid={`button-unban-${u.id}`} title="Deblokel kont lan"><RotateCcw className="h-3 w-3 mr-1" />Deblokel</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => setDeleteTarget({ id: u.id, name: u.name, type: "user" })} data-testid={`button-delete-banned-${u.id}`}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Restricted ── */}
        <TabsContent value="restricted">
          {allUsers.filter((u: any) => u.isRestricted).length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No restricted users</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[500px]">
                <thead className="bg-secondary/60 text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">User</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Reason</th>
                    <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Expires</th>
                    <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.filter((u: any) => u.isRestricted).map((u: any) => (
                    <tr key={u.id} className="border-t border-border hover:bg-accent/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8 flex-shrink-0"><AvatarFallback className="text-xs bg-amber-100 text-amber-700">{u.name[0]}</AvatarFallback></Avatar>
                          <div>
                            <p className="font-medium text-sm">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{u.restrictionReason ?? "—"}</span>
                      </td>
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <span className="text-xs text-muted-foreground">{u.restrictedUntil ? new Date(u.restrictedUntil).toLocaleDateString() : "Permanent"}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-300" onClick={() => handleUnrestrict(u.id, u.name)} disabled={actioning === `unrestrict-${u.id}`}><RotateCcw className="h-3 w-3 mr-1" />Lift</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Listings ── */}
        <TabsContent value="listings">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Globe className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground font-medium">Filter by country:</span>
            {scopeLock ? (
              <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-green-400 bg-green-50 dark:bg-green-950/30 text-xs font-semibold text-green-700 dark:text-green-400">
                <MapPin className="h-3 w-3" />{COUNTRY_FLAGS[scopeLock]} {scopeLock}
              </span>
            ) : (
              <div className="relative">
                <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "11rem" }} value={listingCountryFilter} onChange={e => setListingCountryFilter(e.target.value)}>
                  <option value="all">All Countries</option>
                  {SUPPORTED_COUNTRIES.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{filteredListings.length} listing{filteredListings.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="bg-card border border-border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-secondary/60 text-muted-foreground text-xs">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Listing</th>
                  <th className="text-left px-4 py-2.5 font-medium">Seller</th>
                  <th className="text-left px-4 py-2.5 font-medium">Price</th>
                  <th className="text-left px-4 py-2.5 font-medium">Country</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedListings.map((l: any) => (
                  <tr key={l.id} className="border-t border-border hover:bg-accent/50" data-testid={`admin-listing-${l.id}`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {l.images?.[0] && <img src={l.images[0]} className="h-8 w-8 rounded object-cover flex-shrink-0" alt="" />}
                        <div>
                          <Link href={`/listings/${l.id}`}><span className="font-medium text-foreground hover:text-primary truncate block max-w-36 text-sm">{l.title}</span></Link>
                          <div className="flex gap-1 mt-0.5">
                            {l.isBoosted && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold">⚡ Boosted</span>}
                            {l.isFeatured && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded font-bold">★ Featured</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.sellerName}</td>
                    <td className="px-4 py-2.5 font-semibold text-sm">${l.price}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{l.country ?? "—"}</td>
                    <td className="px-4 py-2.5"><Badge variant={l.status === "available" ? "secondary" : "destructive"} className="text-xs capitalize">{l.status}</Badge></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(l)} title="Edit"><Edit3 className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openBoost(l)} title="Boost"><Zap className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" className={`h-7 px-2 ${l.isFeatured ? "text-yellow-600" : ""}`} onClick={() => handleFeature(l.id, !l.isFeatured)} title={l.isFeatured ? "Unfeature" : "Feature"} disabled={actioning === `feat-${l.id}`}><Star className="h-3 w-3" /></Button>
                        {l.status !== "removed" && <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive" onClick={() => setDeleteTarget({ id: l.id, name: l.title, type: "listing" })} title="Remove"><Trash2 className="h-3 w-3" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredListings.length > ADMIN_PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted-foreground">
              <span>Paj {listingsPage + 1} / {Math.ceil(filteredListings.length / ADMIN_PAGE_SIZE)} ({filteredListings.length} total)</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" className="h-7 px-3 text-xs" disabled={listingsPage === 0} onClick={() => setListingsPage(p => p - 1)}>← Prev</Button>
                <Button size="sm" variant="outline" className="h-7 px-3 text-xs" disabled={(listingsPage + 1) * ADMIN_PAGE_SIZE >= filteredListings.length} onClick={() => setListingsPage(p => p + 1)}>Next →</Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Jobs (admin can edit / close / delete any job) ── */}
        <TabsContent value="jobs">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <h2 className="text-base font-bold">Travay sou platfòm nan</h2>
            <Badge variant="secondary" className="text-xs">{adminJobs.length}</Badge>
            <div className="ml-auto flex items-center gap-2">
              <Input
                placeholder="Chèche tit..."
                className="h-7 text-xs w-40"
                value={jobsSearch}
                onChange={e => setJobsSearch(e.target.value)}
                onKeyDown={e => e.key === "Enter" && loadAdminJobs()}
                data-testid="input-jobs-search"
              />
              <select
                className="text-xs border rounded px-2 h-7 bg-background"
                value={jobsFilter}
                onChange={e => { setJobsFilter(e.target.value as any); setTimeout(loadAdminJobs, 0); }}
                data-testid="select-jobs-status"
              >
                <option value="all">Tout</option>
                <option value="draft">Draft</option>
                <option value="open">Ouvè</option>
                <option value="claimed">Pran</option>
                <option value="cancelled">Anile</option>
              </select>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadAdminJobs} data-testid="button-refresh-jobs">
                <RotateCcw className="h-3 w-3 mr-1" />Rafrechi
              </Button>
            </div>
          </div>

          {adminJobs.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm" data-testid="jobs-empty">
              Pa gen okenn travay ki koresponn ak filtè a.
            </div>
          ) : (
            <div className="space-y-2">
              {adminJobs.map((j: any) => (
                <div key={j.id} className="bg-card border border-border rounded-xl p-3" data-testid={`admin-job-${j.id}`}>
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      <AvatarImage src={j.posterAvatar ?? ""} />
                      <AvatarFallback className="text-xs">{(j.posterName ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{j.title}</span>
                        <Badge
                          className={`text-[9px] h-4 px-1 ${
                            j.status === "open" ? "bg-green-600 hover:bg-green-600" :
                            j.status === "claimed" ? "bg-blue-600 hover:bg-blue-600" :
                            j.status === "cancelled" ? "bg-gray-500 hover:bg-gray-500" :
                            "bg-amber-500 hover:bg-amber-500"
                          }`}
                        >{j.status}</Badge>
                        {!j.paid && <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-500 text-amber-600">Pa peye</Badge>}
                        {j.budget != null && <span className="text-xs text-muted-foreground">{j.budget} HTG</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{j.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                        <span>Poste: <b>{j.posterName}</b></span>
                        {j.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{j.location}{j.country ? `, ${j.country}` : ""}</span>}
                        {j.claimedByName && <span>Pran pa: <b>{j.claimedByName}</b></span>}
                        <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{new Date(j.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button
                        size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => openEditJob(j)}
                        disabled={jobActioning === j.id}
                        data-testid={`button-edit-job-${j.id}`}
                      ><Edit3 className="h-3 w-3 mr-1" />Edit</Button>
                      {j.status !== "cancelled" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => setJobStatus(j.id, "cancelled")}
                          disabled={jobActioning === j.id}
                          data-testid={`button-cancel-job-${j.id}`}
                        ><Lock className="h-3 w-3 mr-1" />Anile</Button>
                      )}
                      {j.status === "cancelled" && (
                        <Button
                          size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => setJobStatus(j.id, "open")}
                          disabled={jobActioning === j.id}
                          data-testid={`button-reopen-job-${j.id}`}
                        ><Unlock className="h-3 w-3 mr-1" />Relouvri</Button>
                      )}
                      <Button
                        size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                        onClick={() => deleteAdminJob(j.id, j.title)}
                        disabled={jobActioning === j.id}
                        data-testid={`button-delete-job-${j.id}`}
                      ><Trash2 className="h-3 w-3 mr-1" />Efase</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {editJob && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditJob(null)}>
              <div className="w-full max-w-md p-4 space-y-3 bg-card border border-border rounded-xl" onClick={(e: React.MouseEvent) => e.stopPropagation()} data-testid="edit-job-dialog">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Modifye travay #{editJob.id}</h3>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditJob(null)} data-testid="button-close-edit-job"><X className="h-4 w-4" /></Button>
                </div>
                <Input
                  placeholder="Tit"
                  value={editJobForm.title}
                  onChange={e => setEditJobForm(f => ({ ...f, title: e.target.value }))}
                  data-testid="input-edit-job-title"
                />
                <textarea
                  className="w-full text-sm border rounded p-2 min-h-[80px] bg-background"
                  placeholder="Deskripsyon"
                  value={editJobForm.description}
                  onChange={e => setEditJobForm(f => ({ ...f, description: e.target.value }))}
                  data-testid="input-edit-job-description"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number" placeholder="Bidjè"
                    value={editJobForm.budget}
                    onChange={e => setEditJobForm(f => ({ ...f, budget: e.target.value }))}
                    data-testid="input-edit-job-budget"
                  />
                  <Input
                    placeholder="Kote"
                    value={editJobForm.location}
                    onChange={e => setEditJobForm(f => ({ ...f, location: e.target.value }))}
                    data-testid="input-edit-job-location"
                  />
                </div>
                <select
                  className="w-full text-sm border rounded p-2 bg-background"
                  value={editJobForm.status}
                  onChange={e => setEditJobForm(f => ({ ...f, status: e.target.value }))}
                  data-testid="select-edit-job-status"
                >
                  <option value="draft">Draft (poko peye)</option>
                  <option value="open">Ouvè</option>
                  <option value="claimed">Pran</option>
                  <option value="closed">Fèmen</option>
                </select>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setEditJob(null)} data-testid="button-cancel-edit-job">Anile</Button>
                  <Button size="sm" onClick={saveEditJob} disabled={jobActioning === editJob.id} data-testid="button-save-edit-job">Sove</Button>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Moderation Queue ── */}
        <TabsContent value="moderation">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <ShieldAlert className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="relative">
              <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "11rem" }} value={moderationFilter} onChange={e => { setModerationFilter(e.target.value as any); loadModerationQueue(e.target.value); }}>
                <option value="pending">🟡 Pending Review</option>
                <option value="rejected">🔴 Rejected</option>
                <option value="approved">🟢 Approved</option>
                <option value="all">All flagged</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{moderationQueue.length} item{moderationQueue.length !== 1 ? "s" : ""}</span>
          </div>

          {moderationQueue.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
              Nothing here. The queue is clear.
            </div>
          ) : (
            <div className="space-y-3">
              {moderationQueue.map((item: any) => {
                const risk = item.moderationRiskLevel ?? "low";
                const riskColor = risk === "high" ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
                  : risk === "medium" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
                const statusBadge = item.moderationStatus === "rejected" ? "bg-red-600 text-white"
                  : item.moderationStatus === "pending" ? "bg-amber-500 text-white"
                  : "bg-emerald-600 text-white";
                return (
                  <div key={item.id} className="bg-card border border-border rounded-xl p-3 sm:p-4">
                    <div className="flex gap-3">
                      {item.images?.[0] ? (
                        <img src={item.images[0]} alt="" className="w-20 h-20 rounded-lg object-cover flex-shrink-0 border border-border" />
                      ) : (
                        <div className="w-20 h-20 rounded-lg bg-muted flex-shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="min-w-0">
                            <div className="font-bold text-sm truncate">{item.title}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              by {item.sellerName} · {item.country ?? "—"} · {item.location}
                            </div>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <Badge className={`text-[10px] uppercase ${statusBadge}`}>{item.moderationStatus}</Badge>
                            <Badge className={`text-[10px] uppercase ${riskColor}`}>{risk} risk</Badge>
                          </div>
                        </div>

                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {(item.moderationFlags ?? []).map((f: string) => (
                            <span key={f} className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">{f.replace(/_/g, " ")}</span>
                          ))}
                          {typeof item.moderationConfidence === "number" && (
                            <span className="text-[10px] text-muted-foreground">conf {(item.moderationConfidence * 100).toFixed(0)}%</span>
                          )}
                          {item.moderationSource && (
                            <span className="text-[10px] text-muted-foreground">· {item.moderationSource === "ai" ? "AI" : "rules"}</span>
                          )}
                        </div>

                        {item.moderationReason && (
                          <p className="text-xs text-muted-foreground mt-1.5 italic">{item.moderationReason}</p>
                        )}

                        <p className="text-xs text-foreground mt-2 line-clamp-2">{item.description}</p>

                        <div className="mt-3 flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setLocation(`/listings/${item.id}`)}>View</Button>
                          {item.moderationStatus !== "approved" && (
                            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleModerationApprove(item.id)}>
                              Approve & Publish
                            </Button>
                          )}
                          {item.moderationStatus !== "rejected" && (
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleModerationReject(item.id)}>
                              Reject
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── Boosts ── */}
        <TabsContent value="boosts">
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "9rem" }} value={boostPayFilter} onChange={e => setBoostPayFilter(e.target.value)}>
                  <option value="all">All methods</option>
                  <option value="card">💳 Card</option>
                  <option value="usdt">₮ USDT</option>
                  <option value="moncash">📱 MonCash</option>
                  <option value="natcash">💚 NatCash</option>
                  <option value="admin">🛡 Admin</option>
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "9rem" }} value={boostStatusFilter} onChange={e => setBoostStatusFilter(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="paid">✅ Paid</option>
                  <option value="pending">⏳ Pending</option>
                  <option value="pending_review">🔍 Pending Review</option>
                  <option value="rejected">🚫 Rejected</option>
                  <option value="failed">❌ Failed</option>
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
              {scopeLock ? (
                <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-green-400 bg-green-50 dark:bg-green-950/30 text-xs font-semibold text-green-700 dark:text-green-400">
                  <MapPin className="h-3 w-3" />{COUNTRY_FLAGS[scopeLock]} {scopeLock}
                </span>
              ) : (
                <div className="relative">
                  <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "9rem" }} value={boostCountryFilter} onChange={e => setBoostCountryFilter(e.target.value)}>
                    <option value="all">All countries</option>
                    {SUPPORTED_COUNTRIES.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                </div>
              )}
              {(boostPayFilter !== "all" || boostStatusFilter !== "all" || (!scopeLock && boostCountryFilter !== "all")) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs px-2" onClick={() => { setBoostPayFilter("all"); setBoostStatusFilter("all"); if (!scopeLock) setBoostCountryFilter("all"); }}>
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              )}
            </div>

            {/* Boost records */}
            {boostRecords.length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-xl">
                <Zap className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold text-muted-foreground">Click the Boosts tab to load records</p>
              </div>
            ) : filteredBoostRecords.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground text-sm">No boosts match the current filters</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="bg-secondary/60 text-muted-foreground text-xs">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">Listing</th>
                      <th className="text-left px-4 py-2.5 font-medium">Seller</th>
                      <th className="text-left px-4 py-2.5 font-medium">Plan</th>
                      <th className="text-left px-4 py-2.5 font-medium">Payment</th>
                      <th className="text-left px-4 py-2.5 font-medium">Status</th>
                      <th className="text-left px-4 py-2.5 font-medium">Expires</th>
                      <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBoostRecords.map((r: any) => {
                      const payIcon: Record<string, string> = { card: "💳", usdt: "₮", moncash: "📱", natcash: "💚", admin: "🛡" };
                      const statusColor: Record<string, string> = {
                        paid:           "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                        pending:        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                        pending_review: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
                        rejected:       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                        failed:         "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                      };
                      return (
                        <tr key={r.id} className="border-t border-border hover:bg-accent/30" data-testid={`admin-boost-record-${r.id}`}>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              {r.listingImage && <img src={r.listingImage} className="h-8 w-8 rounded object-cover flex-shrink-0" alt="" />}
                              <div>
                                <Link href={`/listings/${r.listingId}`}><p className="font-medium hover:text-primary truncate max-w-[140px]">{r.listingTitle}</p></Link>
                                <p className="text-[10px] text-muted-foreground">{r.listingCountry} · ${r.listingPrice}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{r.sellerName}</td>
                          <td className="px-4 py-2.5">
                            <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">{r.plan}</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1">
                              <span className="text-sm">{payIcon[r.paymentMethod] ?? "?"}</span>
                              <span className="text-xs capitalize font-medium">{r.paymentMethod}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground font-medium">${r.price}</p>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${statusColor[r.paymentStatus] ?? "bg-muted text-muted-foreground"}`}>
                              {r.paymentStatus === "pending_review" ? "🔍 Review" :
                               r.paymentStatus === "paid" ? "✅ Paid" :
                               r.paymentStatus === "rejected" ? "🚫 Rejected" :
                               r.paymentStatus === "failed" ? "❌ Failed" :
                               r.paymentStatus}
                            </span>
                            {r.isExpired && r.paymentStatus === "paid" && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">expired</p>
                            )}
                            {r.paymentRef && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate max-w-[80px]" title={r.paymentRef}>
                                {r.paymentRef}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">
                            {new Date(r.expiresAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-1 flex-wrap">
                              {r.paymentStatus === "pending_review" && (
                                <>
                                  <Button
                                    size="sm"
                                    className="h-6 text-[10px] bg-green-600 hover:bg-green-700 text-white px-2"
                                    onClick={async () => {
                                      try {
                                        await adminFetch(`/api/admin/boosts/${r.id}/approve`, "POST");
                                        toast({ title: `Boost #${r.id} approved — listing is now live` });
                                        await loadBoostRecords();
                                      } catch (e: any) {
                                        toast({ title: "Approve failed", description: e?.message ?? "Request failed", variant: "destructive" });
                                      }
                                    }}
                                    data-testid={`button-approve-boost-${r.id}`}
                                  >
                                    ✓ Approve
                                  </Button>
                                  <Button
                                    size="sm" variant="ghost"
                                    className="h-6 text-[10px] text-destructive hover:text-destructive px-2"
                                    onClick={async () => {
                                      try {
                                        await adminFetch(`/api/admin/boosts/${r.id}/reject`, "POST", { reason: "Payment not verified" });
                                        toast({ title: `Boost #${r.id} rejected` });
                                        await loadBoostRecords();
                                      } catch (e: any) {
                                        toast({ title: "Reject failed", description: e?.message ?? "Request failed", variant: "destructive" });
                                      }
                                    }}
                                    data-testid={`button-reject-boost-${r.id}`}
                                  >
                                    ✕ Reject
                                  </Button>
                                </>
                              )}
                              {r.isBoosted && (
                                <Button
                                  size="sm" variant="ghost"
                                  className="h-6 text-[10px] text-destructive hover:text-destructive px-2"
                                  onClick={() => handleRemoveBoost(r.listingId)}
                                  disabled={actioning === `rboost-${r.listingId}`}
                                  data-testid={`button-remove-boost-${r.listingId}`}
                                >
                                  <X className="h-3 w-3 mr-0.5" />Remove
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Reports ── */}
        {/* ── Payments ── */}
        <TabsContent value="payments">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <div className="relative">
              <select className="h-8 rounded-md border border-input bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "11rem" }} value={paymentsFilter} onChange={e => setPaymentsFilter(e.target.value as any)}>
                <option value="all">All payments</option>
                <option value="suspicious">⚠ Suspicious only</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
                <option value="refunded">Refunded</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <span className="text-xs text-muted-foreground ml-auto">{filteredPayments.length} record{filteredPayments.length !== 1 ? "s" : ""}</span>
          </div>
          {filteredPayments.length === 0 ? (
            <div className="text-center py-16 bg-card border border-border rounded-xl">
              <CreditCard className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="font-semibold">No payment records</p>
              <p className="text-sm text-muted-foreground mt-1">Nothing matches the current filter</p>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-secondary/60 text-muted-foreground text-xs">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">When</th>
                    <th className="text-left px-4 py-2.5 font-medium">User</th>
                    <th className="text-left px-4 py-2.5 font-medium">Type</th>
                    <th className="text-left px-4 py-2.5 font-medium">Amount</th>
                    <th className="text-left px-4 py-2.5 font-medium">Method</th>
                    <th className="text-left px-4 py-2.5 font-medium">Status</th>
                    <th className="text-left px-4 py-2.5 font-medium">Flags</th>
                    <th className="text-right px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPayments.map((p: any) => (
                    <tr key={p.id} className={`border-t border-border hover:bg-accent/50 ${p.isSuspicious ? "bg-amber-50/40 dark:bg-amber-950/10" : ""}`} data-testid={`payment-row-${p.id}`}>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        {p.user ? (
                          <Link href={`/profile/${p.user.id}`}>
                            <span className="font-medium text-foreground hover:text-primary text-sm">{p.user.name}</span>
                          </Link>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                        {p.user?.isBanned && <Badge variant="destructive" className="ml-1 text-[9px] py-0 h-4">Banned</Badge>}
                        {p.user?.isFlagged && !p.user?.isBanned && <Badge variant="outline" className="ml-1 text-[9px] py-0 h-4 border-amber-400 text-amber-600">Flagged</Badge>}
                      </td>
                      <td className="px-4 py-2.5 text-xs"><Badge variant="secondary" className="text-[10px]">{p.type}</Badge></td>
                      <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap">{p.currency} {Number(p.amount).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-xs">{p.paymentMethod ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        {p.status === "completed" && <Badge className="text-[10px] bg-green-600 hover:bg-green-600">Completed</Badge>}
                        {p.status === "pending" && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">Pending</Badge>}
                        {p.status === "failed" && <Badge variant="destructive" className="text-[10px]">Failed</Badge>}
                        {p.status === "refunded" && <Badge variant="outline" className="text-[10px] border-blue-400 text-blue-600">Refunded</Badge>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {(p.suspicionReasons ?? []).map((r: string, i: number) => (
                            <span key={i} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{r}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          {p.status === "pending" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs text-emerald-600 border-emerald-300" onClick={() => handleMarkVerified(p.id)} disabled={actioning === `mverify-${p.id}`} data-testid={`button-mark-verified-${p.id}`}><CheckCircle2 className="h-3 w-3 mr-1" />Verify</Button>
                          )}
                          {can("refunds") && p.status === "completed" && (
                            <Button variant="outline" size="sm" className="h-7 text-xs text-blue-600 border-blue-300" onClick={() => { setRefundTarget(p); setRefundReason(""); }} disabled={actioning === `refund-${p.id}`} data-testid={`button-refund-${p.id}`}><RotateCcw className="h-3 w-3 mr-1" />Refund</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="commission">
          {!isSuperAdmin ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sèlman Super Admin ka wè oswa chanje paramèt komisyon platforman an.</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">403 Forbidden</p>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Settings card */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold mb-1">Default platform commission</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Commission rate frozen on each new sale. Range: {commissionSettings ? `${(commissionSettings.minRate * 100).toFixed(0)}–${(commissionSettings.maxRate * 100).toFixed(0)}%` : "5–8%"}.
                New sellers pay 0% for their first {commissionSettings?.newSellerPromoDays ?? 30} days.
              </p>
              {commissionSettings ? (
                <>
                  <div className="flex items-center gap-4 mb-3">
                    <div className="text-3xl font-extrabold text-primary tabular-nums w-24" data-testid="commission-current-rate">
                      {(commissionDraft * 100).toFixed(1)}%
                    </div>
                    <input
                      type="range"
                      min={Math.round(commissionSettings.minRate * 1000)}
                      max={Math.round(commissionSettings.maxRate * 1000)}
                      step={1}
                      value={Math.round(commissionDraft * 1000)}
                      onChange={e => setCommissionDraft(parseInt(e.target.value, 10) / 1000)}
                      className="flex-1 accent-primary"
                      data-testid="commission-slider"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Current saved: {(commissionSettings.rate * 100).toFixed(1)}%</span>
                    <Button
                      size="sm"
                      onClick={saveCommission}
                      disabled={commissionSaving || Math.round(commissionDraft * 1000) === Math.round(commissionSettings.rate * 1000)}
                      data-testid="button-save-commission"
                    >
                      {commissionSaving ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Loading settings…</p>
              )}
            </div>

            {/* Per-method rates */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold mb-1">Pousantaj pa metòd peman</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Chak metòd peman gen pwòp pousantaj komisyon li. MonCash itilize pousantaj la pou MonCash + NatCash; Stripe itilize l pou kat (Visa, Mastercard), Apple Pay ak SEPA.
                {methodRates && <> Plaj: {(methodRates.minRate * 100).toFixed(0)}–{(methodRates.maxRate * 100).toFixed(0)}%.</>}
              </p>
              {methodRates ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 text-xs font-bold">MC</span>
                        MonCash / NatCash
                      </div>
                      <div className="text-2xl font-extrabold text-primary tabular-nums" data-testid="text-moncash-rate">
                        {(moncashDraft * 100).toFixed(1)}%
                      </div>
                    </div>
                    <input
                      type="range"
                      min={Math.round(methodRates.minRate * 1000)}
                      max={Math.round(methodRates.maxRate * 1000)}
                      step={1}
                      value={Math.round(moncashDraft * 1000)}
                      onChange={e => setMoncashDraft(parseInt(e.target.value, 10) / 1000)}
                      className="w-full accent-primary"
                      data-testid="slider-moncash-rate"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Aktyèlman sove: {(methodRates.moncash * 100).toFixed(1)}%</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold flex items-center gap-2">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded bg-purple-500/15 text-purple-700 dark:text-purple-300 text-xs font-bold">ST</span>
                        Stripe (kat / Apple Pay / SEPA)
                      </div>
                      <div className="text-2xl font-extrabold text-primary tabular-nums" data-testid="text-stripe-rate">
                        {(stripeDraft * 100).toFixed(1)}%
                      </div>
                    </div>
                    <input
                      type="range"
                      min={Math.round(methodRates.minRate * 1000)}
                      max={Math.round(methodRates.maxRate * 1000)}
                      step={1}
                      value={Math.round(stripeDraft * 1000)}
                      onChange={e => setStripeDraft(parseInt(e.target.value, 10) / 1000)}
                      className="w-full accent-primary"
                      data-testid="slider-stripe-rate"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">Aktyèlman sove: {(methodRates.stripe * 100).toFixed(1)}%</p>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={saveMethodRates}
                      disabled={
                        methodRatesSaving ||
                        (Math.round(moncashDraft * 1000) === Math.round(methodRates.moncash * 1000) &&
                         Math.round(stripeDraft * 1000) === Math.round(methodRates.stripe * 1000))
                      }
                      data-testid="button-save-method-rates"
                    >
                      {methodRatesSaving ? "Saving…" : "Save rates"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading method rates…</p>
              )}
            </div>

            {/* Totals */}
            {commissionSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Orders</div>
                  <div className="text-xl font-extrabold mt-1">{commissionSummary.totals.orderCount}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">GMV</div>
                  <div className="text-xl font-extrabold mt-1">${commissionSummary.totals.gmv.toFixed(2)}</div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Platform earnings</div>
                  <div className="text-xl font-extrabold mt-1 text-green-700 dark:text-green-400" data-testid="platform-earnings">
                    ${commissionSummary.totals.platformEarnings.toFixed(2)}
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Paid to sellers</div>
                  <div className="text-xl font-extrabold mt-1">${commissionSummary.totals.sellerEarnings.toFixed(2)}</div>
                </div>
              </div>
            )}

            {/* Per-seller table */}
            {commissionSummary && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h3 className="font-bold text-sm">Earnings by seller</h3>
                </div>
                {commissionSummary.perSeller.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">No sales yet</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-4 py-2">Seller</th>
                        <th className="text-right px-4 py-2">Orders</th>
                        <th className="text-right px-4 py-2">GMV</th>
                        <th className="text-right px-4 py-2">Platform fee</th>
                        <th className="text-right px-4 py-2">Seller paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissionSummary.perSeller.map(s => (
                        <tr key={s.sellerId} className="border-t border-border" data-testid={`seller-row-${s.sellerId}`}>
                          <td className="px-4 py-2 font-medium">{s.sellerName}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{s.orderCount}</td>
                          <td className="px-4 py-2 text-right tabular-nums">${s.gmv.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-green-700 dark:text-green-400">${s.platformEarnings.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">${s.sellerEarnings.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Exchange rate (HTG/USD + spread) ── */}
            {isSuperAdmin && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-bold mb-1">Taux Chanj HTG / USD</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Platfòm ajoute yon <strong>spread</strong> sou taux mache a pou fè benefis sou chanjman deviz. Egzanp: si taux = 130, spread = 2 → afichaj = <strong>132 HTG/USD</strong>.
                  Moun kap achte wè pri HTG konvèti an dola avèk taux afichaj la.
                </p>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Taux mache</div>
                    <div className="text-2xl font-extrabold tabular-nums text-foreground">
                      {exchangeRateInfo?.rate ?? "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">HTG pou $1</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Spread</div>
                    <div className="text-2xl font-extrabold tabular-nums text-amber-500">
                      +{exchangeRateInfo?.spread ?? "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">HTG anplis</div>
                  </div>
                  <div className="bg-primary/10 rounded-lg p-3 text-center">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Taux afichaj</div>
                    <div className="text-2xl font-extrabold tabular-nums text-primary">
                      {exchangeRateInfo?.displayRate ?? "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">= taux + spread</div>
                  </div>
                </div>
                <div className="flex gap-3 items-end flex-wrap">
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs font-semibold block mb-1">Taux HTG/USD</label>
                    <input
                      type="number"
                      value={exchangeRateDraft}
                      onChange={e => setExchangeRateDraft(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                      placeholder="130"
                      min="1"
                      step="1"
                    />
                  </div>
                  <div className="flex-1 min-w-[100px]">
                    <label className="text-xs font-semibold block mb-1">Spread (HTG)</label>
                    <input
                      type="number"
                      value={spreadDraft}
                      onChange={e => setSpreadDraft(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                      placeholder="2"
                      min="0"
                      step="0.5"
                    />
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <label className="text-xs font-semibold block mb-1">Taux DOP/USD 🇩🇴</label>
                    <input
                      type="number"
                      value={dopRateDraft}
                      onChange={e => setDopRateDraft(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                      placeholder="59"
                      min="1"
                      step="0.5"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={saveExchangeRate}
                    disabled={exchangeRateSaving}
                    className="mb-0 shrink-0"
                  >
                    {exchangeRateSaving ? "Saving…" : "Sove tou"}
                  </Button>
                </div>
                {exchangeRateInfo?.dopRate && (
                  <p className="text-xs text-muted-foreground mt-2">
                    DOP aktyèl: <strong className="text-foreground">1 USD = {exchangeRateInfo.dopRate} RD</strong>
                  </p>
                )}
              </div>
            )}

            {/* ── Buyer fee (card payments) ── */}
            {isSuperAdmin && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-bold mb-1">Frè Achte · Kat Kredi/Debi</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Lè yon moun achte avèk <strong>kat kredi/debi (Stripe)</strong>, platfòm chaje achte a frè anplis sou pri atik la.
                  Peman <strong>pòtfèy / promo</strong>: achte egzante, pa gen frè.
                </p>
                <div className="flex items-center gap-6 mb-4">
                  <div>
                    <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Aktyèl</div>
                    <div className="text-3xl font-extrabold text-amber-500 tabular-nums">
                      {buyerFeeInfo ? `${buyerFeeInfo.buyerFeePercent.toFixed(1)}%` : "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">Sou pri achte (kat sèlman)</div>
                  </div>
                  <div className="flex-1">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(buyerFeeDraft * 1000)}
                      onChange={e => setBuyerFeeDraft(parseInt(e.target.value, 10) / 1000)}
                      className="w-full accent-amber-500"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                      <span>0%</span>
                      <span className="font-bold text-amber-500">{(buyerFeeDraft * 100).toFixed(1)}%</span>
                      <span>10%</span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={saveBuyerFee}
                    disabled={buyerFeeSaving || Math.round(buyerFeeDraft * 1000) === Math.round((buyerFeeInfo?.buyerFeeRate ?? 0.025) * 1000)}
                  >
                    {buyerFeeSaving ? "Saving…" : "Sove"}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <div className="font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Kat kredi/debi</div>
                    <div className="text-muted-foreground">Vandè peye 10% · Achte peye {(buyerFeeDraft * 100).toFixed(1)}%</div>
                  </div>
                  <div className="bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 rounded-lg p-3">
                    <div className="font-semibold text-violet-700 dark:text-violet-400 mb-0.5">Pòtfèy / Promo FM</div>
                    <div className="text-muted-foreground">Vandè peye komisyon · Achte <strong>pa gen frè</strong></div>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}
        </TabsContent>

        {/* ─── Platform Revenue Dashboard ─────────────────────────── */}
        <TabsContent value="revenue">
          {!isSuperAdmin ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <Lock className="h-8 w-8 text-red-500" />
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
              <p className="text-sm text-muted-foreground">Sèlman Super Admin</p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Period selector */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-muted-foreground">Peryòd:</span>
                {(["today","week","month","all"] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => { setRevenuePeriod(p); loadPlatformRevenue(p); }}
                    className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${revenuePeriod === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}
                  >
                    {p === "today" ? "Jodi a" : p === "week" ? "7 jou" : p === "month" ? "Mwa sa" : "Tout"}
                  </button>
                ))}
                <button onClick={() => loadPlatformRevenue()} className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`h-3 w-3 ${revenueLoading ? "animate-spin" : ""}`} />
                  Rafraîchi
                </button>
              </div>

              {!platformRevenue ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Summary stat cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {/* Hero total card */}
                    <div className="col-span-2 sm:col-span-3 lg:col-span-4 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/60 to-teal-950/60 p-5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-1">Revni Total FlexaMarket</p>
                        <p className="text-4xl font-black tabular-nums text-emerald-400">${platformRevenue.summary.totalRevenue.toFixed(2)}</p>
                        <p className="text-xs text-emerald-600 mt-1">{revenuePeriod === "today" ? "Jodi a" : revenuePeriod === "week" ? "7 dènye jou" : revenuePeriod === "month" ? "Mwa sa" : "Tout tan"}</p>
                      </div>
                      <TrendingUp className="h-16 w-16 text-emerald-500/20" />
                    </div>
                    {[
                      { icon: Zap, label: "Revni Boost", value: platformRevenue.summary.boostRevenue, sub: `${platformRevenue.summary.boostCount} boost`, color: "text-yellow-500 dark:text-yellow-400", bg: "bg-yellow-950/30 border-yellow-500/20" },
                      { icon: Receipt, label: "Frè Rechaj", value: platformRevenue.summary.rechargeFees, sub: `${platformRevenue.summary.rechargeCount} rechaj`, color: "text-blue-400", bg: "bg-blue-950/30 border-blue-500/20" },
                      { icon: BarChart3, label: "Komisyon Vant", value: platformRevenue.summary.merchantCommission, sub: `${platformRevenue.summary.orderCount} kòmand`, color: "text-orange-400", bg: "bg-orange-950/30 border-orange-500/20" },
                      { icon: Music2, label: "Revni Mizik (20%)", value: platformRevenue.summary.musicRevenue ?? 0, sub: `${platformRevenue.summary.musicCount ?? 0} achte`, color: "text-fuchsia-400", bg: "bg-fuchsia-950/30 border-fuchsia-500/20" },
                      { icon: CreditCard, label: "Abònman Vendè", value: platformRevenue.summary.subscriptionRevenue, sub: `${platformRevenue.summary.subscriptionCount} abò`, color: "text-purple-400", bg: "bg-purple-950/30 border-purple-500/20" },
                      { icon: Banknote, label: "Frè Aktivasyon", value: platformRevenue.summary.activationFees, sub: `${platformRevenue.summary.activationCount} kont`, color: "text-violet-400", bg: "bg-violet-950/30 border-violet-500/20" },
                      { icon: Send, label: "Frè Transfè", value: platformRevenue.summary.transferFees, sub: `${platformRevenue.summary.transferFeeCount} jou`, color: "text-cyan-400", bg: "bg-cyan-950/30 border-cyan-500/20" },
                      { icon: DollarSign, label: "Lòt Frè", value: platformRevenue.summary.walletFees, color: "text-gray-400", bg: "bg-gray-950/30 border-gray-500/20" },
                      { icon: BarChart3, label: "GMV Total", value: platformRevenue.summary.gmv, color: "text-slate-400", bg: "bg-slate-950/30 border-slate-500/20" },
                    ].map(({ icon: Icon, label, value, sub, color, bg }) => (
                      <div key={label} className={`rounded-xl border p-4 ${bg}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className={`h-4 w-4 ${color}`} />
                          <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
                        </div>
                        <div className={`text-2xl font-extrabold tabular-nums ${color}`}>
                          ${value.toFixed(2)}
                        </div>
                        {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
                      </div>
                    ))}
                  </div>

                  {/* Revenue breakdown bar */}
                  {platformRevenue.summary.totalRevenue > 0 && (
                    <div className="bg-card border border-border rounded-xl p-4">
                      <h4 className="text-sm font-semibold mb-3">Distribisyon Revni</h4>
                      <div className="flex h-5 rounded-full overflow-hidden gap-0.5">
                        {[
                          { value: platformRevenue.summary.boostRevenue, color: "bg-yellow-500" },
                          { value: platformRevenue.summary.rechargeFees, color: "bg-blue-500" },
                          { value: platformRevenue.summary.merchantCommission, color: "bg-orange-500" },
                          { value: platformRevenue.summary.musicRevenue ?? 0, color: "bg-fuchsia-500" },
                          { value: platformRevenue.summary.subscriptionRevenue, color: "bg-purple-500" },
                          { value: platformRevenue.summary.activationFees, color: "bg-violet-500" },
                          { value: platformRevenue.summary.transferFees, color: "bg-cyan-500" },
                          { value: platformRevenue.summary.walletFees, color: "bg-gray-500" },
                        ].map((seg, i) => {
                          const pct = platformRevenue.summary.totalRevenue > 0 ? (seg.value / platformRevenue.summary.totalRevenue) * 100 : 0;
                          return pct > 0 ? <div key={i} className={`${seg.color} transition-all`} style={{ width: `${pct}%` }} title={`$${seg.value.toFixed(2)} (${pct.toFixed(1)}%)`} /> : null;
                        })}
                      </div>
                      <div className="flex gap-4 mt-2 flex-wrap">
                        {[
                          { label: "Boost", value: platformRevenue.summary.boostRevenue, color: "bg-yellow-500" },
                          { label: "Frè Rechaj", value: platformRevenue.summary.rechargeFees, color: "bg-blue-500" },
                          { label: "Komisyon Vant", value: platformRevenue.summary.merchantCommission, color: "bg-orange-500" },
                          { label: "Revni Mizik", value: platformRevenue.summary.musicRevenue ?? 0, color: "bg-fuchsia-500" },
                          { label: "Abònman", value: platformRevenue.summary.subscriptionRevenue, color: "bg-purple-500" },
                          { label: "Frè Aktivasyon", value: platformRevenue.summary.activationFees, color: "bg-violet-500" },
                          { label: "Frè Transfè", value: platformRevenue.summary.transferFees, color: "bg-cyan-500" },
                          { label: "Lòt Frè", value: platformRevenue.summary.walletFees, color: "bg-gray-500" },
                        ].filter(s => s.value > 0).map(({ label, value, color }) => (
                          <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <div className={`h-2 w-2 rounded-full ${color}`} />
                            <span>{label}: <strong className="text-foreground">${value.toFixed(2)}</strong></span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Daily breakdown table (last 30 days) */}
                  {platformRevenue.daily.length > 0 && (
                    <div className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <h4 className="font-semibold text-sm">Aktivite jounalye (30 dènye jou)</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Dat</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">GMV</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Komisyon</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Boost</th>
                              <th className="text-right px-4 py-2 font-medium text-muted-foreground">Kòmand</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {platformRevenue.daily.map(row => (
                              <tr key={row.date} className="hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-2 font-mono text-muted-foreground">{row.date}</td>
                                <td className="px-4 py-2 text-right tabular-nums">${row.gmv.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">+${row.merchantCommission.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right tabular-nums text-yellow-600 dark:text-yellow-400 font-semibold">+${row.boostRevenue.toFixed(2)}</td>
                                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{row.orderCount}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-muted/50 border-t-2 border-border">
                            <tr>
                              <td className="px-4 py-2 font-bold">Total</td>
                              <td className="px-4 py-2 text-right font-bold tabular-nums">${platformRevenue.daily.reduce((s, r) => s + r.gmv, 0).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">+${platformRevenue.daily.reduce((s, r) => s + r.merchantCommission, 0).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-bold tabular-nums text-yellow-600 dark:text-yellow-400">+${platformRevenue.daily.reduce((s, r) => s + r.boostRevenue, 0).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right font-bold tabular-nums">{platformRevenue.daily.reduce((s, r) => s + r.orderCount, 0)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}

                  {platformRevenue.daily.length === 0 && platformRevenue.summary.totalRevenue === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                      <BarChart3 className="h-12 w-12 text-muted-foreground/30" />
                      <p className="text-muted-foreground text-sm">Pa gen done revni pou peryòd sa.</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </TabsContent>

        {/* ─── Platform Fees & Rates Dashboard ──────────────────────── */}
        <TabsContent value="fees">
          {!isSuperAdmin ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <Lock className="h-8 w-8 text-red-500" />
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-black">Taux & Frè Platfòm</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Chanjman yo pran efè imedyatman sou nouvo tranzaksyon yo</p>
                </div>
                <button onClick={loadPlatformFees} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                  <RefreshCw className={`h-3 w-3 ${feesLoading ? "animate-spin" : ""}`} />Refresh
                </button>
              </div>

              {!platformFees ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* ── Wallet Fees ── */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30">
                      <h4 className="text-sm font-bold flex items-center gap-2"><Wallet className="h-4 w-4 text-blue-500" />Frè Pòtfèy</h4>
                    </div>
                    <div className="divide-y divide-border">
                      {([
                        { key: "transfer_fee_pct" as const, label: "Frè Transfè P2P", desc: "Platfòm prelevè X% sou chak voye lajan", isPct: true, color: "text-blue-500", defaultVal: 0.05 },
                        { key: "recharge_fee_pct" as const, label: "Frè Rechaj Kont", desc: "Platfòm prelevè X% sou chak rechaj MonCash/Kart", isPct: true, color: "text-cyan-500", defaultVal: 0.02 },
                      ] as const).map(({ key, label, desc, isPct, color, defaultVal }) => {
                        const current = platformFees[key] ?? defaultVal;
                        const draft = feesDraft[key];
                        const isDirty = draft !== undefined;
                        return (
                          <div key={key} className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{label}</p>
                              <p className="text-xs text-muted-foreground">{desc}</p>
                              <p className={`text-lg font-black tabular-nums ${color} mt-1`}>{(current * 100).toFixed(1)}%</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="relative">
                                <Input
                                  type="number" step="0.1" min="0" max="99"
                                  value={draft ?? (current * 100).toFixed(1)}
                                  onChange={e => setFeesDraft(p => ({ ...p, [key]: String(parseFloat(e.target.value) / 100) }))}
                                  className="w-24 text-sm pr-6"
                                  placeholder={(current * 100).toFixed(1)}
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                              </div>
                              <Button size="sm" disabled={!isDirty || feesSaving === key} onClick={() => saveFee(key)} className="text-xs">
                                {feesSaving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sovgade"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Music Fees ── */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30">
                      <h4 className="text-sm font-bold flex items-center gap-2"><Music2 className="h-4 w-4 text-fuchsia-500" />Revni Mizik</h4>
                    </div>
                    <div className="divide-y divide-border">
                      {([
                        { key: "music_platform_fee_pct" as const, label: "Komisyon Platfòm — Vant Chante", desc: "Platfòm prelevè X% sou chak chante ki achte", isPct: true, color: "text-fuchsia-500", defaultVal: 0.20 },
                      ] as const).map(({ key, label, desc, isPct, color, defaultVal }) => {
                        const current = platformFees[key] ?? defaultVal;
                        const draft = feesDraft[key];
                        const isDirty = draft !== undefined;
                        return (
                          <div key={key} className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{label}</p>
                              <p className="text-xs text-muted-foreground">{desc}</p>
                              <p className={`text-lg font-black tabular-nums ${color} mt-1`}>{(current * 100).toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">Artis resevwa: <strong>{(100 - current * 100).toFixed(1)}%</strong></p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="relative">
                                <Input
                                  type="number" step="1" min="0" max="99"
                                  value={draft !== undefined ? (parseFloat(draft) * 100).toFixed(0) : (current * 100).toFixed(0)}
                                  onChange={e => setFeesDraft(p => ({ ...p, [key]: String(parseFloat(e.target.value) / 100) }))}
                                  className="w-24 text-sm pr-6"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                              </div>
                              <Button size="sm" disabled={!isDirty || feesSaving === key} onClick={() => saveFee(key)} className="text-xs">
                                {feesSaving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sovgade"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Delivery Fees ── */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30">
                      <h4 className="text-sm font-bold flex items-center gap-2"><Truck className="h-4 w-4 text-orange-500" />Komisyon Livrezon</h4>
                    </div>
                    <div className="divide-y divide-border">
                      {([
                        { key: "delivery_platform_fee_pct" as const, label: "Komisyon Platfòm — Livrezon", desc: "Platfòm prelevè X% sou chak frè livrezon (chofè resevwa rès la)", isPct: true, color: "text-orange-500", defaultVal: 0.20 },
                      ] as const).map(({ key, label, desc, isPct, color, defaultVal }) => {
                        const current = platformFees[key] ?? defaultVal;
                        const draft = feesDraft[key];
                        const isDirty = draft !== undefined;
                        return (
                          <div key={key} className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{label}</p>
                              <p className="text-xs text-muted-foreground">{desc}</p>
                              <p className={`text-lg font-black tabular-nums ${color} mt-1`}>{(current * 100).toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">Chofè resevwa: <strong>{(100 - current * 100).toFixed(1)}%</strong></p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="relative">
                                <Input
                                  type="number" step="1" min="0" max="99"
                                  value={draft !== undefined ? (parseFloat(draft) * 100).toFixed(0) : (current * 100).toFixed(0)}
                                  onChange={e => setFeesDraft(p => ({ ...p, [key]: String(parseFloat(e.target.value) / 100) }))}
                                  className="w-24 text-sm pr-6"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                              </div>
                              <Button size="sm" disabled={!isDirty || feesSaving === key} onClick={() => saveFee(key)} className="text-xs">
                                {feesSaving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sovgade"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Boost ── */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30">
                      <h4 className="text-sm font-bold flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" />Revni Boost</h4>
                    </div>
                    <div className="px-5 py-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold">Boost Lis yo</p>
                        <p className="text-xs text-muted-foreground">Tout revni boost ale 100% nan platfòm lan</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-yellow-500">100%</p>
                        <p className="text-xs text-muted-foreground">Pa konfigirab (tout platfòm)</p>
                      </div>
                    </div>
                  </div>

                  {/* ── Subscription Prices ── */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-bold flex items-center gap-2"><CreditCard className="h-4 w-4 text-purple-500" />Pri Abònman Vendè</h4>
                        <span className="text-xs text-amber-500 font-medium">⚠️ Afekte pèman FM Wallet sèlman</span>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {([
                        { key: "sub_price_standard" as const, label: "Standard", desc: "1 mwa — pèman via FM Wallet", color: "text-blue-500", defaultVal: 15 },
                        { key: "sub_price_premium" as const, label: "Premium", desc: "1 mwa — pèman via FM Wallet", color: "text-purple-500", defaultVal: 30 },
                        { key: "sub_price_vip" as const, label: "VIP", desc: "1 mwa — pèman via FM Wallet", color: "text-amber-500", defaultVal: 50 },
                      ] as const).map(({ key, label, desc, color, defaultVal }) => {
                        const current = platformFees[key] ?? defaultVal;
                        const draft = feesDraft[key];
                        const isDirty = draft !== undefined;
                        return (
                          <div key={key} className="flex items-center gap-4 px-5 py-4">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold">{label}</p>
                              <p className="text-xs text-muted-foreground">{desc}</p>
                              <p className={`text-lg font-black tabular-nums ${color} mt-1`}>${current.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/mwa</span></p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                                <Input
                                  type="number" step="1" min="1" max="9999"
                                  value={draft ?? current.toFixed(2)}
                                  onChange={e => setFeesDraft(p => ({ ...p, [key]: e.target.value }))}
                                  className="w-24 text-sm pl-5"
                                />
                              </div>
                              <Button size="sm" disabled={!isDirty || feesSaving === key} onClick={() => saveFee(key)} className="text-xs">
                                {feesSaving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sovgade"}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Artist Plan Price ── */}
                  <div className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30">
                      <h4 className="text-sm font-bold flex items-center gap-2"><Music2 className="h-4 w-4 text-fuchsia-500" />Plan Artis</h4>
                    </div>
                    {([
                      { key: "artist_plan_price_usd" as const, label: "Plan Artis Anyèl", desc: "Prix pou artis yo pou up acharje plis chante (pa ane)", color: "text-fuchsia-500", defaultVal: 50 },
                    ] as const).map(({ key, label, desc, color, defaultVal }) => {
                      const current = platformFees[key] ?? defaultVal;
                      const draft = feesDraft[key];
                      const isDirty = draft !== undefined;
                      return (
                        <div key={key} className="flex items-center gap-4 px-5 py-4">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">{label}</p>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                            <p className={`text-lg font-black tabular-nums ${color} mt-1`}>${current.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/an</span></p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                              <Input
                                type="number" step="1" min="1" max="9999"
                                value={draft ?? current.toFixed(2)}
                                onChange={e => setFeesDraft(p => ({ ...p, [key]: e.target.value }))}
                                className="w-24 text-sm pl-5"
                              />
                            </div>
                            <Button size="sm" disabled={!isDirty || feesSaving === key} onClick={() => saveFee(key)} className="text-xs">
                              {feesSaving === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sovgade"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* ── Merchant Commission link ── */}
                  <div className="bg-muted/30 border border-border rounded-xl p-4 flex items-center gap-3">
                    <BarChart3 className="h-5 w-5 text-orange-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Komisyon Vant Machann</p>
                      <p className="text-xs text-muted-foreground">Taux komisyon vant (MonCash, Stripe, Default) — konfigirab nan onglet Komisyon</p>
                    </div>
                    <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={() => document.querySelector<HTMLElement>('[data-testid="tab-commission"]')?.click()}>
                      Wè Komisyon →
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="payment-apis">
          {!isSuperAdmin ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <p className="font-bold text-lg text-foreground">Aksè Refize</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sèlman Super Admin ka wè oswa chanje konfigirasyon API peman yo.</p>
              <span className="text-xs font-mono bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-3 py-1 rounded-full">403 Forbidden</span>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start gap-3">
                <KeyRound className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-bold mb-0.5">Konfigirasyon API peman</p>
                  <p className="text-xs text-muted-foreground">
                    Antre kle API ou pou chak founisè. Kle sekrè yo pa janm parèt aprè ou sove yo — sèlman kat dènye karaktè yo. Pou chanje yon kle, jis tape nouvo a; pou kite l menm jan, kite kanpe a vid.
                  </p>
                </div>
              </div>
            </div>

            {!providers ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
            ) : (
              <>
                {/* ── Stripe ───────────────────────────────── */}
                <ProviderCard
                  title="Stripe"
                  subtitle="Kat kredi entènasyonal · Visa / Mastercard / Amex"
                  provider="stripe"
                  data={providers.stripe}
                  saving={providerSaving === "stripe"}
                  onChange={(f, v) => updateProviderDraft("stripe", f, v)}
                  onSave={() => saveProvider("stripe")}
                  modeOptions={[{ value: "test", label: "Test" }, { value: "live", label: "Live" }]}
                  fields={[
                    { key: "publishableKey", label: "Publishable Key", placeholder: "pk_test_...", secret: false },
                    { key: "secretKey", label: "Secret Key", placeholder: "sk_test_...", secret: true },
                    { key: "webhookSecret", label: "Webhook Secret (opsyonèl)", placeholder: "whsec_...", secret: true },
                  ]}
                />

                {/* ── MonCash ──────────────────────────────── */}
                <ProviderCard
                  title="MonCash"
                  subtitle="Mobile money Digicel Ayiti"
                  provider="moncash"
                  data={providers.moncash}
                  saving={providerSaving === "moncash"}
                  onChange={(f, v) => updateProviderDraft("moncash", f, v)}
                  onSave={() => saveProvider("moncash")}
                  modeOptions={[{ value: "sandbox", label: "Sandbox" }, { value: "live", label: "Live" }]}
                  fields={[
                    { key: "phoneNumber", label: "📱 Nimewo peman (kliyan voye lajan)", placeholder: "+509 3600-3636", secret: false },
                    { key: "clientId", label: "Client ID (API)", placeholder: "Antre Client ID Digicel ou", secret: false },
                    { key: "clientSecret", label: "Client Secret (API)", placeholder: "Antre Client Secret", secret: true },
                    { key: "callbackUrl", label: "Callback URL (opsyonèl)", placeholder: "https://…/api/payments/moncash/callback", secret: false },
                  ]}
                />

                {/* ── NatCash ──────────────────────────────── */}
                <ProviderCard
                  title="NatCash"
                  subtitle="Mobile money Natcom Ayiti"
                  provider="natcash"
                  data={providers.natcash}
                  saving={providerSaving === "natcash"}
                  onChange={(f, v) => updateProviderDraft("natcash", f, v)}
                  onSave={() => saveProvider("natcash")}
                  modeOptions={[{ value: "sandbox", label: "Sandbox" }, { value: "live", label: "Live" }]}
                  fields={[
                    { key: "phoneNumber", label: "📱 Nimewo peman (kliyan voye lajan)", placeholder: "+509 3900-3636", secret: false },
                    { key: "apiBaseUrl", label: "API Base URL", placeholder: "https://api.natcash.ht", secret: false },
                    { key: "merchantNumber", label: "Merchant Number", placeholder: "Nimewo machann ou", secret: false },
                    { key: "merchantPassword", label: "Merchant Password", placeholder: "Modpas machann lan", secret: true },
                  ]}
                />

                {/* ── USDT / TRX Wallet (super admin only) ── */}
                {isSuperAdmin && <div className="bg-card border border-border rounded-xl p-4 space-y-3" data-testid="usdt-wallet-card">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm">₮ USDT (TRC-20) Wallet</p>
                      <p className="text-xs text-muted-foreground">Adrès pòtfèy TRX kliyan voye USDT pou boost / achte</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="usdt-wallet-input" className="text-xs font-medium">Adrès Pòtfèy TRC-20</Label>
                    <div className="flex gap-2">
                      <Input
                        id="usdt-wallet-input"
                        data-testid="usdt-wallet-input"
                        value={usdtWalletDraft}
                        onChange={(e) => setUsdtWalletDraft(e.target.value)}
                        placeholder="T..."
                        className="font-mono text-xs flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={saveUsdtWallet}
                        disabled={usdtWalletSaving || usdtWalletDraft === usdtWalletSaved}
                        data-testid="usdt-wallet-save"
                        className="shrink-0"
                      >
                        {usdtWalletSaving ? "Saving…" : "Save"}
                      </Button>
                    </div>
                    {usdtWalletSaved && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        Kounye a: <span className="font-mono">{usdtWalletSaved}</span>
                      </p>
                    )}
                  </div>
                </div>}
              </>
            )}
          </div>
          )}
        </TabsContent>

        <TabsContent value="reports">
          <div className="space-y-3">
            {((reports as any[]) ?? []).length === 0 ? (
              <div className="text-center py-16 bg-card border border-border rounded-xl"><Flag className="h-10 w-10 text-muted-foreground mx-auto mb-3" /><p className="font-semibold">No reports</p></div>
            ) : ((reports as any[]) ?? []).map((r: any) => (
              <div key={r.id} className="bg-card border border-border rounded-xl p-4" data-testid={`admin-report-${r.id}`}>
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-medium text-sm">Report #{r.id}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">By <strong>{r.reporterName}</strong> · {r.targetType} #{r.targetId}</p>
                    <p className="text-sm mt-1">{r.reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(r.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={r.status === "pending" ? "destructive" : "secondary"} className="capitalize flex-shrink-0 text-xs">{r.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Admin Team (Super Admin only) ── */}
        {isSuperAdmin && (
          <TabsContent value="admins">
            <div className="space-y-5">

              {/* ── Coverage overview ── */}
              <div>
                <h2 className="text-base font-bold flex items-center gap-2 mb-3">
                  <Globe className="h-4 w-4 text-purple-500" /> {t("adminManage.teamCoverage")}
                  <span className="text-xs font-normal text-muted-foreground">— {t("adminManage.clickZoneHint")}</span>
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {/* Global / Super Admin card */}
                  {(() => {
                    const superadmins = (adminTeam as any[]).filter((u: any) => u.isSuperAdmin);
                    const globals = (adminTeam as any[]).filter((u: any) => !u.isSuperAdmin && !u.adminScopeCountry && !u.adminScopeCountries);
                    return (
                      <div className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/40 dark:to-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3">
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xl">🌐</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-200 text-purple-800 dark:bg-purple-800/60 dark:text-purple-200">
                            {superadmins.length + globals.length}
                          </span>
                        </div>
                        <p className="font-bold text-sm text-purple-800 dark:text-purple-200">Global</p>
                        <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-0.5">Tout peyi • Sans limit</p>
                      </div>
                    );
                  })()}
                  {/* Per-country cards */}
                  {scopeOptions.map(opt => {
                    const countryAdmins = (adminTeam as any[]).filter((u: any) => {
                      if (u.isSuperAdmin) return false;
                      if (u.adminScopeCountries) {
                        try { return (JSON.parse(u.adminScopeCountries) as string[]).includes(opt.country); } catch { return false; }
                      }
                      return u.adminScopeCountry === opt.country;
                    });
                    const coveredDepts = [...new Set(countryAdmins.map((u: any) => u.adminScopeDepartment).filter(Boolean))] as string[];
                    const hasAdmins = countryAdmins.length > 0;
                    return (
                      <div key={opt.country} className={`rounded-xl p-3 border ${hasAdmins ? "bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-950/30 dark:to-emerald-950/20 border-teal-200 dark:border-teal-800" : "bg-card border-border"}`}>
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-xl">{hasAdmins ? "🟢" : "⚪"}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${hasAdmins ? "bg-teal-200 text-teal-800 dark:bg-teal-800/60 dark:text-teal-200" : "bg-secondary text-muted-foreground"}`}>
                            {countryAdmins.length}
                          </span>
                        </div>
                        <p className={`font-bold text-sm ${hasAdmins ? "text-teal-800 dark:text-teal-200" : "text-foreground"}`}>{opt.country}</p>
                        {coveredDepts.length > 0 ? (
                          <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5 truncate">{coveredDepts.join(" · ")}</p>
                        ) : hasAdmins ? (
                          <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">Tout depatman</p>
                        ) : (
                          <p className="text-[10px] text-muted-foreground mt-0.5">Pa gen admin</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Add Admin (stepped form) ── */}
              <div className="bg-card border border-purple-200 dark:border-purple-800 rounded-xl p-5 space-y-5">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Crown className="h-4 w-4 text-purple-600" /> {t("adminManage.addNewAdmin")}
                </h3>

                {/* Step 1 — Find user */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("adminManage.step1User")}</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder={t("adminManage.searchPlaceholder")}
                      value={adminPickerSearch}
                      onChange={e => { setAdminPickerSearch(e.target.value); setAdminPickerUserId(null); }}
                      className="pl-9 h-9 text-sm"
                    />
                  </div>
                  {adminPickerSearch.trim().length >= 2 && (() => {
                    const q = adminPickerSearch.trim().toLowerCase();
                    const matches = (allUsers as any[]).filter(u =>
                      !u.isAdmin && !u.isSuperAdmin &&
                      (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
                    ).slice(0, 8);
                    if (matches.length === 0) return <p className="text-xs text-muted-foreground px-1">{t("adminManage.noUserFound")}</p>;
                    return (
                      <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                        {matches.map((u: any) => (
                          <button key={u.id} type="button"
                            onClick={() => { setAdminPickerUserId(u.id); setAdminPickerSearch(`${u.name} (${u.email})`); }}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/60 transition-colors ${adminPickerUserId === u.id ? "bg-purple-50 dark:bg-purple-900/20" : ""}`}>
                            <Avatar className="h-8 w-8 shrink-0"><AvatarImage src={u.avatar} /><AvatarFallback className="text-xs bg-primary text-primary-foreground">{u.name?.[0]}</AvatarFallback></Avatar>
                            <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{u.name}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                            {adminPickerUserId === u.id && <Check className="h-4 w-4 text-purple-600 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Step 2 — Role */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("adminManage.step2Role")}</p>
                  <div className="relative inline-block">
                    <select
                      className="h-9 w-52 rounded-md border border-input bg-background pl-3 pr-8 appearance-none cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      style={{ fontSize: "16px" }}
                      value={addAdminRole}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAddAdminRole(v);
                        if (v === "superadmin") { setAddAdminScopeCountry(""); setAddAdminScopeDepartment(""); setAddAdminScopeCity(""); }
                      }}
                    >
                      <option value="support">🎧 Support</option>
                      <option value="moderator">🛡️ Moderator</option>
                      <option value="admin">⚙️ Admin</option>
                      <option value="superadmin">👑 {t("adminManage.superAdmin")}</option>
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Step 3 — Scope (hidden for superadmin) */}
                {addAdminRole !== "superadmin" && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{t("adminManage.step3Scope")}</p>

                    {/* Visual scope type cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {([
                        { type: "global", icon: "🌐", label: "Global", desc: "Tout peyi", color: "border-purple-300 bg-purple-50 dark:bg-purple-950/30 dark:border-purple-700", activeColor: "border-purple-500 bg-purple-100 dark:bg-purple-900/50 ring-2 ring-purple-400" },
                        { type: "multi-country", icon: "🌍", label: "Multi-Peyi", desc: "2+ peyi", color: "border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-700", activeColor: "border-orange-500 bg-orange-100 dark:bg-orange-900/50 ring-2 ring-orange-400" },
                        { type: "country", icon: "🗺️", label: t("adminManage.scopeCountry"), desc: t("adminManage.scopeCountryDesc"), color: "border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-700", activeColor: "border-green-500 bg-green-100 dark:bg-green-900/50 ring-2 ring-green-400" },
                        { type: "department", icon: "📍", label: t("adminManage.scopeDept"), desc: t("adminManage.scopeDeptDesc"), color: "border-teal-300 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-700", activeColor: "border-teal-500 bg-teal-100 dark:bg-teal-900/50 ring-2 ring-teal-400" },
                        { type: "city", icon: "🏙️", label: t("adminManage.scopeCity"), desc: t("adminManage.scopeCityDesc"), color: "border-blue-300 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-700", activeColor: "border-blue-500 bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-400" },
                      ] as const).map(opt => (
                        <button
                          key={opt.type}
                          type="button"
                          onClick={() => {
                            setAddAdminScopeType(opt.type);
                            setAddAdminScopeCountry("");
                            setAddAdminScopeCountries([]);
                            setAddAdminScopeDepartment("");
                            setAddAdminScopeCity("");
                          }}
                          className={`rounded-xl border-2 p-3 text-center transition-all ${addAdminScopeType === opt.type ? opt.activeColor : opt.color} hover:opacity-90`}
                        >
                          <div className="text-xl mb-1">{opt.icon}</div>
                          <p className="text-xs font-bold">{opt.label}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>

                    {/* Multi-country checkbox grid */}
                    {addAdminScopeType === "multi-country" && (
                      <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl p-3">
                        <p className="text-[10px] font-semibold text-muted-foreground mb-2">Chwazi peyi yo (kapab chwazi plis pase youn)</p>
                        <div className="grid grid-cols-2 gap-2">
                          {SUPPORTED_COUNTRIES.map(c => (
                            <label key={c} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${addAdminScopeCountries.includes(c) ? "bg-orange-100 border-orange-400 dark:bg-orange-900/30 dark:border-orange-600" : "bg-background border-border hover:bg-accent/50"}`}>
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded accent-orange-500"
                                checked={addAdminScopeCountries.includes(c)}
                                onChange={(e) => {
                                  setAddAdminScopeCountries(prev =>
                                    e.target.checked ? [...prev, c] : prev.filter(x => x !== c)
                                  );
                                }}
                              />
                              <span className="text-sm font-medium">{COUNTRY_FLAGS[c]} {c}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Contextual dropdowns — always rendered, hidden via CSS to avoid iOS scroll-on-mount */}
                    <div className="bg-secondary/40 border border-border rounded-xl p-3 space-y-3" style={{ display: (addAdminScopeType === "global" || addAdminScopeType === "multi-country") ? "none" : undefined }}>
                        {/* Country picker — all supported countries */}
                        <div>
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t("adminManage.countryLabel")}</p>
                          <div className="relative">
                            <select
                              className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 appearance-none cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                              style={{ fontSize: "16px" }}
                              value={addAdminScopeCountry || ""}
                              onChange={(e) => {
                                setAddAdminScopeCountry(e.target.value);
                                setAddAdminScopeDepartment("");
                                setAddAdminScopeCity("");
                              }}
                            >
                              <option value="">{t("adminManage.selectCountryOption")}</option>
                              {SUPPORTED_COUNTRIES.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>

                        {/* Department picker — hidden via CSS when not applicable */}
                        {(() => {
                          const showDept = (addAdminScopeType === "department" || addAdminScopeType === "city") && !!addAdminScopeCountry;
                          const opt = scopeOptions.find(o => o.country === addAdminScopeCountry);
                          return (
                            <div style={{ display: showDept && opt ? undefined : "none" }}>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t("adminManage.deptLabel")}</p>
                              <div className="relative">
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 appearance-none cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  style={{ fontSize: "16px" }}
                                  value={addAdminScopeDepartment || ""}
                                  onChange={(e) => {
                                    setAddAdminScopeDepartment(e.target.value);
                                    setAddAdminScopeCity("");
                                  }}
                                >
                                  <option value="">{t("adminManage.selectDeptOption")}</option>
                                  {opt?.departments.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              </div>
                            </div>
                          );
                        })()}

                        {/* City picker — hidden via CSS when not applicable */}
                        {(() => {
                          const opt = scopeOptions.find(o => o.country === addAdminScopeCountry);
                          const cities = opt?.citiesByDept[addAdminScopeDepartment] ?? [];
                          const showCity = addAdminScopeType === "city" && !!addAdminScopeDepartment && cities.length > 0;
                          return (
                            <div style={{ display: showCity ? undefined : "none" }}>
                              <p className="text-[10px] font-semibold text-muted-foreground mb-1">{t("adminManage.cityLabel")}</p>
                              <div className="relative">
                                <select
                                  className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 appearance-none cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                  style={{ fontSize: "16px" }}
                                  value={addAdminScopeCity || ""}
                                  onChange={(e) => setAddAdminScopeCity(e.target.value)}
                                >
                                  <option value="">{t("adminManage.selectCityOption")}</option>
                                  {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                              </div>
                            </div>
                          );
                        })()}

                    </div>

                    {/* Live scope preview pill */}
                    <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                      ${addAdminScopeType === "multi-country" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                        : addAdminScopeCity ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : addAdminScopeDepartment ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                        : addAdminScopeCountry ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"}`}>
                      <MapPin className="h-3 w-3" />
                      {addAdminScopeType === "multi-country" && addAdminScopeCountries.length > 0
                        ? addAdminScopeCountries.map(c => `${COUNTRY_FLAGS[c] ?? ""} ${c}`).join(" + ")
                        : addAdminScopeCity
                        ? `${addAdminScopeCountry} › ${addAdminScopeDepartment} › ${addAdminScopeCity}`
                        : addAdminScopeDepartment
                        ? `${addAdminScopeCountry} › ${addAdminScopeDepartment}`
                        : addAdminScopeCountry
                        ? addAdminScopeCountry
                        : t("adminManage.globalScopeLabel")}
                    </div>
                  </div>
                )}

                {/* ── Financing Eligibility Check ─────────────────────── */}
                {adminPickerUserId && (
                  <div className={`rounded-xl border p-3 space-y-1.5 ${
                    pickerLoanLoading ? "border-border bg-muted/30" :
                    pickerLoanStatus?.blocked ? "border-red-400 bg-red-50 dark:bg-red-950/30" :
                    "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30"
                  }`}>
                    <div className="flex items-center gap-2">
                      {pickerLoanLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : pickerLoanStatus?.blocked ? (
                        <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
                      ) : (
                        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      )}
                      <span className={`text-xs font-bold ${
                        pickerLoanLoading ? "text-muted-foreground" :
                        pickerLoanStatus?.blocked ? "text-red-700 dark:text-red-400" :
                        "text-emerald-700 dark:text-emerald-400"
                      }`}>
                        {pickerLoanLoading ? "Checking financing eligibility…" :
                         pickerLoanStatus?.blocked ? "⛔ Financing Restriction Active" :
                         "✅ Financing Eligibility — Clear"}
                      </span>
                    </div>
                    {!pickerLoanLoading && pickerLoanStatus?.blocked && (
                      <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">
                        This user has an <strong>{pickerLoanStatus.status?.replace(/_/g, " ")}</strong> loan
                        {pickerLoanStatus.amountOwed > 0 && ` with $${pickerLoanStatus.amountOwed.toFixed(2)} remaining`}.
                        Admin promotion is blocked until all financing obligations are fully completed.
                      </p>
                    )}
                  </div>
                )}

                {/* Promote button */}
                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    className="h-9 bg-purple-600 hover:bg-purple-700 text-white font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handlePromoteUser}
                    disabled={!adminPickerUserId || actioning === "add-admin" || (!!pickerLoanStatus?.blocked && addAdminRole !== "user")}
                  >
                    <Crown className="h-3.5 w-3.5 mr-1.5" />
                    {t("adminManage.promoteAs")} {addAdminRole === "superadmin" ? t("adminManage.superAdmin") : addAdminRole === "admin" ? "Admin" : addAdminRole}
                  </Button>
                  {!adminPickerUserId && (
                    <p className="text-xs text-muted-foreground italic">{t("adminManage.selectUser")}</p>
                  )}
                  {adminPickerUserId && pickerLoanStatus?.blocked && addAdminRole !== "user" && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                      <ShieldAlert className="h-3.5 w-3.5" /> Bloke — Prè Aktif
                    </p>
                  )}
                </div>

                {/* Email fallback */}
                <div className="border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> {t("adminManage.addByEmail")}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Input placeholder="user@example.com" value={addAdminEmail} onChange={e => setAddAdminEmail(e.target.value)} className="flex-1 min-w-52 h-9 text-sm" data-testid="input-add-admin-email" />
                    <Button variant="outline" className="h-9" onClick={handleAddAdmin} disabled={!addAdminEmail || actioning === "add-admin"} data-testid="button-add-admin">{t("adminManage.addButton")}</Button>
                  </div>
                </div>
              </div>

              {/* ── Admin team table ── */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-500" /> {t("adminManage.teamTitle")}
                    <Badge variant="secondary" className="text-xs">{(adminTeam as any[]).length}</Badge>
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead className="bg-secondary/60 text-muted-foreground text-xs">
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium">{t("adminManage.tableAdmin")}</th>
                        <th className="text-left px-4 py-2.5 font-medium">{t("adminManage.tableRole")}</th>
                        <th className="text-left px-4 py-2.5 font-medium">{t("adminManage.tableZone")}</th>
                        <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">{t("adminManage.tableEmail")}</th>
                        <th className="text-right px-4 py-2.5 font-medium">{t("adminManage.tableAction")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(adminTeam as any[]).map((u: any) => (
                        <React.Fragment key={u.id}>
                          <tr className="border-t border-border hover:bg-accent/50 transition-colors" data-testid={`admin-team-${u.id}`}>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <Avatar className="h-8 w-8 flex-shrink-0"><AvatarImage src={u.avatar} /><AvatarFallback className="text-xs bg-primary text-primary-foreground">{u.name[0]}</AvatarFallback></Avatar>
                                <div className="flex flex-col gap-0.5 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-medium text-sm truncate">{u.name}</span>
                                    {u.isAdminSuspended && (
                                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800 flex-shrink-0">
                                        ⛔ Bloke
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-bold tracking-widest text-cyan-500 dark:text-cyan-400 font-mono">
                                    ADM-{String(u.id).padStart(4, "0")}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><RoleBadge user={u} /></td>
                            <td className="px-4 py-3">
                              {u.isSuperAdmin ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                  <Crown className="h-2.5 w-2.5" /> Global · Tout peyi
                                </span>
                              ) : (() => {
                                let parsedCountries: string[] = [];
                                if (u.adminScopeCountries) {
                                  try { parsedCountries = JSON.parse(u.adminScopeCountries); } catch {}
                                }
                                if (parsedCountries.length > 1) {
                                  return (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                                      <Globe className="h-2.5 w-2.5" />
                                      {parsedCountries.map(c => `${COUNTRY_FLAGS[c] ?? ""}${c}`).join(" + ")}
                                    </span>
                                  );
                                }
                                return (
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full
                                    ${u.adminScopeCity ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                      : u.adminScopeDepartment ? "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300"
                                      : (u.adminScopeCountry || parsedCountries[0]) ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                                      : "bg-secondary text-secondary-foreground"}`}>
                                    <MapPin className="h-2.5 w-2.5" />
                                    {u.adminScopeCity
                                      ? `${u.adminScopeCountry} › ${u.adminScopeDepartment} › ${u.adminScopeCity}`
                                      : u.adminScopeDepartment
                                      ? `${u.adminScopeCountry} › ${u.adminScopeDepartment}`
                                      : (u.adminScopeCountry ?? parsedCountries[0])
                                      ?? "🌐 Global"}
                                  </span>
                                );
                              })()}
                            </td>
                            <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{u.email}</td>
                            <td className="px-4 py-3 text-right">
                              {u.id !== user?.id ? (
                                <div className="flex items-center justify-end gap-1 flex-wrap">
                                  {!u.isSuperAdmin && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400"
                                      onClick={() => handleSetRole(u.id, "superadmin")} disabled={!!actioning}
                                      data-testid={`button-make-superadmin-${u.id}`}>
                                      <Crown className="h-3 w-3 mr-1" />Promote
                                    </Button>
                                  )}
                                  {u.isSuperAdmin && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs"
                                      onClick={() => handleSetRole(u.id, "admin")} disabled={!!actioning}
                                      data-testid={`button-demote-${u.id}`}>
                                      <ChevronDown className="h-3 w-3 mr-1" />Demote
                                    </Button>
                                  )}
                                  {!u.isSuperAdmin && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs border-teal-300 text-teal-700 dark:border-teal-700 dark:text-teal-400"
                                      onClick={() => {
                                        let parsedC: string[] | null = null;
                                        if (u.adminScopeCountries) { try { parsedC = JSON.parse(u.adminScopeCountries); } catch {} }
                                        setSetScopeForAdmin({ id: u.id, name: u.name, scopeCountry: u.adminScopeCountry, scopeCountries: parsedC, scopeDepartment: u.adminScopeDepartment, scopeCity: u.adminScopeCity });
                                        setSetScopeCountry(u.adminScopeCountry ?? "");
                                        setSetScopeCountries(parsedC ?? []);
                                        setSetScopeDepartment(u.adminScopeDepartment ?? "");
                                        setSetScopeCity(u.adminScopeCity ?? "");
                                      }}
                                      disabled={!!actioning}>
                                      <MapPin className="h-3 w-3 mr-1" />Zòn
                                    </Button>
                                  )}
                                  {/* Super admin can suspend/unsuspend non-super admins */}
                                  {isSuperAdmin && !u.isSuperAdmin && (
                                    u.isAdminSuspended ? (
                                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                                        disabled={adminSuspendActioning === u.id}
                                        onClick={() => handleAdminUnsuspend(u.id)}>
                                        <Check className="h-3 w-3 mr-1" />Leve Blokaj
                                      </Button>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700 dark:border-red-700 dark:text-red-400"
                                        disabled={adminSuspendActioning === u.id}
                                        onClick={() => { setAdminSuspendFormId(adminSuspendFormId === u.id ? null : u.id); setAdminSuspendReason(""); setAdminSuspendDuration("30"); }}>
                                        <X className="h-3 w-3 mr-1" />Bloke Admin
                                      </Button>
                                    )
                                  )}
                                  {isSuperAdmin && !u.isSuperAdmin && (
                                    <Button size="sm" variant="outline"
                                      className="h-7 text-xs border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400"
                                      onClick={() => handleResetPassword(u)}
                                      disabled={actioning === `resetpw-${u.id}`}
                                      title="Reyinisyalize modpas tanporè">
                                      <KeyRound className="h-3 w-3 mr-1" />Modpas
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive"
                                    onClick={() => handleSetRole(u.id, "user")} disabled={!!actioning}
                                    data-testid={`button-remove-admin-${u.id}`}>
                                    <LogOut className="h-3 w-3 mr-1" />Retire
                                  </Button>
                                  {can("adminTeam") && (
                                    <Button size="sm" variant={adminAuditId === u.id ? "secondary" : "outline"}
                                      className="h-7 text-xs border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-400"
                                      onClick={() => loadAdminAudit(u.id)}>
                                      <Shield className="h-3 w-3 mr-1" />Histò
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1">
                                  <Badge variant="outline" className="text-xs">Ou</Badge>
                                  {can("adminTeam") && (
                                    <Button size="sm" variant={adminAuditId === u.id ? "secondary" : "outline"}
                                      className="h-7 text-xs border-cyan-300 text-cyan-700 dark:border-cyan-700 dark:text-cyan-400"
                                      onClick={() => loadAdminAudit(u.id)}>
                                      <Shield className="h-3 w-3 mr-1" />Histò
                                    </Button>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* ── Admin Suspension Form Panel ── */}
                          {isSuperAdmin && adminSuspendFormId === u.id && !u.isSuperAdmin && (
                            <tr className="border-t border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10">
                              <td colSpan={5} className="px-4 py-4">
                                <div className="space-y-3 max-w-lg">
                                  <p className="text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-2">
                                    ⛔ Bloke Admin / Moderatè — <span className="font-semibold text-foreground">{u.name}</span>
                                  </p>
                                  <input
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400"
                                    placeholder="Rezon blokaj (ex: abi pouvwa, vyolasyon règleman…)"
                                    value={adminSuspendReason}
                                    onChange={e => setAdminSuspendReason(e.target.value)}
                                  />
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-muted-foreground">Dirasyon:</span>
                                    {[{v:"7",l:"7 jou"},{v:"14",l:"14 jou"},{v:"30",l:"30 jou"},{v:"90",l:"90 jou"},{v:"180",l:"6 mwa"},{v:"0",l:"Pèmanan"}].map(opt => (
                                      <button key={opt.v} type="button"
                                        onClick={() => setAdminSuspendDuration(opt.v)}
                                        className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${adminSuspendDuration === opt.v ? "bg-red-600 text-white border-red-600" : "border-border bg-background hover:bg-accent"}`}>
                                        {opt.l}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
                                      disabled={adminSuspendActioning === u.id}
                                      onClick={() => handleAdminSuspend(u.id)}>
                                      ⛔ Konfime Blokaj
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8 text-xs"
                                      onClick={() => setAdminSuspendFormId(null)}>
                                      Anile
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* ── Admin Audit Trail Panel ── */}
                          {adminAuditId === u.id && (
                            <tr className="border-t border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-900/10">
                              <td colSpan={5} className="px-4 py-4">
                                {adminAuditLoading && !adminAuditData ? (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                                    <div className="h-3 w-3 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                    Chaje done admin...
                                  </div>
                                ) : adminAuditData ? (
                                  <div className="space-y-3">
                                    {/* Header */}
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-extrabold tracking-widest font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/40 px-3 py-1 rounded-lg border border-cyan-300 dark:border-cyan-700 text-base">
                                          🛡 {adminAuditData.adminId}
                                        </span>
                                        <span className="text-xs font-semibold text-foreground">{adminAuditData.name}</span>
                                        <Badge variant="secondary" className="text-[10px]">{adminAuditData.role}</Badge>
                                      </div>
                                      <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground">
                                        <span className="font-semibold text-foreground">{adminAuditData.stats.totalActions}</span> aksyon ·
                                        <span className="font-semibold text-foreground">{adminAuditData.stats.totalMessages}</span> mesaj
                                      </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex gap-1 border-b border-border pb-1">
                                      <button
                                        className={`text-xs px-3 py-1 rounded-t font-semibold transition-colors ${adminAuditTab === "actions" ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300" : "text-muted-foreground hover:text-foreground"}`}
                                        onClick={() => setAdminAuditTab("actions")}
                                      >
                                        Aksyon ({adminAuditData.auditLogs.length})
                                      </button>
                                      <button
                                        className={`text-xs px-3 py-1 rounded-t font-semibold transition-colors ${adminAuditTab === "messages" ? "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300" : "text-muted-foreground hover:text-foreground"}`}
                                        onClick={() => setAdminAuditTab("messages")}
                                      >
                                        Mesaj ({adminAuditData.sentMessages.length})
                                      </button>
                                    </div>

                                    {/* Actions tab */}
                                    {adminAuditTab === "actions" && (
                                      adminAuditData.auditLogs.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic py-2">Pa gen aksyon anrejistre.</p>
                                      ) : (
                                        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                                          {adminAuditData.auditLogs.map((log: any) => (
                                            <div key={log.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-background/70 border border-border/50 text-xs">
                                              <div className="flex-1 min-w-0">
                                                <span className="font-semibold text-foreground">{log.action}</span>
                                                {log.targetType && <span className="text-muted-foreground ml-1">· {log.targetType} #{log.targetId}</span>}
                                                {log.details && <p className="text-muted-foreground mt-0.5 truncate">{log.details}</p>}
                                              </div>
                                              <span className="text-muted-foreground shrink-0 whitespace-nowrap">{new Date(log.createdAt).toLocaleDateString("fr-HT", { year: "2-digit", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    )}

                                    {/* Messages tab */}
                                    {adminAuditTab === "messages" && (
                                      adminAuditData.sentMessages.length === 0 ? (
                                        <p className="text-xs text-muted-foreground italic py-2">Pa gen mesaj voye.</p>
                                      ) : (
                                        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                                          {adminAuditData.sentMessages.map((msg: any) => (
                                            <div key={msg.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-background/70 border border-border/50 text-xs">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                  <span className="text-muted-foreground">→</span>
                                                  <span className="font-semibold text-foreground">{msg.recipientName}</span>
                                                  {msg.listingTitle !== "—" && <span className="text-muted-foreground truncate">· {msg.listingTitle}</span>}
                                                  {msg.messageType !== "text" && <Badge variant="outline" className="text-[9px] h-4 px-1">{msg.messageType}</Badge>}
                                                </div>
                                                {msg.content && <p className="text-muted-foreground truncate">{msg.content}</p>}
                                                {!msg.content && <p className="text-muted-foreground italic">[ {msg.messageType} ]</p>}
                                              </div>
                                              <span className="text-muted-foreground shrink-0 whitespace-nowrap">{new Date(msg.createdAt).toLocaleDateString("fr-HT", { year: "2-digit", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )
                                    )}
                                  </div>
                                ) : null}
                              </td>
                            </tr>
                          )}

                          {/* ── Inline scope editor ── */}
                          {setScopeForAdmin?.id === u.id && (
                            <tr className="border-t border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-900/15">
                              <td colSpan={5} className="px-4 py-4">
                                <div className="space-y-3">
                                  <p className="text-xs font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5" /> Chanje zòn kontwòl pou <strong>{u.name}</strong>:
                                  </p>
                                  {/* Multi-country toggles */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">Peyi :</span>
                                    {SUPPORTED_COUNTRIES.map(c => (
                                      <label key={c} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border cursor-pointer text-xs font-semibold transition-colors ${setScopeCountries.includes(c) ? "bg-orange-100 border-orange-400 text-orange-800 dark:bg-orange-900/30 dark:border-orange-600 dark:text-orange-200" : "bg-background border-border hover:bg-accent/50 text-foreground"}`}>
                                        <input type="checkbox" className="h-3.5 w-3.5 rounded accent-orange-500"
                                          checked={setScopeCountries.includes(c)}
                                          onChange={(e) => {
                                            setSetScopeCountries(prev => e.target.checked ? [...prev, c] : prev.filter(x => x !== c));
                                            if (e.target.checked && setScopeCountries.length === 0) { setSetScopeCountry(c); } else { setSetScopeCountry(""); }
                                            setSetScopeDepartment(""); setSetScopeCity("");
                                          }}
                                        />
                                        {COUNTRY_FLAGS[c]} {c}
                                      </label>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {/* Department — shown only when exactly 1 country selected */}
                                    <div className="relative" style={{ display: setScopeCountries.length !== 1 ? "none" : undefined }}>
                                      <select
                                        className="h-8 rounded-md border border-teal-300 bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"
                                        style={{ fontSize: "16px", minWidth: "9rem" }}
                                        value={setScopeCountry || ""}
                                        onChange={(e) => { setSetScopeCountry(e.target.value); setSetScopeDepartment(""); setSetScopeCity(""); }}
                                      >
                                        <option value="">🌐 Global</option>
                                        {SUPPORTED_COUNTRIES.map(c => <option key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</option>)}
                                      </select>
                                      <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                    </div>
                                    {/* Department */}
                                    {setScopeCountry && (() => {
                                      const opt = scopeOptions.find(o => o.country === setScopeCountry);
                                      return opt ? (
                                        <>
                                          <span className="text-muted-foreground font-bold text-xs">›</span>
                                          <div className="relative">
                                            <select
                                              className="h-8 rounded-md border border-teal-300 bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"
                                              style={{ fontSize: "16px", minWidth: "8rem" }}
                                              value={setScopeDepartment || ""}
                                              onChange={(e) => { setSetScopeDepartment(e.target.value); setSetScopeCity(""); }}
                                            >
                                              <option value="">{t("adminManage.allDepts", "Tout depatman")}</option>
                                              {opt.departments.map(d => <option key={d} value={d}>{d}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                          </div>
                                        </>
                                      ) : null;
                                    })()}
                                    {/* City */}
                                    {setScopeDepartment && (() => {
                                      const opt = scopeOptions.find(o => o.country === setScopeCountry);
                                      const cities = opt?.citiesByDept[setScopeDepartment] ?? [];
                                      return cities.length > 0 ? (
                                        <>
                                          <span className="text-muted-foreground font-bold text-xs">›</span>
                                          <div className="relative">
                                            <select
                                              className="h-8 rounded-md border border-teal-300 bg-background pl-2.5 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-teal-400"
                                              style={{ fontSize: "16px", minWidth: "7rem" }}
                                              value={setScopeCity || ""}
                                              onChange={(e) => setSetScopeCity(e.target.value)}
                                            >
                                              <option value="">{t("adminManage.allCities", "Tout vil")}</option>
                                              {cities.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                                          </div>
                                        </>
                                      ) : null;
                                    })()}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                                      onClick={() => handleSetScope(u.id)} disabled={actioning === `scope-${u.id}`}>
                                      <Check className="h-3 w-3 mr-1" />Anrejistre
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs"
                                      onClick={() => { setSetScopeForAdmin(null); setSetScopeCountry(""); setSetScopeDepartment(""); setSetScopeCity(""); }}>
                                      <X className="h-3 w-3 mr-1" />Anile
                                    </Button>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          </TabsContent>
        )}

        {/* ── Support Inbox ── */}
        <TabsContent value="support">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Sipò itilizatè</h2>
            </div>
          </div>
          <SupportAdminPanel
            initialThreadId={initialDeepThread ? Number(initialDeepThread) : null}
            onUnreadChange={setSupportUnread}
          />
        </TabsContent>

        {/* ── Admin-to-Admin Chat ── */}
        <TabsContent value="adminchat">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold">Admin Chat</h2>
              <Badge variant="secondary" className="text-xs">{adminChatAdmins.length} admin{adminChatAdmins.length !== 1 ? "s" : ""}</Badge>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadAdminChatAdmins}>
              <RotateCcw className="h-3 w-3 mr-1" />Refresh
            </Button>
          </div>
          <div className="grid md:grid-cols-[280px_1fr] gap-3">
            {/* Admin list panel */}
            <div className="bg-card border border-border rounded-xl overflow-hidden h-[60vh] flex flex-col">
              <div className="px-3 py-2 border-b border-border bg-muted/30 text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                Ekip Admin
              </div>
              <div className="flex-1 overflow-y-auto">
                {adminChatAdmins.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Pa gen lòt admin</p>
                  </div>
                ) : adminChatAdmins.map((a: any) => (
                  <button
                    key={a.id}
                    onClick={() => loadAdminChatMessages(a.id)}
                    className={`w-full text-left p-3 border-b border-border hover:bg-accent transition-colors ${adminChatActiveId === a.id ? "bg-accent" : ""}`}
                    data-testid={`adminchat-admin-${a.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8 flex-shrink-0">
                        <AvatarImage src={a.avatar ?? undefined} />
                        <AvatarFallback className={a.isSuperAdmin ? "bg-purple-600 text-white text-[10px]" : "text-[10px]"}>
                          {a.isSuperAdmin ? <Crown className="h-3.5 w-3.5" /> : a.name?.[0] ?? "?"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate">{a.name}</span>
                          {a.isSuperAdmin
                            ? <Badge className="text-[8px] h-3.5 px-1 bg-purple-600 hover:bg-purple-600 flex-shrink-0">SA</Badge>
                            : <Badge variant="secondary" className="text-[8px] h-3.5 px-1 flex-shrink-0">Admin</Badge>
                          }
                          {a.unread > 0 && <Badge className="ml-auto text-[9px] h-4 px-1 bg-blue-600 hover:bg-blue-600">{a.unread}</Badge>}
                        </div>
                        {a.lastMessage && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{a.lastMessage}</p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Chat panel */}
            <div className="bg-card border border-border rounded-xl overflow-hidden h-[60vh] flex flex-col">
              {!adminChatDetail ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <MessageSquare className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">Chwazi yon admin pou kòmanse yon konvèsasyon.</p>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="p-3 border-b border-border bg-muted/30 flex items-center gap-2">
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={adminChatDetail.other.avatar ?? undefined} />
                      <AvatarFallback className="text-[10px]">{adminChatDetail.other.name?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-sm flex-1 truncate">{adminChatDetail.other.name}</span>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => loadAdminChatMessages(adminChatDetail.other.id)}>
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {adminChatDetail.messages.length === 0 && (
                      <div className="text-center text-sm text-muted-foreground py-8">Kòmanse konvèsasyon an...</div>
                    )}
                    {adminChatDetail.messages.map((m: any) => {
                      const mine = m.fromAdminId === user?.id;
                      return (
                        <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                          <Avatar className="h-6 w-6 flex-shrink-0">
                            <AvatarFallback className={mine ? "bg-primary/15 text-[9px]" : "bg-muted text-[9px]"}>
                              {mine ? (user as any)?.name?.[0] ?? "M" : adminChatDetail.other.name?.[0] ?? "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`max-w-[75%] flex flex-col ${mine ? "items-end" : ""}`}>
                            <div className="flex items-center gap-1 mb-0.5 text-[10px] text-muted-foreground">
                              <span>{new Date(m.createdAt).toLocaleString()}</span>
                              {!m.isRead && !mine && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
                            </div>
                            <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                              mine
                                ? "bg-primary text-primary-foreground rounded-br-sm"
                                : "bg-muted rounded-bl-sm"
                            }`}>
                              {m.content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={adminChatBottomRef} />
                  </div>

                  {/* Input */}
                  <div className="border-t border-border p-3 flex gap-2">
                    <Input
                      value={adminChatMessage}
                      onChange={e => setAdminChatMessage(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendAdminChatMessage())}
                      placeholder={`Mesaj bay ${adminChatDetail.other.name}...`}
                      disabled={adminChatSending}
                      data-testid="input-adminchat-message"
                    />
                    <Button
                      onClick={sendAdminChatMessage}
                      disabled={!adminChatMessage.trim() || adminChatSending}
                      data-testid="button-adminchat-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Stripe Connect Dashboard ── */}
        <TabsContent value="stripe">
          {!can("payments") ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sèlman Admin Finansyèl ka wè done Stripe yo.</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">403 Forbidden</p>
            </div>
          ) : (
          <div className="space-y-6">

            {/* Commission Settings */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" />Platform Commission (Stripe)</h3>
              <div className="flex items-center gap-3 max-w-xs">
                <Input
                  type="number" min={0} max={50} step={0.5}
                  value={stripeCommissionInput}
                  onChange={e => setStripeCommissionInput(e.target.value)}
                  className="h-9 w-24"
                  data-testid="input-stripe-commission"
                />
                <span className="text-sm text-muted-foreground">% of each sale</span>
                <Button size="sm" onClick={saveStripeCommission} data-testid="button-save-stripe-commission">Save</Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Current: <strong>{stripeCommission}%</strong>. Applied automatically on each Stripe checkout. Remainder goes to the vendor's Stripe account.</p>
            </div>

            {/* Transactions */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-sm">Stripe Transactions</h3>
                <Button size="sm" variant="outline" onClick={loadStripeData} disabled={stripeLoading}>{stripeLoading ? "Loading…" : "Refresh"}</Button>
              </div>
              {stripeTransactions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No Stripe transactions yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left p-3 font-semibold">#</th>
                        <th className="text-left p-3 font-semibold">Buyer</th>
                        <th className="text-left p-3 font-semibold">Amount</th>
                        <th className="text-left p-3 font-semibold">Commission</th>
                        <th className="text-left p-3 font-semibold">Status</th>
                        <th className="text-left p-3 font-semibold">Session ID</th>
                        <th className="text-left p-3 font-semibold">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stripeTransactions.map((tx: any) => (
                        <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3 font-mono">{tx.id}</td>
                          <td className="p-3">{tx.buyer?.name ?? tx.buyer?.email ?? `User ${tx.userId}`}</td>
                          <td className="p-3 font-semibold">${Number(tx.amount ?? 0).toFixed(2)}</td>
                          <td className="p-3 text-muted-foreground">${Number(tx.commissionAmount ?? 0).toFixed(2)}</td>
                          <td className="p-3">
                            <Badge
                              className={`text-[10px] border-0 ${
                                tx.paymentStatus === "completed" ? "bg-green-100 text-green-700" :
                                tx.paymentStatus === "pending" ? "bg-yellow-100 text-yellow-700" :
                                "bg-red-100 text-red-700"
                              }`}
                            >
                              {tx.paymentStatus}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground text-[10px] max-w-[160px] truncate">
                            {tx.stripeCheckoutSessionId ?? "—"}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Vendor Connect Status */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-sm">Vendor Connect Status</h3>
                <p className="text-xs text-muted-foreground mt-0.5">All users and their Stripe Connect status.</p>
              </div>
              {stripeVendors.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">No vendors found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left p-3 font-semibold">User</th>
                        <th className="text-left p-3 font-semibold">Country</th>
                        <th className="text-left p-3 font-semibold">Stripe Status</th>
                        <th className="text-left p-3 font-semibold">Account ID</th>
                        <th className="text-left p-3 font-semibold">Joined</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {stripeVendors.map((v: any) => (
                        <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                          <td className="p-3">
                            <p className="font-medium">{v.name}</p>
                            <p className="text-muted-foreground">{v.email}</p>
                          </td>
                          <td className="p-3">{v.country ?? "—"}</td>
                          <td className="p-3">
                            <Badge className={`text-[10px] border-0 ${
                              v.stripeAccountStatus === "active" ? "bg-green-100 text-green-700" :
                              v.stripeAccountStatus === "pending" ? "bg-yellow-100 text-yellow-700" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {v.stripeAccountStatus === "not_connected" ? "Not connected" : v.stripeAccountStatus}
                            </Badge>
                          </td>
                          <td className="p-3 font-mono text-muted-foreground text-[10px]">
                            {v.stripeAccountId ?? "—"}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs whitespace-nowrap">
                            {v.createdAt ? new Date(v.createdAt).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
          )}
        </TabsContent>

        {/* ── Activity Log ── */}
        {/* ── Wallet Admin ── */}
        <TabsContent value="wallet">
          {!can("payments") ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sèlman Admin Finansyèl ka jere portefèy platfòm nan.</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">403 Forbidden</p>
            </div>
          ) : (
          <div className="space-y-6">

            {/* ── Quick user search ─────────────────────────────────────────── */}
            <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 text-primary shrink-0" />
                <h3 className="font-bold text-sm">Chèche Itilizatè — Wè Tranzaksyon</h3>
              </div>
              <Input
                placeholder="Tape non oswa email itilizatè a…"
                value={walletQuickSearch}
                onChange={e => setWalletQuickSearch(e.target.value)}
                className="h-9 text-sm"
              />
              {walletQuickSearch.trim().length >= 2 && (() => {
                const q = walletQuickSearch.trim().toLowerCase();
                const hits = walletBalances.filter((w: any) =>
                  (w.userName ?? "").toLowerCase().includes(q) ||
                  (w.userEmail ?? "").toLowerCase().includes(q)
                ).slice(0, 8);
                return hits.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-2">Okenn rezilta</p>
                ) : (
                  <div className="space-y-1">
                    {hits.map((w: any) => (
                      <button
                        key={w.userId}
                        onClick={() => { openWalletDetail(w.userId); setWalletQuickSearch(""); }}
                        className="w-full flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5 hover:bg-accent hover:border-primary/40 transition-all text-left"
                      >
                        <div>
                          <p className="text-sm font-semibold">{w.userName ?? `User #${w.userId}`}</p>
                          <p className="text-xs text-muted-foreground">{w.userEmail}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-black text-primary">${parseFloat(w.balanceUsd).toFixed(2)}</p>
                          <p className="text-[10px] text-muted-foreground">{w.userCountry ?? ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}
              {walletBalances.length === 0 && (
                <p className="text-[11px] text-muted-foreground">Klike <strong>Refresh</strong> anwo a pou chaje lis itilizatè yo anvan rechèch.</p>
              )}
            </div>

            {/* Settings */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2"><Wallet className="h-4 w-4" />Paramèt Kont Promosyon</h3>
                <button onClick={loadWalletAdmin} className="text-muted-foreground hover:text-foreground"><RefreshCw className="h-4 w-4" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-semibold">📱 Nimewo MonCash Platfòm nan (moun ap voye lajan sou sa a)</p>
                  <Input
                    value={walletMoncashNumber}
                    onChange={e => setWalletMoncashNumber(e.target.value)}
                    type="tel"
                    placeholder="+509 3612 3456"
                    className="font-mono text-base font-bold"
                  />
                  {walletSettings.moncashPlatformNumber && (
                    <p className="text-xs text-green-600 mt-1">Aktyèl: {walletSettings.moncashPlatformNumber}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Taux HTG → USD (ex: 130)</p>
                    <Input value={walletRateInput} onChange={e => setWalletRateInput(e.target.value)} type="number" placeholder="130" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 font-semibold">Bonus % sou rechaj (ex: 5)</p>
                    <Input value={walletBonusInput} onChange={e => setWalletBonusInput(e.target.value)} type="number" placeholder="0" />
                  </div>
                </div>
              </div>
              <Button size="sm" onClick={handleWalletSettings} disabled={walletSettingsSaving}>
                {walletSettingsSaving ? "Ap sove…" : "Sove Paramèt"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Aktyèl: 1 USD = G {walletSettings.rateHtgToUsd} · Bonus: {walletSettings.bonusPct}%
              </div>
            </div>

            {/* Manual Credit */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2"><ArrowUpCircle className="h-4 w-4 text-green-600" />Kredite Kont Manyèlman</h3>
              <div className="grid grid-cols-3 gap-2">
                <Input placeholder="User ID" value={walletCreditUserId} onChange={e => setWalletCreditUserId(e.target.value)} type="number" />
                <Input placeholder="Montan USD (ex: 5.00)" value={walletCreditAmount} onChange={e => setWalletCreditAmount(e.target.value)} type="number" />
                <Input placeholder="Nòt (opsyonèl)" value={walletCreditNote} onChange={e => setWalletCreditNote(e.target.value)} />
              </div>
              <Button size="sm" variant="outline" onClick={handleWalletCredit} disabled={walletCreditSaving || !walletCreditUserId || !walletCreditAmount}>
                {walletCreditSaving ? "Ap kredite…" : "Kredite Kont"}
              </Button>
            </div>

            {/* Pending Recharges */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">Rechaj Annatant / Istwa</h3>
                <Badge variant="outline">{walletRecharges.length} total</Badge>
              </div>
              {walletRecharges.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Pa gen rechaj ankò</p>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                  {walletRecharges.map((tx: any) => (
                    <div key={tx.id} className={`rounded-xl border p-4 space-y-3 ${tx.status === "pending" ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10" : "border-border bg-card"}`}>
                      {/* Header: status + date */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          {tx.status === "pending" && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700">⏳ Annatant</Badge>}
                          {tx.status === "completed" && <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 text-[10px]">✓ Konfime</Badge>}
                          {tx.status === "rejected" && <Badge variant="destructive" className="text-[10px]">✗ Rejete</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</span>
                      </div>

                      {/* User info */}
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-foreground">{tx.userName ?? `User #${tx.userId}`}</p>
                        {tx.userEmail && <p className="text-xs text-muted-foreground">{tx.userEmail}</p>}
                        {tx.userPhone && (
                          <p className="text-xs font-mono font-semibold text-primary">📱 {tx.userPhone}</p>
                        )}
                        {tx.note && !tx.userPhone && (
                          <p className="text-xs text-muted-foreground font-mono">{tx.note}</p>
                        )}
                      </div>

                      {/* Amount */}
                      <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Montan</p>
                          <p className="text-base font-black">
                            {tx.amountHtg ? `G ${Number(tx.amountHtg).toLocaleString()} → ` : ""}
                            <span className="text-primary">${Math.abs(parseFloat(tx.amountUsd)).toFixed(2)}</span>
                          </p>
                          {tx.bonusPct > 0 && <p className="text-xs text-green-600 font-semibold">+{tx.bonusPct}% bonus inkli</p>}
                        </div>
                      </div>

                      {/* Refs */}
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Ref Platfòm:</span>
                          <span className="text-xs font-mono text-foreground">{tx.paymentRef}</span>
                        </div>
                        {tx.userTransferRef && (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Nimewo Transfè:</span>
                            <span className="text-sm font-mono font-black text-primary bg-primary/10 px-2 py-0.5 rounded">{tx.userTransferRef}</span>
                          </div>
                        )}
                        {!tx.userTransferRef && tx.status === "pending" && (
                          <p className="text-xs text-amber-600 italic">Moun nan pa antre nimewo transfè ankò</p>
                        )}
                      </div>

                      {/* Screenshot */}
                      {tx.screenshotUrl ? (
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Screenshot Prèv</p>
                          <a href={tx.screenshotUrl} target="_blank" rel="noopener noreferrer" className="block">
                            <img
                              src={tx.screenshotUrl}
                              alt="Screenshot transfè"
                              className="w-full max-h-48 object-contain rounded-lg border border-border hover:opacity-90 transition-opacity cursor-pointer"
                            />
                            <p className="text-xs text-primary hover:underline mt-1">Ouvri screenshot an plen</p>
                          </a>
                        </div>
                      ) : tx.status === "pending" && (
                        <p className="text-xs text-muted-foreground italic">Pa gen screenshot</p>
                      )}

                      {/* Confirm / Reject buttons */}
                      {tx.status === "pending" && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleWalletConfirm(tx.id, "completed")}
                            disabled={walletConfirmingId === tx.id}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 disabled:opacity-50 transition-colors"
                          >
                            {walletConfirmingId === tx.id ? "..." : <><CheckCircle className="h-4 w-4" />Konfime Rechaj</>}
                          </button>
                          <button
                            onClick={() => handleWalletConfirm(tx.id, "rejected")}
                            disabled={walletConfirmingId === tx.id}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-red-500 text-white font-bold text-sm hover:bg-red-600 disabled:opacity-50 transition-colors"
                          >
                            {walletConfirmingId === tx.id ? "..." : <><XCircle className="h-4 w-4" />Rejte</>}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* All user balances */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm">Tout Balans Itilizatè</h3>
                <Badge variant="outline">{walletBalances.length} itilizatè</Badge>
              </div>
              {walletBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Okenn kont promosyon ankò</p>
              ) : (
                <div className="space-y-1 max-h-[300px] overflow-y-auto">
                  {walletBalances.map((w: any) => (
                    <div key={w.userId} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                      <div>
                        <button
                          className="text-sm font-medium hover:text-primary hover:underline text-left transition-colors"
                          onClick={() => openWalletDetail(w.userId)}
                        >{w.userName ?? `User #${w.userId}`}</button>
                        <p className="text-xs text-muted-foreground">{w.userEmail}</p>
                      </div>
                      <p className="text-sm font-bold text-primary">${parseFloat(w.balanceUsd).toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Scoped Transaction History ─────────────────────────────────── */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="h-4 w-4 text-primary" />
                  <h3 className="font-bold text-sm">Istwa Tranzaksyon</h3>
                  {adminTxData?.scopeCountry ? (
                    <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">
                      {COUNTRY_FLAGS[adminTxData.scopeCountry] ?? ""} {adminTxData.scopeCountry} sèlman
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-500">🌍 Tout peyi</Badge>
                  )}
                  {adminTxData && <Badge variant="outline" className="text-[10px]">{adminTxData.count} tx</Badge>}
                </div>
                <button
                  onClick={() => loadAdminTxHistory({ filter: adminTxFilter, search: adminTxSearch })}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className={`h-4 w-4 ${adminTxLoading ? "animate-spin" : ""}`} />
                </button>
              </div>

              {/* Summary strip */}
              {adminTxData && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-2 flex items-center gap-2">
                    <ArrowUpCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Antre</p>
                      <p className="text-sm font-black text-emerald-500 tabular-nums">+${adminTxData.totalIn.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-red-500/8 border border-red-500/20 px-3 py-2 flex items-center gap-2">
                    <ArrowDownCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Depans</p>
                      <p className="text-sm font-black text-red-500 tabular-nums">-${adminTxData.totalOut.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Filter pills + Search */}
              <div className="flex flex-wrap gap-2">
                {(["all", "in", "out"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => { setAdminTxFilter(f); loadAdminTxHistory({ filter: f, search: adminTxSearch }); }}
                    className={`h-7 px-3 rounded-full text-xs font-semibold border transition-all ${adminTxFilter === f ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"}`}
                  >
                    {f === "all" ? "Tout" : f === "in" ? "Antre 💚" : "Depans 🔴"}
                  </button>
                ))}
                <div className="flex-1 min-w-[160px]">
                  <Input
                    placeholder={t("adminApps.adminTxSearchPlaceholder")}
                    value={adminTxSearch}
                    onChange={e => setAdminTxSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") loadAdminTxHistory({ filter: adminTxFilter, search: adminTxSearch }); }}
                    className="h-7 text-xs"
                  />
                </div>
              </div>

              {/* Transaction list */}
              {adminTxLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
                </div>
              ) : !adminTxData ? (
                <p className="text-sm text-muted-foreground text-center py-6">Klike refresh pou chaje tranzaksyon yo</p>
              ) : adminTxData.transactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Pa gen tranzaksyon nan kategori sa a</p>
              ) : (
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
                  {adminTxData.transactions.map((tx: any) => {
                    const isIn = tx.amountUsd > 0;
                    const absAmt = Math.abs(parseFloat(tx.amountUsd));
                    const flag = tx.userCountry ? (COUNTRY_FLAGS[tx.userCountry] ?? "") : "";
                    return (
                      <div key={tx.id} className="rounded-xl border border-border bg-background px-3 py-2.5 flex items-center gap-2.5">
                        {/* Direction dot */}
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isIn ? "bg-emerald-500" : "bg-red-500"}`} />
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              className="text-xs font-semibold text-foreground hover:text-primary hover:underline truncate text-left transition-colors"
                              onClick={() => openWalletDetail(tx.userId)}
                            >{tx.userName ?? `User #${tx.userId}`}</button>
                            {flag && <span className="text-xs">{flag}</span>}
                            {tx.userCountry && <span className="text-[10px] text-muted-foreground">{tx.userCountry}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <p className="text-[10px] text-muted-foreground">{tx.type}</p>
                            <span className="text-[10px] text-muted-foreground/50">·</span>
                            <p className="text-[10px] text-muted-foreground">{new Date(tx.createdAt).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                          </div>
                          {tx.userEmail && <p className="text-[10px] text-muted-foreground/60 truncate">{tx.userEmail}</p>}
                        </div>
                        {/* Amount + status */}
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className={`text-sm font-black tabular-nums ${isIn ? "text-emerald-500" : "text-red-500"}`}>
                            {isIn ? "+" : "-"}${absAmt.toFixed(2)}
                          </p>
                          <p className={`text-[10px] font-semibold ${tx.status === "completed" ? "text-emerald-500" : tx.status === "pending" ? "text-amber-500" : "text-red-500"}`}>
                            {tx.status === "completed" ? "✓ Fini" : tx.status === "pending" ? "⏳ Atann" : "✗ Rejte"}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
          )}
        </TabsContent>

        {/* ── USERS SEARCH SHEET (from "14 Itilizatè" stat card) ─────────────── */}
        <Sheet open={showUsersSheet} onOpenChange={open => { if (!open) { setShowUsersSheet(false); setUsersSheetSearch(""); } }}>
          <SheetContent side="bottom" className="h-[85dvh] p-0 flex flex-col rounded-t-2xl">
            <SheetHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
              <SheetTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Tout Itilizatè — Wè Tranzaksyon
              </SheetTitle>
            </SheetHeader>
            <div className="px-4 pt-3 pb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Tape non oswa email…"
                  value={usersSheetSearch}
                  onChange={e => setUsersSheetSearch(e.target.value)}
                  className="pl-9 h-10 text-sm"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-1.5">
              {walletBalances.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                  <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Wallet className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">Ap chaje lis itilizatè…</p>
                </div>
              ) : (() => {
                const q = usersSheetSearch.trim().toLowerCase();
                const list = q.length >= 1
                  ? walletBalances.filter((w: any) =>
                      (w.userName ?? "").toLowerCase().includes(q) ||
                      (w.userEmail ?? "").toLowerCase().includes(q)
                    )
                  : walletBalances;
                return list.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">Okenn rezilta pou "{usersSheetSearch}"</p>
                ) : (
                  list.map((w: any) => (
                    <button
                      key={w.userId}
                      onClick={() => { setShowUsersSheet(false); setUsersSheetSearch(""); openWalletDetail(w.userId); }}
                      className="w-full flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent hover:border-primary/40 active:scale-[0.98] transition-all text-left"
                    >
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-primary">{(w.userName ?? "?")[0].toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{w.userName ?? `User #${w.userId}`}</p>
                        <p className="text-xs text-muted-foreground truncate">{w.userEmail}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-primary">${parseFloat(w.balanceUsd ?? 0).toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">{w.userCountry ?? ""}</p>
                      </div>
                    </button>
                  ))
                );
              })()}
            </div>
          </SheetContent>
        </Sheet>

        {/* ── WALLET USER DETAIL SHEET ──────────────────────────────────────── */}
        <Sheet open={walletDetailUserId !== null} onOpenChange={open => { if (!open) { setWalletDetailUserId(null); setWalletDetailData(null); } }}>
          <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
            <SheetHeader className="px-4 pt-4 pb-3 border-b border-border sticky top-0 bg-background z-10">
              <SheetTitle className="flex items-center gap-2 text-base">
                <button
                  onClick={() => { setWalletDetailUserId(null); setWalletDetailData(null); }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors -ml-1 shrink-0"
                >
                  <ArrowLeft className="h-5 w-5 text-foreground" />
                </button>
                <Wallet className="h-4 w-4 text-primary" />
                Pwofil Pòtfèy
              </SheetTitle>
            </SheetHeader>

            {walletDetailLoading ? (
              <div className="flex flex-col gap-3 p-5">
                {[1,2,3,4,5].map(i => <div key={i} className="h-12 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : !walletDetailData ? (
              <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                Pa gen done disponib
              </div>
            ) : (
              <div className="p-5 space-y-5">
                {/* User card */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-base">{walletDetailData.user.name}</p>
                    <div className="flex gap-1">
                      {walletDetailData.user.isAdmin && <Badge variant="outline" className="text-[10px] border-purple-400 text-purple-500">Admin</Badge>}
                      {walletDetailData.user.isRestricted && <Badge variant="outline" className="text-[10px] border-red-400 text-red-500">Bloke</Badge>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{walletDetailData.user.email}</p>
                  {walletDetailData.user.phone && <p className="text-xs text-muted-foreground">{walletDetailData.user.phone}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    {walletDetailData.user.country && <span className="text-xs">{COUNTRY_FLAGS[walletDetailData.user.country] ?? ""} {walletDetailData.user.country}</span>}
                    {walletDetailData.wallet?.accountNumber && (
                      <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{walletDetailData.wallet.accountNumber}</span>
                    )}
                  </div>
                </div>

                {/* Balance tiles */}
                {walletDetailData.wallet && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/8 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Disponib</p>
                      <p className="text-lg font-black text-emerald-500 tabular-nums">${parseFloat(walletDetailData.wallet.balanceUsd ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/8 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Promo (bloke)</p>
                      <p className="text-lg font-black text-violet-400 tabular-nums">${parseFloat(walletDetailData.wallet.promoBalance ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Debloke</p>
                      <p className="text-lg font-black text-amber-400 tabular-nums">${parseFloat(walletDetailData.wallet.unlockedBalance ?? 0).toFixed(2)}</p>
                    </div>
                  </div>
                )}

                {/* Summary strip */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 px-2 py-2">
                    <p className="text-[10px] text-muted-foreground">Antre</p>
                    <p className="text-sm font-black text-emerald-500">+${walletDetailData.totalIn.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2 py-2">
                    <p className="text-[10px] text-muted-foreground">Depans</p>
                    <p className="text-sm font-black text-red-500">-${walletDetailData.totalOut.toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 px-2 py-2">
                    <p className="text-[10px] text-muted-foreground">Total tx</p>
                    <p className="text-sm font-black tabular-nums">{walletDetailData.count}</p>
                  </div>
                </div>

                {/* Transaction list */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Istwa konplè ({walletDetailData.count} tx)</p>
                    <button
                      onClick={() => {
                        const typeLabel: Record<string, string> = {
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
                        };
                        const u = walletDetailData.user;
                        const lines = [
                          `📊 Istwa Tranzaksyon — ${u.name}`,
                          `📧 ${u.email}  |  💰 Balans: $${parseFloat(walletDetailData.balanceUsd).toFixed(2)}`,
                          `──────────────────────────────`,
                          ...walletDetailData.transactions.map((tx: any) => {
                            const isIn = tx.amountUsd > 0;
                            const absAmt = Math.abs(parseFloat(tx.amountUsd));
                            const lbl = typeLabel[tx.type] ?? tx.type.replace(/_/g, " ");
                            const date = new Date(tx.createdAt).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
                      <Copy className="h-3 w-3" />
                      Kopye tout
                    </button>
                  </div>
                  {walletDetailData.transactions.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Pa gen tranzaksyon</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[480px] overflow-y-auto pr-0.5">
                      {walletDetailData.transactions.map((tx: any) => {
                        const isIn = tx.amountUsd > 0;
                        const absAmt = Math.abs(parseFloat(tx.amountUsd));
                        const typeLabel: Record<string, string> = {
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
                        };
                        const label = typeLabel[tx.type] ?? tx.type.replace(/_/g, " ");
                        const copyTx = () => {
                          const date = new Date(tx.createdAt).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
                          const status = tx.status === "completed" ? "✓ Fini" : tx.status === "pending" ? "⏳ Atann" : "✗ Rejte";
                          navigator.clipboard.writeText(
                            `${isIn ? "+" : "-"}$${absAmt.toFixed(2)} — ${label}\n${status}  •  ${date}${tx.note ? `\nNote: ${tx.note}` : ""}${tx.paymentRef ? `\nRef: ${tx.paymentRef}` : ""}`
                          );
                          toast({ title: "✅ Kopye!" });
                        };
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
                                <button onClick={copyTx} className="text-muted-foreground hover:text-primary transition-colors" title="Kopye">
                                  <Copy className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pl-3.5">
                              <p className={`text-[10px] font-semibold ${tx.status === "completed" ? "text-emerald-500" : tx.status === "pending" ? "text-amber-500" : "text-red-500"}`}>
                                {tx.status === "completed" ? "✓ Fini" : tx.status === "pending" ? "⏳ Atann" : "✗ Rejte"}
                              </p>
                              <span className="text-[10px] text-muted-foreground/50">·</span>
                              <p className="text-[10px] text-muted-foreground">{new Date(String(tx.createdAt).replace(" ", "T")).toLocaleString("fr-HT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
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

        {/* ── VIEW ANALYTICS TAB (super admin only) ──────────────────────────── */}
        <TabsContent value="views">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Eye className="h-4 w-4 text-cyan-500" />Analytics Vues
              </h2>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadViewAnalytics}>
                <RefreshCw className="h-3 w-3 mr-1" />Refresh
              </Button>
            </div>

            {!viewAnalytics ? (
              <div className="py-16 text-center text-muted-foreground text-sm">
                Klike <strong>Refresh</strong> pou chaje done analytics yo.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Top listings by views */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-cyan-400" />Top 20 Listing pa Vues
                  </h3>
                  <div className="divide-y divide-border">
                    {viewAnalytics.topListings.map((l: any, i: number) => (
                      <div key={l.id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="text-muted-foreground w-5 flex-shrink-0">#{i + 1}</span>
                        <span className="flex-1 truncate font-medium">{l.title}</span>
                        {l.isBoosted && <Zap className="h-3 w-3 text-amber-400 flex-shrink-0" />}
                        <span className="text-muted-foreground flex-shrink-0">{l.country}</span>
                        <span className="font-bold flex-shrink-0 tabular-nums text-cyan-400">{l.viewCount.toLocaleString()}</span>
                      </div>
                    ))}
                    {viewAnalytics.topListings.length === 0 && (
                      <p className="text-xs text-muted-foreground py-4 text-center">Okenn done</p>
                    )}
                  </div>
                </div>

                {/* Views by country (last 7 days) */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5 text-blue-400" />Vues pa Peyi — 7 Dènye Jou
                  </h3>
                  <div className="space-y-1">
                    {viewAnalytics.byCountry.map((r: any) => {
                      const total = viewAnalytics.byCountry.reduce((s: number, x: any) => s + Number(x.views), 0) || 1;
                      const pct = Math.round((Number(r.views) / total) * 100);
                      return (
                        <div key={r.country ?? "—"} className="flex items-center gap-2 text-xs">
                          <span className="w-24 truncate text-muted-foreground flex-shrink-0">{r.country ?? "Enkoni"}</span>
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="tabular-nums font-bold w-12 text-right flex-shrink-0">{Number(r.views).toLocaleString()}</span>
                        </div>
                      );
                    })}
                    {viewAnalytics.byCountry.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">Okenn done 7 jou</p>
                    )}
                  </div>
                </div>

                {/* Views by hour (last 24h) */}
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-emerald-400" />Aktivite pa Èdtan — 24h
                  </h3>
                  {viewAnalytics.byHour.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2 text-center">Okenn aktivite 24h</p>
                  ) : (
                    <div className="flex items-end gap-0.5 h-16">
                      {(() => {
                        const maxViews = Math.max(...viewAnalytics.byHour.map((h: any) => Number(h.views)), 1);
                        return viewAnalytics.byHour.map((h: any, i: number) => {
                          const height = Math.max(4, Math.round((Number(h.views) / maxViews) * 56));
                          const hourLabel = new Date(h.hour).getUTCHours().toString().padStart(2, "0") + "h";
                          return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-0.5" title={`${hourLabel}: ${h.views} views`}>
                              <div className="w-full rounded-t bg-emerald-500/70 hover:bg-emerald-400 transition-colors" style={{ height: `${height}px` }} />
                            </div>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>

                {/* Suspicious IPs */}
                {viewAnalytics.suspiciousIps.length > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 space-y-2">
                    <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
                      <Lock className="h-3.5 w-3.5" />IP Sispèk — +15 vues/24h
                    </h3>
                    <div className="divide-y divide-red-500/10">
                      {viewAnalytics.suspiciousIps.map((ip: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 py-1.5 text-xs">
                          <span className="font-mono text-muted-foreground truncate flex-1">{ip.ip_hash.slice(0, 16)}…</span>
                          <span className="text-muted-foreground">{ip.unique_listings} listing(s)</span>
                          <span className="font-bold text-red-400">{ip.total_views} vues</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <div className="space-y-3">
            {/* Filter bar */}
            {(() => {
              const filterLabels: Record<string, string> = { all: "All events", cooldown: "Cooldown events", user: "User actions", listing: "Listing actions" };
              const now = new Date();
              const presetCutoff = logsDateRange === "7d" ? new Date(now.getTime() - 7 * 86400_000)
                : logsDateRange === "30d" ? new Date(now.getTime() - 30 * 86400_000)
                : logsDateRange === "90d" ? new Date(now.getTime() - 90 * 86400_000)
                : null;
              const customFrom = logsDateRange === "custom" && logsDateFrom ? new Date(logsDateFrom) : null;
              const customTo = logsDateRange === "custom" && logsDateTo ? new Date(logsDateTo + "T23:59:59") : null;
              const inDateRange = (l: any) => {
                const ts = new Date(l.createdAt);
                if (presetCutoff && ts < presetCutoff) return false;
                if (customFrom && ts < customFrom) return false;
                if (customTo && ts > customTo) return false;
                return true;
              };
              const filterCounts: Record<string, number> = {
                all: logs.filter(inDateRange).length,
                cooldown: logs.filter(l => LOG_COOLDOWN_ACTIONS.has(l.action) && inDateRange(l)).length,
                user: logs.filter(l => LOG_USER_ACTIONS.has(l.action) && inDateRange(l)).length,
                listing: logs.filter(l => LOG_LISTING_ACTIONS.has(l.action) && inDateRange(l)).length,
              };
              const filteredCount = logs.filter((l: any) => {
                if (logsFilter === "cooldown" && !LOG_COOLDOWN_ACTIONS.has(l.action)) return false;
                if (logsFilter === "user" && !LOG_USER_ACTIONS.has(l.action)) return false;
                if (logsFilter === "listing" && !LOG_LISTING_ACTIONS.has(l.action)) return false;
                return inDateRange(l);
              }).length;
              return (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {(["all", "cooldown", "user", "listing"] as const).map(f => (
                    <Button key={f} size="sm" variant={logsFilter === f ? "default" : "outline"} className="h-7 text-xs" onClick={() => setLogsFilter(f)}>
                      {filterLabels[f]}
                      <span className="ml-1 bg-amber-500 text-white text-[9px] font-black rounded-full px-1">{filterCounts[f]}</span>
                    </Button>
                  ))}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadLogs(buildLogsParams(logsDateRange, logsDateFrom, logsDateTo))}>
                      <RefreshCw className="h-3 w-3 mr-1" />Refresh
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExportCsv} data-testid="button-export-csv" disabled={filteredCount === 0}>
                      <Download className="h-3 w-3 mr-1" />Export CSV
                    </Button>
                  </div>
                </div>
              );
            })()}
            {/* Date range filter */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative inline-flex items-center">
                <Clock className="absolute left-2 h-3 w-3 text-muted-foreground pointer-events-none z-10" />
                <select className="h-7 rounded-md border border-input bg-background pl-6 pr-7 appearance-none cursor-pointer text-xs focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px", minWidth: "9rem" }} value={logsDateRange} onChange={e => {
                  const next = e.target.value as typeof logsDateRange;
                  setLogsDateRange(next);
                  setLogsDateFrom("");
                  setLogsDateTo("");
                  if (next !== "custom") loadLogs(buildLogsParams(next, "", ""));
                }}>
                  <option value="all">All time</option>
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="custom">Custom range</option>
                </select>
                <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
              </div>
              {logsDateRange === "custom" && (
                <>
                  <Input type="date" value={logsDateFrom} onChange={e => setLogsDateFrom(e.target.value)} className="h-7 text-xs w-36" />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input type="date" value={logsDateTo} onChange={e => setLogsDateTo(e.target.value)} className="h-7 text-xs w-36" />
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadLogs(buildLogsParams("custom", logsDateFrom, logsDateTo))}>Apply</Button>
                </>
              )}
            </div>
            {/* Log entries */}
            {(() => {
              const now = new Date();
              const presetCutoff = logsDateRange === "7d" ? new Date(now.getTime() - 7 * 86400_000)
                : logsDateRange === "30d" ? new Date(now.getTime() - 30 * 86400_000)
                : logsDateRange === "90d" ? new Date(now.getTime() - 90 * 86400_000)
                : null;
              const customFrom = logsDateRange === "custom" && logsDateFrom ? new Date(logsDateFrom) : null;
              const customTo = logsDateRange === "custom" && logsDateTo ? new Date(logsDateTo + "T23:59:59") : null;
              const filtered = logs.filter(l => {
                if (logsFilter === "cooldown" && !LOG_COOLDOWN_ACTIONS.has(l.action)) return false;
                if (logsFilter === "user" && !LOG_USER_ACTIONS.has(l.action)) return false;
                if (logsFilter === "listing" && !LOG_LISTING_ACTIONS.has(l.action)) return false;
                const ts = new Date(l.createdAt);
                if (presetCutoff && ts < presetCutoff) return false;
                if (customFrom && ts < customFrom) return false;
                if (customTo && ts > customTo) return false;
                return true;
              });
              if (filtered.length === 0) {
                return (
                  <div className="text-center py-16 bg-card border border-border rounded-xl">
                    <Activity className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="font-semibold">{logs.length === 0 ? "No activity yet" : "No matching events"}</p>
                    <p className="text-sm text-muted-foreground mt-1">{logs.length === 0 ? "Admin actions will appear here" : "Try a different filter"}</p>
                  </div>
                );
              }
              return (
                <div className="space-y-2">
                  {filtered.map((l: any) => (
                    <div key={l.id} className="flex items-start gap-3 bg-card border border-border rounded-xl px-4 py-3">
                      <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5"><AvatarImage src={l.adminAvatar} /><AvatarFallback className="text-[10px] bg-primary text-primary-foreground">{l.adminName[0]}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap"><span className="font-medium text-sm">{l.adminName}</span><ActionBadge action={l.action} /></div>
                        {l.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.details}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5">{new Date(l.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </TabsContent>

        {/* ── Cash-out Requests ── */}
        <TabsContent value="cashout">
          {!can("payments") ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sèlman Admin Finansyèl ka apwouve oswa rejte demann retrait yo.</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">403 Forbidden</p>
            </div>
          ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold flex items-center gap-2"><ArrowDownCircle className="h-4 w-4 text-violet-500" />Demann Retrait</h2>
                <Badge variant="outline">{cashoutRequests.length}</Badge>
              </div>
              <div className="flex gap-1 flex-wrap">
                {(["all", "pending", "approved", "paid", "rejected"] as const).map(f => (
                  <Button key={f} size="sm" variant={cashoutFilter === f ? "default" : "outline"} className="h-7 text-xs" onClick={() => setCashoutFilter(f)}>
                    {f === "all" ? "Tout" : f === "pending" ? "Annatant" : f === "approved" ? "Apwouve" : f === "paid" ? "Peye" : "Rejte"}
                    {f === "pending" && cashoutRequests.filter(r => r.status === "pending").length > 0 && (
                      <span className="ml-1 bg-amber-500 text-white text-[9px] font-black rounded-full px-1">{cashoutRequests.filter(r => r.status === "pending").length}</span>
                    )}
                  </Button>
                ))}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadCashout}>
                  <RefreshCw className="h-3 w-3 mr-1" />Refresh
                </Button>
              </div>
            </div>

            {cashoutLoading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Ap chaje…</div>
            ) : cashoutRequests.filter(r => cashoutFilter === "all" || r.status === cashoutFilter).length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <ArrowDownCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">Pa gen demann retrait</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cashoutRequests
                  .filter(r => cashoutFilter === "all" || r.status === cashoutFilter)
                  .map((r: any) => (
                    <div key={r.id} className={`rounded-xl border p-4 space-y-3 ${
                      r.status === "pending" ? "border-amber-300 bg-amber-50/30 dark:bg-amber-950/10" :
                      r.status === "approved" ? "border-blue-300 bg-blue-50/30 dark:bg-blue-950/10" :
                      r.status === "paid" ? "border-green-300 bg-green-50/30 dark:bg-green-950/10" :
                      "border-border bg-card"
                    }`}>
                      {/* Top row */}
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-lg text-primary">${parseFloat(r.amountUsd).toFixed(2)}</span>
                            <Badge className={`text-[10px] border-0 ${
                              r.status === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                              r.status === "approved" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                              r.status === "paid" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                              "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            }`}>
                              {r.status === "pending" ? "⏳ Annatant" : r.status === "approved" ? "✓ Apwouve" : r.status === "paid" ? "✅ Peye" : "✗ Rejte"}
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {r.method === "moncash" ? "📱 MonCash" : "🤝 Ajant"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">#{r.id} · {new Date(r.createdAt).toLocaleString()}</p>
                        </div>
                      </div>

                      {/* User info */}
                      <div className="bg-muted/30 rounded-lg p-2.5 space-y-1 text-xs">
                        <p><span className="text-muted-foreground">Itilizatè:</span> <strong>{r.userName}</strong> ({r.userEmail})</p>
                        {r.phone && <p><span className="text-muted-foreground">Nimewo MonCash:</span> <span className="font-mono font-bold">{r.phone}</span></p>}
                        {r.agentLocation && <p><span className="text-muted-foreground">Kote ajant:</span> {r.agentLocation}</p>}
                        {r.otpCode && (
                          <p className="flex items-center gap-1.5">
                            <KeyRound className="h-3 w-3 text-violet-500" />
                            <span className="text-muted-foreground">Kòd OTP:</span>
                            <span className="font-mono font-black text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30 px-1.5 py-0.5 rounded text-sm tracking-widest">
                              {r.otpCode}
                            </span>
                            {r.otpUsed && <span className="text-green-600 text-[10px]">· itilize</span>}
                          </p>
                        )}
                        {r.adminNote && <p><span className="text-muted-foreground">Nòt admin:</span> {r.adminNote}</p>}
                      </div>

                      {/* Action area */}
                      {r.status === "pending" && (
                        <div className="space-y-2">
                          <Input
                            placeholder="Nòt admin (opsyonèl)"
                            value={cashoutNote[r.id] ?? ""}
                            onChange={e => setCashoutNote(prev => ({ ...prev, [r.id]: e.target.value }))}
                            className="h-8 text-xs"
                          />
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              size="sm"
                              className="h-8 text-xs bg-green-600 hover:bg-green-700"
                              disabled={cashoutActioning === r.id}
                              onClick={() => handleCashoutReview(r.id, "approve")}
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {r.method === "agent" ? "Apwouve + Jenere Kòd" : "Apwouve"}
                            </Button>
                            {r.method === "moncash" && (
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                                disabled={cashoutActioning === r.id}
                                onClick={() => handleCashoutReview(r.id, "paid")}
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />Mak Peye (MonCash)
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-8 text-xs"
                              disabled={cashoutActioning === r.id}
                              onClick={() => handleCashoutReview(r.id, "reject")}
                            >
                              <XCircle className="h-3 w-3 mr-1" />Rejte + Rembourseman
                            </Button>
                          </div>
                        </div>
                      )}
                      {r.status === "approved" && r.method === "moncash" && (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-blue-600 hover:bg-blue-700"
                          disabled={cashoutActioning === r.id}
                          onClick={() => handleCashoutReview(r.id, "paid")}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />Konfime Peman MonCash
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
          )}
        </TabsContent>

        {/* ── Seller MonCash Payouts ── */}
        <TabsContent value="seller-payouts">
          {!can("payments") ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sèlman Admin Finansyèl ka jere peman vendè yo.</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">403 Forbidden</p>
            </div>
          ) : (
          <div className="space-y-6">

            {/* ── MonCash Account Verifications ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />Vèrifikasyon Kont MonCash Vendè
                  <Badge variant="outline">{sellerPayoutAccounts.filter((a: any) => a.moncashNumber && !a.moncashVerified && !a.moncashRejectedReason).length} annatant</Badge>
                </h2>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadSellerPayouts}>
                  <RefreshCw className="h-3 w-3 mr-1" />Refresh
                </Button>
              </div>

              {sellerAccountsLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Ap chaje…</div>
              ) : sellerPayoutAccounts.filter((a: any) => a.moncashNumber).length === 0 ? (
                <div className="text-center py-8 bg-card border border-border rounded-xl">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-semibold">Pa gen kont MonCash pou verifye</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sellerPayoutAccounts.filter((a: any) => a.moncashNumber).map((a: any) => (
                    <div key={`mc-${a.id}`} className={`rounded-xl border p-4 space-y-2 ${
                      a.moncashVerified ? "border-green-300 bg-green-50/30 dark:bg-green-950/20" :
                      a.moncashRejectedReason ? "border-red-300 bg-red-50/30 dark:bg-red-950/20" :
                      "border-amber-300 bg-amber-50/30 dark:bg-amber-950/20"
                    }`}>
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <img src={a.sellerAvatar ?? undefined} alt="" />
                            <AvatarFallback>{(a.sellerName ?? "?")[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold">{a.sellerName}</p>
                            <p className="text-xs text-muted-foreground">{a.sellerEmail}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-sm">{a.moncashNumber}</span>
                          {a.moncashVerified ? (
                            <Badge className="bg-green-100 text-green-700 border-0 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Verifye</Badge>
                          ) : a.moncashRejectedReason ? (
                            <Badge className="bg-red-100 text-red-700 border-0 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejte</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]"><Clock className="h-3 w-3 mr-1" />Annatant</Badge>
                          )}
                        </div>
                      </div>

                      {a.moncashRejectedReason && (
                        <p className="text-xs text-red-600">Rezon: {a.moncashRejectedReason}</p>
                      )}

                      {!a.moncashVerified && (
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                            disabled={sellerAccountActioning === a.id}
                            onClick={() => handleVerifySellerAccount(a.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Verifye
                          </Button>
                          {sellerAccountRejectId === a.id ? (
                            <div className="flex gap-2 items-center flex-1">
                              <Input
                                value={sellerAccountRejectReason}
                                onChange={e => setSellerAccountRejectReason(e.target.value)}
                                placeholder="Rezon rejè (obligatwa)…"
                                className="h-7 text-xs flex-1"
                              />
                              <Button size="sm" variant="destructive" className="h-7 text-xs"
                                disabled={!sellerAccountRejectReason.trim() || sellerAccountActioning === a.id}
                                onClick={() => handleRejectSellerAccount(a.id, sellerAccountRejectReason)}>
                                Konfime Rejè
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                onClick={() => { setSellerAccountRejectId(null); setSellerAccountRejectReason(""); }}>
                                Anile
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="destructive" className="h-7 text-xs"
                              onClick={() => setSellerAccountRejectId(a.id)}>
                              <XCircle className="h-3 w-3 mr-1" />Rejte
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Bank Account Verifications ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-500" />Vèrifikasyon Kont Labank Vendè
                  <Badge variant="outline">{sellerPayoutAccounts.filter((a: any) => a.bankAccountNumber && !a.bankVerified && !a.bankRejectedReason).length} annatant</Badge>
                </h2>
              </div>

              {sellerAccountsLoading ? null : sellerPayoutAccounts.filter((a: any) => a.bankAccountNumber).length === 0 ? (
                <div className="text-center py-8 bg-card border border-border rounded-xl">
                  <CheckCircle2 className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-semibold">Pa gen kont labank pou verifye</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sellerPayoutAccounts.filter((a: any) => a.bankAccountNumber).map((a: any) => (
                    <div key={`bank-${a.id}`} className={`rounded-xl border p-4 space-y-2 ${
                      a.bankVerified ? "border-green-300 bg-green-50/30 dark:bg-green-950/20" :
                      a.bankRejectedReason ? "border-red-300 bg-red-50/30 dark:bg-red-950/20" :
                      "border-indigo-300 bg-indigo-50/30 dark:bg-indigo-950/20"
                    }`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <img src={a.sellerAvatar ?? undefined} alt="" />
                            <AvatarFallback>{(a.sellerName ?? "?")[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold">{a.sellerName}</p>
                            <p className="text-xs text-muted-foreground">{a.sellerEmail}</p>
                          </div>
                        </div>
                        <div className="text-right space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">{a.bankName}</p>
                          <p className="text-xs text-muted-foreground">Pwopriyetè: {a.bankAccountName}</p>
                          <p className="font-mono text-xs font-bold">{a.bankAccountNumber}</p>
                          {a.bankVerified ? (
                            <Badge className="bg-green-100 text-green-700 border-0 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-1" />Verifye</Badge>
                          ) : a.bankRejectedReason ? (
                            <Badge className="bg-red-100 text-red-700 border-0 text-[10px]"><XCircle className="h-3 w-3 mr-1" />Rejte</Badge>
                          ) : (
                            <Badge className="bg-indigo-100 text-indigo-700 border-0 text-[10px]"><Clock className="h-3 w-3 mr-1" />Annatant</Badge>
                          )}
                        </div>
                      </div>

                      {a.bankRejectedReason && (
                        <p className="text-xs text-red-600">Rezon: {a.bankRejectedReason}</p>
                      )}

                      {!a.bankVerified && (
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                            disabled={sellerAccountActioning === a.id}
                            onClick={() => handleVerifyBankAccount(a.id)}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />Verifye Labank
                          </Button>
                          {sellerAccountRejectId === a.id + 100000 ? (
                            <div className="flex gap-2 items-center flex-1">
                              <Input
                                value={sellerAccountRejectReason}
                                onChange={e => setSellerAccountRejectReason(e.target.value)}
                                placeholder="Rezon rejè labank (obligatwa)…"
                                className="h-7 text-xs flex-1"
                              />
                              <Button size="sm" variant="destructive" className="h-7 text-xs"
                                disabled={!sellerAccountRejectReason.trim() || sellerAccountActioning === a.id}
                                onClick={() => handleRejectBankAccount(a.id, sellerAccountRejectReason)}>
                                Konfime Rejè
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 text-xs"
                                onClick={() => { setSellerAccountRejectId(null); setSellerAccountRejectReason(""); }}>
                                Anile
                              </Button>
                            </div>
                          ) : (
                            <Button size="sm" variant="destructive" className="h-7 text-xs"
                              onClick={() => setSellerAccountRejectId(a.id + 100000)}>
                              <XCircle className="h-3 w-3 mr-1" />Rejte Labank
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Payout Queue ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h2 className="text-base font-bold flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-orange-500" />Kòmand MonCash pou Peye Vendè
                </h2>
                <div className="flex gap-1 flex-wrap">
                  {(["pending", "paid", "all"] as const).map(f => (
                    <Button key={f} size="sm" variant={sellerPayoutsFilter === f ? "default" : "outline"} className="h-7 text-xs"
                      onClick={() => setSellerPayoutsFilter(f)}>
                      {f === "pending" ? "Annatant" : f === "paid" ? "Peye" : "Tout"}
                      {f === "pending" && sellerPayouts.filter((p: any) => p.status === "pending").length > 0 && (
                        <span className="ml-1 bg-orange-500 text-white text-[9px] font-black rounded-full px-1">
                          {sellerPayouts.filter((p: any) => p.status === "pending").length}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>

              {sellerPayoutsLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Ap chaje…</div>
              ) : sellerPayouts.filter((p: any) => sellerPayoutsFilter === "all" || p.status === sellerPayoutsFilter).length === 0 ? (
                <div className="text-center py-8 bg-card border border-border rounded-xl">
                  <Wallet className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-semibold">Pa gen peman vendè annatant</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sellerPayouts
                    .filter((p: any) => sellerPayoutsFilter === "all" || p.status === sellerPayoutsFilter)
                    .map((p: any) => (
                      <div key={p.id} className={`rounded-xl border p-4 space-y-3 ${
                        p.status === "pending" ? "border-orange-300 bg-orange-50/30" : "border-green-300 bg-green-50/30"
                      }`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <img src={p.sellerAvatar ?? undefined} alt="" />
                              <AvatarFallback>{(p.sellerName ?? "?")[0]}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold">{p.sellerName}</p>
                              <p className="text-xs text-muted-foreground">{p.listingTitle ?? `Kòmand #${p.transactionId}`}</p>
                            </div>
                          </div>
                          <Badge className={`text-[10px] border-0 ${p.status === "pending" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>
                            {p.status === "pending" ? "⏳ Annatant" : "✅ Peye"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div className="bg-card rounded-lg p-2 border border-border">
                            <p className="text-muted-foreground">Montant total</p>
                            <p className="font-bold">${parseFloat(p.grossAmount).toFixed(2)}</p>
                          </div>
                          <div className="bg-card rounded-lg p-2 border border-border">
                            <p className="text-muted-foreground">Kòmisyon ({(p.commissionRate * 100).toFixed(0)}%)</p>
                            <p className="font-bold text-red-600">-${parseFloat(p.commissionAmount).toFixed(2)}</p>
                          </div>
                          <div className="bg-card rounded-lg p-2 border border-border">
                            <p className="text-muted-foreground">Vendè resevwa</p>
                            <p className="font-black text-green-600">${parseFloat(p.netAmount).toFixed(2)}</p>
                          </div>
                          <div className="bg-card rounded-lg p-2 border border-border">
                            <p className="text-muted-foreground">Metòd</p>
                            <p className="font-bold uppercase">{p.paymentMethod}</p>
                          </div>
                        </div>

                        {p.payoutMoncashNumber ? (
                          <div className="flex items-center gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg p-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                            <span>Voye MonCash a:</span>
                            <span className="font-mono font-bold">{p.payoutMoncashNumber}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            <span>Vendè pa gen nimewo MonCash verifye. Verifye kont li anvan voye.</span>
                          </div>
                        )}

                        {p.status === "pending" && (
                          <div className="flex gap-2 flex-wrap items-center">
                            <Input
                              value={sellerPayoutNote[p.id] ?? ""}
                              onChange={e => setSellerPayoutNote(prev => ({ ...prev, [p.id]: e.target.value }))}
                              placeholder="Nòt (ref MonCash, etc.)"
                              className="h-8 text-xs flex-1"
                            />
                            <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700"
                              disabled={sellerPayoutActioning === p.id}
                              onClick={() => handleMarkPayoutPaid(p.id)}>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {sellerPayoutActioning === p.id ? "Ap sove…" : "Konfime Peye"}
                            </Button>
                          </div>
                        )}

                        {p.status === "paid" && p.paidAt && (
                          <p className="text-xs text-muted-foreground">
                            Peye le {new Date(p.paidAt).toLocaleDateString("fr-HT")}{p.notes ? ` · ${p.notes}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
          )}
        </TabsContent>

        {/* ── Promo Codes & Campaign ── */}
        <TabsContent value="promo">
          <div className="space-y-6">
            {/* Campaign settings */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="font-bold flex items-center gap-2"><Gift className="h-4 w-4 text-primary" />Paramèt Bonis Fidèlite</h3>
              {campaignDraft ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Sistèm bonis aktif</label>
                    <button
                      onClick={() => setCampaignDraft((d: any) => ({ ...d, enabled: !d.enabled }))}
                      className={`w-11 h-6 rounded-full transition-colors ${campaignDraft.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                    >
                      <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${campaignDraft.enabled ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Sèy depans (USD)</label>
                      <input type="number" min="1" value={campaignDraft.threshold} onChange={e => setCampaignDraft((d: any) => ({ ...d, threshold: parseFloat(e.target.value) || 20 }))} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Bonis pa sèy (USD)</label>
                      <input type="number" min="0.01" step="0.01" value={campaignDraft.bonusAmount} onChange={e => setCampaignDraft((d: any) => ({ ...d, bonusAmount: parseFloat(e.target.value) || 1 }))} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                    </div>
                  </div>
                  <div className="border-t border-border pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium flex items-center gap-1"><Timer className="h-3.5 w-3.5 text-amber-500" />Kanpay limite</label>
                      <button
                        onClick={() => setCampaignDraft((d: any) => ({ ...d, campaignActive: !d.campaignActive }))}
                        className={`w-11 h-6 rounded-full transition-colors ${campaignDraft.campaignActive ? "bg-amber-500" : "bg-muted-foreground/30"}`}
                      >
                        <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1 ${campaignDraft.campaignActive ? "translate-x-5" : "translate-x-0"}`} />
                      </button>
                    </div>
                    {campaignDraft.campaignActive && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Miltiplikatè</label>
                          <input type="number" min="1" max="10" step="0.5" value={campaignDraft.campaignMultiplier} onChange={e => setCampaignDraft((d: any) => ({ ...d, campaignMultiplier: parseFloat(e.target.value) || 2 }))} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground block mb-1">Fini nan (dat)</label>
                          <input type="datetime-local" value={(() => {
                            if (!campaignDraft.campaignEndsAt) return "";
                            try { return new Date(campaignDraft.campaignEndsAt).toISOString().slice(0, 16); }
                            catch { return ""; }
                          })()} onChange={e => setCampaignDraft((d: any) => {
                            try { return { ...d, campaignEndsAt: e.target.value ? new Date(e.target.value).toISOString() : "" }; }
                            catch { return d; }
                          })} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-muted-foreground block mb-1">Non kanpay</label>
                          <input type="text" value={campaignDraft.campaignLabel} onChange={e => setCampaignDraft((d: any) => ({ ...d, campaignLabel: e.target.value }))} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" placeholder="Bònus Espesyal" />
                        </div>
                      </div>
                    )}
                  </div>
                  <Button size="sm" onClick={saveCampaign} disabled={campaignSaving}>
                    {campaignSaving ? "Ap sove…" : "Sove paramèt"}
                  </Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={loadPromo}>Chaje paramèt</Button>
              )}
            </div>

            {/* Promo codes list + create */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold flex items-center gap-2"><Ticket className="h-4 w-4 text-green-500" />Kòd Promo</h3>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadPromo}>
                  <RefreshCw className="h-3 w-3 mr-1" />Refresh
                </Button>
              </div>

              {/* Create form */}
              <div className="bg-muted/40 rounded-xl p-4 space-y-3 border border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Nouvo kòd</p>
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="KÒD *" value={newCode.code} onChange={e => setNewCode(c => ({ ...c, code: e.target.value.toUpperCase() }))} className="col-span-2 h-9 rounded-lg border border-border bg-background px-3 text-sm font-mono" />
                  <select value={newCode.discountType} onChange={e => setNewCode(c => ({ ...c, discountType: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
                    <option value="percent">% Reduksyon</option>
                    <option value="fixed">$ Fiks</option>
                  </select>
                  <input type="number" placeholder="Valè *" min="0.01" step="0.01" value={newCode.discountValue} onChange={e => setNewCode(c => ({ ...c, discountValue: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                  <input type="number" placeholder="Min kòmand $" min="0" step="0.01" value={newCode.minOrderValue} onChange={e => setNewCode(c => ({ ...c, minOrderValue: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                  <input type="number" placeholder="Max itilizasyon total" min="1" value={newCode.maxUses} onChange={e => setNewCode(c => ({ ...c, maxUses: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                  <input type="number" placeholder="Max / user" min="1" value={newCode.maxUsesPerUser} onChange={e => setNewCode(c => ({ ...c, maxUsesPerUser: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                  <input type="datetime-local" value={newCode.expiresAt} onChange={e => setNewCode(c => ({ ...c, expiresAt: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm" title="Dat ekspirasyon" />
                  <input type="text" placeholder="Deskripsyon (opsyonèl)" value={newCode.description} onChange={e => setNewCode(c => ({ ...c, description: e.target.value }))} className="col-span-2 h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                </div>
                <Button size="sm" onClick={createPromoCode} disabled={promoCodeSaving || !newCode.code.trim() || !newCode.discountValue}>
                  {promoCodeSaving ? "Ap kreye…" : <><Plus className="h-3.5 w-3.5 mr-1" />Kreye Kòd</>}
                </Button>
              </div>

              {/* Code list */}
              {promoCodesLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Ap chaje…</p>
              ) : promoCodes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ticket className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Pa gen kòd promo ankò</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {promoCodes.map((c: any) => (
                    <div key={c.id} className={`flex items-start gap-3 p-3 rounded-xl border ${c.active ? "border-border" : "border-border/40 opacity-60"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm">{c.code}</span>
                          <Badge variant={c.active ? "default" : "secondary"} className="text-[10px] h-4 px-1">{c.active ? "Aktif" : "Inaktif"}</Badge>
                          <span className="text-xs text-primary font-semibold">
                            {c.discountType === "percent" ? `${c.discountValue}% off` : `$${c.discountValue} off`}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                          <span>{c.usesCount}{c.maxUses ? `/${c.maxUses}` : ""} itilizasyon</span>
                          {c.minOrderValue > 0 && <span>Min: ${c.minOrderValue}</span>}
                          {c.expiresAt && <span>Exp: {new Date(c.expiresAt).toLocaleDateString("fr-HT")}</span>}
                          {c.description && <span className="truncate max-w-xs">{c.description}</span>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs shrink-0"
                        onClick={() => togglePromoCode(c.id, !c.active)}
                      >
                        {c.active ? "Dezaktive" : "Aktive"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Vendor Subscriptions ── */}
        <TabsContent value="subscriptions">
          <div className="space-y-5">

            {/* ── Summary bar ── */}
            {s && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-purple-400">{s.activeSubscriptions ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Aktif</p>
                </div>
                <div className={`rounded-xl p-3 text-center border ${(s.graceSubscriptions ?? 0) > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/40 border-border/40"}`}>
                  <p className={`text-xl font-bold ${(s.graceSubscriptions ?? 0) > 0 ? "text-amber-400" : "text-muted-foreground"}`}>{s.graceSubscriptions ?? 0}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Tan Gras (5j)</p>
                </div>
                <div className="bg-muted/40 border border-border/40 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{adminSubs.filter((r: any) => r.sub?.plan === "vip" && r.sub?.status === "active").length}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">VIP $50/mwa</p>
                </div>
              </div>
            )}

            {/* ── Grant form ── */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="font-bold text-sm flex items-center gap-2"><Crown className="h-4 w-4 text-amber-500" />Ba Abònman Manyèlman</h3>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" placeholder="ID Itilizatè *" value={grantForm.userId} onChange={e => setGrantForm(f => ({ ...f, userId: e.target.value }))} className="col-span-2 h-9 rounded-lg border border-border bg-background px-3 text-sm" />
                <select value={grantForm.plan} onChange={e => setGrantForm(f => ({ ...f, plan: e.target.value }))} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
                  <option value="standard">Standard ($15/mwa)</option>
                  <option value="premium">Premium ($30/mwa)</option>
                  <option value="vip">VIP ($50/mwa)</option>
                </select>
                <input type="number" min="1" max="12" value={grantForm.months} onChange={e => setGrantForm(f => ({ ...f, months: e.target.value }))} placeholder="Mwa" className="h-9 rounded-lg border border-border bg-background px-3 text-sm" />
              </div>
              <Button size="sm" onClick={grantSubscription} disabled={grantSaving || !grantForm.userId}>
                {grantSaving ? "Ap sove…" : <><Plus className="h-3.5 w-3.5 mr-1" />Ba Abònman</>}
              </Button>
            </div>

            {/* ── Subscriptions list ── */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-sm flex items-center gap-2"><Crown className="h-4 w-4 text-primary" />Tout Abòman</h3>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadAdminSubscriptions}>
                  <RefreshCw className="h-3 w-3 mr-1" />Refresh
                </Button>
              </div>

              {/* Search + filter */}
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Chèche non, email, ID…"
                  value={adminSubsSearch}
                  onChange={e => setAdminSubsSearch(e.target.value)}
                  className="flex-1 min-w-0 h-8 rounded-lg border border-border bg-background px-3 text-xs"
                />
                <select
                  value={adminSubsFilter}
                  onChange={e => setAdminSubsFilter(e.target.value as any)}
                  className="h-8 rounded-lg border border-border bg-background px-2 text-xs shrink-0"
                >
                  <option value="all">Tout</option>
                  <option value="active">Aktif</option>
                  <option value="vip">VIP sèlman</option>
                  <option value="grace">Tan Gras</option>
                </select>
              </div>

              {adminSubsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Ap chaje…</p>
              ) : adminSubs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Crown className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Pa gen abònman ankò</p>
                </div>
              ) : (() => {
                const q = adminSubsSearch.toLowerCase();
                const filtered = adminSubs.filter((row: any) => {
                  const sub = row.sub; const user = row.user;
                  if (adminSubsFilter === "active" && sub.status !== "active") return false;
                  if (adminSubsFilter === "vip" && sub.plan !== "vip") return false;
                  if (adminSubsFilter === "grace" && sub.status !== "grace_period") return false;
                  if (!q) return true;
                  return (
                    String(sub.userId).includes(q) ||
                    (user?.name ?? "").toLowerCase().includes(q) ||
                    (user?.email ?? "").toLowerCase().includes(q)
                  );
                });
                if (filtered.length === 0) return (
                  <p className="text-sm text-muted-foreground text-center py-4">Pa gen rezilta</p>
                );
                const planColors: Record<string, string> = { basic: "bg-muted text-muted-foreground", standard: "bg-blue-500/15 text-blue-500", premium: "bg-primary/15 text-primary", vip: "bg-amber-500/20 text-amber-600" };
                const planLabels: Record<string, string> = { standard: "Standard $15", premium: "Premium $30", vip: "VIP $50", basic: "Basic" };
                return (
                  <div className="space-y-2">
                    {filtered.map((row: any) => {
                      const sub = row.sub; const user = row.user;
                      const isActive = sub.status === "active";
                      const isGrace = sub.status === "grace_period";
                      const now = new Date();
                      const graceUntil = sub.graceUntil ? new Date(sub.graceUntil) : null;
                      const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : null;
                      const nextBilling = sub.nextBillingDate ? new Date(sub.nextBillingDate) : expiresAt;
                      const daysLeft = graceUntil ? Math.max(0, Math.ceil((graceUntil.getTime() - now.getTime()) / 86400000)) : null;
                      const startedAt = sub.startedAt ? new Date(sub.startedAt) : sub.createdAt ? new Date(sub.createdAt) : null;
                      return (
                        <div key={sub.id} className={`p-3 rounded-xl border transition-colors ${isActive ? "border-border" : isGrace ? "border-amber-500/40 bg-amber-500/5" : "border-border/40 opacity-55"}`}>
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Row 1: name + badges */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-semibold truncate">{user?.name ?? `Itilizatè #${sub.userId}`}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${planColors[sub.plan] ?? planColors.basic}`}>{planLabels[sub.plan] ?? sub.plan}</span>
                                {isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-semibold">✓ Aktif</span>}
                                {isGrace && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold">⚠ Tan Gras {daysLeft !== null ? `${daysLeft}j` : ""}</span>}
                                {!isActive && !isGrace && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{sub.status}</span>}
                              </div>
                              {/* Row 2: ID + email */}
                              <div className="text-[10px] text-muted-foreground mt-0.5">
                                ID #{sub.userId}{user?.email ? ` · ${user.email}` : ""}
                              </div>
                              {/* Row 3: dates + price */}
                              <div className="flex gap-3 flex-wrap mt-1">
                                {startedAt && (
                                  <span className="text-[10px] text-muted-foreground">
                                    📅 Kòmanse: <span className="text-foreground font-medium">{startedAt.toLocaleDateString("fr-HT")}</span>
                                  </span>
                                )}
                                {nextBilling && (isActive || isGrace) && (
                                  <span className="text-[10px] text-muted-foreground">
                                    🔄 Pwochen peman: <span className={`font-medium ${isGrace ? "text-amber-500" : "text-foreground"}`}>{nextBilling.toLocaleDateString("fr-HT")}</span>
                                  </span>
                                )}
                                {sub.amountUsd != null && sub.amountUsd > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    💰 <span className="text-foreground font-medium">${sub.amountUsd}/mwa</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            {(isActive || isGrace) && sub.plan !== "basic" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs shrink-0 text-red-500 border-red-500/30 hover:bg-red-500/10 mt-0.5" onClick={() => revokeSubscription(sub.userId)}>
                                Revoké
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-muted-foreground text-center pt-1">{filtered.length} rezilta</p>
                  </div>
                );
              })()}
            </div>
          </div>
        </TabsContent>

        {/* ── Transactions Hub ── */}
        <TabsContent value="transactions-hub">
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-base font-bold flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-emerald-500" />
                {t("adminBanner.txHubTitle")}
              </h2>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadWalletAdmin}>
                <RefreshCw className="h-3 w-3 mr-1" />{t("adminBanner.txHubRefresh")}
              </Button>
            </div>

            {/* Info banner */}
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                💡 {t("adminBanner.txHubInfo")}
              </p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("adminBanner.txHubSearch")}
                value={usersSheetSearch}
                onChange={e => setUsersSheetSearch(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>

            {/* User list */}
            {walletBalances.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <div className="h-14 w-14 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <ArrowLeftRight className="h-7 w-7 text-emerald-400" />
                </div>
                <p className="text-sm text-muted-foreground">{t("adminBanner.txHubLoading")}</p>
              </div>
            ) : (() => {
              const q = usersSheetSearch.trim().toLowerCase();
              const list = q.length >= 1
                ? walletBalances.filter((w: any) =>
                    (w.userName ?? "").toLowerCase().includes(q) ||
                    (w.userEmail ?? "").toLowerCase().includes(q) ||
                    String(w.userId).includes(q)
                  )
                : walletBalances;
              return (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{list.length} {t("adminBanner.txHubCount")}</p>
                  {list.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-10">{t("adminBanner.txHubNoResult")} "{usersSheetSearch}"</p>
                  ) : list.map((w: any) => {
                    const bal = parseFloat(w.balanceUsd ?? 0);
                    const initials = (w.userName ?? "?")[0].toUpperCase();
                    return (
                      <button
                        key={w.userId}
                        onClick={() => openWalletDetail(w.userId)}
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
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-emerald-500 transition-colors" />
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </TabsContent>

        {/* ── Agents Management ── */}
        <TabsContent value="agents">
          {!can("payments") ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <Lock className="h-7 w-7 text-red-600 dark:text-red-400" />
              </div>
              <p className="font-semibold text-red-600 dark:text-red-400">Aksè Refize</p>
              <p className="text-sm text-muted-foreground max-w-xs">Sèlman Admin Finansyèl ka jere ajant platfòm nan.</p>
              <p className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">403 Forbidden</p>
            </div>
          ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-violet-500" />Jere Ajant
              </h2>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={loadAgents}>
                <RefreshCw className="h-3 w-3 mr-1" />Refresh
              </Button>
            </div>

            {/* Info */}
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-xs text-blue-400 font-semibold mb-1">📋 Kòman ajoute yon ajant:</p>
              <p className="text-xs text-blue-300/80">Chèche user la anba, klike "Fè Ajant". Ajant ka verifye kòd retrait epi pran peman.</p>
            </div>

            {/* Agent search from users */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold">Ajoute Nouvo Ajant</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Chèche non oswa imèl user…"
                  value={agentSearch}
                  onChange={e => { setAgentSearch(e.target.value); setAgentPickerUserId(null); }}
                  className="pl-9 h-9 text-sm"
                />
              </div>
              {agentSearch.trim().length >= 2 && (() => {
                const q = agentSearch.trim().toLowerCase();
                const matches = (allUsers as any[]).filter(u =>
                  u.role !== "agent" && !u.isAdmin && !u.isSuperAdmin &&
                  (u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q))
                ).slice(0, 8);
                if (matches.length === 0) return (
                  <p className="text-xs text-muted-foreground px-1">Okenn user jwenn. Verifye non oswa imèl.</p>
                );
                return (
                  <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
                    {matches.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                        <Avatar className="h-8 w-8 shrink-0">
                          <AvatarImage src={u.avatar} />
                          <AvatarFallback className="text-xs bg-primary text-primary-foreground">{u.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-violet-600 hover:bg-violet-700 shrink-0"
                          disabled={agentTogglingId === u.id}
                          onClick={async () => { await handleToggleAgent(u.id, true); setAgentSearch(""); }}
                        >
                          <ShieldCheck className="h-3 w-3 mr-1" />Fè Ajant
                        </Button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Current agents list */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Ajant Aktyèl</h3>
                <Badge variant="outline">{agentsList.length} ajant</Badge>
              </div>
              {agentsLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Ap chaje…</p>
              ) : agentsList.length === 0 ? (
                <div className="text-center py-8">
                  <ShieldCheck className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Pa gen ajant ankò</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Chèche yon user anlè pou fè l ajant</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {agentsList.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                      <Avatar className="h-9 w-9 shrink-0">
                        <AvatarFallback className="text-xs bg-violet-600 text-white">{a.name?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{a.email}</p>
                        {a.location && <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><MapPin className="h-3 w-3" />{a.location}</p>}
                      </div>
                      <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400 text-[10px] border-0 shrink-0">
                        <ShieldCheck className="h-3 w-3 mr-1" />Ajant
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0"
                        disabled={agentTogglingId === a.id}
                        onClick={() => handleToggleAgent(a.id, false)}
                      >
                        <X className="h-3 w-3 mr-1" />Retire
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            ── Demand Chofe (Driver Applications) ──
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="chofe-apps">
          <AdminApplicationsPanel type="driver" scopeLock={scopeLock} />
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            ── Demand Anje Otorizé (Authorized Agent Applications) ──
        ══════════════════════════════════════════════════════════════ */}
        {/* ── Employer Verification Applications ── */}
        <TabsContent value="loans">
          <AdminLoanPanel />
        </TabsContent>

        <TabsContent value="flex-card">
          <AdminFlexCardPanel />
        </TabsContent>

        <TabsContent value="employer-apps">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-emerald-500" />Verifye Anplwayè Djòb
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={employerAppsFilter}
                  onChange={e => { const v = e.target.value as any; setEmployerAppsFilter(v); loadEmployerApps(v); }}
                  className="h-7 text-xs rounded-md border border-input bg-background px-2"
                >
                  <option value="pending">Annatant</option>
                  <option value="approved">Apwouve</option>
                  <option value="rejected">Rejete</option>
                </select>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => loadEmployerApps()}>
                  <RefreshCw className="h-3 w-3 mr-1" />Refresh
                </Button>
              </div>
            </div>

            {employerAppsLoading ? (
              <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-muted animate-pulse" />)}</div>
            ) : employerApps.length === 0 ? (
              <div className="text-center py-16 bg-card border border-card-border rounded-xl">
                <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">Pa gen aplikasyon {employerAppsFilter}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {employerApps.map((app: any) => (
                  <div key={app.id} className="bg-card border border-card-border rounded-xl p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {app.user_avatar ? (
                          <img src={app.user_avatar} className="w-10 h-10 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold">{(app.user_name ?? "?")[0]}</div>
                        )}
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{app.user_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{app.user_email}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs px-2 py-1 rounded-full font-bold ${app.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : app.status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                        {app.status === "approved" ? "Apwouve" : app.status === "rejected" ? "Rejete" : "Annatant"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-muted-foreground">Non konplè: </span><span className="font-medium">{app.full_name}</span></div>
                      <div><span className="text-muted-foreground">Telefòn: </span><span className="font-medium">{app.phone}</span></div>
                      {app.whatsapp && <div><span className="text-muted-foreground">WhatsApp: </span><span className="font-medium">{app.whatsapp}</span></div>}
                      <div className="col-span-2"><span className="text-muted-foreground">Adrès: </span><span className="font-medium">{app.address}</span></div>
                      {app.business_name && <div><span className="text-muted-foreground">Biznis: </span><span className="font-medium">{app.business_name}</span></div>}
                      {app.business_address && <div><span className="text-muted-foreground">Adrès biznis: </span><span className="font-medium">{app.business_address}</span></div>}
                    </div>

                    {/* ── Photos dokiman aplikan ── */}
                    {(app.id_selfie || app.id_front || app.id_back || (app.business_photos?.length > 0)) && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Foto Dokiman</p>
                        <div className="flex flex-wrap gap-2">
                          {app.id_selfie && (
                            <a href={app.id_selfie} target="_blank" rel="noopener noreferrer" className="group relative">
                              <img src={app.id_selfie} alt="Selfie ID" className="h-20 w-20 object-cover rounded-lg border border-border group-hover:opacity-80 transition-opacity" />
                              <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/60 text-white rounded-b-lg py-0.5">Selfie ID</span>
                            </a>
                          )}
                          {app.id_front && (
                            <a href={app.id_front} target="_blank" rel="noopener noreferrer" className="group relative">
                              <img src={app.id_front} alt="ID Devan" className="h-20 w-20 object-cover rounded-lg border border-border group-hover:opacity-80 transition-opacity" />
                              <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/60 text-white rounded-b-lg py-0.5">ID Devan</span>
                            </a>
                          )}
                          {app.id_back && (
                            <a href={app.id_back} target="_blank" rel="noopener noreferrer" className="group relative">
                              <img src={app.id_back} alt="ID Dèyè" className="h-20 w-20 object-cover rounded-lg border border-border group-hover:opacity-80 transition-opacity" />
                              <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/60 text-white rounded-b-lg py-0.5">ID Dèyè</span>
                            </a>
                          )}
                          {(app.business_photos ?? []).map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative">
                              <img src={url} alt={`Biznis ${i + 1}`} className="h-20 w-20 object-cover rounded-lg border border-border group-hover:opacity-80 transition-opacity" />
                              <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/60 text-white rounded-b-lg py-0.5">Biznis {i + 1}</span>
                            </a>
                          ))}
                        </div>
                        {app.social_links && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {(Array.isArray(app.social_links) ? app.social_links : [app.social_links]).map((link: string, i: number) => (
                              link ? <a key={i} href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="h-3 w-3" />{link}</a> : null
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {app.rejection_reason && (
                      <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded px-2 py-1">Rezon: {app.rejection_reason}</p>
                    )}

                    {app.status === "pending" && (
                      <>
                        {employerRejectId === app.id ? (
                          <div className="space-y-2">
                            <input
                              className="w-full h-8 text-xs rounded border border-input bg-background px-2"
                              placeholder="Rezon rejet (opsyonèl)..."
                              value={employerRejectNote}
                              onChange={e => setEmployerRejectNote(e.target.value)}
                            />
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEmployerRejectId(null)}>Anile</Button>
                              <Button size="sm" variant="destructive" className="h-7 text-xs" disabled={employerAppActioning === app.id} onClick={() => handleEmployerAction(app.id, "reject", employerRejectNote)}>
                                {employerAppActioning === app.id ? "..." : "Konfime Rejet"}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" disabled={employerAppActioning === app.id} onClick={() => handleEmployerAction(app.id, "approve")}>
                              {employerAppActioning === app.id ? "..." : "✓ Apwouve"}
                            </Button>
                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setEmployerRejectId(app.id)}>
                              ✕ Rejete
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="anje-apps">
          <AdminApplicationsPanel type="agent" scopeLock={scopeLock} />
        </TabsContent>

        {/* ── KYC Identity Verification ── */}
        <TabsContent value="kyc-identity">
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-black text-base flex items-center gap-2"><BadgeCheck className="h-5 w-5 text-blue-500" />Verifikasyon Idantite (KYC)</h3>
              <div className="flex gap-1">
                {(["pending","approved","rejected"] as const).map(s => (
                  <button key={s} onClick={() => { setKycIdFilter(s); loadKycIdApps(s); }}
                    className={`text-xs px-3 py-1 rounded-full border font-semibold transition-colors ${kycIdFilter === s ? "bg-blue-600 text-white border-blue-600" : "border-border text-muted-foreground hover:bg-accent"}`}>
                    {s === "pending" ? "Ap tann" : s === "approved" ? "Apwouve" : "Rejte"}
                  </button>
                ))}
              </div>
            </div>

            {kycIdLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : kycIdApps.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Pa gen aplikasyon KYC pou filtre sa a</div>
            ) : (
              <div className="grid gap-4">
                {kycIdApps.map((app: any) => (
                  <div key={app.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <p className="font-bold text-sm">{app.name}</p>
                        <p className="text-xs text-muted-foreground">{app.email} · {app.country}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Soumèt: {app.kyc_submitted_at ? new Date(app.kyc_submitted_at).toLocaleDateString() : "—"}</p>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${app.kyc_status === "approved" ? "bg-green-100 text-green-700 dark:bg-green-900/40" : app.kyc_status === "rejected" ? "bg-red-100 text-red-700 dark:bg-red-900/30" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30"}`}>
                        {app.kyc_status === "approved" ? "✅ Apwouve" : app.kyc_status === "rejected" ? "❌ Rejte" : "⏳ Ap tann"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {app.kyc_document_url && (
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">📄 Dokiman ({app.kyc_document_type ?? "ID"})</p>
                          <a href={app.kyc_document_url} target="_blank" rel="noopener noreferrer">
                            <img src={app.kyc_document_url} alt="KYC doc" className="w-full h-28 object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                          </a>
                        </div>
                      )}
                      {app.kyc_selfie_url && (
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1">🤳 Selfie</p>
                          <a href={app.kyc_selfie_url} target="_blank" rel="noopener noreferrer">
                            <img src={app.kyc_selfie_url} alt="KYC selfie" className="w-full h-28 object-cover rounded-lg border border-border hover:opacity-90 transition-opacity" />
                          </a>
                        </div>
                      )}
                    </div>

                    {app.kyc_status === "pending" && (
                      <div className="flex flex-col gap-2 pt-1 border-t border-border">
                        <input
                          type="text"
                          placeholder="Rezon pou rejeksyon (obligatwa si w rejte)"
                          className="w-full h-8 px-3 text-xs rounded-lg border border-input bg-background"
                          value={kycIdRejectReason[app.id] ?? ""}
                          onChange={e => setKycIdRejectReason(prev => ({ ...prev, [app.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleKycIdDecide(app.id, "approve")}
                            disabled={kycIdActioning === app.id}
                            className="flex-1 h-8 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                          >
                            {kycIdActioning === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <BadgeCheck className="h-3 w-3" />}
                            Apwouve
                          </button>
                          <button
                            onClick={() => handleKycIdDecide(app.id, "reject")}
                            disabled={kycIdActioning === app.id}
                            className="flex-1 h-8 text-xs font-bold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                          >
                            {kycIdActioning === app.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                            Rejte
                          </button>
                        </div>
                      </div>
                    )}
                    {app.kyc_rejection_reason && (
                      <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">Rezon: {app.kyc_rejection_reason}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── LEGACY INLINE PLACEHOLDER (kept for build safety, unreachable) ── */}

        {/* ── Delivery Analytics ── */}
        <TabsContent value="deliveries">
          <AdminDeliveryPanel />
        </TabsContent>

        {/* ── Enterprise Audit Trail ── */}
        {isSuperAdmin && (
          <TabsContent value="audit">
            <AdminAuditPanel />
          </TabsContent>
        )}

        {/* ── AI Translation Management ── */}
        <TabsContent value="translation">
          <AdminTranslationPanel />
        </TabsContent>

        {/* ── Kart Rechaj (Recharge Cards) ── */}
        <TabsContent value="recharge-cards">
          <div className="space-y-6">
            {/* Generate Form */}
            <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-green-500" />
                <h3 className="font-black text-base">Jenere Kart Rechaj</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Valè ($USD)</label>
                  <select className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={rcGenAmount} onChange={e => setRcGenAmount(e.target.value)}>
                    {[1, 2, 5, 10, 25, 50, 100].map(v => <option key={v} value={v}>${v}.00</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted-foreground mb-1 block">Kantite Kòd</label>
                  <Input type="number" min={1} max={500} value={rcGenQty} onChange={e => setRcGenQty(e.target.value)} className="h-9 text-sm" placeholder="10" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Dat Ekspire (opsyonèl)</label>
                <Input type="date" value={rcGenExpiry} onChange={e => setRcGenExpiry(e.target.value)} className="h-9 text-sm" />
              </div>
              <Button className="w-full font-bold" onClick={handleGenerateCards} disabled={rcGenLoading}>
                {rcGenLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Ap jenere…</> : <><Plus className="h-4 w-4 mr-2" />Jenere {rcGenQty || "?"} Kòd a ${rcGenAmount}</>}
              </Button>
            </div>

            {/* Generation Result */}
            {rcGenResult && (
              <div className="rounded-2xl border border-green-300 bg-green-50 dark:bg-green-950/20 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <p className="font-black text-green-800 dark:text-green-300">{rcGenResult.codes.length} kòd kreye ✓</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => downloadCardsCSV(rcGenResult.codes, parseFloat(rcGenAmount), rcGenResult.batchId)}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />CSV
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-mono">Batch: {rcGenResult.batchId}</p>
                <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                  {rcGenResult.codes.slice(0, 50).map(c => (
                    <div key={c} className="flex items-center gap-1.5 bg-white dark:bg-gray-800 rounded-lg px-2 py-1.5 border border-green-200 dark:border-green-800">
                      <span className="font-mono text-xs font-bold text-gray-900 dark:text-white flex-1">{c}</span>
                      <button onClick={() => navigator.clipboard.writeText(c)} className="text-muted-foreground hover:text-foreground shrink-0">
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {rcGenResult.codes.length > 50 && <p className="text-xs text-muted-foreground col-span-2 text-center">+{rcGenResult.codes.length - 50} kòd anplis — telechaje CSV pou tout yo</p>}
                </div>
              </div>
            )}

            {/* Cards List */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h3 className="font-black text-sm">Tout Kart yo</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{rechargeCards.length} total · {rechargeCards.filter((c: any) => c.status === "active").length} aktif · {rechargeCards.filter((c: any) => c.status === "redeemed").length} itilize</span>
                  <button onClick={loadRechargeCards} className="text-muted-foreground hover:text-foreground"><RefreshCw className={`h-4 w-4 ${rcCardsLoading ? "animate-spin" : ""}`} /></button>
                </div>
              </div>
              {rcCardsLoading ? (
                <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : rechargeCards.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">Okenn kart ankò. Jenere premye batch ou a anwo ↑</div>
              ) : (
                <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
                  {rechargeCards.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm font-bold text-foreground">{c.code}</p>
                        <p className="text-xs text-muted-foreground">{c.batchId} · {new Date(c.createdAt).toLocaleDateString()}</p>
                      </div>
                      <span className="text-sm font-black text-green-600">${c.amountUsd.toFixed(2)}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        c.status === "active"   ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        c.status === "redeemed" ? "bg-gray-100 text-gray-500 dark:bg-gray-800" :
                        "bg-red-100 text-red-600 dark:bg-red-900/30"
                      }`}>
                        {c.status === "active" ? "Aktif" : c.status === "redeemed" ? `Itilize${c.redeemedByName ? ` · ${c.redeemedByName}` : ""}` : c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── BNPL Admin Panel ── */}
        <TabsContent value="bnpl">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-green-600" />
                <h3 className="font-black text-base">Jere BNPL (Buy Now Pay Later)</h3>
              </div>
              <button onClick={loadBnplAdmin} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className={`h-4 w-4 ${bnplAdminLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {bnplAdminLoading && !bnplAdminSettings ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Ap chaje paramèt BNPL…</div>
            ) : (
              <>
                {/* Analytics Cards */}
                {bnplAdminAnalytics && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                      <p className="text-2xl font-black text-foreground">{bnplAdminAnalytics.totalSessions ?? 0}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Sesyon</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                      <p className="text-2xl font-black text-green-600">{bnplAdminAnalytics.completedSessions ?? 0}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Konplète</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                      <p className="text-2xl font-black text-primary">${(bnplAdminAnalytics.totalRevenue ?? 0).toFixed(0)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Revni Total</p>
                    </div>
                    <div className="rounded-xl border border-border bg-card p-4 text-center">
                      <p className="text-2xl font-black text-indigo-600">
                        {bnplAdminAnalytics.completedSessions > 0
                          ? Math.round((bnplAdminAnalytics.completedSessions / bnplAdminAnalytics.totalSessions) * 100)
                          : 0}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">To Konvèsyon</p>
                    </div>
                  </div>
                )}
                {bnplAdminAnalytics?.byProvider && Object.keys(bnplAdminAnalytics.byProvider).length > 0 && (
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                    <h4 className="font-bold text-sm">Sesyon pa Provider</h4>
                    {Object.entries(bnplAdminAnalytics.byProvider).map(([provider, count]) => (
                      <div key={provider} className="flex items-center justify-between">
                        <span className="text-sm capitalize font-medium">{provider}</span>
                        <span className="text-sm font-black text-primary">{count} sesyon</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Settings Form */}
                {bnplAdminSettings && (
                  <div className="rounded-2xl border border-border bg-card p-5 space-y-5">
                    <h4 className="font-bold text-sm">Paramèt Provider</h4>
                    {/* Provider Toggles */}
                    <div className="space-y-3">
                      {([
                        { key: "klarnaEnabled" as const, label: "Klarna", desc: "4 peman san enterè (0%)", color: "pink" },
                        { key: "afterpayEnabled" as const, label: "Afterpay / Clearpay", desc: "4 peman bi-mensyèl", color: "teal" },
                        { key: "affirmEnabled" as const, label: "Affirm", desc: "Peman mensyèl fleksib (US only)", color: "indigo" },
                      ] as const).map(({ key, label, desc, color }) => (
                        <div key={key} className={`flex items-center justify-between p-3 rounded-xl border ${
                          bnplAdminSettings[key]
                            ? color === "pink" ? "border-pink-200 bg-pink-50 dark:bg-pink-950/20 dark:border-pink-900"
                              : color === "teal" ? "border-teal-200 bg-teal-50 dark:bg-teal-950/20 dark:border-teal-900"
                              : "border-indigo-200 bg-indigo-50 dark:bg-indigo-950/20 dark:border-indigo-900"
                            : "border-border bg-muted/30"
                        }`}>
                          <div>
                            <p className="font-semibold text-sm">{label}</p>
                            <p className="text-xs text-muted-foreground">{desc}</p>
                          </div>
                          <Switch
                            checked={bnplAdminSettings[key]}
                            onCheckedChange={val => setBnplAdminSettings(s => s ? { ...s, [key]: val } : s)}
                          />
                        </div>
                      ))}
                    </div>
                    {/* Amount Limits */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Min Achte ($)</Label>
                        <Input type="number" min={1} value={bnplAdminSettings.minAmountUsd} onChange={e => setBnplAdminSettings(s => s ? { ...s, minAmountUsd: Number(e.target.value) } : s)} className="h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Max Achte ($)</Label>
                        <Input type="number" min={1} value={bnplAdminSettings.maxAmountUsd} onChange={e => setBnplAdminSettings(s => s ? { ...s, maxAmountUsd: Number(e.target.value) } : s)} className="h-9 text-sm" />
                      </div>
                      <div>
                        <Label className="text-xs font-semibold text-muted-foreground mb-1 block">Frè Platform (%)</Label>
                        <Input type="number" min={0} max={20} step={0.5} value={bnplAdminSettings.platformFeePercent} onChange={e => setBnplAdminSettings(s => s ? { ...s, platformFeePercent: Number(e.target.value) } : s)} className="h-9 text-sm" />
                      </div>
                    </div>
                    <Button onClick={saveBnplSettings} disabled={bnplAdminSaving} className="w-full font-bold">
                      {bnplAdminSaving ? "Ap sovgade…" : "Sovgade Paramèt BNPL"}
                    </Button>
                  </div>
                )}

                {/* Security / AI Info */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <h4 className="font-bold text-sm flex items-center gap-2"><Shield className="h-4 w-4 text-blue-600" />Sistèm Elijiblite Flexa AI</h4>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    {[
                      { pts: 30, rule: "Kont 90+ jou (Ancyènte)" },
                      { pts: 25, rule: "Telefòn verifye (OTP)" },
                      { pts: 25, rule: "3+ kòmand konplète" },
                      { pts: 20, rule: "Nòt mwayen 3.5+ zetwal" },
                    ].map(({ pts, rule }) => (
                      <div key={rule} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <span>{rule}</span>
                        <span className="font-black text-primary">+{pts} pts</span>
                      </div>
                    ))}
                    <p className="pt-1 text-center font-semibold text-foreground">Bezwen 75/100 pwen pou elijib BNPL</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ══ Chargebacks Tab ══ */}
        <TabsContent value="chargebacks">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <h3 className="font-black text-base">Jere Chajbak Stripe</h3>
                <Badge variant="outline" className="text-xs">{chargebacks.length} total</Badge>
              </div>
              <button onClick={loadChargebacks} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className={`h-4 w-4 ${chargebacksLoading ? "animate-spin" : ""}`} />
              </button>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Ouvè", status: "open",          color: "text-red-600" },
                { label: "Genyen",  status: "won",         color: "text-green-600" },
                { label: "Pèdi",    status: "lost",        color: "text-amber-600" },
                { label: "Rezoud",  status: "admin_resolved", color: "text-blue-600" },
              ].map(({ label, status, color }) => (
                <div key={status} className="rounded-xl border border-border bg-card p-3 text-center">
                  <p className={`text-2xl font-black ${color}`}>{chargebacks.filter((c: any) => c.status === status).length}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {chargebacksLoading && chargebacks.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">Ap chaje chajbak yo…</div>
            ) : chargebacks.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
                <AlertTriangle className="h-8 w-8 text-muted-foreground/40" />
                <p>Pa gen chajbak pou kounye a</p>
              </div>
            ) : (
              <div className="space-y-3">
                {chargebacks.map((cb: any) => {
                  const isResolving = chargebackResolving === cb.id;
                  const statusColors: Record<string, string> = {
                    open: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
                    won: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
                    lost: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                    admin_resolved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                  };
                  const statusLabel: Record<string, string> = {
                    open: "Ouvè", won: "Genyen", lost: "Pèdi", admin_resolved: "Rezoud",
                  };
                  return (
                    <div key={cb.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${statusColors[cb.status] ?? "bg-muted text-muted-foreground"}`}>
                              {statusLabel[cb.status] ?? cb.status}
                            </span>
                            <span className="font-black text-base text-red-600">${Number(cb.amount_usd ?? 0).toFixed(2)}</span>
                            <span className="text-xs text-muted-foreground">{new Date(cb.created_at).toLocaleDateString()}</span>
                          </div>
                          {cb.user_name && (
                            <p className="text-sm font-semibold">{cb.user_name}
                              {cb.user_email && <span className="text-xs text-muted-foreground ml-1">({cb.user_email})</span>}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            {cb.stripe_dispute_id && <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{cb.stripe_dispute_id}</span>}
                            {cb.stripe_payment_intent_id && <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{cb.stripe_payment_intent_id}</span>}
                          </div>
                          <div className="flex gap-2 text-xs flex-wrap">
                            {cb.wallet_deducted && <span className="text-amber-600 font-bold">✓ Wallet dedwi</span>}
                            {cb.user_restricted && <span className="text-red-600 font-bold">✓ Itilizatè sispann</span>}
                            {cb.user_is_banned && <span className="text-red-700 font-bold">✗ Itilizatè bannit</span>}
                          </div>
                          {cb.notes && <p className="text-xs text-muted-foreground italic">{cb.notes}</p>}
                        </div>

                        {cb.status === "open" && (
                          <div className="flex flex-col gap-1.5 shrink-0">
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-700 border-green-300 hover:bg-green-50 dark:hover:bg-green-950"
                              disabled={isResolving}
                              onClick={() => resolveChargeback(cb.id, { restoreWallet: true, unrestrictUser: true, notes: "Admin rezoud — wallet retounen, aksè retabli" })}>
                              {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Retounen Wallet
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-blue-700 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950"
                              disabled={isResolving}
                              onClick={() => resolveChargeback(cb.id, { unrestrictUser: true, notes: "Admin débloké kont itilizatè" })}>
                              {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                              Débloké Kont
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-red-700 border-red-300 hover:bg-red-50 dark:hover:bg-red-950"
                              disabled={isResolving}
                              onClick={() => resolveChargeback(cb.id, { banUser: true, notes: "Admin bannit itilizatè pou chajbak frodilè" })}>
                              {isResolving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Ban className="h-3 w-3" />}
                              Bannit Itilizatè
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-muted-foreground"
                              disabled={isResolving}
                              onClick={() => resolveChargeback(cb.id, { notes: "Admin matche tèt li — pa gen aksyon" })}>
                              Fèmen (pa gen aksyon)
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══ Returns Tab ══ */}
        <TabsContent value="returns">
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                <h2 className="font-bold text-base">Jere Retou Kòmand</h2>
              </div>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => loadReturns(returnsFilter)} disabled={returnsLoading}>
                <RotateCcw className={`h-3 w-3 ${returnsLoading ? "animate-spin" : ""}`} /> Aktyalize
              </Button>
            </div>

            {/* Filter buttons */}
            <div className="flex gap-1.5 flex-wrap">
              {(["all", "requested", "seller_accepted", "seller_rejected", "buyer_shipped", "refunded"] as const).map(f => (
                <button key={f} onClick={() => { setReturnsFilter(f); loadReturns(f); }}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${returnsFilter === f ? "bg-amber-600 text-white border-amber-600" : "border-border text-muted-foreground hover:border-amber-400 hover:text-amber-700"}`}>
                  {{ all: "Tout", requested: "Demann", seller_accepted: "Aksepte", seller_rejected: "Refize (vandè)", buyer_shipped: "Voye tounen", refunded: "Ranbouse" }[f]}
                </button>
              ))}
            </div>

            {returnsLoading && (
              <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
                <RotateCcw className="h-4 w-4 animate-spin" /> Chajman…
              </div>
            )}

            {!returnsLoading && returnsList.length === 0 && (
              <div className="text-center py-10 text-muted-foreground text-sm">Pa gen retou pou filtre sa a.</div>
            )}

            {!returnsLoading && returnsList.length > 0 && (
              <div className="space-y-3">
                {returnsList.map((ret: any) => (
                  <div key={ret.id} className={`rounded-2xl border p-5 space-y-3 ${
                    ret.status === "refunded" ? "border-green-400 bg-green-50/40 dark:bg-green-950/20" :
                    ret.status === "seller_rejected" ? "border-orange-300 bg-orange-50/40 dark:bg-orange-950/20" :
                    ret.status === "buyer_shipped" ? "border-blue-300 bg-blue-50/40 dark:bg-blue-950/20" :
                    "border-amber-200 bg-amber-50/40 dark:bg-amber-950/20"
                  }`}>

                    {/* Row header */}
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-black text-sm">Retou #{ret.id}</span>
                          <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${
                            ret.status === "refunded"        ? "bg-green-600"  :
                            ret.status === "seller_rejected" ? "bg-orange-600" :
                            ret.status === "buyer_shipped"   ? "bg-blue-600"   :
                            ret.status === "seller_accepted" ? "bg-teal-600"   : "bg-amber-600"
                          }`}>
                            {({ requested: "Demann", seller_accepted: "Aksepte", seller_rejected: "Refize vandè", buyer_shipped: "Voye tounen", refunded: "Ranbouse" } as Record<string, string>)[ret.status] ?? ret.status}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">Kòmand #{ret.orderId} · {new Date(ret.createdAt).toLocaleDateString("fr-FR")}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground space-y-0.5">
                        <p><strong>Achetè:</strong> {ret.buyerName ?? `#${ret.buyerId}`}</p>
                        <p><strong>Vandè:</strong> {ret.sellerName ?? `#${ret.sellerId}`}</p>
                        {ret.refundAmount && (
                          <p className="font-black text-green-700 dark:text-green-400 text-sm">${parseFloat(ret.refundAmount).toFixed(2)}</p>
                        )}
                      </div>
                    </div>

                    {/* Reason + notes */}
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p><strong>Rezon:</strong> {({
                        not_as_described: "Pa kòm deskripsyon", damaged: "Domaje",
                        wrong_item: "Move atik", defective: "Pa fonksyone",
                        not_received: "Pa janm resevwa", changed_mind: "Chanje lide",
                      } as Record<string, string>)[ret.reason] ?? ret.reason}</p>
                      {ret.description && <p className="border-l-2 border-amber-400 pl-3 text-foreground">{ret.description}</p>}
                      {ret.sellerNote && <p><strong>Nòt vandè:</strong> {ret.sellerNote}</p>}
                      {ret.adminNote  && <p><strong>Nòt admin:</strong> {ret.adminNote}</p>}
                      {ret.returnTrackingNumber && (
                        <p><strong>Tracking retou:</strong> {ret.returnCarrier} <span className="font-mono">{ret.returnTrackingNumber}</span></p>
                      )}
                    </div>

                    {/* Payment method badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {ret.paymentMethod === "stripe" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-300 dark:border-violet-700">
                          💳 Stripe — ranbousman sou kat (5 jou ouvrab)
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-300 dark:border-blue-700">
                          💰 {ret.paymentMethod ?? "Pòtfèy"} — ranbousman nan FM wallet
                        </span>
                      )}
                      {ret.refundMethod === "stripe_card" && ret.stripeRefundId && (
                        <span className="text-[10px] font-mono text-muted-foreground">ref: {ret.stripeRefundId}</span>
                      )}
                    </div>

                    {/* Admin decide UI — available for all pending statuses */}
                    {["requested", "seller_accepted", "seller_rejected", "buyer_shipped"].includes(ret.status) && (
                      returnsDecideId === ret.id ? (
                        <div className="space-y-2 pt-1">
                          {ret.paymentMethod === "stripe" && (
                            <div className="rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-3 py-2 text-xs text-violet-800 dark:text-violet-300 flex items-center gap-2">
                              💳 <span>Apwouve ap lanse yon <strong>Stripe Refund reyèl</strong> — lajan ap tounen sou kat aketè a nan 5 jou ouvrab.</span>
                            </div>
                          )}
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => setReturnsDecision("approve")}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${returnsDecision === "approve" ? "border-green-500 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-300" : "border-border text-muted-foreground"}`}>
                              ✅ Apwouve ranbousman
                            </button>
                            <button onClick={() => setReturnsDecision("reject")}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all ${returnsDecision === "reject" ? "border-red-500 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300" : "border-border text-muted-foreground"}`}>
                              ❌ Refize demann
                            </button>
                          </div>
                          <input value={returnsNote} onChange={e => setReturnsNote(e.target.value)}
                            placeholder="Nòt admin (opsyonèl)…"
                            className="w-full h-8 px-3 rounded-xl border border-border text-xs bg-background focus:outline-none focus:ring-1 focus:ring-amber-400" />
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setReturnsDecideId(null); setReturnsNote(""); }}>Anile</Button>
                            <Button size="sm" disabled={returnsActioning === ret.id}
                              className={`h-7 text-xs text-white ${returnsDecision === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}
                              onClick={() => handleReturnDecide(ret.id, returnsDecision, returnsNote)}>
                              {returnsActioning === ret.id ? "Ap trete…" : returnsDecision === "approve" ? "Konfime Ranbousman" : "Refize Demann"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline"
                          className="h-8 text-xs border-amber-400 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30 gap-1.5"
                          onClick={() => { setReturnsDecideId(ret.id); setReturnsDecision("approve"); setReturnsNote(""); }}>
                          <RotateCcw className="h-3 w-3" /> Pran Desizyon Admin
                        </Button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══ Veye Kont Tab ══ */}
        {isSuperAdmin && (
          <TabsContent value="veye-kont">
            <AdminWalletMonitor />
          </TabsContent>
        )}

        {/* ══ Orders Overview Tab (Super Admin) ══ */}
        {isSuperAdmin && (
          <TabsContent value="orders">
            <AdminOrdersPanel />
          </TabsContent>
        )}

        {/* ══ Referral Ranking System ══ */}
        <TabsContent value="referrals">
          <AdminReferralPanel />
        </TabsContent>

        {/* ══ Broadcast Email (super-admin only) ══ */}
        {isSuperAdmin && (
          <TabsContent value="broadcast">
            <BroadcastEmailPanel />
          </TabsContent>
        )}
      </Tabs>

      {/* ── Security Dialog ── */}
      <Dialog open={!!securityUser} onOpenChange={v => !v && (setSecurityUser(null), setSecurityData(null))}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-5 w-5 text-blue-600" />
              Security Profile — {securityUser?.name}
            </DialogTitle>
          </DialogHeader>
          {!securityData ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading security data…</div>
          ) : (
            <div className="space-y-4 mt-1">
              {/* Risk Score Banner */}
              {securityData.risk && (
                <div className={`rounded-lg p-3 border ${
                  securityData.risk.level === "high" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                  securityData.risk.level === "medium" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800" :
                  "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black px-2 py-0.5 rounded ${
                        securityData.risk.level === "high" ? "bg-red-500 text-white" :
                        securityData.risk.level === "medium" ? "bg-amber-500 text-white" :
                        "bg-green-500 text-white"
                      }`}>{securityData.risk.level.toUpperCase()} RISK</span>
                      <span className="text-xs text-muted-foreground">Score: {securityData.risk.score}/99</span>
                    </div>
                    <div className="flex gap-1">
                      {!securityData.isTrusted ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs border-blue-300 text-blue-700" onClick={() => handleTrustUser(securityUser?.id)} disabled={!!actioning}>
                          <ShieldAlert className="h-3 w-3 mr-1" />Mark Trusted
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => handleUntrustUser(securityUser?.id)} disabled={!!actioning}>
                          Remove Trust
                        </Button>
                      )}
                    </div>
                  </div>
                  {securityData.risk.factors.length > 0 ? (
                    <ul className="space-y-0.5">
                      {securityData.risk.factors.map((f: string, i: number) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="mt-0.5 flex-shrink-0">•</span>{f}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-green-700 dark:text-green-400">No risk factors detected</p>
                  )}
                </div>
              )}

              {/* ── Modèl Aparèy (device model) ── */}
              <div className="rounded-xl border border-border bg-secondary/40 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
                  <Monitor className="h-3.5 w-3.5" /> Aparèy Itilize
                </div>
                {securityData.latestDevice ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-foreground">{securityData.latestDevice.device}</span>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{securityData.latestDevice.os}</span>
                      <span className="text-xs bg-secondary text-muted-foreground px-2 py-0.5 rounded-full">{securityData.latestDevice.browser}</span>
                    </div>
                    {securityData.uniqueDevices?.length > 1 && (
                      <p className="text-[10px] text-muted-foreground">{securityData.uniqueDevices.length} aparèy diferan detekte nan istwa login</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Pa gen done aparèy</p>
                )}
                {/* All unique devices used */}
                {securityData.uniqueDevices?.length > 1 && (
                  <div className="mt-2 space-y-1">
                    {securityData.uniqueDevices.map((d: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs bg-background/60 rounded px-2 py-1">
                        <span className="font-semibold text-foreground flex-1">{d.device} · {d.os} · {d.browser}</span>
                        <span className="text-muted-foreground whitespace-nowrap">{d.count}× login</span>
                        <span className="text-muted-foreground whitespace-nowrap">{new Date(d.lastSeen).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Nimewo Telefòn ── */}
              <div className="bg-secondary/40 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><Phone className="h-3.5 w-3.5" /> Nimewo Telefòn</div>
                  {!securityUser?.isSuperAdmin && (
                    <button onClick={() => { setEditPhoneOpen(o => !o); setEditPhoneValue(securityData.phone ?? ""); }} className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                      <Edit3 className="h-3 w-3" /> Chanje
                    </button>
                  )}
                </div>
                <p className="font-mono text-sm font-bold">{securityData.phone ?? "—"}</p>
                {editPhoneOpen && (
                  <div className="mt-2 flex gap-2">
                    <Input value={editPhoneValue} onChange={e => setEditPhoneValue(e.target.value)} placeholder="+50938000000" className="h-8 text-sm font-mono flex-1" style={{ fontSize: 16 }} onKeyDown={e => e.key === "Enter" && handlePhoneOverride()} />
                    <Button size="sm" className="h-8 px-3 text-xs" onClick={handlePhoneOverride} disabled={editPhoneLoading || !editPhoneValue.trim()}>
                      {editPhoneLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setEditPhoneOpen(false); setEditPhoneValue(""); }}><X className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>

              {/* ── Pozisyon GPS ── */}
              <div className="bg-secondary/40 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide"><Navigation className="h-3.5 w-3.5" /> Pozisyon Egzak (GPS)</div>
                  {securityData.latitude != null && securityData.longitude != null && (
                    <a href={`https://www.google.com/maps?q=${securityData.latitude},${securityData.longitude}`} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                      <ExternalLink className="h-3 w-3" /> Google Maps
                    </a>
                  )}
                </div>
                {securityData.latitude != null && securityData.longitude != null ? (
                  <div className="space-y-0.5">
                    <p className="font-mono text-sm font-bold text-green-700 dark:text-green-400">
                      {securityData.latitude.toFixed(6)},  {securityData.longitude.toFixed(6)}
                    </p>
                    {securityData.location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{securityData.location}</p>}
                    {securityData.lastSeenAt && <p className="text-[10px] text-muted-foreground">Dènye mouvman: {new Date(securityData.lastSeenAt).toLocaleString()}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{securityData.location ?? "Okenn GPS disponib pou itilizatè sa a"}</p>
                )}
              </div>

              {/* ── IP + Device ID ── */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/40 rounded-xl border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 uppercase tracking-wide font-semibold"><Wifi className="h-3.5 w-3.5" /> IP Enskripsyon</div>
                  <p className="font-mono text-sm font-bold">{securityData.registrationIp ?? "—"}</p>
                </div>
                <div className="bg-secondary/40 rounded-xl border border-border p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 uppercase tracking-wide font-semibold">
                    <Monitor className="h-3.5 w-3.5" /> Device ID
                    {securityData.deviceIdFull && <span className="ml-auto text-[9px] bg-purple-600 text-white px-1 rounded">SA</span>}
                  </div>
                  <p className="font-mono text-xs font-bold truncate">{securityData.deviceId ?? "—"}</p>
                </div>
              </div>

              {/* ── Super Admin Intelligence (purple section) ── */}
              {isSuperAdmin && securityData.rawUserAgents && (
                <div className="rounded-xl border border-purple-300 dark:border-purple-700 bg-purple-50 dark:bg-purple-950/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="h-3.5 w-3.5 text-purple-600" />
                    <span className="text-xs font-black text-purple-700 dark:text-purple-400 uppercase tracking-wide">Intelligence Super Admin</span>
                    <span className="ml-auto text-[10px] text-purple-500">{securityData.allLogCount} login total</span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {securityData.rawUserAgents.slice(0, 20).map((r: any, i: number) => (
                      <div key={i} className="text-[10px] bg-purple-100 dark:bg-purple-900/30 rounded px-2 py-1 font-mono text-purple-800 dark:text-purple-300 flex gap-2">
                        <span className="text-purple-500 shrink-0">{new Date(r.at).toLocaleDateString()}</span>
                        <span className="text-purple-400 shrink-0">{r.ip}</span>
                        <span className="truncate">{r.ua ?? "—"}</span>
                      </div>
                    ))}
                  </div>
                  {securityData.rawUserAgents.length > 20 && (
                    <p className="text-[10px] text-purple-500 text-center mt-1">+{securityData.rawUserAgents.length - 20} lòt antrè…</p>
                  )}
                </div>
              )}

              {/* Linked Accounts */}
              {securityData.linkedAccounts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Link2 className="h-4 w-4 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">Linked Accounts ({securityData.linkedAccounts.length})</span>
                    <span className="text-[10px] text-muted-foreground">{securityData.linkedByIpCount > 0 && `${securityData.linkedByIpCount} by IP`}{securityData.linkedByIpCount > 0 && securityData.linkedByDeviceCount > 0 && " · "}{securityData.linkedByDeviceCount > 0 && `${securityData.linkedByDeviceCount} by device`}</span>
                  </div>
                  <div className="space-y-1.5">
                    {securityData.linkedAccounts.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm">
                        <span className="font-medium">{u.name}</span>
                        <span className="text-xs text-muted-foreground">#{u.id}</span>
                        <span className="text-xs text-muted-foreground flex-1">{u.email}</span>
                        {u.isBanned && <Badge variant="destructive" className="text-[10px] h-4 px-1">Banned</Badge>}
                        {u.isFlagged && <Badge variant="outline" className="text-[10px] h-4 px-1 border-amber-400 text-amber-600">Flagged</Badge>}
                        <Link href={`/profile/${u.id}`} onClick={() => setSecurityUser(null)}><span className="text-[10px] text-blue-600 hover:underline">View</span></Link>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Login / Registration History */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">IP History (last {securityData.loginLogs.length})</span>
                </div>
                {securityData.loginLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No login history recorded yet</p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/60">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Action</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">IP Address</th>
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground hidden sm:table-cell">User Agent</th>
                          <th className="text-right px-3 py-2 font-medium text-muted-foreground">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {securityData.loginLogs.map((l: any) => (
                          <tr key={l.id} className="border-t border-border hover:bg-accent/30">
                            <td className="px-3 py-1.5">
                              <span className={`inline-flex items-center gap-1 font-semibold ${l.action === "register" ? "text-green-700 dark:text-green-400" : "text-blue-700 dark:text-blue-400"}`}>
                                {l.action === "register" ? <UserPlus className="h-3 w-3" /> : <LogIn className="h-3 w-3" />}
                                {l.action}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 font-mono">{l.ip}</td>
                            <td className="px-3 py-1.5 text-muted-foreground truncate max-w-32 hidden sm:table-cell">{l.userAgent?.split(" ")[0] ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right text-muted-foreground whitespace-nowrap">{new Date(l.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="h-8 text-xs" onClick={() => { setSecurityUser(null); setSecurityData(null); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm Dialog ── */}
      {/* ── Reset Password Result ── */}
      <Dialog open={!!resetPwResult} onOpenChange={v => !v && setResetPwResult(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-purple-600" />Temporary Password</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Share this password with <strong className="text-foreground">{resetPwResult?.name}</strong> through a secure channel. It will <strong>not be shown again</strong>.</p>
          <div className="flex items-center gap-2 mt-2 p-3 rounded-lg bg-secondary border border-border">
            <code className="flex-1 font-mono text-sm text-foreground break-all" data-testid="text-temp-password">{resetPwResult?.tempPassword}</code>
            <Button
              size="sm" variant="outline"
              onClick={() => { if (resetPwResult) { navigator.clipboard.writeText(resetPwResult.tempPassword); toast({ title: "Copied to clipboard" }); } }}
              data-testid="button-copy-temp-password"
            ><Copy className="h-3 w-3" /></Button>
          </div>
          <DialogFooter className="mt-2">
            <Button onClick={() => setResetPwResult(null)} data-testid="button-close-temp-password">Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Refund Confirmation ── */}
      <Dialog open={!!refundTarget} onOpenChange={v => !v && setRefundTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-5 w-5 text-blue-600" />Issue Refund</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Refund <strong className="text-foreground">{refundTarget?.currency} {refundTarget && Number(refundTarget.amount).toFixed(2)}</strong> to <strong className="text-foreground">{refundTarget?.user?.name ?? "user"}</strong>?
            {refundTarget?.type === "boost" && refundTarget?.listingId && <span className="block mt-1 text-xs">The associated boost will be deactivated.</span>}
          </p>
          <Textarea placeholder="Reason (optional, included in audit log)" value={refundReason} onChange={e => setRefundReason(e.target.value)} className="text-sm mt-2" rows={3} data-testid="input-refund-reason" />
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setRefundTarget(null)}>Cancel</Button>
            <Button onClick={handleRefund} disabled={!!actioning} data-testid="button-confirm-refund"><RotateCcw className="h-4 w-4 mr-1" />Refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Restrict User Dialog ── */}
      <Dialog open={!!restrictTarget} onOpenChange={v => !v && setRestrictTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-amber-600"><ShieldAlert className="h-5 w-5" />Restrike {restrictTarget?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Rezon</label>
              <select className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" value={restrictReason} onChange={e => setRestrictReason(e.target.value)}>
                <option value="spam">Spam</option>
                <option value="harassment">Harassment</option>
                <option value="misinformation">Misinformation</option>
                <option value="policy_violation">Policy violation</option>
                <option value="suspicious_activity">Suspicious activity</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Dire (jou) — 0 = pèmanan</label>
              <Input type="number" min="0" max="365" value={restrictDuration} onChange={e => setRestrictDuration(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Nòt entèn (opsyonèl)</label>
              <Input value={restrictNotes} onChange={e => setRestrictNotes(e.target.value)} placeholder="Admin notes…" className="mt-1" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setRestrictTarget(null)}>Anile</Button>
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleRestrictConfirm} disabled={!!actioning}><ShieldAlert className="h-4 w-4 mr-1" />Konfime Restriksyon</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-destructive">Delete Permanently?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete <strong className="text-foreground">{deleteTarget?.name}</strong>{deleteTarget?.type === "user" ? " and all their listings" : ""}. This cannot be undone.</p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={!!actioning} data-testid="button-confirm-delete"><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Boost/Extend Dialog ── */}
      <Dialog open={!!boostModal} onOpenChange={v => !v && setBoostModal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-amber-500" />{boostModal?.isBoosted ? "Extend Boost" : "Boost Listing"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{boostModal?.title}</p>
          {boostModal?.isBoosted && boostModal?.boostExpiresAt && <p className="text-xs text-amber-600">Currently expires: {new Date(boostModal.boostExpiresAt).toLocaleDateString()}</p>}
          <div className="space-y-3 mt-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Duration (days)</label>
              <Input type="number" min="1" max="90" value={boostDays} onChange={e => setBoostDays(e.target.value)} className="mt-1" data-testid="input-boost-days" />
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setBoostModal(null)}>Cancel</Button>
            {boostModal?.isBoosted && <Button variant="ghost" className="text-muted-foreground" onClick={() => { handleRemoveBoost(boostModal!.id); setBoostModal(null); }}>Remove Boost</Button>}
            <Button className="bg-amber-500 hover:bg-amber-600 text-white" onClick={handleBoost} disabled={!!actioning} data-testid="button-confirm-boost"><Zap className="h-4 w-4 mr-1" />{boostModal?.isBoosted ? "Extend" : "Boost"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Listing Dialog ── */}
      <Dialog open={!!editListing} onOpenChange={v => !v && setEditListing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Edit3 className="h-4 w-4" />Edit Listing</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-1">
            <div><label className="text-xs font-medium text-muted-foreground">Title</label><Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="mt-1" data-testid="input-edit-title" /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Description</label><Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={3} className="mt-1" data-testid="input-edit-description" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs font-medium text-muted-foreground">Price ($)</label><Input type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} className="mt-1" data-testid="input-edit-price" /></div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Status</label>
                <div className="relative mt-1">
                  <select className="w-full h-9 rounded-md border border-input bg-background pl-3 pr-8 appearance-none cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px" }} value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="available">Available</option>
                    <option value="sold">Sold</option>
                    <option value="removed">Removed</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setEditListing(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={!!actioning} data-testid="button-save-edit">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── User Activity Dialog ── */}
      <Dialog open={!!activityUser} onOpenChange={v => !v && setActivityUser(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Eye className="h-4 w-4" />User Activity</DialogTitle></DialogHeader>
          {activityUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-secondary rounded-xl">
                <Avatar className="h-10 w-10"><AvatarImage src={activityUser.avatar} /><AvatarFallback className="bg-primary text-primary-foreground font-bold">{activityUser.name[0]}</AvatarFallback></Avatar>
                <div>
                  <p className="font-semibold">{activityUser.name}</p>
                  <p className="text-xs text-muted-foreground">{activityUser.email} · {activityUser.phone ?? "no phone"}</p>
                  <p className="text-xs text-muted-foreground">Joined {new Date(activityUser.createdAt).toLocaleDateString()} · {activityData?.listings?.length ?? 0} listings</p>
                </div>
              </div>
              {activityData?.listings?.length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Listings</p>
                  <div className="space-y-2">
                    {activityData.listings.map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between p-2 bg-card border border-border rounded-lg">
                        <div><Link href={`/listings/${l.id}`}><p className="text-sm font-medium hover:text-primary truncate max-w-60">{l.title}</p></Link><p className="text-xs text-muted-foreground">${l.price} · {new Date(l.createdAt).toLocaleDateString()}</p></div>
                        <Badge variant={l.status === "available" ? "secondary" : "destructive"} className="text-xs capitalize">{l.status}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="text-sm text-muted-foreground text-center py-4">No listings yet</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Reusable card for one payment provider ─────────────────────────────────
// Renders enable toggle, mode selector, credential fields, and a save button.
// Secrets are shown as masked placeholders ("••••abcd") when already set;
// typing in the input replaces the secret on save, leaving it empty keeps
// the existing value.
function ProviderCard(props: {
  title: string;
  subtitle: string;
  provider: string;
  data: { saved: any; draft: any };
  saving: boolean;
  onChange: (field: string, value: any) => void;
  onSave: () => void;
  modeOptions: { value: string; label: string }[];
  fields: { key: string; label: string; placeholder: string; secret: boolean }[];
}) {
  const { title, subtitle, provider, data, saving, onChange, onSave, modeOptions, fields } = props;
  const { saved, draft } = data;
  return (
    <div className="bg-card border border-border rounded-xl p-5" data-testid={`provider-card-${provider}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="font-bold text-base">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`enable-${provider}`} className="text-xs cursor-pointer">{draft.enabled ? "Aktive" : "Dezaktive"}</Label>
          <Switch
            id={`enable-${provider}`}
            checked={Boolean(draft.enabled)}
            onCheckedChange={(v) => onChange("enabled", v)}
            data-testid={`switch-enable-${provider}`}
          />
        </div>
      </div>

      <div className="grid gap-3">
        <div>
          <Label className="text-xs font-medium mb-1.5 block">Mode</Label>
          <div className="relative">
            <select className="w-full h-9 rounded-md border border-input bg-background pl-3 pr-8 appearance-none cursor-pointer text-sm focus:outline-none focus:ring-2 focus:ring-ring" style={{ fontSize: "16px" }} value={String(draft.mode || "")} onChange={e => onChange("mode", e.target.value)} data-testid={`select-mode-${provider}`}>
              {modeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        {fields.map((f) => {
          const placeholder = f.secret && saved[`${f.key}Set`] ? `${saved[f.key]} (kite vid pou kenbe l)` : f.placeholder;
          return (
            <div key={f.key}>
              <Label className="text-xs font-medium mb-1.5 block">
                {f.label}
                {f.secret && saved[`${f.key}Set`] && <span className="ml-2 text-[10px] text-green-700 dark:text-green-400">✓ konfigire</span>}
              </Label>
              <Input
                type={f.secret ? "password" : "text"}
                value={String(draft[f.key] ?? "")}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={placeholder}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-9 text-sm font-mono"
                data-testid={`input-${provider}-${f.key}`}
              />
            </div>
          );
        })}

        <div className="flex justify-end pt-2">
          <Button
            size="sm"
            onClick={onSave}
            disabled={saving}
            data-testid={`button-save-${provider}`}
          >
            {saving ? "Ap sove…" : "Sove"}
          </Button>
        </div>
      </div>
    </div>
  );
}
