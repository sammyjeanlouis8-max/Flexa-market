import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  Calendar,
  Check,
  ChevronRight,
  Crown,
  Flag,
  Handshake,
  Home,
  Layers,
  Loader2,
  Package,
  PlayCircle,
  Rocket,
  Scale,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CountryFilter = "all" | "Haiti" | "Dominican Republic";
type QueueTab = "all" | "products" | "videos" | "reports" | "boosts";

type OverviewStats = {
  pendingReviews: number;
  approvedToday: number;
  rejectedToday: number;
  userReports: number;
  activeDisputes: number;
  flaggedContent: number;
  tabCounts: {
    all: number;
    products: number;
    videos: number;
    reports: number;
    boosts: number;
  };
  scopeLevel?: string;
};

type ModerationItem = {
  id: number;
  kind?: "listing" | "report" | "boost";
  title: string;
  description?: string;
  category?: string;
  images?: string[];
  thumbnail?: string | null;
  hasVideo?: boolean;
  country?: string | null;
  moderationStatus?: string;
  moderationReason?: string;
  moderationFlags?: string[];
  moderationRiskLevel?: string;
  sellerName?: string;
  sellerId?: number;
  createdAt?: string;
  reason?: string;
  status?: string;
  paymentStatus?: string;
  plan?: string;
  listingId?: number;
};

async function adminFetch<T = any>(path: string, method = "GET", body?: object): Promise<T> {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

function formatRelative(iso?: string, locale = "en"): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return locale.startsWith("fr") || locale === "ht" ? "À l'instant" : "Just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} d`;
}

function StatTile({
  label,
  value,
  icon: Icon,
  tone,
  loading,
}: {
  label: string;
  value: number | null;
  icon: typeof Layers;
  tone: "purple" | "green" | "red" | "blue" | "orange" | "teal";
  loading?: boolean;
}) {
  const tones: Record<string, string> = {
    purple: "bg-violet-50 text-violet-700 border-violet-100 dark:bg-violet-950/30 dark:text-violet-200 dark:border-violet-900",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900",
    red: "bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/30 dark:text-rose-200 dark:border-rose-900",
    blue: "bg-sky-50 text-sky-700 border-sky-100 dark:bg-sky-950/30 dark:text-sky-200 dark:border-sky-900",
    orange: "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/30 dark:text-orange-200 dark:border-orange-900",
    teal: "bg-cyan-50 text-cyan-700 border-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-200 dark:border-cyan-900",
  };
  const iconBg: Record<string, string> = {
    purple: "bg-violet-100 text-violet-600 dark:bg-violet-900/50",
    green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50",
    red: "bg-rose-100 text-rose-600 dark:bg-rose-900/50",
    blue: "bg-sky-100 text-sky-600 dark:bg-sky-900/50",
    orange: "bg-orange-100 text-orange-600 dark:bg-orange-900/50",
    teal: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/50",
  };
  return (
    <div className={cn("rounded-xl border px-2.5 py-2.5 shadow-sm", tones[tone])} data-testid={`mod-stat-${tone}`}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", iconBg[tone])}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold tabular-nums leading-none text-[#0B1F3A] dark:text-foreground">
            {loading ? "…" : value ?? "—"}
          </p>
          <p className="mt-1 text-[10px] font-medium leading-tight opacity-80">{label}</p>
        </div>
      </div>
    </div>
  );
}

function NavCard({
  href,
  title,
  description,
  icon: Icon,
  iconClass,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof Package;
  iconClass: string;
}) {
  return (
    <Link
      href={href}
      className="group flex min-h-[76px] items-start gap-2.5 rounded-xl border border-slate-200/90 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors hover:border-[hsl(152,45%,35%)]/35 hover:bg-[hsl(152,40%,97%)] dark:border-border dark:bg-card dark:hover:bg-muted/40"
      data-testid={`mod-nav-${href.replace(/\W+/g, "-")}`}
    >
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconClass)}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-tight text-[#0B1F3A] dark:text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[hsl(152,45%,35%)]" />
    </Link>
  );
}

/**
 * Flexa Control — Centre de Modération
 * Production Moderation Control Center (real APIs + RBAC).
 */
