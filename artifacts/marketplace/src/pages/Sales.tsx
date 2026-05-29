import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Printer, Package, ChevronLeft, MapPin, Truck, CheckCircle2, Clock, Eye, DollarSign, Sparkles, TrendingDown, TrendingUp, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";


type Sale = {
  id: number;
  amount: number;
  currency: string;
  paymentMethod: string;
  orderStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
  trackingStatus: string | null;
  escrowReleased: boolean;
  listingCountry: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  commissionRate: number | null;
  commissionAmount: number | null;
  sellerEarnings: number | null;
  shippingName: string | null;
  shippingCity: string | null;
  shippingRegion: string | null;
  listingId: number;
  listingTitle: string;
  listingImages: string[] | null;
  buyerName: string | null;
};

type Summary = {
  orderCount: number;
  totalSales: number;
  totalCommission: number;
  netEarnings: number;
  promoActive: boolean;
  promoDaysRemaining: number;
};

const STATUS_ICON: Record<string, typeof Clock> = {
  pending:        Clock,
  ready_to_ship:  Package,
  shipped:        Truck,
  delivered:      CheckCircle2,
  completed:      ShieldCheck,
};

const STATUS_COLOR: Record<string, string> = {
  pending:       "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  ready_to_ship: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  shipped:       "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  delivered:     "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800",
  completed:     "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
};

