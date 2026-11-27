/**
 * Flexa Restaurant API — free launch (no commission / no mandatory subscription).
 * Restaurant delivery is owner-managed — never Flexa Market drivers.
 */
import { Router } from "express";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  restaurantsTable,
  restaurantIdentityVerificationsTable,
  restaurantOpeningHoursTable,
  restaurantDeliverySettingsTable,
  restaurantFoodSafetyAssessmentsTable,
  restaurantDishModelsTable,
  restaurantDailyMenusTable,
  restaurantDailyMenuItemsTable,
  restaurantOrdersTable,
  restaurantOrderItemsTable,
  restaurantReservationsTable,
  restaurantRatingsTable,
  restaurantDishCommentsTable,
  restaurantReportsTable,
  restaurantModerationLogsTable,
  restaurantNotificationsTable,
} from "@workspace/db";
import { getRole, requireAuth, requireAdmin, optionalAuth } from "../middlewares/auth";
import {
  FOOD_SAFETY_ARTICLE_VERSION,
  gradeFoodSafetyQuiz,
  publicQuizPayload,
} from "../lib/restaurantFoodSafety";
import {
  addDaysYmd,
  dishAvailabilityLabel,
  dishIsOrderableNow,
  isRestaurantOpenNow,
  localYmd,
} from "../lib/restaurantSchedule";
import {
  restaurantDocUpload,
  uploadRestaurantIdentityDoc,
  serveRestaurantIdentityDocument,
  publicIdentityStatus,
  latestIdentityForRestaurant,
} from "../lib/restaurantDocAccess";

const router = Router();

const PRIVACY_NOTICE =
  "Your identification documents and selfie are strictly confidential. They are used to verify your identity and protect the Flexa Market community. Only authorized Flexa Market security and verification personnel can access this information. Your documents and selfie will never appear on your public restaurant profile.";

function isStaff(user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined) {
  if (!user) return false;
  if (user.isSuperAdmin || user.isAdmin) return true;
  const role = String(getRole(user as any) || user.role || "").toLowerCase();
  return role === "superadmin" || role === "admin" || role === "moderator";
}

async function notify(userId: number, input: {
  restaurantId?: number | null;
  type: string;
  title: string;
  body?: string;
  href?: string;
}) {
  await db.insert(restaurantNotificationsTable).values({
    userId,
    restaurantId: input.restaurantId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    href: input.href ?? null,
  });
}

const HOME_KITCHEN_TYPES = new Set(["home_kitchen", "home-kitchen", "homekitchen"]);

function isHomeKitchenType(businessType: string | null | undefined) {
  return HOME_KITCHEN_TYPES.has(String(businessType || "").toLowerCase());
}

function normalizeBusinessType(raw: string | null | undefined) {
  const v = String(raw || "traditional").toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    restaurant: "traditional",
    restaurants: "traditional",
    traditional_restaurant: "traditional",
    home: "home_kitchen",
    homekitchen: "home_kitchen",
    truck: "food_truck",
    foodtruck: "food_truck",
    bakeries: "bakery",
    catering_service: "catering",
  };
  return aliases[v] || v;
}

type MenuPreviewShape = {
  id: number;
  name: string;
  photos: string[];
  price: number;
  currency: string;
  availableFrom: string;
  availableUntil: string;
  soldOut: boolean;
  availability: string;
  orderableNow: boolean;
  acceptsReservations: boolean;
};

