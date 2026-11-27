/**
 * Per-restaurant cart (never mixes unrelated restaurants).
 * Persisted in sessionStorage for the browser session only.
 */

export type RestaurantCartLine = {
  dailyMenuItemId: number;
  name: string;
  price: number;
  currency: string;
  quantity: number;
  photo?: string | null;
  availableFrom?: string;
  availableUntil?: string;
  notes?: string;
  /** order = available now; reserve = tomorrow / advance reservation */
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

const KEY = "flexa_restaurant_cart_v1";

function readRaw(): RestaurantCartState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RestaurantCartState;
  } catch {
    return null;
  }
}

function writeRaw(cart: RestaurantCartState | null) {
  try {
    if (!cart || cart.lines.length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    /* ignore quota */
  }
}

export function getRestaurantCart(): RestaurantCartState | null {
  return readRaw();
}

export function clearRestaurantCart() {
  writeRaw(null);
}

export function upsertCartLine(
  restaurant: { id: number; name: string },
  line: RestaurantCartLine,
): RestaurantCartState {
  const existing = readRaw();
  if (existing && existing.restaurantId !== restaurant.id) {
    // Do not mix restaurants — replace cart with the new restaurant.
  }
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

  const idx = base.lines.findIndex(
    (l) => l.dailyMenuItemId === line.dailyMenuItemId && l.mode === line.mode,
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
  writeRaw(next);
  return next;
}

export function setCartMeta(
  patch: Partial<Pick<RestaurantCartState, "fulfillment" | "specialInstructions" | "deliveryAddress">>,
): RestaurantCartState | null {
  const existing = readRaw();
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  writeRaw(next);
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
