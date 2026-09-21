import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  RefreshCw,
  Search,
  WalletCards,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type HaitiTransaction = {
  id: string;
  sourceId: number;
  sourceTable: string;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  userPhone: string | null;
  accountNumber: string | null;
  kind: "recharge" | "cashout";
  direction: "inbound" | "outbound";
  amountUsd: number | string | null;
  amountHtg: number | string | null;
  currency: string;
  paymentRef: string | null;
  providerOrderId: string | null;
  providerTransactionId: string | null;
  purpose: string;
  status: string;
  providerStatus: string | null;
  providerError: string | null;
  payoutRate: number | string | null;
  payoutAttemptedAt: string | null;
  paidAt: string | null;
  refundedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

type TransactionFilter = "all" | "inbound" | "outbound" | "attention";

export default function AdminHaitiTransactions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<TransactionFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const explicitRole = String((user as any)?.role ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  const canonicalRole = ["support", "moderator", "admin", "superadmin"].includes(explicitRole)
    ? explicitRole
    : (user as any)?.isSuperAdmin ? "superadmin" : (user as any)?.isAdmin ? "admin" : "user";
  const isSuperAdmin = canonicalRole === "superadmin";

  useEffect(() => {
    if (user && !isSuperAdmin) setLocation("/admin");
  }, [user, isSuperAdmin, setLocation]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    document.title = `${t("adminMonCash.title")} - Flexa Market`;
  }, [t]);

  const query = useQuery<any>({
    queryKey: ["admin-moncash-transactions", debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "500" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      return apiFetch(`/api/wallet/haiti/admin/transactions?${params}`, { method: "GET" });
    },
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const transactions = (query.data?.transactions ?? []) as HaitiTransaction[];
  const metrics = query.data?.metrics ?? {};
  const filteredTransactions = transactions.filter(tx => {
    if (filter === "inbound") return tx.direction === "inbound";
    if (filter === "outbound") return tx.direction === "outbound";
    if (filter === "attention") {
      return ["provider_submitting", "provider_pending", "provider_unknown"].includes(tx.status);
    }
    return true;
  });
  const reconcileMutation = useMutation({
    mutationFn: (requestId: number) => apiFetch(
      `/api/cashout/admin/moncash/${requestId}/reconcile`,
      { method: "POST" },
    ),
    onSuccess: () => query.refetch(),
  });

  if (!isSuperAdmin) return null;

  const money = (value: unknown, currency: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value) || 0);
  const kindLabel = (value: HaitiTransaction["kind"]) =>
    t(`adminMonCash.kind.${value}`, { defaultValue: value });
  const statusLabel = (value: string) =>
    t(`adminMonCash.status.${value}`, { defaultValue: value.replaceAll("_", " ") });
  const statusClass = (value: string) => {
    if (value === "paid" || value === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    if (value === "refunded") return "border-blue-500/30 bg-blue-500/10 text-blue-700";
    if (value === "provider_unknown") return "border-red-500/30 bg-red-500/10 text-red-700";
    return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  };
  const canAct = (tx: HaitiTransaction) =>
    tx.kind === "cashout"
    && (
      tx.status === "provider_ready"
      || (
        !!tx.providerTransactionId
        && ["provider_submitting", "provider_pending", "provider_unknown"].includes(tx.status)
      )
    );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <button onClick={() => setLocation("/admin")} className="rounded-xl p-2 hover:bg-muted" aria-label={t("adminMonCash.back")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-black">{t("adminMonCash.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("adminMonCash.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          {t("adminMonCash.refresh")}
        </Button>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [t("adminMonCash.total"), metrics.total ?? 0, WalletCards, "text-blue-600"],
            [t("adminMonCash.inbound"), metrics.inbound ?? 0, CheckCircle2, "text-emerald-600"],
            [t("adminMonCash.outbound"), metrics.outbound ?? 0, CheckCircle2, "text-orange-600"],
            [
              t("adminMonCash.availableBalance"),
              query.data?.bazikBalance
                ? money(query.data.bazikBalance.availableHtg, query.data.bazikBalance.currency || "HTG")
                : "—",
              WalletCards,
              "text-cyan-600",
            ],
          ].map(([label, value, Icon, color]: any) => (
            <Card key={String(label)}>
              <CardContent className="p-4">
                <Icon className={`mb-2 h-5 w-5 ${color}`} />
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-black tabular-nums">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="space-y-3 p-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("adminMonCash.search")}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(["all", "inbound", "outbound", "attention"] as TransactionFilter[]).map(value => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={filter === value ? "default" : "outline"}
                  onClick={() => setFilter(value)}
                  className="shrink-0"
                >
                  {t(`adminMonCash.filters.${value}`)}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {query.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : query.isError ? (
          <Card><CardContent className="p-8 text-center text-sm text-red-500">{(query.error as Error).message}</CardContent></Card>
        ) : filteredTransactions.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">{t("adminMonCash.empty")}</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {filteredTransactions.map(tx => {
              const expanded = expandedId === tx.id;
              const isReconciling = reconcileMutation.isPending
                && reconcileMutation.variables === tx.sourceId;
              return (
              <Card key={tx.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold">{tx.userName || `#${tx.userId}`}</p>
                        <Badge variant="outline">{kindLabel(tx.kind)}</Badge>
                        <Badge className={statusClass(tx.status)} variant="outline">
                          {statusLabel(tx.status)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-black tabular-nums">
                        {tx.amountHtg ? money(tx.amountHtg, "HTG") : money(tx.amountUsd, "USD")}
                      </p>
                      {tx.amountHtg && (
                        <p className="text-xs text-muted-foreground">{money(tx.amountUsd, "USD")}</p>
                      )}
                    </div>
                  </div>

                  {tx.status === "provider_unknown" && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{tx.providerError || t("adminMonCash.needsReview")}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setExpandedId(expanded ? null : tx.id)}
                    >
                      {expanded ? <ChevronUp className="mr-1 h-4 w-4" /> : <ChevronDown className="mr-1 h-4 w-4" />}
                      {expanded ? t("adminMonCash.hideDetails") : t("adminMonCash.viewDetails")}
                    </Button>
                    {canAct(tx) && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          if (
                            tx.status !== "provider_ready"
                            || window.confirm(t("adminMonCash.confirmSend"))
                          ) {
                            reconcileMutation.mutate(tx.sourceId);
                          }
                        }}
                        disabled={reconcileMutation.isPending}
                      >
                        <RefreshCw className={`mr-1 h-4 w-4 ${isReconciling ? "animate-spin" : ""}`} />
                        {isReconciling
                          ? t("adminMonCash.verifying")
                          : tx.status === "provider_ready"
                            ? t("adminMonCash.sendNow")
                            : t("adminMonCash.verify")}
                      </Button>
                    )}
                  </div>

                  {reconcileMutation.isError && reconcileMutation.variables === tx.sourceId && (
                    <p className="rounded-xl bg-red-500/10 p-3 text-xs text-red-700">
                      {(reconcileMutation.error as Error).message}
                    </p>
                  )}

                  {expanded && (
                    <div className="grid gap-3 rounded-xl bg-muted/40 p-3 text-sm md:grid-cols-2">
                      {[
                        [t("adminMonCash.reference"), tx.paymentRef],
                        [t("adminMonCash.transactionId"), tx.providerTransactionId],
                        [t("adminMonCash.providerStatus"), tx.providerStatus],
                        [t("adminMonCash.wallet"), tx.accountNumber],
                        [t("adminMonCash.email"), tx.userEmail],
                        [t("adminMonCash.rate"), tx.payoutRate ? `${tx.payoutRate} HTG/USD` : null],
                      ].map(([label, value]) => value ? (
                        <div key={String(label)} className="min-w-0">
                          <p className="text-xs text-muted-foreground">{label}</p>
                          <div className="flex items-center gap-2">
                            <p className="break-all font-medium">{value}</p>
                            {(label === t("adminMonCash.reference") || label === t("adminMonCash.transactionId")) && (
                              <button
                                type="button"
                                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                                onClick={() => navigator.clipboard.writeText(String(value))}
                                aria-label={t("adminMonCash.copy")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : null)}
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}