function shapePublicRestaurant(
  row: typeof restaurantsTable.$inferSelect,
  extras?: {
    openNow?: boolean;
    delivery?: typeof restaurantDeliverySettingsTable.$inferSelect | null;
    hours?: Array<typeof restaurantOpeningHoursTable.$inferSelect>;
    menuPreview?: MenuPreviewShape[];
    distanceKm?: number | null;
  },
) {
  const homeKitchen = isHomeKitchenType(row.businessType);
  // Never expose private residential addresses for home kitchens.
  const allowPublicAddress = !homeKitchen && row.showPublicAddress;
  const serviceArea =
    homeKitchen
      ? `Serving ${[row.city, row.region || row.country].filter(Boolean).join(", ")}`
      : null;
  const publicAddress = allowPublicAddress
    ? (row.publicPickupAddress || row.streetAddress || null)
    : (homeKitchen ? null : (row.publicPickupAddress || null));
  const prepMinutes = extras?.delivery?.estimatedDeliveryMinutes ?? 30;

  return {
    id: row.id,
    ownerId: row.ownerId,
    businessType: normalizeBusinessType(row.businessType),
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    cuisineTags: row.cuisineTags ?? [],
    phone: row.phone,
    whatsapp: row.whatsapp,
    country: row.country,
    region: row.region,
    city: row.city,
    streetAddress: allowPublicAddress ? row.streetAddress : null,
    publicPickupAddress: publicAddress,
    showPublicAddress: allowPublicAddress,
    postalCode: allowPublicAddress ? row.postalCode : null,
    serviceArea,
    addressPrivacyNote: homeKitchen
      ? "Home Kitchen — Fresh, homemade meals prepared in a clean and safe kitchen. Address kept private for your safety."
      : null,
    latitude: allowPublicAddress || row.businessType === "food_truck" ? row.latitude : (homeKitchen ? null : row.latitude),
    longitude: allowPublicAddress || row.businessType === "food_truck" ? row.longitude : (homeKitchen ? null : row.longitude),
    timezone: row.timezone,
    status: row.status,
    identityStatus: row.identityStatus,
    identityVerifiedBadge: row.identityStatus === "verified",
    identityBadgeMeaning: "Identity verified only — not a food-safety inspection by Flexa Market.",
    foodSafetyCompleted: row.foodSafetyCompleted,
    acceptsReservations: row.acceptsReservations,
    acceptsNextDayReservations: row.acceptsNextDayReservations,
    vacationMode: row.vacationMode,
    temporarilyClosed: row.temporarilyClosed,
    avgRating: row.avgRating,
    ratingCount: row.ratingCount,
    profileViews: row.profileViews,
    subscriptionPlan: "free",
    subscriptionEnforced: false,
    platformFees: { commission: 0, registrationFee: 0, monthlySubscription: 0 },
    openNow: extras?.openNow ?? false,
    isOpenNow: extras?.openNow ?? false,
    fulfillment: extras?.delivery?.fulfillment ?? "pickup",
    ownerManagedDelivery: extras?.delivery?.ownerManagedDelivery ?? true,
    deliveryManagedByRestaurant: true,
    deliveryDisclaimer: "Delivery is arranged and managed by this restaurant.",
    deliveryFee: extras?.delivery?.deliveryFee ?? 0,
    minOrderAmount: extras?.delivery?.minOrderAmount ?? 0,
    estimatedPrepMinutes: prepMinutes,
    estimatedDeliveryMinutes: extras?.delivery?.estimatedDeliveryMinutes ?? null,
    deliveryZones: extras?.delivery?.deliveryZones ?? [],
    hours: (extras?.hours ?? []).map((h) => ({
      weekday: h.weekday,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
      overnight: h.overnight,
    })),
    menuPreview: extras?.menuPreview ?? undefined,
    distanceKm: extras?.distanceKm ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOwnerRestaurant(ownerId: number, restaurantId?: number) {
  const cond = restaurantId
    ? and(eq(restaurantsTable.id, restaurantId), eq(restaurantsTable.ownerId, ownerId))
    : eq(restaurantsTable.ownerId, ownerId);
  const [row] = await db.select().from(restaurantsTable).where(cond!).limit(1);
  return row ?? null;
}

function shapeMenuItem(
  item: typeof restaurantDailyMenuItemsTable.$inferSelect,
  restaurant: typeof restaurantsTable.$inferSelect,
  menuDate: string,
) {
  const label = dishAvailabilityLabel(
    item,
    restaurant.timezone,
    {
      menuDate,
      acceptsReservations: restaurant.acceptsReservations && restaurant.acceptsNextDayReservations && item.acceptsReservations,
    },
  );
  return {
    id: item.id,
    dailyMenuId: item.dailyMenuId,
    restaurantId: item.restaurantId,
    dishModelId: item.dishModelId,
    name: item.name,
    description: item.description,
    photos: item.photos ?? [],
    price: item.price,
    currency: item.currency,
    category: item.category,
    ingredients: item.ingredients,
    allergens: item.allergens,
    availablePortions: item.availablePortions,
    soldCount: item.soldCount,
    soldOut: item.soldOut,
    availableFrom: item.availableFrom,
    availableUntil: item.availableUntil,
    recurringWeekdays: item.recurringWeekdays ?? [],
    acceptsReservations: item.acceptsReservations,
    availability: label,
    orderableNow: dishIsOrderableNow(item, restaurant.timezone, menuDate),
  };
}

/* ─── Launch / privacy ───────────────────────────────────────────────────── */

router.get("/restaurants/launch", (_req, res) => {
  res.json({
    native: true,
    freeLaunch: true,
    commission: 0,
    registrationFee: 0,
    monthlySubscriptionRequired: false,
    subscriptionEnforcementEnabled: false,
    ownerManagedDeliveryOnly: true,
    usesFlexaDrivers: false,
    privacyNotice: PRIVACY_NOTICE,
  });
});

router.get("/restaurants/food-safety/quiz", requireAuth, (_req, res) => {
  res.json(publicQuizPayload());
});

router.get("/restaurants/identity/privacy-notice", (_req, res) => {
  res.json({ notice: PRIVACY_NOTICE });
});

router.get("/restaurants/identity/document", requireAuth, serveRestaurantIdentityDocument);

/* ─── Discover ───────────────────────────────────────────────────────────── */

router.get("/restaurants", async (req, res): Promise<void> => {
  const q = String(req.query.q || "").trim();
  const country = String(req.query.country || "").trim();
  const cuisine = String(req.query.cuisine || "").trim();
  const fulfillment = String(req.query.fulfillment || "").trim();
  const businessTypeRaw = String(req.query.businessType || req.query.type || "").trim();
  const businessType = businessTypeRaw ? normalizeBusinessType(businessTypeRaw) : "";
  const openNowOnly = req.query.openNow === "1" || req.query.openNow === "true";
  const topRatedOnly = req.query.topRated === "1" || req.query.topRated === "true";
  const featuredOnly = req.query.featured === "1" || req.query.featured === "true";
  const includeMenuPreview = req.query.menuPreview === "1" || req.query.menuPreview === "true";
  const lat = req.query.lat != null ? Number(req.query.lat) : null;
  const lng = req.query.lng != null ? Number(req.query.lng) : null;
  const sortBy = String(req.query.sortBy || "rating");
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const conds = [eq(restaurantsTable.status, "published")];
  if (country) conds.push(sql`lower(${restaurantsTable.country}) = lower(${country})`);
  if (businessType && businessType !== "all") {
    conds.push(sql`lower(replace(${restaurantsTable.businessType}, '-', '_')) = ${businessType}`);
  }
  if (q) {
    conds.push(or(
      ilike(restaurantsTable.name, `%${q}%`),
      ilike(restaurantsTable.description, `%${q}%`),
      ilike(restaurantsTable.city, `%${q}%`),
      sql`EXISTS (
        SELECT 1 FROM unnest(${restaurantsTable.cuisineTags}) AS tag
        WHERE tag ILIKE ${`%${q}%`}
      )`,
      sql`EXISTS (
        SELECT 1 FROM restaurant_daily_menu_items dmi
        WHERE dmi.restaurant_id = ${restaurantsTable.id}
          AND dmi.name ILIKE ${`%${q}%`}
      )`,
    )!);
  }
  if (cuisine) conds.push(sql`${cuisine} = ANY(${restaurantsTable.cuisineTags})`);
  if (topRatedOnly || featuredOnly) conds.push(sql`${restaurantsTable.avgRating} >= 4.5`);

  const rows = await db
    .select()
    .from(restaurantsTable)
    .where(and(...conds))
    .orderBy(desc(restaurantsTable.avgRating), desc(restaurantsTable.publishedAt))
    .limit(Math.min(200, limit + offset + 40))
    .offset(0);

  const out = [];
  for (const row of rows) {
    const hours = await db.select().from(restaurantOpeningHoursTable).where(eq(restaurantOpeningHoursTable.restaurantId, row.id));
    const [delivery] = await db.select().from(restaurantDeliverySettingsTable).where(eq(restaurantDeliverySettingsTable.restaurantId, row.id)).limit(1);
    const openNow = isRestaurantOpenNow(hours, row.timezone, new Date(), {
      vacationMode: row.vacationMode,
      temporarilyClosed: row.temporarilyClosed,
    });
    if (openNowOnly && !openNow) continue;
    if (fulfillment === "pickup" && delivery && delivery.fulfillment === "delivery") continue;
    if (fulfillment === "delivery" && delivery && delivery.fulfillment === "pickup") continue;

    let distanceKm: number | null = null;
    if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && row.latitude != null && row.longitude != null) {
      const R = 6371;
      const dLat = ((row.latitude - lat) * Math.PI) / 180;
      const dLng = ((row.longitude - lng) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat * Math.PI) / 180) * Math.cos((row.latitude * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
      distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
    }

    let menuPreview: Array<ReturnType<typeof shapeMenuItem>> | undefined;
    if (includeMenuPreview) {
      const today = localYmd(row.timezone);
      const [menu] = await db.select().from(restaurantDailyMenusTable)
        .where(and(eq(restaurantDailyMenusTable.restaurantId, row.id), eq(restaurantDailyMenusTable.menuDate, today)))
        .limit(1);
      if (menu) {
        const items = await db.select().from(restaurantDailyMenuItemsTable)
          .where(eq(restaurantDailyMenuItemsTable.dailyMenuId, menu.id))
          .limit(4);
        menuPreview = items.map((i) => shapeMenuItem(i, row, today));
      } else {
        menuPreview = [];
      }
    }

    out.push(shapePublicRestaurant(row, {
      openNow,
      delivery: delivery ?? null,
      hours,
      menuPreview,
      distanceKm,
    }));
  }

  if (sortBy === "distance" && lat != null && lng != null) {
    out.sort((a, b) => {
      const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
      const dbv = b.distanceKm ?? Number.POSITIVE_INFINITY;
      return da - dbv;
    });
  } else if (sortBy === "name") {
    out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  }

  res.json({
    restaurants: out.slice(offset, offset + limit),
    total: out.length,
    freeLaunch: true,
    platformFees: { commission: 0, registrationFee: 0, monthlySubscription: 0 },
  });
});

router.get("/restaurants/mine", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(restaurantsTable).where(eq(restaurantsTable.ownerId, req.userId!)).orderBy(desc(restaurantsTable.updatedAt));
  res.json({ restaurants: rows.map((r: typeof restaurantsTable.$inferSelect) => shapePublicRestaurant(r)) });
});

router.get("/restaurants/me/orders", requireAuth, async (req, res): Promise<void> => {
  const orders = await db.select().from(restaurantOrdersTable)
    .where(eq(restaurantOrdersTable.customerId, req.userId!))
    .orderBy(desc(restaurantOrdersTable.createdAt))
    .limit(100);
  res.json({ orders });
});

router.patch("/restaurants/me/orders/:orderId", requireAuth, async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  const [order] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, order.restaurantId)).limit(1);
  const isOwner = restaurant?.ownerId === req.userId;
  const isCustomer = order.customerId === req.userId;
  if (!isOwner && !isCustomer && !isStaff(req.user)) { res.status(403).json({ error: "Forbidden" }); return; }

  const status = String(req.body?.status || "");
  const ownerStatuses = ["accepted", "rejected", "preparing", "ready_pickup", "out_for_delivery", "completed"];
  const customerStatuses = ["cancelled"];
  if (isOwner && !ownerStatuses.includes(status) && !isStaff(req.user)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  if (isCustomer && !isOwner && !customerStatuses.includes(status)) {
    res.status(400).json({ error: "Customers may only cancel when permitted" }); return;
  }
  if (status === "cancelled" && !["pending", "accepted"].includes(order.status)) {
    res.status(409).json({ error: "Order can no longer be cancelled" }); return;
  }

  const [updated] = await db.update(restaurantOrdersTable).set({
    status,
    rejectionReason: status === "rejected" ? String(req.body?.rejectionReason || "") : order.rejectionReason,
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, orderId)).returning();

  const notifyUser = isOwner ? order.customerId : restaurant!.ownerId;
  await notify(notifyUser, {
    restaurantId: order.restaurantId,
    type: "order_status",
    title: `Order #${orderId} → ${status}`,
    body: `Status updated to ${status}`,
    href: isOwner ? "/restaurant/orders" : "/restaurant/owner/orders",
  });
  res.json({ order: updated });
});

