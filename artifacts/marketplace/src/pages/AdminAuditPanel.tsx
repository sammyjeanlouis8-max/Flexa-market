import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Shield, AlertTriangle, Activity, Clock, Search, Filter,
  RefreshCw, Flag, Eye, ChevronRight, User, Zap, Wallet,
  ShieldAlert, CheckCircle2, XCircle, Lock, Download, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getToken() {
  return localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
}

async function apiGet(path: string) {
  const token = getToken();
  const r = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPatch(path: string, body: unknown) {
  const token = getToken();
  const r = await fetch(`/api${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

interface AuditLog {
  id: number;
  auditId: string;
  traceId: string;
  actorId: number;
  actorName: string | null;
  actorRole: string | null;
  actionType: string;
  actionCategory: string;
  targetType: string | null;
  targetId: number | null;
  targetName: string | null;
  description: string;
  beforeState: unknown;
  afterState: unknown;
  metadata: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  riskLevel: string;
  status: string;
  flagged: boolean;
  flagReason: string | null;
  createdAt: string;
}

function riskBadge(level: string) {
  const map: Record<string, { cls: string; label: string }> = {
    critical: { cls: "bg-red-500/15 text-red-600 border-red-200 dark:border-red-800 dark:text-red-400", label: "CRITICAL" },
    high:     { cls: "bg-orange-500/15 text-orange-600 border-orange-200 dark:border-orange-800 dark:text-orange-400", label: "HIGH" },
    medium:   { cls: "bg-amber-500/15 text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400", label: "MEDIUM" },
    low:      { cls: "bg-green-500/15 text-green-600 border-green-200 dark:border-green-800 dark:text-green-400", label: "LOW" },
  };
  const m = map[level] ?? map["low"];
  return <Badge variant="outline" className={cn("text-[10px] font-bold px-1.5 py-0.5", m.cls)}>{m.label}</Badge>;
}

function categoryIcon(cat: string) {
  const map: Record<string, ReactNode> = {
    wallet:       <Wallet className="h-3.5 w-3.5 text-blue-500" />,
    user:         <User className="h-3.5 w-3.5 text-purple-500" />,
    security:     <ShieldAlert className="h-3.5 w-3.5 text-red-500" />,
    agent:        <Shield className="h-3.5 w-3.5 text-green-500" />,
    listing:      <Zap className="h-3.5 w-3.5 text-amber-500" />,
    subscription: <Lock className="h-3.5 w-3.5 text-indigo-500" />,
  };
  return map[cat] ?? <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function StatCard({ label, value, icon, cls }: { label: string; value: number; icon: ReactNode; cls: string }) {
  return (
    <div className={cn("rounded-2xl border p-4 flex items-center gap-3", cls)}>
      <div className="p-2.5 rounded-xl bg-background/50">{icon}</div>
      <div>
        <p className="text-2xl font-black">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface LogDetailProps {
  auditId: string;
  onClose: () => void;
  onFlag: (id: number) => void;
}

function LogDetail({ auditId, onClose, onFlag }: LogDetailProps) {
  const { data, isLoading } = useQuery<{ log: AuditLog; timeline: AuditLog[] }>({
    queryKey: ["/admin/audit-logs/detail", auditId],
    queryFn: () => apiGet(`/admin/audit-logs/${auditId}`),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw className="h-8 w-8 animate-spin text-primary" />
    </div>
  );

  const log = data?.log;
  const timeline = data?.timeline ?? [];
  if (!log) return null;

  return (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      {/* IDs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Audit ID</p>
          <p className="font-mono text-xs font-bold text-foreground">{log.auditId}</p>
        </div>
        <div className="rounded-xl border bg-muted/30 p-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Trace ID</p>
          <p className="font-mono text-xs font-bold text-foreground">{log.traceId}</p>
        </div>
      </div>

      {/* Meta */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {categoryIcon(log.actionCategory)}
            <span className="font-mono text-xs text-muted-foreground">{log.actionType}</span>
          </div>
          {riskBadge(log.riskLevel)}
        </div>
        <p className="text-sm font-semibold text-foreground">{log.description}</p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="text-muted-foreground">Actor</p>
            <p className="font-bold">{log.actorName ?? "—"} <span className="text-muted-foreground font-normal">({log.actorRole})</span></p>
          </div>
          <div>
            <p className="text-muted-foreground">Target</p>
            <p className="font-bold">{log.targetName ?? "—"} {log.targetId ? `#${log.targetId}` : ""}</p>
          </div>
          <div>
            <p className="text-muted-foreground">IP Address</p>
            <p className="font-mono font-bold">{log.ipAddress ?? "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Timestamp</p>
            <p className="font-bold">{formatTime(log.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Before / After */}
      {(!!log.beforeState || !!log.afterState) && (
        <div className="grid grid-cols-2 gap-2">
          {!!log.beforeState && (
            <div className="rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 p-3">
              <p className="text-[10px] font-bold text-red-500 mb-2 flex items-center gap-1"><XCircle className="h-3 w-3" />BEFORE</p>
              <pre className="text-[10px] font-mono text-red-700 dark:text-red-400 overflow-auto max-h-32 whitespace-pre-wrap">{JSON.stringify(log.beforeState as object, null, 2)}</pre>
            </div>
          )}
          {!!log.afterState && (
            <div className="rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 p-3">
              <p className="text-[10px] font-bold text-green-500 mb-2 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />AFTER</p>
              <pre className="text-[10px] font-mono text-green-700 dark:text-green-400 overflow-auto max-h-32 whitespace-pre-wrap">{JSON.stringify(log.afterState as object, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">📅 Day Timeline</p>
          <div className="space-y-1.5 border-l-2 border-border pl-4">
            {timeline.map(t => (
              <div key={t.id} className={cn("relative", t.auditId === log.auditId && "font-bold")}>
                <div className="absolute -left-5 top-1 w-2 h-2 rounded-full bg-border" />
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">{formatTime(t.createdAt).split(",")[1]}</span>
                  <div>
                    <p className={cn("text-xs", t.auditId === log.auditId ? "text-primary font-bold" : "text-foreground")}>{t.description}</p>
                    <p className="text-[10px] text-muted-foreground">{t.actorName} · {t.actionType}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        {!log.flagged && (
          <Button
            size="sm"
            variant="outline"
            className="border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"
            onClick={() => onFlag(log.id)}
          >
            <Flag className="h-3.5 w-3.5 mr-1.5" />
            Flag as Suspicious
          </Button>
        )}
        {log.flagged && (
          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-300 dark:border-red-800">
            <Flag className="h-3 w-3 mr-1" />Flagged — {log.flagReason}
          </Badge>
        )}
        <Button size="sm" variant="outline" onClick={onClose} className="ml-auto">
          <X className="h-3.5 w-3.5 mr-1.5" />Close
        </Button>
      </div>
    </div>
  );
}

const CATEGORIES = ["wallet", "user", "listing", "security", "agent", "subscription", "delivery", "support", "escrow", "fintech", "system"];
const RISK_LEVELS = ["critical", "high", "medium", "low"];

export default function AdminAuditPanel() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<string | null>(null);

  const queryKey = ["/admin/audit-logs", { search, category, riskLevel, flaggedOnly, page }];
  const { data, isLoading, refetch } = useQuery<{ logs: AuditLog[]; total: number; page: number; limit: number }>({
    queryKey,
    queryFn: () => {
      const params = new URLSearchParams();
      if (search)      params.set("search",    search);
      if (category)    params.set("category",  category);
      if (riskLevel)   params.set("riskLevel", riskLevel);
      if (flaggedOnly) params.set("flagged",   "1");
      params.set("page",  String(page));
      params.set("limit", "50");
      return apiGet(`/admin/audit-logs?${params}`);
    },
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery<{ total: number; flagged: number; highRisk: number; last24h: number }>({
    queryKey: ["/admin/audit-stats"],
    queryFn: () => apiGet("/admin/audit-stats"),
    refetchInterval: 30000,
  });

  const flagMut = useMutation({
    mutationFn: (id: number) => apiPatch(`/admin/audit-logs/${id}/flag`, { flagReason: "Manually flagged by admin" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/audit-logs"] }); },
  });

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  function exportCsv() {
    const header = "Audit ID,Trace ID,Actor,Role,Action,Category,Target,Description,Risk,IP,Timestamp";
    const rows = logs.map(l => [
      l.auditId, l.traceId, l.actorName, l.actorRole, l.actionType, l.actionCategory,
      l.targetName ?? "", l.description, l.riskLevel, l.ipAddress ?? "", l.createdAt,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [header, ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-4 p-4 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Enterprise Audit Trail
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Immutable log of all admin & agent actions • Bank-level traceability</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" />CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Logs" value={stats.total} icon={<Activity className="h-5 w-5 text-blue-500" />} cls="border-blue-200 dark:border-blue-800/50 bg-blue-50/50 dark:bg-blue-950/20" />
          <StatCard label="Last 24h" value={stats.last24h} icon={<Clock className="h-5 w-5 text-green-500" />} cls="border-green-200 dark:border-green-800/50 bg-green-50/50 dark:bg-green-950/20" />
          <StatCard label="High Risk" value={stats.highRisk} icon={<AlertTriangle className="h-5 w-5 text-orange-500" />} cls="border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-950/20" />
          <StatCard label="Flagged" value={stats.flagged} icon={<Flag className="h-5 w-5 text-red-500" />} cls="border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20" />
        </div>
      )}

      {/* Search & Filters */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by ID, actor, IP, description…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>

          <select
            value={riskLevel}
            onChange={e => { setRiskLevel(e.target.value); setPage(1); }}
            className="h-8 rounded-lg border border-input bg-background px-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Risk Levels</option>
            {RISK_LEVELS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
          </select>

          <button
            onClick={() => { setFlaggedOnly(!flaggedOnly); setPage(1); }}
            className={cn(
              "h-8 px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors",
              flaggedOnly
                ? "bg-red-500 text-white border-red-500"
                : "border-input bg-background text-foreground hover:border-red-300"
            )}
          >
            <Flag className="h-3 w-3" />
            {flaggedOnly ? "Flagged Only ✓" : "Flagged Only"}
          </button>

          {(search || category || riskLevel || flaggedOnly) && (
            <button
              onClick={() => { setSearch(""); setCategory(""); setRiskLevel(""); setFlaggedOnly(false); setPage(1); }}
              className="h-8 px-3 rounded-lg border border-input bg-background text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
            >
              <X className="h-3 w-3" />Clear
            </button>
          )}
        </div>
      </div>

      {/* Log Table */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <Shield className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="font-bold text-foreground">No audit logs found</p>
            <p className="text-sm text-muted-foreground">Actions will be recorded as admins use the platform</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground">Audit ID</th>
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground">Actor</th>
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground">Action</th>
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground">Description</th>
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground">Risk</th>
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground">Time</th>
                    <th className="text-left px-4 py-3 font-bold text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr
                      key={log.id}
                      className={cn(
                        "border-b transition-colors cursor-pointer hover:bg-muted/30",
                        i % 2 === 0 ? "bg-background" : "bg-muted/10",
                        log.flagged && "bg-red-50/30 dark:bg-red-950/10",
                        log.riskLevel === "critical" && "border-l-2 border-l-red-500"
                      )}
                      onClick={() => setSelectedLog(log.auditId)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {log.flagged && <Flag className="h-3 w-3 text-red-500 shrink-0" />}
                          <code className="font-mono text-primary text-[10px]">{log.auditId}</code>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold text-foreground">{log.actorName ?? "—"}</p>
                          <p className="text-muted-foreground text-[10px]">{log.actorRole}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {categoryIcon(log.actionCategory)}
                          <span className="font-mono text-[10px] text-muted-foreground">{log.actionType}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <p className="truncate text-foreground">{log.description}</p>
                        {log.ipAddress && <p className="text-muted-foreground text-[10px] font-mono">{log.ipAddress}</p>}
                      </td>
                      <td className="px-4 py-3">{riskBadge(log.riskLevel)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatTime(log.createdAt)}</td>
                      <td className="px-4 py-3">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <p className="text-xs text-muted-foreground">{total.toLocaleString()} total entries</p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 text-xs">Prev</Button>
                <span className="text-xs text-muted-foreground">{page} / {totalPages || 1}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-7 text-xs">Next</Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={v => !v && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-primary" />
              Audit Entry — {selectedLog}
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <LogDetail
              auditId={selectedLog}
              onClose={() => setSelectedLog(null)}
              onFlag={(id) => { flagMut.mutate(id); setSelectedLog(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
