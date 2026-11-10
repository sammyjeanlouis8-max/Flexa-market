import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, ChevronDown, ChevronRight, Clock, Loader2,
  MoreHorizontal, Search, Smartphone, Ban, ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { isAdminUser, isSuperAdminUser } from "@/lib/adminCountryAccess";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const LIST_STATE_KEY = "flexa_control_users_list_state_v1";
const ONLINE_MS = 5 * 60 * 1000;

type AccountStatus = "active" | "inactive" | "suspended" | "blocked";

type AdminUserRow = {
  id: number;
  name: string;
  email?: string;
  avatar?: string | null;
  country?: string | null;
  isBanned?: boolean;
  isRestricted?: boolean;
  restrictedUntil?: string | null;
  restrictionReason?: string | null;
  flagReason?: string | null;
  lastSeenAt?: string | null;
  createdAt?: string;
  role?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
  listingCount?: number;
};

type UserDetailPayload = {
  user: AdminUserRow & {
    countryDisplay: string;
    accountType: string;
    accountStatus: AccountStatus;
    isOnline: boolean;
    signupDate?: string;
  };
  overview: {
    ordersSold: number;
    netSales: number;
    currency: string;
    visitsToday: number;
    listingCount: number;
    restriction: { reason: string | null; until: string | null } | null;
    blockReason: string | null;
  };
  sales: {
    periodLabel: string;
    items: Array<{
      id: number;
      listingId?: number | null;
      amount: number;
      currency?: string | null;
      paymentStatus?: string | null;
      description?: string | null;
      sellerEarnings?: number | null;
      createdAt?: string;
    }>;
    totals: { ordersSold: number; netSales: number; currency: string };
  };
  activity: {
    isOnline: boolean;
    lastSeenAt: string | null;
    visitsToday: number;
    device: string;
    os: string;
    browser: string;
  };
  audit: {
    restrictions: Array<{
      id: number;
      reason: string;
      durationDays?: number | null;
      notes?: string | null;
      isActive?: boolean;
      expiresAt?: string | null;
      createdAt?: string;
      adminId?: number;
    }>;
    actions: Array<{
      id: number;
      actionType: string;
      description: string;
      actorName?: string | null;
      actorRole?: string | null;
      createdAt?: string;
      metadata?: unknown;
    }>;
  };
};

type DetailTab = "overview" | "sales" | "activity" | "audit";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function avatarTone(id: number) {
  const tones = [
    "bg-emerald-600", "bg-teal-600", "bg-cyan-700", "bg-sky-700",
    "bg-indigo-600", "bg-violet-600", "bg-rose-600", "bg-amber-700",
  ];
  return tones[id % tones.length];
}

function resolveStatus(u: AdminUserRow): AccountStatus {
  if (u.isBanned) return "blocked";
  if (u.isRestricted) return "suspended";
  const last = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0;
  if (last > 0 && Date.now() - last < 30 * 86_400_000) return "active";
  return "inactive";
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const map: Record<AccountStatus, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    inactive: "bg-slate-100 text-slate-600 border-slate-200",
    suspended: "bg-orange-50 text-orange-700 border-orange-200",
    blocked: "bg-red-50 text-red-700 border-red-200",
  };
  const label: Record<AccountStatus, string> = {
    active: "Active",
    inactive: "Inactive",
    suspended: "Suspended",
    blocked: "Blocked",
  };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold", map[status])}>
      {label[status]}
    </span>
  );
}

function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
}

