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
  conversationsTable,
} from "@workspace/db";
import { requireAuth, requireNotRestricted, requireSuperAdmin } from "../middlewares/auth";
import { publicDisplayName } from "../lib/publicDisplayName";
import { isValidBusinessPhone, normalizeDialablePhone } from "../lib/restaurantPhone";
import {
  assertCountryAllowsPublicOps,
  isCountryPubliclyActive,
  normalizeRestaurantCountryCode,
} from "../lib/restaurantCountryPolicy";
import {
  getRestaurantCountry,
  hasBlockingExpiredOrMissingPermits,
  listComplianceRequirements,
  listJurisdictions,
  listRegulatoryAuditLogs,
  listRestaurantCountries,
  upsertComplianceRequirement,
  upsertJurisdiction,
  upsertRestaurantCountry,
} from "../lib/restaurantCountryStore";
import {
  FOOD_SAFETY_ARTICLE_VERSION,
  gradeFoodSafetyQuiz,
  publicQuizPayload,
} from "../lib/restaurantFoodSafety";
import {
  addDaysYmd,
  dishAvailabilityLabel,
  dishIsOrderableNow,
  getRestaurantAvailabilityStatus,
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
import {
  RESTAURANT_PUBLIC_LAUNCH,
  RESTAURANT_PUBLIC_LISTING_STATUSES,
  RESTAURANT_FULFILLMENT_DISCLAIMER,
  RESTAURANT_DRIVER_POLICY,
  canAccessRestaurantModule,
  canAccessRestaurantStaff,
  canTransitionRestaurantOrder,
  normalizeRestaurantOrderStatus,
} from "../lib/restaurantAccess";
import { toMinorUnits, fromMinorUnits } from "../lib/restaurantMoney";
import {
  createRestaurantPaymentIntent,
  refundRestaurantOrder,
} from "../lib/restaurantStripe";

const router = Router();

const PRIVACY_NOTICE =
  "Your identification documents and selfie are strictly confidential. They are used to verify your identity and protect the Flexa Market community. Only authorized Flexa Market security and verification personnel can access this information. Your documents and selfie will never appear on your public restaurant profile.";

function isStaff(user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined) {
  return canAccessRestaurantStaff(user);
}

/** While public launch is false, require authenticated staff (or public launch). */
async function requireRestaurantAccess(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  if (RESTAURANT_PUBLIC_LAUNCH) {
    next();
    return;
  }
  await requireAuth(req, res, async () => {
    if (canAccessRestaurantModule(req.user)) {
      next();
      return;
    }
    res.status(403).json({ error: "Flexa Restaurant preview is Super Admin only" });
  });
}

async function requireRestaurantAuthAccess(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  await requireAuth(req, res, async () => {
    if (canAccessRestaurantModule(req.user)) {
      next();
      return;
    }
    res.status(403).json({ error: "Flexa Restaurant preview is Super Admin only" });
  });
}

async function appendOrderStatusHistory(input: {
  orderId: number;
  fromStatus: string | null;
  toStatus: string;
  actorId: number;
  note?: string;
}) {
  try {
    await db.execute(sql`
      INSERT INTO restaurant_order_status_history (order_id, from_status, to_status, actor_id, note)
      VALUES (${input.orderId}, ${input.fromStatus}, ${input.toStatus}, ${input.actorId}, ${input.note ?? ""})
    `);
  } catch (err) {
    // Table may not exist yet on a mid-deploy process; do not fail the status update.
    console.warn("restaurant order status history insert skipped", err);
  }
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
    availabilityStatus?: string;
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
    availabilityStatus: extras?.availabilityStatus
      ?? (extras?.openNow ? "open" : "closed"),
    fulfillment: extras?.delivery?.fulfillment ?? "pickup",
    ownerManagedDelivery: extras?.delivery?.ownerManagedDelivery ?? true,
    deliveryManagedByRestaurant: true,
    deliveryDisclaimer: RESTAURANT_FULFILLMENT_DISCLAIMER,
    driverPolicy: RESTAURANT_DRIVER_POLICY,
    usesFlexaDrivers: false,
    deliveryFee: extras?.delivery
      ? fromMinorUnits(extras.delivery.deliveryFeeMinor || toMinorUnits(extras.delivery.deliveryFee || 0))
      : 0,
    deliveryFeeMinor: extras?.delivery?.deliveryFeeMinor ?? toMinorUnits(extras?.delivery?.deliveryFee ?? 0),
    minOrderAmount: extras?.delivery
      ? fromMinorUnits(extras.delivery.minOrderAmountMinor || toMinorUnits(extras.delivery.minOrderAmount || 0))
      : 0,
    minOrderAmountMinor: extras?.delivery?.minOrderAmountMinor ?? 0,
    deliveryRadiusKm: extras?.delivery?.deliveryRadiusKm ?? null,
    freeDeliveryMin: extras?.delivery?.freeDeliveryMin ?? null,
    freeDeliveryMinMinor: extras?.delivery?.freeDeliveryMinMinor ?? null,
    pickupAvailable: extras?.delivery?.pickupAvailable ?? true,
    deliveryAvailable: extras?.delivery
      ? !!(extras.delivery.deliveryAvailable && !extras.delivery.deliverySuspended)
      : false,
    deliverySuspended: extras?.delivery?.deliverySuspended ?? false,
    estimatedPrepMinutes: extras?.delivery?.estimatedPrepMinutes ?? prepMinutes,
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

router.get("/restaurants/launch", async (_req, res) => {
  const countries = await listRestaurantCountries();
  res.json({
    native: true,
    freeLaunch: true,
    publicLaunch: RESTAURANT_PUBLIC_LAUNCH,
    commission: 0,
    registrationFee: 0,
    monthlySubscriptionRequired: false,
    subscriptionEnforcementEnabled: false,
    ownerManagedDeliveryOnly: true,
    usesFlexaDrivers: false,
    flexaDriverForbidden: true,
    fulfillmentDisclaimer: RESTAURANT_FULFILLMENT_DISCLAIMER,
    driverPolicy: RESTAURANT_DRIVER_POLICY,
    privacyNotice: PRIVACY_NOTICE,
    access: RESTAURANT_PUBLIC_LAUNCH ? "public" : "super_admin_preview",
    countryPolicy: {
      defaultDeny: true,
      legalDisclaimer:
        "Country availability reflects Flexa operational authorization only and does not eliminate legal responsibilities of Flexa Technology LLC or food businesses.",
      countries: countries.map((c) => ({
        countryCode: c.countryCode,
        countryName: c.countryName,
        status: c.status,
        enabled: c.enabled,
        publiclyActive: isCountryPubliclyActive(c),
        restaurantsEnabled: c.restaurantsEnabled,
        foodTrucksEnabled: c.foodTrucksEnabled,
        homeKitchensEnabled: c.homeKitchensEnabled,
      })),
    },
  });
});

router.get("/restaurants/food-safety/quiz", requireRestaurantAuthAccess, (_req, res) => {
  res.json(publicQuizPayload());
});

router.get("/restaurants/identity/privacy-notice", requireRestaurantAccess, (_req, res) => {
  res.json({ notice: PRIVACY_NOTICE });
});

router.get("/restaurants/identity/document", requireAuth, serveRestaurantIdentityDocument);

/* ─── Discover ───────────────────────────────────────────────────────────── */

router.get("/restaurants", requireRestaurantAccess, async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q || "").trim();
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
    const nearby = req.query.nearby === "1" || req.query.nearby === "true";
    const radiusKmRaw = req.query.radiusKm != null ? Number(req.query.radiusKm) : (nearby ? 25 : null);
    const radiusKm = radiusKmRaw != null && Number.isFinite(radiusKmRaw) ? Math.min(200, Math.max(1, radiusKmRaw)) : null;
    const sortBy = String(req.query.sortBy || ((nearby || (lat != null && lng != null)) ? "distance" : "rating"));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    // Country: prefer query, else authenticated profile. Never cross-country leak for non-staff.
    const queryCountry = String(req.query.country || "").trim();
    const profileCountry = String(req.user?.country || "").trim();
    const staff = isStaff(req.user);
    const country = queryCountry || profileCountry;
    if (!country && !staff) {
      res.status(400).json({ error: "Country is required for restaurant discovery" });
      return;
    }
    if (queryCountry && profileCountry && !staff && queryCountry.toLowerCase() !== profileCountry.toLowerCase()) {
      res.status(403).json({ error: "Cannot browse restaurants outside your selected country" });
      return;
    }
    if (country && !staff) {
      const countryRow = await getRestaurantCountry(country);
      const gate = assertCountryAllowsPublicOps(countryRow);
      if (!gate.ok) {
        res.status(403).json({ error: gate.error, code: gate.code, countryPolicy: countryRow, restaurants: [] });
        return;
      }
    }

    const conds = [
      sql`lower(${restaurantsTable.status}) IN ('published', 'approved')`,
    ];
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
      try {
        const hours = await db.select().from(restaurantOpeningHoursTable).where(eq(restaurantOpeningHoursTable.restaurantId, row.id));
        const [delivery] = await db.select().from(restaurantDeliverySettingsTable).where(eq(restaurantDeliverySettingsTable.restaurantId, row.id)).limit(1);
        const availabilityStatus = getRestaurantAvailabilityStatus(hours, row.timezone, new Date(), {
          vacationMode: row.vacationMode,
          temporarilyClosed: row.temporarilyClosed,
        });
        const openNow = availabilityStatus === "open" || availabilityStatus === "closing_soon";
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
        if (radiusKm != null && lat != null && lng != null) {
          // Nearby filter: keep businesses without coords after geo-capable ones, but never invent distance.
          if (distanceKm != null && distanceKm > radiusKm) continue;
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
          availabilityStatus,
          delivery: delivery ?? null,
          hours,
          menuPreview,
          distanceKm,
        }));
      } catch (rowErr) {
        // Skip a corrupt/partial row — do not fail the whole discover response.
        req.log?.warn?.({ err: rowErr, restaurantId: row.id }, "GET /restaurants skipped restaurant row");
      }
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

    // Successful query with zero eligible restaurants → 200 + empty array (never mask a DB failure).
    res.json({
      restaurants: out.slice(offset, offset + limit),
      total: out.length,
      freeLaunch: true,
      platformFees: { commission: 0, registrationFee: 0, monthlySubscription: 0 },
    });
  } catch (err) {
    req.log?.error?.({ err }, "GET /restaurants failed");
    const msg = err instanceof Error ? err.message : String(err);
    const missingRelation = /relation .* does not exist|undefined_table/i.test(msg);
    // Never expose SQL / stack traces to customers.
    res.status(500).json({
      error: "Unable to load nearby businesses. Please try again.",
      code: missingRelation ? "RESTAURANT_SCHEMA_MISSING" : "RESTAURANT_DISCOVER_FAILED",
      hint: missingRelation
        ? "Restaurant schema is not ready — run startup migrations (restaurants.create) before serving traffic."
        : undefined,
    });
  }
});

