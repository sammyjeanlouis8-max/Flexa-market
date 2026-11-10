/**
 * Flexa Control → User Details (+ Devices & Sessions).
 * Layout follows the Control mockups: identity header, action row,
 * Overview / Activity / Security / Audit, and Devices & Sessions.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Ban, ChevronRight, Copy, Flag, Headset, IdCard, Loader2,
  Mail, MapPin, MessageSquare, MoreHorizontal, Package, Phone,
  ShieldAlert, ShieldCheck, ShoppingCart, Smartphone, Tag, CreditCard,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { isAdminUser, isSuperAdminUser } from "@/lib/adminCountryAccess";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MESSAGE_SYSTEM_AVATAR = "/flexa-logo-v2.png";

type AccountStatus = "active" | "inactive" | "suspended" | "blocked";
type PresenceKind = "system" | "online" | "last_seen" | "unavailable" | "suspended" | "blocked";
type DetailTab = "overview" | "activity" | "security" | "audit";

type PresenceBadge = { kind: PresenceKind; label: string };

type DetailPayload = {
  user: {
    id: number;
    name: string;
    displayId?: string;
    email?: string | null;
    phone?: string | null;
    emailDisplay?: string;
    phoneDisplay?: string;
    emailMasked?: boolean;
    phoneMasked?: boolean;
    avatar?: string | null;
    countryDisplay?: string;
    savedAddress?: string | null;
    address?: { display?: string | null };
    accountType?: string;
    roles?: string[];
    accountStatus?: AccountStatus;
    isOnline?: boolean;
    isSystemAccount?: boolean;
    isVerified?: boolean;
    isBanned?: boolean;
    isRestricted?: boolean;
    presence?: PresenceBadge;
    signupDate?: string;
    createdAt?: string;
    canRestrict?: boolean;
    canMessage?: boolean;
  };
  overview: {
    ordersSold: number;
    netSales: number;
    ordersBought?: number;
    buyerSpend?: number;
    currency: string;
    periodLabel?: string;
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
    onlineStatus?: string;
    lastSeenAt: string | null;
    lastSeenExact?: string | null;
    lastSeenLabel?: string | null;
    visitsToday: number;
    device: string;
    os: string;
    browser: string;
    sessions?: Array<{ at?: string; device?: string; action?: string }>;
  };
  audit: {
    restrictions: Array<{ id: number; reason: string; createdAt?: string; isActive?: boolean }>;
    actions: Array<{
      id: number;
      actionType: string;
      description: string;
      actorName?: string | null;
      actorRole?: string | null;
      createdAt?: string;
    }>;
  };
  links?: Record<string, string>;
};

type DevicesPayload = {
  user: { id: number; name: string; displayId?: string; isSystemAccount?: boolean };
  totals: { knownDevices: number; devicesWithActiveSessions: number; activeSessions: number };
  knownDevices: Array<{
    key: string;
    label: string;
    modelNote?: string | null;
    modelAvailable?: boolean;
    sessionCount: number;
    activeSessionCount: number;
    lastSeenLabel: string;
    lastSeenExact?: string;
    badges: Array<"most_recent" | "most_used">;
    history: Array<{ at: string; action: string }>;
  }>;
  footer?: string;
  note?: string;
};

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

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase();
}

function avatarTone(id: number) {
  const tones = [
    "bg-emerald-600", "bg-teal-600", "bg-cyan-700", "bg-sky-700",
    "bg-indigo-600", "bg-violet-600", "bg-rose-600", "bg-amber-700",
  ];
  return tones[id % tones.length];
}

function formatWhen(value?: string | null) {
  if (!value) return "Unavailable";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unavailable";
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function formatMoney(amount: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(0)}`;
  }
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

function InlineError({ message, onRetry, testId }: { message: string; onRetry: () => void; testId: string }) {
  return (
    <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800" data-testid={testId} role="alert">
      <p className="font-semibold">{message}</p>
      <button type="button" onClick={onRetry} className="mt-1.5 text-[12px] font-bold underline underline-offset-2" data-testid={`${testId}-retry`}>
        Retry
      </button>
    </div>
  );
}

function RecordLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <Link href={href}>
      <button type="button" className="flex w-full items-center gap-3 border-b border-border/70 px-1 py-3 text-left last:border-b-0 hover:bg-muted/30">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">{icon}</span>
        <span className="flex-1 text-[14px] font-semibold">{label}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
      </button>
    </Link>
  );
}

export default function AdminUserDetails({ userId }: { userId: number }) {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const view = new URLSearchParams(search).get("view");
  const isAdmin = isAdminUser(user as any);
  const isSuperAdmin = isSuperAdminUser(user as any);

  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const [busy, setBusy] = useState(false);

  const [moreOpen, setMoreOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [liftOpen, setLiftOpen] = useState<"block" | "suspend" | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);

  const [blockReason, setBlockReason] = useState("");
  const [suspendDays, setSuspendDays] = useState("7");
  const [suspendReason, setSuspendReason] = useState("");
  const [noteText, setNoteText] = useState("");
  const [signOutReason, setSignOutReason] = useState("");

  const [devices, setDevices] = useState<DevicesPayload | null>(null);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDeviceKey, setSelectedDeviceKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setDetailError(null);
    try {
      const data = await adminFetch(token, `/api/admin/users/${userId}`);
      setDetail(data);
    } catch (e: any) {
      setDetailError(e.message || "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);
    try {
      const data = await adminFetch(token, `/api/admin/users/${userId}/devices`);
      setDevices(data);
    } catch (e: any) {
      setDevicesError(e.message || "Failed to load devices");
    } finally {
      setDevicesLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/admin");
      return;
    }
    void load();
  }, [isAdmin, navigate, load]);

  useEffect(() => {
    if (view === "devices" && isAdmin) void loadDevices();
  }, [view, isAdmin, loadDevices]);

  const viewerLabel = isSuperAdmin
    ? "Super Admin"
    : ((user as any)?.isAdmin ? "Admin" : "Moderator");

  const runAction = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
      toast({ title: t("adminUsers.actionSuccess", { defaultValue: "Account updated" }) });
    } catch (e: any) {
      toast({ title: e.message || "Action failed", variant: "destructive" });
    } finally {
      setBusy(false);
      setBlockOpen(false);
      setSuspendOpen(false);
      setLiftOpen(null);
      setMoreOpen(false);
      setNoteOpen(false);
      setSignOutOpen(false);
    }
  };

  if (!isAdmin) return null;

  if (view === "devices") {
    return (
      <DevicesSessionsScreen
        userId={userId}
        devices={devices}
        loading={devicesLoading}
        error={devicesError}
        onRetry={() => { void loadDevices(); }}
        onBack={() => navigate(`/admin/users/${userId}`)}
        selectedDeviceKey={selectedDeviceKey}
        setSelectedDeviceKey={setSelectedDeviceKey}
      />
    );
  }

  if (loading && !detail) {
    return (
      <div className="mx-auto max-w-lg pb-10" data-testid="admin-user-details">
        <DetailTopBar userId={userId} onBack={() => navigate("/admin/users")} viewerLabel={viewerLabel} />
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </div>
    );
  }

  if (!detail || !detail.user) {
    return (
      <div className="mx-auto max-w-lg pb-10" data-testid="admin-user-details">
        <DetailTopBar userId={userId} onBack={() => navigate("/admin/users")} viewerLabel={viewerLabel} />
        <InlineError
          message={detailError || "This account could not be loaded."}
          onRetry={() => { void load(); }}
          testId="admin-user-details-error"
        />
      </div>
    );
  }

  const u = detail.user;
  const isSystem = !!u.isSystemAccount;
  const status = (u.accountStatus || "inactive") as AccountStatus;
  // Backend already scopes and sets canRestrict; still block self and system here.
  const canAct = !!(
    !isSystem
    && u.canRestrict !== false
    && u.id !== user?.id
    && (!(u as any).isSuperAdmin || isSuperAdmin)
  );

  const rolesLine = (u.roles && u.roles.length > 0)
    ? [u.countryDisplay, ...u.roles.filter((r) => r !== "System Account")].filter(Boolean).join(" · ")
    : `${u.countryDisplay || "—"} · ${u.accountType || "—"}`;

  const presenceLabel = isSystem
    ? null
    : (u.presence?.kind === "online"
      ? "Online"
      : (detail.activity.lastSeenLabel || u.presence?.label || "Last seen unavailable"));

  return (
    <div className="mx-auto max-w-lg pb-10" data-testid="admin-user-details">
      <DetailTopBar userId={userId} onBack={() => navigate("/admin/users")} viewerLabel={viewerLabel} />

      {detailError && (
        <InlineError message={detailError} onRetry={() => { void load(); }} testId="admin-user-details-error" />
      )}

      {/* Identity header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <Avatar className={cn("h-14 w-14 shrink-0", isSystem && "rounded-xl")}>
          <AvatarImage src={isSystem ? (u.avatar || MESSAGE_SYSTEM_AVATAR) : (u.avatar ?? undefined)} />
          <AvatarFallback className={cn("text-base font-black text-white", avatarTone(u.id))}>
            {initials(u.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black tracking-tight">{isSystem ? "Message System" : u.name}</h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {isSystem ? "Automated messages" : rolesLine}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground/80">
                {u.displayId || `FM-${u.id}`}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {isSystem ? (
                <span className="inline-flex rounded-full border border-sky-200 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-800">
                  System Account
                </span>
              ) : (
                <>
                  <StatusBadge status={status} />
                  <p className="mt-1 max-w-[7.5rem] text-[10px] font-semibold leading-tight text-muted-foreground">
                    {presenceLabel}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {!isSystem && (
        <div className="mt-4 flex gap-2 px-4">
          <Button
            variant="outline"
            className="h-9 flex-1 px-2 text-[11px] font-semibold"
            disabled={busy || u.canMessage === false}
            onClick={() => navigate(detail.links?.message || `/messages?withUser=${u.id}`)}
            data-testid="admin-user-message"
          >
            <MessageSquare className="mr-1 h-3.5 w-3.5" />
            Message
          </Button>
          <Button
            variant="outline"
            className="h-9 flex-1 px-2 text-[11px] font-semibold"
            disabled={busy}
            onClick={() => navigate(detail.links?.security || `/admin/security?userId=${u.id}`)}
            data-testid="admin-user-review"
          >
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Review account
          </Button>
          {status === "blocked" ? (
            <Button
              variant="outline"
              className="h-9 flex-1 border-emerald-300 px-2 text-[11px] font-semibold text-emerald-700"
              disabled={busy || !canAct}
              onClick={() => setLiftOpen("block")}
              data-testid="admin-user-unblock"
            >
              Unblock
            </Button>
          ) : (
            <Button
              variant="outline"
              className="h-9 flex-1 border-red-300 px-2 text-[11px] font-semibold text-red-700"
              disabled={busy || !canAct}
              onClick={() => setBlockOpen(true)}
              data-testid="admin-user-block"
            >
              <Ban className="mr-1 h-3.5 w-3.5" />
              Block
            </Button>
          )}
          <Button
            variant="outline"
            className="h-9 w-10 shrink-0 px-0"
            disabled={busy}
            onClick={() => setMoreOpen(true)}
            data-testid="admin-user-more-actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="mt-5 flex gap-1 border-b border-border px-2">
        {([
          ["overview", "Overview"],
          ["activity", "Activity"],
          ["security", "Security"],
          ["audit", "Audit"],
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
          <div className="space-y-5" data-testid="admin-user-overview">
            <section>
              <h3 className="mb-1 text-[13px] font-bold">Identity & contact</h3>
              <div className="rounded-2xl border border-border bg-card px-3">
                <InfoRow icon={<IdCard className="h-4 w-4" />} label="User ID" value={u.displayId || `FM-${u.id}`} />
                <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={u.emailDisplay || "Unavailable"} />
                <InfoRow icon={<Phone className="h-4 w-4" />} label="Phone" value={u.phoneDisplay || "Unavailable"} />
                <InfoRow
                  icon={<MapPin className="h-4 w-4" />}
                  label="Address"
                  value={u.savedAddress || u.address?.display || "Unavailable"}
                  last
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Signed up {formatWhen(u.signupDate || u.createdAt)}
                {u.isVerified ? " · Verified" : " · Not verified"}
                {!isSystem && detail.activity.lastSeenExact
                  ? ` · Last seen ${detail.activity.lastSeenExact}`
                  : ""}
              </p>
            </section>

            <section>
              <h3 className="mb-1 text-[13px] font-bold">Account records</h3>
              <div className="rounded-2xl border border-border bg-card px-3">
                <RecordLink href={detail.links?.orders || `/admin/deliveries?userId=${u.id}`} icon={<Package className="h-4 w-4" />} label="Orders & deliveries" />
                <RecordLink href={detail.links?.products || `/admin/listings?sellerId=${u.id}`} icon={<Tag className="h-4 w-4" />} label="Products & boosts" />
                <RecordLink href={detail.links?.payments || `/admin/transactions?userId=${u.id}`} icon={<CreditCard className="h-4 w-4" />} label="Payments, refunds & withdrawals" />
                <RecordLink href={detail.links?.tickets || `/admin/support?userId=${u.id}`} icon={<Headset className="h-4 w-4" />} label="Tickets & disputes" />
                <RecordLink href={detail.links?.reports || `/admin/reports?userId=${u.id}`} icon={<Flag className="h-4 w-4" />} label="Reports & moderation" />
                <RecordLink href={`/admin/users/${u.id}?view=devices`} icon={<Smartphone className="h-4 w-4" />} label="Devices & sessions" />
              </div>
            </section>

            <section>
              <h3 className="mb-1 text-[13px] font-bold">Recent activity</h3>
              <div className="rounded-2xl border border-border bg-card">
                {detail.sales.items.slice(0, 5).length === 0 ? (
                  <p className="px-3 py-4 text-sm text-muted-foreground">Unavailable</p>
                ) : detail.sales.items.slice(0, 5).map((sale) => (
                  <Link key={sale.id} href={`/admin/transactions?userId=${u.id}`}>
                    <button type="button" className="flex w-full items-center gap-3 border-b border-border/70 px-3 py-3 text-left last:border-b-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <ShoppingCart className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold">
                          Order FM-{sale.id} {sale.paymentStatus === "completed" || sale.paymentStatus === "paid" ? "placed" : (sale.paymentStatus || "")}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{formatWhen(sale.createdAt)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                    </button>
                  </Link>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {detail.overview.periodLabel || "All time"} · Buyer: {detail.overview.ordersBought ?? 0} orders · {formatMoney(detail.overview.buyerSpend ?? 0, detail.overview.currency)}
                {" · "}
                Seller: {detail.overview.ordersSold} orders · {formatMoney(detail.overview.netSales, detail.overview.currency)}
              </p>
            </section>
          </div>
        )}

        {tab === "activity" && (
          <div className="space-y-3" data-testid="admin-user-activity">
            <div className="rounded-2xl border border-border bg-card p-3.5 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Presence</span>
                <span className="font-semibold text-right">{isSystem ? "Unavailable" : presenceLabel}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Exact last seen</span>
                <span className="max-w-[60%] text-right font-semibold">
                  {isSystem ? "Unavailable" : (detail.activity.lastSeenExact || "Unavailable")}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Account status</span>
                <StatusBadge status={status} />
              </div>
            </div>
            {(detail.activity.sessions?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">No recorded Flexa login events.</p>
            ) : detail.activity.sessions!.map((s, i) => (
              <div key={`${s.at}-${i}`} className="rounded-2xl border border-border bg-card px-3.5 py-3">
                <p className="text-[13px] font-bold">{s.action || "login"} · {s.device || "Unavailable"}</p>
                <p className="text-[11px] text-muted-foreground">{formatWhen(s.at)}</p>
              </div>
            ))}
          </div>
        )}

        {tab === "security" && (
          <div className="space-y-3" data-testid="admin-user-security">
            <Link href={`/admin/users/${u.id}?view=devices`}>
              <button type="button" className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-3.5 py-3">
                <span className="text-[13px] font-bold">Devices & sessions</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </Link>
            <Link href={detail.links?.security || `/admin/security?userId=${u.id}`}>
              <button type="button" className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-3.5 py-3">
                <span className="text-[13px] font-bold">Full security review</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </Link>
            <p className="text-[12px] text-muted-foreground">
              Passwords, tokens, and raw session identifiers are never shown here.
            </p>
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
                    <p className="text-[13px] font-bold">Restriction</p>
                    <p className="text-[12px] text-muted-foreground">{r.reason}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatWhen(r.createdAt)}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* More sheet */}
      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>More actions</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {canAct && status !== "suspended" && status !== "blocked" && (
              <Button variant="outline" className="w-full justify-start" onClick={() => { setMoreOpen(false); setSuspendOpen(true); }}>
                <ShieldAlert className="mr-2 h-4 w-4" /> Suspend account
              </Button>
            )}
            {canAct && status === "suspended" && (
              <Button variant="outline" className="w-full justify-start" onClick={() => { setMoreOpen(false); setLiftOpen("suspend"); }}>
                Reactivate (lift suspension)
              </Button>
            )}
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(String(u.displayId || `FM-${u.id}`));
                  toast({ title: "User ID copied" });
                } catch {
                  toast({ title: "Could not copy", variant: "destructive" });
                }
                setMoreOpen(false);
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy User ID
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => { setMoreOpen(false); navigate(detail.links?.tickets || `/admin/support?userId=${u.id}`); }}>
              <Headset className="mr-2 h-4 w-4" /> View support tickets
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => { setMoreOpen(false); setNoteOpen(true); }}>
              Add internal note
            </Button>
            {canAct && (
              <Button variant="outline" className="w-full justify-start text-red-700" onClick={() => { setMoreOpen(false); setSignOutOpen(true); }}>
                Sign out all sessions
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Block */}
      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Block account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Blocking signs the user out, prevents login, and is recorded in the audit log. This is separate from a time-limited suspension.
          </p>
          <textarea
            className="mt-2 min-h-[80px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Reason (required)"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            data-testid="admin-user-block-reason"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBlockOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy || blockReason.trim().length < 3}
              onClick={() => runAction(async () => {
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

      {/* Suspend */}
      <Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suspend account</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Suspension is a time-limited restriction. It is different from a permanent block.
          </p>
          <input
            type="number"
            min={1}
            className="mt-2 h-10 w-full rounded-xl border border-border px-3 text-sm"
            value={suspendDays}
            onChange={(e) => setSuspendDays(e.target.value)}
            placeholder="Days"
          />
          <textarea
            className="mt-2 min-h-[80px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Reason (required)"
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || suspendReason.trim().length < 3 || !(parseInt(suspendDays, 10) > 0)}
              onClick={() => runAction(async () => {
                await adminFetch(token, `/api/admin/users/${userId}/restrict`, {
                  method: "POST",
                  body: JSON.stringify({
                    reason: suspendReason.trim(),
                    durationDays: parseInt(suspendDays, 10),
                  }),
                });
              })}
            >
              Confirm suspension
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lift */}
      <Dialog open={!!liftOpen} onOpenChange={(o) => { if (!o) setLiftOpen(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{liftOpen === "block" ? "Unblock account" : "Lift suspension"}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiftOpen(null)}>Cancel</Button>
            <Button
              disabled={busy}
              onClick={() => runAction(async () => {
                const path = liftOpen === "block" ? "unban" : "unrestrict";
                await adminFetch(token, `/api/admin/users/${userId}/${path}`, { method: "POST" });
              })}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Internal note */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add internal note</DialogTitle>
          </DialogHeader>
          <textarea
            className="min-h-[100px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Visible to authorized admins in Audit"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button
              disabled={busy || noteText.trim().length < 3}
              onClick={() => runAction(async () => {
                await adminFetch(token, `/api/admin/users/${userId}/internal-note`, {
                  method: "POST",
                  body: JSON.stringify({ note: noteText.trim() }),
                });
                setNoteText("");
              })}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign out all */}
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sign out all sessions</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Invalidates every existing login token. The user must sign in again on every device.
          </p>
          <textarea
            className="mt-2 min-h-[70px] w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
            placeholder="Reason (optional)"
            value={signOutReason}
            onChange={(e) => setSignOutReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOutOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => runAction(async () => {
                await adminFetch(token, `/api/admin/users/${userId}/sign-out-all`, {
                  method: "POST",
                  body: JSON.stringify({ reason: signOutReason.trim() || null }),
                });
              })}
            >
              Sign out all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailTopBar({ onBack, viewerLabel }: { userId: number; onBack: () => void; viewerLabel: string }) {
  return (
    <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold text-[hsl(152,65%,22%)]"
          data-testid="admin-user-details-back"
        >
          <ArrowLeft className="h-4 w-4" />
          Users
        </button>
        <div className="flex-1 text-center">
          <h1 className="text-[15px] font-bold">User Details</h1>
          <p className="text-[10px] text-muted-foreground">Flexa Control · {viewerLabel}</p>
        </div>
        <span className="w-16" />
      </div>
    </div>
  );
}

function InfoRow({
  icon, label, value, last,
}: { icon: ReactNode; label: string; value: string; last?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 py-2.5", !last && "border-b border-border/70")}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate text-right text-[13px] font-semibold">{value}</span>
    </div>
  );
}

function DevicesSessionsScreen({
  userId,
  devices,
  loading,
  error,
  onRetry,
  onBack,
  selectedDeviceKey,
  setSelectedDeviceKey,
}: {
  userId: number;
  devices: DevicesPayload | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  selectedDeviceKey: string | null;
  setSelectedDeviceKey: (k: string | null) => void;
}) {
  const selected = devices?.knownDevices.find((d) => d.key === selectedDeviceKey) ?? null;

  if (selected) {
    return (
      <div className="mx-auto max-w-lg pb-10" data-testid="admin-user-device-detail">
        <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedDeviceKey(null)} className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(152,65%,22%)]">
              <ArrowLeft className="h-4 w-4" /> Devices
            </button>
            <h1 className="flex-1 text-center text-[15px] font-bold">{selected.label}</h1>
            <span className="w-16" />
          </div>
        </div>
        <div className="space-y-3 px-4 pt-4">
          <div className="rounded-2xl border border-border bg-card p-3.5 text-[13px] space-y-2">
            <div className="flex justify-between"><span className="text-muted-foreground">Model</span><span className="font-semibold">{selected.modelNote || selected.label}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sessions</span><span className="font-semibold">{selected.sessionCount}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Active now</span><span className="font-semibold">{selected.activeSessionCount}</span></div>
            <div className="flex justify-between gap-2"><span className="text-muted-foreground">Last seen</span><span className="max-w-[60%] text-right font-semibold">{selected.lastSeenExact || selected.lastSeenLabel}</span></div>
          </div>
          <h3 className="text-[13px] font-bold">Session history</h3>
          {selected.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Unavailable</p>
          ) : selected.history.map((h, i) => (
            <div key={`${h.at}-${i}`} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[13px] font-semibold">{h.action}</p>
              <p className="text-[11px] text-muted-foreground">{formatWhen(h.at)}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-10" data-testid="admin-user-devices">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-3 py-2.5 backdrop-blur">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold text-[hsl(152,65%,22%)]" data-testid="admin-user-devices-back">
            <ArrowLeft className="h-4 w-4" /> User Details
          </button>
          <h1 className="flex-1 text-center text-[15px] font-bold">Flexa Control</h1>
          <span className="w-16" />
        </div>
      </div>

      <div className="px-4 pt-4">
        <h2 className="text-2xl font-black tracking-tight">Devices & Sessions</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {devices?.user.name || `User #${userId}`}
          {devices?.user.displayId ? ` · ${devices.user.displayId}` : ""}
        </p>
      </div>

      {error && <InlineError message={error} onRetry={onRetry} testId="admin-user-devices-error" />}

      {loading && !devices ? (
        <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : devices ? (
        <>
          <div className="mt-4 grid grid-cols-3 gap-2 px-4">
            {[
              ["Known devices", devices.totals.knownDevices],
              ["Devices with active sessions", devices.totals.devicesWithActiveSessions],
              ["Active sessions", devices.totals.activeSessions],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-border bg-card px-2.5 py-3">
                <p className="text-[10px] font-semibold leading-tight text-muted-foreground">{label}</p>
                <p className="mt-2 text-xl font-black tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          {devices.note && (
            <p className="mt-3 px-4 text-sm text-muted-foreground">{devices.note}</p>
          )}

          <div className="mt-5 px-4">
            <h3 className="text-[15px] font-bold">Known devices</h3>
            <div className="mt-2 rounded-2xl border border-border bg-card">
              {devices.knownDevices.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">Unavailable</p>
              ) : devices.knownDevices.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setSelectedDeviceKey(d.key)}
                  className="flex w-full items-start gap-3 border-b border-border/70 px-3 py-3 text-left last:border-b-0"
                  data-testid={`admin-user-device-${d.key}`}
                >
                  <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                    <Smartphone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[14px] font-bold">{d.label}</span>
                      {d.badges.includes("most_recent") && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Most recently used</span>
                      )}
                      {d.badges.includes("most_used") && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700">Most used</span>
                      )}
                    </span>
                    {d.modelNote && <span className="mt-0.5 block text-[12px] text-muted-foreground">{d.modelNote}</span>}
                    <span className="mt-0.5 block text-[12px] text-muted-foreground">
                      {d.activeSessionCount > 0
                        ? `${d.activeSessionCount} active session${d.activeSessionCount === 1 ? "" : "s"}`
                        : "No active sessions"}
                    </span>
                    <span className="block text-[12px] text-muted-foreground">{d.lastSeenLabel}</span>
                  </span>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground/70" />
                </button>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-muted-foreground">
              {devices.footer || "Active sessions can remain open while the user is offline."}
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