router.get("/restaurants/me/reservations", requireAuth, async (req, res): Promise<void> => {
  const rows = await db.select().from(restaurantReservationsTable)
    .where(eq(restaurantReservationsTable.customerId, req.userId!))
    .orderBy(desc(restaurantReservationsTable.createdAt))
    .limit(100);
  res.json({ reservations: rows });
});

router.patch("/restaurants/me/reservations/:reservationId", requireAuth, async (req, res): Promise<void> => {
  const reservationId = Number(req.params.reservationId);
  const [row] = await db.select().from(restaurantReservationsTable).where(eq(restaurantReservationsTable.id, reservationId)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, row.restaurantId)).limit(1);
  const isOwner = restaurant?.ownerId === req.userId;
  if (!isOwner && row.customerId !== req.userId && !isStaff(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  const status = String(req.body?.status || "");
  const allowed = ["confirmed", "rejected", "preparing", "ready", "completed", "cancelled"];
  if (!allowed.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
  const [updated] = await db.update(restaurantReservationsTable).set({ status, updatedAt: new Date() })
    .where(eq(restaurantReservationsTable.id, reservationId)).returning();
  const notifyUser = isOwner ? row.customerId : restaurant!.ownerId;
  await notify(notifyUser, {
    restaurantId: row.restaurantId,
    type: "reservation_status",
    title: `Reservation #${reservationId} → ${status}`,
    body: `${row.dishName} on ${row.reservationDate}`,
  });
  res.json({ reservation: updated });
});

router.get("/restaurants/me/notifications", requireAuth, async (req, res) => {
  const rows = await db.select().from(restaurantNotificationsTable)
    .where(eq(restaurantNotificationsTable.userId, req.userId!))
    .orderBy(desc(restaurantNotificationsTable.createdAt))
    .limit(50);
  res.json({ notifications: rows });
});


router.get("/restaurants/:id", optionalAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const isOwner = req.userId === row.ownerId;
  if (row.status !== "published" && !isOwner && !isStaff(req.user)) {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  await db.update(restaurantsTable).set({ profileViews: sql`${restaurantsTable.profileViews} + 1` }).where(eq(restaurantsTable.id, id));
  const hours = await db.select().from(restaurantOpeningHoursTable).where(eq(restaurantOpeningHoursTable.restaurantId, id));
  const [delivery] = await db.select().from(restaurantDeliverySettingsTable).where(eq(restaurantDeliverySettingsTable.restaurantId, id)).limit(1);
  const openNow = isRestaurantOpenNow(hours, row.timezone, new Date(), {
    vacationMode: row.vacationMode,
    temporarilyClosed: row.temporarilyClosed,
  });
  const payload: Record<string, unknown> = shapePublicRestaurant(row, { openNow, delivery: delivery ?? null, hours });
  if (isOwner || isStaff(req.user)) {
    payload.privateResidentialAddress = row.privateResidentialAddress;
    payload.streetAddress = row.streetAddress;
    payload.identity = publicIdentityStatus(await latestIdentityForRestaurant(id));
  }
  res.json({ restaurant: payload });
});

router.get("/restaurants/:id/daily-menu", optionalAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!restaurant || (restaurant.status !== "published" && req.userId !== restaurant.ownerId && !isStaff(req.user))) {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  const date = String(req.query.date || localYmd(restaurant.timezone));
  const [menu] = await db.select().from(restaurantDailyMenusTable)
    .where(and(eq(restaurantDailyMenusTable.restaurantId, id), eq(restaurantDailyMenusTable.menuDate, date)))
    .limit(1);
  if (!menu) { res.json({ menuDate: date, items: [] }); return; }
  const items = await db.select().from(restaurantDailyMenuItemsTable)
    .where(eq(restaurantDailyMenuItemsTable.dailyMenuId, menu.id));
  res.json({
    menuDate: date,
    title: menu.title,
    items: items.map((i: typeof restaurantDailyMenuItemsTable.$inferSelect) => shapeMenuItem(i, restaurant, date)),
  });
});

/* ─── Create / update restaurant ─────────────────────────────────────────── */

router.post("/restaurants", requireAuth, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const name = String(body.name || "").trim().slice(0, 120);
  const country = String(body.country || "").trim();
  const city = String(body.city || "").trim();
  if (name.length < 2 || !country || !city) {
    res.status(400).json({ error: "Name, country, and city are required" }); return;
  }
  const businessType = normalizeBusinessType(String(body.businessType || "traditional"));
  const homeKitchen = isHomeKitchenType(businessType);
  const [created] = await db.insert(restaurantsTable).values({
    ownerId: req.userId!,
    businessType,
    name,
    description: String(body.description || "").slice(0, 4000),
    logoUrl: body.logoUrl ? String(body.logoUrl) : null,
    coverUrl: body.coverUrl ? String(body.coverUrl) : null,
    cuisineTags: Array.isArray(body.cuisineTags) ? body.cuisineTags.map(String).slice(0, 12) : [],
    phone: body.phone ? String(body.phone).slice(0, 40) : null,
    whatsapp: body.whatsapp ? String(body.whatsapp).slice(0, 40) : null,
    country,
    region: body.region ? String(body.region) : null,
    city,
    streetAddress: String(body.streetAddress || ""),
    postalCode: body.postalCode ? String(body.postalCode) : null,
    latitude: body.latitude != null ? Number(body.latitude) : null,
    longitude: body.longitude != null ? Number(body.longitude) : null,
    timezone: String(body.timezone || "America/Port-au-Prince"),
    privateResidentialAddress: body.privateResidentialAddress
      ? String(body.privateResidentialAddress)
      : (homeKitchen ? String(body.streetAddress || "") : null),
    publicPickupAddress: body.publicPickupAddress ? String(body.publicPickupAddress) : null,
    // Home kitchens never publish residential street addresses.
    showPublicAddress: homeKitchen ? false : body.showPublicAddress !== false,
    permitsNote: body.permitsNote ? String(body.permitsNote) : null,
    status: "draft",
  }).returning();

  const defaultHours = Array.from({ length: 7 }, (_, weekday) => ({
    restaurantId: created.id,
    weekday,
    isClosed: weekday === 0,
    openTime: "08:00",
    closeTime: "20:00",
    overnight: false,
  }));
  await db.insert(restaurantOpeningHoursTable).values(defaultHours);
  await db.insert(restaurantDeliverySettingsTable).values({
    restaurantId: created.id,
    fulfillment: String(body.fulfillment || "pickup"),
    ownerManagedDelivery: true,
  });

  // Reuse approved Market KYC when present
  const [user] = await db.select({
    kycStatus: sql<string>`kyc_status`,
  }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
  if (user?.kycStatus === "approved") {
    await db.update(restaurantsTable).set({ identityStatus: "verified" }).where(eq(restaurantsTable.id, created.id));
  }

  res.status(201).json({ restaurant: shapePublicRestaurant(created) });
});

router.patch("/restaurants/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await loadOwnerRestaurant(req.userId!, id);
  if (!existing && !isStaff(req.user)) { res.status(404).json({ error: "Not found" }); return; }
  const row = existing ?? (await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const body = req.body ?? {};
  const patch: Partial<typeof restaurantsTable.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "name", "description", "logoUrl", "coverUrl", "phone", "whatsapp", "region", "city",
    "streetAddress", "postalCode", "timezone", "privateResidentialAddress", "publicPickupAddress",
    "permitsNote",
  ] as const) {
    if (body[key] != null) (patch as any)[key] = String(body[key]);
  }
  if (Array.isArray(body.cuisineTags)) patch.cuisineTags = body.cuisineTags.map(String).slice(0, 12);
  if (typeof body.showPublicAddress === "boolean") {
    const nextType = normalizeBusinessType(String(body.businessType || row.businessType));
    patch.showPublicAddress = isHomeKitchenType(nextType) ? false : body.showPublicAddress;
  }
  if (typeof body.vacationMode === "boolean") patch.vacationMode = body.vacationMode;
  if (typeof body.temporarilyClosed === "boolean") patch.temporarilyClosed = body.temporarilyClosed;
  if (typeof body.acceptsReservations === "boolean") patch.acceptsReservations = body.acceptsReservations;
  if (typeof body.acceptsNextDayReservations === "boolean") patch.acceptsNextDayReservations = body.acceptsNextDayReservations;
  if (body.latitude != null) patch.latitude = Number(body.latitude);
  if (body.longitude != null) patch.longitude = Number(body.longitude);
  if (body.businessType != null) {
    patch.businessType = normalizeBusinessType(String(body.businessType));
    if (isHomeKitchenType(patch.businessType)) patch.showPublicAddress = false;
  }

  if (body.publish === true) {
    if (row.identityStatus !== "verified") {
      res.status(400).json({ error: "Identity verification required before publishing" }); return;
    }
    if (!row.foodSafetyCompleted) {
      res.status(400).json({ error: "Food safety onboarding required before publishing" }); return;
    }
    patch.status = "published";
    patch.publishedAt = new Date();
  }

  const [updated] = await db.update(restaurantsTable).set(patch).where(eq(restaurantsTable.id, id)).returning();
  res.json({ restaurant: shapePublicRestaurant(updated) });
});

