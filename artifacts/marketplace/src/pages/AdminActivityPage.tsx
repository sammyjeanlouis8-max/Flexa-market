/**
 * AdminActivityPage — User Activity Hub
 * Route: /admin/activity
 * Shows all users; clicking one reveals their full activity timeline
 * (purchases, sales, listings, logins) + real-time last-seen.
 */
import { useState, useEffect, useMemo } from "react";
import {
  ArrowLeft, Search, RefreshCw, ShoppingBag, Tag,
  LogIn, Package, Wallet, Clock, ChevronRight, X,
  User, ShieldAlert, Ban,
} from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";

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
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}j`;
  return new Date(date).toLocaleDateString();
}

function fmt(date: string | Date) {
  return new Date(date).toLocaleString("fr-HT", { dateStyle: "medium", timeStyle: "short" });
}

type ActivityItem =
  | { kind: "login";   createdAt: string; action: string; ip: string; device: string; browser: string }
  | { kind: "purchase"; createdAt: string; id: number; description: string; amount: number; currency: string; paymentMethod: string }
  | { kind: "sale";    createdAt: string; id: number; description: string; amount: number; sellerEarnings: number; currency: string }
  | { kind: "listing"; createdAt: string; id: number; title: string; status: string; price: number };

function mergeActivity(data: any): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const l of data.loginLogs ?? []) {
    items.push({ kind: "login", createdAt: l.createdAt, action: l.action, ip: l.ip ?? "—", device: l.device ?? "—", browser: l.browser ?? "—" });
  }
  for (const p of data.purchases ?? []) {
    items.push({ kind: "purchase", createdAt: p.createdAt, id: p.id, description: p.description ?? "Acha", amount: p.amount, currency: p.currency, paymentMethod: p.paymentMethod });
  }
  for (const s of data.sales ?? []) {
    items.push({ kind: "sale", createdAt: s.createdAt, id: s.id, description: s.description ?? "Vant", amount: s.amount, sellerEarnings: s.sellerEarnings ?? 0, currency: s.currency });
  }
  for (const li of data.listings ?? []) {
    items.push({ kind: "listing", createdAt: li.createdAt, id: li.id, title: li.title, status: li.status, price: li.price });
  }
  return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const KIND_META = {
  login:    { icon: LogIn,       color: "bg-blue-100 dark:bg-blue-900/40",   iconColor: "text-blue-600 dark:text-blue-400",    label: "Koneksyon" },
  purchase: { icon: ShoppingBag, color: "bg-orange-100 dark:bg-orange-900/40", iconColor: "text-orange-600 dark:text-orange-400", label: "Acha" },
  sale:     { icon: Tag,         color: "bg-emerald-100 dark:bg-emerald-900/40", iconColor: "text-emerald-600 dark:text-emerald-400", label: "Vant" },
  listing:  { icon: Package,     color: "bg-violet-100 dark:bg-violet-900/40",  iconColor: "text-violet-600 dark:text-violet-400",  label: "Lis" },
};

type FilterKind = "all" | "login" | "purchase" | "sale" | "listing";

/* ── Activity detail panel ── */
function ActivityDetail({ userId, onClose }: { userId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState<FilterKind>("all");

  const load = async () => {
    setLoading(true); setError(null);
    try { setData(await apiFetch(`/api/admin/users/${userId}/activity`)); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [userId]);

  const allItems = useMemo(() => (data ? mergeActivity(data) : []), [data]);
  const items    = filter === "all" ? allItems : allItems.filter(i => i.kind === filter);

  const u = data?.user;
  const wallet = data?.wallet;

  return (
    <div className="flex flex-col h-full">
      {/* User header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={onClose} className="md:hidden p-1.5 rounded-lg hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-black text-sm shrink-0">
          {u ? (u.name ?? "?")[0].toUpperCase() : "…"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm truncate">{u?.name ?? "…"}</p>
          <p className="text-xs text-muted-foreground truncate">{u?.email}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {u?.isBanned  && <span className="text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-2 py-0.5 rounded-full flex items-center gap-1"><Ban className="h-2.5 w-2.5" /> Bann</span>}
          {u?.isFlagged && <span className="text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 px-2 py-0.5 rounded-full flex items-center gap-1"><ShieldAlert className="h-2.5 w-2.5" /> Flag</span>}
          {u?.isAdmin   && <span className="text-[10px] font-bold bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 px-2 py-0.5 rounded-full">Admin</span>}
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-muted"><RefreshCw className="h-3.5 w-3.5" /></button>
        </div>
      </div>

      {/* Stats bar */}
      {u && (
        <div className="grid grid-cols-4 gap-0 border-b border-border shrink-0">
          {[
            { label: t("adminActivity.statPurchases"), value: data?.purchases?.length ?? 0, color: "text-orange-600" },
            { label: t("adminActivity.statSales"),     value: data?.sales?.length ?? 0,     color: "text-emerald-600" },
            { label: t("adminActivity.statListings"),  value: data?.listings?.length ?? 0,  color: "text-violet-600" },
            { label: t("adminActivity.statLogins"),    value: data?.loginLogs?.length ?? 0, color: "text-blue-600" },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center py-2.5 border-r last:border-r-0 border-border">
              <span className={`text-base font-black ${s.color}`}>{s.value}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5 text-center leading-tight">{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Wallet row */}
      {wallet && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/20 border-b border-border text-xs shrink-0">
          <Wallet className="h-3.5 w-3.5 text-emerald-600" />
          <span className="text-emerald-700 dark:text-emerald-400 font-bold">
            FM Wallet: ${((wallet.balanceUsd ?? 0) + (wallet.promoBalance ?? 0)).toFixed(2)}
          </span>
          {(wallet.promoBalance ?? 0) > 0 && (
            <span className="text-emerald-600 dark:text-emerald-500">
              (${wallet.balanceUsd?.toFixed(2)} reyèl + ${wallet.promoBalance?.toFixed(2)} promo)
            </span>
          )}
        </div>
      )}

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border overflow-x-auto shrink-0">
        {(["all", "purchase", "sale", "login", "listing"] as FilterKind[]).map(k => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
              filter === k
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {k === "all" ? t("adminActivity.filterAll") : KIND_META[k].label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-destructive">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">{t("adminActivity.noActivity")}</div>
        ) : (
          <div className="divide-y divide-border">
            {items.map((item, i) => {
              const meta = KIND_META[item.kind];
              const Icon = meta.icon;
              return (
                <div key={`${item.kind}-${i}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className={`w-8 h-8 rounded-xl ${meta.color} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Icon className={`h-4 w-4 ${meta.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    {item.kind === "login" && (
                      <>
                        <p className="text-sm font-bold">
                          {item.action === "register" ? t("adminActivity.eventRegister") : t("adminActivity.eventLogin")}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.device} · {item.browser} · {item.ip}</p>
                      </>
                    )}
                    {item.kind === "purchase" && (
                      <>
                        <p className="text-sm font-bold">{t("adminActivity.eventPurchase")}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.description} · {item.paymentMethod}</p>
                        <span className="text-xs font-black text-orange-600">−${item.amount.toFixed(2)}</span>
                      </>
                    )}
                    {item.kind === "sale" && (
                      <>
                        <p className="text-sm font-bold">{t("adminActivity.eventSale")}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                        <span className="text-xs font-black text-emerald-600">+${(item.sellerEarnings || item.amount).toFixed(2)}</span>
                      </>
                    )}
                    {item.kind === "listing" && (
                      <>
                        <p className="text-sm font-bold truncate">{item.title}</p>
                        <p className="text-xs text-muted-foreground">
                          ${item.price.toFixed(2)} ·{" "}
                          <span className={
                            item.status === "available" ? "text-emerald-600" :
                            item.status === "sold" ? "text-blue-600" : "text-amber-600"
                          }>{item.status}</span>
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function AdminActivityPage() {
  const [, setLocation]         = useLocation();
  const { user }                = useAuth();
  const { t }                   = useTranslation();

  const [users, setUsers]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [search, setSearch]     = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.isAdmin) { setLocation("/admin"); return; }
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true); setError(null);
    try { setUsers((await apiFetch("/api/admin/users")).users ?? []); }
    catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      String(u.id).includes(q)
    );
  }, [users, search]);

  const selectedUser = selected !== null ? users.find(u => u.id === selected) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-background">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={() => setLocation("/admin")} className="p-1.5 rounded-lg hover:bg-muted">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="font-black text-base">{t("adminActivity.title")}</h1>
          <p className="text-xs text-muted-foreground">{users.length} {t("adminActivity.usersCount")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={loadUsers} className="p-1.5 rounded-lg hover:bg-muted">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: user list ── */}
        <div className={`flex flex-col border-r border-border bg-card ${selected !== null ? "hidden md:flex md:w-72 lg:w-80" : "flex w-full md:w-72 lg:w-80"} shrink-0`}>
          {/* Search */}
          <div className="px-3 py-2.5 border-b border-border shrink-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("adminActivity.searchPlaceholder")}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-muted border-0 outline-none focus:ring-2 focus:ring-primary/40"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="p-4 text-center text-sm text-destructive">{error}</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">{t("adminActivity.noUsers")}</div>
            ) : (
              filtered.map(u => (
                <button
                  key={u.id}
                  onClick={() => setSelected(u.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors border-b border-border/50 ${selected === u.id ? "bg-primary/8 border-l-2 border-l-primary" : ""}`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center text-white font-black text-sm shrink-0">
                    {(u.name ?? "?")[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold truncate">{u.name}</p>
                      {u.isBanned  && <Ban className="h-3 w-3 text-red-500 shrink-0" />}
                      {u.isFlagged && <ShieldAlert className="h-3 w-3 text-amber-500 shrink-0" />}
                      {u.isAdmin   && <User className="h-3 w-3 text-violet-500 shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    {u.lastSeen && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" /> {timeAgo(u.lastSeen)}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── Right: activity detail ── */}
        <div className={`flex-1 overflow-hidden ${selected !== null ? "flex flex-col" : "hidden md:flex md:flex-col"}`}>
          {selected !== null ? (
            <ActivityDetail key={selected} userId={selected} onClose={() => setSelected(null)} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="font-bold text-muted-foreground">{t("adminActivity.selectUser")}</p>
              <p className="text-sm text-muted-foreground/70">{t("adminActivity.selectUserSub")}</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
