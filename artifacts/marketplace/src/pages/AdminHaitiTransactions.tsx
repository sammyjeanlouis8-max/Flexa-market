import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle2, Clock3, RefreshCw, Search, ShieldCheck, WalletCards } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type HaitiTransaction = {
  id: number;
  userId: number;
  userName: string | null;
  userEmail: string | null;
  accountNumber: string | null;
  balanceUsd: number | string | null;
  amountUsd: number | string | null;
  amountHtg: number | string | null;
  rateUsed: number | string | null;
  bonusPct: number | string | null;
  paymentRef: string | null;
  providerOrderId: string | null;
  status: string;
  note: string | null;
  confirmedAt: string | null;
  createdAt: string;
};

export default function AdminHaitiTransactions() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");

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
    queryKey: ["admin-moncash-transactions", status, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams({ status, limit: "500" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      return apiFetch(`/api/wallet/haiti/admin/transactions?${params}`, { method: "GET" });
    },
    enabled: isSuperAdmin,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const reconcile = useMutation({
    mutationFn: (userId: number) =>
      apiFetch(`/api/wallet/haiti/admin/reconcile/${userId}`, { method: "POST" }),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["admin-moncash-transactions"] });
      toast({
        title: result?.credited > 0 ? t("adminMonCash.creditSuccess") : t("adminMonCash.verificationComplete"),
        description: t("adminMonCash.verificationResult", {
          checked: result?.checked ?? 0,
          credited: result?.credited ?? 0,
        }),
      });
    },
    onError: (error: Error) => toast({
      title: t("adminMonCash.verificationFailed"),
      description: error.message,
      variant: "destructive",
    }),
  });

  const transactions = (query.data?.transactions ?? []) as HaitiTransaction[];
  const metrics = query.data?.metrics ?? {};
  const pendingUsers = useMemo(
    () => new Set(transactions.filter(tx => tx.status === "pending").map(tx => tx.userId)).size,
    [transactions],
  );

  if (!isSuperAdmin) return null;

  const money = (value: unknown, currency: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value) || 0);
  const statusLabel = (value: string) =>
    t(`adminMonCash.status.${value}`, { defaultValue: value });

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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[
            [t("adminMonCash.total"), metrics.total ?? 0, WalletCards, "text-blue-600"],
            [t("adminMonCash.completed"), metrics.completed ?? 0, CheckCircle2, "text-emerald-600"],
            [t("adminMonCash.pending"), metrics.pending ?? 0, Clock3, "text-amber-600"],
            [t("adminMonCash.pendingUsers"), pendingUsers, ShieldCheck, "text-violet-600"],
            [t("adminMonCash.volume"), money(metrics.amountHtg, "HTG"), WalletCards, "text-cyan-600"],
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
          <CardContent className="flex flex-col gap-3 p-3 md:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("adminMonCash.search")}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-full md:w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("adminMonCash.status.all")}</SelectItem>
                <SelectItem value="pending">{t("adminMonCash.status.pending")}</SelectItem>
                <SelectItem value="completed">{t("adminMonCash.status.completed")}</SelectItem>
                <SelectItem value="rejected">{t("adminMonCash.status.rejected")}</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {query.isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <div key={i} className="h-40 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : query.isError ? (
          <Card><CardContent className="p-8 text-center text-sm text-red-500">{(query.error as Error).message}</CardContent></Card>
        ) : transactions.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-sm text-muted-foreground">{t("adminMonCash.empty")}</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {transactions.map(tx => (
              <Card key={tx.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{tx.userName || `#${tx.userId}`}</p>
                      <p className="text-xs text-muted-foreground">{tx.userEmail} · {tx.accountNumber || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-emerald-600">{money(tx.amountHtg, "HTG")}</p>
                      <p className="text-xs text-muted-foreground">{money(tx.amountUsd, "USD")}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 rounded-xl bg-muted/50 p-3 text-xs md:grid-cols-2">
                    <p><span className="text-muted-foreground">{t("adminMonCash.orderId")}:</span> <span className="font-mono break-all">{tx.providerOrderId || "—"}</span></p>
                    <p><span className="text-muted-foreground">{t("adminMonCash.reference")}:</span> <span className="font-mono break-all">{tx.paymentRef || "—"}</span></p>
                    <p><span className="text-muted-foreground">{t("adminMonCash.created")}:</span> {new Date(tx.createdAt).toLocaleString()}</p>
                    <p><span className="text-muted-foreground">{t("adminMonCash.walletBalance")}:</span> {money(tx.balanceUsd, "USD")}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={tx.status === "completed" ? "default" : "outline"}>{statusLabel(tx.status)}</Badge>
                    {tx.status === "pending" && (
                      <Button
                        size="sm"
                        onClick={() => reconcile.mutate(tx.userId)}
                        disabled={reconcile.isPending}
                      >
                        <ShieldCheck className="mr-1 h-4 w-4" />
                        {reconcile.isPending && reconcile.variables === tx.userId
                          ? t("adminMonCash.verifying")
                          : t("adminMonCash.verify")}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}