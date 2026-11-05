import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ChevronRight, Loader2, ShoppingBag, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import OrderStatusBadge from "@/components/orders/OrderStatusBadge";
import {
  FLEXA_BRAND,
  ORDER_FILTERS,
  matchesOrderFilter,
  orderRef,
  type OrderFilterKey,
} from "@/lib/orderTrackingUi";

type Order = {
  id: number;
  amount: number;
  currency: string;
  paymentStatus: string;
  paymentMethod: string;
  cardRefundStatus?: string | null;
  orderStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
  trackingStatus: string | null;
  shipmentId: number | null;
  estimatedDelivery: string | null;
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
  deliveryStatus: string | null;
};

function filterLabelKey(filter: OrderFilterKey): string {
  return `orderTracking.filter.${filter}`;
}

export default function Orders() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();

  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderFilterKey>("all");

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
        toast({ title: data?.error ?? t("orders.cancelError", { defaultValue: "Cancel failed" }), variant: "destructive" });
        return;
      }
      toast({
        title: t("orders.cancelledTitle", { defaultValue: "Order cancelled" }),
        description: data.walletRefunded
          ? t("orders.walletRefunded", { amount: (data.refundAmount as number).toFixed(2), defaultValue: `$${(data.refundAmount as number).toFixed(2)} returned to your wallet.` })
          : data.refundMethod === "stripe_card"
            ? t("cardCancellation.requested")
            : t("orders.contactSupportRefund", { defaultValue: "Contact support for your refund." }),
      });
      setOrders((prev) =>
        prev?.map((o) =>
          o.id === orderId ? { ...o, orderStatus: "cancelled", cardRefundStatus: data.refundStatus ?? null } : o,
        ) ?? null,
      );
    } catch {
      toast({ title: t("orders.connectionError", { defaultValue: "Connection error" }), variant: "destructive" });
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    if (!user) {
      setLocation("/auth/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/orders/purchases", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => []);
        if (cancelled) return;
        if (!res.ok) {
          setError((data as any)?.error || t("orders.loading"));
          return;
        }
        setOrders(data as Order[]);
      } catch {
        if (!cancelled) setError(t("orders.loading"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, token, setLocation, t]);

  const filteredOrders = useMemo(() => {
    if (!orders) return null;
    return orders.filter((o) =>
      matchesOrderFilter(statusFilter, {
        orderStatus: o.orderStatus,
        deliveryStatus: o.deliveryStatus,
        trackingStatus: o.trackingStatus,
      }),
    );
  }, [orders, statusFilter]);

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-5 pb-24" data-testid="orders-page">
      <h1 className="text-2xl font-black tracking-tight text-foreground mb-4">
        {t("orderTracking.myOrders", { defaultValue: "My Orders" })}
      </h1>

      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none" data-testid="orders-filters">
        {ORDER_FILTERS.map((filter) => {
          const active = statusFilter === filter;
          return (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm font-bold border transition-colors",
                active ? "text-white border-transparent" : "bg-card text-foreground border-border hover:bg-muted/60",
              )}
              style={active ? { background: FLEXA_BRAND.header } : undefined}
              data-testid={`orders-filter-${filter}`}
            >
              {t(filterLabelKey(filter), {
                defaultValue:
                  filter === "all"
                    ? "All"
                    : filter === "processing"
                      ? "Processing"
                      : filter === "shipped"
                        ? "Shipped"
                        : "Delivered",
              })}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-4 mb-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}

      {orders === null && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4" style={{ color: FLEXA_BRAND.success }} />
          <p className="font-bold tracking-wide uppercase text-xs">{t("orders.loading")}</p>
        </div>
      )}

      {orders && orders.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-3xl bg-card/50">
          <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <p className="font-black text-lg text-foreground">{t("orders.noOrdersTitle")}</p>
          <p className="text-sm font-medium text-muted-foreground mt-1 max-w-md mx-auto">{t("orders.noOrdersDesc")}</p>
        </div>
      )}

      {filteredOrders && filteredOrders.length > 0 && (
        <div className="space-y-3">
          {filteredOrders.map((o) => {
            const img = o.listingImages?.[0] ?? null;
            const canCancel =
              o.paymentMethod === "stripe"
                ? o.paymentStatus === "completed" &&
                  !o.escrowReleased &&
                  !o.shippedAt &&
                  ["pending", "ready_to_ship"].includes(o.orderStatus)
                : ["pending", "ready_to_ship"].includes(o.orderStatus) &&
                  (!o.deliveryStatus || o.deliveryStatus === "waiting");
            const isConfirming = confirmingId === o.id;
            const isCancelling = cancellingId === o.id;
            const dateLine =
              o.deliveredAt || ["delivered", "completed"].includes(o.orderStatus)
                ? t("orderTracking.deliveredOn", {
                    date: new Date(o.deliveredAt ?? o.createdAt).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    }),
                    defaultValue: `Delivered: ${new Date(o.deliveredAt ?? o.createdAt).toLocaleDateString()}`,
                  })
                : o.estimatedDelivery
                  ? t("orderTracking.estimatedDelivery", {
                      date: new Date(o.estimatedDelivery).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                      }),
                      defaultValue: `Estimated delivery: ${new Date(o.estimatedDelivery).toLocaleDateString()}`,
                    })
                  : o.shippedAt
                    ? t("orderTracking.shippedOn", {
                        date: new Date(o.shippedAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        }),
                        defaultValue: `Shipped: ${new Date(o.shippedAt).toLocaleDateString()}`,
                      })
                    : t("orderTracking.estimatedShip", {
                        date: new Date(o.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "short",
                        }),
                        defaultValue: `Placed: ${new Date(o.createdAt).toLocaleDateString()}`,
                      });

            return (
              <div
                key={o.id}
                className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
                data-testid={`order-card-${o.id}`}
              >
                <button
                  type="button"
                  className="w-full text-left flex items-center gap-3 p-3.5 active:bg-muted/40"
                  onClick={() => {
                    setConfirmingId(null);
                    setLocation(`/orders/${o.id}`);
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      className="h-16 w-16 rounded-xl object-cover border border-border/60 shrink-0"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center shrink-0">
                      <ShoppingBag className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-foreground truncate">{o.listingTitle}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {orderRef(o.id)}
                      <span className="mx-1.5 text-border">·</span>
                      <span className="font-bold text-foreground">${o.amount.toFixed(2)}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <OrderStatusBadge
                        orderStatus={o.orderStatus}
                        deliveryStatus={o.deliveryStatus}
                        trackingStatus={o.trackingStatus}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1.5">{dateLine}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                </button>

                {canCancel && (
                  <div className="px-3.5 pb-3 flex justify-end gap-2 border-t border-border/60 pt-2">
                    <Button
                      size="sm"
                      variant={isConfirming ? "destructive" : "outline"}
                      className="h-8 text-xs font-bold gap-1"
                      disabled={isCancelling}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isConfirming) doCancel(o.id);
                        else setConfirmingId(o.id);
                      }}
                    >
                      {isCancelling ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5" />
                          {isConfirming
                            ? t("orders.confirmCancel", { defaultValue: "Confirm cancel" })
                            : t("orders.cancel", { defaultValue: "Cancel" })}
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredOrders && filteredOrders.length === 0 && orders && orders.length > 0 && (
        <div className="text-center py-16">
          <p className="font-bold text-muted-foreground">
            {t("orderTracking.noFilterMatches", { defaultValue: "No orders match this filter." })}
          </p>
          <Button variant="link" onClick={() => setStatusFilter("all")} className="mt-2" style={{ color: FLEXA_BRAND.success }}>
            {t("orderTracking.clearFilters", { defaultValue: "Show all orders" })}
          </Button>
        </div>
      )}
    </div>
  );
}