router.get("/restaurants/mine", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const rows = await db.select().from(restaurantsTable).where(eq(restaurantsTable.ownerId, req.userId!)).orderBy(desc(restaurantsTable.updatedAt));
  res.json({ restaurants: rows.map((r: typeof restaurantsTable.$inferSelect) => shapePublicRestaurant(r)) });
});

router.get("/restaurants/me/orders", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const orders = await db.select().from(restaurantOrdersTable)
    .where(eq(restaurantOrdersTable.customerId, req.userId!))
    .orderBy(desc(restaurantOrdersTable.createdAt))
    .limit(100);
  res.json({ orders });
});

router.patch("/restaurants/me/orders/:orderId", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  const [order] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, order.restaurantId)).limit(1);
  const isOwner = restaurant?.ownerId === req.userId;
  const isCustomer = order.customerId === req.userId;
  if (!isOwner && !isCustomer && !isStaff(req.user)) { res.status(403).json({ error: "Forbidden" }); return; }

  const status = normalizeRestaurantOrderStatus(String(req.body?.status || ""));
  if (req.body?.assignFlexaDriver || req.body?.driverId) {
    res.status(400).json({ error: "Flexa Driver cannot transport Flexa Restaurant food orders", policy: RESTAURANT_DRIVER_POLICY });
    return;
  }
  const ownerStatuses = [
    "confirmed", "rejected", "preparing",
    "ready_for_pickup", "out_for_delivery", "delivered", "completed", "refund_pending",
  ];
  const customerStatuses = ["canceled", "cancelled"];
  if (isOwner && !ownerStatuses.includes(status) && !isStaff(req.user)) {
    res.status(400).json({ error: "Invalid status" }); return;
  }
  if (isCustomer && !isOwner && !customerStatuses.includes(status)) {
    res.status(400).json({ error: "Customers may only cancel when permitted" }); return;
  }
  if (!isStaff(req.user) && !canTransitionRestaurantOrder(order.status, status)) {
    res.status(409).json({ error: `Invalid status transition ${order.status} → ${status}` }); return;
  }

  const [updated] = await db.update(restaurantOrdersTable).set({
    status,
    usesFlexaDrivers: false,
    rejectionReason: status === "rejected" ? String(req.body?.rejectionReason || "") : order.rejectionReason,
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, orderId)).returning();
  await appendOrderStatusHistory({
    orderId,
    fromStatus: order.status,
    toStatus: status,
    actorId: req.userId!,
    note: status === "rejected" ? String(req.body?.rejectionReason || "") : "",
  });
  // Notify the other party on every status change.
  const notifyUserId = isOwner ? order.customerId : restaurant?.ownerId;
  if (notifyUserId) {
    await notify(notifyUserId, {
      restaurantId: order.restaurantId,
      type: "order_status",
      title: `Order #${orderId} → ${status}`,
      body: `Status updated to ${status}. ${RESTAURANT_FULFILLMENT_DISCLAIMER}`,
      href: isOwner ? "/restaurant/my-orders" : "/restaurant/owner/orders",
    });
  }

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


router.get("/restaurants/:id", requireRestaurantAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const isOwner = req.userId === row.ownerId;
  if (!RESTAURANT_PUBLIC_LISTING_STATUSES.has(row.status) && !isOwner && !isStaff(req.user)) {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  await db.update(restaurantsTable).set({ profileViews: sql`${restaurantsTable.profileViews} + 1` }).where(eq(restaurantsTable.id, id));
  const hours = await db.select().from(restaurantOpeningHoursTable).where(eq(restaurantOpeningHoursTable.restaurantId, id));
  const [delivery] = await db.select().from(restaurantDeliverySettingsTable).where(eq(restaurantDeliverySettingsTable.restaurantId, id)).limit(1);
  const availabilityStatus = getRestaurantAvailabilityStatus(hours, row.timezone, new Date(), {
    vacationMode: row.vacationMode,
    temporarilyClosed: row.temporarilyClosed,
  });
  const openNow = availabilityStatus === "open" || availabilityStatus === "closing_soon";
  const payload: Record<string, unknown> = shapePublicRestaurant(row, {
    openNow,
    availabilityStatus,
    delivery: delivery ?? null,
    hours,
  });
  if (isOwner || isStaff(req.user)) {
    payload.privateResidentialAddress = row.privateResidentialAddress;
    payload.streetAddress = row.streetAddress;
    payload.identity = publicIdentityStatus(await latestIdentityForRestaurant(id));
  }
  res.json({ restaurant: payload });
});

