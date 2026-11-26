/**
 * Flexa Restaurant API — discover, owner CRUD, dish models, daily menus,
 * chat-first order requests, close-kitchen, duplicate-yesterday.
 * Identity gate: publish / create requires users.kyc_status === 'approved'.
 */
import { Router } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  restaurantsTable,
  restaurantDishModelsTable,
  restaurantDailyMenuItemsTable,
  restaurantOrderRequestsTable,
  conversationsTable,
  messagesTable,
  notificationsTable,
  type RestaurantScheduleJson,
  type RestaurantOrderItemJson,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { isOpenNow as computeIsOpenNow, type ScheduleItem } from "../lib/restaurantHours";
import { emitConvUpdate, emitNewMessage } from "../lib/socketServer";
import { publicDisplayName } from "../lib/publicDisplayName";
import { sendExpoPushToUser } from "../lib/expo-push";

const router = Router();

const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function normalizeSchedule(raw: unknown): RestaurantScheduleJson {
  const byDay = new Map<string, ScheduleItem>();
  if (Array.isArray(raw)) {
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const day = String(r.day || "").toLowerCase();
      if (!WEEKDAYS.includes(day as (typeof WEEKDAYS)[number])) continue;
      byDay.set(day, {
        day,
        isOpen: Boolean(r.isOpen),
        openTime: r.openTime != null ? String(r.openTime) : null,
        closeTime: r.closeTime != null ? String(r.closeTime) : null,
      });
    }
  }
  return WEEKDAYS.map((day) => {
    const existing = byDay.get(day);
    if (existing) return existing;
    return {
      day,
      isOpen: day !== "sunday",
      openTime: day === "sunday" ? null : "08:00",
      closeTime: day === "sunday" ? null : "22:00",
    };
  });
}

function todayYmd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function yesterdayYmd(d = new Date()): string {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return todayYmd(x);
}