export default function AdminModerationCenter() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const searchStr = useSearch();

  const role = user?.role ?? (user?.isSuperAdmin ? "superadmin" : user?.isAdmin ? "admin" : "moderator");
  const isSuperAdmin = !!(user?.isSuperAdmin || role === "superadmin");
  const roleLabel = isSuperAdmin
    ? t("modCenter.roleSuper", { defaultValue: "Super Admin" })
    : role === "moderator"
      ? t("modCenter.roleMod", { defaultValue: "Moderator" })
      : t("modCenter.roleAdmin", { defaultValue: "Admin" });

  const [country, setCountry] = useState<CountryFilter>(() => {
    if (typeof window === "undefined") return "all";
    const stored = localStorage.getItem("admin_view_country");
    if (stored === "HT") return "Haiti";
    if (stored === "DO") return "Dominican Republic";
    return "all";
  });
  const [queueTab, setQueueTab] = useState<QueueTab>(() => {
    const type = new URLSearchParams(searchStr).get("type");
    if (type === "video") return "videos";
    if (type === "product") return "products";
    if (type === "report") return "reports";
    if (type === "boost") return "boosts";
    return "all";
  });
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [period, setPeriod] = useState<"all" | "today" | "7d" | "30d">("all");
  const [detailItem, setDetailItem] = useState<ModerationItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ModerationItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionId, setActionId] = useState<number | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [country, queueTab, debouncedSearch]);

  const setCountryFilter = (next: CountryFilter) => {
    setCountry(next);
    const code = next === "Haiti" ? "HT" : next === "Dominican Republic" ? "DO" : "all";
    try {
      localStorage.setItem("admin_view_country", code);
    } catch {
      /* ignore */
    }
  };

  const overviewKey = ["moderation-overview", country] as const;
  const overviewQuery = useQuery({
    queryKey: overviewKey,
    queryFn: () =>
      adminFetch<OverviewStats>(
        `/api/admin/moderation/overview?country=${encodeURIComponent(country)}`,
      ),
    staleTime: 20_000,
  });

  const listingsQuery = useQuery({
    queryKey: ["moderation-queue", country, queueTab, debouncedSearch, page],
    enabled: queueTab === "all" || queueTab === "products" || queueTab === "videos",
    queryFn: async () => {
      const params = new URLSearchParams({
        status: "pending",
        country,
        page: String(page),
        limit: "20",
      });
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (queueTab === "products") params.set("contentType", "product");
      if (queueTab === "videos") params.set("contentType", "video");
      const data = await adminFetch<{ items: ModerationItem[]; total: number } | ModerationItem[]>(
        `/api/admin/moderation?${params}`,
      );
      if (Array.isArray(data)) return { items: data, total: data.length };
      return { items: data.items ?? [], total: data.total ?? 0 };
    },
  });

  const reportsQuery = useQuery({
    queryKey: ["moderation-reports", country],
    enabled: queueTab === "reports" || queueTab === "all",
    queryFn: async () => {
      const data = await adminFetch<any[]>("/api/admin/reports");
      const rows = Array.isArray(data) ? data : [];
      return rows
        .filter((r) => r.status === "pending")
        .map((r): ModerationItem => ({
          id: r.id,
          kind: "report",
          title: r.reason || t("modCenter.userReport", { defaultValue: "User report" }),
          description: `${r.targetType ?? "target"} #${r.targetId}`,
          country: r.country ?? r.targetCountry ?? null,
          status: r.status,
          reason: r.reason,
          createdAt: r.createdAt,
          thumbnail: null,
        }));
    },
  });

  const boostsQuery = useQuery({
    queryKey: ["moderation-boosts", country],
    enabled: queueTab === "boosts" || queueTab === "all",
    queryFn: async () => {
      try {
        const data = await adminFetch<any[]>("/api/admin/boosts");
        const rows = Array.isArray(data) ? data : [];
        return rows
          .filter((b) => b.paymentStatus === "pending" || b.paymentStatus === "pending_review")
          .filter((b) => country === "all" || b.country === country || b.listingCountry === country)
          .map((b): ModerationItem => ({
            id: b.id,
            kind: "boost",
            title: b.listingTitle || b.title || `Boost #${b.id}`,
            description: `${b.plan ?? "boost"} · ${b.paymentMethod ?? ""}`,
            country: b.country ?? b.listingCountry ?? null,
            paymentStatus: b.paymentStatus,
            plan: b.plan,
            listingId: b.listingId,
            thumbnail: b.listingImage ?? b.thumbnail ?? null,
            createdAt: typeof b.createdAt === "string" ? b.createdAt : b.createdAt?.toISOString?.() ?? undefined,
            status: b.paymentStatus,
          }));
      } catch {
        // Boost admin APIs are admin+; moderators see an empty boost lane.
        return [] as ModerationItem[];
      }
    },
  });

  const withinPeriod = useCallback(
    (iso?: string) => {
      if (period === "all" || !iso) return true;
      const t0 = new Date(iso).getTime();
      if (Number.isNaN(t0)) return true;
      const now = Date.now();
      if (period === "today") {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return t0 >= start.getTime();
      }
      const days = period === "7d" ? 7 : 30;
      return t0 >= now - days * 86400000;
    },
    [period],
  );

  const queueItems = useMemo(() => {
    const filterPeriod = (rows: ModerationItem[]) => rows.filter((r) => withinPeriod(r.createdAt));
    if (queueTab === "reports") return filterPeriod(reportsQuery.data ?? []);
    if (queueTab === "boosts") return filterPeriod(boostsQuery.data ?? []);
    if (queueTab === "all") {
      const listings = listingsQuery.data?.items ?? [];
      const reports = (reportsQuery.data ?? []).slice(0, 8);
      const boosts = (boostsQuery.data ?? []).slice(0, 8);
      return filterPeriod([...listings, ...reports, ...boosts]);
    }
    return filterPeriod(listingsQuery.data?.items ?? []);
  }, [queueTab, listingsQuery.data, reportsQuery.data, boostsQuery.data, withinPeriod]);

  const queueLoading =
    (queueTab === "reports" && reportsQuery.isLoading) ||
    (queueTab === "boosts" && boostsQuery.isLoading) ||
    ((queueTab === "all" || queueTab === "products" || queueTab === "videos") && listingsQuery.isLoading);

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["moderation-overview"] }),
      qc.invalidateQueries({ queryKey: ["moderation-queue"] }),
      qc.invalidateQueries({ queryKey: ["moderation-reports"] }),
      qc.invalidateQueries({ queryKey: ["moderation-boosts"] }),
    ]);
  }, [qc]);

  const runApprove = async (item: ModerationItem) => {
    if (item.kind === "report" || item.kind === "boost") {
      if (item.kind === "boost") {
        setActionId(item.id);
        try {
          await adminFetch(`/api/admin/boosts/${item.id}/approve`, "POST");
          toast({ title: t("modCenter.approved", { defaultValue: "Approved" }) });
          await invalidateAll();
        } catch (e: any) {
          toast({ title: e?.message ?? "Error", variant: "destructive" });
        } finally {
          setActionId(null);
        }
      }
      return;
    }
    setActionId(item.id);
    try {
      await adminFetch(`/api/admin/moderation/${item.id}/approve`, "POST");
      toast({ title: t("modCenter.approved", { defaultValue: "Approved" }) });
      setDetailItem(null);
      await invalidateAll();
    } catch (e: any) {
      toast({ title: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const runReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      toast({
        title: t("modCenter.rejectReasonRequired", { defaultValue: "A rejection reason is required" }),
        variant: "destructive",
      });
      return;
    }
    setActionId(rejectTarget.id);
    try {
      if (rejectTarget.kind === "boost") {
        await adminFetch(`/api/admin/boosts/${rejectTarget.id}/reject`, "POST", { reason });
      } else if (rejectTarget.kind === "report") {
        await adminFetch(`/api/admin/reports/${rejectTarget.id}/decision`, "POST", {
          decision: "dismiss",
          reason,
        });
      } else {
        await adminFetch(`/api/admin/moderation/${rejectTarget.id}/reject`, "POST", { reason });
      }
      toast({ title: t("modCenter.rejected", { defaultValue: "Rejected" }) });
      setRejectTarget(null);
      setRejectReason("");
      setDetailItem(null);
      await invalidateAll();
    } catch (e: any) {
      toast({ title: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const runEscalate = async (item: ModerationItem) => {
    if (item.kind && item.kind !== "listing") {
      toast({
        title: t("modCenter.escalateListingsOnly", {
          defaultValue: "Escalation is available for listing reviews",
        }),
      });
      return;
    }
    const reason = window.prompt(
      t("modCenter.escalatePrompt", { defaultValue: "Why should a senior admin review this?" }),
      "",
    );
    if (reason === null || !reason.trim()) return;
    setActionId(item.id);
    try {
      await adminFetch("/api/admin/appeals", "POST", {
        targetType: "listing",
        targetId: item.id,
        reason: reason.trim(),
      });
      toast({
        title: t("modCenter.escalated", { defaultValue: "Escalated to senior administrators" }),
      });
      await invalidateAll();
    } catch (e: any) {
      toast({ title: e?.message ?? "Error", variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const stats = overviewQuery.data;
  const tabCounts = stats?.tabCounts;

  const countryOpts: { id: CountryFilter; label: string }[] = [
    { id: "all", label: t("modCenter.countryAll", { defaultValue: "All countries" }) },
    { id: "Haiti", label: t("modCenter.countryHaiti", { defaultValue: "Haiti" }) },
    {
      id: "Dominican Republic",
      label: t("modCenter.countryDR", { defaultValue: "Dominican Republic" }),
    },
  ];

  const queueTabs: { id: QueueTab; label: string; count?: number }[] = [
    {
      id: "all",
      label: t("modCenter.tabAll", { defaultValue: "All" }),
      count: tabCounts?.all,
    },
    {
      id: "products",
      label: t("modCenter.tabProducts", { defaultValue: "Products" }),
      count: tabCounts?.products,
    },
    {
      id: "videos",
      label: t("modCenter.tabVideos", { defaultValue: "Videos" }),
      count: tabCounts?.videos,
    },
    {
      id: "reports",
      label: t("modCenter.tabReports", { defaultValue: "Reports" }),
      count: tabCounts?.reports,
    },
    {
      id: "boosts",
      label: t("modCenter.tabBoosts", { defaultValue: "Boost" }),
      count: tabCounts?.boosts,
    },
  ];

  return (
    <div
      className="mx-auto w-full max-w-[1100px] px-3 pb-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] pt-3 sm:px-4 sm:pb-8"
      data-testid="moderation-center"
    >
      {/* Title */}
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[hsl(152,55%,92%)] text-[hsl(152,65%,28%)]">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-[22px] font-bold tracking-tight text-[#0B1F3A] dark:text-foreground sm:text-2xl">
              {t("modCenter.title", { defaultValue: "Moderation Center" })}
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-muted-foreground">
            {t("modCenter.subtitle", {
              defaultValue: "Manage and control all Flexa Market content.",
            })}
          </p>
        </div>
        <Badge className="shrink-0 gap-1 border-0 bg-[hsl(152,45%,92%)] px-2.5 py-1 text-[11px] font-semibold text-[hsl(152,65%,22%)] hover:bg-[hsl(152,45%,92%)]">
          <Crown className="h-3 w-3" />
          {roleLabel}
        </Badge>
      </header>

      {/* Stats */}
      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          tone="purple"
          icon={Layers}
          label={t("modCenter.statPending", { defaultValue: "Pending" })}
          value={stats?.pendingReviews ?? null}
          loading={overviewQuery.isLoading}
        />
        <StatTile
          tone="green"
          icon={Check}
          label={t("modCenter.statApprovedToday", { defaultValue: "Approved today" })}
          value={stats?.approvedToday ?? null}
          loading={overviewQuery.isLoading}
        />
        <StatTile
          tone="red"
          icon={X}
          label={t("modCenter.statRejectedToday", { defaultValue: "Rejected today" })}
          value={stats?.rejectedToday ?? null}
          loading={overviewQuery.isLoading}
        />
        <StatTile
          tone="blue"
          icon={Flag}
          label={t("modCenter.statReports", { defaultValue: "User reports" })}
          value={stats?.userReports ?? null}
          loading={overviewQuery.isLoading}
        />
        <StatTile
          tone="orange"
          icon={Scale}
          label={t("modCenter.statDisputes", { defaultValue: "Active disputes" })}
          value={stats?.activeDisputes ?? null}
          loading={overviewQuery.isLoading}
        />
        <StatTile
          tone="teal"
          icon={AlertTriangle}
          label={t("modCenter.statFlagged", { defaultValue: "Flagged content" })}
          value={stats?.flaggedContent ?? null}
          loading={overviewQuery.isLoading}
        />
      </section>
      {overviewQuery.isError && (
        <p className="mb-3 text-xs text-destructive">
          {t("modCenter.statsError", { defaultValue: "Could not load moderation statistics." })}
        </p>
      )}

      {/* Admin team */}
      {isSuperAdmin && (
        <section className="mb-4">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm dark:border-border dark:bg-card">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[hsl(152,45%,92%)] text-[hsl(152,65%,28%)]">
              <Users className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[#0B1F3A] dark:text-foreground">
                {t("modCenter.teamTitle", { defaultValue: "Administration team" })}
              </p>
              <p className="text-xs text-slate-500 dark:text-muted-foreground">
                {t("modCenter.teamDesc", {
                  defaultValue: "Manage administrators, roles, and country access.",
                })}
              </p>
            </div>
            <Button
              asChild
              size="sm"
              className="shrink-0 bg-[hsl(152,65%,28%)] text-white hover:bg-[hsl(152,65%,22%)]"
            >
              <Link href="/admin/team">
                {t("modCenter.teamCta", { defaultValue: "Manage team" })}
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {/* Country filter */}
      <section className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 dark:text-muted-foreground">
          {t("modCenter.filterByCountry", { defaultValue: "Filter by country:" })}
        </span>
        <div className="flex flex-wrap gap-1.5">
          {countryOpts.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setCountryFilter(opt.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                country === opt.id
                  ? "bg-blue-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-border dark:bg-card dark:text-foreground",
              )}
              data-testid={`mod-country-${opt.id === "Dominican Republic" ? "DO" : opt.id}`}
            >
              {country === opt.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              {opt.label}
            </button>
          ))}
        </div>
        <label className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:border-border dark:bg-card">
          <Calendar className="h-3.5 w-3.5" />
          <select
            className="bg-transparent text-xs font-medium outline-none"
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
            aria-label={t("modCenter.period", { defaultValue: "Period" })}
            data-testid="mod-period-filter"
          >
            <option value="all">{t("modCenter.periodAll", { defaultValue: "All time" })}</option>
            <option value="today">{t("modCenter.periodToday", { defaultValue: "Today" })}</option>
            <option value="7d">{t("modCenter.period7d", { defaultValue: "7 days" })}</option>
            <option value="30d">{t("modCenter.period30d", { defaultValue: "30 days" })}</option>
          </select>
        </label>
      </section>

      {/* Management grid */}
      <section className="mb-5">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <NavCard
            href="/admin/listings"
            title={t("modCenter.navProducts", { defaultValue: "Products" })}
            description={t("modCenter.navProductsDesc", { defaultValue: "Moderate product listings" })}
            icon={Package}
            iconClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          />
          <NavCard
            href="/admin/moderation?type=video"
            title={t("modCenter.navVideos", { defaultValue: "Videos" })}
            description={t("modCenter.navVideosDesc", { defaultValue: "Review and moderate videos" })}
            icon={PlayCircle}
            iconClass="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
          />
          <NavCard
            href="/admin/reports"
            title={t("modCenter.navReports", { defaultValue: "Reports" })}
            description={t("modCenter.navReportsDesc", { defaultValue: "Handle user reports" })}
            icon={Flag}
            iconClass="bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
          />
          <NavCard
            href="/admin/agent-applications"
            title={t("modCenter.navSellerVerify", { defaultValue: "Seller verification" })}
            description={t("modCenter.navSellerVerifyDesc", {
              defaultValue: "Validate identities and documents",
            })}
            icon={ShieldCheck}
            iconClass="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
          />
          <NavCard
            href="/admin/flagged"
            title={t("modCenter.navRestrictions", { defaultValue: "Restrictions" })}
            description={t("modCenter.navRestrictionsDesc", {
              defaultValue: "Warn, suspend, or block an account",
            })}
            icon={Ban}
            iconClass="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          />
          <NavCard
            href="/admin/appeals"
            title={t("modCenter.navDisputes", { defaultValue: "Disputes" })}
            description={t("modCenter.navDisputesDesc", {
              defaultValue: "Resolve buyer–seller disputes",
            })}
            icon={Handshake}
            iconClass="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          />
          <NavCard
            href="/admin?tab=boosts"
            title={t("modCenter.navBoosts", { defaultValue: "Boost & Ads" })}
            description={t("modCenter.navBoostsDesc", {
              defaultValue: "Moderate boost requests and ads",
            })}
            icon={Rocket}
            iconClass="bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300"
          />
          <NavCard
            href="/admin/agent-applications"
            title={t("modCenter.navAgents", { defaultValue: "Authorized agents" })}
            description={t("modCenter.navAgentsDesc", {
              defaultValue: "Manage recharge and cash-out agents",
            })}
            icon={Store}
            iconClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          />
          <NavCard
            href="/admin/activity"
            title={t("modCenter.navLogs", { defaultValue: "Activity logs" })}
            description={t("modCenter.navLogsDesc", {
              defaultValue: "Action history and audits",
            })}
            icon={BarChart3}
            iconClass="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
          />
        </div>
      </section>

      {/* Queue */}
      <section className="mb-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-base font-bold text-[#0B1F3A] dark:text-foreground">
            {t("modCenter.queueTitle", { defaultValue: "Moderation queue" })}
          </h2>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("modCenter.searchPlaceholder", { defaultValue: "Search…" })}
            className="h-10 rounded-xl border-slate-200 bg-white pl-9 dark:border-border"
            data-testid="mod-queue-search"
          />
        </div>

        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {queueTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setQueueTab(tab.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                queueTab === tab.id
                  ? "bg-[hsl(152,65%,28%)] text-white"
                  : "border border-slate-200 bg-white text-slate-600 dark:border-border dark:bg-card dark:text-foreground",
              )}
              data-testid={`mod-queue-tab-${tab.id}`}
            >
              {tab.label}
              {typeof tab.count === "number" ? ` (${tab.count})` : ""}
            </button>
          ))}
        </div>

        {queueLoading ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("modCenter.loading", { defaultValue: "Loading…" })}
          </div>
        ) : queueItems.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500 dark:border-border dark:bg-card">
            {t("modCenter.queueEmpty", { defaultValue: "Nothing pending in this queue." })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {queueItems.map((item) => {
              const status = item.moderationStatus || item.status || item.paymentStatus || "pending";
              const thumb = item.thumbnail || item.images?.[0];
              const busy = actionId === item.id;
              return (
                <article
                  key={`${item.kind ?? "listing"}-${item.id}`}
                  className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm dark:border-border dark:bg-card"
                  data-testid={`mod-queue-item-${item.id}`}
                >
                  <div className="flex gap-3">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-xl object-cover border border-slate-100"
                      />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-muted">
                        {item.kind === "report" ? (
                          <Flag className="h-5 w-5" />
                        ) : item.hasVideo ? (
                          <PlayCircle className="h-5 w-5" />
                        ) : (
                          <Package className="h-5 w-5" />
                        )}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-[#0B1F3A] dark:text-foreground">
                            {item.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {(item.kind === "report"
                              ? t("modCenter.typeReport", { defaultValue: "Report" })
                              : item.kind === "boost"
                                ? t("modCenter.typeBoost", { defaultValue: "Boost" })
                                : item.hasVideo
                                  ? t("modCenter.typeVideo", { defaultValue: "Video" })
                                  : t("modCenter.typeProduct", { defaultValue: "Product" }))}
                            {item.country ? ` · ${item.country}` : ""}
                            {item.createdAt
                              ? ` · ${t("modCenter.submitted", { defaultValue: "Submitted" })} ${formatRelative(item.createdAt, i18n.language)}`
                              : ""}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                          {status}
                        </span>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {(!item.kind || item.kind === "listing" || item.kind === "boost") && (
                          <Button
                            size="sm"
                            disabled={busy}
                            className="h-8 gap-1 bg-emerald-600 px-2.5 text-xs text-white hover:bg-emerald-700"
                            onClick={() => runApprove(item)}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            {t("modCenter.approve", { defaultValue: "Approve" })}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy}
                          className="h-8 gap-1 px-2.5 text-xs"
                          onClick={() => {
                            setRejectTarget(item);
                            setRejectReason("");
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                          {t("modCenter.reject", { defaultValue: "Reject" })}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 px-2.5 text-xs"
                          onClick={() => setDetailItem(item)}
                        >
                          {t("modCenter.details", { defaultValue: "Details" })}
                        </Button>
                        {(!item.kind || item.kind === "listing") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 px-2 text-xs text-slate-600"
                            disabled={busy}
                            onClick={() => runEscalate(item)}
                          >
                            {t("modCenter.escalate", { defaultValue: "Escalate" })}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {(queueTab === "products" || queueTab === "videos" || queueTab === "all") &&
          (listingsQuery.data?.total ?? 0) > 20 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("modCenter.prev", { defaultValue: "Previous" })}
              </Button>
              <span className="text-xs text-muted-foreground">
                {page} / {Math.max(1, Math.ceil((listingsQuery.data?.total ?? 0) / 20))}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page * 20 >= (listingsQuery.data?.total ?? 0)}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("modCenter.next", { defaultValue: "Next" })}
              </Button>
            </div>
          )}
      </section>

      {/* Mobile bottom nav (Flexa Control) */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden dark:border-border dark:bg-background/95"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.35rem)" }}
        data-testid="mod-mobile-nav"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5 gap-0.5 px-1 pt-1.5">
          {(
            [
              { href: "/admin", icon: Home, label: t("modCenter.navHome", { defaultValue: "Home" }) },
              {
                href: "/admin",
                icon: BarChart3,
                label: t("modCenter.navStats", { defaultValue: "Stats" }),
              },
              {
                href: "/admin/moderation",
                icon: Shield,
                label: t("modCenter.navModeration", { defaultValue: "Moderation" }),
                active: true,
              },
              {
                href: "/admin/team",
                icon: Users,
                label: t("modCenter.navTeam", { defaultValue: "Team" }),
              },
              {
                href: "/admin/security",
                icon: Settings,
                label: t("modCenter.navSettings", { defaultValue: "Settings" }),
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            const active = "active" in item && item.active;
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-semibold",
                  active
                    ? "bg-[hsl(152,65%,28%)] text-white"
                    : "text-slate-600 dark:text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Details sheet */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setDetailItem(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl dark:bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <h3 className="text-base font-bold text-[#0B1F3A] dark:text-foreground">
                {detailItem.title}
              </h3>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDetailItem(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {detailItem.thumbnail || detailItem.images?.[0] ? (
              <img
                src={detailItem.thumbnail || detailItem.images?.[0]}
                alt=""
                className="mb-3 max-h-48 w-full rounded-xl object-cover"
              />
            ) : null}
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {t("modCenter.fieldCountry", { defaultValue: "Country" })}
                </dt>
                <dd>{detailItem.country ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                  {t("modCenter.fieldSeller", { defaultValue: "Seller" })}
                </dt>
                <dd>{detailItem.sellerName ?? "—"}</dd>
              </div>
              {detailItem.moderationReason || detailItem.reason ? (
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                    {t("modCenter.fieldReason", { defaultValue: "Reason" })}
                  </dt>
                  <dd>{detailItem.moderationReason || detailItem.reason}</dd>
                </div>
              ) : null}
              {detailItem.description ? (
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-muted-foreground">
                    {t("modCenter.fieldDescription", { defaultValue: "Description" })}
                  </dt>
                  <dd className="whitespace-pre-wrap text-slate-600 dark:text-muted-foreground">
                    {detailItem.description}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {(!detailItem.kind || detailItem.kind === "listing") && (
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => runApprove(detailItem)}
                >
                  {t("modCenter.approve", { defaultValue: "Approve" })}
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setRejectTarget(detailItem);
                  setRejectReason("");
                }}
              >
                {t("modCenter.reject", { defaultValue: "Reject" })}
              </Button>
              {detailItem.kind !== "report" && detailItem.kind !== "boost" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLocation(`/listings/${detailItem.id}`)}
                >
                  {t("modCenter.openListing", { defaultValue: "Open listing" })}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Reject dialog */}
      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
          role="dialog"
          aria-modal
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl dark:bg-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-[#0B1F3A] dark:text-foreground">
              {t("modCenter.rejectTitle", { defaultValue: "Reject content" })}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("modCenter.rejectHint", {
                defaultValue: "A reason is required and will notify the user.",
              })}
            </p>
            <textarea
              className="mt-3 min-h-[96px] w-full rounded-xl border border-slate-200 bg-background p-3 text-sm dark:border-border"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t("modCenter.rejectPlaceholder", {
                defaultValue: "Explain the rejection…",
              })}
              data-testid="mod-reject-reason"
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setRejectTarget(null)}>
                {t("modCenter.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={actionId === rejectTarget.id}
                onClick={runReject}
              >
                {actionId === rejectTarget.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t("modCenter.confirmReject", { defaultValue: "Confirm reject" })
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
