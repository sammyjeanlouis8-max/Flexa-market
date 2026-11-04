import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { ShoppingBag, ChevronLeft, Eye, XCircle, Loader2, CheckCircle2, AlertTriangle, Download, Search, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { FulfillmentBadge, getCarrierUrl } from "@/components/FulfillmentShared";

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

const statusLabel = (status: string | null | undefined, kind: "order" | "payment" | "shipping") => {
  const labels: Record<string, string> = {
    pending: "Pending", ready_to_ship: "Confirmed", confirmed: "Confirmed",
    processing: "Processing", shipped: "Shipped", delivered: "Delivered",
    completed: "Completed", cancelled: "Cancelled", failed: "Failed",
    completed_payment: "Paid", paid: "Paid", refunded: "Refunded",
    partially_refunded: "Partially refunded", not_shipped: "Not shipped",
    label_created: "Label created", in_transit: "In transit",
    out_for_delivery: "Out for delivery", exception: "Exception",
    returned: "Returned", waiting: "Awaiting driver", assigned: "Driver assigned",
  };
  if (kind === "payment" && status === "completed") return "Paid";
  if (kind === "shipping" && !status) return "Not shipped";
  return labels[status ?? ""] ?? (status ? status.replace(/_/g, " ") : "Unavailable");
};

export default function Orders() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const downloadCSV = () => {
    if (!orders || orders.length === 0) return;
    const header = ["ID", "Title", "Seller", "Amount", "Currency", "Status", "Country", "Date", "Tracking"].join(",");
    const rows = orders.map(o => [
      `#BZH-${String(o.id).padStart(6, "0")}`,
      `"${(o.listingTitle ?? "").replace(/"/g, '""')}"`,
      `"${(o.sellerName ?? "").replace(/"/g, '""')}"`,
      o.amount.toFixed(2),
      o.currency,
      o.orderStatus,
      o.listingCountry ?? "",
      new Date(o.createdAt).toLocaleDateString(),
      o.trackingNumber ?? "",
    ].join(","));
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCancelClick = (orderId: number, e: React.MouseEvent) => {
    e.stopPropagation();
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
          : data.refundMethod === "stripe_card" ? t("cardCancellation.requested")
          : "Kontakte sipò pou rembosman ou.",
      });
      setOrders(prev =>
        prev?.map(o => o.id === orderId ? { ...o, orderStatus: "cancelled", cardRefundStatus: data.refundStatus ?? null } : o) ?? null
      );
    } catch {
      toast({ title: "Erè koneksyon", variant: "destructive" });
    } finally {
      setCancellingId(null);
    }
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

  const filteredOrders = useMemo(() => {
    if (!orders) return null;
    let result = orders;
    
    if (statusFilter !== "all") {
      result = result.filter(o => o.orderStatus === statusFilter);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(o => 
        String(o.id).includes(q) || 
        o.listingTitle?.toLowerCase().includes(q) ||
        o.sellerName?.toLowerCase().includes(q) ||
        o.trackingNumber?.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [orders, searchQuery, statusFilter]);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => history.back()} className="mb-4 -ml-2 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back">
        <ChevronLeft className="h-4 w-4 mr-1" /> {t("orders.back")}
      </Button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/50 flex items-center justify-center shrink-0">
            <ShoppingBag className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">{t("orders.title")}</h1>
            <p className="text-sm font-medium text-muted-foreground">{t("orders.subtitle")}</p>
          </div>
        </div>
        {orders && orders.length > 0 && (
          <Button variant="outline" size="sm" onClick={downloadCSV} className="gap-1.5 font-bold shadow-sm self-start md:self-auto">
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        )}
      </div>

      {orders && orders.length > 0 && (
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order ID, title, or tracking..."
              className="pl-9 h-10 bg-card border-border shadow-sm font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar shrink-0">
            {["all", "pending", "ready_to_ship", "shipped", "delivered"].map(status => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "px-4 h-10 rounded-lg text-sm font-bold transition-all whitespace-nowrap border shrink-0",
                  statusFilter === status 
                    ? "bg-foreground text-background border-foreground shadow-sm"
                    : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground"
                )}
              >
                {status === "all" ? "All Orders" : status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 mb-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" /> {error}
        </div>
      )}
      
      {orders === null && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-4 text-indigo-500" />
          <p className="font-bold tracking-wide uppercase text-xs">Loading Orders</p>
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
        <div className="space-y-2.5">
          {filteredOrders.map(o => {
            const img = o.listingImages?.[0] ?? null;
            const carrierUrl = o.carrier && o.trackingNumber
              ? getCarrierUrl(o.carrier, o.trackingNumber)
              : null;
            const canCancel = o.paymentMethod === "stripe"
              ? o.paymentStatus === "completed" && !o.escrowReleased && !o.shippedAt &&
                ["pending", "ready_to_ship"].includes(o.orderStatus) &&
                (!o.deliveryStatus || ["waiting", "assigned", "accepted", "driver_assigned"].includes(o.deliveryStatus)) &&
                (!o.trackingStatus || ["label_created", "pending", "pre_transit", "not_shipped", "unknown"].includes(o.trackingStatus))
              : o.deliveryStatus !== null
              ? o.deliveryStatus === "waiting"
              : ["pending", "ready_to_ship"].includes(o.orderStatus);
            const isConfirming = confirmingId === o.id;
            const isCancelling = cancellingId === o.id;
            const shipStatus = o.shipmentId
              ? (o.trackingStatus ?? (o.deliveryStatus === "delivered" ? "delivered" : null))
              : (o.deliveryStatus ?? null);

            return (
              <div key={o.id} className="rounded-xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div
                  className="flex flex-col md:flex-row md:items-center gap-3 p-3.5 cursor-pointer"
                  onClick={() => { setConfirmingId(null); setLocation(`/orders/${o.id}`); }}
                  data-testid={`order-row-${o.id}`}
                >
                  <div className="flex gap-3 items-start md:items-center flex-1 min-w-0">
                    {img ? (
                      <img
                        src={img} alt=""
                        loading="lazy"
                        className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover border border-border/50 flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' rx='12' fill='%23f3f4f6'/%3E%3C/svg%3E"; }}
                      />
                    ) : (
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg flex-shrink-0 bg-muted/50 border border-border/50 flex items-center justify-center">
                        <ShoppingBag className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="font-mono text-[10px] font-bold tracking-wider text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">
                          #{String(o.id).padStart(6, "0")}
                        </span>
                        <FulfillmentBadge status={o.orderStatus} type="order" />
                        {o.shipmentId && o.trackingStatus && (
                          <FulfillmentBadge status={o.trackingStatus} type="tracking" />
                        )}
                        {(o.listingCountry === "Haiti" || o.listingCountry === "Dominican Republic") && (
                          <span className="inline-flex items-center text-[9px] font-bold uppercase tracking-wider text-orange-800 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded dark:bg-orange-950/30 dark:text-orange-300 dark:border-orange-800">
                            {o.listingCountry === "Haiti" ? "HT" : "DR"}
                          </span>
                        )}
                      </div>
                      
                      <p className="font-bold text-foreground truncate text-[13px] sm:text-sm mb-0.5 group-hover:text-primary transition-colors">
                        {o.listingTitle}
                      </p>
                      
                      <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground flex-wrap">
                        <span>{t("orders.from", { seller: o.sellerName ?? "Seller" })}</span>
                        <span className="w-1 h-1 rounded-full bg-border"></span>
                        <span>{new Date(o.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        
                        {o.carrier && o.trackingNumber && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-border"></span>
                            {carrierUrl ? (
                              <a
                                href={carrierUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center gap-1 font-mono bg-muted/50 px-1.5 rounded text-primary hover:underline"
                              >
                                {o.carrier}: {o.trackingNumber}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="font-mono bg-muted/50 px-1.5 rounded">{o.carrier}: {o.trackingNumber}</span>
                            )}
                          </>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span><strong className="text-foreground font-semibold">Order:</strong> {statusLabel(o.orderStatus, "order")}</span>
                        <span><strong className="text-foreground font-semibold">Payment:</strong> {statusLabel(o.paymentStatus, "payment")}</span>
                        <span><strong className="text-foreground font-semibold">Shipping:</strong> {statusLabel(shipStatus, "shipping")}</span>
                      </div>
                      {o.estimatedDelivery && <p className="text-[11px] text-muted-foreground mt-0.5">Est. delivery: {new Date(o.estimatedDelivery).toLocaleDateString()}</p>}
                      {o.cardRefundStatus && <p className="mt-1 text-xs font-semibold">{t(`cardCancellation.${o.cardRefundStatus}`)}</p>}
                    </div>
                  </div>
                  
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-2 md:w-36 border-t md:border-t-0 pt-3 md:pt-0 mt-1 md:mt-0">
                    <div className="flex flex-col items-start md:items-end">
                      <span className="font-black text-base tabular-nums text-foreground">${o.amount.toFixed(2)}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{o.paymentMethod === "stripe" ? "Card" : o.paymentMethod ?? "Payment"}</span>
                      {o.escrowReleased && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                          <CheckCircle2 className="h-3 w-3" /> Funds released
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1.5">
                      {canCancel ? (
                        <Button
                          size="sm"
                          variant={isConfirming ? "destructive" : "outline"}
                          className="h-9 px-2.5 rounded-lg text-xs font-bold gap-1"
                          onClick={e => handleCancelClick(o.id, e)}
                          disabled={isCancelling}
                          title="Cancel order"
                          data-testid={`button-cancel-order-${o.id}`}
                        >
                          {isCancelling
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : isConfirming
                              ? <><AlertTriangle className="h-3.5 w-3.5" /> Confirm</>
                              : <><XCircle className="h-3.5 w-3.5" /> Cancel</>
                          }
                        </Button>
                      ) : null}
                      
                      <Button size="sm" variant="secondary" className="h-9 rounded-lg gap-1.5 text-xs font-bold" onClick={e => { e.stopPropagation(); setConfirmingId(null); setLocation(`/orders/${o.id}`); }} data-testid={`button-view-order-${o.id}`}>
                        <Eye className="h-3.5 w-3.5" /> {o.trackingNumber ? "Track" : "View"}
                      </Button>
                    </div>
                  </div>
                </div>

                {isConfirming && (
                  <div
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-rose-50 dark:bg-rose-950/20 border-t border-rose-100 dark:border-rose-900/50 animate-in slide-in-from-top-2"
                    onClick={e => e.stopPropagation()}
                  >
                    <p className="text-sm font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 shrink-0 text-rose-500" />
                      <span>{o.paymentMethod === "stripe" ? t("cardCancellation.confirm")
                        : o.paymentMethod === "wallet" ? <>Cancel order? <strong className="font-black">${o.amount.toFixed(2)}</strong> will be refunded to your wallet.</>
                        : "Anile kòmand sa a? Kontakte sipò pou ranbousman sou mwayen peman orijinal la."}</span>
                    </p>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="font-bold border-rose-200 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900"
                        onClick={e => { e.stopPropagation(); setConfirmingId(null); }}
                      >
                        Keep Order
                      </Button>
                      <Button
                        size="sm"
                        className="font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm"
                        onClick={e => { e.stopPropagation(); doCancel(o.id); }}
                      >
                        Confirm Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      
      {filteredOrders && filteredOrders.length === 0 && orders && orders.length > 0 && (
        <div className="text-center py-16">
          <p className="font-bold text-muted-foreground">No orders match your search.</p>
          <Button variant="link" onClick={() => {setSearchQuery(""); setStatusFilter("all");}} className="mt-2 text-indigo-600">Clear filters</Button>
        </div>
      )}
    </div>
  );
}