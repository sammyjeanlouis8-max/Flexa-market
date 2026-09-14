import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Printer, Package, ChevronLeft, MapPin, Eye, DollarSign, Sparkles, TrendingDown, TrendingUp, Search, Clock, Truck, Phone, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { FulfillmentBadge, getCarrierUrl } from "@/components/FulfillmentShared";

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
  deliveryId: number | null;
  driverName: string | null;
  driverPhone: string | null;
  deliveryStatus: string | null;
};

type Summary = {
  orderCount: number;
  totalSales: number;
  totalCommission: number;
  netEarnings: number;
  promoActive: boolean;
  promoDaysRemaining: number;
};

export default function Sales() {
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const [sales, setSales] = useState<Sale[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<string>("all");

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

  const filteredSales = useMemo(() => {
    if (!sales) return null;
    let result = sales;
    
    if (filter === "needs_action") {
      result = result.filter(s => s.orderStatus === "ready_to_ship");
    } else if (filter !== "all") {
      result = result.filter(s => s.orderStatus === filter);
    }
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => 
        String(s.id).includes(q) || 
        s.listingTitle?.toLowerCase().includes(q) ||
        s.buyerName?.toLowerCase().includes(q) ||
        s.shippingName?.toLowerCase().includes(q) ||
        s.trackingNumber?.toLowerCase().includes(q)
      );
    }
    
    // Sort needs_action (ready_to_ship) to top if we're looking at all
    if (filter === "all") {
      result = [...result].sort((a, b) => {
        if (a.orderStatus === "ready_to_ship" && b.orderStatus !== "ready_to_ship") return -1;
        if (a.orderStatus !== "ready_to_ship" && b.orderStatus === "ready_to_ship") return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }
    
    return result;
  }, [sales, searchQuery, filter]);

  const needsActionCount = useMemo(() => {
    if (!sales) return 0;
    return sales.filter(s => s.orderStatus === "ready_to_ship").length;
  }, [sales]);

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Button variant="ghost" size="sm" onClick={() => history.back()} className="mb-4 -ml-2 text-muted-foreground hover:text-foreground transition-colors" data-testid="button-back">
        <ChevronLeft className="h-4 w-4 mr-1" /> {t("sales.back")}
      </Button>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/50 flex items-center justify-center shrink-0">
            <Package className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-foreground">{t("sales.title")}</h1>
            <p className="text-sm font-medium text-muted-foreground">{t("sales.subtitle")}</p>
          </div>
        </div>
      </div>

      {summary && (
        <div className="mb-8">
          {summary.promoActive && (
            <div className="mb-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm font-medium flex items-center gap-2 text-emerald-800 dark:text-emerald-300">
              <Sparkles className="h-5 w-5 text-emerald-500 shrink-0" />
              <span>
                {summary.promoDaysRemaining === 1
                  ? t("sales.promoActive", { days: summary.promoDaysRemaining })
                  : t("sales.promoActivePlural", { days: summary.promoDaysRemaining })}
              </span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3 md:gap-4">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                <DollarSign className="h-4 w-4" /> {t("sales.totalSales")}
              </div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-foreground">
                ${summary.totalSales.toFixed(2)}
              </div>
              <div className="text-[11px] font-semibold text-muted-foreground mt-1">
                {summary.orderCount === 1
                  ? t("sales.orderCount_one", { count: summary.orderCount })
                  : t("sales.orderCount_other", { count: summary.orderCount })}
              </div>
            </div>
            
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                <TrendingDown className="h-4 w-4 text-rose-500" /> {t("sales.commission")}
              </div>
              <div className="text-xl md:text-2xl font-black tracking-tight text-rose-600 dark:text-rose-400">
                −${summary.totalCommission.toFixed(2)}
              </div>
            </div>
            
            <div className="rounded-2xl border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-900/10 p-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 mb-2 relative z-10">
                <TrendingUp className="h-4 w-4" /> {t("sales.netEarnings")}
              </div>
              <div className="text-2xl md:text-3xl font-black tracking-tight text-emerald-700 dark:text-emerald-400 relative z-10">
                ${summary.netEarnings.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}

      {sales && sales.length > 0 && (
        <div className="flex flex-col md:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by buyer, order ID, or title..."
              className="pl-9 h-10 bg-card border-border shadow-sm font-medium"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar shrink-0">
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "px-4 h-10 rounded-lg text-sm font-bold transition-all whitespace-nowrap border shrink-0",
                filter === "all" 
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground"
              )}
            >
              All Sales
            </button>
            <button
              onClick={() => setFilter("needs_action")}
              className={cn(
                "px-4 h-10 rounded-lg text-sm font-bold transition-all whitespace-nowrap border shrink-0 flex items-center gap-2",
                filter === "needs_action" 
                  ? "bg-rose-600 text-white border-rose-600 shadow-sm"
                  : needsActionCount > 0
                    ? "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900"
                    : "bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground"
              )}
            >
              Needs Shipping
              {needsActionCount > 0 && (
                <span className={cn(
                  "flex items-center justify-center h-5 min-w-5 px-1 rounded-full text-[10px]",
                  filter === "needs_action" ? "bg-white text-rose-700" : "bg-rose-600 text-white"
                )}>
                  {needsActionCount}
                </span>
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 mb-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">{error}</div>
      )}

      {sales === null && !error && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Clock className="h-8 w-8 animate-spin-slow mb-4 text-emerald-500 opacity-80" />
          <p className="font-bold tracking-wide uppercase text-xs">Loading Sales Queue</p>
        </div>
      )}

      {sales && sales.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-3xl bg-card/50">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <p className="font-black text-lg text-foreground">{t("sales.noSalesTitle")}</p>
          <p className="text-sm font-medium text-muted-foreground mt-1 max-w-md mx-auto">{t("sales.noSalesDesc")}</p>
        </div>
      )}

      {filteredSales && filteredSales.length > 0 && (
        <div className="space-y-4">
          {filteredSales.map(s => {
            const img = s.listingImages?.[0] ?? null;
            const needsAction = s.orderStatus === "ready_to_ship";
            const carrierUrl = s.carrier && s.trackingNumber
              ? getCarrierUrl(s.carrier, s.trackingNumber)
              : null;

            return (
              <div
                key={s.id}
                className={cn(
                  "p-5 rounded-2xl border bg-card flex flex-col md:flex-row md:items-center gap-5 transition-shadow",
                  needsAction ? "border-rose-200 dark:border-rose-900/50 shadow-[0_4px_12px_-4px_rgba(225,29,72,0.15)]" : "border-border shadow-sm hover:shadow-md"
                )}
              >
                <div className="flex gap-4 items-start md:items-center flex-1 min-w-0">
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      className="w-20 h-20 rounded-xl object-cover border border-border/50 flex-shrink-0"
                      onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' rx='12' fill='%23f3f4f6'/%3E%3C/svg%3E"; }}
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-xl flex-shrink-0 bg-muted/50 border border-border/50 flex items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0 py-1">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="font-mono text-[11px] font-bold tracking-wider text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                        #{String(s.id).padStart(6, "0")}
                      </span>
                      <FulfillmentBadge status={s.orderStatus} type="order" />
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                        {s.paymentMethod}
                      </span>
                      {needsAction && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800 animate-pulse">
                          <AlertCircle className="h-3 w-3" /> Ship Now
                        </span>
                      )}
                    </div>
                    
                    <p className="font-bold text-foreground truncate text-base mb-1.5">
                      {s.listingTitle}
                    </p>
                    
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground flex-wrap">
                        <span className="text-foreground font-semibold">{s.shippingName ?? s.buyerName ?? "Buyer"}</span>
                        {(s.shippingCity || s.shippingRegion) && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-border"></span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5 shrink-0" />
                              {[s.shippingCity, s.shippingRegion].filter(Boolean).join(", ")}
                            </span>
                          </>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-3 text-xs font-medium text-muted-foreground flex-wrap">
                        <span>{new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        {s.trackingNumber && (
                          <>
                            <span className="w-1 h-1 rounded-full bg-border"></span>
                            {carrierUrl ? (
                              <a
                                href={carrierUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-mono bg-muted/50 px-1.5 rounded text-primary hover:underline"
                              >
                                {s.carrier}: {s.trackingNumber}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : (
                              <span className="font-mono bg-muted/50 px-1.5 rounded">{s.carrier}: {s.trackingNumber}</span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {s.driverName && s.driverPhone && (
                      <a
                        href={`tel:${s.driverPhone}`}
                        className="inline-flex items-center gap-1.5 mt-2.5 text-[11px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors border border-emerald-200/50 dark:border-emerald-800"
                        onClick={e => e.stopPropagation()}
                      >
                        <Truck className="h-3.5 w-3.5" />
                        Driver: {s.driverName}
                        <span className="text-emerald-300 dark:text-emerald-700">|</span>
                        <Phone className="h-3 w-3" />
                        {s.driverPhone}
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-stretch md:items-end gap-3 flex-shrink-0 md:w-48 border-t md:border-t-0 pt-4 md:pt-0 mt-2 md:mt-0">
                  <div className="flex flex-row md:flex-col justify-between md:justify-start items-center md:items-end">
                    <div className="text-[11px] font-bold text-muted-foreground line-through decoration-muted-foreground/50">${s.amount.toFixed(2)} total</div>
                    <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">
                      ${(s.sellerEarnings ?? s.amount).toFixed(2)}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 w-full mt-2">
                    {needsAction ? (
                      <Button
                        size="sm"
                        className="w-full font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-colors group"
                        onClick={() => setLocation(`/orders/${s.id}`)}
                      >
                        <Truck className="h-4 w-4 mr-1.5 group-hover:translate-x-0.5 transition-transform" /> {t("sales.shipOrder")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400"
                        onClick={() => setLocation(`/orders/${s.id}`)}
                      >
                        <Eye className="h-4 w-4 mr-1.5" /> Manage Order
                      </Button>
                    )}
                    
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full font-bold border-border/80"
                      onClick={() => setLocation(`/orders/${s.id}/label`)}
                    >
                      <Printer className="h-4 w-4 mr-1.5 text-muted-foreground" /> Print Label
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      
      {filteredSales && filteredSales.length === 0 && sales && sales.length > 0 && (
        <div className="text-center py-16">
          <p className="font-bold text-muted-foreground">No sales match your filters.</p>
          <Button variant="link" onClick={() => {setSearchQuery(""); setFilter("all");}} className="mt-2 text-indigo-600">Clear filters</Button>
        </div>
      )}
    </div>
  );
}