function serializeRestaurant(
  row: typeof restaurantsTable.$inferSelect,
  opts?: { ownerVerified?: boolean },
) {
  const schedule = normalizeSchedule(row.schedule);
  const kitchenClosedDate = (row as { kitchenClosedDate?: string | null }).kitchenClosedDate ?? null;
  const kitchenClosedToday = kitchenClosedDate === todayYmd();
  const openBySchedule = computeIsOpenNow(schedule);
  return {
    id: row.id,
    ownerUserId: row.ownerUserId,
    name: row.name,
    bio: row.bio,
    cuisineTags: row.cuisineTags ?? [],
    phone: row.phone,
    coverPhotoUrl: row.coverPhotoUrl,
    logoUrl: row.logoUrl,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    schedule,
    offersDelivery: row.offersDelivery,
    deliveryFeeUsd: row.deliveryFeeUsd,
    deliveryEtaMinutes: row.deliveryEtaMinutes,
    deliveryNotes: row.deliveryNotes,
    isPublished: row.isPublished,
    kitchenClosedDate,
    kitchenClosedToday,
    isOpenNow: openBySchedule && !kitchenClosedToday,
    ownerVerified: Boolean(opts?.ownerVerified),
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function serializeOrder(row: typeof restaurantOrderRequestsTable.$inferSelect) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    buyerUserId: row.buyerUserId,
    ownerUserId: row.ownerUserId,
    status: row.status,
    fulfillment: row.fulfillment,
    items: Array.isArray(row.items) ? row.items : [],
    note: row.note,
    subtotalUsd: row.subtotalUsd,
    deliveryFeeUsd: row.deliveryFeeUsd,
    conversationId: row.conversationId,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

const ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
  "declined",
] as const;

function serializeDish(row: typeof restaurantDishModelsTable.$inferSelect) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    category: row.category,
    photoUrl: row.photoUrl,
    tags: row.tags ?? [],
    isAvailableByDefault: row.isAvailableByDefault,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

function serializeMenuItem(row: typeof restaurantDailyMenuItemsTable.$inferSelect) {
  return {
    id: row.id,
    restaurantId: row.restaurantId,
    menuDate: row.menuDate,
    dishModelId: row.dishModelId,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    category: row.category,
    photoUrl: row.photoUrl,
    available: row.available,
    soldOut: row.soldOut,
    portionLimit: row.portionLimit,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

async function requireKycApproved(userId: number): Promise<{ ok: true } | { ok: false; status: string }> {
  const [user] = await db
    .select({
      kycStatus: sql<string>`coalesce(kyc_status, 'not_submitted')`,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  const status = user?.kycStatus ?? "not_submitted";
  if (status !== "approved") return { ok: false, status };
  return { ok: true };
}

async function requireOwnedRestaurant(restaurantId: number, userId: number) {
  const [row] = await db
    .select()
    .from(restaurantsTable)
    .where(and(eq(restaurantsTable.id, restaurantId), eq(restaurantsTable.ownerUserId, userId)))
    .limit(1);
  return row ?? null;
}

function validateAddress(body: Record<string, unknown>): string | null {
  if (!String(body.addressLine1 || "").trim()) return "Street address is required";
  if (!String(body.city || "").trim()) return "City is required";
  if (!String(body.country || "").trim()) return "Country is required";
  return null;
}

async function ownerVerifiedMap(ownerIds: number[]): Promise<Map<number, boolean>> {
  const map = new Map<number, boolean>();
  const unique = [...new Set(ownerIds.filter((n) => Number.isFinite(n)))];
  if (unique.length === 0) return map;
  const rows = await db
    .select({
      id: usersTable.id,
      kycStatus: sql<string>`coalesce(kyc_status, 'not_submitted')`,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  for (const r of rows) map.set(r.id, r.kycStatus === "approved");
  return map;
}

// ─── Discover ────────────────────────────────────────────────────────────────

router.get("/restaurant", requireAuth, async (req, res): Promise<void> => {
  const q = String(req.query.q || "").trim();
  const cuisine = String(req.query.cuisine || "").trim();
  const openNow = req.query.openNow === "1" || req.query.openNow === "true";
  const offersDelivery = req.query.offersDelivery === "1" || req.query.offersDelivery === "true";

  const conds = [eq(restaurantsTable.isPublished, true)];
  if (offersDelivery) conds.push(eq(restaurantsTable.offersDelivery, true));
  if (q) {
    conds.push(
      or(
        ilike(restaurantsTable.name, `%${q}%`),
        ilike(restaurantsTable.bio, `%${q}%`),
        ilike(restaurantsTable.city, `%${q}%`),
      )!,
    );
  }
  if (cuisine) {
    conds.push(sql`${cuisine} = ANY(${restaurantsTable.cuisineTags})`);
  }

  const rows = await db
    .select()
    .from(restaurantsTable)
    .where(and(...conds))
    .orderBy(desc(restaurantsTable.updatedAt))
    .limit(100);

  const verified = await ownerVerifiedMap(rows.map((r) => r.ownerUserId));
  let list = rows.map((r) =>
    serializeRestaurant(r, { ownerVerified: verified.get(r.ownerUserId) === true }),
  );
  if (openNow) list = list.filter((r) => r.isOpenNow);
  res.json({ restaurants: list });
});

router.get("/restaurant/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(restaurantsTable)
    .where(eq(restaurantsTable.ownerUserId, req.userId!))
    .orderBy(desc(restaurantsTable.updatedAt));
  const verified = await ownerVerifiedMap(rows.map((r) => r.ownerUserId));
  res.json({
    restaurants: rows.map((r) =>
      serializeRestaurant(r, { ownerVerified: verified.get(r.ownerUserId) === true }),
    ),
  });
});

/** Must be registered before `/restaurant/:id` so "orders" is not parsed as an id. */
router.get("/restaurant/orders/mine", requireAuth, async (req, res): Promise<void> => {
  const role = String(req.query.role || "buyer");
  const cond =
    role === "owner"
      ? eq(restaurantOrderRequestsTable.ownerUserId, req.userId!)
      : eq(restaurantOrderRequestsTable.buyerUserId, req.userId!);
  const rows = await db
    .select({
      order: restaurantOrderRequestsTable,
      restaurantName: restaurantsTable.name,
    })
    .from(restaurantOrderRequestsTable)
    .leftJoin(restaurantsTable, eq(restaurantsTable.id, restaurantOrderRequestsTable.restaurantId))
    .where(cond)
    .orderBy(desc(restaurantOrderRequestsTable.createdAt))
    .limit(100);
  res.json({
    orders: rows.map((r) => ({
      ...serializeOrder(r.order),
      restaurantName: r.restaurantName ?? null,
    })),
  });
});

router.patch("/restaurant/orders/:orderId", requireAuth, async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  const [order] = await db
    .select()
    .from(restaurantOrderRequestsTable)
    .where(eq(restaurantOrderRequestsTable.id, orderId))
    .limit(1);
  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const isOwner = order.ownerUserId === req.userId;
  const isBuyer = order.buyerUserId === req.userId;
  if (!isOwner && !isBuyer) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }

  const nextStatus = String(req.body?.status || "").trim();
  if (!ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  if (isBuyer && !isOwner) {
    if (!(nextStatus === "cancelled" && order.status === "pending")) {
      res.status(403).json({ error: "Buyers can only cancel pending orders" });
      return;
    }
  }

  const [updated] = await db
    .update(restaurantOrderRequestsTable)
    .set({ status: nextStatus })
    .where(eq(restaurantOrderRequestsTable.id, orderId))
    .returning();

  const notifyUserId = isOwner ? order.buyerUserId : order.ownerUserId;
  await db
    .insert(notificationsTable)
    .values({
      userId: notifyUserId,
      actorId: req.userId!,
      type: "order_update",
      message: `Restaurant order #${orderId} is now ${nextStatus.replace(/_/g, " ")}`,
      referenceId: orderId,
    })
    .catch(() => {});
  void sendExpoPushToUser(notifyUserId, {
    title: "Order update",
    body: `Order #${orderId}: ${nextStatus.replace(/_/g, " ")}`,
    data: { type: "restaurant_order", orderId, url: "/restaurant/orders" },
  });

  res.json({ order: serializeOrder(updated) });
});

router.get("/restaurant/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid restaurant id" });
    return;
  }
  const [row] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!row) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const isOwner = row.ownerUserId === req.userId;
  if (!row.isPublished && !isOwner) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const verified = await ownerVerifiedMap([row.ownerUserId]);
  res.json({
    restaurant: serializeRestaurant(row, {
      ownerVerified: verified.get(row.ownerUserId) === true,
    }),
  });
});

