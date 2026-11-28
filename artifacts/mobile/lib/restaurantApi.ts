/**
 * Mobile REST client for Flexa Restaurant — DigitalOcean API (same as website).
 * Never trusts client prices for orders; server recomputes.
 */
import { getApiBase } from "./api";

export type MenuPreviewItem = {
  id: number;
  name: string;
  photos: string[];
  price: number;
  currency: string;
  availableFrom: string;
  availableUntil: string;
  soldOut: boolean;
  availability?: string;
  orderableNow?: boolean;
  acceptsReservations?: boolean;
};

export type Restaurant = {
  id: number;
  ownerId?: number;
  name: string;
  city: string;
  country: string;
  description: string;
  cuisineTags: string[];
  businessType?: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  streetAddress?: string | null;
  showPublicAddress?: boolean;
  acceptsReservations?: boolean;
  status: string;
  identityStatus: string;
  foodSafetyCompleted?: boolean;
  openNow?: boolean;
  isOpenNow?: boolean;
  avgRating?: number;
  ratingCount?: number;
  publicPickupAddress?: string | null;
  serviceArea?: string | null;
  fulfillment?: string;
  deliveryFee?: number;
  minOrderAmount?: number;
  estimatedPrepMinutes?: number;
  estimatedDeliveryMinutes?: number | null;
  deliveryAvailable?: boolean;
  pickupAvailable?: boolean;
  deliverySuspended?: boolean;
  deliveryDisclaimer?: string;
  ownerManagedDelivery?: boolean;
  usesFlexaDrivers?: boolean;
  temporarilyClosed?: boolean;
  deliveryZones?: string[];
  hours?: Array<{ weekday: number; isClosed: boolean; openTime: string; closeTime: string }>;
  menuPreview?: MenuPreviewItem[];
  timezone?: string;
};

export type DailyMenuItem = {
  id: number;
  dishModelId: number | null;
  name: string;
  description: string;
  photos: string[];
  price: number;
  currency: string;
  category: string | null;
  allergens?: string;
  soldOut: boolean;
  availableFrom: string;
  availableUntil: string;
  orderableNow?: boolean;
  acceptsReservations?: boolean;
  availability?: string;
};

export type DishOptionGroup = {
  id: number;
  name: string;
  kind: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: Array<{
    id: number;
    name: string;
    priceDelta: number;
    priceDeltaMinor: number;
    soldOut: boolean;
    allergens: string;
  }>;
};

export type Order = {
  id: number;
  restaurantId: number;
  customerId: number;
  status: string;
  fulfillment: string;
  deliveryMethod?: "pickup" | "merchant" | "flexa" | string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  specialInstructions: string;
  deliveryAddress: string | null;
  paymentNote?: string;
  paymentStatus?: string;
  confirmationPin?: string | null;
  pinConfirmedAt?: string | null;
  assignedStaffId?: number | null;
  estimatedDeliveryMinutes?: number | null;
  merchantDeliveryFeeMinor?: number;
  flexaDeliveryFeeMinor?: number;
  restaurantName?: string;
  createdAt: string;
  updatedAt: string;
  items?: Array<{ id: number; name: string; quantity: number; unitPrice: number; lineTotal: number }>;
};

export function deliveryMethodCustomerLabel(method?: string | null, fulfillment?: string | null): string {
  const m = String(method || (fulfillment === "delivery" ? "merchant" : "pickup")).toLowerCase();
  if (m === "merchant" || m === "restaurant") return "Delivered by Restaurant";
  if (m === "flexa") return "Delivered by Flexa";
  return "Customer Pickup";
}

export type DishModel = {
  id: number;
  restaurantId: number;
  name: string;
  description: string;
  photos: string[];
  price: number;
  currency: string;
  allergens: string;
  defaultAvailable: boolean;
};

export type OwnerStats = {
  ordersToday?: number;
  revenueToday?: number;
  openOrders?: number;
  rating?: number;
  [key: string]: unknown;
};

type AuthOpts = { token?: string | null; signal?: AbortSignal };

function headers(token?: string | null): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback);
  return data as T;
}

export function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