/* ─── Hours + delivery ───────────────────────────────────────────────────── */

router.put("/restaurants/:id/hours", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const hours = Array.isArray(req.body?.hours) ? req.body.hours : [];
  await db.delete(restaurantOpeningHoursTable).where(eq(restaurantOpeningHoursTable.restaurantId, id));
  const rows = hours.slice(0, 7).map((h: any) => ({
    restaurantId: id,
    weekday: Number(h.weekday),
    isClosed: !!h.isClosed,
    openTime: h.openTime ? String(h.openTime) : null,
    closeTime: h.closeTime ? String(h.closeTime) : null,
    overnight: !!h.overnight,
  })).filter((h: { weekday: number }) => h.weekday >= 0 && h.weekday <= 6);
  if (rows.length) await db.insert(restaurantOpeningHoursTable).values(rows);
  const saved = await db.select().from(restaurantOpeningHoursTable).where(eq(restaurantOpeningHoursTable.restaurantId, id));
  res.json({ hours: saved });
});

/** Food truck owners publish a current operating location — not continuous private GPS tracking. */
router.patch("/restaurants/:id/operating-location", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  if (normalizeBusinessType(restaurant.businessType) !== "food_truck") {
    res.status(400).json({ error: "Operating location updates are only for food trucks" }); return;
  }
  const body = req.body ?? {};
  const latitude = body.latitude != null ? Number(body.latitude) : null;
  const longitude = body.longitude != null ? Number(body.longitude) : null;
  if (latitude != null && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) {
    res.status(400).json({ error: "Invalid latitude" }); return;
  }
  if (longitude != null && (!Number.isFinite(longitude) || Math.abs(longitude) > 180)) {
    res.status(400).json({ error: "Invalid longitude" }); return;
  }
  const [updated] = await db.update(restaurantsTable).set({
    publicPickupAddress: body.locationLabel != null ? String(body.locationLabel).slice(0, 240) : restaurant.publicPickupAddress,
    city: body.city != null ? String(body.city).slice(0, 120) : restaurant.city,
    latitude: latitude ?? restaurant.latitude,
    longitude: longitude ?? restaurant.longitude,
    showPublicAddress: true,
    updatedAt: new Date(),
  }).where(eq(restaurantsTable.id, id)).returning();
  res.json({
    restaurant: shapePublicRestaurant(updated),
    note: "Published operating location only — Flexa does not continuously track private GPS.",
  });
});

router.get("/restaurants/:id/owner-stats", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant && !isStaff(req.user)) { res.status(404).json({ error: "Not found" }); return; }
  const orders = await db.select({
    status: restaurantOrdersTable.status,
  }).from(restaurantOrdersTable).where(eq(restaurantOrdersTable.restaurantId, id));
  const reservations = await db.select({
    status: restaurantReservationsTable.status,
  }).from(restaurantReservationsTable).where(eq(restaurantReservationsTable.restaurantId, id));
  const countStatus = (rows: Array<{ status: string }>, statuses: string[]) =>
    rows.filter((r) => statuses.includes(r.status)).length;
  res.json({
    restaurantId: id,
    orders: {
      new: countStatus(orders, ["pending"]),
      preparing: countStatus(orders, ["accepted", "preparing"]),
      ready: countStatus(orders, ["ready_pickup"]),
      outForDelivery: countStatus(orders, ["out_for_delivery"]),
      completed: countStatus(orders, ["completed"]),
      cancelled: countStatus(orders, ["cancelled", "rejected"]),
      total: orders.length,
    },
    reservations: {
      pending: countStatus(reservations, ["pending"]),
      confirmed: countStatus(reservations, ["confirmed", "preparing", "ready"]),
      total: reservations.length,
    },
    avgRating: restaurant?.avgRating ?? 0,
    ratingCount: restaurant?.ratingCount ?? 0,
    openNow: false,
    freeLaunch: true,
    platformFees: { commission: 0 },
  });
});

