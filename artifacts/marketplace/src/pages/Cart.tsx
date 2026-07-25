import { useState, useMemo, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Trash2, ShoppingBag, ChevronDown, ChevronUp,
  Shield, Truck, CreditCard, CheckSquare, Square,
  ChevronRight, SlidersHorizontal, Tag, X, Package,
  CheckCircle, MapPin, Phone, User, Bike, Loader2,
} from "lucide-react";
import { useCart, CartItem } from "@/contexts/cart";
import { useAuth } from "@/contexts/auth";
import { formatPrice } from "@/lib/currency";

/* ── Helpers ── */
const fakeDiscount = (price: number) => {
  const pct = [10, 15, 20, 25, 30, 35, 40, 45, 50, 52, 55][Math.abs(Math.floor(price)) % 11];
  return { pct, original: parseFloat((price / (1 - pct / 100)).toFixed(2)) };
};

const PROMO_BADGES: Record<number, { label: string; color: string }> = {};
const getBadge = (id: number) => {
  const badges = [
    { label: "VANT FLASH ⚡", color: "#f59e0b" },
    { label: "GWO PROMO 🔥", color: "#ef4444" },
    { label: "SÈLEKSYON MOMAN 🌟", color: "#8b5cf6" },
  ];
  if (!PROMO_BADGES[id]) PROMO_BADGES[id] = badges[id % badges.length];
  return PROMO_BADGES[id];
};

/* ── Group cart items by seller ── */
function groupBySeller(items: CartItem[]): { sellerId: number; items: CartItem[] }[] {
  const map = new Map<number, CartItem[]>();
  for (const item of items) {
    const g = map.get(item.sellerId) ?? [];
    g.push(item);
    map.set(item.sellerId, g);
  }
  return Array.from(map.entries()).map(([sellerId, items]) => ({ sellerId, items }));
}

const QTY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30];

/* ── Delivery fee preview per seller group ── */
interface GroupDeliveryFee {
  sellerId: number;
  feeUsd: number;
  loading: boolean;
  pickupCity: string;
}

async function fetchGroupDeliveryFee(
  items: CartItem[],
  buyerCity: string,
  token: string | null,
): Promise<{ sellerId: number; feeUsd: number; pickupCity: string }[]> {
  if (!buyerCity.trim() || !token) return [];
  const results: { sellerId: number; feeUsd: number; pickupCity: string }[] = [];
  const sellerIds = [...new Set(items.map(i => i.sellerId))];
  for (const sellerId of sellerIds) {
    const groupItems = items.filter(i => i.sellerId === sellerId);
    const listingId = groupItems[0]?.listingId;
    if (!listingId) continue;
    try {
      const res = await fetch(
        `/api/delivery/calculate-price?listingId=${listingId}&buyerCity=${encodeURIComponent(buyerCity)}&method=motorcycle`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) continue;
      const d = await res.json();
      results.push({ sellerId, feeUsd: d.feeUsd ?? 0, pickupCity: d.sellerCity ?? "" });
    } catch { /* skip */ }
  }
  return results;
}

/* ── Checkout modal ── */
interface CheckoutOrder { txId: number; sellerId: number; amount: number; deliveryFee?: number; title: string }

