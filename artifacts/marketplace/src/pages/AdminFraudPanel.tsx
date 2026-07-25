import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, Ban, Flag, Eye, RefreshCw,
  ChevronLeft, User, Globe, Cpu, MessageSquare, Activity, Search, Filter,
  CheckCircle2, XCircle, Zap, TrendingUp, Clock, BarChart3, Lock, Unlock,
  BadgeCheck, ArrowRight, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";

// ─── API Helper ───────────────────────────────────────────────────────────────

async function fraudFetch(path: string, method = "GET", body?: object) {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Request failed");
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FraudStats {
  open_alerts: number; critical_alerts: number; high_alerts: number;
  critical_users: number; high_users: number; medium_users: number;
  flagged_users: number; banned_users: number;
  events_24h: number; scam_msgs_24h: number; vpn_24h: number; bypass_24h: number;
}

interface FraudAlert {
  id: number; user_id: number; alert_type: string; severity: string;
  title: string; description: string; meta?: any; resolved: boolean;
  resolved_at?: string; created_at: string;
  user_name: string; user_email: string; user_avatar?: string;
  country?: string; is_banned: boolean; is_flagged: boolean;
  resolved_by_name?: string;
}

interface FraudUser {
  user_id: number; score: number; level: string;
  device_score: number; ip_score: number; behavior_score: number;
  payment_score: number; content_score: number;
  name: string; email: string; avatar?: string; country?: string;
  is_banned: boolean; is_flagged: boolean; is_trusted: boolean;
  joined_at: string; event_count: number; open_alerts: number;
}

interface FraudEvent {
  id: number; user_id: number; event_type: string; severity: string;
  score_delta: number; details?: any; ip?: string; created_at: string;
  user_name?: string; user_email?: string; is_banned?: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-orange-500 text-white",
  medium: "bg-yellow-500 text-black",
  low: "bg-blue-400 text-white",
};

const RISK_LEVEL_COLORS: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400 font-black",
  high: "text-orange-600 dark:text-orange-400 font-bold",
  medium: "text-yellow-600 dark:text-yellow-400 font-semibold",
  low: "text-green-600 dark:text-green-400",
};

const RISK_BAR_COLORS: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

