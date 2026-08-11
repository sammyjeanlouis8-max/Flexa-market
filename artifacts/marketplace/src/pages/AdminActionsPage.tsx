/**
 * AdminActionsPage — Admin Action Feed
 * Route: /admin/actions
 * All admins & super admins can see every action taken by every admin/moderator,
 * real-time (polls every 30 s). Uses GET /api/admin/audit-logs.
 */
import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, RefreshCw, Search, X, Shield, ShieldAlert,
  Ban, UserCheck, UserX, Crown, Trash2, Settings,
  ChevronDown, ChevronUp, AlertTriangle, Activity,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";

// ── helpers ──────────────────────────────────────────────────────────────────

function authHeaders() {
  const tk = localStorage.getItem("flexamarket_token");
  return { "Content-Type": "application/json", ...(tk ? { Authorization: `Bearer ${tk}` } : {}) };
}

async function apiFetch(path: string) {
  const res = await fetch(path, { credentials: "include", headers: authHeaders() });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error ?? `Erè ${res.status}`); }
  return res.json();
}

function timeAgo(date: string | Date) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (diff < 60)      return `${diff}s`;
  if (diff < 3600)    return `${Math.floor(diff / 60)}min`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800)  return `${Math.floor(diff / 86400)}j`;
  return new Date(date).toLocaleDateString("fr-HT", { day: "numeric", month: "short" });
}

function fmtFull(date: string | Date) {
  return new Date(date).toLocaleString("fr-HT", { dateStyle: "medium", timeStyle: "short" });
}

// ── risk badges ──────────────────────────────────────────────────────────────

const RISK_CLS: Record<string, { cls: string; icon: React.ReactNode }> = {
  low:      { cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",             icon: <Shield className="h-2.5 w-2.5" /> },
  medium:   { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",          icon: <ShieldAlert className="h-2.5 w-2.5" /> },
  high:     { cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",      icon: <ShieldAlert className="h-2.5 w-2.5" /> },
  critical: { cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 font-black",       icon: <AlertTriangle className="h-2.5 w-2.5" /> },
};

// ── action-type icons & colours ───────────────────────────────────────────────

function actionMeta(actionType: string) {
  if (actionType.includes("ban"))         return { Icon: Ban,       bg: "bg-red-100 dark:bg-red-900/40",       fg: "text-red-600 dark:text-red-400" };
  if (actionType.includes("unban"))       return { Icon: UserCheck,  bg: "bg-emerald-100 dark:bg-emerald-900/40", fg: "text-emerald-600 dark:text-emerald-400" };
  if (actionType.includes("delete"))      return { Icon: Trash2,     bg: "bg-red-100 dark:bg-red-900/40",       fg: "text-red-600 dark:text-red-400" };
  if (actionType.includes("privilege") || actionType.includes("admin_create"))
                                          return { Icon: Crown,      bg: "bg-violet-100 dark:bg-violet-900/40", fg: "text-violet-600 dark:text-violet-400" };
  if (actionType.includes("suspend") || actionType.includes("restrict"))
                                          return { Icon: UserX,      bg: "bg-orange-100 dark:bg-orange-900/40", fg: "text-orange-600 dark:text-orange-400" };
  if (actionType.includes("unrestrict") || actionType.includes("unsuspend"))
                                          return { Icon: UserCheck,  bg: "bg-emerald-100 dark:bg-emerald-900/40", fg: "text-emerald-600 dark:text-emerald-400" };
  if (actionType.includes("approve") || actionType.includes("kyc") || actionType.includes("verify"))
                                          return { Icon: Shield,     bg: "bg-blue-100 dark:bg-blue-900/40",     fg: "text-blue-600 dark:text-blue-400" };
  if (actionType.includes("wallet") || actionType.includes("escrow") || actionType.includes("withdrawal"))
                                          return { Icon: Activity,   bg: "bg-cyan-100 dark:bg-cyan-900/40",     fg: "text-cyan-600 dark:text-cyan-400" };
  return                                  { Icon: Settings,   bg: "bg-slate-100 dark:bg-slate-800",       fg: "text-slate-600 dark:text-slate-400" };
}

// ── role badge ────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string | null }) {
  const map: Record<string, string> = {
    super_admin: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
    admin:       "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
    moderator:   "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    agent:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  };
  const label: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", moderator: "Moderatè", agent: "Ajan" };
  const key = role ?? "agent";
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${map[key] ?? map.agent}`}>
      {label[key] ?? key}
    </span>
  );
}

// ── single log row ────────────────────────────────────────────────────────────

function LogRow({ log }: { log: any }) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();
  const riskCls = RISK_CLS[log.riskLevel] ?? RISK_CLS.low;
  const riskLabel: Record<string, string> = {
    low: t("adminActions.riskLow"), medium: t("adminActions.riskMedium"),
    high: t("adminActions.riskHigh"), critical: t("adminActions.riskCritical"),
  };
  const { Icon, bg, fg } = actionMeta(log.actionType);

  return (
    <div className={`border-b border-border last:border-0 ${log.flagged ? "bg-red-50/50 dark:bg-red-950/10" : "hover:bg-muted/30"} transition-colors`}>
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left"
      >
        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
          <Icon className={`h-4 w-4 ${fg}`} />
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          {/* Actor row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-black">{log.actorName ?? "Admin"}</span>
            <RoleBadge role={log.actorRole} />
            {log.flagged && (
              <span className="text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" /> Flagged
              </span>
            )}
          </div>
          {/* Description */}
          <p className="text-sm text-foreground/80 mt-0.5 leading-snug">{log.description}</p>
          {/* Target */}
          {log.targetName && (
            <p className="text-xs text-muted-foreground mt-0.5">
              → {log.targetType ?? "user"}: <span className="font-bold">{log.targetName}</span>
            </p>
          )}
        </div>

        {/* Right side */}
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${riskCls.cls}`}>
            {riskCls.icon} {riskLabel[log.riskLevel] ?? log.riskLevel}
          </span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(log.createdAt)}</span>
          {expanded ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-3 ml-12 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground border-t border-border/50 pt-2">
          <div><span className="font-bold text-foreground/70">{t("adminActions.detailCategory")}:</span> {log.actionCategory}</div>
          <div><span className="font-bold text-foreground/70">{t("adminActions.detailActionType")}:</span> {log.actionType}</div>
          {log.ipAddress && <div><span className="font-bold text-foreground/70">{t("adminActions.detailIp")}:</span> {log.ipAddress}</div>}
          <div className="col-span-2"><span className="font-bold text-foreground/70">{t("adminActions.detailDate")}:</span> {fmtFull(log.createdAt)}</div>
          {log.auditId && <div className="col-span-2 font-mono text-[9px] opacity-50">{log.auditId}</div>}
        </div>
      )}
    </div>
  );
}