router.post("/restaurant", requireAuth, async (req, res): Promise<void> => {
  const kyc = await requireKycApproved(req.userId!);
  if (!kyc.ok) {
    res.status(403).json({
      error: "Identity verification required before creating a restaurant",
      kycStatus: kyc.status,
      verificationStatus:
        kyc.status === "pending"
          ? "pending_review"
          : kyc.status === "rejected"
            ? "rejected"
            : "unverified",
    });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  if (!name) {
    res.status(400).json({ error: "Restaurant name is required" });
    return;
  }
  const addrErr = validateAddress(body);
  if (addrErr) {
    res.status(400).json({ error: addrErr });
    return;
  }

  const schedule = normalizeSchedule(body.schedule);
  const [created] = await db
    .insert(restaurantsTable)
    .values({
      ownerUserId: req.userId!,
      name,
      bio: body.bio != null ? String(body.bio) : null,
      cuisineTags: Array.isArray(body.cuisineTags)
        ? body.cuisineTags.map((t) => String(t).trim()).filter(Boolean)
        : [],
      phone: body.phone != null ? String(body.phone) : null,
      coverPhotoUrl: body.coverPhotoUrl != null ? String(body.coverPhotoUrl) : null,
      logoUrl: body.logoUrl != null ? String(body.logoUrl) : null,
      addressLine1: String(body.addressLine1).trim(),
      addressLine2: body.addressLine2 != null ? String(body.addressLine2) : null,
      city: String(body.city).trim(),
      state: body.state != null ? String(body.state) : null,
      postalCode: body.postalCode != null ? String(body.postalCode) : null,
      country: String(body.country || "HT").trim(),
      latitude: body.latitude != null ? Number(body.latitude) : null,
      longitude: body.longitude != null ? Number(body.longitude) : null,
      schedule,
      offersDelivery: Boolean(body.offersDelivery),
      deliveryFeeUsd: body.deliveryFeeUsd != null ? Number(body.deliveryFeeUsd) : null,
      deliveryEtaMinutes: body.deliveryEtaMinutes != null ? Number(body.deliveryEtaMinutes) : null,
      deliveryNotes: body.deliveryNotes != null ? String(body.deliveryNotes) : null,
      isPublished: Boolean(body.isPublished),
    })
    .returning();

  res.status(201).json({ restaurant: serializeRestaurant(created) });
});

router.patch("/restaurant/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  if (body.isPublished === true) {
    const kyc = await requireKycApproved(req.userId!);
    if (!kyc.ok) {
      res.status(403).json({
        error: "Identity verification required before publishing",
        kycStatus: kyc.status,
      });
      return;
    }
  }

  const patch: Partial<typeof restaurantsTable.$inferInsert> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.bio !== undefined) patch.bio = body.bio != null ? String(body.bio) : null;
  if (body.cuisineTags !== undefined) {
    patch.cuisineTags = Array.isArray(body.cuisineTags)
      ? body.cuisineTags.map((t) => String(t).trim()).filter(Boolean)
      : [];
  }
  if (body.phone !== undefined) patch.phone = body.phone != null ? String(body.phone) : null;
  if (body.coverPhotoUrl !== undefined) {
    patch.coverPhotoUrl = body.coverPhotoUrl != null ? String(body.coverPhotoUrl) : null;
  }
  if (body.logoUrl !== undefined) patch.logoUrl = body.logoUrl != null ? String(body.logoUrl) : null;
  if (body.addressLine1 != null) patch.addressLine1 = String(body.addressLine1).trim();
  if (body.addressLine2 !== undefined) {
    patch.addressLine2 = body.addressLine2 != null ? String(body.addressLine2) : null;
  }
  if (body.city != null) patch.city = String(body.city).trim();
  if (body.state !== undefined) patch.state = body.state != null ? String(body.state) : null;
  if (body.postalCode !== undefined) {
    patch.postalCode = body.postalCode != null ? String(body.postalCode) : null;
  }
  if (body.country != null) patch.country = String(body.country).trim();
  if (body.latitude !== undefined) {
    patch.latitude = body.latitude != null ? Number(body.latitude) : null;
  }
  if (body.longitude !== undefined) {
    patch.longitude = body.longitude != null ? Number(body.longitude) : null;
  }
  if (body.schedule !== undefined) patch.schedule = normalizeSchedule(body.schedule);
  if (body.offersDelivery !== undefined) patch.offersDelivery = Boolean(body.offersDelivery);
  if (body.deliveryFeeUsd !== undefined) {
    patch.deliveryFeeUsd = body.deliveryFeeUsd != null ? Number(body.deliveryFeeUsd) : null;
  }
  if (body.deliveryEtaMinutes !== undefined) {
    patch.deliveryEtaMinutes =
      body.deliveryEtaMinutes != null ? Number(body.deliveryEtaMinutes) : null;
  }
  if (body.deliveryNotes !== undefined) {
    patch.deliveryNotes = body.deliveryNotes != null ? String(body.deliveryNotes) : null;
  }
  if (body.isPublished !== undefined) patch.isPublished = Boolean(body.isPublished);

  const merged = { ...owned, ...patch };
  const addrErr = validateAddress({
    addressLine1: merged.addressLine1,
    city: merged.city,
    country: merged.country,
  });
  if (addrErr) {
    res.status(400).json({ error: addrErr });
    return;
  }

  const [updated] = await db
    .update(restaurantsTable)
    .set(patch)
    .where(eq(restaurantsTable.id, id))
    .returning();
  res.json({ restaurant: serializeRestaurant(updated) });
});

