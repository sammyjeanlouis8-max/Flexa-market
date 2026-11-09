import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "flexamarket_cart";
const MAX_QTY = 30;

export type CartItem = {
  listingId: number;
  title: string;
  price: number;
  currency: string | null;
  image: string | null;
  country: string | null;
  sellerId: number;
  quantity: number;
  stockQuantity?: number | null;
};

type CartContextType = {
  items: CartItem[];
  ready: boolean;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    ok: boolean;
    error?: string;
    alreadyInCart?: boolean;
  };
  removeItem: (listingId: number) => void;
  clearCart: () => void;
  isInCart: (listingId: number) => boolean;
  updateQuantity: (listingId: number, qty: number) => { ok: boolean; error?: string };
  count: number;
  subtotal: number;
};

const CartContext = createContext<CartContextType>({
  items: [],
  ready: false,
  addItem: () => ({ ok: false }),
  removeItem: () => {},
  clearCart: () => {},
  isInCart: () => false,
  updateQuantity: () => ({ ok: false }),
  count: 0,
  subtotal: 0,
});

function normalizeItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any) => {
      const listingId = Number(item?.listingId);
      const price = Number(item?.price);
      const quantity = Math.min(MAX_QTY, Math.max(1, Number(item?.quantity ?? 1) || 1));
      if (!Number.isFinite(listingId) || !Number.isFinite(price)) return null;
      return {
        listingId,
        title: String(item?.title || "Listing"),
        price,
        currency: item?.currency ?? null,
        image: item?.image ?? null,
        country: item?.country ?? null,
        sellerId: Number(item?.sellerId) || 0,
        quantity,
        stockQuantity: item?.stockQuantity ?? null,
      } as CartItem;
    })
    .filter(Boolean) as CartItem[];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        setItems(normalizeItems(JSON.parse(raw)));
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, ready]);

  const addItem = useCallback((item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
    if (!item.listingId) return { ok: false, error: "Invalid listing." };
    if (item.stockQuantity === 0) return { ok: false, error: "This item is out of stock." };
    let alreadyInCart = false;
    setItems((prev) => {
      if (prev.some((i) => i.listingId === item.listingId)) {
        alreadyInCart = true;
        return prev;
      }
      return [
        ...prev,
        {
          ...item,
          quantity: Math.min(MAX_QTY, Math.max(1, item.quantity ?? 1)),
        },
      ];
    });
    return { ok: true, alreadyInCart };
  }, []);

  const removeItem = useCallback((listingId: number) => {
    setItems((prev) => prev.filter((i) => i.listingId !== listingId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const isInCart = useCallback(
    (listingId: number) => items.some((i) => i.listingId === listingId),
    [items],
  );

  const updateQuantity = useCallback((listingId: number, qty: number) => {
    if (qty < 1) return { ok: false, error: "Quantity must be at least 1." };
    if (qty > MAX_QTY) return { ok: false, error: `Maximum quantity is ${MAX_QTY}.` };
    let error: string | undefined;
    setItems((prev) =>
      prev.map((i) => {
        if (i.listingId !== listingId) return i;
        if (typeof i.stockQuantity === "number" && qty > i.stockQuantity) {
          error = `Only ${i.stockQuantity} in stock.`;
          return i;
        }
        return { ...i, quantity: qty };
      }),
    );
    return error ? { ok: false, error } : { ok: true };
  }, []);

  const value = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + i.price * (i.quantity || 1), 0);
    return {
      items,
      ready,
      addItem,
      removeItem,
      clearCart,
      isInCart,
      updateQuantity,
      count: items.length,
      subtotal,
    };
  }, [items, ready, addItem, removeItem, clearCart, isInCart, updateQuantity]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