export default function Sales() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const [sales, setSales] = useState<Sale[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusLabel = (key: string) => {
    const map: Record<string, string> = {
      pending:       t("sales.statusPending"),
      ready_to_ship: t("sales.statusReadyToShip"),
      shipped:       t("sales.statusShipped"),
      delivered:     t("sales.statusDelivered"),
      completed:     t("sales.statusCompleted"),
    };
    return map[key] ?? key;
  };

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch("/api/orders/sales", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/sales/summary", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const d1 = await r1.json().catch(() => []);
      const d2 = await r2.json().catch(() => null);
      if (!r1.ok) { setError((d1 as any)?.error || t("sales.loading")); return; }
      setSales(d1 as Sale[]);
      if (r2.ok) setSummary(d2 as Summary);
      setError(null);
    } catch {
      setError(t("sales.loading"));
    }
  }, [token, t]);

  useEffect(() => {
    if (!user) { setLocation("/auth/login"); return; }
    load();
  }, [user, load, setLocation]);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => history.back()} className="mb-4 -ml-2" data-testid="button-back">
        <ChevronLeft className="h-4 w-4 mr-1" /> {t("sales.back")}
      </Button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Package className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">{t("sales.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("sales.subtitle")}</p>
        </div>
      </div>

      {summary && (
        <div className="mb-5">
          {summary.promoActive && (
            <div className="mb-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-sm flex items-center gap-2 text-green-800 dark:text-green-300">
              <Sparkles className="h-4 w-4 flex-shrink-0" />
              <span>
                {summary.promoDaysRemaining === 1
                  ? t("sales.promoActive", { days: summary.promoDaysRemaining })
                  : t("sales.promoActivePlural", { days: summary.promoDaysRemaining })}
              </span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
                <DollarSign className="h-3.5 w-3.5" />{t("sales.totalSales")}
              </div>
              <div className="text-xl font-extrabold" data-testid="summary-total-sales">${summary.totalSales.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {summary.orderCount === 1
                  ? t("sales.orderCount_one", { count: summary.orderCount })
                  : t("sales.orderCount_other", { count: summary.orderCount })}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
                <TrendingDown className="h-3.5 w-3.5" />{t("sales.commission")}
              </div>
              <div className="text-xl font-extrabold text-rose-600 dark:text-rose-400" data-testid="summary-commission">
                −${summary.totalCommission.toFixed(2)}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground mb-1">
                <TrendingUp className="h-3.5 w-3.5" />{t("sales.netEarnings")}
              </div>
              <div className="text-xl font-extrabold text-green-700 dark:text-green-400" data-testid="summary-net">
                ${summary.netEarnings.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 mb-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">{error}</div>
      )}

      {sales === null && !error && (
        <div className="text-center text-muted-foreground py-12">{t("sales.loading")}</div>
      )}

      {sales && sales.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">{t("sales.noSalesTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("sales.noSalesDesc")}</p>
        </div>
      )}

      {sales && sales.length > 0 && (
        <div className="space-y-3">
          {sales.map(s => {
            const img = (s.listingImages?.[0]) ?? `https://placehold.co/120x120/f97316/white?text=Item`;
            const StatusIcon = STATUS_ICON[s.orderStatus] ?? STATUS_ICON.ready_to_ship!;
            const statusColor = STATUS_COLOR[s.orderStatus] ?? STATUS_COLOR.ready_to_ship!;

            return (
              <div
                key={s.id}
                className="p-4 rounded-2xl border border-border bg-card flex flex-col md:flex-row md:items-center gap-4"
                data-testid={`sale-row-${s.id}`}
              >
                <img
                  src={img}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/120x120/f97316/white?text=Item"; }}
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-muted-foreground">#BZH-{String(s.id).padStart(6, "0")}</span>
                    <span
                      className={cn("inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border", statusColor)}
                      data-testid={`status-${s.id}`}
                    >
                      <StatusIcon className="h-3 w-3" /> {statusLabel(s.orderStatus)}
                    </span>
                    <Badge variant="secondary" className="capitalize text-xs">{s.paymentMethod}</Badge>
                    {s.listingCountry === "Haiti" && <span className="text-xs">🇭🇹</span>}
                  </div>
                  <p className="font-semibold truncate mt-0.5">{s.listingTitle}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <span>{t("sales.to")} <strong className="text-foreground">{s.shippingName ?? s.buyerName ?? "Buyer"}</strong></span>
                    {(s.shippingCity || s.shippingRegion) && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {[s.shippingCity, s.shippingRegion].filter(Boolean).join(", ")}
                      </span>
                    )}
                    <span>{new Date(s.createdAt).toLocaleDateString()}</span>
                  </div>
                  {s.trackingNumber && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">
                      {s.carrier}: {s.trackingNumber}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-stretch md:items-end gap-2 flex-shrink-0 md:w-52">
                  <div className="md:text-right">
                    <div className="text-xs text-muted-foreground line-through">${s.amount.toFixed(2)}</div>
                    <div className="font-extrabold text-green-700 dark:text-green-400" data-testid={`sale-net-${s.id}`}>
                      ${(s.sellerEarnings ?? s.amount).toFixed(2)}
                    </div>
                    {s.commissionAmount != null && s.commissionAmount > 0 && (
                      <div className="text-xs text-muted-foreground">−${s.commissionAmount.toFixed(2)} {t("sales.fee")}</div>
                    )}
                    {s.escrowReleased && (
                      <div className="text-xs text-green-400 font-semibold flex items-center gap-1 md:justify-end mt-0.5">
                        <ShieldCheck className="h-3 w-3" /> {t("sales.fundsReleased")}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 md:justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLocation(`/orders/${s.id}`)}
                      data-testid={`button-view-order-${s.id}`}
                    >
                      <Eye className="h-4 w-4 mr-1.5" /> {t("sales.view")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setLocation(`/orders/${s.id}/label`)}
                      data-testid={`button-print-label-${s.id}`}
                    >
                      <Printer className="h-4 w-4 mr-1.5" /> {t("sales.label")}
                    </Button>
                  </div>

                  {s.orderStatus === "ready_to_ship" && (
                    <Button
                      size="sm"
                      onClick={() => setLocation(`/orders/${s.id}`)}
                      data-testid={`button-ship-${s.id}`}
                    >
                      <Truck className="h-4 w-4 mr-1.5" /> {t("sales.shipOrder")}
                    </Button>
                  )}
                  {s.orderStatus === "shipped" && !s.escrowReleased && (
                    <p className="text-xs text-muted-foreground text-right">
                      {t("sales.waitingBuyer")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
