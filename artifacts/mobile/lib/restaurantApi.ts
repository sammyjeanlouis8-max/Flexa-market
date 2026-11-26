/**
 * Flexa Restaurant API client — Market JWT session.
 * Toggle USE_RESTAURANT_MOCK for offline UI work when backend routes are not yet deployed.
 */
import { getApiBase } from "./api";
import { isOpenNow, todayYmd } from "./restaurantHours";
import type {
  CreateRestaurantInput,
  DailyMenuItem,
  DishModel,
  Restaurant,
  RestaurantFilters,
  UpsertDailyMenuItemInput,
  UpsertDishModelInput,
  DailyScheduleItem,
} from "./restaurantTypes";
import { DEFAULT_SCHEDULE } from "./restaurantTypes";

/** Flip to true only for local UI demos without a live DO backend. */
export const USE_RESTAURANT_MOCK = false;

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function headers(token: string): HeadersInit {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function mapRestaurant(row: Record<string, unknown>): Restaurant {
  const schedule = (Array.isArray(row.schedule) ? row.schedule : DEFAULT_SCHEDULE) as DailyScheduleItem[];
  return {
    id: Number(row.id),
    ownerUserId: Number(row.ownerUserId ?? row.owner_user_id),
    name: String(row.name ?? ""),
    bio: (row.bio as string | null) ?? null,
    cuisineTags: Array.isArray(row.cuisineTags)
      ? (row.cuisineTags as string[])
      : Array.isArray(row.cuisine_tags)
        ? (row.cuisine_tags as string[])
        : [],
    phone: (row.phone as string | null) ?? null,
    coverPhotoUrl: (row.coverPhotoUrl as string | null) ?? (row.cover_photo_url as string | null) ?? null,
    logoUrl: (row.logoUrl as string | null) ?? (row.logo_url as string | null) ?? null,
    addressLine1: String(row.addressLine1 ?? row.address_line1 ?? ""),
    addressLine2: (row.addressLine2 as string | null) ?? (row.address_line2 as string | null) ?? null,
    city: String(row.city ?? ""),
    state: (row.state as string | null) ?? null,
    postalCode: (row.postalCode as string | null) ?? (row.postal_code as string | null) ?? null,
    country: String(row.country ?? "HT"),
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
    schedule,
    offersDelivery: Boolean(row.offersDelivery ?? row.offers_delivery),
    deliveryFeeUsd:
      row.deliveryFeeUsd != null
        ? Number(row.deliveryFeeUsd)
        : row.delivery_fee_usd != null
          ? Number(row.delivery_fee_usd)
          : null,
    deliveryEtaMinutes:
      row.deliveryEtaMinutes != null
        ? Number(row.deliveryEtaMinutes)
        : row.delivery_eta_minutes != null
          ? Number(row.delivery_eta_minutes)
          : null,
    deliveryNotes: (row.deliveryNotes as string | null) ?? (row.delivery_notes as string | null) ?? null,
    isPublished: Boolean(row.isPublished ?? row.is_published),
    isOpenNow: row.isOpenNow != null ? Boolean(row.isOpenNow) : isOpenNow(schedule),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
  };
}

function mapDish(row: Record<string, unknown>): DishModel {
  return {
    id: Number(row.id),
    restaurantId: Number(row.restaurantId ?? row.restaurant_id),
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? "USD"),
    category: (row.category as DishModel["category"]) || "main",
    photoUrl: (row.photoUrl as string | null) ?? (row.photo_url as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    isAvailableByDefault: Boolean(
      row.isAvailableByDefault ?? row.is_available_by_default ?? true,
    ),
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
  };
}

function mapDailyItem(row: Record<string, unknown>): DailyMenuItem {
  return {
    id: Number(row.id),
    restaurantId: Number(row.restaurantId ?? row.restaurant_id),
    menuDate: String(row.menuDate ?? row.menu_date ?? todayYmd()),
    dishModelId:
      row.dishModelId != null
        ? Number(row.dishModelId)
        : row.dish_model_id != null
          ? Number(row.dish_model_id)
          : null,
    name: String(row.name ?? ""),
    description: (row.description as string | null) ?? null,
    price: Number(row.price ?? 0),
    currency: String(row.currency ?? "USD"),
    category: (row.category as DailyMenuItem["category"]) || "main",
    photoUrl: (row.photoUrl as string | null) ?? (row.photo_url as string | null) ?? null,
    available: Boolean(row.available ?? true),
    soldOut: Boolean(row.soldOut ?? row.sold_out ?? false),
    portionLimit:
      row.portionLimit != null
        ? Number(row.portionLimit)
        : row.portion_limit != null
          ? Number(row.portion_limit)
          : null,
    createdAt: String(row.createdAt ?? row.created_at ?? ""),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? ""),
  };
}