// ─── Dish models (Modèl Manje) ───────────────────────────────────────────────

router.get("/restaurant/:id/dish-models", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const rows = await db
    .select()
    .from(restaurantDishModelsTable)
    .where(eq(restaurantDishModelsTable.restaurantId, id))
    .orderBy(desc(restaurantDishModelsTable.updatedAt));
  res.json({ dishModels: rows.map(serializeDish) });
});

router.post("/restaurant/:id/dish-models", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const body = (req.body || {}) as Record<string, unknown>;
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  if (!name) {
    res.status(400).json({ error: "Dish name is required" });
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Valid price is required" });
    return;
  }
  const [created] = await db
    .insert(restaurantDishModelsTable)
    .values({
      restaurantId: id,
      name,
      description: body.description != null ? String(body.description) : null,
      price,
      currency: String(body.currency || "USD"),
      category: String(body.category || "main"),
      photoUrl: body.photoUrl != null ? String(body.photoUrl) : null,
      tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t)) : [],
      isAvailableByDefault: body.isAvailableByDefault !== false,
    })
    .returning();
  res.status(201).json({ dishModel: serializeDish(created) });
});

router.patch("/restaurant/:id/dish-models/:dishId", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const dishId = Number(req.params.dishId);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const [existing] = await db
    .select()
    .from(restaurantDishModelsTable)
    .where(
      and(
        eq(restaurantDishModelsTable.id, dishId),
        eq(restaurantDishModelsTable.restaurantId, id),
      ),
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Dish model not found" });
    return;
  }
  const body = (req.body || {}) as Record<string, unknown>;
  const patch: Partial<typeof restaurantDishModelsTable.$inferInsert> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.description !== undefined) {
    patch.description = body.description != null ? String(body.description) : null;
  }
  if (body.price != null) patch.price = Number(body.price);
  if (body.currency != null) patch.currency = String(body.currency);
  if (body.category != null) patch.category = String(body.category);
  if (body.photoUrl !== undefined) {
    patch.photoUrl = body.photoUrl != null ? String(body.photoUrl) : null;
  }
  if (body.tags !== undefined) {
    patch.tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t)) : [];
  }
  if (body.isAvailableByDefault !== undefined) {
    patch.isAvailableByDefault = Boolean(body.isAvailableByDefault);
  }
  const [updated] = await db
    .update(restaurantDishModelsTable)
    .set(patch)
    .where(eq(restaurantDishModelsTable.id, dishId))
    .returning();
  res.json({ dishModel: serializeDish(updated) });
});