// ── stats bar ─────────────────────────────────────────────────────────────────

function StatsBar() {
  const [stats, setStats] = useState<any>(null);
  const { t } = useTranslation();
  useEffect(() => {
    apiFetch("/api/admin/audit-stats").then(setStats).catch(() => {});
  }, []);
  if (!stats) return null;
  return (
    <div className="grid grid-cols-4 border-b border-border shrink-0 bg-card">
      {[
        { label: t("adminActions.statTotal"),    value: stats.total,    color: "text-foreground" },
        { label: t("adminActions.statLast24h"),  value: stats.last24h,  color: "text-blue-600" },
        { label: t("adminActions.statHighRisk"), value: stats.highRisk, color: "text-orange-600" },
        { label: t("adminActions.statFlagged"),  value: stats.flagged,  color: "text-red-600" },
      ].map(s => (
        <div key={s.label} className="flex flex-col items-center py-2.5 border-r last:border-r-0 border-border">
          <span className={`text-base font-black ${s.color}`}>{s.value}</span>
          <span className="text-[9px] text-muted-foreground mt-0.5">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── categories ────────────────────────────────────────────────────────────────

const CATEGORIES = ["", "user", "security", "wallet", "agent", "driver", "subscription", "delivery", "escrow", "fintech"] as const;
const RISKS_FILTER = ["", "low", "medium", "high", "critical"] as const;

// ── main page ─────────────────────────────────────────────────────────────────

export default function AdminActionsPage() {
  const [, setLocation]         = useLocation();
  const { user }                = useAuth();
  const { t }                   = useTranslation();

  const [logs, setLogs]         = useState<any[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [page, setPage]         = useState(1);

  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("");
  const [riskLevel, setRisk]    = useState("");
  const [flaggedOnly, setFlagged] = useState(false);

  const CAT_LABELS: Record<string, string> = {
    "": t("adminActions.catAll"), user: t("adminActions.catUser"), security: t("adminActions.catSecurity"),
    wallet: t("adminActions.catWallet"), agent: t("adminActions.catAgent"), driver: t("adminActions.catDriver"),
    subscription: t("adminActions.catSubscription"), delivery: t("adminActions.catDelivery"),
    escrow: t("adminActions.catEscrow"), fintech: t("adminActions.catFintech"),
  };
  const RISK_LABELS: Record<string, string> = {
    "": t("adminActions.riskAll"), low: t("adminActions.riskLow"), medium: t("adminActions.riskMedium"),
    high: t("adminActions.riskHigh"), critical: t("adminActions.riskCritical"),
  };

  const LIMIT = 50;

  const load = useCallback(async (p = 1, append = false) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        page: String(p), limit: String(LIMIT),
        ...(search   ? { search }   : {}),
        ...(category ? { category } : {}),
        ...(riskLevel? { riskLevel }: {}),
        ...(flaggedOnly ? { flagged: "1" } : {}),
      });
      const data = await apiFetch(`/api/admin/audit-logs?${params}`);
      setLogs(prev => append ? [...prev, ...(data.logs ?? [])] : (data.logs ?? []));
      setTotal(data.total ?? 0);
      setPage(p);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [search, category, riskLevel, flaggedOnly]);

  // initial load + filter change reset
  useEffect(() => {
    if (!user?.isAdmin) { setLocation("/admin"); return; }
    load(1);
  }, [search, category, riskLevel, flaggedOnly]);

  // auto-refresh every 30 s
  useEffect(() => {
    const t = setInterval(() => load(1), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const hasMore = logs.length < total;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation("/admin")} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-black text-base">{t("adminActions.title")}</h1>
          <p className="text-xs text-muted-foreground">
            {total} {t("adminActions.totalActions")} · {t("adminActions.autoRefresh")}
          </p>
        </div>
        <button onClick={() => load(1)} className="ml-auto p-1.5 rounded-lg hover:bg-muted">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats */}
      <StatsBar />

      {/* Filters */}
      <div className="flex flex-col gap-2 px-3 py-2.5 border-b border-border bg-card shrink-0">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("adminActions.searchPlaceholder")}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-muted border-0 outline-none focus:ring-2 focus:ring-primary/40"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Filter chips row */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {/* Category */}
          {CATEGORIES.map(c => (
            <button
              key={c || "all"}
              onClick={() => setCategory(c)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                category === c ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {CAT_LABELS[c]}
            </button>
          ))}
          <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
          {/* Risk */}
          {RISKS_FILTER.map(r => (
            <button
              key={r || "all-risk"}
              onClick={() => setRisk(r)}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                riskLevel === r
                  ? r === "critical" ? "bg-red-600 text-white"
                    : r === "high" ? "bg-orange-500 text-white"
                    : r === "medium" ? "bg-amber-500 text-white"
                    : "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {RISK_LABELS[r]}
            </button>
          ))}
          <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
          {/* Flagged toggle */}
          <button
            onClick={() => setFlagged(v => !v)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap flex items-center gap-1 transition-colors ${
              flaggedOnly ? "bg-red-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <AlertTriangle className="h-2.5 w-2.5" /> {t("adminActions.flaggedOnly")}
          </button>
        </div>
      </div>

      {/* Log feed */}
      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="p-6 text-center text-sm text-destructive">{error}</div>
        ) : logs.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-muted-foreground">
            <Activity className="h-8 w-8 opacity-30" />
            <p className="text-sm">{t("adminActions.noActions")}</p>
          </div>
        ) : (
          <>
            <div className="divide-y divide-border">
              {logs.map(log => <LogRow key={log.id} log={log} />)}
            </div>
            {loading && (
              <div className="flex justify-center py-4">
                <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {hasMore && !loading && (
              <button
                onClick={() => load(page + 1, true)}
                className="w-full py-3 text-sm font-bold text-primary hover:bg-muted/50 transition-colors"
              >
                {t("adminActions.loadMore")} ({total - logs.length} {t("adminActions.remaining")})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