/** Start (or resume) a Flexa Market chat with the restaurant owner — listingId stays null. */
router.post("/restaurants/:id/conversations", requireAuth, requireNotRestricted, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!restaurant) { res.status(404).json({ error: "Restaurant not found" }); return; }
  const isOwner = req.userId === restaurant.ownerId;
  if (!RESTAURANT_PUBLIC_LISTING_STATUSES.has(restaurant.status) && !isOwner && !isStaff(req.user)) {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  const sellerId = restaurant.ownerId;
  if (Number(req.userId) === Number(sellerId)) {
    res.status(400).json({ error: "Cannot message your own business" }); return;
  }
  const [existing] = await db.select().from(conversationsTable).where(and(
    eq(conversationsTable.restaurantId, id),
    eq(conversationsTable.buyerId, req.userId!),
    eq(conversationsTable.sellerId, sellerId),
  )).limit(1);
  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, sellerId)).limit(1);
  const preview = {
    listingTitle: restaurant.name,
    listingImage: restaurant.logoUrl || restaurant.coverUrl || null,
    listingPrice: 0,
    listingIsVideoOnly: false,
    restaurantId: restaurant.id,
    conversationType: "restaurant" as const,
  };
  if (existing) {
    res.json({
      id: existing.id,
      listingId: existing.listingId,
      restaurantId: existing.restaurantId ?? id,
      ...preview,
      otherUserId: sellerId,
      otherUserName: publicDisplayName(otherUser?.name, ""),
      otherUserAvatar: otherUser?.avatar ?? null,
      lastMessage: existing.lastMessage ?? null,
      lastMessageAt: existing.lastMessageAt?.toISOString() ?? null,
      unreadCount: 0,
    });
    return;
  }
  const [conv] = await db.insert(conversationsTable).values({
    listingId: null,
    restaurantId: id,
    buyerId: req.userId!,
    sellerId,
    conversationType: "restaurant",
  }).returning();
  res.status(201).json({
    id: conv.id,
    listingId: null,
    restaurantId: id,
    ...preview,
    otherUserId: sellerId,
    otherUserName: publicDisplayName(otherUser?.name, ""),
    otherUserAvatar: otherUser?.avatar ?? null,
    lastMessage: null,
    lastMessageAt: null,
    unreadCount: 0,
  });
});

router.get("/restaurants/:id/daily-menu", requireRestaurantAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!restaurant) {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  const isOwner = req.userId === restaurant.ownerId;
  const publiclyListed = RESTAURANT_PUBLIC_LISTING_STATUSES.has(restaurant.status);
  if (!publiclyListed && !isOwner && !isStaff(req.user)) {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  const date = String(req.query.date || localYmd(restaurant.timezone));
  const [menu] = await db.select().from(restaurantDailyMenusTable)
    .where(and(eq(restaurantDailyMenusTable.restaurantId, id), eq(restaurantDailyMenusTable.menuDate, date)))
    .limit(1);
  if (!menu) { res.json({ menuDate: date, items: [] }); return; }
  const items = await db.select().from(restaurantDailyMenuItemsTable)
    .where(eq(restaurantDailyMenuItemsTable.dailyMenuId, menu.id));
  const shaped = items
    .filter((i: typeof restaurantDailyMenuItemsTable.$inferSelect) => {
      if (isOwner || isStaff(req.user)) return true;
      const photos = i.photos ?? [];
      return Array.isArray(photos) && photos.length > 0 && !i.soldOut;
    })
    .map((i: typeof restaurantDailyMenuItemsTable.$inferSelect) => shapeMenuItem(i, restaurant, date));
  res.json({
    menuDate: date,
    title: menu.title,
    items: shaped,
  });
});

/* ─── Create / update restaurant ─────────────────────────────────────────── */

const ALLOWED_BUSINESS_TYPES = new Set([
  "traditional",
  "home_kitchen",
  "food_truck",
  "bakery",
  "catering",
]);