function RiskBar({ score, level }: { score: number; level: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${RISK_BAR_COLORS[level] ?? "bg-gray-400"}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`text-xs font-bold w-8 text-right ${RISK_LEVEL_COLORS[level]}`}>{score}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, onClick }: {
  icon: any; label: string; value: number | string; sub?: string;
  color: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border p-4 transition-all ${onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98]" : ""} bg-card border-border/60`}
    >
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${color} mb-3 shadow-sm`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-black leading-none text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1 font-medium">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── User Action Modal ────────────────────────────────────────────────────────

function UserActionModal({ userId, userName, onClose, onSuccess }: {
  userId: number; userName: string; onClose: () => void; onSuccess: () => void;
}) {
  const [action, setAction] = useState("flag");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const actions = [
    { value: "flag", label: "🚩 Mete Flag", desc: "Mark as suspicious for review" },
    { value: "unflag", label: "✅ Retire Flag", desc: "Remove suspicious flag" },
    { value: "ban", label: "🔴 Banir Kont", desc: "Ban account — blocks login" },
    { value: "unban", label: "🟢 Retire Ban", desc: "Restore account access" },
    { value: "trust", label: "⭐ Mete Fide", desc: "Mark trusted — resets risk score" },
    { value: "kyc_require", label: "🪪 Oblije KYC", desc: "Require identity verification" },
    { value: "resolve_alerts", label: "🔔 Rezoud Alèt", desc: "Resolve all open alerts for user" },
    { value: "reassess", label: "🔄 Reasèsman", desc: "Re-run full fraud assessment" },
  ];

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await fraudFetch(`/api/admin/fraud/user/${userId}/action`, "POST", { action, reason });
      toast({ title: "Action applied", description: `${action} applied to ${userName}` });
      onSuccess();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            Action sou {userName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-2">
            {actions.map(a => (
              <label key={a.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${action === a.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}>
                <input type="radio" name="action" value={a.value} checked={action === a.value}
                  onChange={() => setAction(a.value)} className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{a.desc}</p>
                </div>
              </label>
            ))}
          </div>
          <Textarea
            placeholder="Rezon (opsyonèl)…"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            className="text-sm"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Anile</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Ap aplike…" : "Aplike"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FraudTab = "dashboard" | "alerts" | "users" | "events";

export default function AdminFraudPanel() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<FraudTab>("dashboard");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Dashboard data
  const [stats, setStats] = useState<FraudStats | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<FraudAlert[]>([]);
  const [topRiskUsers, setTopRiskUsers] = useState<FraudUser[]>([]);

  // Alerts tab
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsTotal, setAlertsTotal] = useState(0);
  const [alertSeverityFilter, setAlertSeverityFilter] = useState("all");
  const [showResolved, setShowResolved] = useState(false);

  // Users tab
  const [fraudUsers, setFraudUsers] = useState<FraudUser[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userLevelFilter, setUserLevelFilter] = useState("all");
  const [userSearch, setUserSearch] = useState("");

  // Events tab
  const [events, setEvents] = useState<FraudEvent[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotal, setEventsTotal] = useState(0);
  const [eventSeverityFilter, setEventSeverityFilter] = useState("all");

  // Action modal
  const [actionUser, setActionUser] = useState<{ id: number; name: string } | null>(null);

  // Detail view
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [userDetail, setUserDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  if (!user?.isAdmin && !user?.isSuperAdmin) {
    return <div className="p-8 text-center text-muted-foreground">Admin access required.</div>;
  }

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fraudFetch("/api/admin/fraud/dashboard");
      setStats(data.stats);
      setRecentAlerts(data.recentAlerts ?? []);
      setTopRiskUsers(data.topRiskUsers ?? []);
    } catch (err: any) {
      toast({ title: "Error loading fraud dashboard", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAlerts = useCallback(async () => {
    try {
      const sev = alertSeverityFilter !== "all" ? `&severity=${alertSeverityFilter}` : "";
      const data = await fraudFetch(`/api/admin/fraud/alerts?page=${alertsPage}&resolved=${showResolved}${sev}`);
      setAlerts(data.alerts ?? []);
      setAlertsTotal(data.total ?? 0);
    } catch {}
  }, [alertsPage, alertSeverityFilter, showResolved]);

  const loadUsers = useCallback(async () => {
    try {
      const lvl = userLevelFilter !== "all" ? `&level=${userLevelFilter}` : "";
      const q = userSearch ? `&q=${encodeURIComponent(userSearch)}` : "";
      const data = await fraudFetch(`/api/admin/fraud/users?page=${usersPage}${lvl}${q}`);
      setFraudUsers(data.users ?? []);
      setUsersTotal(data.total ?? 0);
    } catch {}
  }, [usersPage, userLevelFilter, userSearch]);

  const loadEvents = useCallback(async () => {
    try {
      const sev = eventSeverityFilter !== "all" ? `&severity=${eventSeverityFilter}` : "";
      const data = await fraudFetch(`/api/admin/fraud/events?page=${eventsPage}${sev}`);
      setEvents(data.events ?? []);
      setEventsTotal(data.total ?? 0);
    } catch {}
  }, [eventsPage, eventSeverityFilter]);

  const loadUserDetail = useCallback(async (id: number) => {
    setDetailLoading(true);
    try {
      const data = await fraudFetch(`/api/admin/fraud/user/${id}`);
      setUserDetail(data);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => { loadDashboard(); }, [loadDashboard, refreshKey]);
  useEffect(() => { if (activeTab === "alerts") loadAlerts(); }, [activeTab, loadAlerts, refreshKey]);
  useEffect(() => { if (activeTab === "users") loadUsers(); }, [activeTab, loadUsers, refreshKey]);
  useEffect(() => { if (activeTab === "events") loadEvents(); }, [activeTab, loadEvents, refreshKey]);
  useEffect(() => { if (selectedUser) loadUserDetail(selectedUser); }, [selectedUser, loadUserDetail, refreshKey]);

  const resolveAlert = async (alertId: number) => {
    try {
      await fraudFetch(`/api/admin/fraud/alerts/${alertId}/resolve`, "POST");
      toast({ title: "Alert resolved" });
      setRefreshKey(k => k + 1);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ── User Detail Panel ──────────────────────────────────────────────────────
  if (selectedUser && userDetail) {
    const u = userDetail.user;
    const rs = userDetail.riskScore;
    return (
      <div className="min-h-screen bg-background">
        <div className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedUser(null); setUserDetail(null); }}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="font-bold text-base">Risk Profile — {u.name}</h1>
            <p className="text-xs text-muted-foreground">{u.email}</p>
          </div>
          <Button size="sm" variant="destructive" onClick={() => setActionUser({ id: u.id, name: u.name })}>
            Action
          </Button>
        </div>

        <div className="max-w-4xl mx-auto p-4 space-y-6">
          {/* Risk Score Header */}
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-4xl font-black ${RISK_LEVEL_COLORS[rs?.level ?? "low"]}`}>{rs?.score ?? 0}</span>
                  <span className="text-muted-foreground text-lg">/100</span>
                  <Badge className={`ml-2 text-xs ${SEVERITY_COLORS[rs?.level ?? "low"]}`}>{(rs?.level ?? "low").toUpperCase()}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">Composite Risk Score</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                {u.is_banned && <Badge className="bg-red-600 text-white">Banned</Badge>}
                {u.is_flagged && <Badge className="bg-orange-500 text-white">Flagged</Badge>}
                {u.is_trusted && <Badge className="bg-green-600 text-white">Trusted</Badge>}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Device", score: rs?.device_score ?? 0 },
                { label: "IP/VPN", score: rs?.ip_score ?? 0 },
                { label: "Behavior", score: rs?.behavior_score ?? 0 },
                { label: "Payment", score: rs?.payment_score ?? 0 },
                { label: "Content", score: rs?.content_score ?? 0 },
              ].map(c => (
                <div key={c.label} className="bg-muted/40 rounded-xl p-3">
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">{c.label}</p>
                  <p className="text-lg font-black">{c.score}</p>
                  <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${(c.score / 20) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Alerts */}
          {(userDetail.alerts ?? []).length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-500" /> Fraud Alerts ({(userDetail.alerts ?? []).length})
              </h3>
              <div className="space-y-2">
                {(userDetail.alerts ?? []).slice(0, 8).map((a: any) => (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 text-sm">
                    <Badge className={`shrink-0 text-[10px] ${SEVERITY_COLORS[a.severity]}`}>{a.severity}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-tight">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.description}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {a.resolved ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : (
                        <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
                          onClick={() => resolveAlert(a.id)}>Resolve</Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Events */}
          {(userDetail.events ?? []).length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" /> Fraud Events ({(userDetail.events ?? []).length})
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {(userDetail.events ?? []).map((e: any) => (
                  <div key={e.id} className="flex items-start gap-3 p-2.5 rounded-xl bg-muted/30 text-sm border border-border/40">
                    <Badge className={`shrink-0 text-[10px] ${SEVERITY_COLORS[e.severity]}`}>{e.severity}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-xs">{e.event_type.replace(/_/g, " ")}</p>
                      {e.details && Object.keys(JSON.parse(typeof e.details === "string" ? e.details : "{}")).length > 0 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">
                          {JSON.stringify(typeof e.details === "string" ? JSON.parse(e.details) : e.details).slice(0, 80)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {e.score_delta !== 0 && (
                        <p className={`text-xs font-bold ${e.score_delta > 0 ? "text-red-500" : "text-green-500"}`}>
                          {e.score_delta > 0 ? "+" : ""}{e.score_delta}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* IP Logs */}
          {(userDetail.ipLogs ?? []).length > 0 && (
            <div className="rounded-2xl border bg-card p-5">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-500" /> IP History
              </h3>
              <div className="space-y-1.5">
                {(userDetail.ipLogs ?? []).slice(0, 10).map((log: any) => (
                  <div key={log.id} className="flex items-center gap-3 text-xs p-2 rounded-lg bg-muted/30">
                    <code className="font-mono text-[11px]">{log.ip}</code>
                    {log.country && <span className="text-muted-foreground">{log.country}</span>}
                    {log.is_vpn && <Badge className="bg-red-500 text-white text-[9px] px-1.5 py-0">VPN</Badge>}
                    {log.is_datacenter && <Badge className="bg-orange-500 text-white text-[9px] px-1.5 py-0">DC</Badge>}
                    <span className="ml-auto text-muted-foreground">{log.action} · {new Date(log.created_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Shared IP accounts */}
          {(userDetail.sharedIpUsers ?? []).length > 0 && (
            <div className="rounded-2xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/60 dark:bg-orange-950/20 p-5">
              <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-orange-700 dark:text-orange-400">
                <AlertTriangle className="h-4 w-4" /> Shared IP Accounts ({(userDetail.sharedIpUsers ?? []).length})
              </h3>
              <div className="space-y-2">
                {(userDetail.sharedIpUsers ?? []).map((u2: any) => (
                  <div key={u2.id} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-white/60 dark:bg-black/20 border border-border/40">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <span className="font-medium">{u2.name}</span>
                      <span className="text-muted-foreground ml-2 text-xs">{u2.email}</span>
                    </div>
                    {u2.is_banned && <Badge className="bg-red-600 text-white text-[9px]">Banned</Badge>}
                    <Button size="sm" variant="ghost" className="h-6 text-xs"
                      onClick={() => { setSelectedUser(u2.id); setUserDetail(null); }}>
                      View
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {actionUser && (
          <UserActionModal
            userId={actionUser.id} userName={actionUser.name}
            onClose={() => setActionUser(null)}
            onSuccess={() => { setRefreshKey(k => k + 1); setActionUser(null); }}
          />
        )}
      </div>
    );
  }

  if (selectedUser && detailLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Main Panel ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2 flex-1">
          <ShieldAlert className="h-5 w-5 text-red-500" />
          <h1 className="font-bold text-base">Fraud & Risk Management</h1>
          {stats && stats.critical_alerts > 0 && (
            <Badge className="bg-red-600 text-white animate-pulse">{stats.critical_alerts} CRITICAL</Badge>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => setRefreshKey(k => k + 1)}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Tab Nav */}
      <div className="border-b bg-card/50 px-4 overflow-x-auto">
        <div className="flex gap-1 py-1 w-max">
          {(["dashboard", "alerts", "users", "events"] as FraudTab[]).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}>
              {tab === "alerts" && stats?.open_alerts ? `Alerts (${stats.open_alerts})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-4">

        {/* ── DASHBOARD TAB ──────────────────────────────────────────────── */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard icon={AlertTriangle} label="Open Alerts" value={stats?.open_alerts ?? 0} color="bg-red-500 text-white" onClick={() => setActiveTab("alerts")} />
                  <StatCard icon={ShieldAlert} label="Critical Users" value={stats?.critical_users ?? 0} color="bg-orange-500 text-white" onClick={() => setActiveTab("users")} />
                  <StatCard icon={Flag} label="Flagged Users" value={stats?.flagged_users ?? 0} color="bg-yellow-500 text-black" />
                  <StatCard icon={Ban} label="Banned Users" value={stats?.banned_users ?? 0} color="bg-gray-700 text-white" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <StatCard icon={Activity} label="Events (24h)" value={stats?.events_24h ?? 0} sub="All fraud signals" color="bg-blue-500 text-white" onClick={() => setActiveTab("events")} />
                  <StatCard icon={MessageSquare} label="Scam Msgs (24h)" value={stats?.scam_msgs_24h ?? 0} sub="Flagged messages" color="bg-purple-500 text-white" />
                  <StatCard icon={Globe} label="VPN Detected (24h)" value={stats?.vpn_24h ?? 0} sub="VPN/datacenter IPs" color="bg-cyan-600 text-white" />
                  <StatCard icon={Lock} label="Ban Bypass (24h)" value={stats?.bypass_24h ?? 0} sub="Re-registration attempts" color="bg-red-700 text-white" />
                </div>

                {/* Risk Level Overview */}
                <div className="rounded-2xl border bg-card p-5">
                  <h3 className="font-bold text-sm mb-4 flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> User Risk Distribution
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: "Critical", value: stats?.critical_users ?? 0, color: "text-red-500", bar: "bg-red-500" },
                      { label: "High", value: stats?.high_users ?? 0, color: "text-orange-500", bar: "bg-orange-500" },
                      { label: "Medium", value: stats?.medium_users ?? 0, color: "text-yellow-500", bar: "bg-yellow-500" },
                    ].map(r => (
                      <div key={r.label} className="text-center p-3 rounded-xl bg-muted/40">
                        <p className={`text-3xl font-black ${r.color}`}>{r.value}</p>
                        <p className="text-xs text-muted-foreground mt-1">{r.label} Risk</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Recent Alerts */}
                <div className="rounded-2xl border bg-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold text-sm flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" /> Recent Alerts
                    </h3>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => setActiveTab("alerts")}>
                      View all <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                  {recentAlerts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No open alerts</p>
                  ) : (
                    <div className="space-y-2">
                      {recentAlerts.slice(0, 8).map(a => (
                        <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
                          <Badge className={`shrink-0 text-[10px] ${SEVERITY_COLORS[a.severity]}`}>{a.severity}</Badge>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-tight">{a.title}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-muted-foreground">{a.user_name}</span>
                              {a.country && <span className="text-xs text-muted-foreground">· {a.country}</span>}
                              {a.is_banned && <Badge className="bg-red-600 text-white text-[9px] px-1.5 py-0">Banned</Badge>}
                            </div>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                              onClick={() => { setSelectedUser(a.user_id); }}>
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs px-2"
                              onClick={() => resolveAlert(a.id)}>
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top Risk Users */}
                {topRiskUsers.length > 0 && (
                  <div className="rounded-2xl border bg-card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-sm flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-red-500" /> Top Risk Users
                      </h3>
                      <Button size="sm" variant="ghost" className="text-xs" onClick={() => setActiveTab("users")}>
                        View all <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {topRiskUsers.slice(0, 5).map(u => (
                        <div key={u.user_id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border/40">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-white text-sm ${RISK_BAR_COLORS[u.level]}`}>
                            {u.score}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{u.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                          </div>
                          <div className="flex gap-1">
                            {u.is_banned && <Badge className="bg-red-600 text-white text-[9px] px-1.5">Banned</Badge>}
                            <Badge className={`text-[9px] px-1.5 ${SEVERITY_COLORS[u.level]}`}>{u.level}</Badge>
                          </div>
                          <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0"
                            onClick={() => setSelectedUser(u.user_id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ALERTS TAB ─────────────────────────────────────────────────── */}
        {activeTab === "alerts" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={alertSeverityFilter} onValueChange={setAlertSeverityFilter}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">🔴 Critical</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">🔵 Low</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant={showResolved ? "default" : "outline"} className="h-8 text-xs"
                onClick={() => setShowResolved(v => !v)}>
                {showResolved ? "Showing Resolved" : "Show Resolved"}
              </Button>
              <span className="text-xs text-muted-foreground ml-auto">{alertsTotal} total</span>
            </div>

            <div className="space-y-2">
              {alerts.map(a => (
                <div key={a.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <Badge className={`shrink-0 text-xs ${SEVERITY_COLORS[a.severity]}`}>{a.severity.toUpperCase()}</Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-tight">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold">
                            {a.user_name?.charAt(0)}
                          </div>
                          <span className="text-xs font-medium">{a.user_name}</span>
                          {a.country && <span className="text-xs text-muted-foreground">· {a.country}</span>}
                        </div>
                        {a.is_banned && <Badge className="bg-red-600 text-white text-[9px] px-1.5 py-0">Banned</Badge>}
                        {a.is_flagged && <Badge className="bg-orange-500 text-white text-[9px] px-1.5 py-0">Flagged</Badge>}
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {new Date(a.created_at).toLocaleString("fr-FR")}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        onClick={() => setSelectedUser(a.user_id)}>
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                      {!a.resolved && (
                        <Button size="sm" className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => resolveAlert(a.id)}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                        </Button>
                      )}
                    </div>
                  </div>
                  {a.resolved && (
                    <p className="text-[10px] text-muted-foreground mt-2 border-t pt-2">
                      ✓ Resolved by {a.resolved_by_name ?? "admin"} · {a.resolved_at ? new Date(a.resolved_at).toLocaleString("fr-FR") : ""}
                    </p>
                  )}
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No alerts</p>
                </div>
              )}
            </div>
            {alertsTotal > 30 && (
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" disabled={alertsPage <= 1} onClick={() => setAlertsPage(p => p - 1)}>Prev</Button>
                <span className="text-xs text-muted-foreground self-center">Page {alertsPage}</span>
                <Button size="sm" variant="outline" disabled={alertsPage * 30 >= alertsTotal} onClick={() => setAlertsPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}

        {/* ── USERS TAB ──────────────────────────────────────────────────── */}
        {activeTab === "users" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input className="h-8 pl-8 text-xs w-48" placeholder="Search users…"
                  value={userSearch} onChange={e => setUserSearch(e.target.value)} />
              </div>
              <Select value={userLevelFilter} onValueChange={setUserLevelFilter}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Risk level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="critical">🔴 Critical</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">{usersTotal} users</span>
            </div>

            <div className="space-y-2">
              {fraudUsers.map(u => (
                <div key={u.user_id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white text-base shrink-0 ${RISK_BAR_COLORS[u.level]}`}>
                      {u.score}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{u.name}</p>
                        <Badge className={`text-[9px] px-1.5 py-0 ${SEVERITY_COLORS[u.level]}`}>{u.level.toUpperCase()}</Badge>
                        {u.is_banned && <Badge className="bg-red-600 text-white text-[9px] px-1.5 py-0">Banned</Badge>}
                        {u.is_flagged && <Badge className="bg-orange-500 text-white text-[9px] px-1.5 py-0">Flagged</Badge>}
                        {u.is_trusted && <Badge className="bg-green-600 text-white text-[9px] px-1.5 py-0">Trusted</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      {u.country && <p className="text-xs text-muted-foreground">{u.country}</p>}
                      <div className="mt-2">
                        <RiskBar score={u.score} level={u.level} />
                      </div>
                      <div className="flex gap-3 mt-1.5 text-[10px] text-muted-foreground">
                        <span>Device: {u.device_score}</span>
                        <span>IP: {u.ip_score}</span>
                        <span>Behavior: {u.behavior_score}</span>
                        <span>Content: {u.content_score}</span>
                        <span className="ml-auto">{u.event_count} events · {u.open_alerts} open alerts</span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        onClick={() => setSelectedUser(u.user_id)}>
                        <Eye className="h-3 w-3 mr-1" /> View
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        onClick={() => setActionUser({ id: u.user_id, name: u.name })}>
                        Action
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {fraudUsers.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No flagged users</p>
                </div>
              )}
            </div>
            {usersTotal > 25 && (
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" disabled={usersPage <= 1} onClick={() => setUsersPage(p => p - 1)}>Prev</Button>
                <span className="text-xs text-muted-foreground self-center">Page {usersPage}</span>
                <Button size="sm" variant="outline" disabled={usersPage * 25 >= usersTotal} onClick={() => setUsersPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}

        {/* ── EVENTS TAB ─────────────────────────────────────────────────── */}
        {activeTab === "events" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={eventSeverityFilter} onValueChange={setEventSeverityFilter}>
                <SelectTrigger className="h-8 w-36 text-xs">
                  <SelectValue placeholder="Severity" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Severity</SelectItem>
                  <SelectItem value="critical">🔴 Critical</SelectItem>
                  <SelectItem value="high">🟠 High</SelectItem>
                  <SelectItem value="medium">🟡 Medium</SelectItem>
                  <SelectItem value="low">🔵 Low</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">{eventsTotal} events</span>
            </div>

            <div className="space-y-1.5">
              {events.map(e => (
                <div key={e.id} className="flex items-start gap-3 p-3 rounded-xl border bg-card text-sm">
                  <Badge className={`shrink-0 text-[10px] ${SEVERITY_COLORS[e.severity]}`}>{e.severity}</Badge>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-xs">{e.event_type.replace(/_/g, " ")}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{e.user_name}</span>
                      {e.is_banned && <Badge className="bg-red-600 text-white text-[9px] px-1 py-0">Banned</Badge>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {e.score_delta !== 0 && (
                      <p className={`text-xs font-bold ${e.score_delta > 0 ? "text-red-500" : "text-green-500"}`}>
                        {e.score_delta > 0 ? "+" : ""}{e.score_delta} pts
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-6 px-2 shrink-0"
                    onClick={() => setSelectedUser(e.user_id)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No events yet</p>
                </div>
              )}
            </div>
            {eventsTotal > 40 && (
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" disabled={eventsPage <= 1} onClick={() => setEventsPage(p => p - 1)}>Prev</Button>
                <span className="text-xs text-muted-foreground self-center">Page {eventsPage}</span>
                <Button size="sm" variant="outline" disabled={eventsPage * 40 >= eventsTotal} onClick={() => setEventsPage(p => p + 1)}>Next</Button>
              </div>
            )}
          </div>
        )}
      </div>

      {actionUser && (
        <UserActionModal
          userId={actionUser.id} userName={actionUser.name}
          onClose={() => setActionUser(null)}
          onSuccess={() => { setRefreshKey(k => k + 1); setActionUser(null); }}
        />
      )}
    </div>
  );
}