// ─── Mock adapter (dev only) ─────────────────────────────────────────────────

const mockRestaurants: Restaurant[] = [];
let mockDishSeq = 1;
let mockMenuSeq = 1;
let mockRestSeq = 1;
const mockDishes: DishModel[] = [];
const mockMenu: DailyMenuItem[] = [];

async function mockList(filters?: RestaurantFilters): Promise<Restaurant[]> {
  let list = mockRestaurants.filter((r) => r.isPublished);
  if (filters?.q) {
    const q = filters.q.toLowerCase();
    list = list.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cuisineTags.some((c) => c.toLowerCase().includes(q)),
    );
  }
  if (filters?.offersDelivery) list = list.filter((r) => r.offersDelivery);
  if (filters?.openNow) list = list.filter((r) => isOpenNow(r.schedule));
  if (filters?.cuisine) {
    const c = filters.cuisine.toLowerCase();
    list = list.filter((r) => r.cuisineTags.some((t) => t.toLowerCase().includes(c)));
  }
  return list.map((r) => ({ ...r, isOpenNow: isOpenNow(r.schedule) }));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchRestaurants(
  filters: RestaurantFilters | undefined,
  opts: AuthOpts,
): Promise<Restaurant[]> {
  if (USE_RESTAURANT_MOCK) return mockList(filters);

  const qs = new URLSearchParams();
  if (filters?.q) qs.set("q", filters.q);
  if (filters?.openNow) qs.set("openNow", "1");
  if (filters?.offersDelivery) qs.set("offersDelivery", "1");
  if (filters?.cuisine) qs.set("cuisine", filters.cuisine);
  const res = await fetch(`${getApiBase()}/restaurant?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Restaurants failed (${res.status})`));
  const rows = Array.isArray(data.restaurants) ? data.restaurants : [];
  return rows.map((r) => mapRestaurant(r as Record<string, unknown>));
}

export async function fetchMyRestaurants(opts: AuthOpts): Promise<Restaurant[]> {
  if (USE_RESTAURANT_MOCK) {
    return mockRestaurants.map((r) => ({ ...r, isOpenNow: isOpenNow(r.schedule) }));
  }
  const res = await fetch(`${getApiBase()}/restaurant/mine`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `My restaurants failed (${res.status})`));
  const rows = Array.isArray(data.restaurants) ? data.restaurants : [];
  return rows.map((r) => mapRestaurant(r as Record<string, unknown>));
}

export async function fetchRestaurant(
  id: number,
  opts: AuthOpts,
): Promise<Restaurant> {
  if (USE_RESTAURANT_MOCK) {
    const found = mockRestaurants.find((r) => r.id === id);
    if (!found) throw new Error("Restaurant not found");
    return { ...found, isOpenNow: isOpenNow(found.schedule) };
  }
  const res = await fetch(`${getApiBase()}/restaurant/${id}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Restaurant failed (${res.status})`));
  return mapRestaurant((data.restaurant ?? data) as Record<string, unknown>);
}

