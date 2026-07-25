import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Truck, Copy, CheckCircle2, X, Lock, RefreshCw,
  Phone, User, Package, AlertTriangle, Eye,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:           { label: "Atant",        color: "bg-gray-500" },
  ready_to_ship:     { label: "Prè ekspedye", color: "bg-blue-500" },
  shipped:           { label: "Ekspedye",      color: "bg-amber-500" },
  in_transit:        { label: "En wout",       color: "bg-orange-500" },
  arrived:           { label: "Rive",          color: "bg-cyan-600" },
  delivered:         { label: "Livrezon fèt",  color: "bg-emerald-600" },
  completed:         { label: "Konplèt",       color: "bg-green-700" },
  cancelled:         { label: "Anile",         color: "bg-red-600" },
  return_requested:  { label: "Retou",         color: "bg-purple-600" },
  return_refunded:   { label: "Remboursé",     color: "bg-violet-600" },
};

const DELIVERY_STATUS: Record<string, { label: string; color: string }> = {
  waiting:      { label: "Ap tann chofe", color: "bg-gray-500" },
  accepted:     { label: "Chofe aksepte", color: "bg-blue-500" },
  on_the_way:   { label: "Chofe anvwaye", color: "bg-amber-500" },
  arrived:      { label: "Chofe rive",    color: "bg-cyan-600" },
  delivered:    { label: "Livrezon fèt",  color: "bg-emerald-600" },
  cancelled:    { label: "Anile",         color: "bg-red-600" },
};

const FILTER_OPTIONS = [
  { value: "all",          label: "Tout" },
  { value: "ready_to_ship",label: "Prè ekspedye" },
  { value: "shipped",      label: "Ekspedye" },
  { value: "delivered",    label: "Livrezon fèt" },
  { value: "completed",    label: "Konplèt" },
  { value: "cancelled",    label: "Anile" },
];

const ACTIVE_STATUSES = ["ready_to_ship", "shipped", "in_transit", "arrived"];