router.delete("/restaurant/:id/dish-models/:dishId", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const dishId = Number(req.params.dishId);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  await db
    .delete(restaurantDishModelsTable)
    .where(
      and(
        eq(restaurantDishModelsTable.id, dishId),
        eq(restaurantDishModelsTable.restaurantId, id),
      ),
    );
  res.json({ ok: true });
});

router.post(
  "/restaurant/:id/dish-models/:dishId/duplicate",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const dishId = Number(req.params.dishId);
    const owned = await requireOwnedRestaurant(id, req.userId!);
    if (!owned) {
      res.status(404).json({ error: "Restaurant not found" });
      return;
    }
    const [src] = await db
      .select()
      .from(restaurantDishModelsTable)
      .where(
        and(
          eq(restaurantDishModelsTable.id, dishId),
          eq(restaurantDishModelsTable.restaurantId, id),
        ),
      )
      .limit(1);
    if (!src) {
      res.status(404).json({ error: "Dish model not found" });
      return;
    }
    const [created] = await db
      .insert(restaurantDishModelsTable)
      .values({
        restaurantId: id,
        name: `${src.name} (copy)`,
        description: src.description,
        price: src.price,
        currency: src.currency,
        category: src.category,
        photoUrl: src.photoUrl,
        tags: src.tags ?? [],
        isAvailableByDefault: src.isAvailableByDefault,
      })
      .returning();
    res.status(201).json({ dishModel: serializeDish(created) });
  },
);

// ─── Daily menu (Meni Chak Jou) ──────────────────────────────────────────────

router.get("/restaurant/:id/daily-menu", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const menuDate = String(req.query.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(menuDate)) {
    res.status(400).json({ error: "date (YYYY-MM-DD) is required" });
    return;
  }
  const [rest] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!rest) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const isOwner = rest.ownerUserId === req.userId;
  if (!rest.isPublished && !isOwner) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const rows = await db
    .select()
    .from(restaurantDailyMenuItemsTable)
    .where(
      and(
        eq(restaurantDailyMenuItemsTable.restaurantId, id),
        eq(restaurantDailyMenuItemsTable.menuDate, menuDate),
      ),
    )
    .orderBy(restaurantDailyMenuItemsTable.category, restaurantDailyMenuItemsTable.name);
  res.json({ items: rows.map(serializeMenuItem), date: menuDate });
});

router.post("/restaurant/:id/daily-menu", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const body = (req.body || {}) as Record<string, unknown>;
  const menuDate = String(body.menuDate || "").trim();
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(menuDate)) {
    res.status(400).json({ error: "menuDate (YYYY-MM-DD) is required" });
    return;
  }
  if (!name) {
    res.status(400).json({ error: "Item name is required" });
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Valid price is required" });
    return;
  }
  const [created] = await db
    .insert(restaurantDailyMenuItemsTable)
    .values({
      restaurantId: id,
      menuDate,
      dishModelId: body.dishModelId != null ? Number(body.dishModelId) : null,
      name,
      description: body.description != null ? String(body.description) : null,
      price,
      currency: String(body.currency || "USD"),
      category: String(body.category || "main"),
      photoUrl: body.photoUrl != null ? String(body.photoUrl) : null,
      available: body.available !== false,
      soldOut: Boolean(body.soldOut),
      portionLimit: body.portionLimit != null ? Number(body.portionLimit) : null,
    })
    .returning();
  res.status(201).json({ item: serializeMenuItem(created) });
});

