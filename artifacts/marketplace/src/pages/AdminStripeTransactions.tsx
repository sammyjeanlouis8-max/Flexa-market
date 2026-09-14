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
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

  const { data: detailData, isLoading: isLoadingDetail } = useQuery({
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

  const metrics = (listData as any)?.metrics;
  const items = (listData as any)?.items || [];
  const pagination = (listData as any)?.pagination;

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

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f5f7fb] dark:bg-slate-950">
      <section className="relative overflow-hidden bg-[linear-gradient(135deg,#0f172a_0%,#172554_48%,#312e81_100%)] text-white">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-400/15 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-4 py-7 md:px-8 md:py-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wide text-blue-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("adminStripeTransactions.secureConsole")}
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight">{t("adminStripeTransactions.title")}</h1>
              <p className="mt-1 max-w-xl text-sm text-blue-100/80">{t("adminStripeTransactions.subtitle")}</p>
            </div>
            <Button
              type="button"
              onClick={() => refreshList()}
              disabled={isRefreshing}
              className="h-10 shrink-0 border border-white/15 bg-white/10 px-3 text-white hover:bg-white/20"
            >
              <RefreshCw className={`h-4 w-4 md:mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              <span className="hidden md:inline">{t("adminStripeTransactions.refresh")}</span>
            </Button>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-400/15 px-3 py-2 text-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              {t("adminStripeTransactions.liveMonitoring")}
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-blue-100">
              <Activity className="h-3.5 w-3.5" />
              {t("adminStripeTransactions.autoRefresh")}
            </span>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 py-5 md:px-8 md:py-8 space-y-5">
      <div className="-mt-10 relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-0 shadow-lg shadow-slate-900/5 rounded-2xl">
          <CardContent className="p-4 md:p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{t("adminStripeTransactions.metrics.totalVolume")}</p>
            <p className="text-xl md:text-2xl font-black text-foreground">{formatMoney(metrics?.grossCents ?? 0)}</p>
            <p className="mt-1 text-[10px] text-emerald-600">{t("adminStripeTransactions.metrics.capturedOnly")}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg shadow-slate-900/5 rounded-2xl">
          <CardContent className="p-4 md:p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{t("adminStripeTransactions.metrics.refunded")}</p>
            <p className="text-xl md:text-2xl font-black text-blue-600 dark:text-blue-400">{formatMoney(metrics?.refundedCents ?? 0)}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{t("adminStripeTransactions.metrics.ledgerVerified")}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg shadow-slate-900/5 rounded-2xl">
          <CardContent className="p-4 md:p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{t("adminStripeTransactions.metrics.net")}</p>
            <p className="text-xl md:text-2xl font-black text-green-600 dark:text-green-400">{formatMoney(metrics?.netCents ?? 0)}</p>
            <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><TrendingUp className="h-3 w-3" />{t("adminStripeTransactions.metrics.afterRefunds")}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-lg shadow-slate-900/5 rounded-2xl">
          <CardContent className="p-4 md:p-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">{t("adminStripeTransactions.metrics.count")}</p>
            <p className="text-xl md:text-2xl font-black text-foreground">{metrics?.totalCount ?? 0}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{t("adminStripeTransactions.metrics.verifiedCardOnly")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 flex flex-col flex-wrap lg:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("adminStripeTransactions.searchPlaceholder")}
            className="pl-9 h-10 rounded-xl"
          />
        </div>
        <div className="flex gap-3">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-10 rounded-xl w-36"
            title={t("adminStripeTransactions.fromDate")}
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-10 rounded-xl w-36"
            title={t("adminStripeTransactions.toDate")}
          />
        </div>
        <div className="flex gap-3">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px] h-10 rounded-xl">
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
            <SelectTrigger className="w-[140px] h-10 rounded-xl">
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
      <Card className="rounded-2xl overflow-hidden border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>{t("adminStripeTransactions.table.id")}</TableHead>
                <TableHead>{t("adminStripeTransactions.table.user")}</TableHead>
                <TableHead>{t("adminStripeTransactions.table.amount")}</TableHead>
                <TableHead>{t("adminStripeTransactions.table.status")}</TableHead>
                <TableHead>{t("adminStripeTransactions.table.source")}</TableHead>
                <TableHead>{t("adminStripeTransactions.table.date")}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoadingList ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t("adminStripeTransactions.noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item: any) => (
                  <TableRow key={item.id} className="hover:bg-muted/30 group">
                    <TableCell className="font-mono text-xs text-muted-foreground">#{item.id}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{item.user?.name || t("adminStripeTransactions.unknownUser")}</div>
                      <div className="text-[10px] text-muted-foreground">{item.user?.email}</div>
                    </TableCell>
                    <TableCell className="font-semibold">{formatMoney(item.amountCents)}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(item.status)} variant="outline">{statusLabel(item.status)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{sourceLabel(item.sourceType)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(item.id)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye className="h-4 w-4 mr-2" /> {t("adminStripeTransactions.view")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden flex flex-col divide-y divide-border">
          {isLoadingList ? (
            <div className="text-center py-8">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("adminStripeTransactions.noResults")}
            </div>
          ) : (
            items.map((item: any) => (
              <button type="button" key={item.id} className="relative p-4 pl-5 flex flex-col gap-3 active:bg-muted/30 text-left" onClick={() => setSelectedId(item.id)}>
                <span className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${
                  ["completed", "succeeded"].includes(item.status) ? "bg-emerald-500" :
                  item.status === "refunded" || item.status === "partially_refunded" ? "bg-blue-500" :
                  ["failed", "canceled"].includes(item.status) ? "bg-rose-500" : "bg-amber-400"
                }`} />
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-sm text-foreground">{item.user?.name || t("adminStripeTransactions.unknownUser")}</div>
                    <div className="text-xs text-muted-foreground">{item.user?.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-foreground">{formatMoney(item.amountCents)}</div>
                    <div className="font-mono text-[10px] text-muted-foreground mt-0.5">#{item.id}</div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(item.status)} variant="outline">{statusLabel(item.status)}</Badge>
                    <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sourceLabel(item.sourceType)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 border-t bg-muted/20">
            <span className="text-sm text-muted-foreground">
              {t("adminStripeTransactions.pagination.page", { page: pagination.page })} / {pagination.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("adminStripeTransactions.pagination.prev")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
              >
                {t("adminStripeTransactions.pagination.next")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
      <div className="flex items-center justify-center gap-2 pb-[calc(20px+env(safe-area-inset-bottom,0px))] text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
        {t("adminStripeTransactions.stripeOnlyNotice")}
      </div>

      {/* Details Sheet */}
      <Sheet open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle>{t("adminStripeTransactions.details.title")}</SheetTitle>
            <SheetDescription>{t("adminStripeTransactions.details.transactionNumber", { id: selectedId })}</SheetDescription>
          </SheetHeader>

          {isLoadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : detailData && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("adminStripeTransactions.details.amount")}</p>
                  <p className="text-3xl font-black">{formatMoney((detailData as any).transaction.amountCents, (detailData as any).transaction.currency)}</p>
                </div>
                <Badge className={`${getStatusColor((detailData as any).transaction.status)} px-3 py-1 text-sm`}>
                  {statusLabel((detailData as any).transaction.status)}
                </Badge>
              </div>

              {/* Warnings */}
              {(detailData as any).settlement?.requiresSeparateRecovery && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-sm dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
                  <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
                  <p>{t("adminStripeTransactions.details.settlementWarning")}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("adminStripeTransactions.details.stripeId")}</p>
                  <p className="font-mono text-xs break-all">{(detailData as any).stripe?.paymentIntentId || t("adminStripeTransactions.notAvailable")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">{t("adminStripeTransactions.details.refundable")}</p>
                  <p className="font-semibold text-blue-600 dark:text-blue-400">{formatMoney((detailData as any).refundableRemainingCents)}</p>
                </div>
              </div>

              <div className="border-t pt-6 mt-6">
                <div className="flex flex-col gap-2">
                  <Button
                    onClick={() => openRefundDialog("stripe")}
                    disabled={(detailData as any).refundableRemainingCents <= 0 || !isRefundableStatus((detailData as any).transaction.status)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    {t("adminStripeTransactions.refund.stripeBtn")}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openRefundDialog("offline")}
                    disabled={(detailData as any).refundableRemainingCents <= 0 || !isRefundableStatus((detailData as any).transaction.status)}
                    className="w-full border-dashed"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    {t("adminStripeTransactions.refund.offlineBtn")}
                  </Button>
                </div>
              </div>

              {/* Refund History */}
              {(detailData as any).refundHistory?.length > 0 && (
                <div className="pt-6">
                  <h3 className="text-sm font-bold mb-3">{t("adminStripeTransactions.details.refundHistory")}</h3>
                  <div className="space-y-3">
                    {(detailData as any).refundHistory.map((r: any, i: number) => (
                      <div key={i} className="flex justify-between p-3 rounded-lg border bg-muted/30">
                        <div>
                          <p className="text-sm font-semibold">{formatMoney(r.amountCents, r.currency)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                          {r.reason && <p className="text-xs mt-1 italic text-muted-foreground">"{r.reason}"</p>}
                        </div>
                        <Badge variant="secondary" className="h-fit text-[10px]">
                          {t(`adminStripeTransactions.refund.mode.${r.mode}`, { defaultValue: r.mode })}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Refund Dialog */}
      <Dialog open={refundMode !== null} onOpenChange={(o) => !o && closeRefundDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              {t("adminStripeTransactions.refund.title")} — {refundMode === "stripe"
                ? t("adminStripeTransactions.refund.mode.stripe")
                : t("adminStripeTransactions.refund.mode.offline")}
            </DialogTitle>
            <DialogDescription>
              {t("adminStripeTransactions.refund.confirmMsg")}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRefundSubmit} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("adminStripeTransactions.refund.amountLabel")}</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder={refundMode === "stripe" ? t("adminStripeTransactions.refund.amountPlaceholder") : "0.00"}
                  className="pl-9"
                  required={refundMode === "offline"}
                />
              </div>
            </div>

            {refundMode === "offline" && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("adminStripeTransactions.refund.currencyLabel")}</Label>
                  <Select value={refundCurrency} onValueChange={setRefundCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="usd">USD</SelectItem>
                      <SelectItem value="htg">HTG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("adminStripeTransactions.refund.offlineRefLabel")}</Label>
                  <Input
                    value={refundRef}
                    onChange={(e) => setRefundRef(e.target.value)}
                    placeholder={t("adminStripeTransactions.refund.offlineRefPlaceholder")}
                    required
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t("adminStripeTransactions.refund.reasonLabel")}</Label>
              <Textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={t("adminStripeTransactions.refund.reasonPlaceholder")}
                required
                className="resize-none"
              />
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={closeRefundDialog}>{t("adminStripeTransactions.cancel")}</Button>
              <Button type="submit" variant="destructive" disabled={refundMutation.isPending}>
                {refundMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {refundMutation.isPending ? t("adminStripeTransactions.refund.processing") : t("adminStripeTransactions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
