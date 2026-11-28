export type MenuPreviewItem = {
  id: number;
  name: string;
  description?: string;
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
  ownerId: number;
  businessType: string;
  name: string;
  slug: string | null;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  cuisineTags: string[];
  phone: string | null;
  whatsapp: string | null;
  country: string;
  region: string | null;
  city: string;
  streetAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone?: string;
  status: string;
  identityStatus: string;
  identityVerifiedBadge?: boolean;
  foodSafetyCompleted: boolean;
  acceptsReservations: boolean;
  acceptsNextDayReservations?: boolean;
  vacationMode: boolean;
  temporarilyClosed: boolean;
  avgRating: number;
  ratingCount: number;
  publicPickupAddress?: string | null;
  showPublicAddress?: boolean;
  serviceArea?: string | null;
  addressPrivacyNote?: string | null;
  fulfillment?: string;
  deliveryFee?: number;
  minOrderAmount?: number;
  estimatedPrepMinutes?: number;
  estimatedDeliveryMinutes?: number | null;
  deliveryDisclaimer?: string;
  ownerManagedDelivery?: boolean;
  openNow?: boolean;
  isOpenNow?: boolean;
  /** open | closing_soon | closed | temporarily_unavailable | hours_unknown */
  availabilityStatus?: string;
  hours?: Array<{
    weekday: number;
    isClosed: boolean;
    openTime: string | null;
    closeTime: string | null;
    overnight: boolean;
  }>;
  menuPreview?: MenuPreviewItem[];
  distanceKm?: number | null;
  platformFees?: { commission: number; registrationFee?: number; monthlySubscription?: number };
  createdAt: string;
  updatedAt: string;
};