router.post(
  "/restaurant/:id/daily-menu/import-model",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const owned = await requireOwnedRestaurant(id, req.userId!);
    if (!owned) {
      res.status(404).json({ error: "Restaurant not found" });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const dishModelId = Number(body.dishModelId);
    const menuDate = String(body.menuDate || "").trim();
    if (!Number.isFinite(dishModelId)) {
      res.status(400).json({ error: "dishModelId is required" });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(menuDate)) {
      res.status(400).json({ error: "menuDate (YYYY-MM-DD) is required" });
      return;
    }
    const [model] = await db
      .select()
      .from(restaurantDishModelsTable)
      .where(
        and(
          eq(restaurantDishModelsTable.id, dishModelId),
          eq(restaurantDishModelsTable.restaurantId, id),
        ),
      )
      .limit(1);
    if (!model) {
      res.status(404).json({ error: "Dish model not found" });
      return;
    }
    const [created] = await db
      .insert(restaurantDailyMenuItemsTable)
      .values({
        restaurantId: id,
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
      })
      .returning();
    res.status(201).json({ item: serializeMenuItem(created) });
  },
);

router.patch(
  "/restaurant/:id/daily-menu/:itemId",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const owned = await requireOwnedRestaurant(id, req.userId!);
    if (!owned) {
      res.status(404).json({ error: "Restaurant not found" });
      return;
    }
    const [existing] = await db
      .select()
      .from(restaurantDailyMenuItemsTable)
      .where(
        and(
          eq(restaurantDailyMenuItemsTable.id, itemId),
          eq(restaurantDailyMenuItemsTable.restaurantId, id),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    const body = (req.body || {}) as Record<string, unknown>;
    const patch: Partial<typeof restaurantDailyMenuItemsTable.$inferInsert> = {};
    if (body.name != null) patch.name = String(body.name).trim();
    if (body.description !== undefined) {
      patch.description = body.description != null ? String(body.description) : null;
    }
    if (body.price != null) patch.price = Number(body.price);
    if (body.currency != null) patch.currency = String(body.currency);
    if (body.category != null) patch.category = String(body.category);
    if (body.photoUrl !== undefined) {
      patch.photoUrl = body.photoUrl != null ? String(body.photoUrl) : null;
    }
    if (body.available !== undefined) patch.available = Boolean(body.available);
    if (body.soldOut !== undefined) patch.soldOut = Boolean(body.soldOut);
    if (body.portionLimit !== undefined) {
      patch.portionLimit = body.portionLimit != null ? Number(body.portionLimit) : null;
    }
    if (body.menuDate != null) patch.menuDate = String(body.menuDate);
    const [updated] = await db
      .update(restaurantDailyMenuItemsTable)
      .set(patch)
      .where(eq(restaurantDailyMenuItemsTable.id, itemId))
      .returning();
    res.json({ item: serializeMenuItem(updated) });
  },
);

router.delete(
  "/restaurant/:id/daily-menu/:itemId",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const itemId = Number(req.params.itemId);
    const owned = await requireOwnedRestaurant(id, req.userId!);
    if (!owned) {
      res.status(404).json({ error: "Restaurant not found" });
      return;
    }
    await db
      .delete(restaurantDailyMenuItemsTable)
      .where(
        and(
          eq(restaurantDailyMenuItemsTable.id, itemId),
          eq(restaurantDailyMenuItemsTable.restaurantId, id),
        ),
      );
    res.json({ ok: true });
  },
);

