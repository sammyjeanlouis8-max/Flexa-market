import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

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
  count: number;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  clearCart: () => {},
  isInCart: () => false,
  updateQuantity: () => {},
  count: 0,
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

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() =>
    readStorage().map(i => ({ ...i, quantity: i.quantity ?? 1 }))
  );

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      if (prev.some(i => i.listingId === item.listingId)) return prev;
      return [...prev, { ...item, quantity: item.quantity ?? 1 }];
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
    setItems(prev => prev.map(i => i.listingId === listingId ? { ...i, quantity: qty } : i));
  }, []);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, clearCart, isInCart, updateQuantity, count: items.length }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