router.post("/restaurants", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const name = String(body.name || "").trim().slice(0, 120);
  const country = String(body.country || "").trim();
  const city = String(body.city || "").trim();
  const region = body.region != null ? String(body.region).trim() : "";
  const streetAddress = String(body.streetAddress || "").trim();
  const phone = body.phone != null ? String(body.phone).trim().slice(0, 40) : "";
  const description = String(body.description || "").trim().slice(0, 4000);
  const cuisineTags = Array.isArray(body.cuisineTags)
    ? body.cuisineTags.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 12)
    : [];
  const businessType = normalizeBusinessType(String(body.businessType || "traditional"));
  if (name.length < 2 || !country || !city) {
    res.status(400).json({ error: "Name, country, and city are required" }); return;
  }
  if (!ALLOWED_BUSINESS_TYPES.has(businessType)) {
    res.status(400).json({
      error: "Invalid business category",
      code: "INVALID_BUSINESS_TYPE",
      allowed: [...ALLOWED_BUSINESS_TYPES],
    });
    return;
  }
  if (!region || !streetAddress || !phone || !description || cuisineTags.length === 0) {
    res.status(400).json({
      error: "Region, address, phone, description, and cuisine are required",
      code: "INCOMPLETE_BUSINESS_INFO",
    });
    return;
  }
  if (!isValidBusinessPhone(phone)) {
    res.status(400).json({ error: "Invalid business phone number", code: "INVALID_PHONE" }); return;
  }
  const whatsappRaw = body.whatsapp != null ? String(body.whatsapp).trim() : "";
  if (whatsappRaw && !isValidBusinessPhone(whatsappRaw)) {
    res.status(400).json({ error: "Invalid WhatsApp number", code: "INVALID_WHATSAPP" }); return;
  }
  const contactEmailRaw = body.contactEmail != null ? String(body.contactEmail).trim().slice(0, 160) : "";
  if (contactEmailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmailRaw)) {
    res.status(400).json({ error: "Invalid business email", code: "INVALID_EMAIL" }); return;
  }
  const countryRow = await getRestaurantCountry(country);
  const code = normalizeRestaurantCountryCode(country);
  // United States and Canada: permanently blocked until Super Admin flips status away from suspended AND enables.
  if (code === "US" || code === "CA") {
    if (!isCountryPubliclyActive(countryRow)) {
      res.status(403).json({
        error: `Flexa Restaurant is disabled in ${countryRow.countryName}.`,
        code: "COUNTRY_DISABLED",
        countryPolicy: countryRow,
      });
      return;
    }
  }
  // Draft registration is allowed in under_review jurisdictions for authorized preview/staff.
  // Public publish still requires approved + enabled. US/CA remain hard-blocked above.
  if (!isStaff(req.user)) {
    if (countryRow.status === "suspended" || countryRow.status === "not_reviewed") {
      res.status(403).json({
        error: `Flexa Restaurant is not available in ${countryRow.countryName}.`,
        code: countryRow.status === "not_reviewed" ? "COUNTRY_NOT_REVIEWED" : "COUNTRY_DISABLED",
        countryPolicy: countryRow,
      });
      return;
    }
    if (isCountryPubliclyActive(countryRow)) {
      const gate = assertCountryAllowsPublicOps(countryRow, { businessType });
      if (!gate.ok) {
        res.status(403).json({ error: gate.error, code: gate.code, countryPolicy: countryRow });
        return;
      }
    }
    // under_review / restricted: allow draft creation so owners can submit for admin review.
  } else if (countryRow.status === "not_reviewed" && !isCountryPubliclyActive(countryRow)) {
    // Super Admin must open a regulatory review record before seeding test businesses.
    res.status(403).json({
      error: `No regulatory review record for ${countryRow.countryName}. Configure Country Availability first.`,
      code: "COUNTRY_NOT_REVIEWED",
      countryPolicy: countryRow,
    });
    return;
  }
  const homeKitchen = isHomeKitchenType(businessType);
  const permitsNoteParts = [
    body.permitsNote ? String(body.permitsNote) : "",
    contactEmailRaw ? `contactEmail:${contactEmailRaw}` : "",
  ].filter(Boolean);
  const [created] = await db.insert(restaurantsTable).values({
    ownerId: req.userId!,
    businessType,
    name,
    description,
    logoUrl: body.logoUrl ? String(body.logoUrl) : null,
    coverUrl: body.coverUrl ? String(body.coverUrl) : null,
    cuisineTags,
    phone: normalizeDialablePhone(phone).slice(0, 40) || null,
    whatsapp: whatsappRaw ? normalizeDialablePhone(whatsappRaw).slice(0, 40) : null,
    country,
    region: region || null,
    city,
    streetAddress,
    postalCode: body.postalCode ? String(body.postalCode) : null,
    latitude: body.latitude != null ? Number(body.latitude) : null,
    longitude: body.longitude != null ? Number(body.longitude) : null,
    timezone: String(body.timezone || "America/Port-au-Prince"),
    privateResidentialAddress: body.privateResidentialAddress
      ? String(body.privateResidentialAddress)
      : (homeKitchen ? streetAddress : null),
    publicPickupAddress: body.publicPickupAddress ? String(body.publicPickupAddress) : null,
    // Home kitchens never publish residential street addresses.
    showPublicAddress: homeKitchen ? false : body.showPublicAddress !== false,
    permitsNote: permitsNoteParts.length ? permitsNoteParts.join("\n") : null,
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

router.patch("/restaurants/:id", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await loadOwnerRestaurant(req.userId!, id);
  if (!existing && !isStaff(req.user)) { res.status(404).json({ error: "Not found" }); return; }
  const row = existing ?? (await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const body = req.body ?? {};
  const patch: Partial<typeof restaurantsTable.$inferInsert> = { updatedAt: new Date() };
  for (const key of [
    "name", "description", "logoUrl", "coverUrl", "region", "city",
    "streetAddress", "postalCode", "timezone", "privateResidentialAddress", "publicPickupAddress",
    "permitsNote",
  ] as const) {
    if (body[key] != null) (patch as any)[key] = String(body[key]);
  }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const phone = body.phone == null ? "" : String(body.phone).trim();
    if (phone && !isValidBusinessPhone(phone)) {
      res.status(400).json({ error: "Invalid business phone number", code: "INVALID_PHONE" }); return;
    }
    patch.phone = phone ? normalizeDialablePhone(phone).slice(0, 40) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "whatsapp")) {
    const wa = body.whatsapp == null ? "" : String(body.whatsapp).trim();
    if (wa && !isValidBusinessPhone(wa)) {
      res.status(400).json({ error: "Invalid WhatsApp number", code: "INVALID_WHATSAPP" }); return;
    }
    patch.whatsapp = wa ? normalizeDialablePhone(wa).slice(0, 40) : null;
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
  if (body.foodResponsibilityAccepted === true && !row.foodResponsibilityAcceptedAt) {
    patch.foodResponsibilityAcceptedAt = new Date();
  }
  if (body.contactEmail != null) {
    const email = String(body.contactEmail).trim().slice(0, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "Invalid business email", code: "INVALID_EMAIL" }); return;
    }
    const prior = String(row.permitsNote || "").split("\n").filter((line) => !line.startsWith("contactEmail:"));
    if (email) prior.unshift(`contactEmail:${email}`);
    patch.permitsNote = prior.filter(Boolean).join("\n") || null;
  }
  if (body.latitude != null) patch.latitude = Number(body.latitude);
  if (body.longitude != null) patch.longitude = Number(body.longitude);
  if (body.businessType != null) {
    patch.businessType = normalizeBusinessType(String(body.businessType));
    if (isHomeKitchenType(patch.businessType)) patch.showPublicAddress = false;
  }

  // Owners submit for review — only staff can force-publish after country approval.
  if (body.publish === true || body.submit === true) {
    const effectiveLogo = (patch.logoUrl as string | null | undefined) ?? row.logoUrl;
    const effectiveCover = (patch.coverUrl as string | null | undefined) ?? row.coverUrl;
    if (!effectiveLogo && !effectiveCover) {
      res.status(400).json({
        error: "At least one business image (logo or cover) is required before review",
        code: "IMAGE_REQUIRED",
      });
      return;
    }
    const effectivePhone = Object.prototype.hasOwnProperty.call(patch, "phone")
      ? (patch.phone as string | null)
      : row.phone;
    if (!isValidBusinessPhone(effectivePhone)) {
      res.status(400).json({
        error: "A valid public business phone number is required before approval",
        code: "BUSINESS_PHONE_REQUIRED",
      });
      return;
    }
    if (!row.name || String(row.name).trim().length < 2 || !row.city || !row.country) {
      res.status(400).json({ error: "Incomplete business profile", code: "INCOMPLETE_PROFILE" }); return;
    }
    // Soft gate for submit-for-review: identity / food-safety may still be in progress.
    // Hard publish still requires verified + food safety complete.
    if (body.publish === true) {
      if (row.identityStatus !== "verified") {
        res.status(400).json({ error: "Identity verification required before publishing" }); return;
      }
      if (!row.foodSafetyCompleted) {
        res.status(400).json({ error: "Food safety onboarding required before publishing" }); return;
      }
      if (!row.foodResponsibilityAcceptedAt && body.foodResponsibilityAccepted !== true) {
        res.status(400).json({ error: "Food business responsibility acknowledgment required before publishing" }); return;
      }
    } else if (body.submit === true) {
      if (body.foodResponsibilityAccepted === true && !row.foodResponsibilityAcceptedAt) {
        patch.foodResponsibilityAcceptedAt = new Date();
      }
    }
    const publishCountry = await getRestaurantCountry(row.country);
    if (isStaff(req.user) && body.publish === true && body.forcePublish === true) {
      if (!isCountryPubliclyActive(publishCountry)) {
        res.status(403).json({
          error: "Cannot publish publicly until the country is Approved and enabled in Country Availability.",
          code: "COUNTRY_NOT_APPROVED",
          countryPolicy: publishCountry,
        });
        return;
      }
      patch.status = "published";
      patch.publishedAt = new Date();
    } else if (body.submit === true) {
      // Draft → Under Review is allowed in preview/pending jurisdictions so admins can approve.
      // Public publish still requires an approved + enabled country.
      if (!isStaff(req.user)) {
        const code = normalizeRestaurantCountryCode(row.country);
        if (code === "US" || code === "CA") {
          if (!isCountryPubliclyActive(publishCountry)) {
            res.status(403).json({
              error: `Flexa Restaurant is disabled in ${publishCountry.countryName}.`,
              code: "COUNTRY_DISABLED",
              countryPolicy: publishCountry,
            });
            return;
          }
        }
        if (publishCountry.status === "suspended") {
          res.status(403).json({
            error: `Flexa Restaurant is not available in ${publishCountry.countryName}.`,
            code: "COUNTRY_DISABLED",
            countryPolicy: publishCountry,
          });
          return;
        }
      }
      patch.status = "submitted";
      patch.publishedAt = null;
    } else {
      const gate = assertCountryAllowsPublicOps(publishCountry, { businessType: row.businessType });
      if (!gate.ok && !isStaff(req.user)) {
        res.status(403).json({ error: gate.error, code: gate.code, countryPolicy: publishCountry });
        return;
      }
      patch.status = "submitted";
      patch.publishedAt = null;
    }
  }
  if (body.requestAdditionalInfo === true && isStaff(req.user)) {
    patch.status = "additional_info_required";
  }

  const [updated] = await db.update(restaurantsTable).set(patch).where(eq(restaurantsTable.id, id)).returning();
  res.json({ restaurant: shapePublicRestaurant(updated) });
});