/** Duplicate yesterday's daily menu into today (skip items already present by name). */
router.post(
  "/restaurant/:id/daily-menu/duplicate-yesterday",
  requireAuth,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const owned = await requireOwnedRestaurant(id, req.userId!);
    if (!owned) {
      res.status(404).json({ error: "Restaurant not found" });
      return;
    }
    const targetDate = String(req.body?.menuDate || todayYmd()).trim();
    const sourceDate = String(req.body?.fromDate || yesterdayYmd()).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
      res.status(400).json({ error: "Invalid date" });
      return;
    }
    const source = await db
      .select()
      .from(restaurantDailyMenuItemsTable)
      .where(
        and(
          eq(restaurantDailyMenuItemsTable.restaurantId, id),
          eq(restaurantDailyMenuItemsTable.menuDate, sourceDate),
        ),
      );
    if (source.length === 0) {
      res.status(404).json({ error: `No menu found for ${sourceDate}` });
      return;
    }
    const existing = await db
      .select()
      .from(restaurantDailyMenuItemsTable)
      .where(
        and(
          eq(restaurantDailyMenuItemsTable.restaurantId, id),
          eq(restaurantDailyMenuItemsTable.menuDate, targetDate),
        ),
      );
    const existingNames = new Set(existing.map((e) => e.name.trim().toLowerCase()));
    const toInsert = source.filter((s) => !existingNames.has(s.name.trim().toLowerCase()));
    let created: typeof restaurantDailyMenuItemsTable.$inferSelect[] = [];
    if (toInsert.length > 0) {
      created = await db
        .insert(restaurantDailyMenuItemsTable)
        .values(
          toInsert.map((s) => ({
            restaurantId: id,
            menuDate: targetDate,
            dishModelId: s.dishModelId,
            name: s.name,
            description: s.description,
            price: s.price,
            currency: s.currency,
            category: s.category,
            photoUrl: s.photoUrl,
            available: s.available,
            soldOut: false,
            portionLimit: s.portionLimit,
          })),
        )
        .returning();
    }
    res.status(201).json({
      fromDate: sourceDate,
      menuDate: targetDate,
      copied: created.length,
      skipped: source.length - toInsert.length,
      items: [...existing, ...created].map(serializeMenuItem),
    });
  },
);

/** Force-close (or reopen) kitchen for a calendar day. */
router.post("/restaurant/:id/close-kitchen", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const closed = req.body?.closed !== false;
  const date = String(req.body?.date || todayYmd()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }
  const [updated] = await db
    .update(restaurantsTable)
    .set({ kitchenClosedDate: closed ? date : null })
    .where(eq(restaurantsTable.id, id))
    .returning();
  res.json({ restaurant: serializeRestaurant(updated) });
});

// ─── Order requests (chat-first) ─────────────────────────────────────────────

router.get("/restaurant/:id/orders", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const owned = await requireOwnedRestaurant(id, req.userId!);
  if (!owned) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  const rows = await db
    .select()
    .from(restaurantOrderRequestsTable)
    .where(eq(restaurantOrderRequestsTable.restaurantId, id))
    .orderBy(desc(restaurantOrderRequestsTable.createdAt))
    .limit(100);
  res.json({ orders: rows.map(serializeOrder) });
});

