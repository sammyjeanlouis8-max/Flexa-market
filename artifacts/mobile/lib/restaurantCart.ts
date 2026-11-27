import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "flexa_restaurant_cart_v1";

export type RestaurantCartLine = {
  dailyMenuItemId: number;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  photo?: string | null;
  notes?: string;
  optionIds?: number[];
  optionLabels?: string[];
  mode: "order" | "reserve";
};

export type RestaurantCartState = {
  restaurantId: number;
  restaurantName: string;
  lines: RestaurantCartLine[];
  fulfillment: "pickup" | "delivery";
  specialInstructions: string;
  deliveryAddress: string;
  updatedAt: string;
};

export async function getRestaurantCart(): Promise<RestaurantCartState | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RestaurantCartState;
  } catch {
    return null;
  }
}

export async function clearRestaurantCart(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}

export async function upsertCartLine(
  restaurant: { id: number; name: string },
  line: RestaurantCartLine,
): Promise<RestaurantCartState> {
  const existing = await getRestaurantCart();
  const base: RestaurantCartState =
    existing && existing.restaurantId === restaurant.id
      ? existing
      : {
          restaurantId: restaurant.id,
          restaurantName: restaurant.name,
          lines: [],
          fulfillment: "pickup",
          specialInstructions: "",
          deliveryAddress: "",
          updatedAt: new Date().toISOString(),
        };

  const optionKey = (ids?: number[]) => (ids || []).slice().sort((a, b) => a - b).join(",");
  const idx = base.lines.findIndex(
    (l) =>
      l.dailyMenuItemId === line.dailyMenuItemId
      && l.mode === line.mode
      && optionKey(l.optionIds) === optionKey(line.optionIds),
  );
  const lines = [...base.lines];
  if (line.quantity <= 0) {
    if (idx >= 0) lines.splice(idx, 1);
  } else if (idx >= 0) {
    lines[idx] = { ...lines[idx], ...line };
  } else {
    lines.push(line);
  }

  const next: RestaurantCartState = {
    ...base,
    restaurantName: restaurant.name,
    lines,
    updatedAt: new Date().toISOString(),
  };
  if (lines.length === 0) await AsyncStorage.removeItem(KEY);
  else await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function setCartMeta(
  patch: Partial<Pick<RestaurantCartState, "fulfillment" | "specialInstructions" | "deliveryAddress">>,
): Promise<RestaurantCartState | null> {
  const existing = await getRestaurantCart();
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function cartTotals(cart: RestaurantCartState | null, deliveryFee = 0) {
  if (!cart) return { itemCount: 0, subtotal: 0, deliveryFee: 0, total: 0, currency: "USD" };
  const subtotal = cart.lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const fee = cart.fulfillment === "delivery" ? deliveryFee : 0;
  const currency = cart.lines[0]?.currency || "USD";
  return {
    itemCount: cart.lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    deliveryFee: fee,
    total: subtotal + fee,
    currency,
  };
}