/* ─── Hours + delivery ───────────────────────────────────────────────────── */

router.put("/restaurants/:id/hours", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
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
    rows.filter((r) => statuses.includes(normalizeRestaurantOrderStatus(r.status))).length;
  res.json({
    restaurantId: id,
    orders: {
      // Paid/new queue uses order_placed (legacy "pending"/"placed" normalize here).
      new: countStatus(orders, ["order_placed", "pending_payment"]),
      preparing: countStatus(orders, ["confirmed", "preparing"]),
      ready: countStatus(orders, ["ready_for_pickup"]),
      outForDelivery: countStatus(orders, ["out_for_delivery"]),
      completed: countStatus(orders, ["completed", "delivered"]),
      cancelled: countStatus(orders, ["canceled", "rejected", "refunded", "refund_pending"]),
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

router.put("/restaurants/:id/delivery", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  const fulfillment = String(body.fulfillment || "pickup");
  if (!["pickup", "delivery", "both"].includes(fulfillment)) {
    res.status(400).json({ error: "Invalid fulfillment" }); return;
  }
  const currency = "USD";
  const deliveryFee = Math.max(0, Number(body.deliveryFee) || 0);
  const minOrderAmount = Math.max(0, Number(body.minOrderAmount) || 0);
  const freeDeliveryMin = body.freeDeliveryMin != null ? Math.max(0, Number(body.freeDeliveryMin)) : null;
  const pickupAvailable = body.pickupAvailable != null ? !!body.pickupAvailable : fulfillment !== "delivery";
  const deliveryAvailable = body.deliveryAvailable != null ? !!body.deliveryAvailable : fulfillment !== "pickup";
  const values = {
    fulfillment,
    deliveryFee,
    deliveryFeeMinor: body.deliveryFeeMinor != null ? Math.max(0, Math.floor(Number(body.deliveryFeeMinor))) : toMinorUnits(deliveryFee, currency),
    deliveryZones: Array.isArray(body.deliveryZones) ? body.deliveryZones.map(String) : [],
    deliveryRadiusKm: Math.max(0.1, Number(body.deliveryRadiusKm) || 5),
    minOrderAmount,
    minOrderAmountMinor: body.minOrderAmountMinor != null ? Math.max(0, Math.floor(Number(body.minOrderAmountMinor))) : toMinorUnits(minOrderAmount, currency),
    estimatedPrepMinutes: Math.max(5, Number(body.estimatedPrepMinutes) || 30),
    estimatedDeliveryMinutes: Math.max(5, Number(body.estimatedDeliveryMinutes) || 45),
    deliveryInstructions: String(body.deliveryInstructions || RESTAURANT_FULFILLMENT_DISCLAIMER),
    freeDeliveryMin,
    freeDeliveryMinMinor: freeDeliveryMin != null ? toMinorUnits(freeDeliveryMin, currency) : null,
    pickupAvailable,
    deliveryAvailable,
    deliverySuspended: !!body.deliverySuspended,
    ownerManagedDelivery: true,
    updatedAt: new Date(),
  };
  await db.insert(restaurantDeliverySettingsTable).values({ restaurantId: id, ...values })
    .onConflictDoUpdate({ target: restaurantDeliverySettingsTable.restaurantId, set: values });
  res.json({
    delivery: values,
    disclaimer: RESTAURANT_FULFILLMENT_DISCLAIMER,
    driverPolicy: RESTAURANT_DRIVER_POLICY,
    usesFlexaDrivers: false,
    note: RESTAURANT_DRIVER_POLICY,
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
  if (req.body?.foodResponsibilityAccepted !== true) {
    res.status(400).json({ error: "You must acknowledge food preparation and delivery responsibility" }); return;
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
      foodResponsibilityAcceptedAt: new Date(),
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

router.post("/restaurants/:id/dish-models", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  const name = String(body.name || "").trim();
  const price = Number(body.price);
  const photos = Array.isArray(body.photos) ? body.photos.map(String).filter(Boolean).slice(0, 8) : [];
  const defaultAvailable = body.defaultAvailable !== false;
  if (name.length < 2 || !Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: "Invalid dish" }); return;
  }
  // Publicly orderable dishes require at least one food image.
  if (defaultAvailable && photos.length < 1) {
    res.status(400).json({ error: "At least one food image is required before a dish can be available" }); return;
  }
  const currency = String(body.currency || "USD");
  const [dish] = await db.insert(restaurantDishModelsTable).values({
    restaurantId: id,
    name,
    description: String(body.description || ""),
    photos,
    price,
    priceMinor: body.priceMinor != null ? Math.max(0, Math.floor(Number(body.priceMinor))) : toMinorUnits(price, currency),
    currency,
    category: body.category ? String(body.category) : null,
    ingredients: String(body.ingredients || ""),
    allergens: String(body.allergens || ""),
    prepMinutes: Math.max(1, Number(body.prepMinutes) || 20),
    portionInfo: body.portionInfo ? String(body.portionInfo) : null,
    dietaryTags: Array.isArray(body.dietaryTags) ? body.dietaryTags.map(String) : [],
    defaultAvailable: defaultAvailable && photos.length > 0,
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
    if (photos.length < 1) {
      res.status(400).json({
        error: "FOOD_PHOTO_REQUIRED",
        message: "Each daily menu item needs at least one food photo before it can be listed.",
      });
      return;
    }
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

/* ─── Orders (business-managed delivery; Stripe optional; never Flexa Driver) ─ */

router.post("/restaurants/:id/orders", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!restaurant || !RESTAURANT_PUBLIC_LISTING_STATUSES.has(restaurant.status) || restaurant.status === "suspended") {
    res.status(404).json({ error: "Restaurant not found" }); return;
  }
  if (restaurant.vacationMode || restaurant.temporarilyClosed) {
    res.status(409).json({ error: "Restaurant is not accepting orders right now" }); return;
  }
  if (restaurant.ownerId === req.userId) {
    res.status(400).json({ error: "Owners cannot order from their own restaurant" }); return;
  }
  const orderCountry = await getRestaurantCountry(restaurant.country);
  if (!isStaff(req.user)) {
    const gate = assertCountryAllowsPublicOps(orderCountry, { businessType: restaurant.businessType });
    if (!gate.ok) {
      res.status(403).json({ error: gate.error, code: gate.code, countryPolicy: orderCountry });
      return;
    }
  } else if (!isCountryPubliclyActive(orderCountry) && normalizeRestaurantCountryCode(restaurant.country) !== "HT") {
    // Super Admin isolated testing allowed for Haiti pending; other non-approved markets blocked for new orders.
    if (orderCountry.status === "suspended" || normalizeRestaurantCountryCode(restaurant.country) === "US" || normalizeRestaurantCountryCode(restaurant.country) === "CA") {
      res.status(403).json({
        error: `New orders are blocked in ${orderCountry.countryName}.`,
        code: "COUNTRY_DISABLED",
        countryPolicy: orderCountry,
      });
      return;
    }
  }
  if (await hasBlockingExpiredOrMissingPermits(restaurant.id, restaurant.country, restaurant.businessType)) {
    res.status(403).json({
      error: "This business cannot accept new orders because a mandatory permit is missing or expired.",
      code: "PERMIT_EXPIRED",
    });
    return;
  }
  const body = req.body ?? {};
  // Hard ban: Flexa Driver must never be attached to restaurant food orders.
  if (body.assignFlexaDriver || body.useFlexaDrivers || body.driverId || body.deliveryJobId) {
    res.status(400).json({
      error: "Flexa Driver cannot transport Flexa Restaurant food orders",
      policy: RESTAURANT_DRIVER_POLICY,
    });
    return;
  }
  const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 80) : null;
  if (idempotencyKey) {
    const [existing] = await db.select().from(restaurantOrdersTable)
      .where(eq(restaurantOrdersTable.idempotencyKey, idempotencyKey)).limit(1);
    if (existing) { res.json({ order: existing, deduped: true }); return; }
  }

  const fulfillment = String(body.fulfillment || "pickup");
  const [delivery] = await db.select().from(restaurantDeliverySettingsTable)
    .where(eq(restaurantDeliverySettingsTable.restaurantId, id)).limit(1);
  if (fulfillment === "delivery") {
    if (delivery?.fulfillment === "pickup" || delivery?.deliveryAvailable === false || delivery?.deliverySuspended) {
      res.status(400).json({ error: "This business is pickup only right now" }); return;
    }
  }
  if (fulfillment === "pickup" && (delivery?.fulfillment === "delivery" || delivery?.pickupAvailable === false)) {
    res.status(400).json({ error: "This business is delivery only" }); return;
  }

  const lines = Array.isArray(body.items) ? body.items : [];
  if (!lines.length) { res.status(400).json({ error: "Cart is empty" }); return; }
  const currency = "USD";

  try {
    const order = await db.transaction(async (tx: any) => {
      let subtotalMinor = 0;
      const prepared: Array<{
        dailyMenuItemId: number;
        dishModelId: number | null;
        name: string;
        unitPrice: number;
        unitPriceMinor: number;
        quantity: number;
        lineTotal: number;
        lineTotalMinor: number;
        notes: string;
        customizations: Array<Record<string, unknown>>;
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
        if (!(item.photos ?? []).length) throw new Error("NO_PHOTO");
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
        // Never trust client prices — always recompute from DB (+ selected option deltas).
        let unitMinor = item.priceMinor || toMinorUnits(item.price, item.currency || currency);
        const customizations: Array<Record<string, unknown>> = [];
        const selected = Array.isArray(line.optionIds) ? line.optionIds.map(Number) : [];
        if (selected.length && item.dishModelId) {
          const { rows: optRows } = await tx.execute(sql`
            SELECT o.id, o.name, o.price_delta_minor, o.sold_out, g.id AS group_id, g.name AS group_name
            FROM restaurant_dish_options o
            JOIN restaurant_dish_option_groups g ON g.id = o.group_id
            WHERE o.id = ANY(${selected})
              AND g.dish_model_id = ${item.dishModelId}
              AND o.is_deleted = FALSE
          `);
          for (const o of optRows as any[]) {
            if (o.sold_out) throw new Error("OPTION_SOLD_OUT");
            const delta = Number(o.price_delta_minor) || 0;
            unitMinor += delta;
            customizations.push({
              optionId: o.id,
              groupId: o.group_id,
              name: o.name,
              groupName: o.group_name,
              priceDeltaMinor: delta,
            });
          }
        }
        const lineTotalMinor = unitMinor * qty;
        subtotalMinor += lineTotalMinor;
        prepared.push({
          dailyMenuItemId: item.id,
          dishModelId: item.dishModelId,
          name: item.name,
          unitPrice: fromMinorUnits(unitMinor, currency),
          unitPriceMinor: unitMinor,
          quantity: qty,
          lineTotal: fromMinorUnits(lineTotalMinor, currency),
          lineTotalMinor,
          notes: String(line.notes || "").slice(0, 500),
          customizations,
        });
      }

      let deliveryFeeMinor = 0;
      if (fulfillment === "delivery") {
        deliveryFeeMinor = delivery?.deliveryFeeMinor || toMinorUnits(Number(delivery?.deliveryFee || 0), currency);
        const minMinor = delivery?.minOrderAmountMinor || toMinorUnits(Number(delivery?.minOrderAmount || 0), currency);
        if (subtotalMinor < minMinor) throw new Error("MIN_ORDER");
        const freeMin = delivery?.freeDeliveryMinMinor;
        if (freeMin != null && subtotalMinor >= freeMin) deliveryFeeMinor = 0;
      }
      const totalMinor = subtotalMinor + deliveryFeeMinor;

      const [created] = await tx.insert(restaurantOrdersTable).values({
        restaurantId: id,
        customerId: req.userId!,
        status: "pending_payment",
        fulfillment,
        subtotal: fromMinorUnits(subtotalMinor, currency),
        deliveryFee: fromMinorUnits(deliveryFeeMinor, currency),
        total: fromMinorUnits(totalMinor, currency),
        subtotalMinor,
        deliveryFeeMinor,
        totalMinor,
        currency,
        specialInstructions: String(body.specialInstructions || "").slice(0, 1000),
        deliveryAddress: fulfillment === "delivery" ? String(body.deliveryAddress || "") : null,
        idempotencyKey,
        paymentStatus: "requires_payment",
        usesFlexaDrivers: false,
        platformCommissionMinor: 0,
        estimatedPrepMinutes: delivery?.estimatedPrepMinutes ?? 30,
        paymentNote: RESTAURANT_FULFILLMENT_DISCLAIMER,
      }).returning();

      await tx.insert(restaurantOrderItemsTable).values(
        prepared.map((p) => ({ orderId: created.id, ...p })),
      );
      return created;
    });

    const payment = await createRestaurantPaymentIntent({
      orderId: order.id,
      totalMinor: order.totalMinor,
      currency: order.currency,
      customerId: req.userId!,
      restaurantId: id,
      idempotencyKey,
    });

    await notify(restaurant.ownerId, {
      restaurantId: id,
      type: "new_order",
      title: "New restaurant order",
      body: `Order #${order.id} — ${RESTAURANT_FULFILLMENT_DISCLAIMER}`,
      href: `/restaurant/owner/orders`,
    });
    await notify(req.userId!, {
      restaurantId: id,
      type: "order_placed_pending_payment",
      title: `Order #${order.id}`,
      body: "Complete payment to confirm. Delivery is managed directly by this business.",
      href: "/restaurant/my-orders",
    });

    const [fresh] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, order.id)).limit(1);
    res.status(201).json({
      order: fresh ?? order,
      payment: {
        platformCommission: 0,
        platformCommissionMinor: 0,
        clientSecret: payment.clientSecret,
        paymentIntentId: payment.paymentIntentId,
        confirmationPinIssued: true,
        message: RESTAURANT_FULFILLMENT_DISCLAIMER,
        driverPolicy: RESTAURANT_DRIVER_POLICY,
      },
    });
  } catch (err: any) {
    const code = String(err?.message || err);
    const map: Record<string, [number, string]> = {
      INVALID_ITEM: [400, "Invalid menu item"],
      NOT_AVAILABLE: [409, "Dish is not available now"],
      SOLD_OUT: [409, "Dish is sold out"],
      INSUFFICIENT: [409, "Not enough portions left"],
      MIN_ORDER: [400, "Below minimum order for delivery"],
      NO_PHOTO: [409, "Dish is missing a required food photo"],
      OPTION_SOLD_OUT: [409, "A selected option is sold out"],
    };
    const hit = map[code];
    if (hit) { res.status(hit[0]).json({ error: hit[1] }); return; }
    throw err;
  }
});

router.get("/restaurants/:id/orders", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const restaurant = await loadOwnerRestaurant(req.userId!, id);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const orders = await db.select().from(restaurantOrdersTable)
    .where(eq(restaurantOrdersTable.restaurantId, id))
    .orderBy(desc(restaurantOrdersTable.createdAt))
    .limit(100);
  res.json({
    orders,
    usesFlexaDrivers: false,
    disclaimer: RESTAURANT_FULFILLMENT_DISCLAIMER,
  });
});

/** Customer confirms pickup/delivery with the business-issued PIN (never Flexa Driver). */
router.post("/restaurants/me/orders/:orderId/confirm-pin", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  const pin = String(req.body?.pin || "").trim();
  const [order] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, order.restaurantId)).limit(1);
  const isOwner = restaurant?.ownerId === req.userId;
  const isCustomer = order.customerId === req.userId;
  if (!isOwner && !isCustomer && !isStaff(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!order.confirmationPin || order.confirmationPin !== pin) {
    res.status(403).json({ error: "Invalid confirmation PIN" }); return;
  }
  if (!["ready_for_pickup", "out_for_delivery", "delivered"].includes(order.status) && !isOwner) {
    res.status(409).json({ error: "Order is not ready for confirmation" }); return;
  }
  const nextStatus = order.fulfillment === "delivery" ? "delivered" : "completed";
  const [updated] = await db.update(restaurantOrdersTable).set({
    status: nextStatus,
    pinConfirmedAt: new Date(),
    usesFlexaDrivers: false,
    updatedAt: new Date(),
  }).where(eq(restaurantOrdersTable.id, orderId)).returning();
  await appendOrderStatusHistory({
    orderId,
    fromStatus: order.status,
    toStatus: nextStatus,
    actorId: req.userId!,
    note: "confirmation_pin",
  });
  await notify(order.customerId, {
    restaurantId: order.restaurantId,
    type: "order_confirmed_pin",
    title: `Order #${orderId} confirmed`,
    body: RESTAURANT_FULFILLMENT_DISCLAIMER,
    href: "/restaurant/my-orders",
  });
  if (restaurant) {
    await notify(restaurant.ownerId, {
      restaurantId: order.restaurantId,
      type: "order_confirmed_pin",
      title: `Order #${orderId} PIN confirmed`,
      body: nextStatus,
      href: "/restaurant/owner/orders",
    });
  }
  res.json({ order: updated, disclaimer: RESTAURANT_FULFILLMENT_DISCLAIMER });
});

router.post("/restaurants/me/orders/:orderId/refund", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const orderId = Number(req.params.orderId);
  const [order] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, orderId)).limit(1);
  if (!order) { res.status(404).json({ error: "Not found" }); return; }
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, order.restaurantId)).limit(1);
  const isOwner = restaurant?.ownerId === req.userId;
  if (!isOwner && !isStaff(req.user)) {
    res.status(403).json({ error: "Only the business owner or Super Admin may refund" }); return;
  }
  const result = await refundRestaurantOrder(orderId, req.userId!, String(req.body?.reason || ""));
  if (!result.ok) {
    res.status(400).json({ error: result.error || "Refund failed" }); return;
  }
  const [fresh] = await db.select().from(restaurantOrdersTable).where(eq(restaurantOrdersTable.id, orderId)).limit(1);
  res.json({ order: fresh, ok: true });
});