router.post("/restaurant/:id/orders", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const buyerId = req.userId!;
  const [rest] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!rest || !rest.isPublished) {
    res.status(404).json({ error: "Restaurant not found" });
    return;
  }
  if (rest.ownerUserId === buyerId) {
    res.status(400).json({ error: "Cannot order from your own restaurant" });
    return;
  }
  const serialized = serializeRestaurant(rest);
  if (!serialized.isOpenNow) {
    res.status(409).json({ error: "Kitchen is closed right now" });
    return;
  }

  const body = (req.body || {}) as Record<string, unknown>;
  const fulfillment = String(body.fulfillment || "pickup") === "delivery" ? "delivery" : "pickup";
  if (fulfillment === "delivery" && !rest.offersDelivery) {
    res.status(400).json({ error: "This restaurant does not offer delivery" });
    return;
  }
  const note = body.note != null ? String(body.note).slice(0, 500) : null;
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) {
    res.status(400).json({ error: "Add at least one menu item" });
    return;
  }

  const menuIds = rawItems
    .map((it) => Number((it as Record<string, unknown>).dailyMenuItemId))
    .filter((n) => Number.isFinite(n));
  const menuRows =
    menuIds.length > 0
      ? await db
          .select()
          .from(restaurantDailyMenuItemsTable)
          .where(
            and(
              eq(restaurantDailyMenuItemsTable.restaurantId, id),
              inArray(restaurantDailyMenuItemsTable.id, menuIds),
            ),
          )
      : [];
  const byId = new Map(menuRows.map((m) => [m.id, m]));

  const items: RestaurantOrderItemJson[] = [];
  for (const raw of rawItems) {
    const r = raw as Record<string, unknown>;
    const mid = Number(r.dailyMenuItemId);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(r.qty) || 1)));
    const menu = byId.get(mid);
    if (!menu || !menu.available || menu.soldOut) {
      res.status(400).json({ error: `Item unavailable: ${menu?.name || mid}` });
      return;
    }
    if (menu.menuDate !== todayYmd()) {
      res.status(400).json({ error: "Orders only accept today's daily menu items" });
      return;
    }
    items.push({
      dailyMenuItemId: menu.id,
      name: menu.name,
      unitPrice: Number(menu.price),
      currency: menu.currency || "USD",
      qty,
    });
  }

  const subtotalUsd = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
  const deliveryFeeUsd =
    fulfillment === "delivery" && rest.deliveryFeeUsd != null ? Number(rest.deliveryFeeUsd) : null;

  // Reuse open restaurant conversation between buyer and owner
  const [open] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.buyerId, buyerId),
        eq(conversationsTable.sellerId, rest.ownerUserId),
        eq(conversationsTable.conversationType, "restaurant"),
      ),
    )
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(1);

  let conversationId = open?.id ?? 0;
  if (!conversationId) {
    const [conv] = await db
      .insert(conversationsTable)
      .values({
        listingId: null,
        buyerId,
        sellerId: rest.ownerUserId,
        conversationType: "restaurant",
        lastMessage: `From Flexa Restaurant · ${rest.name}`,
        lastMessageAt: new Date(),
      })
      .returning();
    conversationId = conv.id;
  }

  const lines = items.map((it) => `• ${it.qty}× ${it.name} ($${it.unitPrice.toFixed(2)})`).join("\n");
  const preview = `From Flexa Restaurant · ${rest.name} · ${fulfillment} · $${subtotalUsd.toFixed(2)}`;
  const content = [
    preview,
    "",
    lines,
    note ? `\nNote: ${note}` : "",
    deliveryFeeUsd != null ? `\nDelivery fee: $${deliveryFeeUsd.toFixed(2)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const [msg] = await db
    .insert(messagesTable)
    .values({
      conversationId,
      senderId: buyerId,
      content,
      messageType: "text",
    })
    .returning();

  await db
    .update(conversationsTable)
    .set({ lastMessage: preview, lastMessageAt: msg.createdAt })
    .where(eq(conversationsTable.id, conversationId));

  const [order] = await db
    .insert(restaurantOrderRequestsTable)
    .values({
      restaurantId: id,
      buyerUserId: buyerId,
      ownerUserId: rest.ownerUserId,
      status: "pending",
      fulfillment,
      items,
      note,
      subtotalUsd,
      deliveryFeeUsd,
      conversationId,
    })
    .returning();

  await db
    .insert(notificationsTable)
    .values({
      userId: rest.ownerUserId,
      actorId: buyerId,
      type: "new_order",
      message: `New Flexa Restaurant order at ${rest.name}: $${subtotalUsd.toFixed(2)} (${fulfillment})`,
      referenceId: order.id,
    })
    .catch(() => {});

  void sendExpoPushToUser(rest.ownerUserId, {
    title: "New kitchen order",
    body: `${rest.name}: $${subtotalUsd.toFixed(2)} · ${fulfillment}`,
    data: { type: "restaurant_order", orderId: order.id, restaurantId: id, url: "/restaurant/orders" },
  });

  const [sender] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar: usersTable.avatar,
      isAdmin: usersTable.isAdmin,
      isSuperAdmin: usersTable.isSuperAdmin,
    })
    .from(usersTable)
    .where(eq(usersTable.id, buyerId))
    .limit(1);

  try {
    emitNewMessage(conversationId, {
      id: msg.id,
      conversationId,
      senderId: buyerId,
      senderName: publicDisplayName(sender?.name),
      senderAvatar: sender?.avatar ?? null,
      senderIsAdmin: !!(sender?.isAdmin || sender?.isSuperAdmin),
      content: msg.content,
      messageType: msg.messageType,
      mediaUrl: null,
      imageUrl: null,
      isRead: false,
      isListened: false,
      isDeleted: false,
      clientMessageId: null,
      createdAt: msg.createdAt.toISOString(),
    });
    emitConvUpdate(conversationId, {
      lastMessage: preview,
      lastMessageAt: msg.createdAt.toISOString(),
    });
  } catch {
    /* socket optional */
  }

  res.status(201).json({
    order: serializeOrder(order),
    conversationId,
  });
});

export default router;
