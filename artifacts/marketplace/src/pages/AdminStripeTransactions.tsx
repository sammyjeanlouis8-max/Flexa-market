import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Search, DollarSign, Activity, RefreshCw, ShieldCheck, TrendingUp,
  AlertTriangle, RotateCcw, FileText, ChevronLeft, ChevronRight, Eye, ShieldAlert,
  Loader2, Clock, CheckCircle2, Wallet, Receipt, PieChart, BarChart3
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

// Generate a random requestId for idempotency
const generateRequestId = () => crypto.randomUUID();

export default function AdminStripeTransactions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Route security: only superadmin allowed
  const explicitRole = String((user as any)?.role ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const canonicalRole = ["support", "moderator", "admin", "superadmin"].includes(explicitRole)
    ? explicitRole
    : (user as any)?.isSuperAdmin ? "superadmin" : (user as any)?.isAdmin ? "admin" : "user";
  const isSuperAdmin = canonicalRole === "superadmin";

  useEffect(() => {
    if (user && !isSuperAdmin) {
      setLocation("/admin");
    }
  }, [user, isSuperAdmin, setLocation]);

  useEffect(() => {
    document.title = `${t("adminStripeTransactions.title")} - Flexa Market`;
  }, [t]);

  // Filters state
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Detail Sheet State
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Refund Dialogs State
  const [refundMode, setRefundMode] = useState<"stripe" | "offline" | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundRef, setRefundRef] = useState("");
  const [refundCurrency, setRefundCurrency] = useState("usd");
  const [refundRequestId, setRefundRequestId] = useState("");

  const openRefundDialog = (mode: "stripe" | "offline") => {
    setRefundMode(mode);
    setRefundAmount("");
    setRefundReason("");
    setRefundRef("");
    setRefundCurrency("usd");
    setRefundRequestId(generateRequestId());
  };

  const closeRefundDialog = () => {
    setRefundMode(null);
  };

  // Queries
  const { data: listData, isLoading: isLoadingList, isFetching: isRefreshing, refetch: refreshList } = useQuery({
    queryKey: ["admin-stripe-transactions", debouncedSearch, status, source, dateFrom, dateTo, page],
    queryFn: () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (status !== "all") params.set("status", status);
      if (source !== "all") params.set("source", source);
      if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
      if (dateTo) params.set("to", new Date(dateTo).toISOString());
      return apiFetch(`/api/admin/stripe-transactions?${params.toString()}`, { method: "GET" });
    },
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const { data: detailData, isLoading: isLoadingDetail } = useQuery<any>({
    queryKey: ["admin-stripe-transaction", selectedId],
    queryFn: () => apiFetch(`/api/admin/stripe-transactions/${selectedId}`, { method: "GET" }),
    enabled: isSuperAdmin && selectedId !== null,
  });

  // Mutations
  const refundMutation = useMutation({
    mutationFn: (data: { type: "stripe" | "offline"; payload: any }) => {
      const url = `/api/admin/stripe-transactions/${selectedId}/refunds${data.type === "offline" ? "/offline" : ""}`;
      return apiFetch(url, { method: "POST", body: data.payload });
    },
    onSuccess: () => {
      toast({ title: t("adminStripeTransactions.refund.success") });
      queryClient.invalidateQueries({ queryKey: ["admin-stripe-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stripe-transaction", selectedId] });
      closeRefundDialog();
    },
    onError: (err: Error) => {
      toast({ title: err.message, variant: "destructive" });
    },
  });

  const handleRefundSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundReason.trim()) {
      toast({ title: t("adminStripeTransactions.validation.reasonRequired"), variant: "destructive" });
      return;
    }
    if (refundMode === "offline" && !refundRef.trim()) {
      toast({ title: t("adminStripeTransactions.validation.referenceRequired"), variant: "destructive" });
      return;
    }
    const amountFloat = parseFloat(refundAmount);
    const amountCents = !isNaN(amountFloat) && amountFloat > 0 ? Math.round(amountFloat * 100) : undefined;

    if (refundMode === "stripe") {
      refundMutation.mutate({
        type: "stripe",
        payload: {
          amountCents,
          reason: refundReason,
          requestId: refundRequestId,
        }
      });
    } else if (refundMode === "offline") {
      if (!amountCents) {
        toast({ title: t("adminStripeTransactions.validation.amountRequired"), variant: "destructive" });
        return;
      }
      refundMutation.mutate({
        type: "offline",
        payload: {
          amountCents,
          currency: refundCurrency,
          reason: refundReason,
          externalReference: refundRef,
          requestId: refundRequestId,
        }
      });
    }
  };

  if (!isSuperAdmin) return null;

  const metrics = (listData as any)?.metrics || {};
  const categories = (listData as any)?.categories || [];
  const monthly = (listData as any)?.monthly || [];
  const items = (listData as any)?.items || [];
  const pagination = (listData as any)?.pagination;

  const visiblePending = items.filter((item: any) => ["pending", "processing"].includes(item.status)).length;
  const visibleFailed = items.filter((item: any) => ["failed", "canceled"].includes(item.status)).length;

  const formatMoney = (cents: number, currency = "USD") => new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format((Number(cents) || 0) / 100);

  const isRefundableStatus = (value: string) =>
    ["completed", "partially_refunded", "refunded", "succeeded"].includes(value);

  const statusLabel = (value: string) =>
    t(`adminStripeTransactions.status.${value}`, { defaultValue: value });

  const sourceLabel = (value: string) =>
    t(`adminStripeTransactions.source.${value}`, { defaultValue: value });

  const getStatusColor = (s: string) => {
    switch (s.toLowerCase()) {
      case "succeeded":
      case "paid":
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "refunded":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "failed":
      case "canceled":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "pending":
      case "processing":
        return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const MetricCard = ({ title, value, subtext, icon: Icon, valueColor = "text-foreground" }: any) => (
    <Card className="border-0 shadow-sm rounded-xl bg-white dark:bg-slate-900" data-testid={`metric-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardContent className="p-4 md:p-5">
        <div className="flex justify-between items-start mb-2">
          <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{title}</p>
          {Icon && <Icon className="h-4 w-4 text-muted-foreground/40" />}
        </div>
        <p className={`text-xl md:text-2xl font-black font-mono ${valueColor}`}>{value}</p>
        <p className="mt-1.5 text-[10px] text-muted-foreground flex items-center gap-1 font-medium">
          {subtext}
        </p>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-slate-50 dark:bg-slate-950 font-sans pb-20">
      <section className="relative overflow-hidden bg-[#0a2540] text-white pt-8 pb-16 px-4 md:px-8">
        <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent opacity-60 pointer-events-none" />
        <div className="relative max-w-7xl mx-auto flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wide text-blue-100" data-testid="badge-secure-console">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("adminStripeTransactions.secureConsole")}
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight" data-testid="heading-title">{t("adminStripeTransactions.title")}</h1>
            <p className="mt-2 max-w-xl text-sm text-blue-100/80 font-medium">{t("adminStripeTransactions.subtitle")}</p>
          </div>
          <Button
            type="button"
            onClick={() => refreshList()}
            disabled={isRefreshing}
            data-testid="button-refresh"
            className="h-10 shrink-0 border border-white/15 bg-white/10 px-4 text-white hover:bg-white/20 transition-colors shadow-none"
          >
            <RefreshCw className={`h-4 w-4 md:mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            <span className="hidden md:inline font-semibold tracking-wide">{t("adminStripeTransactions.refresh")}</span>
          </Button>
        </div>
      </section>

      <main className="max-w-7xl mx-auto px-4 md:px-8 -mt-8 relative z-10 space-y-6">
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <MetricCard
            title={t("adminStripeTransactions.metrics.totalVolume", "Gross Volume")}
            value={formatMoney(metrics.grossCents ?? 0)}
            subtext={t("adminStripeTransactions.metrics.capturedOnly", "Captured payments")}
            icon={DollarSign}
          />
          <MetricCard
            title={t("adminStripeTransactions.metrics.flexaRevenue", "Flexa Revenue")}
            value={formatMoney(metrics.flexaRevenueCents ?? 0)}
            subtext={t("adminStripeTransactions.metrics.ourCut", "Platform commission")}
            valueColor="text-indigo-600 dark:text-indigo-400"
            icon={TrendingUp}
          />
          <MetricCard
            title={t("adminStripeTransactions.metrics.sellerEarnings", "Seller Earnings")}
            value={formatMoney(metrics.sellerEarningsCents ?? 0)}
            subtext={t("adminStripeTransactions.metrics.sellerCut", "Total for vendors")}
            valueColor="text-emerald-600 dark:text-emerald-400"
            icon={Wallet}
          />
          <MetricCard
            title={t("adminStripeTransactions.metrics.net", "Net Retained")}
            value={formatMoney(metrics.netCents ?? 0)}
            subtext={t("adminStripeTransactions.metrics.afterRefunds", "After refunds")}
            icon={Receipt}
          />
          <MetricCard
            title={t("adminStripeTransactions.metrics.awaitingPayout", "Awaiting Payout")}
            value={formatMoney(metrics.awaitingSellerPayoutCents ?? 0)}
            subtext={t("adminStripeTransactions.metrics.inEscrow", "In Escrow")}
            valueColor="text-amber-600 dark:text-amber-400"
            icon={Clock}
          />
          <MetricCard
            title={t("adminStripeTransactions.metrics.releasedPayout", "Released Payout")}
            value={formatMoney(metrics.releasedSellerPayoutCents ?? 0)}
            subtext={t("adminStripeTransactions.metrics.settled", "Settled to sellers")}
            valueColor="text-blue-600 dark:text-blue-400"
            icon={CheckCircle2}
          />
          <MetricCard
            title={t("adminStripeTransactions.metrics.refunded", "Refunded")}
            value={formatMoney(metrics.refundedCents ?? 0)}
            subtext={t("adminStripeTransactions.metrics.ledgerVerified", "Ledger verified")}
            valueColor="text-rose-600 dark:text-rose-400"
            icon={RotateCcw}
          />
          <MetricCard
            title={t("adminStripeTransactions.metrics.count", "Total Transactions")}
            value={metrics.totalCount ?? 0}
            subtext={`${visiblePending} ${t("adminStripeTransactions.pendingShort", "Pending")} · ${visibleFailed} ${t("adminStripeTransactions.failedShort", "Failed")}`}
            icon={Activity}
          />
        </div>

        {/* Categories and Monthly */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="shadow-sm border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900" data-testid="card-categories">
            <CardHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800/60">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <PieChart className="h-4 w-4 text-indigo-500" />
                {t("adminStripeTransactions.categoriesTitle", "Volume by Source")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="space-y-3">
                {categories.map((c: any, i: number) => (
                  <div key={c.sourceType || i} className="flex justify-between items-center text-sm" data-testid={`category-row-${c.sourceType}`}>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{sourceLabel(c.sourceType)}</span>
                      <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100">{c.count}</Badge>
                    </div>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{formatMoney(c.capturedCents)}</span>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">{t("adminStripeTransactions.noData", "No data available")}</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900" data-testid="card-monthly">
            <CardHeader className="p-4 pb-3 border-b border-slate-100 dark:border-slate-800/60">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-emerald-500" />
                {t("adminStripeTransactions.monthlyTitle", "Monthly Performance")}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[220px] overflow-y-auto scrollbar-thin">
                <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
                  {monthly.map((m: any, i: number) => (
                    <div key={m.month || i} className="flex flex-col gap-1.5 p-4 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors" data-testid={`monthly-row-${m.month}`}>
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-slate-800 dark:text-slate-200">{m.month}</span>
                        <span className="font-mono text-slate-900 dark:text-white">{formatMoney(m.capturedCents)}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] font-medium text-muted-foreground">
                        <span>{t("adminStripeTransactions.metrics.flexaRevenue", "Flexa Revenue")}: <span className="font-mono text-indigo-600 dark:text-indigo-400">{formatMoney(m.flexaRevenueCents)}</span></span>
                        <span>{t("adminStripeTransactions.metrics.sellerEarnings", "Seller Earnings")}: <span className="font-mono text-emerald-600 dark:text-emerald-400">{formatMoney(m.sellerEarningsCents)}</span></span>
                      </div>
                    </div>
                  ))}
                  {monthly.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">{t("adminStripeTransactions.noData", "No data available")}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col flex-wrap lg:flex-row gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("adminStripeTransactions.searchPlaceholder")}
              className="pl-9 h-10 rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              data-testid="input-search"
            />
          </div>
          <div className="flex gap-3">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10 rounded-lg w-[140px] bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              title={t("adminStripeTransactions.fromDate")}
              data-testid="input-date-from"
            />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10 rounded-lg w-[140px] bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
              title={t("adminStripeTransactions.toDate")}
              data-testid="input-date-to"
            />
          </div>
          <div className="flex gap-3">
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[140px] h-10 rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800" data-testid="select-status">
                <SelectValue placeholder={t("adminStripeTransactions.filterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminStripeTransactions.filterStatus")}</SelectItem>
                <SelectItem value="completed">{t("adminStripeTransactions.status.completed")}</SelectItem>
                <SelectItem value="partially_refunded">{t("adminStripeTransactions.status.partially_refunded")}</SelectItem>
                <SelectItem value="refunded">{t("adminStripeTransactions.status.refunded")}</SelectItem>
                <SelectItem value="failed">{t("adminStripeTransactions.status.failed")}</SelectItem>
                <SelectItem value="pending">{t("adminStripeTransactions.status.pending")}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[140px] h-10 rounded-lg bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800" data-testid="select-source">
                <SelectValue placeholder={t("adminStripeTransactions.filterSource")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminStripeTransactions.filterSource")}</SelectItem>
                <SelectItem value="subscription">{t("adminStripeTransactions.source.subscription")}</SelectItem>
                <SelectItem value="order">{t("adminStripeTransactions.source.order")}</SelectItem>
                <SelectItem value="wallet">{t("adminStripeTransactions.source.wallet")}</SelectItem>
                <SelectItem value="boost">{t("adminStripeTransactions.source.boost")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Data Table */}
        <Card className="rounded-xl overflow-hidden border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">{t("adminStripeTransactions.table.id", "Transaction ID")}</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">{t("adminStripeTransactions.table.parties", "Parties")}</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">{t("adminStripeTransactions.table.breakdown", "Breakdown")}</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">{t("adminStripeTransactions.table.status")}</TableHead>
                  <TableHead className="font-semibold text-slate-700 dark:text-slate-300">{t("adminStripeTransactions.table.timeline", "Timeline")}</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingList ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground font-medium">
                      {t("adminStripeTransactions.noResults")}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 group cursor-pointer" onClick={() => setSelectedId(item.id)} data-testid={`row-transaction-${item.id}`}>
                      <TableCell className="align-top py-4">
                        <div className="font-mono text-xs font-bold text-slate-900 dark:text-white">#{item.id}</div>
                        <div className="font-mono text-[10px] text-muted-foreground truncate w-28 mt-1" title={item.stripe?.paymentIntentId}>
                          {item.stripe?.paymentIntentId || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground font-medium w-3 inline-block">{t("adminStripeTransactions.table.buyerShort")}:</span>
                            <span className="font-semibold truncate max-w-[140px]">{item.user?.name || t("adminStripeTransactions.unknownUser")}</span>
                          </div>
                          {item.seller && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground font-medium w-3 inline-block">{t("adminStripeTransactions.table.sellerShort")}:</span>
                              <span className="font-semibold truncate max-w-[140px] text-slate-700 dark:text-slate-300">{item.seller?.name || t("adminStripeTransactions.unknownUser")}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        <div className="flex flex-col gap-1 text-[11px] font-mono">
                          <div className="flex justify-between gap-4 w-28">
                            <span className="text-muted-foreground">{t("adminStripeTransactions.table.gross")}:</span>
                            <span className="font-bold text-slate-900 dark:text-white">{formatMoney(item.amountCents)}</span>
                          </div>
                          {item.commissionCents > 0 && (
                            <div className="flex justify-between gap-4 w-28">
                              <span className="text-muted-foreground">{t("adminStripeTransactions.table.fee")}:</span>
                              <span className="font-bold text-indigo-600 dark:text-indigo-400">{formatMoney(item.commissionCents + (item.buyerFeeCents ?? 0))}</span>
                            </div>
                          )}
                          {item.sellerEarningsCents > 0 && (
                            <div className="flex justify-between gap-4 w-28">
                              <span className="text-muted-foreground">{t("adminStripeTransactions.table.sellerNet")}:</span>
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatMoney(item.sellerEarningsCents)}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="align-top py-4">
                        <Badge className={`${getStatusColor(item.status)} border-0 font-bold`} variant="outline">{statusLabel(item.status)}</Badge>
                        <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{sourceLabel(item.sourceType)}</div>
                      </TableCell>
                      <TableCell className="align-top py-4 text-xs text-muted-foreground font-medium">
                        <div className="text-slate-700 dark:text-slate-300">{new Date(item.createdAt).toLocaleDateString()}</div>
                        {item.autoReleaseAt && !item.escrowReleasedAt && (
                          <div className="text-[10px] flex items-center gap-1 mt-1.5 text-amber-600 dark:text-amber-500" title={t("adminStripeTransactions.details.autoReleaseAt")}>
                            <Clock className="h-3 w-3" /> {new Date(item.autoReleaseAt).toLocaleDateString()}
                          </div>
                        )}
                        {item.escrowReleasedAt && (
                          <div className="text-[10px] flex items-center gap-1 mt-1.5 text-emerald-600 dark:text-emerald-500" title={t("adminStripeTransactions.details.escrowReleasedAt")}>
                            <CheckCircle2 className="h-3 w-3" /> {new Date(item.escrowReleasedAt).toLocaleDateString()}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="align-top py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedId(item.id); }} className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-200 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400" data-testid={`view-transaction-${item.id}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden flex flex-col divide-y divide-slate-100 dark:divide-slate-800/60">
            {isLoadingList ? (
              <div className="text-center py-12">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-indigo-500" />
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground font-medium">
                {t("adminStripeTransactions.noResults")}
              </div>
            ) : (
              items.map((item: any) => (
                <button type="button" key={item.id} className="relative p-4 flex flex-col gap-3 active:bg-slate-50 dark:active:bg-slate-800/30 text-left" onClick={() => setSelectedId(item.id)} data-testid={`mobile-row-transaction-${item.id}`}>
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col gap-1">
                      <div className="font-bold text-sm text-foreground">{item.user?.name || t("adminStripeTransactions.unknownUser")}</div>
                      {item.seller && (
                        <div className="text-xs text-muted-foreground font-medium">→ {item.seller?.name}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold font-mono text-foreground">{formatMoney(item.amountCents)}</div>
                      <div className="font-mono text-[10px] text-muted-foreground mt-0.5">#{item.id}</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <div className="flex items-center gap-2">
                      <Badge className={`${getStatusColor(item.status)} border-0 font-bold`} variant="outline">{statusLabel(item.status)}</Badge>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{sourceLabel(item.sourceType)}</span>
                    </div>
                    <div className="text-xs font-medium text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50 dark:bg-slate-950/50">
              <span className="text-xs font-semibold text-muted-foreground">
                {t("adminStripeTransactions.pagination.page", { page: pagination.page })} / {pagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="border-slate-200 dark:border-slate-800 font-semibold"
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-4 w-4 mr-1" /> {t("adminStripeTransactions.pagination.prev")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  className="border-slate-200 dark:border-slate-800 font-semibold"
                  data-testid="button-next-page"
                >
                  {t("adminStripeTransactions.pagination.next")} <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </main>

      {/* Details Sheet */}
      <Sheet open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 p-0 font-sans">
          <div className="p-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800/60 sticky top-0 z-10">
            <SheetHeader>
              <SheetTitle className="text-lg font-black">{t("adminStripeTransactions.details.title")}</SheetTitle>
              <SheetDescription className="font-mono text-xs">{t("adminStripeTransactions.details.transactionNumber", { id: selectedId })}</SheetDescription>
            </SheetHeader>
          </div>

          <div className="p-6">
            {isLoadingDetail ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : detailData && (
              <div className="space-y-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-1">{t("adminStripeTransactions.details.amount")}</p>
                    <p className="text-3xl font-black font-mono text-slate-900 dark:text-white">{formatMoney((detailData as any).transaction.amountCents, (detailData as any).transaction.currency)}</p>
                  </div>
                  <Badge className={`${getStatusColor((detailData as any).transaction.status)} px-3 py-1 text-xs font-bold border-0`}>
                    {statusLabel((detailData as any).transaction.status)}
                  </Badge>
                </div>

                {/* Warnings */}
                {(detailData as any).settlement?.requiresSeparateRecovery && (
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-sm dark:bg-amber-900/20 dark:border-amber-800/50 dark:text-amber-300">
                    <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                    <p className="font-medium">{t("adminStripeTransactions.details.settlementWarning")}</p>
                  </div>
                )}

                {/* Breakdown */}
                <div className="bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3 shadow-sm">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground font-medium">{t("adminStripeTransactions.details.buyer", "Buyer")}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{(detailData as any).transaction.user?.name || "-"}</span>
                  </div>
                  {(detailData as any).transaction.seller && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground font-medium">{t("adminStripeTransactions.details.seller", "Seller")}</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{(detailData as any).transaction.seller.name}</span>
                    </div>
                  )}
                  <div className="border-t border-slate-100 dark:border-slate-800/60 my-2" />
                  {(detailData as any).transaction.sellerEarningsCents > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground font-medium">{t("adminStripeTransactions.details.sellerEarnings", "Seller Earnings")}</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatMoney((detailData as any).transaction.sellerEarningsCents)}</span>
                    </div>
                  )}
                  {((detailData as any).transaction.commissionCents > 0 || (detailData as any).transaction.buyerFeeCents > 0) && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground font-medium">{t("adminStripeTransactions.details.commission", "Flexa Commission")}</span>
                      <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{formatMoney((detailData as any).transaction.commissionCents + (detailData as any).transaction.buyerFeeCents)}</span>
                    </div>
                  )}
                </div>

                {/* Escrow Details */}
                {((detailData as any).transaction.autoReleaseAt || (detailData as any).transaction.escrowReleasedAt) && (
                  <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/50 space-y-3">
                    <h4 className="text-[10px] font-bold text-emerald-800 dark:text-emerald-500 uppercase tracking-wider">{t("adminStripeTransactions.details.escrowStatus", "Escrow Status")}</h4>
                    {(detailData as any).transaction.escrowReleasedAt ? (
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-700 dark:text-emerald-400/80 font-medium">{t("adminStripeTransactions.details.escrowReleasedAt", "Released At")}</span>
                        <span className="font-semibold text-emerald-900 dark:text-emerald-300">{new Date((detailData as any).transaction.escrowReleasedAt).toLocaleString()}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span className="text-emerald-700 dark:text-emerald-400/80 font-medium">{t("adminStripeTransactions.details.autoReleaseAt", "Auto-Release At")}</span>
                        <span className="font-semibold text-emerald-900 dark:text-emerald-300">{new Date((detailData as any).transaction.autoReleaseAt).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">{t("adminStripeTransactions.details.stripeId")}</p>
                    <p className="font-mono text-xs font-semibold text-slate-900 dark:text-white break-all">{(detailData as any).stripe?.paymentIntentId || t("adminStripeTransactions.notAvailable")}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mb-1">{t("adminStripeTransactions.details.refundable")}</p>
                    <p className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">{formatMoney((detailData as any).refundableRemainingCents)}</p>
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-6 mt-6">
                  {(detailData as any).transaction.type !== "purchase" && (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                      <ShieldAlert className="h-4 w-4 shrink-0" />
                      {t("adminStripeTransactions.refund.serviceReversalRequired")}
                    </div>
                  )}
                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={() => openRefundDialog("stripe")}
                      disabled={(detailData as any).transaction.type !== "purchase" || (detailData as any).refundableRemainingCents <= 0 || !isRefundableStatus((detailData as any).transaction.status)}
                      className="w-full bg-[#635BFF] hover:bg-[#4a42dc] text-white shadow-sm font-bold"
                      data-testid="button-refund-stripe"
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      {t("adminStripeTransactions.refund.stripeBtn")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => openRefundDialog("offline")}
                      disabled={(detailData as any).transaction.type !== "purchase" || (detailData as any).refundableRemainingCents <= 0 || !isRefundableStatus((detailData as any).transaction.status)}
                      className="w-full border-slate-200 dark:border-slate-800 font-bold bg-white dark:bg-slate-900"
                      data-testid="button-refund-offline"
                    >
                      <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                      {t("adminStripeTransactions.refund.offlineBtn")}
                    </Button>
                  </div>
                </div>

                {/* Refund History */}
                {(detailData as any).refundHistory?.length > 0 && (
                  <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t("adminStripeTransactions.details.refundHistory")}</h3>
                    <div className="space-y-3">
                      {(detailData as any).refundHistory.map((r: any, i: number) => (
                        <div key={i} className="flex justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                          <div>
                            <p className="text-sm font-bold font-mono text-slate-900 dark:text-white">{formatMoney(r.amountCents, r.currency)}</p>
                            <p className="text-[11px] font-medium text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleString()}</p>
                            {r.reason && <p className="text-[11px] mt-1.5 italic text-slate-600 dark:text-slate-400">"{r.reason}"</p>}
                          </div>
                          <Badge variant="secondary" className="h-fit text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {t(`adminStripeTransactions.refund.mode.${r.mode}`, { defaultValue: r.mode })}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Refund Dialog */}
      <Dialog open={refundMode !== null} onOpenChange={(o) => !o && closeRefundDialog()}>
        <DialogContent className="font-sans border-slate-200 dark:border-slate-800 sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <ShieldAlert className="h-5 w-5 text-indigo-500" />
              {t("adminStripeTransactions.refund.title")} — {refundMode === "stripe"
                ? t("adminStripeTransactions.refund.mode.stripe")
                : t("adminStripeTransactions.refund.mode.offline")}
            </DialogTitle>
            <DialogDescription className="font-medium text-slate-600 dark:text-slate-400">
              {t("adminStripeTransactions.refund.confirmMsg")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRefundSubmit} className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adminStripeTransactions.refund.amountLabel")}</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={refundMode === "stripe" ? t("adminStripeTransactions.refund.amountPlaceholder") : "0.00"}
                  className="pl-9 h-11 font-mono font-bold bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                  required={refundMode === "offline"}
                  data-testid="input-refund-amount"
                />
              </div>
            </div>

            {refundMode === "offline" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adminStripeTransactions.refund.currencyLabel")}</Label>
                  <Input
                    value={refundCurrency}
                    onChange={(e) => setRefundCurrency(e.target.value)}
                    placeholder="usd"
                    className="h-11 font-mono uppercase font-bold bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                    required
                    data-testid="input-refund-currency"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adminStripeTransactions.refund.referenceLabel")}</Label>
                  <Input
                    value={refundRef}
                    onChange={(e) => setRefundRef(e.target.value)}
                    placeholder={t("adminStripeTransactions.refund.referencePlaceholder")}
                    className="h-11 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-medium"
                    required
                    data-testid="input-refund-reference"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("adminStripeTransactions.refund.reasonLabel")}</Label>
              <Input
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={t("adminStripeTransactions.refund.reasonPlaceholder")}
                className="h-11 bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 font-medium"
                required
                data-testid="input-refund-reason"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={closeRefundDialog} className="font-bold border-slate-200 dark:border-slate-800" data-testid="button-cancel-refund">
                {t("adminStripeTransactions.refund.cancel")}
              </Button>
              <Button type="submit" disabled={refundMutation.isPending} className="bg-rose-600 hover:bg-rose-700 text-white font-bold shadow-sm" data-testid="button-submit-refund">
                {refundMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t("adminStripeTransactions.refund.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