router.put("/restaurants/:id/delivery", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  const fulfillment = String(body.fulfillment || "pickup");
  if (!["pickup", "delivery", "both"].includes(fulfillment)) {
    res.status(400).json({ error: "Invalid fulfillment" }); return;
  }
  const values = {
    fulfillment,
    deliveryFee: Math.max(0, Number(body.deliveryFee) || 0),
    deliveryZones: Array.isArray(body.deliveryZones) ? body.deliveryZones.map(String) : [],
    minOrderAmount: Math.max(0, Number(body.minOrderAmount) || 0),
    estimatedDeliveryMinutes: Math.max(5, Number(body.estimatedDeliveryMinutes) || 45),
    deliveryInstructions: String(body.deliveryInstructions || ""),
    freeDeliveryMin: body.freeDeliveryMin != null ? Number(body.freeDeliveryMin) : null,
    ownerManagedDelivery: true,
    updatedAt: new Date(),
  };
  await db.insert(restaurantDeliverySettingsTable).values({ restaurantId: id, ...values })
    .onConflictDoUpdate({ target: restaurantDeliverySettingsTable.restaurantId, set: values });
  res.json({
    delivery: values,
    note: "Restaurant deliveries are managed by the restaurant owner — not Flexa Market drivers.",
  });
});

/* ─── Identity verification ──────────────────────────────────────────────── */

router.post(
  "/restaurants/:id/identity",
  requireAuth,
  restaurantDocUpload.fields([
    { name: "documentFront", maxCount: 1 },
    { name: "documentBack", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
  ]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const restaurant = await loadOwnerRestaurant(req.userId!, id);
    if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }

    if (req.body?.reuseMarketKyc === "true" || req.body?.reuseMarketKyc === true) {
      const [user] = await db.select({
        kycStatus: sql<string>`kyc_status`,
        name: usersTable.name,
        country: usersTable.country,
      }).from(usersTable).where(eq(usersTable.id, req.userId!)).limit(1);
      if (user?.kycStatus !== "approved") {
        res.status(400).json({ error: "Market KYC is not approved" }); return;
      }
      await db.insert(restaurantIdentityVerificationsTable).values({
        restaurantId: id,
        userId: req.userId!,
        legalName: user.name,
        countryOfResidence: user.country || restaurant.country,
        documentIssuingCountry: user.country || restaurant.country,
        documentType: "national_id",
        documentFrontKey: `restaurant-idv/${req.userId}/reused-market-kyc`,
        selfieKey: `restaurant-idv/${req.userId}/reused-market-kyc-selfie`,
        privacyNoticeAcceptedAt: new Date(),
        status: "verified",
        reusedMarketKyc: true,
        reviewedAt: new Date(),
      });
      await db.update(restaurantsTable).set({
        identityStatus: "verified",
        identityRejectionReason: null,
      }).where(eq(restaurantsTable.id, id));
      res.json({ identity: { status: "verified", reusedMarketKyc: true } });
      return;
    }

    if (req.body?.privacyAccepted !== "true" && req.body?.privacyAccepted !== true) {
      res.status(400).json({ error: "Privacy notice must be accepted", notice: PRIVACY_NOTICE }); return;
    }
    const legalName = String(req.body?.legalName || "").trim();
    const countryOfResidence = String(req.body?.countryOfResidence || "").trim();
    const documentIssuingCountry = String(req.body?.documentIssuingCountry || "").trim();
    const documentType = String(req.body?.documentType || "").trim();
    if (!legalName || !countryOfResidence || !documentIssuingCountry || !["passport", "national_id", "driving_license", "other"].includes(documentType)) {
      res.status(400).json({ error: "Invalid identity fields" }); return;
    }
    const files = req.files as { [k: string]: Express.Multer.File[] } | undefined;
    const front = files?.documentFront?.[0];
    const selfie = files?.selfie?.[0];
    if (!front || !selfie) { res.status(400).json({ error: "Document front and selfie are required" }); return; }

    const [frontUp, selfieUp] = await Promise.all([
      uploadRestaurantIdentityDoc(req.userId!, front.buffer, front.mimetype),
      uploadRestaurantIdentityDoc(req.userId!, selfie.buffer, selfie.mimetype),
    ]);
    if (!frontUp.key || !selfieUp.key) {
      res.status(500).json({ error: "Could not store documents privately" }); return;
    }
    let backKey: string | null = null;
    const back = files?.documentBack?.[0];
    if (back) {
      const backUp = await uploadRestaurantIdentityDoc(req.userId!, back.buffer, back.mimetype);
      backKey = backUp.key;
    }

    const [created] = await db.insert(restaurantIdentityVerificationsTable).values({
      restaurantId: id,
      userId: req.userId!,
      legalName,
      countryOfResidence,
      documentIssuingCountry,
      documentType,
      documentFrontKey: frontUp.key,
      documentBackKey: backKey,
      selfieKey: selfieUp.key,
      privacyNoticeAcceptedAt: new Date(),
      status: "pending_review",
    }).returning();

    await db.update(restaurantsTable).set({
      identityStatus: "pending_review",
      identityRejectionReason: null,
      status: restaurant.status === "draft" ? "pending_verification" : restaurant.status,
    }).where(eq(restaurantsTable.id, id));

    res.status(201).json({ identity: publicIdentityStatus(created), notice: PRIVACY_NOTICE });
  },
);

/* ─── Food safety ────────────────────────────────────────────────────────── */

router.post("/restaurants/:id/food-safety", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const answers = (req.body?.answers ?? {}) as Record<string, string>;
  if (req.body?.termsAccepted !== true) {
    res.status(400).json({ error: "You must accept the restaurant safety rules" }); return;
  }
  const graded = gradeFoodSafetyQuiz(answers);
  await db.insert(restaurantFoodSafetyAssessmentsTable).values({
    restaurantId: id,
    userId: req.userId!,
    articleVersion: FOOD_SAFETY_ARTICLE_VERSION,
    quizScore: graded.score,
    quizPassed: graded.passed,
    answers,
    termsAcceptedAt: new Date(),
  });
  if (graded.passed) {
    let nextStatus = restaurant.status;
    if (restaurant.status !== "published" && restaurant.status !== "suspended") {
      if (restaurant.identityStatus !== "verified") nextStatus = "pending_verification";
      else nextStatus = "draft"; // ready to publish (IDV + safety complete)
    }
    await db.update(restaurantsTable).set({
      foodSafetyCompleted: true,
      foodSafetyArticleVersion: FOOD_SAFETY_ARTICLE_VERSION,
      foodSafetyQuizScore: graded.score,
      foodSafetyCompletedAt: new Date(),
      termsAcceptedAt: new Date(),
      status: nextStatus,
    }).where(eq(restaurantsTable.id, id));
  }
  res.json({
    ...graded,
    articleVersion: FOOD_SAFETY_ARTICLE_VERSION,
    completed: graded.passed,
  });
});

/* ─── Dish models ────────────────────────────────────────────────────────── */

router.get("/restaurants/:id/dish-models", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const dishes = await db.select().from(restaurantDishModelsTable)
    .where(and(eq(restaurantDishModelsTable.restaurantId, id), eq(restaurantDishModelsTable.isDeleted, false)))
    .orderBy(desc(restaurantDishModelsTable.updatedAt));
  res.json({ dishes });
});

