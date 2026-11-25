import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from "react";

export interface CartItem {
  listingId: number;
  title: string;
  price: number;
  currency: string | null;
  image: string | null;
  country: string | null;
  sellerId: number;
  quantity?: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (listingId: number) => void;
  clearCart: () => void;
  isInCart: (listingId: number) => boolean;
  updateQuantity: (listingId: number, qty: number) => void;
  /** Total units in the cart (sum of quantities). */
  count: number;
  /** Distinct listing lines in the cart. */
  lineCount: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  clearCart: () => {},
  isInCart: () => false,
  updateQuantity: () => {},
  count: 0,
  lineCount: 0,
});

const STORAGE_KEY = "flexamarket_cart";

function readStorage(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function normalizeQty(qty: number | undefined): number {
  if (!Number.isFinite(qty as number)) return 1;
  return Math.max(1, Math.floor(qty as number));
}

/**
 * Merge two cart lists once (guest ↔ account on the same device).
 * Same listingId keeps one line and sums quantities.
 */
export function mergeCartItems(existing: CartItem[], incoming: CartItem[]): CartItem[] {
  const byId = new Map<number, CartItem>();
  for (const item of existing) {
    byId.set(item.listingId, { ...item, quantity: normalizeQty(item.quantity) });
  }
  for (const item of incoming) {
    const prev = byId.get(item.listingId);
    const qty = normalizeQty(item.quantity);
    if (prev) {
      byId.set(item.listingId, {
        ...prev,
        ...item,
        quantity: normalizeQty(prev.quantity) + qty,
      });
    } else {
      byId.set(item.listingId, { ...item, quantity: qty });
    }
  }
  return [...byId.values()];
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() =>
    readStorage().map(i => ({ ...i, quantity: normalizeQty(i.quantity) }))
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      const qty = normalizeQty(item.quantity);
      const idx = prev.findIndex(i => i.listingId === item.listingId);
      if (idx >= 0) {
        const next = [...prev];
        const existing = next[idx];
        next[idx] = {
          ...existing,
          ...item,
          quantity: normalizeQty(existing.quantity) + qty,
        };
        return next;
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((listingId: number) => {
    setItems(prev => prev.filter(i => i.listingId !== listingId));
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const isInCart = useCallback(
    (listingId: number) => items.some(i => i.listingId === listingId),
    [items]
  );

  const updateQuantity = useCallback((listingId: number, qty: number) => {
    if (qty < 1) return;
    setItems(prev => prev.map(i => i.listingId === listingId ? { ...i, quantity: normalizeQty(qty) } : i));
  }, []);

  const count = useMemo(
    () => items.reduce((sum, i) => sum + normalizeQty(i.quantity), 0),
    [items],
  );

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, isInCart, updateQuantity, count, lineCount: items.length }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