export default function AdminOrdersPanel() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<any | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [copiedCode, setCopiedCode] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (filter !== "all") params.set("status", filter);
      if (search.trim()) params.set("search", search.trim());
      const data = await apiFetch<any[]>(`/api/admin/orders-overview?${params}`);
      setOrders(data);
    } catch {
      toast({ title: "Erè", description: "Pa ka chaje oder yo", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filter, search, toast]);

  useEffect(() => { load(); }, [load]);

  const copyCode = (id: number, code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(id);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const doCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await apiFetch(`/api/admin/orders/${cancelTarget.id}/cancel`, { method: "POST" });
      toast({ title: "Oder anile ✓", description: `BZH-${String(cancelTarget.id).padStart(6, "0")} anile` });
      setCancelTarget(null);
      load();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message || "Echèk anilasyon", variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  const activeCount = orders.filter(o => ACTIVE_STATUSES.includes(o.orderStatus)).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Jestyon Oder
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {orders.length} kòmand · {activeCount} aktif
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-1.5">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span className="text-xs">Rafraîchi</span>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="BZH-000025, non achte, tit pwodui..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load()}
            className="pl-9 text-sm"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTER_OPTIONS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Ap chaje...</div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground text-sm">Pa gen oder</div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const statusMeta = STATUS_LABELS[order.orderStatus] ?? { label: order.orderStatus, color: "bg-gray-500" };
            const isExpanded = expanded === order.id;
            const canCancel = !["cancelled", "completed", "return_refunded"].includes(order.orderStatus);
            const deliveryMeta = order.delivery
              ? (DELIVERY_STATUS[order.delivery.status] ?? { label: order.delivery.status, color: "bg-gray-500" })
              : null;
            const hasCode = !!order.delivery?.verificationCode;
            const isHaiti = order.listingCountry === "Haiti" || order.listingCountry === "Dominican Republic";

            return (
              <div
                key={order.id}
                className="rounded-2xl border border-border bg-card overflow-hidden"
              >
                {/* Row header */}
                <div className="flex items-start gap-3 p-4">
                  {/* Status indicator */}
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${statusMeta.color}`} />

                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-foreground">
                        BZH-{String(order.id).padStart(6, "0")}
                      </span>
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 ${statusMeta.color} hover:${statusMeta.color} text-white`}>
                        {statusMeta.label}
                      </Badge>
                      {isHaiti && (
                        <span className="text-[10px] text-muted-foreground">{order.listingCountry}</span>
                      )}
                      {hasCode && ACTIVE_STATUSES.includes(order.orderStatus) && (
                        <Badge className="text-[10px] px-1.5 py-0 h-4 bg-orange-500 hover:bg-orange-500 text-white">
                          Kòd: {order.delivery.verificationCode}
                        </Badge>
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {order.listingTitle ?? "—"} · <span className="font-semibold text-foreground">${order.amount?.toFixed(2)}</span>
                    </p>

                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                      {order.buyer && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {order.buyer.name}
                        </span>
                      )}
                      {order.seller && (
                        <span className="text-muted-foreground/70">→ {order.seller.name}</span>
                      )}
                      <span>{new Date(order.createdAt).toLocaleDateString("fr-FR")}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {canCancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCancelTarget(order)}
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20"
                        title="Anile oder"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(isExpanded ? null : order.id)}
                      className="h-8 w-8 p-0"
                      title="Detay"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/30 p-4 space-y-4">

                    {/* Verification code block */}
                    {isHaiti && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          Kòd Konfirmasyon
                        </p>
                        {hasCode ? (
                          <div className="flex items-center gap-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-200/50 dark:border-orange-800/30 rounded-xl p-3">
                            <div className="flex gap-1.5">
                              {order.delivery.verificationCode.split("").map((d: string, i: number) => (
                                <div
                                  key={i}
                                  className="w-9 h-11 rounded-lg bg-white dark:bg-orange-900/40 border-2 border-orange-300 dark:border-orange-700 flex items-center justify-center font-black text-lg text-orange-700 dark:text-orange-300 shadow-sm"
                                >
                                  {d}
                                </div>
                              ))}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyCode(order.id, order.delivery.verificationCode)}
                              className="ml-auto h-8 px-2 text-orange-600"
                            >
                              {copiedCode === order.id
                                ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                : <Copy className="h-4 w-4" />}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 bg-muted/50 border border-dashed border-muted-foreground/30 rounded-xl p-3">
                            <Lock className="h-4 w-4 text-muted-foreground/60" />
                            <span className="text-xs text-muted-foreground">
                              Kòd poko jenere — vandè poko ekspedye
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Driver info */}
                    {isHaiti && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                          Chofè / Livrezon
                        </p>
                        {order.driverName === "fm_driver" && order.delivery ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-xs">
                              <Truck className="h-3.5 w-3.5 text-primary" />
                              <span className="font-semibold">FM Driver</span>
                              {deliveryMeta && (
                                <Badge className={`text-[9px] px-1.5 py-0 h-3.5 ${deliveryMeta.color} hover:${deliveryMeta.color} text-white`}>
                                  {deliveryMeta.label}
                                </Badge>
                              )}
                            </div>
                            {order.delivery.driverUserName && (
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                {order.delivery.driverUserName}
                                {order.delivery.driverUserPhone && (
                                  <a href={`tel:${order.delivery.driverUserPhone}`} className="text-primary flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> {order.delivery.driverUserPhone}
                                  </a>
                                )}
                              </div>
                            )}
                            {!order.delivery.driverUserName && (
                              <p className="text-xs text-muted-foreground">Ap chèche chofe...</p>
                            )}
                          </div>
                        ) : order.driverName && order.driverName !== "fm_driver" ? (
                          <div className="flex items-center gap-2 text-xs">
                            <Truck className="h-3.5 w-3.5 text-primary" />
                            <span className="font-semibold">{order.driverName}</span>
                            {order.driverPhone && (
                              <a href={`tel:${order.driverPhone}`} className="text-primary flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {order.driverPhone}
                              </a>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">Pa gen chofe chwazi</p>
                        )}
                        {order.deliveryDescription && (
                          <p className="text-xs text-muted-foreground mt-1 italic">"{order.deliveryDescription}"</p>
                        )}
                      </div>
                    )}

                    {/* Buyer / seller / address */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Achte</p>
                        {order.buyer ? (
                          <>
                            <p className="font-semibold">{order.buyer.name}</p>
                            {order.buyer.phone && (
                              <a href={`tel:${order.buyer.phone}`} className="text-primary flex items-center gap-1 mt-0.5">
                                <Phone className="h-3 w-3" /> {order.buyer.phone}
                              </a>
                            )}
                          </>
                        ) : <p className="text-muted-foreground">—</p>}
                        {(order.shippingCity || order.shippingRegion) && (
                          <p className="text-muted-foreground mt-0.5">{[order.shippingCity, order.shippingRegion].filter(Boolean).join(", ")}</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Vandè</p>
                        {order.seller
                          ? <p className="font-semibold">{order.seller.name}</p>
                          : <p className="text-muted-foreground">—</p>}
                        <p className="text-muted-foreground mt-0.5">{order.paymentMethod}</p>
                      </div>
                    </div>

                    {/* Cancel button */}
                    {canCancel && (
                      <Button
                        onClick={() => setCancelTarget(order)}
                        variant="destructive"
                        size="sm"
                        className="w-full gap-1.5"
                      >
                        <X className="h-4 w-4" />
                        Anile Kòmand BZH-{String(order.id).padStart(6, "0")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel confirmation dialog */}
      <Dialog open={!!cancelTarget} onOpenChange={v => !v && setCancelTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Anile Kòmand?
            </DialogTitle>
          </DialogHeader>
          {cancelTarget && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Ou sou pwen anile kòmand{" "}
                <span className="font-black text-foreground">BZH-{String(cancelTarget.id).padStart(6, "0")}</span>
                {" "}(${cancelTarget.amount?.toFixed(2)}).
              </p>
              <div className="bg-muted/50 rounded-xl p-3 text-xs space-y-1">
                <p><span className="font-semibold">Achte:</span> {cancelTarget.buyer?.name ?? "—"}</p>
                <p><span className="font-semibold">Vandè:</span> {cancelTarget.seller?.name ?? "—"}</p>
                <p><span className="font-semibold">Pwodui:</span> {cancelTarget.listingTitle ?? "—"}</p>
              </div>
              <p className="text-xs text-red-600 font-semibold">
                ⚠️ Aksyon sa a pa ka defèt. Achte a ap resevwa yon notifikasyon.
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={cancelling}>
              Kansele
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={cancelling}>
              {cancelling ? "Ap anile..." : "Wi, anile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
