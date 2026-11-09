/**
 * Native shopping cart — mirrors marketplace local cart persistence.
 * Synced to AsyncStorage; checkout settles via POST /api/cart/checkout.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CartItem = {
  listingId: number;
  title: string;
  price: number;
  currency: string | null;
  image: string | null;
  country: string | null;
  city: string | null;
  sellerId: number;
  quantity: number;
};

type CartContextType = {
  items: CartItem[];
  ready: boolean;
  addItem: (item: Omit<CartItem, "quantity"> & { quantity?: number }) => void;
  removeItem: (listingId: number) => void;
  clearCart: () => void;
  isInCart: (listingId: number) => boolean;
  updateQuantity: (listingId: number, qty: number) => void;
  /** Number of distinct line items */
  count: number;
  /** Sum of quantity across lines */
  totalUnits: number;
  /** Subtotal in listing USD-equivalent display prices (sum price * qty) */
  subtotal: number;
  itemsForCountry: (country: string) => CartItem[];
};

const STORAGE_KEY = "flexamarket_cart";

const CartContext = createContext<CartContextType>({
  items: [],
  ready: false,
  addItem: () => {},
  removeItem: () => {},
  clearCart: () => {},
  isInCart: () => false,
  updateQuantity: () => {},
  count: 0,
  totalUnits: 0,
  subtotal: 0,
  itemsForCountry: () => [],
});

function normalize(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row: any) => {
      const listingId = Number(row?.listingId);
      const sellerId = Number(row?.sellerId);
      const price = Number(row?.price);
      if (!listingId || !sellerId || !Number.isFinite(price)) return null;
      return {
        listingId,
        title: String(row?.title ?? "Listing"),
        price,
        currency: row?.currency ?? "USD",
        image: row?.image ?? null,
        country: row?.country ?? null,
        city: row?.city ?? null,
        sellerId,
        quantity: Math.max(1, Number(row?.quantity) || 1),
      } as CartItem;
    })
    .filter(Boolean) as CartItem[];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!cancelled && raw) setItems(normalize(JSON.parse(raw)));
      } catch {
        /* empty cart */
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items, ready]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity"> & { quantity?: number }) => {
      // Match website cart: adding an existing listing is a no-op (qty via updateQuantity).
      setItems((prev) => {
        if (prev.some((i) => i.listingId === item.listingId)) return prev;
        return [
          ...prev,
          {
            listingId: item.listingId,
            title: item.title,
            price: item.price,
            currency: item.currency,
            image: item.image,
            country: item.country,
            city: item.city,
            sellerId: item.sellerId,
            quantity: Math.max(1, Math.min(30, item.quantity ?? 1)),
          },
        ];
      });
    },
    [],
  );

  const removeItem = useCallback((listingId: number) => {
    setItems((prev) => prev.filter((i) => i.listingId !== listingId));
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const isInCart = useCallback(
    (listingId: number) => items.some((i) => i.listingId === listingId),
    [items],
  );

  const updateQuantity = useCallback((listingId: number, qty: number) => {
    if (qty < 1) {
      setItems((prev) => prev.filter((i) => i.listingId !== listingId));
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        i.listingId === listingId ? { ...i, quantity: Math.min(30, qty) } : i,
      ),
    );
  }, []);

  const itemsForCountry = useCallback(
    (country: string) =>
      items.filter(
        (i) => !i.country || i.country.toLowerCase() === country.toLowerCase(),
      ),
    [items],
  );

  const value = useMemo<CartContextType>(() => {
    const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const totalUnits = items.reduce((s, i) => s + i.quantity, 0);
    return {
      items,
      ready,
      addItem,
      removeItem,
      clearCart,
      isInCart,
      updateQuantity,
      count: items.length,
      totalUnits,
      subtotal: Math.round(subtotal * 100) / 100,
      itemsForCountry,
    };
  }, [
    items,
    ready,
    addItem,
    removeItem,
    clearCart,
    isInCart,
    updateQuantity,
    itemsForCountry,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