export type DishModel = {
  id: number;
  restaurantId: number;
  name: string;
  description: string;
  photos: string[];
  price: number;
  currency: string;
  category: string | null;
  ingredients: string;
  allergens: string;
  prepMinutes: number;
  dietaryTags: string[];
  defaultAvailable: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DailyMenuItem = {
  id: number;
  dailyMenuId: number;
  restaurantId: number;
  dishModelId: number | null;
  name: string;
  description: string;
  photos: string[];
  price: number;
  currency: string;
  category: string | null;
  ingredients?: string;
  allergens?: string;
  availablePortions: number | null;
  soldCount?: number;
  soldOut: boolean;
  acceptsReservations: boolean;
  availableFrom: string;
  availableUntil: string;
  availability?: string;
  orderableNow?: boolean;
};

export type RestaurantOrderItem = {
  id: number;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string;
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
  paymentNote: string;
  rejectionReason: string | null;
  confirmationPin?: string | null;
  pinConfirmedAt?: string | null;
  assignedStaffId?: number | null;
  estimatedDeliveryMinutes?: number | null;
  merchantDeliveryFeeMinor?: number;
  flexaDeliveryFeeMinor?: number;
  items?: RestaurantOrderItem[];
  restaurantName?: string;
  createdAt: string;
  updatedAt: string;
};

export function deliveryMethodCustomerLabel(method?: string | null, fulfillment?: string | null): string {
  const m = String(method || (fulfillment === "delivery" ? "merchant" : "pickup")).toLowerCase();
  if (m === "merchant" || m === "restaurant") return "Delivered by Restaurant";
  if (m === "flexa") return "Delivered by Flexa";
  return "Customer Pickup";
}

export type Reservation = {
  id: number;
  restaurantId: number;
  customerId: number;
  dailyMenuItemId: number | null;
  dishName: string;
  quantity: number;
  reservationDate: string;
  reservationTime: string;
  fulfillment: string;
  specialInstructions: string;
  status: string;
  restaurantName?: string;
  createdAt: string;
  updatedAt: string;
};

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson<T>(res: Response, fallbackMsg: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const body = data as { error?: string; code?: string; message?: string };
    const err = new Error(body.error || body.message || fallbackMsg) as Error & { code?: string; status?: number };
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export async function fetchRestaurants(params?: {
  q?: string;
  country?: string;
  cuisine?: string;
  businessType?: string;
  fulfillment?: "pickup" | "delivery";
  openNow?: boolean;
  topRated?: boolean;
  featured?: boolean;
  menuPreview?: boolean;
  nearby?: boolean;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  sortBy?: "rating" | "distance" | "name";
  mine?: boolean;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Restaurant[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.cuisine) qs.set("cuisine", params.cuisine);
  if (params?.businessType && params.businessType !== "all") qs.set("businessType", params.businessType);
  if (params?.fulfillment) qs.set("fulfillment", params.fulfillment);
  if (params?.openNow) qs.set("openNow", "1");
  if (params?.topRated) qs.set("topRated", "1");
  if (params?.featured) qs.set("featured", "1");
  if (params?.menuPreview) qs.set("menuPreview", "1");
  if (params?.nearby) qs.set("nearby", "1");
  if (params?.radiusKm != null) qs.set("radiusKm", String(params.radiusKm));
  if (params?.lat != null) qs.set("lat", String(params.lat));
  if (params?.lng != null) qs.set("lng", String(params.lng));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const path = params?.mine ? "/api/restaurants/mine" : `/api/restaurants?${qs.toString()}`;
  const res = await fetch(path, { headers: authHeaders() });
  const data = await parseJson<{ restaurants?: Restaurant[] }>(res, "Failed to load restaurants");
  return data.restaurants ?? [];
}

export async function fetchOwnerStats(restaurantId: number): Promise<{
  orders: {
    new: number;
    preparing: number;
    ready: number;
    outForDelivery: number;
    completed: number;
    cancelled: number;
    total: number;
  };
  reservations: { pending: number; confirmed: number; total: number };
  avgRating: number;
  ratingCount: number;
}> {
  const res = await fetch(`/api/restaurants/${restaurantId}/owner-stats`, { headers: authHeaders() });
  return parseJson(res, "Failed to load owner stats");
}

export async function updateFoodTruckLocation(
  restaurantId: number,
  body: { locationLabel?: string; city?: string; latitude?: number; longitude?: number },
): Promise<Restaurant> {
  const res = await fetch(`/api/restaurants/${restaurantId}/operating-location`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Could not update location");
  return data.restaurant;
}

/** Discover categories — photographic tiles; ids match backend businessType. */
export const BUSINESS_TYPES = [
  { id: "all", labelKey: "restaurant.catAll", photo: "/restaurant/categories/all.webp" },
  { id: "traditional", labelKey: "restaurant.catRestaurants", photo: "/restaurant/categories/restaurants.webp" },
  { id: "home_kitchen", labelKey: "restaurant.catHomeKitchen", photo: "/restaurant/categories/home-kitchen.webp" },
  { id: "food_truck", labelKey: "restaurant.catFoodTruck", photo: "/restaurant/categories/food-truck.webp" },
  { id: "bakery", labelKey: "restaurant.catBakery", photo: "/restaurant/categories/bakery.webp" },
  { id: "catering", labelKey: "restaurant.catCatering", photo: "/restaurant/categories/catering.webp" },
] as const;

export function restaurantAvailabilityLabel(
  status: string | undefined,
  openFallback?: boolean,
): { key: string; tone: "open" | "soon" | "closed" | "neutral" } {
  const s = String(status || (openFallback ? "open" : "closed")).toLowerCase();
  if (s === "open") return { key: "restaurant.openNow", tone: "open" };
  if (s === "closing_soon") return { key: "restaurant.closingSoon", tone: "soon" };
  if (s === "temporarily_unavailable") return { key: "restaurant.temporarilyUnavailable", tone: "neutral" };
  if (s === "hours_unknown") return { key: "restaurant.hoursUnknown", tone: "neutral" };
  return { key: "restaurant.closed", tone: "closed" };
}

export function businessTypeLabelKey(type: string): string {
  const map: Record<string, string> = {
    all: "catAll",
    traditional: "catRestaurants",
    restaurant: "catRestaurants",
    home_kitchen: "catHomeKitchen",
    food_truck: "catFoodTruck",
    bakery: "catBakery",
    catering: "catCatering",
  };
  return map[type] || "catRestaurants";
}

export function availabilityLabelKey(availability?: string): string {
  const map: Record<string, string> = {
    available_now: "availAvailableNow",
    available_later_today: "availUpcoming",
    sold_out: "availSoldOut",
    finished_today: "availEndedToday",
    reserve_tomorrow: "availReserveTomorrow",
  };
  return map[availability || ""] || "availUnavailable";
}

export async function fetchRestaurant(id: number): Promise<Restaurant> {
  const res = await fetch(`/api/restaurants/${id}`, { headers: authHeaders() });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Restaurant not found");
  return data.restaurant;
}

export async function createRestaurant(body: Record<string, unknown>): Promise<Restaurant> {
  const res = await fetch("/api/restaurants", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Could not create restaurant");
  return data.restaurant;
}

export async function updateRestaurant(id: number, body: Record<string, unknown>): Promise<Restaurant> {
  const res = await fetch(`/api/restaurants/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ restaurant: Restaurant }>(res, "Could not save restaurant");
  return data.restaurant;
}

export async function fetchDishModels(restaurantId: number): Promise<DishModel[]> {
  const res = await fetch(`/api/restaurants/${restaurantId}/dish-models`, { headers: authHeaders() });
  const data = await parseJson<{ dishes?: DishModel[] }>(res, "Failed to load dishes");
  return data.dishes ?? [];
}

export async function createDishModel(restaurantId: number, body: Record<string, unknown>): Promise<DishModel> {
  const res = await fetch(`/api/restaurants/${restaurantId}/dish-models`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ dish: DishModel }>(res, "Could not create dish");
  return data.dish;
}

export async function updateDishModel(
  restaurantId: number,
  dishId: number,
  body: Record<string, unknown>,
): Promise<DishModel> {
  const res = await fetch(`/api/restaurants/${restaurantId}/dish-models/${dishId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ dish: DishModel }>(res, "Could not save dish");
  return data.dish;
}

export async function fetchDailyMenu(restaurantId: number, menuDate?: string): Promise<{
  menuDate: string;
  items: DailyMenuItem[];
}> {
  const qs = menuDate ? `?date=${encodeURIComponent(menuDate)}` : "";
  const res = await fetch(`/api/restaurants/${restaurantId}/daily-menu${qs}`, { headers: authHeaders() });
  const data = await parseJson<{ menuDate: string; items: DailyMenuItem[] }>(res, "Failed to load menu");
  return { menuDate: data.menuDate, items: data.items ?? [] };
}

export async function saveDailyMenuItem(
  restaurantId: number,
  body: Record<string, unknown>,
): Promise<DailyMenuItem> {
  const res = await fetch(`/api/restaurants/${restaurantId}/daily-menu/items`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ item: DailyMenuItem }>(res, "Could not save menu item");
  return data.item;
}

export async function fetchRestaurantOrders(params?: {
  restaurantId?: number;
  mine?: boolean;
  status?: string;
}): Promise<Order[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const path =
    params?.mine || params?.restaurantId == null
      ? `/api/restaurants/me/orders`
      : `/api/restaurants/${params.restaurantId}/orders`;
  const res = await fetch(`${path}?${qs.toString()}`, { headers: authHeaders() });
  const data = await parseJson<{ orders?: Order[] }>(res, "Failed to load orders");
  return data.orders ?? [];
}

export async function patchOrderStatus(orderId: number, status: string, rejectionReason?: string): Promise<Order> {
  const res = await fetch(`/api/restaurants/me/orders/${orderId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status, rejectionReason }),
  });
  const data = await parseJson<{ order: Order }>(res, "Could not update order");
  return data.order;
}

export async function rateRestaurant(
  restaurantId: number,
  body: { orderId: number; stars: number; comment?: string },
): Promise<void> {
  const res = await fetch(`/api/restaurants/${restaurantId}/ratings`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  await parseJson(res, "Could not submit rating");
}

/** Optional Flexa AI menu/description assist — suggestions only; never auto-applied. */
export async function suggestRestaurantMenuCopy(body: {
  name: string;
  category?: string;
  cuisineTags?: string;
  language?: string;
  details?: string;
}): Promise<{ description: string; categorySuggestions: string[]; notes: string[] }> {
  const res = await fetch("/api/flexa-ai/restaurant-assist", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Flexa AI assist unavailable");
}

export async function fetchReservations(params?: {
  restaurantId?: number;
  mine?: boolean;
  status?: string;
}): Promise<Reservation[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  const path =
    params?.mine || params?.restaurantId == null
      ? `/api/restaurants/me/reservations`
      : `/api/restaurants/${params.restaurantId}/reservations`;
  const res = await fetch(`${path}?${qs.toString()}`, { headers: authHeaders() });
  const data = await parseJson<{ reservations?: Reservation[] }>(res, "Failed to load reservations");
  return data.reservations ?? [];
}

export async function patchReservationStatus(
  reservationId: number,
  status: string,
): Promise<Reservation> {
  const res = await fetch(`/api/restaurants/me/reservations/${reservationId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  const data = await parseJson<{ reservation: Reservation }>(res, "Could not update reservation");
  return data.reservation;
}

export async function submitFoodSafetyQuiz(
  restaurantId: number,
  body: {
    articleVersion: string;
    answers: Record<string, string>;
    termsAccepted: boolean;
    foodResponsibilityAccepted?: boolean;
  },
): Promise<{ passed: boolean; score: number }> {
  const res = await fetch(`/api/restaurants/${restaurantId}/food-safety`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Quiz submission failed");
}

export async function submitIdentityVerification(
  restaurantId: number,
  formData: FormData,
): Promise<{ status: string }> {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  const res = await fetch(`/api/restaurants/${restaurantId}/identity`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  return parseJson(res, "Identity submission failed");
}

export type PlaceOrderResult = {
  order: Order;
  payment?: {
    clientSecret?: string | null;
    paymentIntentId?: string | null;
    confirmationPinIssued?: boolean;
    message?: string;
    driverPolicy?: string;
    platformCommission?: number;
  };
  deduped?: boolean;
};

export async function placeRestaurantOrder(
  restaurantId: number,
  body: {
    fulfillment: "pickup" | "delivery";
    deliveryMethod?: "pickup" | "merchant" | "flexa";
    items: Array<{
      dailyMenuItemId: number;
      quantity: number;
      notes?: string;
      optionIds?: number[];
    }>;
    specialInstructions?: string;
    deliveryAddress?: string;
    deliveryLatitude?: number;
    deliveryLongitude?: number;
    /** Stable client key — retries must reuse the same value to prevent duplicate charges/orders. */
    idempotencyKey?: string;
  },
): Promise<PlaceOrderResult> {
  const res = await fetch(`/api/restaurants/${restaurantId}/orders`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      ...body,
      deliveryMethod: body.deliveryMethod || (body.fulfillment === "delivery" ? "merchant" : "pickup"),
    }),
  });
  return parseJson<PlaceOrderResult>(res, "Could not place order");
}

export async function confirmRestaurantOrderPin(orderId: number, pin: string): Promise<Order> {
  const res = await fetch(`/api/restaurants/me/orders/${orderId}/confirm-pin`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ pin }),
  });
  const data = await parseJson<{ order: Order }>(res, "Invalid confirmation PIN");
  return data.order;
}

export async function refundRestaurantOrder(orderId: number, reason?: string): Promise<Order> {
  const res = await fetch(`/api/restaurants/me/orders/${orderId}/refund`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  const data = await parseJson<{ order: Order }>(res, "Refund failed");
  return data.order;
}

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

export async function fetchDishOptions(restaurantId: number, dishId: number): Promise<DishOptionGroup[]> {
  const res = await fetch(`/api/restaurants/${restaurantId}/dish-models/${dishId}/options`, {
    headers: authHeaders(),
  });
  const data = await parseJson<{ groups?: DishOptionGroup[] }>(res, "Failed to load options");
  return data.groups ?? [];
}

export async function createDishOptionGroup(
  restaurantId: number,
  dishId: number,
  body: {
    name: string;
    kind?: string;
    required?: boolean;
    minSelect?: number;
    maxSelect?: number;
  },
): Promise<{ id: number }> {
  const res = await fetch(`/api/restaurants/${restaurantId}/dish-models/${dishId}/option-groups`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not create option group");
}

export async function createDishOption(
  restaurantId: number,
  groupId: number,
  body: {
    name: string;
    priceDelta?: number;
    soldOut?: boolean;
    allergens?: string;
  },
): Promise<{ id: number }> {
  const res = await fetch(`/api/restaurants/${restaurantId}/option-groups/${groupId}/options`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not create option");
}

export async function saveRestaurantHours(
  restaurantId: number,
  hours: Array<{
    weekday: number;
    isClosed: boolean;
    openTime: string | null;
    closeTime: string | null;
    overnight?: boolean;
  }>,
) {
  const res = await fetch(`/api/restaurants/${restaurantId}/hours`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ hours }),
  });
  return parseJson<{ hours: unknown[] }>(res, "Could not save hours");
}

export async function saveRestaurantDelivery(
  restaurantId: number,
  body: Record<string, unknown>,
) {
  const res = await fetch(`/api/restaurants/${restaurantId}/delivery`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not save delivery settings");
}

export async function fetchRestaurantDeliveryStaff(restaurantId: number) {
  const res = await fetch(`/api/restaurants/${restaurantId}/delivery-staff`, { headers: authHeaders() });
  const data = await parseJson<{ staff?: Array<{ id: number; displayName: string; phone: string; active: boolean }> }>(
    res,
    "Could not load delivery staff",
  );
  return data.staff ?? [];
}

export async function createRestaurantDeliveryStaff(
  restaurantId: number,
  body: { displayName: string; phone?: string; notes?: string },
) {
  const res = await fetch(`/api/restaurants/${restaurantId}/delivery-staff`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ staff: { id: number; displayName: string; phone: string; active: boolean } }>(
    res,
    "Could not add staff",
  );
  return data.staff;
}

export async function assignRestaurantOrderStaff(orderId: number, staffId: number) {
  const res = await fetch(`/api/restaurants/me/orders/${orderId}/assign-staff`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ staffId }),
  });
  const data = await parseJson<{ order: Order }>(res, "Could not assign staff");
  return data.order;
}

export async function reportRestaurantFailedDelivery(orderId: number, note: string) {
  const res = await fetch(`/api/restaurants/me/orders/${orderId}/failed-delivery`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ note }),
  });
  const data = await parseJson<{ order: Order }>(res, "Could not report failed delivery");
  return data.order;
}