router.post("/restaurants/:id/dish-models", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  if (name.length < 2 || !Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Invalid dish" }); return;
  }
  const [dish] = await db.insert(restaurantDishModelsTable).values({
    restaurantId: id,
    name,
    description: String(body.description || ""),
    photos: Array.isArray(body.photos) ? body.photos.map(String).slice(0, 8) : [],
    price,
    currency: String(body.currency || "USD"),
    category: body.category ? String(body.category) : null,
    ingredients: String(body.ingredients || ""),
    allergens: String(body.allergens || ""),
    prepMinutes: Math.max(1, Number(body.prepMinutes) || 20),
    portionInfo: body.portionInfo ? String(body.portionInfo) : null,
    dietaryTags: Array.isArray(body.dietaryTags) ? body.dietaryTags.map(String) : [],
  }).returning();
  res.status(201).json({ dish });
});

router.patch("/restaurants/:id/dish-models/:dishId", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const dishId = Number(req.params.dishId);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  if (body.duplicate === true) {
    const [src] = await db.select().from(restaurantDishModelsTable)
      .where(and(eq(restaurantDishModelsTable.id, dishId), eq(restaurantDishModelsTable.restaurantId, id))).limit(1);
    if (!src) { res.status(404).json({ error: "Dish not found" }); return; }
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
    const [copy] = await db.insert(restaurantDishModelsTable).values({
      ...rest,
      name: `${src.name} (copy)`,
      isDeleted: false,
    }).returning();
    res.status(201).json({ dish: copy }); return;
  }
  if (body.delete === true) {
    await db.update(restaurantDishModelsTable).set({ isDeleted: true }).where(and(
      eq(restaurantDishModelsTable.id, dishId),
      eq(restaurantDishModelsTable.restaurantId, id),
    ));
    res.json({ ok: true }); return;
  }
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "description", "category", "ingredients", "allergens", "portionInfo", "currency"] as const) {
    if (body[k] != null) patch[k] = String(body[k]);
  }
  if (body.price != null) patch.price = Number(body.price);
  if (body.prepMinutes != null) patch.prepMinutes = Number(body.prepMinutes);
  if (Array.isArray(body.photos)) patch.photos = body.photos.map(String).slice(0, 8);
  if (Array.isArray(body.dietaryTags)) patch.dietaryTags = body.dietaryTags.map(String);
  const [dish] = await db.update(restaurantDishModelsTable).set(patch as any)
    .where(and(eq(restaurantDishModelsTable.id, dishId), eq(restaurantDishModelsTable.restaurantId, id)))
    .returning();
  res.json({ dish });
});

/* ─── Daily menu ─────────────────────────────────────────────────────────── */

router.post("/restaurants/:id/daily-menu/items", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const menuDate = String(req.body?.menuDate || localYmd(restaurant.timezone));
  const title = String(req.body?.title || "");
  let [menu] = await db.select().from(restaurantDailyMenusTable)
    .where(and(eq(restaurantDailyMenusTable.restaurantId, id), eq(restaurantDailyMenusTable.menuDate, menuDate))).limit(1);
  if (!menu) {
    [menu] = await db.insert(restaurantDailyMenusTable).values({ restaurantId: id, menuDate, title }).returning();
  } else if (title) {
    [menu] = await db.update(restaurantDailyMenusTable).set({ title }).where(eq(restaurantDailyMenusTable.id, menu.id)).returning();
  }

  const body = req.body ?? {};
  const itemsIn = Array.isArray(body.items)
    ? body.items
    : (body.name || body.dishModelId != null ? [body] : []);
  const createdItems = [];
  for (const raw of itemsIn.slice(0, 40)) {
    let name = String(raw.name || "").trim();
    let description = String(raw.description || "");
    let photos: string[] = Array.isArray(raw.photos) ? raw.photos.map(String) : [];
    let price = Number(raw.price);
    let dishModelId: number | null = raw.dishModelId != null ? Number(raw.dishModelId) : null;
    let ingredients = String(raw.ingredients || "");
    let allergens = String(raw.allergens || "");
    let category = raw.category ? String(raw.category) : null;
    if (dishModelId) {
      const [model] = await db.select().from(restaurantDishModelsTable)
        .where(and(eq(restaurantDishModelsTable.id, dishModelId), eq(restaurantDishModelsTable.restaurantId, id))).limit(1);
      if (model) {
        name = name || model.name;
        description = description || model.description;
        photos = photos.length ? photos : (model.photos ?? []);
        price = Number.isFinite(price) ? price : model.price;
        ingredients = ingredients || model.ingredients;
        allergens = allergens || model.allergens;
        category = category || model.category;
      }
    }
    if (!name || !Number.isFinite(price)) continue;
    const [item] = await db.insert(restaurantDailyMenuItemsTable).values({
      dailyMenuId: menu.id,
      restaurantId: id,
      dishModelId,
      name,
      description,
      photos,
      price,
      currency: String(raw.currency || "USD"),
      category,
      ingredients,
      allergens,
      availablePortions: raw.availablePortions != null ? Number(raw.availablePortions) : null,
      availableFrom: String(raw.availableFrom || "00:00"),
      availableUntil: String(raw.availableUntil || "23:59"),
      recurringWeekdays: Array.isArray(raw.recurringWeekdays) ? raw.recurringWeekdays.map(Number) : [],
      acceptsReservations: raw.acceptsReservations !== false,
    }).returning();
    createdItems.push(shapeMenuItem(item, restaurant, menuDate));
  }
  res.status(201).json({
    menuDate,
    items: createdItems,
    item: createdItems[0] ?? null,
  });
});

/* ─── Orders (no platform payment / commission) ──────────────────────────── */