/* ─── Dish option groups (sizes / toppings / extras) ─────────────────────── */

router.get("/restaurants/:id/dish-models/:dishId/options", requireRestaurantAccess, async (req, res): Promise<void> => {
  const restaurantId = Number(req.params.id);
  const dishId = Number(req.params.dishId);
  const { rows: groups } = await db.execute(sql`
    SELECT id, name, kind, required, min_select, max_select, sort_order
    FROM restaurant_dish_option_groups
    WHERE dish_model_id = ${dishId} AND restaurant_id = ${restaurantId}
    ORDER BY sort_order ASC, id ASC
  `);
  const groupIds = (groups as any[]).map((g) => g.id);
  let options: any[] = [];
  if (groupIds.length) {
    const { rows } = await db.execute(sql`
      SELECT id, group_id, name, price_delta, price_delta_minor, sold_out, allergens, sort_order
      FROM restaurant_dish_options
      WHERE group_id = ANY(${groupIds}) AND is_deleted = FALSE
      ORDER BY sort_order ASC, id ASC
    `);
    options = rows as any[];
  }
  res.json({
    groups: (groups as any[]).map((g) => ({
      id: g.id,
      name: g.name,
      kind: g.kind,
      required: g.required,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      sortOrder: g.sort_order,
      options: options
        .filter((o) => o.group_id === g.id)
        .map((o) => ({
          id: o.id,
          name: o.name,
          priceDelta: Number(o.price_delta) || 0,
          priceDeltaMinor: Number(o.price_delta_minor) || 0,
          soldOut: !!o.sold_out,
          allergens: o.allergens || "",
        })),
    })),
  });
});