/** Upload a food photo via the existing Flexa Market storage (Wasabi) proxy. */
export async function uploadRestaurantFoodImage(file: File): Promise<string> {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  if (!token) throw new Error("Sign in required to upload");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");
  const presignRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: file.name || "food.jpg", size: file.size, contentType: file.type }),
  });
  if (!presignRes.ok) {
    const err = await presignRes.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || "Upload URL failed");
  }
  const { uploadURL, objectPath } = await presignRes.json();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      Authorization: `Bearer ${token}`,
    },
    body: file,
  });
  if (!putRes.ok) throw new Error("Food image upload failed");
  const data = await putRes.json().catch(() => ({} as { url?: string }));
  if (typeof data?.url === "string" && (data.url.startsWith("http") || data.url.startsWith("/api/storage/"))) {
    return data.url;
  }
  const path = String(objectPath || "").replace(/^\/objects/, "");
  return `/api/storage/objects${path.startsWith("/") ? path : `/${path}`}`;
}

export async function createRestaurantReservation(
  restaurantId: number,
  body: {
    dailyMenuItemId: number;
    quantity: number;
    reservationDate?: string;
    reservationTime?: string;
    fulfillment?: "pickup" | "delivery";
    specialInstructions?: string;
  },
): Promise<Reservation> {
  const res = await fetch(`/api/restaurants/${restaurantId}/reservations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ reservation: Reservation }>(res, "Could not create reservation");
  return data.reservation;
}

export function formatMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

export function statusLabelKey(kind: "restaurant" | "identity" | "order" | "reservation", status: string): string {
  const map: Record<string, Record<string, string>> = {
    restaurant: {
      draft: "statusDraft",
      pending_verification: "statusPendingVerification",
      pending_safety: "statusPendingSafety",
      published: "statusPublished",
      suspended: "statusSuspended",
      closed: "statusClosed",
    },
    identity: {
      unverified: "identityUnverified",
      pending_review: "identityPending",
      verified: "identityVerified",
      rejected: "identityRejected",
    },
    order: {
      pending_payment: "orderPendingPayment",
      pending: "orderPending",
      order_placed: "orderPlacedStatus",
      confirmed: "orderConfirmed",
      accepted: "orderAccepted",
      rejected: "orderRejected",
      preparing: "orderPreparing",
      ready_pickup: "orderReadyPickup",
      ready_for_pickup: "orderReadyPickup",
      out_for_delivery: "orderOutForDelivery",
      delivered: "orderDelivered",
      completed: "orderCompleted",
      canceled: "orderCancelled",
      cancelled: "orderCancelled",
      refund_pending: "orderRefundPending",
      refunded: "orderRefunded",
    },
    reservation: {
      pending: "reservationPending",
      confirmed: "reservationConfirmed",
      rejected: "reservationRejected",
      preparing: "reservationPreparing",
      ready: "reservationReady",
      completed: "reservationCompleted",
      cancelled: "reservationCancelled",
    },
  };
  return map[kind]?.[status] ?? status;
}