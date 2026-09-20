import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarClock, CheckCircle2, RefreshCw, Search, WalletCards } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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

  if (!isSuperAdmin) return null;

  const money = (value: unknown, currency: string) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value) || 0);
  const statusLabel = (value: string) =>
    t(`adminMonCash.status.${value}`, { defaultValue: value });
  const dateTime = (value: string) =>
    new Intl.DateTimeFormat(i18n.resolvedLanguage || i18n.language, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));

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
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[
            [t("adminMonCash.total"), metrics.total ?? 0, WalletCards, "text-blue-600"],
            [t("adminMonCash.completed"), metrics.completed ?? 0, CheckCircle2, "text-emerald-600"],
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
          <CardContent className="p-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("adminMonCash.search")}
                className="pl-9"
              />
            </div>
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
                    <p><span className="text-muted-foreground">{t("adminMonCash.provider")}:</span> {t("adminMonCash.providerMonCash")}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background px-3 py-2.5 text-sm">
                    <CalendarClock className="h-4 w-4 shrink-0 text-blue-600" />
                    <span className="text-muted-foreground">{t("adminMonCash.dateTime")}:</span>
                    <time className="font-semibold tabular-nums" dateTime={tx.confirmedAt || tx.createdAt}>
                      {dateTime(tx.confirmedAt || tx.createdAt)}
                    </time>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Badge>{statusLabel(tx.status)}</Badge>
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