export async function createRestaurant(
  input: CreateRestaurantInput,
  opts: AuthOpts,
): Promise<Restaurant> {
  if (USE_RESTAURANT_MOCK) {
    const now = new Date().toISOString();
    const r: Restaurant = {
      id: mockRestSeq++,
      ownerUserId: 0,
      name: input.name,
      bio: input.bio ?? null,
      cuisineTags: input.cuisineTags ?? [],
      phone: input.phone ?? null,
      coverPhotoUrl: input.coverPhotoUrl ?? null,
      logoUrl: input.logoUrl ?? null,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      country: input.country,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      schedule: input.schedule,
      offersDelivery: input.offersDelivery,
      deliveryFeeUsd: input.deliveryFeeUsd ?? null,
      deliveryEtaMinutes: input.deliveryEtaMinutes ?? null,
      deliveryNotes: input.deliveryNotes ?? null,
      isPublished: Boolean(input.isPublished),
      isOpenNow: isOpenNow(input.schedule),
      createdAt: now,
      updatedAt: now,
    };
    mockRestaurants.push(r);
    return r;
  }
  const res = await fetch(`${getApiBase()}/restaurant`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Create restaurant failed (${res.status})`));
  return mapRestaurant((data.restaurant ?? data) as Record<string, unknown>);
}

export async function updateRestaurant(
  id: number,
  input: Partial<CreateRestaurantInput>,
  opts: AuthOpts,
): Promise<Restaurant> {
  if (USE_RESTAURANT_MOCK) {
    const idx = mockRestaurants.findIndex((r) => r.id === id);
    if (idx < 0) throw new Error("Restaurant not found");
    mockRestaurants[idx] = {
      ...mockRestaurants[idx],
      ...input,
      schedule: input.schedule ?? mockRestaurants[idx].schedule,
      updatedAt: new Date().toISOString(),
      isOpenNow: isOpenNow(input.schedule ?? mockRestaurants[idx].schedule),
    };
    return mockRestaurants[idx];
  }
  const res = await fetch(`${getApiBase()}/restaurant/${id}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Update restaurant failed (${res.status})`));
  return mapRestaurant((data.restaurant ?? data) as Record<string, unknown>);
}

export async function fetchDishModels(
  restaurantId: number,
  opts: AuthOpts,
): Promise<DishModel[]> {
  if (USE_RESTAURANT_MOCK) {
    return mockDishes.filter((d) => d.restaurantId === restaurantId);
  }
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/dish-models`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Dish models failed (${res.status})`));
  const rows = Array.isArray(data.dishModels) ? data.dishModels : [];
  return rows.map((r) => mapDish(r as Record<string, unknown>));
}

export async function createDishModel(
  restaurantId: number,
  input: UpsertDishModelInput,
  opts: AuthOpts,
): Promise<DishModel> {
  if (USE_RESTAURANT_MOCK) {
    const now = new Date().toISOString();
    const d: DishModel = {
      id: mockDishSeq++,
      restaurantId,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      currency: input.currency ?? "USD",
      category: input.category,
      photoUrl: input.photoUrl ?? null,
      tags: input.tags ?? [],
      isAvailableByDefault: input.isAvailableByDefault ?? true,
      createdAt: now,
      updatedAt: now,
    };
    mockDishes.push(d);
    return d;
  }
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/dish-models`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Create dish model failed (${res.status})`));
  return mapDish((data.dishModel ?? data) as Record<string, unknown>);
}

export async function updateDishModel(
  restaurantId: number,
  dishId: number,
  input: Partial<UpsertDishModelInput>,
  opts: AuthOpts,
): Promise<DishModel> {
  if (USE_RESTAURANT_MOCK) {
    const idx = mockDishes.findIndex((d) => d.id === dishId && d.restaurantId === restaurantId);
    if (idx < 0) throw new Error("Dish model not found");
    mockDishes[idx] = { ...mockDishes[idx], ...input, updatedAt: new Date().toISOString() };
    return mockDishes[idx];
  }
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/dish-models/${dishId}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Update dish model failed (${res.status})`));
  return mapDish((data.dishModel ?? data) as Record<string, unknown>);
}

export async function deleteDishModel(
  restaurantId: number,
  dishId: number,
  opts: AuthOpts,
): Promise<void> {
  if (USE_RESTAURANT_MOCK) {
    const idx = mockDishes.findIndex((d) => d.id === dishId && d.restaurantId === restaurantId);
    if (idx >= 0) mockDishes.splice(idx, 1);
    return;
  }
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/dish-models/${dishId}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) {
    const data = await readJson(res);
    throw new Error(String(data.error || `Delete dish model failed (${res.status})`));
  }
}

export async function duplicateDishModel(
  restaurantId: number,
  dishId: number,
  opts: AuthOpts,
): Promise<DishModel> {
  if (USE_RESTAURANT_MOCK) {
    const src = mockDishes.find((d) => d.id === dishId && d.restaurantId === restaurantId);
    if (!src) throw new Error("Dish model not found");
    return createDishModel(
      restaurantId,
      {
        name: `${src.name} (copy)`,
        description: src.description,
        price: src.price,
        currency: src.currency,
        category: src.category,
        photoUrl: src.photoUrl,
        tags: [...src.tags],
        isAvailableByDefault: src.isAvailableByDefault,
      },
      opts,
    );
  }
  const res = await fetch(
    `${getApiBase()}/restaurant/${restaurantId}/dish-models/${dishId}/duplicate`,
    {
      method: "POST",
      headers: headers(opts.token),
      signal: opts.signal,
    },
  );
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Duplicate dish failed (${res.status})`));
  return mapDish((data.dishModel ?? data) as Record<string, unknown>);
}

export async function fetchDailyMenu(
  restaurantId: number,
  menuDate: string,
  opts: AuthOpts,
): Promise<DailyMenuItem[]> {
  if (USE_RESTAURANT_MOCK) {
    return mockMenu.filter((m) => m.restaurantId === restaurantId && m.menuDate === menuDate);
  }
  const qs = new URLSearchParams({ date: menuDate });
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/daily-menu?${qs}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Daily menu failed (${res.status})`));
  const rows = Array.isArray(data.items) ? data.items : [];
  return rows.map((r) => mapDailyItem(r as Record<string, unknown>));
}