function formatWhen(value?: string | null) {
  if (!value) return "Unavailable";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unavailable";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function loadListState() {
  try {
    const raw = sessionStorage.getItem(LIST_STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as {
      q: string;
      country: string;
      status: string;
      scroll: number;
    };
  } catch {
    return null;
  }
}

function saveListState(state: { q: string; country: string; status: string; scroll: number }) {
  try {
    sessionStorage.setItem(LIST_STATE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

async function adminFetch(token: string | null | undefined, path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export default function AdminUsers() {
  const params = useParams<{ id?: string }>();
  const search = useSearch();
  const detailId = params.id ? parseInt(params.id, 10) : NaN;
  if (Number.isFinite(detailId)) {
    return <UserDetailsScreen userId={detailId} />;
  }
  // Support /admin/users?user=123 deep link
  const qUser = new URLSearchParams(search).get("user");
  if (qUser && /^\d+$/.test(qUser)) {
    return <UserDetailsScreen userId={parseInt(qUser, 10)} />;
  }
  return <UsersListScreen />;
}

function UsersListScreen() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isAdmin = isAdminUser(user as any);
  const isSuperAdmin = isSuperAdminUser(user as any);
  const saved = useRef(loadListState()).current;

  const [q, setQ] = useState(saved?.q ?? "");
  const [country, setCountry] = useState(saved?.country ?? "all");
  const [status, setStatus] = useState(saved?.status ?? "all");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/admin");
    }
  }, [isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (country !== "all" && isSuperAdmin) params.set("country", country);
      if (status !== "all") params.set("status", status);
      const data = await adminFetch(token, `/api/admin/users?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      toast({ title: e.message || "Failed to load users", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [token, q, country, status, isSuperAdmin, toast]);

  useEffect(() => {
    const tmr = setTimeout(() => { void load(); }, 180);
    return () => clearTimeout(tmr);
  }, [load]);

  useEffect(() => {
    if (!loading && saved?.scroll && listRef.current) {
      listRef.current.scrollTop = saved.scroll;
    }
  }, [loading, saved?.scroll]);

  const openUser = (id: number) => {
    saveListState({
      q,
      country,
      status,
      scroll: listRef.current?.scrollTop ?? 0,
    });
    setSelectedId(id);
    navigate(`/admin/users/${id}`);
  };

  if (!isAdmin) return null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom,0px))] max-w-lg flex-col lg:h-auto lg:min-h-[70vh]" data-testid="admin-users-list">
      <div className="shrink-0 px-4 pb-3 pt-3">
        <p className="text-[11px] font-semibold text-muted-foreground">
          {t("adminNav.more", { defaultValue: "More" })}
          <span className="mx-1 text-muted-foreground/50">/</span>
          {t("adminNav.users", { defaultValue: "Users" })}
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight">
          {t("adminNav.users", { defaultValue: "Users" })}
        </h1>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("adminUsers.searchPlaceholder", { defaultValue: "Search users" })}
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none ring-[hsl(152,65%,22%)]/30 focus:ring-2"
            data-testid="admin-users-search"
          />
        </div>

        <div className="mt-2.5 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={!isSuperAdmin}
              className="h-9 w-full appearance-none rounded-xl border border-border bg-card px-3 pr-8 text-xs font-semibold outline-none disabled:opacity-70"
              data-testid="admin-users-country-filter"
            >
              <option value="all">{t("adminUsers.allCountries", { defaultValue: "All countries" })}</option>
              {SUPPORTED_COUNTRIES.map((c) => (
                <option key={c} value={c}>{COUNTRY_FLAGS[c] ? `${COUNTRY_FLAGS[c]} ` : ""}{c}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative min-w-0 flex-1">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full appearance-none rounded-xl border border-border bg-card px-3 pr-8 text-xs font-semibold outline-none"
              data-testid="admin-users-status-filter"
            >
              <option value="all">{t("adminUsers.allStatuses", { defaultValue: "All statuses" })}</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="suspended">Suspended</option>
              <option value="blocked">Blocked</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-card">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {t("adminUsers.empty", { defaultValue: "No users match these filters." })}
          </p>
        ) : (
          rows.map((u) => {
            const st = resolveStatus(u);
            const countryLabel = u.country?.trim() ? u.country : t("adminUsers.countryNotSet", { defaultValue: "Country not set" });
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => openUser(u.id)}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-border/70 px-4 py-2.5 text-left transition-colors",
                  selectedId === u.id ? "bg-[hsl(152,45%,95%)]" : "hover:bg-muted/40 active:bg-muted/60",
                )}
                data-testid={`admin-user-row-${u.id}`}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={u.avatar ?? undefined} />
                  <AvatarFallback className={cn("text-[11px] font-bold text-white", avatarTone(u.id))}>
                    {initials(u.name || "?")}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold leading-tight text-foreground">{u.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{countryLabel}</span>
                </span>
                <StatusBadge status={st} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function UserDetailsScreen({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isAdmin = isAdminUser(user as any);
  const isSuperAdmin = isSuperAdminUser(user as any);

  const [detail, setDetail] = useState<UserDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [busy, setBusy] = useState(false);

  const [suspendOpen, setSuspendOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState<"suspend" | "block" | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  const [suspendDays, setSuspendDays] = useState("7");
  const [suspendReason, setSuspendReason] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(token, `/api/admin/users/${userId}`);
      setDetail(data);
    } catch (e: any) {
      toast({ title: e.message || "Failed to load user", variant: "destructive" });
      navigate("/admin/users");
    } finally {
      setLoading(false);
    }
  }, [token, userId, toast, navigate]);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void load();
  }, [isAdmin, navigate, load]);

  const suspendEndsAt = useMemo(() => {
    const days = parseInt(suspendDays, 10);
    if (!Number.isFinite(days) || days <= 0) return null;
    return new Date(Date.now() + days * 86_400_000);
  }, [suspendDays]);

  const u = detail?.user;
  const canModerate = !!(u && !u.isSuperAdmin && (isSuperAdmin || !u.isAdmin) && u.id !== user?.id);

  const runAction = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
      toast({ title: t("adminUsers.actionSuccess", { defaultValue: "Account updated" }) });
    } catch (e: any) {
      toast({ title: e.message || "Action failed", variant: "destructive" });
    } finally {
      setBusy(false);
      setSuspendOpen(false);
      setBlockOpen(false);
      setLiftOpen(null);
      setMoreOpen(false);
    }
  };

  if (!isAdmin) return null;

  if (loading || !detail || !u) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const countryLabel = u.countryDisplay || t("adminUsers.countryNotSet", { defaultValue: "Country not set" });
  const status = (u.accountStatus || resolveStatus(u)) as AccountStatus;

  return (
    <div className="mx-auto max-w-lg pb-10" data-testid="admin-user-details">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate("/admin/users")}
            className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold text-[hsl(152,65%,22%)]"
            data-testid="admin-user-details-back"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("adminNav.users", { defaultValue: "Users" })}
          </button>
          <h1 className="flex-1 text-center text-[15px] font-bold">{t("adminUsers.detailsTitle", { defaultValue: "User details" })}</h1>
          <span className="w-16" />
        </div>
      </div>

      <div className="px-4 pt-5 text-center">
        <Avatar className="mx-auto h-16 w-16">
          <AvatarImage src={u.avatar ?? undefined} />
          <AvatarFallback className={cn("text-lg font-black text-white", avatarTone(u.id))}>
            {initials(u.name)}
          </AvatarFallback>
        </Avatar>
        <h2 className="mt-3 text-xl font-black tracking-tight">{u.name}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {u.accountType}
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          {countryLabel}
        </p>
        <div className="mt-2 flex items-center justify-center gap-2">
          <StatusBadge status={status} />
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", detail.activity.isOnline ? "bg-emerald-500" : "bg-slate-300")} />
            {detail.activity.isOnline
              ? t("adminUsers.online", { defaultValue: "Online" })
              : t("adminUsers.offline", { defaultValue: "Offline" })}
          </span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("adminUsers.signedUp", { defaultValue: "Signed up" })}: {formatWhen(u.signupDate || u.createdAt)}
        </p>
      </div>

      {canModerate && (
        <div className="mt-4 flex gap-2 px-4">
          {status === "suspended" ? (
            <Button
              variant="outline"
              className="h-9 flex-1 border-emerald-300 text-emerald-700"
              disabled={busy}
              onClick={() => setLiftOpen("suspend")}
              data-testid="admin-user-lift-suspend"
            >
              {t("adminUsers.liftSuspension", { defaultValue: "Lift suspension" })}
            </Button>
          ) : status === "blocked" ? (
            <Button
              variant="outline"
              className="h-9 flex-1 border-emerald-300 text-emerald-700"
              disabled={busy}
              onClick={() => setLiftOpen("block")}
              data-testid="admin-user-unblock"
            >
              {t("adminUsers.unblock", { defaultValue: "Unblock" })}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                className="h-9 flex-1 border-amber-300 text-amber-700"
                disabled={busy}
                onClick={() => setSuspendOpen(true)}
                data-testid="admin-user-suspend"
              >
                <ShieldAlert className="mr-1 h-3.5 w-3.5" />
                {t("adminUsers.suspend", { defaultValue: "Suspend" })}
              </Button>
              <Button
                variant="outline"
                className="h-9 flex-1 border-red-300 text-red-700"
                disabled={busy}
                onClick={() => setBlockOpen(true)}
                data-testid="admin-user-block"
              >
                <Ban className="mr-1 h-3.5 w-3.5" />
                {t("adminUsers.block", { defaultValue: "Block" })}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            className="h-9 px-3"
            disabled={busy}
            onClick={() => setMoreOpen(true)}
            data-testid="admin-user-more-actions"
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="ml-1 hidden sm:inline">{t("adminUsers.moreActions", { defaultValue: "More actions" })}</span>
          </Button>
        </div>
      )}

      <div className="mt-5 flex gap-1 border-b border-border px-2">
        {([
          ["overview", t("adminUsers.tabOverview", { defaultValue: "Overview" })],
          ["sales", t("adminUsers.tabSales", { defaultValue: "Sales" })],
          ["activity", t("adminUsers.tabActivity", { defaultValue: "Activity" })],
          ["audit", t("adminUsers.tabAudit", { defaultValue: "Audit" })],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex-1 border-b-2 px-1 py-2.5 text-[12px] font-bold transition-colors",
              tab === id
                ? "border-[hsl(152,65%,22%)] text-[hsl(152,65%,22%)]"
                : "border-transparent text-muted-foreground",
            )}
            data-testid={`admin-user-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-4">
        {tab === "overview" && (
          <div className="space-y-4" data-testid="admin-user-overview">
            <div className="grid grid-cols-3 gap-2">
              {[
                [t("adminUsers.ordersSold", { defaultValue: "Orders sold" }), String(detail.overview.ordersSold)],
                [t("adminUsers.netSales", { defaultValue: "Net sales" }), formatMoney(detail.overview.netSales, detail.overview.currency)],
                [t("adminUsers.visitsToday", { defaultValue: "Visits today" }), String(detail.overview.visitsToday)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-border bg-card px-2.5 py-3 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="mt-1 text-[15px] font-black tabular-nums">{value}</p>
                </div>
              ))}
            </div>

            <section className="rounded-2xl border border-border bg-card p-3.5">
              <h3 className="text-[13px] font-bold">{t("adminUsers.accountInfo", { defaultValue: "Account information" })}</h3>
              <dl className="mt-2 space-y-2 text-[13px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="font-semibold">{u.accountType}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Country</dt>
                  <dd className="font-semibold text-right">{countryLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Listings</dt>
                  <dd className="font-semibold">{detail.overview.listingCount}</dd>
                </div>
                {(detail.overview.restriction || detail.overview.blockReason) && (
                  <div className="rounded-xl bg-muted/50 px-3 py-2 text-[12px]">
                    {detail.overview.blockReason && (
                      <p><span className="font-semibold">Block:</span> {detail.overview.blockReason}</p>
                    )}
                    {detail.overview.restriction && (
                      <p className="mt-1">
                        <span className="font-semibold">Suspension:</span>{" "}
                        {detail.overview.restriction.reason || "—"}
                        {detail.overview.restriction.until
                          ? ` · until ${formatWhen(detail.overview.restriction.until)}`
                          : ""}
                      </p>
                    )}
                  </div>
                )}
              </dl>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3.5">
              <h3 className="text-[13px] font-bold">{t("adminUsers.recentActivity", { defaultValue: "Recent activity" })}</h3>
              <div className="mt-2 space-y-2 text-[13px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Last seen</span>
                  <span className="font-semibold">{formatWhen(detail.activity.lastSeenAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Smartphone className="h-3.5 w-3.5" /> Device</span>
                  <span className="font-semibold text-right">
                    {detail.activity.device === "—" || !detail.activity.device
                      ? "Unavailable"
                      : `${detail.activity.device} · ${detail.activity.os}`}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-3.5">
              <h3 className="text-[13px] font-bold">{t("adminUsers.recentSales", { defaultValue: "Recent sales" })}</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{detail.sales.periodLabel}</p>
              <div className="mt-2 divide-y divide-border">
                {detail.sales.items.slice(0, 5).length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">Unavailable</p>
                ) : detail.sales.items.slice(0, 5).map((sale) => (
                  <div key={sale.id} className="flex items-center gap-2.5 py-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-[10px] font-bold text-muted-foreground">
                      #{sale.listingId ?? sale.id}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">Order #{sale.id}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{sale.description || "Product sale"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-black tabular-nums">{formatMoney(Number(sale.sellerEarnings ?? sale.amount) || 0, sale.currency || "USD")}</p>
                      <p className="text-[10px] text-muted-foreground">{formatWhen(sale.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "sales" && (
          <div className="space-y-3" data-testid="admin-user-sales">
            <div className="rounded-2xl border border-border bg-card p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{detail.sales.periodLabel}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[11px] text-muted-foreground">Orders sold</p>
                  <p className="text-lg font-black">{detail.sales.totals.ordersSold}</p>
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Net sales</p>
                  <p className="text-lg font-black">{formatMoney(detail.sales.totals.netSales, detail.sales.totals.currency)}</p>
                </div>
              </div>
            </div>
            {detail.sales.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Unavailable</p>
            ) : detail.sales.items.map((sale) => (
              <div key={sale.id} className="rounded-2xl border border-border bg-card px-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold">Order #{sale.id}</p>
                    <p className="text-[12px] text-muted-foreground">{sale.description || `Listing #${sale.listingId ?? "—"}`}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Status: {sale.paymentStatus || "Unavailable"} · Qty: 1
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-black">{formatMoney(Number(sale.sellerEarnings ?? sale.amount) || 0, sale.currency || "USD")}</p>
                    <p className="text-[10px] text-muted-foreground">{formatWhen(sale.createdAt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-3" data-testid="admin-user-activity">
            <div className="rounded-2xl border border-border bg-card p-3.5 space-y-3 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Online status</span>
                <span className="font-semibold">{detail.activity.isOnline ? "Online" : "Offline"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account status</span>
                <StatusBadge status={status} />
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Last seen</span>
                <span className="font-semibold text-right">{formatWhen(detail.activity.lastSeenAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Visits today</span>
                <span className="font-semibold">{detail.activity.visitsToday}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Device</span>
                <span className="font-semibold text-right">
                  {!detail.activity.device || detail.activity.device === "—" ? "Unavailable" : detail.activity.device}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Operating system</span>
                <span className="font-semibold text-right">
                  {!detail.activity.os || detail.activity.os === "—" ? "Unavailable" : detail.activity.os}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">App / browser</span>
                <span className="font-semibold text-right">
                  {!detail.activity.browser || detail.activity.browser === "—" ? "Unavailable" : detail.activity.browser}
                </span>
              </div>
            </div>
          </div>
        )}

        {tab === "audit" && (
          <div className="space-y-3" data-testid="admin-user-audit">
            {detail.audit.actions.length === 0 && detail.audit.restrictions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Unavailable</p>
            ) : (
              <>
                {detail.audit.actions.map((a) => (
                  <div key={`a-${a.id}`} className="rounded-2xl border border-border bg-card px-3.5 py-3">
                    <p className="text-[13px] font-bold">{a.actionType.replace(/_/g, " ")}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{a.description}</p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {a.actorName || "Administrator"}
                      {a.actorRole ? ` · ${a.actorRole}` : ""}
                      {" · "}
                      {formatWhen(a.createdAt)}
                    </p>
                  </div>
                ))}
                {detail.audit.restrictions.map((r) => (
                  <div key={`r-${r.id}`} className="rounded-2xl border border-border bg-card px-3.5 py-3">
                    <p className="text-[13px] font-bold">Suspension · {r.reason}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">
                      {r.notes || (r.durationDays ? `${r.durationDays} days` : "Duration unavailable")}
                      {r.expiresAt ? ` · ends ${formatWhen(r.expiresAt)}` : ""}
                      {r.isActive ? " · active" : ""}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Admin #{r.adminId ?? "—"} · {formatWhen(r.createdAt)}
                    </p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Suspend dialog */}
      <Dialog open={suspendOpen} onOpenChange={(v) => !v && setSuspendOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adminUsers.suspendTitle", { defaultValue: "Suspend account" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs font-semibold">
              Days
              <input
                type="number"
                min={1}
                value={suspendDays}
                onChange={(e) => setSuspendDays(e.target.value)}
                className="mt-1 h-10 w-full rounded-xl border border-border px-3 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold">
              Reason
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
                placeholder="Why is this account being suspended?"
              />
            </label>
            {suspendEndsAt && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Ends {suspendEndsAt.toLocaleString()} · expires automatically without lifting a block
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button
              disabled={busy}
              className="bg-amber-600 hover:bg-amber-600"
              onClick={() => void runAction(async () => {
                const days = parseInt(suspendDays, 10);
                if (!Number.isFinite(days) || days <= 0) throw new Error("Enter a positive number of days");
                if (!suspendReason.trim()) throw new Error("A reason is required");
                await adminFetch(token, `/api/admin/users/${userId}/restrict`, {
                  method: "POST",
                  body: JSON.stringify({ reason: "other", notes: suspendReason.trim(), durationDays: days }),
                });
              })}
            >
              Confirm suspend
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block dialog */}
      <Dialog open={blockOpen} onOpenChange={(v) => !v && setBlockOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("adminUsers.blockTitle", { defaultValue: "Block account" })}</DialogTitle>
          </DialogHeader>
          <label className="block text-xs font-semibold">
            Reason
            <textarea
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-border px-3 py-2 text-sm"
              placeholder="Why is this account being blocked?"
            />
          </label>
          <p className="text-[12px] text-muted-foreground">
            The block stays in effect until an authorized administrator lifts it.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button
              disabled={busy}
              variant="destructive"
              onClick={() => void runAction(async () => {
                if (!blockReason.trim()) throw new Error("A reason is required");
                await adminFetch(token, `/api/admin/users/${userId}/ban`, {
                  method: "POST",
                  body: JSON.stringify({ reason: blockReason.trim() }),
                });
              })}
            >
              Confirm block
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lift dialog */}
      <Dialog open={!!liftOpen} onOpenChange={(v) => !v && setLiftOpen(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {liftOpen === "block" ? "Unblock account" : "Lift suspension"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Confirm this change. It will be recorded in the audit history.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLiftOpen(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => void runAction(async () => {
                const path = liftOpen === "block" ? "unban" : "unrestrict";
                await adminFetch(token, `/api/admin/users/${userId}/${path}`, { method: "POST" });
              })}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* More actions */}
      <Dialog open={moreOpen} onOpenChange={(v) => !v && setMoreOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>More actions</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Link href={`/profile/${userId}`} className="block rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:bg-muted/40">
              View public profile
            </Link>
            {isSuperAdmin && (
              <Link href={`/admin/security`} className="block rounded-xl border border-border px-3 py-2.5 text-sm font-semibold hover:bg-muted/40">
                Open security console
              </Link>
            )}
            <p className="px-1 text-[11px] text-muted-foreground">
              Registered country is read-only and cannot be changed from Control.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