router.post("/restaurants/:id/dish-models/:dishId/option-groups", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const restaurantId = Number(req.params.id);
  const dishId = Number(req.params.dishId);
  const restaurant = await loadOwnerRestaurant(req.userId!, restaurantId);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const [dish] = await db.select().from(restaurantDishModelsTable)
    .where(and(eq(restaurantDishModelsTable.id, dishId), eq(restaurantDishModelsTable.restaurantId, restaurantId)))
    .limit(1);
  if (!dish) { res.status(404).json({ error: "Dish not found" }); return; }
  const body = req.body ?? {};
  const name = String(body.name || "").trim();
  if (name.length < 1) { res.status(400).json({ error: "Name required" }); return; }
  const { rows } = await db.execute(sql`
    INSERT INTO restaurant_dish_option_groups (dish_model_id, restaurant_id, name, kind, required, min_select, max_select, sort_order)
    VALUES (
      ${dishId}, ${restaurantId}, ${name},
      ${String(body.kind || "extra")},
      ${!!body.required},
      ${Math.max(0, Number(body.minSelect) || 0)},
      ${Math.max(1, Number(body.maxSelect) || 1)},
      ${Math.max(0, Number(body.sortOrder) || 0)}
    )
    RETURNING id, name, kind, required, min_select, max_select, sort_order
  `);
  const g = (rows as any[])[0];
  res.status(201).json({
    group: {
      id: g.id,
      name: g.name,
      kind: g.kind,
      required: g.required,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      sortOrder: g.sort_order,
    },
  });
});

router.post("/restaurants/:id/option-groups/:groupId/options", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const restaurantId = Number(req.params.id);
  const groupId = Number(req.params.groupId);
  const restaurant = await loadOwnerRestaurant(req.userId!, restaurantId);
  if (!restaurant) { res.status(404).json({ error: "Not found" }); return; }
  const { rows: groups } = await db.execute(sql`
    SELECT id FROM restaurant_dish_option_groups WHERE id = ${groupId} AND restaurant_id = ${restaurantId} LIMIT 1
  `);
  if (!(groups as any[]).length) { res.status(404).json({ error: "Group not found" }); return; }
  const body = req.body ?? {};
  const name = String(body.name || "").trim();
  const delta = Number(body.priceDelta) || 0;
  const deltaMinor = body.priceDeltaMinor != null ? Math.floor(Number(body.priceDeltaMinor)) : toMinorUnits(delta);
  if (!name) { res.status(400).json({ error: "Name required" }); return; }
  const { rows } = await db.execute(sql`
    INSERT INTO restaurant_dish_options (group_id, name, price_delta, price_delta_minor, sold_out, allergens, sort_order)
    VALUES (
      ${groupId}, ${name}, ${delta}, ${deltaMinor},
      ${!!body.soldOut}, ${String(body.allergens || "")}, ${Math.max(0, Number(body.sortOrder) || 0)}
    )
    RETURNING id, name, price_delta, price_delta_minor, sold_out, allergens
  `);
  const o = (rows as any[])[0];
  res.status(201).json({
    option: {
      id: o.id,
      name: o.name,
      priceDelta: Number(o.price_delta) || 0,
      priceDeltaMinor: Number(o.price_delta_minor) || 0,
      soldOut: !!o.sold_out,
      allergens: o.allergens || "",
    },
  });
});

