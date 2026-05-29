import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ShoppingBag, ChevronLeft, Package, Truck, CheckCircle2, Clock, Eye, ShieldCheck, XCircle, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

type Order = {
  id: number;
  amount: number;
  currency: string;
  orderStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
  trackingStatus: string | null;
  escrowReleased: boolean;
  listingCountry: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  listingId: number;
  listingTitle: string;
  listingImages: string[] | null;
  sellerId: number;
  sellerName: string | null;
};

const STATUS_ICON: Record<string, typeof Clock> = {
  pending:        Clock,
  ready_to_ship:  Package,
  shipped:        Truck,
  delivered:      CheckCircle2,
  completed:      ShieldCheck,
  cancelled:      XCircle,
};

const STATUS_COLOR: Record<string, string> = {
  pending:       "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800",
  ready_to_ship: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  shipped:       "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  delivered:     "bg-teal-100 text-teal-800 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-800",
  completed:     "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  cancelled:     "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
};

const TRACKING_COLOR: Record<string, string> = {
  in_transit:       "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  out_for_delivery: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/20 dark:text-violet-300 dark:border-violet-800",
  delivered:        "bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800",
};

export default function Orders() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  // Inline confirm: holds the order id awaiting tap-to-confirm
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const statusLabel = (key: string) => {
    const map: Record<string, string> = {
      pending:       t("orders.statusPending"),
      ready_to_ship: t("orders.statusReadyToShip"),
      shipped:       t("orders.statusShipped"),
      delivered:     t("orders.statusDelivered"),
      completed:     t("orders.statusCompleted"),
      cancelled:     "Kansele",
    };
    return map[key] ?? key;
  };

  const handleCancelClick = (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    // First tap → show confirm row; if already confirming same order → execute
    if (confirmingId === orderId) {
      doCancel(orderId);
    } else {
      setConfirmingId(orderId);
    }
  };

  const doCancel = async (orderId: number) => {
    setConfirmingId(null);
    setCancellingId(orderId);
    try {
      const res = await fetch(`/api/transactions/${orderId}/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data?.error ?? "Erè kanselasyon", variant: "destructive" });
        return;
      }
      toast({
        title: "Kòmand kansele",
        description: data.walletRefunded
          ? `$${(data.refundAmount as number).toFixed(2)} retounen nan pòtfèy ou.`
          : "Kontakte sipò pou rembosman ou.",
      });
      setOrders(prev =>
        prev?.map(o => o.id === orderId ? { ...o, orderStatus: "cancelled" } : o) ?? null
      );
    } catch {
      toast({ title: "Erè koneksyon", variant: "destructive" });
    } finally {
      setCancellingId(null);
    }
  };

  const trackLabel = (key: string) => {
    const map: Record<string, string> = {
      in_transit:       t("orders.trackInTransit"),
      out_for_delivery: t("orders.trackOutForDelivery"),
      delivered:        t("orders.trackDelivered"),
    };
    return map[key] ?? key;
  };

  useEffect(() => {
    if (!user) { setLocation("/auth/login"); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/orders/purchases", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        if (cancelled) return;
        if (!res.ok) { setError((data as any)?.error || t("orders.loading")); return; }
        setOrders(data as Order[]);
      } catch { if (!cancelled) setError(t("orders.loading")); }
    })();
    return () => { cancelled = true; };
  }, [user, token, setLocation, t]);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => history.back()} className="mb-4 -ml-2" data-testid="button-back">
        <ChevronLeft className="h-4 w-4 mr-1" /> {t("orders.back")}
      </Button>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <ShoppingBag className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold">{t("orders.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("orders.subtitle")}</p>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
          {error}
        </div>
      )}
      {orders === null && !error && (
        <div className="text-center text-muted-foreground py-12">{t("orders.loading")}</div>
      )}
      {orders && orders.length === 0 && (
        <div className="text-center py-16 border-2 border-dashed border-border rounded-2xl">
          <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">{t("orders.noOrdersTitle")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("orders.noOrdersDesc")}</p>
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map(o => {
            const img = o.listingImages?.[0] ?? `https://placehold.co/120x120/f97316/white?text=Item`;
            const StatusIcon = STATUS_ICON[o.orderStatus] ?? STATUS_ICON.ready_to_ship!;
            const statusColor = STATUS_COLOR[o.orderStatus] ?? STATUS_COLOR.ready_to_ship!;
            const trackColor = o.trackingStatus ? TRACKING_COLOR[o.trackingStatus] : null;
            const canCancel = ["pending", "ready_to_ship"].includes(o.orderStatus);
            const isConfirming = confirmingId === o.id;
            const isCancelling = cancellingId === o.id;

            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                <div
                  className="flex items-center gap-4 p-4 hover-elevate cursor-pointer"
                  onClick={() => { setConfirmingId(null); setLocation(`/orders/${o.id}`); }}
                  data-testid={`order-row-${o.id}`}
                >
                  <img
                    src={img} alt=""
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/120x120/f97316/white?text=Item"; }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">
                        #BZH-{String(o.id).padStart(6, "0")}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border",
                        statusColor,
                      )}>
                        <StatusIcon className="h-3 w-3" /> {statusLabel(o.orderStatus)}
                      </span>
                      {trackColor && o.trackingStatus && (
                        <span className={cn(
                          "inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border",
                          trackColor,
                        )}>
                          {trackLabel(o.trackingStatus)}
                        </span>
                      )}
                      {o.listingCountry === "Haiti" && (
                        <span className="text-xs text-muted-foreground">🇭🇹</span>
                      )}
                    </div>
                    <p className="font-semibold truncate mt-0.5">{o.listingTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("orders.from", { seller: o.sellerName ?? "Seller" })} · {new Date(o.createdAt).toLocaleDateString()}
                    </p>
                    {o.carrier && o.trackingNumber && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">
                        {o.carrier}: {o.trackingNumber}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="font-extrabold text-primary">${o.amount.toFixed(2)}</span>
                    {o.escrowReleased && (
                      <span className="text-xs text-green-400 font-semibold flex items-center gap-0.5">
                        <ShieldCheck className="h-3 w-3" /> {t("orders.fundsReleased")}
                      </span>
                    )}
                    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setConfirmingId(null); setLocation(`/orders/${o.id}`); }}>
                      <Eye className="h-4 w-4 mr-1.5" /> {t("orders.view")}
                    </Button>
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={cn(
                          "text-xs transition-all",
                          isConfirming
                            ? "border-red-500 bg-red-500 text-white hover:bg-red-600 dark:border-red-500 dark:bg-red-500 dark:hover:bg-red-600"
                            : "border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/20",
                        )}
                        onClick={e => handleCancelClick(o.id, e)}
                        disabled={isCancelling}
                        data-testid={`button-cancel-order-${o.id}`}
                      >
                        {isCancelling
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : isConfirming
                            ? <><AlertTriangle className="h-3 w-3 mr-1" />Konfime?</>
                            : <><XCircle className="h-3 w-3 mr-1" />Kansele</>
                        }
                      </Button>
                    )}
                  </div>
                </div>

                {/* Inline confirm strip — appears below the card row when confirming */}
                {isConfirming && (
                  <div
                    className="flex items-center justify-between gap-3 px-4 py-3 bg-red-50 dark:bg-red-950/30 border-t border-red-200 dark:border-red-900"
                    onClick={e => e.stopPropagation()}
                  >
                    <p className="text-sm text-red-700 dark:text-red-300 font-medium flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      Ou sèten ou vle kansele kòmand sa?
                    </p>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-8"
                        onClick={e => { e.stopPropagation(); setConfirmingId(null); }}
                      >
                        Non
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs h-8 bg-red-600 hover:bg-red-700 text-white border-0"
                        onClick={e => { e.stopPropagation(); doCancel(o.id); }}
                        data-testid={`button-confirm-cancel-${o.id}`}
                      >
                        Wi, kansele
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
