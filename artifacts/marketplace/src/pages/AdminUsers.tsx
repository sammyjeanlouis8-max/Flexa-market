import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { isAdminUser } from "@/lib/adminCountryAccess";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import AdminUserDetails from "@/components/admin/AdminUserDetails";

const LIST_STATE_KEY = "flexa_control_users_list_state_v1";

type PresenceKind =
  | "system"
  | "online"
  | "last_seen"
  | "unavailable"
  | "suspended"
  | "blocked";

type PresenceBadge = {
  kind: PresenceKind;
  label: string;
};

type AdminUserRow = {
  id: number;
  name: string;
  email?: string;
  phone?: string | null;
  avatar?: string | null;
  country?: string | null;
  isBanned?: boolean;
  isRestricted?: boolean;
  lastSeenAt?: string | null;
  role?: string;
  isSystemAccount?: boolean;
  subtitle?: string | null;
  presence?: PresenceBadge;
};

const MESSAGE_SYSTEM_AVATAR = "/flexa-logo-v2.png";

function InlineError({
  message,
  onRetry,
  testId,
}: {
  message: string;
  onRetry: () => void;
  testId: string;
}) {
  return (
    <div
      className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800"
      data-testid={testId}
      role="alert"
    >
      <p className="font-semibold">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1.5 text-[12px] font-bold underline underline-offset-2"
        data-testid={`${testId}-retry`}
      >
        Retry
      </button>
    </div>
  );
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
  return tones[id % tones.length]!;
}

/** Compact list badge — System Account / Online / Last seen … / Suspended. */
function PresenceListBadge({ presence }: { presence?: PresenceBadge | null }) {
  const kind = presence?.kind ?? "unavailable";
  const label = presence?.label ?? "Last seen unavailable";
  const map: Record<PresenceKind, string> = {
    system: "bg-sky-100 text-sky-800 border-sky-200",
    online: "bg-emerald-50 text-emerald-700 border-emerald-200",
    last_seen: "bg-slate-100 text-slate-600 border-slate-200",
    unavailable: "bg-slate-100 text-slate-500 border-slate-200",
    suspended: "bg-orange-50 text-orange-700 border-orange-200",
    blocked: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={cn(
        "inline-flex max-w-[9.5rem] shrink-0 items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-tight",
        map[kind],
      )}
      title={label}
      data-testid="admin-user-presence-badge"
      data-presence-kind={kind}
    >
      {label}
    </span>
  );
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
    return <AdminUserDetails userId={detailId} />;
  }
  // Support /admin/users?user=123 deep link
  const qUser = new URLSearchParams(search).get("user");
  if (qUser && /^\d+$/.test(qUser)) {
    return <AdminUserDetails userId={parseInt(qUser, 10)} />;
  }
  return <UsersListScreen />;
}

function UsersListScreen() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [, navigate] = useLocation();
  const isAdmin = isAdminUser(user as any);
  const saved = useRef(loadListState()).current;

  const [q, setQ] = useState(saved?.q ?? "");
  const [country, setCountry] = useState(saved?.country ?? "all");
  const [status, setStatus] = useState(saved?.status ?? "all");
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAdmin) {
      navigate("/admin");
    }
  }, [isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (country !== "all") params.set("country", country);
      if (status !== "all") params.set("status", status);
      // Server searches the full authorized account set (not a client page slice).
      const data = await adminFetch(token, `/api/admin/users?${params.toString()}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      // Keep previously loaded rows visible; show an inline Retry near the list.
      setListError(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [token, q, country, status]);

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

        {/* Search above country + status filters (Flexa Control Users). */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("adminUsers.searchPlaceholder", {
              defaultValue: "Search by name, email, or phone",
            })}
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none ring-[hsl(152,65%,22%)]/30 focus:ring-2"
            data-testid="admin-users-search"
            aria-label="Search by name, email, or phone"
          />
        </div>

        <div className="mt-2.5 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-9 w-full appearance-none rounded-xl border border-border bg-card px-3 pr-8 text-xs font-semibold outline-none"
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

      {listError && (
        <InlineError
          message={listError}
          onRetry={() => { void load(); }}
          testId="admin-users-list-error"
        />
      )}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto border-t border-border bg-card">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 && !listError ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {t("adminUsers.empty", { defaultValue: "No users match these filters." })}
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">
            {t("adminUsers.loadFailedHint", { defaultValue: "Could not refresh the user list." })}
          </p>
        ) : (
          rows.map((u) => {
            const isSystem = !!u.isSystemAccount || u.role === "system";
            const subtitle = u.subtitle
              || (isSystem
                ? "Automated messages"
                : (u.country?.trim() || t("adminUsers.countryNotSet", { defaultValue: "Country not set" })));
            const avatarSrc = isSystem
              ? (u.avatar || MESSAGE_SYSTEM_AVATAR)
              : (u.avatar ?? undefined);
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
                data-system-account={isSystem ? "true" : "false"}
              >
                <Avatar className={cn("h-9 w-9 shrink-0", isSystem && "rounded-lg")}>
                  <AvatarImage
                    src={avatarSrc}
                    alt={isSystem ? "Flexa Market" : u.name}
                    className={isSystem ? "object-cover" : undefined}
                  />
                  <AvatarFallback className={cn("text-[11px] font-bold text-white", avatarTone(u.id))}>
                    {initials(u.name || "?")}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold leading-tight text-foreground">
                    {isSystem ? "Message System" : u.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{subtitle}</span>
                </span>
                <PresenceListBadge presence={u.presence} />
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/70" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