export async function createDailyMenuItem(
  restaurantId: number,
  input: UpsertDailyMenuItemInput,
  opts: AuthOpts,
): Promise<DailyMenuItem> {
  if (USE_RESTAURANT_MOCK) {
    const now = new Date().toISOString();
    const item: DailyMenuItem = {
      id: mockMenuSeq++,
      restaurantId,
      menuDate: input.menuDate,
      dishModelId: input.dishModelId ?? null,
      name: input.name,
      description: input.description ?? null,
      price: input.price,
      currency: input.currency ?? "USD",
      category: input.category,
      photoUrl: input.photoUrl ?? null,
      available: input.available ?? true,
      soldOut: input.soldOut ?? false,
      portionLimit: input.portionLimit ?? null,
      createdAt: now,
      updatedAt: now,
    };
    mockMenu.push(item);
    return item;
  }
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/daily-menu`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Create menu item failed (${res.status})`));
  return mapDailyItem((data.item ?? data) as Record<string, unknown>);
}

export async function updateDailyMenuItem(
  restaurantId: number,
  itemId: number,
  input: Partial<UpsertDailyMenuItemInput>,
  opts: AuthOpts,
): Promise<DailyMenuItem> {
  if (USE_RESTAURANT_MOCK) {
    const idx = mockMenu.findIndex((m) => m.id === itemId && m.restaurantId === restaurantId);
    if (idx < 0) throw new Error("Menu item not found");
    mockMenu[idx] = { ...mockMenu[idx], ...input, updatedAt: new Date().toISOString() };
    return mockMenu[idx];
  }
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/daily-menu/${itemId}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(input),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Update menu item failed (${res.status})`));
  return mapDailyItem((data.item ?? data) as Record<string, unknown>);
}

export async function deleteDailyMenuItem(
  restaurantId: number,
  itemId: number,
  opts: AuthOpts,
): Promise<void> {
  if (USE_RESTAURANT_MOCK) {
    const idx = mockMenu.findIndex((m) => m.id === itemId && m.restaurantId === restaurantId);
    if (idx >= 0) mockMenu.splice(idx, 1);
    return;
  }
  const res = await fetch(`${getApiBase()}/restaurant/${restaurantId}/daily-menu/${itemId}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  if (!res.ok) {
    const data = await readJson(res);
    throw new Error(String(data.error || `Delete menu item failed (${res.status})`));
  }
}

export async function importDishModelToDailyMenu(
  restaurantId: number,
  dishModelId: number,
  menuDate: string,
  opts: AuthOpts,
): Promise<DailyMenuItem> {
  if (USE_RESTAURANT_MOCK) {
    const model = mockDishes.find((d) => d.id === dishModelId && d.restaurantId === restaurantId);
    if (!model) throw new Error("Dish model not found");
    return createDailyMenuItem(
      restaurantId,
      {
        menuDate,
        dishModelId: model.id,
        name: model.name,
        description: model.description,
        price: model.price,
        currency: model.currency,
        category: model.category,
        photoUrl: model.photoUrl,
        available: model.isAvailableByDefault,
        soldOut: false,
      },
      opts,
    );
  }
  const res = await fetch(
    `${getApiBase()}/restaurant/${restaurantId}/daily-menu/import-model`,
    {
      method: "POST",
      headers: headers(opts.token),
      body: JSON.stringify({ dishModelId, menuDate }),
      signal: opts.signal,
    },
  );
  const data = await readJson(res);
  if (!res.ok) throw new Error(String(data.error || `Import dish failed (${res.status})`));
  return mapDailyItem((data.item ?? data) as Record<string, unknown>);
}