/* ─── Reservations ───────────────────────────────────────────────────────── */

router.post("/restaurants/:id/reservations", requireRestaurantAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [restaurant] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!restaurant || !RESTAURANT_PUBLIC_LISTING_STATUSES.has(restaurant.status)) {
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

/* ─── Super Admin: Country Availability & compliance ─────────────────────── */

router.get("/admin/restaurants/countries", requireAuth, requireSuperAdmin, async (_req, res) => {
  const countries = await listRestaurantCountries();
  res.json({
    defaultDeny: true,
    legalDisclaimer:
      "Operational country flags do not eliminate legal responsibilities of Flexa Technology LLC or food businesses.",
    countries,
  });
});

router.put("/admin/restaurants/countries/:countryCode", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const countryCode = String(req.params.countryCode || "");
  const body = req.body ?? {};
  // Never auto-approve: explicit status + enabled required from Super Admin.
  if (body.status === "approved" && body.enabled === true && !String(body.regulatoryReviewNotes || "").trim() && !body.approvalDocumentUrl) {
    res.status(400).json({
      error: "Documented regulatory review notes or an approval document URL is required before public activation.",
    });
    return;
  }
  const row = await upsertRestaurantCountry({
    countryCode,
    countryName: body.countryName ? String(body.countryName) : undefined,
    status: body.status,
    enabled: body.enabled,
    restaurantsEnabled: body.restaurantsEnabled,
    foodTrucksEnabled: body.foodTrucksEnabled,
    homeKitchensEnabled: body.homeKitchensEnabled,
    cateringEnabled: body.cateringEnabled,
    requiredLicensesNote: body.requiredLicensesNote != null ? String(body.requiredLicensesNote) : undefined,
    foodSafetyRequirementsNote: body.foodSafetyRequirementsNote != null ? String(body.foodSafetyRequirementsNote) : undefined,
    regulatoryReviewNotes: body.regulatoryReviewNotes != null ? String(body.regulatoryReviewNotes) : undefined,
    approvalDocumentUrl: body.approvalDocumentUrl != null ? String(body.approvalDocumentUrl) : undefined,
    suspensionReason: body.suspensionReason != null ? String(body.suspensionReason) : undefined,
  } as any, req.userId!);
  res.json({ country: row });
});

router.get("/admin/restaurants/countries/:countryCode/jurisdictions", requireAuth, requireSuperAdmin, async (req, res) => {
  const rows = await listJurisdictions(String(req.params.countryCode || ""));
  res.json({ jurisdictions: rows });
});

router.put("/admin/restaurants/countries/:countryCode/jurisdictions", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  if (!body.name || !body.level) {
    res.status(400).json({ error: "level and name are required" }); return;
  }
  const jurisdictions = await upsertJurisdiction({
    countryCode: String(req.params.countryCode || ""),
    level: String(body.level),
    name: String(body.name),
    status: body.status ? String(body.status) : undefined,
    enabled: body.enabled,
    restaurantsEnabled: body.restaurantsEnabled,
    foodTrucksEnabled: body.foodTrucksEnabled,
    homeKitchensEnabled: body.homeKitchensEnabled,
    requiredLicensesNote: body.requiredLicensesNote != null ? String(body.requiredLicensesNote) : undefined,
    regulatoryReviewNotes: body.regulatoryReviewNotes != null ? String(body.regulatoryReviewNotes) : undefined,
    suspensionReason: body.suspensionReason != null ? String(body.suspensionReason) : null,
  }, req.userId!);
  res.json({ jurisdictions });
});

router.get("/admin/restaurants/countries/:countryCode/requirements", requireAuth, requireSuperAdmin, async (req, res) => {
  const requirements = await listComplianceRequirements(String(req.params.countryCode || ""));
  res.json({ requirements });
});

router.post("/admin/restaurants/countries/:countryCode/requirements", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  if (!body.requirementKey || !body.label) {
    res.status(400).json({ error: "requirementKey and label are required" }); return;
  }
  const row = await upsertComplianceRequirement({
    countryCode: String(req.params.countryCode || ""),
    businessType: body.businessType ? String(body.businessType) : "*",
    requirementKey: String(body.requirementKey),
    label: String(body.label),
    required: body.required !== false,
    notes: body.notes != null ? String(body.notes) : "",
  }, req.userId!);
  res.status(201).json({ requirement: row });
});

router.get("/admin/restaurants/regulatory-audit", requireAuth, requireSuperAdmin, async (req, res) => {
  const logs = await listRegulatoryAuditLogs(Number(req.query.limit) || 100);
  res.json({ logs });
});

router.get("/admin/restaurants", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db.select().from(restaurantsTable).orderBy(desc(restaurantsTable.updatedAt)).limit(200);
  res.json({ restaurants: rows.map((r: typeof restaurantsTable.$inferSelect) => shapePublicRestaurant(r)) });
});

router.get("/admin/restaurants/identity/pending", requireAuth, requireSuperAdmin, async (_req, res) => {
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

router.patch("/admin/restaurants/identity/:idvId/decide", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
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

router.patch("/admin/restaurants/:id/application", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const decision = String(req.body?.decision || "").trim().toLowerCase();
  const allowed = new Set([
    "under_review",
    "additional_info_required",
    "approved",
    "published",
    "rejected",
    "suspended",
  ]);
  if (!allowed.has(decision)) {
    res.status(400).json({ error: "Invalid application decision" }); return;
  }
  const [row] = await db.select().from(restaurantsTable).where(eq(restaurantsTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (decision === "published" || decision === "approved") {
    if (row.identityStatus !== "verified") {
      res.status(400).json({ error: "Identity must be verified before approval" }); return;
    }
    if (!row.foodSafetyCompleted) {
      res.status(400).json({ error: "Food safety onboarding required before approval" }); return;
    }
    const countryRow = await getRestaurantCountry(row.country);
    if (!isCountryPubliclyActive(countryRow)) {
      res.status(403).json({
        error: "Business country must be Approved and enabled before public activation.",
        code: "COUNTRY_NOT_APPROVED",
        countryPolicy: countryRow,
      });
      return;
    }
  }
  const note = String(req.body?.note || req.body?.reason || "").slice(0, 1000);
  const patch: Partial<typeof restaurantsTable.$inferInsert> = {
    status: decision === "approved" ? "published" : decision,
    updatedAt: new Date(),
  };
  if (decision === "published" || decision === "approved") {
    patch.publishedAt = new Date();
    patch.suspendedAt = null;
    patch.suspensionReason = null;
  }
  if (decision === "rejected") {
    patch.publishedAt = null;
  }
  if (decision === "suspended") {
    patch.suspendedAt = new Date();
    patch.suspensionReason = note || "Suspended by admin";
  }
  const [updated] = await db.update(restaurantsTable).set(patch).where(eq(restaurantsTable.id, id)).returning();
  await db.insert(restaurantModerationLogsTable).values({
    restaurantId: id,
    actorId: req.userId!,
    action: `application_${decision}`,
    details: note || decision,
  });
  await notify(updated.ownerId, {
    restaurantId: id,
    type: "application_decision",
    title: `Restaurant application → ${decision}`,
    body: note || `Status updated to ${decision}`,
    href: "/restaurant/owner",
  });
  res.json({ restaurant: shapePublicRestaurant(updated) });
});

router.patch("/admin/restaurants/:id/suspend", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
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
