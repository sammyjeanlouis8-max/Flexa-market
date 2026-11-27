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
  streetAddress: string;
  latitude: number | null;
  longitude: number | null;
  status: string;
  identityStatus: string;
  foodSafetyCompleted: boolean;
  acceptsReservations: boolean;
  vacationMode: boolean;
  temporarilyClosed: boolean;
  avgRating: number;
  ratingCount: number;
  publicPickupAddress?: string | null;
  showPublicAddress?: boolean;
  fulfillment?: string;
  deliveryFee?: number;
  minOrderAmount?: number;
  isOpenNow?: boolean;
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
  availablePortions: number | null;
  soldOut: boolean;
  acceptsReservations: boolean;
  availableFrom: string;
  availableUntil: string;
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
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  specialInstructions: string;
  deliveryAddress: string | null;
  paymentNote: string;
  rejectionReason: string | null;
  items?: RestaurantOrderItem[];
  restaurantName?: string;
  createdAt: string;
  updatedAt: string;
};

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
  if (!res.ok) throw new Error((data as { error?: string }).error || fallbackMsg);
  return data as T;
}

export async function fetchRestaurants(params?: {
  q?: string;
  country?: string;
  cuisine?: string;
  openNow?: boolean;
  nearby?: boolean;
  lat?: number;
  lng?: number;
  mine?: boolean;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<Restaurant[]> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.cuisine) qs.set("cuisine", params.cuisine);
  if (params?.openNow) qs.set("openNow", "1");
  if (params?.nearby) qs.set("nearby", "1");
  if (params?.lat != null) qs.set("lat", String(params.lat));
  if (params?.lng != null) qs.set("lng", String(params.lng));
  if (params?.mine) qs.set("mine", "1");
  if (params?.status) qs.set("status", params.status);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const res = await fetch(`/api/restaurants?${qs.toString()}`, { headers: authHeaders() });
  const data = await parseJson<{ restaurants?: Restaurant[] }>(res, "Failed to load restaurants");
  return data.restaurants ?? [];
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
  if (params?.restaurantId != null) qs.set("restaurantId", String(params.restaurantId));
  if (params?.mine) qs.set("mine", "1");
  if (params?.status) qs.set("status", params.status);
  const res = await fetch(`/api/restaurants/orders?${qs.toString()}`, { headers: authHeaders() });
  const data = await parseJson<{ orders?: Order[] }>(res, "Failed to load orders");
  return data.orders ?? [];
}

export async function patchOrderStatus(orderId: number, status: string, rejectionReason?: string): Promise<Order> {
  const res = await fetch(`/api/restaurants/orders/${orderId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status, rejectionReason }),
  });
  const data = await parseJson<{ order: Order }>(res, "Could not update order");
  return data.order;
}

export async function fetchReservations(params?: {
  restaurantId?: number;
  mine?: boolean;
  status?: string;
}): Promise<Reservation[]> {
  const qs = new URLSearchParams();
  if (params?.restaurantId != null) qs.set("restaurantId", String(params.restaurantId));
  if (params?.mine) qs.set("mine", "1");
  if (params?.status) qs.set("status", params.status);
  const res = await fetch(`/api/restaurants/reservations?${qs.toString()}`, { headers: authHeaders() });
  const data = await parseJson<{ reservations?: Reservation[] }>(res, "Failed to load reservations");
  return data.reservations ?? [];
}

export async function patchReservationStatus(
  reservationId: number,
  status: string,
): Promise<Reservation> {
  const res = await fetch(`/api/restaurants/reservations/${reservationId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ status }),
  });
  const data = await parseJson<{ reservation: Reservation }>(res, "Could not update reservation");
  return data.reservation;
}

export async function submitFoodSafetyQuiz(
  restaurantId: number,
  body: { articleVersion: string; answers: Record<string, string>; termsAccepted: boolean },
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
      pending: "orderPending",
      accepted: "orderAccepted",
      rejected: "orderRejected",
      preparing: "orderPreparing",
      ready_pickup: "orderReadyPickup",
      out_for_delivery: "orderOutForDelivery",
      completed: "orderCompleted",
      cancelled: "orderCancelled",
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