export async function fetchRestaurantLaunch(opts: AuthOpts = {}) {
  const res = await fetch(`${getApiBase()}/restaurants/launch`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{
    publicLaunch: boolean;
    flexaDriverForbidden: boolean;
    fulfillmentDisclaimer: string;
    driverPolicy: string;
    countryPolicy?: { defaultDeny: boolean; countries: Array<{ countryCode: string; status: string; enabled: boolean; publiclyActive: boolean }> };
  }>(res, "Launch config failed");
}

export async function fetchRestaurants(
  params: {
    q?: string;
    country?: string;
    businessType?: string;
    openNow?: boolean;
    menuPreview?: boolean;
    fulfillment?: string;
    mine?: boolean;
    status?: string;
    nearby?: boolean;
    radiusKm?: number;
    lat?: number;
    lng?: number;
    sortBy?: "rating" | "distance" | "name";
  },
  opts: AuthOpts,
): Promise<Restaurant[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.country) qs.set("country", params.country);
  if (params.businessType) qs.set("businessType", params.businessType);
  if (params.openNow) qs.set("openNow", "1");
  if (params.menuPreview) qs.set("menuPreview", "1");
  if (params.fulfillment) qs.set("fulfillment", params.fulfillment);
  if (params.mine) qs.set("mine", "1");
  if (params.status) qs.set("status", params.status);
  if (params.nearby) qs.set("nearby", "1");
  if (params.radiusKm != null) qs.set("radiusKm", String(params.radiusKm));
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lng != null) qs.set("lng", String(params.lng));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  const path = params.mine ? `/restaurants/mine` : `/restaurants?${qs.toString()}`;
  const res = await fetch(`${getApiBase()}${path}`, { headers: headers(opts.token), signal: opts.signal });
  const data = await parseJson<{ restaurants?: Restaurant[] }>(res, "Failed to load restaurants");
  return data.restaurants ?? [];
}

export async function fetchRestaurant(id: number, opts: AuthOpts): Promise<Restaurant> {
  const res = await fetch(`${getApiBase()}/restaurants/${id}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Not found");
  return data.restaurant;
}

export async function fetchDailyMenu(restaurantId: number, menuDate: string | undefined, opts: AuthOpts) {
  const qs = menuDate ? `?date=${encodeURIComponent(menuDate)}` : "";
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/daily-menu${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{ menuDate: string; items: DailyMenuItem[] }>(res, "Failed to load menu");
}

export async function fetchDishOptions(restaurantId: number, dishId: number, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/dish-models/${dishId}/options`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ groups?: DishOptionGroup[] }>(res, "Failed to load options");
  return data.groups ?? [];
}

export async function createRestaurant(
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<Restaurant> {
  const res = await fetch(`${getApiBase()}/restaurants`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Could not create restaurant");
  return data.restaurant;
}

export async function updateRestaurant(
  id: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<Restaurant> {
  const res = await fetch(`${getApiBase()}/restaurants/${id}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Could not save restaurant");
  return data.restaurant;
}

export async function updateFoodTruckLocation(
  restaurantId: number,
  body: { locationLabel?: string; city?: string; latitude?: number; longitude?: number },
  opts: AuthOpts,
): Promise<Restaurant> {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/operating-location`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Could not update location");
  return data.restaurant;
}

export async function addDailyMenuItem(
  restaurantId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/daily-menu/items`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson(res, "Could not add menu item");
}

export async function fetchMyReservations(opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/restaurants/me/reservations`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ reservations?: Array<Record<string, unknown>> }>(
    res,
    "Failed to load reservations",
  );
  return data.reservations ?? [];
}

export async function fetchRestaurantReservations(restaurantId: number, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/reservations`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ reservations?: Array<Record<string, unknown>> }>(
    res,
    "Failed to load reservations",
  );
  return data.reservations ?? [];
}

export async function putAdminCountry(
  countryCode: string,
  body: Record<string, unknown>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/admin/restaurants/countries/${encodeURIComponent(countryCode)}`, {
    method: "PUT",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson(res, "Could not update country availability");
}

export async function saveRestaurantDelivery(
  restaurantId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/delivery`, {
    method: "PUT",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson(res, "Could not save delivery settings");
}

export async function saveRestaurantHours(
  restaurantId: number,
  hours: Array<Record<string, unknown>>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/hours`, {
    method: "PUT",
    headers: headers(opts.token),
    body: JSON.stringify({ hours }),
    signal: opts.signal,
  });
  return parseJson(res, "Could not save hours");
}

export async function fetchOwnerStats(restaurantId: number, opts: AuthOpts): Promise<OwnerStats> {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/owner-stats`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) return {};
  return (await res.json().catch(() => ({}))) as OwnerStats;
}

export async function fetchRestaurantOrders(
  params: { restaurantId?: number; mine?: boolean },
  opts: AuthOpts,
): Promise<Order[]> {
  const path =
    params.mine || params.restaurantId == null
      ? `/restaurants/me/orders`
      : `/restaurants/${params.restaurantId}/orders`;
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ orders?: Order[] }>(res, "Failed to load orders");
  return data.orders ?? [];
}

export async function patchOrderStatus(
  orderId: number,
  status: string,
  opts: AuthOpts,
  rejectionReason?: string,
): Promise<Order> {
  const res = await fetch(`${getApiBase()}/restaurants/me/orders/${orderId}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify({ status, rejectionReason }),
    signal: opts.signal,
  });
  const data = await parseJson<{ order: Order }>(res, "Could not update order");
  return data.order;
}

export async function confirmRestaurantOrderPin(orderId: number, pin: string, opts: AuthOpts): Promise<Order> {
  const res = await fetch(`${getApiBase()}/restaurants/me/orders/${orderId}/confirm-pin`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ pin }),
    signal: opts.signal,
  });
  const data = await parseJson<{ order: Order }>(res, "Invalid confirmation PIN");
  return data.order;
}

