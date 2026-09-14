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
  deliveryStatus: string | null;
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
        <div className="space-y-4">
          {filteredOrders.map(o => {
            const img = o.listingImages?.[0] ?? null;
            const carrierUrl = o.carrier && o.trackingNumber
              ? getCarrierUrl(o.carrier, o.trackingNumber)
              : null;
            const canCancel = o.deliveryStatus !== null
              ? o.deliveryStatus === "waiting"
              : ["pending", "ready_to_ship"].includes(o.orderStatus);
            const isConfirming = confirmingId === o.id;
            const isCancelling = cancellingId === o.id;

            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow group">
                <div
                  className="flex flex-col md:flex-row md:items-center gap-4 p-5 cursor-pointer"
                  onClick={() => { setConfirmingId(null); setLocation(`/orders/${o.id}`); }}
                  data-testid={`order-row-${o.id}`}
                >
                  <div className="flex gap-4 items-start md:items-center flex-1 min-w-0">
                    {img ? (
                      <img
                        src={img} alt=""
                        loading="lazy"
                        className="w-20 h-20 rounded-xl object-cover border border-border/50 flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' rx='12' fill='%23f3f4f6'/%3E%3C/svg%3E"; }}
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-xl flex-shrink-0 bg-muted/50 border border-border/50 flex items-center justify-center">
                        <ShoppingBag className="h-8 w-8 text-muted-foreground/30" />
                      </div>
                    )}
                    
                    <div className="flex-1 min-w-0 py-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-mono text-[11px] font-bold tracking-wider text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                          #{String(o.id).padStart(6, "0")}
                        </span>
                        <FulfillmentBadge status={o.orderStatus} type="order" />
                        {o.trackingStatus && (
                          <FulfillmentBadge status={o.trackingStatus} type="tracking" />
                        )}
                        {o.listingCountry === "Haiti" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800">
                            Local: HT
                          </span>
                        )}
                        {o.listingCountry === "Dominican Republic" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full dark:bg-indigo-900/30 dark:text-indigo-400 dark:border-indigo-800">
                            Local: DR
                          </span>
                        )}
                      </div>
                      
                      <p className="font-bold text-foreground truncate text-base mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {o.listingTitle}
                      </p>
                      
                      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground flex-wrap">
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
                    </div>
                  </div>
                  
                  <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-3 md:w-32 border-t md:border-t-0 pt-4 md:pt-0 mt-2 md:mt-0">
                    <div className="flex flex-col items-start md:items-end">
                      <span className="font-black text-lg text-foreground">${o.amount.toFixed(2)}</span>
                      {o.escrowReleased && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-1">
                          <CheckCircle2 className="h-3 w-3" /> Settled
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {canCancel ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className={cn(
                            "h-9 w-9 rounded-xl transition-all",
                            isConfirming
                              ? "bg-rose-500 text-white hover:bg-rose-600 dark:bg-rose-600"
                              : "text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                          )}
                          onClick={e => handleCancelClick(o.id, e)}
                          disabled={isCancelling}
                          title="Cancel Order"
                        >
                          {isCancelling
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : isConfirming
                              ? <AlertTriangle className="h-4 w-4" />
                              : <XCircle className="h-4 w-4" />
                          }
                        </Button>
                      ) : null}
                      
                      <Button size="icon" variant="secondary" className="h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 transition-colors" onClick={e => { e.stopPropagation(); setConfirmingId(null); setLocation(`/orders/${o.id}`); }}>
                        <Eye className="h-4 w-4" />
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
                      <span>Cancel order? <strong className="font-black">${o.amount.toFixed(2)}</strong> will be refunded to your wallet.</span>
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