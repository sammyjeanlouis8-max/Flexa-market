/**
 * Manager Dashboard — /manager
 *
 * Visible only to users whose managedSellerId is set (store managers).
 * Shows the linked seller's active orders and lets the manager mark a
 * package as physically ready for driver pickup.
 *
 * Auth gate: we call /api/manager/me directly instead of reading
 * user.managedSellerId from the stale auth cache. This means an invited
 * manager can open /manager immediately after being invited, without
 * needing a full page reload to refresh their JWT.
 */

import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Package, CheckCircle2, Clock, MapPin, User, Phone,
  RefreshCw, ChevronRight, Store, ShoppingBag,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function apiFetch(path: string, method = "GET", body?: object) {
  const token = localStorage.getItem("flexamarket_token");
  return fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

type Order = {
  id: number;
  orderStatus: string;
  amount: number;
  createdAt: string;
  shippingName: string | null;
  shippingPhone: string | null;
  shippingCity: string | null;
  shippingStreet: string | null;
  listing: { id: number; title: string; image: string | null } | null;
  buyer: { id: number; name: string; phone: string | null } | null;
  delivery: {
    status: string;
    packageReady: boolean;
    packageReadyAt: string | null;
    hasDriver: boolean;
  } | null;
};

type Seller = {
  id: number;
  name: string;
  avatar: string | null;
  location: string | null;
  phone: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  ready_to_ship: "Prè pou voye",
  shipped: "Voye",
  out_for_delivery: "An wout",
  delivered: "Livere",
  pending: "Annatant",
  cancelled: "Anile",
};

const STATUS_COLORS: Record<string, string> = {
  ready_to_ship: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  shipped: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  out_for_delivery: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
  delivered: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export default function ManagerDashboard() {
  const { user, loading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [seller, setSeller] = useState<Seller | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [markingReady, setMarkingReady] = useState<number | null>(null);
  // Three states: "checking" (fetching /manager/me), "manager" (confirmed), "not_manager"
  const [accessState, setAccessState] = useState<"checking" | "manager" | "not_manager">("checking");

  // Redirect unauthenticated users immediately; for auth users, verify manager
  // status via the API (not the stale JWT/auth cache) so an invited user can
  // open the dashboard the moment they receive the invite notification.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLocation("/login"); return; }

    apiFetch("/manager/me").then(async r => {
      if (r.ok) {
        const d = await r.json();
        if (d?.seller) {
          setSeller(d.seller);
          setAccessState("manager");
        } else {
          setAccessState("not_manager");
        }
      } else {
        setAccessState("not_manager");
      }
    }).catch(() => setAccessState("not_manager"));
  }, [user, authLoading, setLocation]);

  // Redirect confirmed non-managers back to home
  useEffect(() => {
    if (accessState === "not_manager") setLocation("/");
  }, [accessState, setLocation]);

  // Load orders
  const loadOrders = useCallback(async (p = 1, reset = false) => {
    setLoadingOrders(true);
    try {
      const r = await apiFetch(`/manager/orders?page=${p}`);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setOrders(prev => reset ? d.orders : [...prev, ...d.orders]);
      setHasMore(d.hasMore);
      setPage(p);
    } catch {
      toast({ title: "Erè pou chaje kòmand yo", variant: "destructive" });
    } finally {
      setLoadingOrders(false);
    }
  }, [toast]);

  useEffect(() => {
    if (accessState === "manager") loadOrders(1, true);
  }, [accessState, loadOrders]);

  const handleMarkReady = async (orderId: number) => {
    setMarkingReady(orderId);
    try {
      const r = await apiFetch(`/manager/orders/${orderId}/ready`, "POST");
      if (!r.ok) throw new Error((await r.json()).error ?? "Erè");
      toast({ title: "✅ Make prè!" });
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? { ...o, delivery: { ...(o.delivery ?? { status: "waiting", hasDriver: false }), packageReady: true, packageReadyAt: new Date().toISOString() } }
          : o
      ));
    } catch (e: any) {
      toast({ title: e.message ?? "Erè", variant: "destructive" });
    } finally {
      setMarkingReady(null);
    }
  };

  if (authLoading || accessState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (accessState !== "manager") return null;

  return (
    <div className="max-w-lg mx-auto pb-24 px-4 pt-4">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Store className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold text-foreground">Ma Boutik</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Jere kòmand vandè a — make pake yo prè pou chaofè a.
        </p>
      </div>

      {/* ── Seller info chip ── */}
      {seller && (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
            {seller.name?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{seller.name}</p>
            {seller.location && <p className="text-xs text-muted-foreground truncate">{seller.location}</p>}
          </div>
          <button
            onClick={() => loadOrders(1, true)}
            disabled={loadingOrders}
            className="rounded-lg p-1.5 hover:bg-primary/10 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 text-primary ${loadingOrders ? "animate-spin" : ""}`} />
          </button>
        </div>
      )}

      {/* ── Orders list ── */}
      {!loadingOrders && orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ShoppingBag className="h-12 w-12 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground font-medium">Pa gen kòmand aktif pou kounye a.</p>
          <p className="text-xs text-muted-foreground">Kòmand nouvo yo ap parèt la lè yo rive.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onMarkReady={handleMarkReady}
              marking={markingReady === order.id}
            />
          ))}
          {loadingOrders && (
            <div className="flex justify-center py-4">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {hasMore && !loadingOrders && (
            <Button
              variant="outline"
              className="w-full rounded-xl"
              onClick={() => loadOrders(page + 1)}
            >
              Chaje plis…
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, onMarkReady, marking }: { order: Order; onMarkReady: (id: number) => void; marking: boolean }) {
  const ready = order.delivery?.packageReady;
  const [, setLocation] = useLocation();

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Product row */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {order.listing?.image ? (
          <img src={order.listing.image} alt="" className="h-16 w-16 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center shrink-0">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate leading-tight">
            {order.listing?.title ?? `Kòmand #${order.id}`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            #{order.id} · ${order.amount?.toFixed(2)}
          </p>
          <div className="mt-1.5">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${STATUS_COLORS[order.orderStatus] ?? STATUS_COLORS.pending}`}>
              {STATUS_LABELS[order.orderStatus] ?? order.orderStatus}
            </span>
          </div>
        </div>
      </div>

      {/* Buyer / address info */}
      <div className="px-4 pb-3 space-y-1.5 border-t border-border/50 pt-3">
        {(order.shippingName || order.buyer?.name) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{order.shippingName ?? order.buyer?.name}</span>
          </div>
        )}
        {(order.shippingPhone || order.buyer?.phone) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0" />
            <span>{order.shippingPhone ?? order.buyer?.phone}</span>
          </div>
        )}
        {(order.shippingStreet || order.shippingCity) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{[order.shippingStreet, order.shippingCity].filter(Boolean).join(", ")}</span>
          </div>
        )}
        {order.delivery && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Livrezon: <span className="font-medium">{order.delivery.status}</span>
              {order.delivery.hasDriver ? " · Chaofè asiye" : " · Ap tann chaofè"}
            </span>
          </div>
        )}
      </div>

      {/* Action row */}
      <div className="px-4 pb-4 flex gap-2">
        {ready ? (
          <div className="flex-1 flex items-center gap-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
            <span className="text-xs font-semibold text-green-700 dark:text-green-300">Prè pou pran ✓</span>
          </div>
        ) : (
          <Button
            className="flex-1 rounded-xl h-9 text-sm font-semibold"
            onClick={() => onMarkReady(order.id)}
            disabled={marking}
          >
            {marking ? (
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="h-4 w-4 mr-2" />
            )}
            Prè pou pran ✓
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-xl shrink-0"
          onClick={() => setLocation(`/orders/${order.id}`)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
