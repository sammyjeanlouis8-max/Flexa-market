import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Trash2, ShoppingBag, ChevronDown, ChevronUp,
  Shield, Truck, CreditCard, CheckSquare, Square,
  ChevronRight, SlidersHorizontal, Tag, X, Package,
  CheckCircle, MapPin, Phone, User, Bike, Loader2, Info,
} from "lucide-react";
import { useCart, CartItem } from "@/contexts/cart";
import { useAuth } from "@/contexts/auth";
import { useAuthRequired } from "@/components/auth/AuthRequiredModal";
import { formatPrice } from "@/lib/currency";
import { readSavedCheckoutAddress, saveCheckoutAddress } from "@/lib/savedCheckoutAddress";

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
  user: { id?: number; name?: string; phone?: string | null; location?: string | null } | null;
  token: string | null;
  onSuccess: (orders: CheckoutOrder[], deliveryTotal: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const savedAddress = readSavedCheckoutAddress(user?.id);
  const [name, setName] = useState(savedAddress.name ?? user?.name ?? "");
  const [phone, setPhone] = useState(savedAddress.phone ?? user?.phone ?? "");
  const [city, setCity] = useState(savedAddress.city ?? user?.location ?? "");
  const [street, setStreet] = useState(savedAddress.street ?? "");
  const [region, setRegion] = useState(savedAddress.region ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requiresItemCheckout, setRequiresItemCheckout] = useState(false);
  const submitLock = useRef(false);

  const groups = groupBySeller(selectedItems);
  const deliveryTotal = deliveryFees.reduce((s, d) => s + d.feeUsd, 0);
  // $0.50 referral surcharge for referred buyers on orders > $14.99
  const cartReferralFee = (user as any)?.referredByUserId && total > 14.99 ? 0.50 : 0;
  const grandTotal = total + deliveryTotal + cartReferralFee;

  const handleConfirm = async () => {
    if (submitLock.current || loading) return;
    if (!name.trim() || !phone.trim() || !city.trim()) {
      setError(t("cart.requiredFields")); return;
    }
    submitLock.current = true;
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
      if (!res.ok) {
        if (data.code === "DOMINICAN_ITEM_CHECKOUT_REQUIRED") setRequiresItemCheckout(true);
        setError(data.error ?? t("common.tryAgain")); return;
      }
      saveCheckoutAddress(user?.id, {
        name: name.trim(),
        phone: phone.trim(),
        street: street.trim(),
        city: city.trim(),
        region: region.trim(),
      });
      onSuccess(data.orders ?? [], data.deliveryTotal ?? 0);
    } catch {
      setError(t("cart.networkError"));
    } finally {
      setLoading(false);
      submitLock.current = false;
    }
  };

  const purple = "#f97316";
  const border = "#e2e8f0";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}>
      <div className="w-full max-w-lg rounded-t-3xl overflow-y-auto" style={{ background: "#ffffff", maxHeight: "92vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${border}` }}>
          <div>
            <p className="font-black text-gray-900 text-[15px]">{t("cart.confirmOrder")}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {t(selectedItems.length === 1 && groups.length === 1 ? "cart.itemsSellers" : "cart.itemsSellers_plural", {
                items: selectedItems.length,
                sellers: groups.length,
              })} · ${grandTotal.toFixed(2)}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={loading} className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#f1f5f9" }} aria-label={t("cart.closeCheckout")}>
            <X className="h-4 w-4 text-gray-600" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Seller groups summary */}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{t("cart.orderSummary")}</p>
            {groups.map(({ sellerId, items }) => {
              const df = deliveryFees.find(d => d.sellerId === sellerId);
              const groupTotal = items.reduce((s, i) => s + i.price * (i.quantity ?? 1), 0);
              return (
                <div key={sellerId} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: "#f8fafc", border: `1px solid ${border}` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#fff7ed" }}>
                    <Package className="h-4 w-4" style={{ color: purple }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900 truncate">{items.map(i => i.title).join(", ")}</p>
                    <p className="text-[10px] text-gray-500">{t("cart.atikCount", { count: items.length, amount: groupTotal.toFixed(2) })}</p>
                    {df && df.pickupCity && (
                      <p className="text-[10px] text-blue-600 mt-0.5 flex items-center gap-1">
                        <MapPin className="h-2.5 w-2.5" /> {df.pickupCity}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                      <Bike className="h-3 w-3" /> {t("cart.motorcycle")}
                    </div>
                    {df && (
                      <p className="text-[10px] font-bold text-amber-600 mt-1">{t("cart.shipFee", { amount: df.feeUsd.toFixed(2) })}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Shipping form */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide">{t("cart.deliveryAddress")}</p>
            {[
              { key: "fullName", label: t("cart.fullName"), value: name, set: setName, icon: <User className="h-4 w-4" />, required: true, autoComplete: "name" },
              { key: "phone", label: t("cart.phone"), value: phone, set: setPhone, icon: <Phone className="h-4 w-4" />, required: true, autoComplete: "tel" },
              { key: "city", label: t("cart.city"), value: city, set: setCity, icon: <MapPin className="h-4 w-4" />, required: true, autoComplete: "address-level2" },
              { key: "street", label: t("cart.streetOptional"), value: street, set: setStreet, icon: <MapPin className="h-4 w-4" />, required: false, autoComplete: "street-address" },
              { key: "region", label: t("cart.regionOptional"), value: region, set: setRegion, icon: <MapPin className="h-4 w-4" />, required: false, autoComplete: "address-level1" },
            ].map(f => (
              <div key={f.key} className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl" style={{ border: `1.5px solid ${f.required && !f.value.trim() && error ? "#fca5a5" : border}`, background: "#f8fafc" }}>
                <span className="text-gray-400">{f.icon}</span>
                <input
                  value={f.value}
                  onChange={e => f.set(e.target.value)}
                  placeholder={f.label}
                  autoComplete={f.autoComplete}
                  className="flex-1 bg-transparent text-sm outline-none text-gray-900 placeholder-gray-400"
                />
              </div>
            ))}
          </div>

          {/* Price breakdown */}
          <div className="rounded-xl p-3.5 space-y-2" style={{ background: "#f8fafc", border: `1px solid ${border}` }}>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-wide mb-2">{t("cart.priceSummary")}</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">{t("cart.productsCount", { count: selectedItems.length })}</span>
              <span className="font-bold text-gray-900 tabular-nums">${total.toFixed(2)}</span>
            </div>
            {groups.map(({ sellerId, items }) => {
              const df = deliveryFees.find(d => d.sellerId === sellerId);
              if (!df) return null;
              return (
                <div key={sellerId} className="flex justify-between text-sm">
                  <span className="text-gray-500 text-xs flex items-center gap-1">
                    <Bike className="h-3 w-3 text-blue-500" />
                    {t("cart.deliveryLabel")} · {items[0]?.title?.slice(0, 18)}{items[0]?.title?.length > 18 ? "…" : ""}
                    {df.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  <span className="font-bold text-blue-600">+${df.feeUsd.toFixed(2)}</span>
                </div>
              );
            })}
            {cartReferralFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 text-xs">{t("cart.referralFee")}</span>
                <span className="font-bold text-orange-500 tabular-nums">+${cartReferralFee.toFixed(2)}</span>
              </div>
            )}
            <div className="border-t pt-2 mt-1 flex justify-between" style={{ borderColor: border }}>
              <span className="font-black text-gray-900 text-sm">{t("cart.estimatedTotal")}</span>
              <span className="font-black text-lg tabular-nums" style={{ color: purple }}>${grandTotal.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground leading-snug pt-1">
              {t("cart.finalAmountNote")}
            </p>
          </div>

          {/* Info note */}
          <div className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}>
            <Truck className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800 leading-relaxed">
              {t("cart.walletCheckoutNote")}
            </p>
          </div>

          {error && (
            <p className="text-sm font-bold text-red-600 text-center px-2 py-2 rounded-xl" style={{ background: "#fee2e2" }}>{error}</p>
          )}
          {requiresItemCheckout && (
            <div className="space-y-2" data-testid="cart-individual-shipping-links">
              {selectedItems.map(item => (
                <Link key={item.listingId} href={`/listings/${item.listingId}`}
                  className="block rounded-xl border p-3 text-sm font-semibold text-primary underline">
                  {item.title} →
                </Link>
              ))}
            </div>
          )}

          {/* Total + confirm */}
          <div className="space-y-2 pb-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading || requiresItemCheckout}
              data-testid="button-cart-place-order"
              className="w-full h-11 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.98] disabled:opacity-60"
              style={loading || requiresItemCheckout ? { background: "#e2e8f0", color: "#94a3b8", cursor: "not-allowed" } : {
                background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)",
                boxShadow: "0 2px 12px rgba(249,115,22,0.28)",
              }}
            >
              {loading
                ? <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> {t("cart.processing")}</span>
                : t("cart.placeOrderWallet", { amount: grandTotal.toFixed(2) })
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
  const { t } = useTranslation();
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
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 text-center" style={{ background: "#f8fafc" }}>
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, #d1fae5, #a7f3d0)" }}>
        <CheckCircle className="h-8 w-8 text-emerald-600" />
      </div>
      <p className="font-black text-xl text-gray-900 mb-1">{t("cart.orderConfirmed")}</p>
      <p className="text-sm text-gray-500 mb-2">
        {t(orders.length === 1 && groups.length === 1 ? "cart.itemsSellers" : "cart.itemsSellers_plural", {
          items: orders.length,
          sellers: groups.length,
        })}
      </p>
      {deliveryTotal > 0 && (
        <p className="text-xs text-blue-700 font-semibold mb-5 bg-blue-50 px-3 py-1.5 rounded-full">
          {t("cart.deliveryLabel")} ${deliveryTotal.toFixed(2)} · {groups.length} {t("cart.motorcycle")}
        </p>
      )}

      <div className="w-full max-w-sm space-y-2 mb-6">
        {orders.map(o => (
          <div key={o.txId} className="flex items-center gap-3 p-3 rounded-xl text-left" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#fff7ed" }}>
              <Package className="h-4 w-4" style={{ color: purple }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 truncate">{o.title}</p>
              <p className="text-xs text-gray-500 tabular-nums">
                #{o.txId} · ${o.amount.toFixed(2)}
                {(o.deliveryFee ?? 0) > 0 && <span className="text-blue-500"> {t("cart.shipFee", { amount: (o.deliveryFee ?? 0).toFixed(2) })}</span>}
              </p>
            </div>
            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md">{t("cart.paid")}</span>
          </div>
        ))}
      </div>

      <div className="w-full max-w-sm rounded-xl p-3.5 mb-5 space-y-2 text-left" style={{ background: "#fff", border: "1px solid #e2e8f0" }}>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">{t("cart.products")}</span>
          <span className="font-bold tabular-nums">${productTotal.toFixed(2)}</span>
        </div>
        {deliveryTotal > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">{t("cart.deliveryLabel")}</span>
            <span className="font-bold text-blue-600 tabular-nums">${deliveryTotal.toFixed(2)}</span>
          </div>
        )}
        <div className="border-t pt-2 flex justify-between">
          <span className="font-black text-gray-900">{t("cart.totalPaid")}</span>
          <span className="font-black text-lg tabular-nums" style={{ color: purple }}>${grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex gap-2.5 w-full max-w-sm">
        <button
          type="button"
          onClick={() => setLocation("/orders")}
          className="flex-1 h-11 rounded-xl font-bold text-sm text-white"
          style={{ background: "linear-gradient(135deg, #f97316, #ea580c)" }}
        >
          {t("cart.viewOrders")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 h-11 rounded-xl font-bold text-sm text-gray-700"
          style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}
        >
          {t("cart.continueShopping")}
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
  const { user, isLoading } = useAuth();
  const { requireAuth } = useAuthRequired();
  const [, setLocation] = useLocation();
  const { items, removeItem, clearCart, updateQuantity } = useCart();
  const token = typeof window !== "undefined" ? localStorage.getItem("flexamarket_token") : null;

  const [selected, setSelected] = useState<Set<number>>(() => new Set(items.map(i => i.listingId)));
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [promoNote, setPromoNote] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "selected">("all");
  const [showCheckout, setShowCheckout] = useState(false);
  const [successOrders, setSuccessOrders] = useState<CheckoutOrder[] | null>(null);
  const [successDeliveryTotal, setSuccessDeliveryTotal] = useState(0);

  // Delivery fees per seller group (loaded when user city is known)
  const [deliveryFees, setDeliveryFees] = useState<GroupDeliveryFee[]>([]);
  const [deliveryFeesLoading, setDeliveryFeesLoading] = useState(false);

  // Guests may view a local cart; checkout requires authentication.
  useEffect(() => {
    if (isLoading || user) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("checkout") === "1") {
      requireAuth({ action: "checkout", next: "/cart?checkout=1" });
    }
  }, [user, isLoading, requireAuth]);

  useEffect(() => {
    if (!user || isLoading) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("checkout") === "1" && items.length > 0) {
      window.history.replaceState(null, "", "/cart");
      setShowCheckout(true);
    }
  }, [user, isLoading, items.length]);

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
  const total = subtotal;
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
    <div className="min-h-screen bg-background" style={{ background: bg }}>

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
            type="button"
            onClick={() => setLocation("/")}
            className="px-6 h-11 rounded-xl font-bold text-white text-sm"
            style={{ background: purpleBtn, boxShadow: "0 2px 12px rgba(249,115,22,0.28)" }}
            data-testid="button-cart-empty-cta"
          >
            {t("cart.emptyCta")}
          </button>
        </div>
      )}

      {/* ══ ITEM GROUPS ══ */}
      {items.length > 0 && (
        <div className="pb-40">
          {groups.length === 0 && (
            <p className="text-center py-10 text-sm" style={{ color: muted }}>{t("cart.noItemsFilter")}</p>
          )}

          {groups.map(({ sellerId, items: groupItems }, gi) => {
            const df = deliveryFees.find(d => d.sellerId === sellerId);
            const shippingLabel = df?.loading
              ? t("cart.estimatingDelivery")
              : df?.pickupCity
                ? (!df.loading && df.feeUsd > 0
                  ? t("cart.cityFee", { city: df.pickupCity, amount: df.feeUsd.toFixed(2) })
                  : !df.loading && df.feeUsd === 0
                    ? t("cart.cityFree", { city: df.pickupCity })
                    : df.pickupCity)
                : buyerCity
                  ? t("cart.deliveryFeePending")
                  : t("cart.addCityForEstimate");
            return (
              <div key={sellerId} className="mb-1.5">
                {/* Seller header */}
                <div
                  className="flex items-center gap-2 px-4 py-2"
                  style={{ background: "#f0fdf4", borderBottom: `1px solid ${border}`, borderTop: gi > 0 ? `1px solid ${border}` : undefined }}
                >
                  <Bike className="h-3 w-3 text-green-600 flex-shrink-0" />
                  <span className="text-[11px] font-semibold text-green-800 truncate flex-1">
                    {shippingLabel}
                  </span>
                  {df?.loading && <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" style={{ color: muted }} />}
                </div>

                {groupItems.map(item => {
                  const qty = item.quantity ?? 1;
                  const img = item.image ?? `https://placehold.co/100x100/f97316/white?text=${encodeURIComponent(item.title.slice(0, 2))}`;
                  const isSel = selected.has(item.listingId);

                  return (
                    <div
                      key={item.listingId}
                      className="relative px-3 py-2.5"
                      style={{
                        background: isSel ? "rgba(249,115,22,0.04)" : card,
                        borderBottom: `1px solid ${border}`,
                        borderLeft: isSel ? `2px solid rgba(249,115,22,0.5)` : "2px solid transparent",
                      }}
                    >
                      <div className="flex gap-2.5 items-start">
                        <button type="button" onClick={() => toggleItem(item.listingId)} className="mt-1 flex-shrink-0" aria-label={isSel ? t("cart.deselectItem") : t("cart.selectItem")}>
                          {isSel
                            ? <CheckSquare className="h-5 w-5" style={{ color: purple }} />
                            : <Square className="h-5 w-5" style={{ color: muted }} />
                          }
                        </button>
                        <Link href={`/listings/${item.listingId}`} className="flex-shrink-0">
                          <img
                            src={img}
                            alt=""
                            loading="lazy"
                            className="w-16 h-16 sm:w-[72px] sm:h-[72px] rounded-lg object-cover"
                            style={{ border: `1px solid ${border}` }}
                            onError={e => { (e.target as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect width='100' height='100' fill='%23f3f4f6'/%3E%3C/svg%3E"; }}
                          />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <Link href={`/listings/${item.listingId}`} className="flex-1 min-w-0">
                              <p className="text-[13px] font-bold leading-snug line-clamp-2" style={{ color: "#0f172a" }}>
                                {item.title}
                              </p>
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleRemove(item.listingId)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0"
                              style={{ background: "rgba(239,68,68,0.08)" }}
                              aria-label={t("cart.removeFromCart")}
                              data-testid={`button-remove-cart-${item.listingId}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[15px] font-black tabular-nums" style={{ color: "#0f172a" }}>
                              {formatPrice(item.price, item.country, item.currency)}
                            </span>
                            {qty > 1 && (
                              <span className="text-[11px] font-semibold tabular-nums" style={{ color: muted }}>
                                ×{qty} = ${(item.price * qty).toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] font-semibold" style={{ color: muted }}>
                              {t("cart.itemTotal")} <span className="tabular-nums" style={{ color: "#0f172a" }}>${(item.price * qty).toFixed(2)}</span>
                            </span>
                            <div className="relative">
                              <label className="sr-only" htmlFor={`cart-qty-${item.listingId}`}>{t("cart.quantity")}</label>
                              <select
                                id={`cart-qty-${item.listingId}`}
                                value={qty}
                                onChange={e => updateQuantity(item.listingId, parseInt(e.target.value, 10))}
                                className="appearance-none text-xs font-bold pl-2.5 pr-7 py-1.5 rounded-lg outline-none cursor-pointer min-h-[36px]"
                                style={{ background: "#f1f5f9", border: `1px solid ${border}`, color: "#0f172a" }}
                                data-testid={`select-cart-qty-${item.listingId}`}
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
            <div className="flex items-center gap-3 px-4 py-3 my-1">
              <div className="flex-1 h-px" style={{ background: border }} />
              <p className="text-[11px] text-center font-semibold flex-shrink-0 px-2" style={{ color: muted }}>
                {t("cart.unselectedSeparator")}
              </p>
              <div className="flex-1 h-px" style={{ background: border }} />
            </div>
          )}

          <button
            type="button"
            onClick={() => setPromoNote(true)}
            className="mx-4 my-2 p-3 rounded-xl flex items-start gap-2.5 w-[calc(100%-2rem)] text-left"
            style={{ background: "#fff7ed", border: `1px solid #fed7aa` }}
          >
            <Tag className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: "#f97316" }} />
            <span className="text-xs leading-snug" style={{ color: "#9a3412" }}>
              {promoNote
                ? t("cart.promoDetailsNote")
                : t("cart.promoTapDetails", { placeholder: t("cart.promoPlaceholder") })}
            </span>
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" style={{ color: "#f97316" }} />
          </button>

          <div className="flex gap-3 px-4 py-2 justify-center flex-wrap">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: muted }}>
              <Shield className="h-3 w-3" style={{ color: "#16a34a" }} /> {t("cart.securePayment")}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: muted }}>
              <Truck className="h-3 w-3" style={{ color: "#3b82f6" }} /> {t("cart.deliveryEstimateBadge")}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: muted }}>
              <CreditCard className="h-3 w-3" style={{ color: "#f97316" }} /> {t("cart.walletCheckoutBadge")}
            </div>
          </div>

          <div className="px-4 pb-2">
            <button
              type="button"
              onClick={() => setLocation("/")}
              className="w-full h-10 rounded-xl text-sm font-bold text-gray-700"
              style={{ background: "#f1f5f9", border: `1px solid ${border}` }}
              data-testid="button-continue-shopping"
            >
              {t("cart.continueShopping")}
            </button>
          </div>
        </div>
      )}

      {/* Escape the scroll container's paint containment so fixed means viewport-fixed. */}
      {items.length > 0 && createPortal(
        <div
          data-testid="cart-checkout-bar"
          className="fixed left-0 right-0 z-[60]"
          style={{
            bottom: "calc(56px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(248,250,252,0.98)",
            backdropFilter: "blur(20px)",
            borderTop: `1px solid rgba(249,115,22,0.2)`,
            boxShadow: "0 -4px 24px rgba(0,0,0,0.07)",
          }}
        >
          {summaryExpanded && (
            <div className="px-4 pt-3 pb-2 space-y-2 max-w-lg mx-auto">
              <div className="flex justify-between text-sm">
                <span style={{ color: muted }}>{t("cart.subtotal", { count: selectedItems.length })}</span>
                <span className="font-bold text-gray-900 tabular-nums">${subtotal.toFixed(2)}</span>
              </div>
              {sellerCount > 1 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: muted }}>{t("cart.separateDelivery", { count: sellerCount })}</span>
                  <span className="text-[11px] font-bold text-blue-600">{t("cart.perSeller")}</span>
                </div>
              )}
              {deliveryFees.length > 0 && deliveryFees.map(df => (
                <div key={df.sellerId} className="flex justify-between text-sm">
                  <span style={{ color: muted }} className="flex items-center gap-1">
                    <Bike className="h-3 w-3 text-blue-500" />
                    {t("cart.deliverySeller", { id: df.sellerId })}
                    {df.loading && <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  <span className="font-bold text-blue-600 tabular-nums">
                    {df.loading ? "…" : `+$${df.feeUsd.toFixed(2)}`}
                  </span>
                </div>
              ))}
              <div className="flex justify-between text-xs py-2" style={{ borderTop: `1px solid ${border}` }}>
                <span className="font-black text-gray-900">{t("cart.estimatedTotal")}</span>
                <span className="font-black text-base tabular-nums" style={{ color: purple }}>
                  {deliveryFeesLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : `$${grandTotal.toFixed(2)}`}
                </span>
              </div>
            </div>
          )}

          <div
            className="flex items-center gap-3 px-4 py-2 max-w-lg mx-auto cursor-pointer"
            onClick={() => setSummaryExpanded(p => !p)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSummaryExpanded(p => !p); }}
          >
            {sellerCount > 1 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-md" style={{ background: "#eff6ff", color: "#2563eb" }}>
                {t("cart.sellersCount", { count: sellerCount })}
              </span>
            )}
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-lg font-black text-gray-900 tabular-nums">
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

          <div className="px-4 pb-2.5 max-w-lg mx-auto">
            <button
              type="button"
              onClick={() => {
                if (selectedItems.length === 0) return;
                if (!user) {
                  requireAuth({
                    action: "checkout",
                    next: "/cart?checkout=1",
                    title: t("authGate.signInToContinue", { defaultValue: "Sign in to continue" }),
                  });
                  return;
                }
                setShowCheckout(true);
              }}
              disabled={selectedItems.length === 0 || (!!user && deliveryFeesLoading)}
              data-testid="button-proceed-checkout"
              className="w-full flex items-center justify-center gap-2 px-4 h-11 rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60"
              style={selectedItems.length === 0 || deliveryFeesLoading ? {
                background: "#e2e8f0", color: "#94a3b8", cursor: "not-allowed",
              } : {
                background: purpleBtn,
                color: "#fff",
                boxShadow: "0 2px 10px rgba(249,115,22,0.28)",
              }}
            >
              {selectedItems.length === 0 ? (
                <span>{t("cart.selectToCheckout")}</span>
              ) : deliveryFeesLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t("cart.estimatingDelivery")}
                </span>
              ) : (
                <>
                  <span>{t("cart.orderButton", { count: selectedItems.length })}</span>
                  <span className="opacity-90 tabular-nums">${grandTotal.toFixed(2)}</span>
                </>
              )}
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Keep cart dialogs above the body-level checkout bar. */}
      {showCheckout && user && createPortal(
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
        />,
        document.body
      )}

      {/* ══ CLEAR CONFIRM MODAL ══ */}
      {showClearConfirm && createPortal(
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
        </div>,
        document.body
      )}
    </div>
  );
}