export async function refundRestaurantOrder(orderId: number, opts: AuthOpts, reason?: string): Promise<Order> {
  const res = await fetch(`${getApiBase()}/restaurants/me/orders/${orderId}/refund`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ reason }),
    signal: opts.signal,
  });
  const data = await parseJson<{ order: Order }>(res, "Refund failed");
  return data.order;
}

export async function placeRestaurantOrder(
  restaurantId: number,
  body: {
    fulfillment: "pickup" | "delivery";
    deliveryMethod?: "pickup" | "merchant" | "flexa";
    items: Array<{ dailyMenuItemId: number; quantity: number; notes?: string; optionIds?: number[] }>;
    specialInstructions?: string;
    deliveryAddress?: string;
    idempotencyKey?: string;
  },
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/orders`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({
      ...body,
      deliveryMethod: body.deliveryMethod || (body.fulfillment === "delivery" ? "merchant" : "pickup"),
    }),
    signal: opts.signal,
  });
  return parseJson<{
    order: Order;
    payment?: { clientSecret?: string | null; paymentIntentId?: string | null; message?: string };
  }>(res, "Could not place order");
}

export async function fetchRestaurantDeliveryStaff(restaurantId: number, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/delivery-staff`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ staff?: Array<{ id: number; displayName: string; phone: string; active: boolean }> }>(
    res,
    "Could not load delivery staff",
  );
  return data.staff ?? [];
}

export async function assignRestaurantOrderStaff(orderId: number, staffId: number, opts: AuthOpts): Promise<Order> {
  const res = await fetch(`${getApiBase()}/restaurants/me/orders/${orderId}/assign-staff`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ staffId }),
    signal: opts.signal,
  });
  const data = await parseJson<{ order: Order }>(res, "Could not assign staff");
  return data.order;
}

export async function reportRestaurantFailedDelivery(orderId: number, note: string, opts: AuthOpts): Promise<Order> {
  const res = await fetch(`${getApiBase()}/restaurants/me/orders/${orderId}/failed-delivery`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ note }),
    signal: opts.signal,
  });
  const data = await parseJson<{ order: Order }>(res, "Could not report failed delivery");
  return data.order;
}

export async function fetchDishModels(restaurantId: number, opts: AuthOpts): Promise<DishModel[]> {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/dish-models`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ dishes?: DishModel[] }>(res, "Failed to load dishes");
  return data.dishes ?? [];
}

export async function createDishModel(
  restaurantId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<DishModel> {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/dish-models`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ dish: DishModel }>(res, "Could not create dish");
  return data.dish;
}

export async function createDishOptionGroup(
  restaurantId: number,
  dishId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/dish-models/${dishId}/option-groups`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson<{ id: number }>(res, "Could not create option group");
}

export async function createDishOption(
  restaurantId: number,
  groupId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/option-groups/${groupId}/options`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson(res, "Could not create option");
}

export async function submitFoodSafetyQuiz(
  restaurantId: number,
  body: {
    articleVersion: string;
    answers: Record<string, string>;
    termsAccepted: boolean;
    foodResponsibilityAccepted?: boolean;
  },
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/restaurants/${restaurantId}/food-safety`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson<{ passed: boolean; score: number; incorrect?: string[] }>(res, "Quiz failed");
}

export async function fetchFoodSafetyQuiz(opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/restaurants/food-safety/quiz`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{
    articleVersion: string;
    passScore: number;
    sections: Array<{ id: string; titleKey: string; bodyKey: string }>;
    questions: Array<{ id: string; prompt: string; choices: Array<{ id: string; label: string }> }>;
  }>(res, "Quiz load failed");
}

export async function fetchAdminCountries(opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/admin/restaurants/countries`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{ countries: Array<Record<string, unknown>>; defaultDeny: boolean }>(
    res,
    "Country availability failed",
  );
}

export function statusLabel(status: string): string {
  return String(status || "").replace(/_/g, " ");
}