router.post("/restaurants/:id/orders", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!restaurant || restaurant.status !== "published") {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  if (restaurant.ownerId === req.userId) {
    res.status(400).json({ error: "Owners cannot order from their own restaurant" }); return;
  }
  const body = req.body ?? {};
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 80) : null;
  if (idempotencyKey) {
    const [existing] = await db.select().from(restaurantOrdersTable)
      .where(eq(restaurantOrdersTable.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) { res.json({ order: existing, deduped: true }); return; }
  }

  const fulfillment = String(body.fulfillment || "pickup");
  const [delivery] = await db.select().from(restaurantDeliverySettingsTable)
    .where(eq(restaurantDeliverySettingsTable.restaurantId, id)).limit(1);
  if (fulfillment === "delivery" && delivery?.fulfillment === "pickup") {
    res.status(400).json({ error: "This restaurant is pickup only" }); return;
  }
  if (fulfillment === "pickup" && delivery?.fulfillment === "delivery") {
    res.status(400).json({ error: "This restaurant is delivery only" }); return;
  }

  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length) { res.status(400).json({ error: "Cart is empty" }); return; }

  try {
    const order = await db.transaction(async (tx: any) => {
      let subtotal = 0;
      const prepared: Array<{
        dailyMenuItemId: number;
        dishModelId: number | null;
        name: string;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
        notes: string;
      }> = [];

      for (const line of lines.slice(0, 30)) {
        const itemId = Number(line.dailyMenuItemId);
        const qty = Math.max(1, Math.floor(Number(line.quantity) || 1));
        const [item] = await tx.select().from(restaurantDailyMenuItemsTable)
          .where(eq(restaurantDailyMenuItemsTable.id, itemId)).limit(1);
        if (!item || item.restaurantId !== id) throw new Error("INVALID_ITEM");
        const [menu] = await tx.select().from(restaurantDailyMenusTable)
          .where(eq(restaurantDailyMenusTable.id, item.dailyMenuId)).limit(1);
        if (!menu || !dishIsOrderableNow(item, restaurant.timezone, menu.menuDate)) {
          throw new Error("NOT_AVAILABLE");
        }
        if (item.soldOut) throw new Error("SOLD_OUT");
        if (item.availablePortions != null) {
          const left = item.availablePortions - item.soldCount;
          if (left < qty) throw new Error("INSUFFICIENT");
          const nextSold = item.soldCount + qty;
          await tx.update(restaurantDailyMenuItemsTable).set({
            soldCount: nextSold,
            soldOut: nextSold >= item.availablePortions,
            updatedAt: new Date(),
          }).where(eq(restaurantDailyMenuItemsTable.id, item.id));
        }
        const lineTotal = item.price * qty;
        subtotal += lineTotal;
        prepared.push({
          dailyMenuItemId: item.id,
          dishModelId: item.dishModelId,
          name: item.name,
          unitPrice: item.price,
          quantity: qty,
          lineTotal,
          notes: String(line.notes || ""),
        });
      }

      const deliveryFee = fulfillment === "delivery" ? Number(delivery?.deliveryFee || 0) : 0;
      if (fulfillment === "delivery" && delivery && subtotal < Number(delivery.minOrderAmount || 0)) {
        throw new Error("MIN_ORDER");
      }

      const [created] = await tx.insert(restaurantOrdersTable).values({
        restaurantId: id,
        customerId: req.userId!,
        status: "pending",
        fulfillment,
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee,
        currency: "USD",
        specialInstructions: String(body.specialInstructions || "").slice(0, 1000),
        deliveryAddress: fulfillment === "delivery" ? String(body.deliveryAddress || "") : null,
        idempotencyKey,
        paymentNote: "Pay restaurant directly — Flexa charges no commission.",
      }).returning();

      await tx.insert(restaurantOrderItemsTable).values(
        prepared.map((p) => ({ orderId: created.id, ...p })),
      );
      return created;
    });

    await notify(restaurant.ownerId, {
      restaurantId: id,
      type: "new_order",
      title: "New restaurant order",
      body: `Order #${order.id} — pay arrangements are between you and the customer.`,
      href: `/restaurant/owner/orders`,
    });
    res.status(201).json({
      order,
      payment: { platformCommission: 0, message: "Pay the restaurant directly. Flexa Market charges no commission." },
    });
  } catch (err: any) {
    const code = String(err?.message || err);
    const map: Record<string, [number, string]> = {
      INVALID_ITEM: [400, "Invalid menu item"],
      NOT_AVAILABLE: [409, "Dish is not available now"],
      SOLD_OUT: [409, "Dish is sold out"],
      INSUFFICIENT: [409, "Not enough portions left"],
      MIN_ORDER: [400, "Below minimum order for delivery"],
    };
    const hit = map[code];
    if (hit) { res.status(hit[0]).json({ error: hit[1] }); return; }
    throw err;
  }
});

router.get("/restaurants/:id/orders", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const orders = await db.select().from(restaurantOrdersTable)
    .where(eq(restaurantOrdersTable.restaurantId, id))
    .orderBy(desc(restaurantOrdersTable.createdAt))
    .limit(100);
  res.json({ orders });
});



/* ─── Reservations ───────────────────────────────────────────────────────── */

router.post("/restaurants/:id/reservations", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!restaurant || restaurant.status !== "published") {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  if (!restaurant.acceptsReservations || !restaurant.acceptsNextDayReservations) {
    res.status(400).json({ error: "This restaurant does not accept advance reservations" }); return;
  }
  const body = req.body ?? {};
  const reservationDate = String(body.reservationDate || addDaysYmd(localYmd(restaurant.timezone), 1));
  const today = localYmd(restaurant.timezone);
  if (reservationDate < today) {
    res.status(400).json({ error: "Reservation date must be today or later" }); return;
  }
  const itemId = Number(body.dailyMenuItemId);
  const [item] = await db.select().from(restaurantDailyMenuItemsTable).where(eq(restaurantDailyMenuItemsTable.id, itemId)).limit(1);
  if (!item || item.restaurantId !== id || !item.acceptsReservations) {
    res.status(400).json({ error: "Dish is not reservable" }); return;
  }
  const qty = Math.max(1, Math.floor(Number(body.quantity) || 1));
  const [created] = await db.insert(restaurantReservationsTable).values({
    restaurantId: id,
    customerId: req.userId!,
    dailyMenuItemId: item.id,
    dishName: item.name,
    quantity: qty,
    reservationDate,
    reservationTime: String(body.reservationTime || item.availableFrom),
    fulfillment: String(body.fulfillment || "pickup"),
    specialInstructions: String(body.specialInstructions || "").slice(0, 1000),
    status: "pending",
  }).returning();
  await notify(restaurant.ownerId, {
    restaurantId: id,
    type: "new_reservation",
    title: "New reservation",
    body: `${item.name} × ${qty} on ${reservationDate}`,
    href: "/restaurant/owner/reservations",
  });
  res.status(201).json({ reservation: created });
});

router.get("/restaurants/:id/reservations", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const rows = await db.select().from(restaurantReservationsTable)
    .where(eq(restaurantReservationsTable.restaurantId, id))
    .orderBy(desc(restaurantReservationsTable.createdAt))
    .limit(100);
  res.json({ reservations: rows });
});



/* ─── Ratings + dish comments ────────────────────────────────────────────── */

router.post("/restaurants/:id/ratings", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const orderId = Number(req.body?.orderId);
  const stars = Math.round(Number(req.body?.stars));
  if (!Number.isFinite(stars) || stars < 1 || stars > 5) {
    res.status(400).json({ error: "Stars must be 1–5" }); return;
  }
  const [order] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, orderId)).limit(1);
  if (!order || order.restaurantId !== id || order.customerId !== req.userId || order.status !== "completed") {
    res.status(400).json({ error: "Completed order required for rating" }); return;
  }
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (restaurant?.ownerId === req.userId) {
    res.status(400).json({ error: "Owners cannot rate their own restaurant" }); return;
  }
  try {
    const [rating] = await db.insert(restaurantRatingsTable).values({
      restaurantId: id,
      customerId: req.userId!,
      orderId,
      stars,
    }).returning();
    const [{ avg, count }] = await db.select({
      avg: sql<number>`coalesce(avg(${restaurantRatingsTable.stars}), 0)`,
      count: sql<number>`count(*)::int`,
    }).from(restaurantRatingsTable).where(eq(restaurantRatingsTable.restaurantId, id));
    await db.update(restaurantsTable).set({ avgRating: Number(avg), ratingCount: Number(count) })
      .where(eq(restaurantsTable.id, id));
    res.status(201).json({ rating });
  } catch {
    res.status(409).json({ error: "Already rated this order" });
  }
});

