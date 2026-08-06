/**
 * AdminVipSubscriptions — Full-page Flexa VIP Subscription Hub
 * Route: /admin/vip-subscriptions
 */
import { useState, useEffect } from "react";
import { ArrowLeft, Crown, RefreshCw, Search, Plus, AlertCircle, X } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PLAN_COLORS: Record<string, string> = {
  basic:    "bg-muted text-muted-foreground",
  standard: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  premium:  "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  vip:      "bg-amber-500/20 text-amber-600 dark:text-amber-500",
};
const PLAN_LABELS: Record<string, string> = {
  basic: "Basic", standard: "Standard $15/mwa", premium: "Premium $30/mwa", vip: "Flexa VIP $50/mwa",
};

function authHeaders() {
  const tk = localStorage.getItem("flexamarket_token");
  return { "Content-Type": "application/json", ...(tk ? { Authorization: `Bearer ${tk}` } : {}) };
}

async function apiFetch(path: string, method = "GET", body?: object) {
  const res = await fetch(path, {
    method,
    credentials: "include",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Erè ${res.status}`);
  }
  return res.json();
}

export default function AdminVipSubscriptions() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [subs, setSubs]           = useState<any[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [filter, setFilter]       = useState<"all" | "active" | "vip" | "grace">("all");

  // Grant form
  const [grantOpen, setGrantOpen]   = useState(false);
  const [grantForm, setGrantForm]   = useState({ userId: "", plan: "vip", months: "1" });
  const [grantSaving, setGrantSaving] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiFetch("/api/admin/subscriptions");
      setSubs(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e.message ?? "Koneksyon echwe");
      setSubs([]);
    } finally { setLoading(false); }
  };

  const grant = async () => {
    if (!grantForm.userId) return;
    setGrantSaving(true);
    try {
      await apiFetch("/api/admin/subscriptions/grant", "POST", {
        userId: parseInt(grantForm.userId),
        plan: grantForm.plan,
        months: parseInt(grantForm.months) || 1,
      });
      toast({ title: `✅ Plan ${PLAN_LABELS[grantForm.plan] ?? grantForm.plan} ba itilizatè #${grantForm.userId}` });
      setGrantForm({ userId: "", plan: "vip", months: "1" });
      setGrantOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: e.message ?? "Echèk", variant: "destructive" });
    } finally { setGrantSaving(false); }
  };

  const revoke = async (userId: number, name: string) => {
    if (!confirm(`Revoké abònman ${name}?`)) return;
    try {
      await apiFetch("/api/admin/subscriptions/revoke", "POST", { userId });
      toast({ title: "🗑 Abònman révokè" });
      await load();
    } catch (e: any) {
      toast({ title: e.message ?? "Echèk", variant: "destructive" });
    }
  };

  const activate = async (subscriptionId: number, name: string) => {
    if (!confirm(`Aktive abònman #${subscriptionId} pou ${name}?`)) return;
    try {
      await apiFetch("/api/admin/subscriptions/activate", "POST", { subscriptionId });
      toast({ title: "✅ Abònman aktive!" });
      await load();
    } catch (e: any) {
      toast({ title: e.message ?? "Echèk", variant: "destructive" });
    }
  };

  useEffect(() => {
    if (user?.isAdmin || user?.isSuperAdmin) load();
  }, [user?.id]);

  // Guards
  if (!user) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="h-8 w-8 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
    </div>
  );
  if (!user.isAdmin && !user.isSuperAdmin) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3 text-center px-6">
      <p className="text-lg font-bold text-red-500">Aksè Refize</p>
      <Button variant="outline" size="sm" onClick={() => setLocation("/admin")}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Retounen
      </Button>
    </div>
  );

  // Stats
  const activeCount = subs.filter(r => r.sub?.status === "active").length;
  const graceCount  = subs.filter(r => r.sub?.status === "grace_period").length;
  const vipCount    = subs.filter(r => r.sub?.plan === "vip" && r.sub?.status === "active").length;
  const totalRevenue = subs
    .filter(r => r.sub?.status === "active" && r.sub?.amountUsd > 0)
    .reduce((acc, r) => acc + parseFloat(r.sub.amountUsd ?? 0), 0);

  // Filter + search
  const q = search.trim().toLowerCase();
  const filtered = subs.filter(row => {
    const sub = row.sub; const u = row.user;
    if (filter === "active" && sub?.status !== "active") return false;
    if (filter === "vip"    && sub?.plan !== "vip")      return false;
    if (filter === "grace"  && sub?.status !== "grace_period") return false;
    if (!q) return true;
    return (
      String(sub?.userId ?? "").includes(q) ||
      (u?.name ?? "").toLowerCase().includes(q) ||
      (u?.email ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={() => setLocation("/admin")} className="p-2 rounded-xl hover:bg-muted transition-colors -ml-1 shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 flex-1">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center shrink-0 shadow shadow-amber-200 dark:shadow-amber-900/50">
            <Crown className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black leading-none">👑 Flexa VIP</h1>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{t("adminBanner.vipHubSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setGrantOpen(true)}>
            <Plus className="h-3 w-3 mr-1" />{t("adminBanner.vipGrantBtn")}
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">

        {/* ── Stats grid ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 text-center">
            <p className="text-2xl font-black text-green-500 tabular-nums">{activeCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">✓ {t("adminBanner.vipStatActive")}</p>
          </div>
          <div className={`rounded-xl border p-3 text-center ${graceCount > 0 ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-muted/40"}`}>
            <p className={`text-2xl font-black tabular-nums ${graceCount > 0 ? "text-amber-500" : "text-muted-foreground"}`}>{graceCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">⚠ {t("adminBanner.vipStatGrace")}</p>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
            <p className="text-2xl font-black text-amber-500 tabular-nums">{vipCount}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">👑 {t("adminBanner.vipStatVip")}</p>
          </div>
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center">
            <p className="text-2xl font-black text-emerald-500 tabular-nums">${totalRevenue.toFixed(0)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">💰 {t("adminBanner.vipStatRevenue")}</p>
          </div>
        </div>

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 px-4 py-3">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs text-red-600 dark:text-red-400 flex-1">{error}</p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>Retry</Button>
          </div>
        )}

        {/* ── Grant form panel ── */}
        {grantOpen && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-500" />{t("adminBanner.vipGrantTitle")}
              </h3>
              <button onClick={() => setGrantOpen(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                placeholder="ID Itilizatè *"
                value={grantForm.userId}
                onChange={e => setGrantForm(f => ({ ...f, userId: e.target.value }))}
                className="col-span-2 h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
              <select
                value={grantForm.plan}
                onChange={e => setGrantForm(f => ({ ...f, plan: e.target.value }))}
                className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
              >
                <option value="standard">Standard ($15/mwa)</option>
                <option value="premium">Premium ($30/mwa)</option>
                <option value="vip">Flexa VIP ($50/mwa)</option>
              </select>
              <input
                type="number"
                min="1" max="12"
                value={grantForm.months}
                onChange={e => setGrantForm(f => ({ ...f, months: e.target.value }))}
                placeholder="Mwa (1–12)"
                className="h-9 rounded-lg border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>
            <Button size="sm" onClick={grant} disabled={grantSaving || !grantForm.userId} className="bg-amber-500 hover:bg-amber-600 text-white">
              {grantSaving ? "…" : <><Plus className="h-3.5 w-3.5 mr-1" />{t("adminBanner.vipGrantTitle")}</>}
            </Button>
          </div>
        )}

        {/* ── Search + Filter ── */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder={t("adminBanner.txHubSearch")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full h-9 rounded-xl border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-amber-500/30"
            />
          </div>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as any)}
            className="h-9 rounded-xl border border-border bg-background px-2 text-xs shrink-0"
          >
            <option value="all">{t("adminBanner.vipStatActive") === "Active" ? "All" : "Tout"}</option>
            <option value="active">{t("adminBanner.vipStatActive")}</option>
            <option value="vip">VIP</option>
            <option value="grace">{t("adminBanner.vipStatGrace")}</option>
          </select>
        </div>

        {/* ── List ── */}
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4,5].map(i => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
          </div>
        ) : !error && subs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <div className="h-14 w-14 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Crown className="h-7 w-7 text-amber-400" />
            </div>
            <p className="text-sm text-muted-foreground">{t("adminBanner.vipNone")}</p>
            <Button size="sm" variant="outline" onClick={load}>
              <RefreshCw className="h-3 w-3 mr-1" />Refresh
            </Button>
          </div>
        ) : !error && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{filtered.length} {t("adminBanner.vipSubscribers")}</p>

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t("adminBanner.vipNoResult")}</p>
            ) : filtered.map((row: any) => {
              const sub = row.sub;
              const u   = row.user;
              const isActive = sub?.status === "active";
              const isGrace  = sub?.status === "grace_period";
              const now  = new Date();
              const graceUntil  = sub?.graceUntil ? new Date(sub.graceUntil) : null;
              const expiresAt   = sub?.expiresAt   ? new Date(sub.expiresAt)  : null;
              const nextBilling = sub?.nextBillingDate ? new Date(sub.nextBillingDate) : expiresAt;
              const startedAt   = sub?.startedAt ? new Date(String(sub.startedAt).replace(" ", "T"))
                                : sub?.createdAt ? new Date(String(sub.createdAt).replace(" ", "T")) : null;
              const daysLeft = graceUntil
                ? Math.max(0, Math.ceil((graceUntil.getTime() - now.getTime()) / 86400000))
                : null;

              return (
                <div
                  key={sub?.id}
                  className={`rounded-xl border p-3.5 transition-colors ${
                    isActive ? "border-border bg-card"
                    : isGrace ? "border-amber-500/40 bg-amber-500/5"
                    : "border-border/40 bg-muted/20 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Avatar initials */}
                    <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${
                      sub?.plan === "vip" ? "bg-amber-500/20 text-amber-600" : "bg-purple-500/20 text-purple-600"
                    }`}>
                      {(u?.name ?? "?")[0].toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      {/* Name + plan badge + status */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold truncate">{u?.name ?? `Itilizatè #${sub?.userId}`}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${PLAN_COLORS[sub?.plan ?? "basic"]}`}>
                          {PLAN_LABELS[sub?.plan] ?? sub?.plan}
                        </span>
                        {isActive && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 font-semibold">✓ Aktif</span>
                        )}
                        {isGrace && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold">
                            ⚠ Tan Gras {daysLeft !== null ? `${daysLeft}j` : ""}
                          </span>
                        )}
                        {!isActive && !isGrace && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{sub?.status}</span>
                        )}
                      </div>

                      {/* ID + email */}
                      <p className="text-[10px] text-muted-foreground">
                        ID #{sub?.userId}{u?.email ? ` · ${u.email}` : ""}
                      </p>

                      {/* Dates + price */}
                      <div className="flex gap-3 flex-wrap">
                        {startedAt && (
                          <span className="text-[10px] text-muted-foreground">
                            📅 <span className="text-foreground font-medium">
                              {startedAt.toLocaleDateString("fr-HT")}
                            </span>
                          </span>
                        )}
                        {nextBilling && (isActive || isGrace) && (
                          <span className="text-[10px] text-muted-foreground">
                            🔄 Pwochen:{" "}
                            <span className={`font-medium ${isGrace ? "text-amber-500" : "text-foreground"}`}>
                              {nextBilling.toLocaleDateString("fr-HT")}
                            </span>
                          </span>
                        )}
                        {sub?.amountUsd != null && sub.amountUsd > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            💰 <span className="text-emerald-600 dark:text-emerald-400 font-bold">${sub.amountUsd}/mwa</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-1 shrink-0">
                      {/* Activate button for pending subscriptions */}
                      {sub?.status === "pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                          onClick={() => activate(sub.id, u?.name ?? `#${sub.userId}`)}
                        >
                          ✅ Aktive
                        </Button>
                      )}
                      {/* Revoke button */}
                      {(isActive || isGrace) && sub?.plan !== "basic" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs shrink-0 text-red-500 border-red-500/30 hover:bg-red-500/10"
                          onClick={() => revoke(sub.userId, u?.name ?? `#${sub.userId}`)}
                        >
                          {t("adminBanner.vipRevoke")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filtered.length > 0 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                {filtered.length} abòne · Revni total: <span className="font-bold text-emerald-500">${totalRevenue.toFixed(2)}/mwa</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