function CheckoutModal({
  selectedItems,
  total,
  deliveryFees,
  user,
  token,
  onSuccess,
  onClose,
}: {
  selectedItems: CartItem[];
  total: number;
  deliveryFees: GroupDeliveryFee[];
  user: { name?: string; phone?: string | null; location?: string | null } | null;
  token: string | null;
  onSuccess: (orders: CheckoutOrder[], deliveryTotal: number) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [city, setCity] = useState(user?.location ?? "");
  const [street, setStreet] = useState("");
  const [region, setRegion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const groups = groupBySeller(selectedItems);
  const deliveryTotal = deliveryFees.reduce((s, d) => s + d.feeUsd, 0);
  const grandTotal = total + deliveryTotal;

  const handleConfirm = async () => {
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError("Non, telefòn, ak vil obligatwa"); return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/cart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: selectedItems.map(i => ({ listingId: i.listingId, quantity: i.quantity ?? 1 })),
          shippingName: name.trim(),
          shippingPhone: phone.trim(),
          shippingStreet: street.trim() || null,
          shippingCity: city.trim(),
          shippingRegion: region.trim() || null,
          paymentMethod: "wallet",
          deliveryMethod: "motorcycle",
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Erè — eseye ankò"); return; }
      onSuccess(data.orders ?? [], data.deliveryTotal ?? 0);
    } catch {
      setError("Erè rezo — verifye koneksyon ou");
    } finally {
      setLoading(false);
    }
  };

  const purple = "#f97316";
  const border = "#e2e8f0";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-y-auto" style={{ background: "#ffffff", maxHeight: "92vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
          <div>
            <p className="font-black text-gray-900 text-base">Konfime Kòmand</p>
            <p className="text-xs text-gray-500 mt-0.5">{selectedItems.length} pwodwi · {groups.length} machann · ${grandTotal.toFixed(2)}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-2xl flex items-center justify-center" style={{ background: "#f1f5f9" }}>
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Seller groups summary */}
          <div className="space-y-2">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Rezime pa machann</p>
            {groups.map(({ sellerId, items }) => {
              const df = deliveryFees.find(d => d.sellerId === sellerId);
              return (
                <div key={sellerId} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#f8fafc", border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#fff7ed" }}>
                    <Package className="h-4 w-4" style={{ color: purple }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{items.map(i => i.title).join(", ")}</p>
                    <p className="text-[10px] text-gray-500">{items.length} atik · ${items.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0).toFixed(2)}</p>
                    {df && df.pickupCity && (
                      <p className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" /> {df.pickupCity}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                      <Bike className="h-3 w-3" /> 1 moto
                    </div>
                    {df && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1">+${df.feeUsd.toFixed(2)} liv.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shipping form */}
          <div className="space-y-3">
            <p className="text-xs font-black text-gray-500 uppercase tracking-wide">Adrès Livrezon</p>
            {[
              { label: "Non konplè", value: name, set: setName, icon: <User className="h-4 w-4" />, required: true },
              { label: "Telefòn", value: phone, set: setPhone, icon: <Phone className="h-4 w-4" />, required: true },
              { label: "Vil", value: city, set: setCity, icon: <MapPin className="h-4 w-4" />, required: true },
              { label: "Adres (opsyonèl)", value: street, set: setStreet, icon: <MapPin className="h-4 w-4" />, required: false },
              { label: "Rejyon (opsyonèl)", value: region, set: setRegion, icon: <MapPin className="h-4 w-4" />, required: false },
            ].map(f => (
              <div key={f.label} className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ border: `1.5px solid ${f.required && !f.value.trim() && error ? "#fca5a5" : border}`, background: "#f8fafc" }}>
                <span className="text-gray-400">{f.icon}</span>
                <input
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.label}
                  className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder-gray-400"
                />
              </div>
            ))}
          </div>

          {/* Price breakdown */}
          <div className="rounded-2xl p-4 space-y-2" style={{ background: "#f8fafc", border: `1px solid ${border}` }}>
            <p className="text-xs font-black text-gray-500 uppercase tracking-wide mb-3">Rezime Pri</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">🛍 Pwodwi ({selectedItems.length} atik)</span>
              <span className="font-bold text-gray-900">${total.toFixed(2)}</span>
            </div>
            {groups.map(({ sellerId, items }) => {
              const df = deliveryFees.find(d => d.sellerId === sellerId);
              if (!df) return null;
              return (
                <div key={sellerId} className="flex justify-between text-sm">
                  <span className="text-gray-500 text-xs flex items-center gap-1">
                    <Bike className="h-3 w-3 text-blue-500" />
                    Livrezon · {items[0]?.title?.slice(0, 18)}{items[0]?.title?.length > 18 ? "…" : ""}
                    {df.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  <span className="font-bold text-blue-600">+${df.feeUsd.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="border-t pt-2 mt-1 flex justify-between" style={{ borderColor: border }}>
              <span className="font-black text-gray-900 text-sm">💰 Total</span>
              <span className="font-black text-lg" style={{ color: purple }}>${grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-3 p-3 rounded-2xl" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <Truck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">
              Chak machann ap jwenn pwòp chofe moto pou livrezon pa yo. Frè livrezon kalkile otomatikman baze sou distans. Tout kòmand ap parèt nan seksyon "Kòmand Mwen" ou.
            </p>
          </div>

          {error && (
            <p className="text-sm font-bold text-red-600 text-center px-2 py-2 rounded-xl" style={{ background: "#fee2e2" }}>{error}</p>
          )}

          {/* Total + confirm */}
          <div className="space-y-3 pb-2">
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="w-full py-4 rounded-2xl font-black text-white text-sm transition-all active:scale-[0.98]"
              style={loading ? { background: "#e2e8f0", color: "#94a3b8", cursor: "not-allowed" } : {
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                boxShadow: "0 8px 30px rgba(249,115,22,0.35)",
              }}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Ap trete kòmand yo…</span>
                : `Konfime — Peye $${grandTotal.toFixed(2)} avèk FM Wallet`
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Success screen ── */
function SuccessScreen({ orders, deliveryTotal, onDone }: { orders: CheckoutOrder[]; deliveryTotal: number; onDone: () => void }) {
  const [, setLocation] = useLocation();
  const purple = "#f97316";
  const groups = useMemo(() => {
    const map = new Map<number, CheckoutOrder[]>();
    for (const o of orders) {
      const g = map.get(o.sellerId) ?? [];
      g.push(o);
      map.set(o.sellerId, g);
    }
    return Array.from(map.values());
  }, [orders]);

  const productTotal = orders.reduce((s, o) => s + o.amount, 0);
  const grandTotal = productTotal + deliveryTotal;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 text-center" style={{ background: "#f8fafc" }}>
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-5" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}>
        <CheckCircle className="h-10 w-10 text-emerald-600" />
      </div>
      <p className="font-black text-xl text-gray-900 mb-1">Kòmand Konfime! 🎉</p>
      <p className="text-sm text-gray-500 mb-2">{orders.length} kòmand kreye — {groups.length} machann ap livre ba ou</p>
      {deliveryTotal > 0 && (
        <p className="text-xs text-blue-600 font-bold mb-6 bg-blue-50 px-3 py-1.5 rounded-full">
          🏍 {groups.length} chofè moto asiyane · livrezon ${deliveryTotal.toFixed(2)} total
        </p>
      )}

      <div className="w-full max-w-sm space-y-3 mb-8">
        {orders.map(o => (
          <div key={o.txId} className="flex items-center gap-3 p-3.5 rounded-2xl text-left" style={{ background: "#ffffff", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#fff7ed" }}>
              <Package className="h-4 w-4" style={{ color: purple }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{o.title}</p>
              <p className="text-xs text-gray-500">
                Kòmand #{o.txId} · ${o.amount.toFixed(2)}
                {(o.deliveryFee ?? 0) > 0 && <span className="text-blue-500"> + liv. ${(o.deliveryFee ?? 0).toFixed(2)}</span>}
              </p>
            </div>
            <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg">Peye ✓</span>
          </div>
        ))}
      </div>

      {/* Grand total summary */}
      <div className="w-full max-w-sm rounded-2xl p-4 mb-6 space-y-2 text-left" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Pwodwi</span>
          <span className="font-bold">${productTotal.toFixed(2)}</span>
        </div>
        {deliveryTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Livrezon ({groups.length} chofè)</span>
            <span className="font-bold text-blue-600">${deliveryTotal.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t pt-2 flex justify-between">
          <span className="font-black text-gray-900">Total peye</span>
          <span className="font-black text-lg" style={{ color: purple }}>${grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-3 w-full max-w-sm">
        <button
          onClick={() => setLocation("/orders/purchases")}
          className="flex-1 py-3.5 rounded-2xl font-black text-sm text-white"
          style={{ background: "linear-gradient(135deg, #f97316, #ea580c)", boxShadow: "0 4px 16px rgba(249,115,22,0.3)" }}
        >
          Wè Kòmand Mwen
        </button>
        <button
          onClick={onDone}
          className="flex-1 py-3.5 rounded-2xl font-black text-sm text-gray-700"
          style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}
        >
          Kontinye Achte
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════ */
/* ── Main Cart page ── */
/* ══════════════════════════════════════════════════════════ */
export default function Cart() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { items, removeItem, clearCart, updateQuantity } = useCart();
  const token = typeof window !== "undefined" ? localStorage.getItem("flexamarket_token") : null;

  const [selected, setSelected] = useState<Set<number>>(() => new Set(items.map(i => i.listingId)));
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "selected">("all");
  const [showCheckout, setShowCheckout] = useState(false);
  const [successOrders, setSuccessOrders] = useState<CheckoutOrder[] | null>(null);
  const [successDeliveryTotal, setSuccessDeliveryTotal] = useState(0);

  // Delivery fees per seller group (loaded when user city is known)
  const [deliveryFees, setDeliveryFees] = useState<GroupDeliveryFee[]>([]);
  const [deliveryFeesLoading, setDeliveryFeesLoading] = useState(false);

  useEffect(() => {
    if (!user) setLocation("/auth/login");
  }, [user, setLocation]);

  useEffect(() => {
    setSelected(prev => {
      const ids = new Set(items.map(i => i.listingId));
      const next = new Set<number>();
      for (const id of prev) if (ids.has(id)) next.add(id);
      return next;
    });
  }, [items]);

  // Auto-fetch delivery fees when user has a location
  const buyerCity = user?.location ?? "";
  const selectedItems = items.filter(i => selected.has(i.listingId));

  const refreshDeliveryFees = useCallback(async (city: string, selItems: CartItem[]) => {
    if (!city || selItems.length === 0 || !token) { setDeliveryFees([]); return; }
    setDeliveryFeesLoading(true);
    const sellerIds = [...new Set(selItems.map(i => i.sellerId))];
    // Mark loading state
    setDeliveryFees(sellerIds.map(sid => ({ sellerId: sid, feeUsd: 0, loading: true, pickupCity: "" })));
    const results = await fetchGroupDeliveryFee(selItems, city, token);
    setDeliveryFees(results.map(r => ({ ...r, loading: false })));
    setDeliveryFeesLoading(false);
  }, [token]);

  useEffect(() => {
    refreshDeliveryFees(buyerCity, selectedItems);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerCity, selected.size, items.length]);

  if (!user) return null;

  // Show success screen after successful checkout
  if (successOrders) {
    return (
      <SuccessScreen
        orders={successOrders}
        deliveryTotal={successDeliveryTotal}
        onDone={() => { clearCart(); setSuccessOrders(null); setLocation("/"); }}
      />
    );
  }

  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(i => i.listingId)));
  const toggleItem = (id: number) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const handleRemove = (id: number) => {
    removeItem(id);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  };
  const handleClearAll = () => { clearCart(); setSelected(new Set()); setShowClearConfirm(false); };

  const subtotal = useMemo(() => selectedItems.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0), [selectedItems]);
  const discount = promoApplied ? subtotal * 0.05 : 0;
  const total = subtotal - discount;
  const deliveryTotal = deliveryFees.filter(d => !d.loading).reduce((s, d) => s + d.feeUsd, 0);
  const grandTotal = total + deliveryTotal;

  const displayItems = activeFilter === "selected" ? items.filter(i => selected.has(i.listingId)) : items;
  const groups = groupBySeller(displayItems);
  const sellerCount = useMemo(() => new Set(selectedItems.map(i => i.sellerId)).size, [selectedItems]);

  /* ── Styles ── */
  const bg = "#f8fafc";
  const card = "#ffffff";
  const border = "#e2e8f0";
  const muted = "#64748b";
  const purple = "#f97316";
  const purpleBtn = "linear-gradient(135deg, #f97316 0%, #ea580c 100%)";

  return (
    <div className="min-h-screen" style={{ background: bg, fontFamily: "system-ui, sans-serif" }}>

      {/* ══ STICKY HEADER ══ */}
      <div
        className="sticky top-0 z-30"
        style={{ background: "rgba(248,250,252,0.97)", backdropFilter: "blur(14px)", borderBottom: `1px solid ${border}` }}
      >
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <button onClick={toggleAll} className="flex-shrink-0">
            {allSelected
              ? <CheckSquare className="h-5 w-5" style={{ color: purple }} />
              : <Square className="h-5 w-5" style={{ color: muted }} />
            }
          </button>
          <span className="text-xs font-bold text-gray-900">{t("cart.selectAll")}</span>
          {subtotal > 0 && (
            <p className="text-[11px] truncate flex-1" style={{ color: muted }}>
              {t("cart.bnplTeaser", { amount: (total / 3).toFixed(2) })}
            </p>
          )}
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-xl"
            style={{ background: "#f1f5f9" }}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" style={{ color: muted }} />
          </button>
        </div>

        <div className="flex gap-1.5 px-4 pb-2.5 overflow-x-auto scrollbar-none">
          {[
            { key: "all",      label: t("cart.filterAll", { count: items.length }) },
            { key: "selected", label: t("cart.filterSelected", { count: selected.size }) },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key as "all" | "selected")}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all"
              style={activeFilter === f.key ? {
                background: purpleBtn, color: "white",
                boxShadow: "0 2px 12px rgba(249,115,22,0.3)",
              } : {
                background: "#f1f5f9",
                border: `1px solid ${border}`,
                color: muted,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ══ EMPTY STATE ══ */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center px-6 py-24 text-center">
          <div
            className="w-24 h-24 rounded-3xl flex items-center justify-center mb-6"
            style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.12), rgba(234,88,12,0.06))", border: `1px solid rgba(249,115,22,0.25)` }}
          >
            <ShoppingBag className="h-10 w-10" style={{ color: "#f97316" }} />
          </div>
          <p className="text-xl font-black text-gray-900 mb-2">{t("cart.emptyTitle")}</p>
          <p className="text-sm mb-8" style={{ color: muted }}>{t("cart.emptySubtitle")}</p>
          <button
            onClick={() => setLocation("/")}
            className="px-8 py-3.5 rounded-2xl font-black text-white text-sm"
            style={{ background: purpleBtn, boxShadow: "0 8px 30px rgba(249,115,22,0.35)" }}
          >
            {t("cart.emptyCta")}
          </button>
        </div>
      )}

      {/* ══ ITEM GROUPS ══ */}
      {items.length > 0 && (
        <div className="pb-52">
          {groups.length === 0 && (
            <p className="text-center py-10 text-sm" style={{ color: muted }}>{t("cart.noItemsFilter")}</p>
          )}

          {groups.map(({ sellerId, items: groupItems }, gi) => {
            const df = deliveryFees.find(d => d.sellerId === sellerId);
            return (
              <div key={sellerId} className="mb-2">
                {/* Seller header */}
                <div
                  className="flex items-center gap-2 px-4 py-2.5"
                  style={{ background: "#f0fdf4", borderBottom: `1px solid ${border}`, borderTop: gi > 0 ? `1px solid ${border}` : undefined }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[11px] font-bold" style={{ color: "#16a34a" }}>
                    {df?.pickupCity ? `📍 ${df.pickupCity}` : t("cart.freeShipping")}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-lg font-bold ml-1 flex items-center gap-1" style={{ background: "#dcfce7", color: muted }}>
                    <Bike className="h-2.5 w-2.5" /> 1 chofe moto
                  </span>
                  {df?.loading && <Loader2 className="h-3 w-3 animate-spin ml-1" style={{ color: muted }} />}
                  {df && !df.loading && df.feeUsd > 0 && (
                    <span className="text-[10px] font-bold ml-auto px-1.5 py-0.5 rounded-lg" style={{ background: "#eff6ff", color: "#2563eb" }}>
                      liv. ${df.feeUsd.toFixed(2)}
                    </span>
                  )}
                  <ChevronRight className="h-3 w-3" style={{ color: muted, marginLeft: df?.feeUsd ? 0 : "auto" }} />
                </div>

                {groupItems.map(item => {
                  const qty = item.quantity ?? 1;
                  const img = item.image ?? `https://placehold.co/100x100/8b5cf6/white?text=${encodeURIComponent(item.title.slice(0, 2))}`;
                  const isSel = selected.has(item.listingId);
                  const { pct, original } = fakeDiscount(item.price);
                  const badge = getBadge(item.listingId);

                  return (
                    <div
                      key={item.listingId}
                      className="relative px-4 py-3.5"
                      style={{
                        background: isSel ? "rgba(249,115,22,0.04)" : card,
                        borderBottom: `1px solid ${border}`,
                        borderLeft: isSel ? `2px solid rgba(249,115,22,0.5)` : "2px solid transparent",
                      }}
                    >
                      <div className="flex gap-3 items-start">
                        <button onClick={() => toggleItem(item.listingId)} className="mt-1 flex-shrink-0 pt-0.5">
                          {isSel
                            ? <CheckSquare className="h-5 w-5" style={{ color: purple }} />
                            : <Square className="h-5 w-5" style={{ color: muted }} />
                          }
                        </button>
                        <div className="flex-shrink-0">
                          <img
                            src={img}
                            alt=""
                            className="w-[88px] h-[88px] rounded-2xl object-cover"
                            style={{ border: `1px solid ${border}` }}
                            onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/100x100/f97316/white?text=FM"; }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => handleRemove(item.listingId)}
                            className="float-right ml-2 mt-0.5 w-7 h-7 flex items-center justify-center rounded-xl"
                            style={{ background: "rgba(239,68,68,0.1)" }}
                          >
                            <Trash2 className="h-3.5 w-3.5" style={{ color: "#f87171" }} />
                          </button>
                          <p className="text-sm font-bold leading-tight line-clamp-2 pr-9" style={{ color: "#0f172a" }}>
                            {item.title}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px]" style={{ color: muted }}>{t("cart.variant")}</span>
                            <ChevronDown className="h-2.5 w-2.5" style={{ color: muted }} />
                          </div>
                          <div className="mt-1.5">
                            <span
                              className="text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wide"
                              style={{ background: `${badge.color}22`, color: badge.color, border: `1px solid ${badge.color}44` }}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-base font-black" style={{ color: purple }}>
                              {formatPrice(item.price, item.country, item.currency)}
                            </span>
                            <span className="text-xs line-through" style={{ color: muted }}>
                              ${original.toFixed(2)}
                            </span>
                            <span
                              className="text-[10px] font-black px-1.5 py-0.5 rounded-md"
                              style={{ background: "rgba(239,68,68,0.18)", color: "#f87171" }}
                            >
                              -{pct}%
                            </span>
                          </div>
                          <div className="flex items-center justify-between mt-2.5">
                            <span className="text-[10px] font-semibold" style={{ color: muted }}>
                              {t("cart.itemTotal")} <span style={{ color: "#0f172a" }}>${(item.price * qty).toFixed(2)}</span>
                            </span>
                            <div className="relative">
                              <select
                                value={qty}
                                onChange={e => updateQuantity(item.listingId, parseInt(e.target.value))}
                                className="appearance-none text-xs font-black pl-3 pr-7 py-1.5 rounded-xl outline-none cursor-pointer"
                                style={{ background: "#f1f5f9", border: `1px solid ${border}`, color: "#0f172a" }}
                              >
                                {QTY_OPTIONS.map(n => (
                                  <option key={n} value={n} style={{ background: "#ffffff", color: "#0f172a" }}>{n}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none" style={{ color: muted }} />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {activeFilter === "all" && selected.size < items.length && selected.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-4 my-1">
              <div className="flex-1 h-px" style={{ background: border }} />
              <p className="text-[11px] text-center font-semibold flex-shrink-0 px-2" style={{ color: muted }}>
                {t("cart.unselectedSeparator")}
              </p>
              <div className="flex-1 h-px" style={{ background: border }} />
            </div>
          )}

          <div
            className="mx-4 my-3 p-3.5 rounded-2xl flex items-center gap-3"
            style={{ background: "#fff7ed", border: `1px solid #fed7aa` }}
          >
            <Tag className="h-4 w-4 flex-shrink-0" style={{ color: "#f97316" }} />
            <input
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              placeholder={t("cart.promoPlaceholder")}
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "#0f172a" }}
            />
            {promoCode.length >= 3 && (
              <button
                onClick={() => setPromoApplied(p => !p)}
                className="px-3 py-1.5 rounded-xl text-xs font-black transition-all"
                style={promoApplied ? { color: "#16a34a", background: "#dcfce7" } : { color: "#f97316", background: "#fff7ed", border: "1px solid #fed7aa" }}
              >
                {promoApplied ? t("cart.promoApplied") : t("cart.applyPromo")}
              </button>
            )}
          </div>

          <div className="flex gap-4 px-4 py-2 justify-center">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: muted }}>
              <Shield className="h-3 w-3" style={{ color: "#16a34a" }} /> {t("cart.securePayment")}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: muted }}>
              <Truck className="h-3 w-3" style={{ color: "#3b82f6" }} /> Livrezon otomatik
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: muted }}>
              <CreditCard className="h-3 w-3" style={{ color: "#f97316" }} /> {t("cart.paymentMethods")}
            </div>
          </div>
        </div>
      )}

      {/* ══ STICKY BOTTOM SUMMARY BAR ══ */}
      {items.length > 0 && (
        <div
          className="fixed left-0 right-0 z-[60]"
          style={{
            bottom: "calc(64px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(248,250,252,0.98)",
            backdropFilter: "blur(20px)",
            borderTop: `1px solid rgba(249,115,22,0.2)`,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.07)",
          }}
        >
          {summaryExpanded && (
            <div className="px-4 pt-4 pb-2 space-y-2.5 max-w-lg mx-auto">
              <div className="flex justify-between text-sm">
                <span style={{ color: muted }}>{t("cart.subtotal", { count: selectedItems.length })}</span>
                <span className="font-bold text-gray-900">${subtotal.toFixed(2)}</span>
              </div>
              {sellerCount > 1 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: muted }}>{sellerCount} machann · {sellerCount} chofe moto</span>
                  <span className="text-[11px] font-bold text-blue-600">livrezon separe</span>
                </div>
              )}
              {deliveryFees.length > 0 && deliveryFees.map(df => (
                <div key={df.sellerId} className="flex justify-between text-sm">
                  <span style={{ color: muted }} className="flex items-center gap-1">
                    <Bike className="h-3 w-3 text-blue-500" />
                    Livrezon · Machann {df.sellerId}
                    {df.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  <span className="font-bold text-blue-600">
                    {df.loading ? "…" : `+$${df.feeUsd.toFixed(2)}`}
                  </span>
                </div>
              ))}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: muted }}>{t("cart.coupons")}</span>
                  <span className="font-bold" style={{ color: "#16a34a" }}>-${discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs py-2" style={{ borderTop: `1px solid ${border}` }}>
                <span className="font-black text-gray-900">{t("cart.estimatedTotal")}</span>
                <span className="font-black text-lg" style={{ color: purple }}>
                  {deliveryFeesLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `$${grandTotal.toFixed(2)}`}
                </span>
              </div>
            </div>
          )}

          <div
            className="flex items-center gap-3 px-4 py-2.5 max-w-lg mx-auto cursor-pointer"
            onClick={() => setSummaryExpanded(p => !p)}
          >
            {discount > 0 && (
              <span className="text-[10px] font-black px-2 py-1 rounded-lg" style={{ background: "#dcfce7", color: "#16a34a" }}>
                {t("cart.discountApplied", { amount: discount.toFixed(2) })}
              </span>
            )}
            {sellerCount > 1 && (
              <span className="text-[10px] font-black px-2 py-1 rounded-lg" style={{ background: "#eff6ff", color: "#2563eb" }}>
                {sellerCount} machann · {sellerCount} moto
              </span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              {subtotal > 0 && (
                <span className="text-sm line-through" style={{ color: muted }}>
                  ${(subtotal * 1.3).toFixed(2)}
                </span>
              )}
              <span className="text-xl font-black text-gray-900">
                {deliveryFeesLoading
                  ? <Loader2 className="h-5 w-5 animate-spin inline" style={{ color: purple }} />
                  : `$${grandTotal.toFixed(2)}`
                }
              </span>
              {summaryExpanded
                ? <ChevronDown className="h-4 w-4" style={{ color: muted }} />
                : <ChevronUp className="h-4 w-4" style={{ color: muted }} />
              }
            </div>
          </div>

          <div className="px-4 pb-3 max-w-lg mx-auto">
            <button
              onClick={() => selectedItems.length > 0 && setShowCheckout(true)}
              disabled={selectedItems.length === 0 || deliveryFeesLoading}
              className="w-full flex items-center justify-between gap-2 px-5 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]"
              style={selectedItems.length === 0 || deliveryFeesLoading ? {
                background: "#e2e8f0", color: "#94a3b8", cursor: "not-allowed",
              } : {
                background: purpleBtn,
                color: "#fff",
                boxShadow: "0 2px 12px rgba(249,115,22,0.3)",
              }}
            >
              {selectedItems.length === 0 ? (
                <span className="w-full text-center">{t("cart.selectToCheckout")}</span>
              ) : deliveryFeesLoading ? (
                <span className="w-full text-center flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Kalkil livrezon…
                </span>
              ) : (
                <>
                  <span className="font-bold text-[13px]">{t("cart.orderButton", { count: selectedItems.length })}</span>
                  <span className="text-[11px] opacity-80">{sellerCount > 1 ? `${sellerCount} machann` : t("cart.paymentBadge")}</span>
                  <span className="font-black text-[15px]">${grandTotal.toFixed(2)}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ══ CHECKOUT MODAL ══ */}
      {showCheckout && (
        <CheckoutModal
          selectedItems={selectedItems}
          total={total}
          deliveryFees={deliveryFees}
          user={user}
          token={token}
          onSuccess={(orders, deliveryTot) => {
            setShowCheckout(false);
            clearCart();
            setSuccessDeliveryTotal(deliveryTot);
            setSuccessOrders(orders);
          }}
          onClose={() => setShowCheckout(false)}
        />
      )}

      {/* ══ CLEAR CONFIRM MODAL ══ */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-5" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)" }}>
          <div className="rounded-3xl p-6 w-full max-w-sm space-y-4" style={{ background: "#ffffff", border: `1px solid ${border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: "#fee2e2" }}>
                <Trash2 className="h-5 w-5" style={{ color: "#ef4444" }} />
              </div>
              <div>
                <p className="font-black text-gray-900 text-sm">{t("cart.clearTitle")}</p>
                <p className="text-xs" style={{ color: muted }}>{t("cart.clearSubtitle")}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-3 rounded-2xl text-sm font-bold text-gray-700" style={{ background: "#f1f5f9", border: `1px solid ${border}` }}>
                {t("cart.cancel")}
              </button>
              <button onClick={handleClearAll} className="flex-1 py-3 rounded-2xl text-sm font-black text-white" style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
                {t("cart.clearConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