router.post("/restaurants/:id/dish-comments", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const body = String(req.body?.body || "").trim();
  const orderId = Number(req.body?.orderId);
  if (body.length < 2) { res.status(400).json({ error: "Comment too short" }); return; }
  const [order] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, orderId)).limit(1);
  if (!order || order.restaurantId !== id || order.customerId !== req.userId || order.status !== "completed") {
    res.status(400).json({ error: "Completed order required for dish comments" }); return;
  }
  const [comment] = await db.insert(restaurantDishCommentsTable).values({
    restaurantId: id,
    customerId: req.userId!,
    orderId,
    dishModelId: req.body?.dishModelId != null ? Number(req.body.dishModelId) : null,
    dailyMenuItemId: req.body?.dailyMenuItemId != null ? Number(req.body.dailyMenuItemId) : null,
    body: body.slice(0, 2000),
  }).returning();
  res.status(201).json({ comment });
});

router.get("/restaurants/:id/dish-comments", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const rows = await db.select().from(restaurantDishCommentsTable)
    .where(and(eq(restaurantDishCommentsTable.restaurantId, id), eq(restaurantDishCommentsTable.isHidden, false)))
    .orderBy(desc(restaurantDishCommentsTable.createdAt))
    .limit(100);
  res.json({ comments: rows });
});

router.post("/restaurants/:id/dish-comments/:commentId/reply", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const commentId = Number(req.params.commentId);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const reply = String(req.body?.ownerReply || "").trim().slice(0, 2000);
  const [updated] = await db.update(restaurantDishCommentsTable).set({
    ownerReply: reply,
    ownerRepliedAt: new Date(),
  }).where(and(
    eq(restaurantDishCommentsTable.id, commentId),
    eq(restaurantDishCommentsTable.restaurantId, id),
  )).returning();
  res.json({ comment: updated });
});

/* ─── Reports + admin ────────────────────────────────────────────────────── */

router.post("/restaurants/:id/reports", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || "").trim();
  const allowed = ["unsafe_food", "spoiled", "hygiene", "misleading_photo", "wrong_ingredients", "allergens", "fraud", "non_delivery", "comment", "other"];
  if (!allowed.includes(reason)) { res.status(400).json({ error: "Invalid reason" }); return; }
  const [report] = await db.insert(restaurantReportsTable).values({
    restaurantId: id,
    reporterId: req.userId!,
    reason,
    details: String(req.body?.details || "").slice(0, 4000),
    dishCommentId: req.body?.dishCommentId != null ? Number(req.body.dishCommentId) : null,
    orderId: req.body?.orderId != null ? Number(req.body.orderId) : null,
  }).returning();
  res.status(201).json({ report: { id: report.id, status: report.status } });
});

router.get("/admin/restaurants", requireAuth, requireAdmin, async (_req, res) => {
  const rows = await db.select().from(restaurantsTable).orderBy(desc(restaurantsTable.updatedAt)).limit(200);
  res.json({ restaurants: rows.map((r: typeof restaurantsTable.$inferSelect) => shapePublicRestaurant(r)) });
});

router.get("/admin/restaurants/identity/pending", requireAuth, requireAdmin, async (_req, res) => {
  const rows = await db.select().from(restaurantIdentityVerificationsTable)
    .where(eq(restaurantIdentityVerificationsTable.status, "pending_review"))
    .orderBy(desc(restaurantIdentityVerificationsTable.createdAt))
    .limit(100);
  const restaurantIds = [...new Set(rows.map((r: typeof restaurantIdentityVerificationsTable.$inferSelect) => r.restaurantId))];
  const restaurants = restaurantIds.length
    ? await db.select({ id: restaurantsTable.id, name: restaurantsTable.name }).from(restaurantsTable)
      .where(inArray(restaurantsTable.id, restaurantIds))
    : [];
  const nameById = Object.fromEntries(restaurants.map((r: { id: number; name: string }) => [r.id, r.name]));
  res.json({
    submissions: rows.map((r: typeof restaurantIdentityVerificationsTable.$inferSelect) => ({
      ...publicIdentityStatus(r),
      restaurantName: nameById[r.restaurantId] ?? null,
      documentFrontUrl: `/api/restaurants/identity/document?key=${encodeURIComponent(r.documentFrontKey)}`,
      documentBackUrl: r.documentBackKey
        ? `/api/restaurants/identity/document?key=${encodeURIComponent(r.documentBackKey)}`
        : null,
      selfieUrl: `/api/restaurants/identity/document?key=${encodeURIComponent(r.selfieKey)}`,
    })),
  });
});

router.patch("/admin/restaurants/identity/:idvId/decide", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const idvId = Number(req.params.idvId);
  const decision = String(req.body?.decision || "");
  if (!["verified", "rejected"].includes(decision)) {
    res.status(400).json({ error: "decision must be verified or rejected" }); return;
  }
  const [row] = await db.select().from(restaurantIdentityVerificationsTable)
    .where(eq(restaurantIdentityVerificationsTable.id, idvId)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  const rejectionReason = decision === "rejected" ? String(req.body?.rejectionReason || "Documents unclear") : null;
  await db.update(restaurantIdentityVerificationsTable).set({
    status: decision,
    rejectionReason,
    reviewedBy: req.userId!,
    reviewedAt: new Date(),
  }).where(eq(restaurantIdentityVerificationsTable.id, idvId));
  await db.update(restaurantsTable).set({
    identityStatus: decision,
    identityRejectionReason: rejectionReason,
  }).where(eq(restaurantsTable.id, row.restaurantId));
  await db.insert(restaurantModerationLogsTable).values({
    restaurantId: row.restaurantId,
    actorId: req.userId!,
    action: `identity_${decision}`,
    details: rejectionReason || "approved",
  });
  await notify(row.userId, {
    restaurantId: row.restaurantId,
    type: "identity_decision",
    title: decision === "verified" ? "Restaurant identity verified" : "Restaurant identity rejected",
    body: rejectionReason || "You can publish after food safety onboarding.",
  });
  res.json({ ok: true });
});

router.patch("/admin/restaurants/:id/suspend", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const reason = String(req.body?.reason || "Under investigation").slice(0, 1000);
  const [updated] = await db.update(restaurantsTable).set({
    status: "suspended",
    identityStatus: "suspended",
    suspendedAt: new Date(),
    suspensionReason: reason,
  }).where(eq(restaurantsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  await db.insert(restaurantModerationLogsTable).values({
    restaurantId: id,
    actorId: req.userId!,
    action: "suspend",
    details: reason,
  });
  await notify(updated.ownerId, {
    restaurantId: id,
    type: "suspended",
    title: "Restaurant suspended",
    body: reason,
  });
  res.json({ restaurant: shapePublicRestaurant(updated) });
});

router.get("/restaurants/:id/stats", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const [orderStats] = await db.select({
    total: sql<number>`count(*)::int`,
    pending: sql<number>`count(*) filter (where ${restaurantOrdersTable.status} = 'pending')::int`,
    completed: sql<number>`count(*) filter (where ${restaurantOrdersTable.status} = 'completed')::int`,
    cancelled: sql<number>`count(*) filter (where ${restaurantOrdersTable.status} = 'cancelled')::int`,
  }).from(restaurantOrdersTable).where(eq(restaurantOrdersTable.restaurantId, id));
  const [resStats] = await db.select({
    upcoming: sql<number>`count(*) filter (where ${restaurantReservationsTable.status} in ('pending','confirmed','preparing','ready'))::int`,
  }).from(restaurantReservationsTable).where(eq(restaurantReservationsTable.restaurantId, id));
  res.json({
    stats: {
      ...orderStats,
      upcomingReservations: resStats?.upcoming ?? 0,
      avgRating: restaurant.avgRating,
      ratingCount: restaurant.ratingCount,
      profileViews: restaurant.profileViews,
      platformCommission: 0,
    },
  });
});


export default router;
