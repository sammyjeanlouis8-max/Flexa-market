/**
 * Séduire Beauty API — studios, barbershops, independents, and mobile beauty.
 * Prices are always recomputed from DB. Private residential addresses never go public.
 */
import { Router } from "express";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  conversationsTable,
  beautyCategoriesTable,
  beautyBusinessesTable,
  beautyBusinessCategoriesTable,
  beautyProfessionalsTable,
  beautyServicesTable,
  beautyServiceAssignmentsTable,
  beautyWorkingHoursTable,
  beautyAvailabilityExceptionsTable,
  beautyAppointmentsTable,
  beautyAppointmentHistoryTable,
  beautyAppointmentReservationsTable,
  beautyPortfolioItemsTable,
  beautyFavoritesTable,
  beautyReviewsTable,
  beautyReportsTable,
  beautyCountryAvailabilityTable,
  beautyAuditLogsTable,
  beautyNotificationsTable,
  beautyRecentlyViewedTable,
} from "@workspace/db";
import { requireAuth, requireNotRestricted, requireSuperAdmin } from "../middlewares/auth";
import { publicDisplayName } from "../lib/publicDisplayName";
import { isValidBusinessPhone, normalizeDialablePhone } from "../lib/restaurantPhone";
import {
  BEAUTY_PUBLIC_LAUNCH,
  BEAUTY_PUBLIC_LISTING_STATUSES,
  BEAUTY_BUSINESS_TYPES,
  BEAUTY_BLOCKING_APPOINTMENT_STATUSES,
  BEAUTY_PRIVACY_NOTICE,
  canAccessBeautyModule,
  canAccessBeautyStaff,
  canTransitionBeautyAppointment,
} from "../lib/beautyAccess";
import {
  generateDaySlots,
  haversineKm,
  isBusinessOpenNow,
  localYmd,
  type BeautyHourRow,
} from "../lib/beautySchedule";
import {
  BEAUTY_PRIMARY_CATEGORIES,
  beautyCategoryBySlug,
} from "../lib/beautyCategoriesCatalog";
import { fromMinorUnits } from "../lib/beautyMoney";
import { createBeautyPaymentIntent } from "../lib/beautyStripe";

const router = Router();

/* ─── Access middleware ──────────────────────────────────────────────────── */

function isStaff(user: { isSuperAdmin?: boolean; isAdmin?: boolean; role?: string | null } | null | undefined) {
  return canAccessBeautyStaff(user);
}

/** While public launch is false, require authenticated Super Admin (or public launch). */
async function requireBeautyAccess(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  if (BEAUTY_PUBLIC_LAUNCH) {
    next();
    return;
  }
  await requireAuth(req, res, async () => {
    if (canAccessBeautyModule(req.user)) {
      next();
      return;
    }
    res.status(403).json({ error: "Séduire Beauty preview is Super Admin only" });
  });
}

async function requireBeautyAuthAccess(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  next: Parameters<typeof requireAuth>[2],
) {
  await requireAuth(req, res, async () => {
    if (canAccessBeautyModule(req.user)) {
      next();
      return;
    }
    res.status(403).json({ error: "Séduire Beauty preview is Super Admin only" });
  });
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

async function notify(userId: number, input: {
  businessId?: number | null;
  appointmentId?: number | null;
  type: string;
  title: string;
  body?: string;
  href?: string;
}) {
  await db.insert(beautyNotificationsTable).values({
    userId,
    businessId: input.businessId ?? null,
    appointmentId: input.appointmentId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? "",
    href: input.href ?? null,
  });
}

async function appendAppointmentHistory(input: {
  appointmentId: number;
  fromStatus: string | null;
  toStatus: string;
  actorId: number;
  note?: string;
}) {
  try {
    await db.insert(beautyAppointmentHistoryTable).values({
      appointmentId: input.appointmentId,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actorId: input.actorId,
      note: input.note ?? "",
    });
  } catch (err) {
    console.warn("beauty appointment history insert skipped", err);
  }
}

async function writeAudit(input: {
  actorId?: number | null;
  businessId?: number | null;
  action: string;
  entityType?: string;
  entityId?: number;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.insert(beautyAuditLogsTable).values({
      actorId: input.actorId ?? null,
      businessId: input.businessId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      meta: input.meta ?? {},
    });
  } catch (err) {
    console.warn("beauty audit log skipped", err);
  }
}

function normalizeBusinessType(raw: string | null | undefined): string {
  const v = String(raw || "").toLowerCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, string> = {
    studio: "beauty_studio",
    beauty: "beauty_studio",
    salon: "beauty_studio",
    barber: "barbershop",
    barbers: "barbershop",
    independent: "independent_beauty",
    mobile: "mobile_beauty",
  };
  return aliases[v] || v;
}

const ALLOWED_BUSINESS_TYPES = new Set<string>(BEAUTY_BUSINESS_TYPES);

function slugify(input: string): string {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "business";
}

function shapePublicBusiness(
  row: typeof beautyBusinessesTable.$inferSelect,
  extras?: {
    openNow?: boolean;
    distanceKm?: number | null;
    hours?: Array<typeof beautyWorkingHoursTable.$inferSelect>;
    services?: Array<ReturnType<typeof shapePublicService>>;
    professionals?: Array<ReturnType<typeof shapePublicProfessional>>;
    categories?: Array<{ id: number; slug: string; nameEn: string; kind: string }>;
    reviewsSummary?: { avgRating: number; ratingCount: number };
  },
) {
  const allowPublicAddress = row.showPublicAddress;
  return {
    id: row.id,
    ownerId: row.ownerId,
    businessType: row.businessType,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logoUrl,
    coverUrl: row.coverUrl,
    phone: row.phone,
    email: row.email,
    whatsapp: row.whatsapp,
    country: row.country,
    region: row.region,
    city: row.city,
    streetAddress: allowPublicAddress ? row.streetAddress : null,
    postalCode: allowPublicAddress ? row.postalCode : null,
    publicAddress: allowPublicAddress ? (row.publicAddress || row.streetAddress || null) : null,
    showPublicAddress: allowPublicAddress,
    latitude: allowPublicAddress ? row.latitude : row.latitude,
    longitude: allowPublicAddress ? row.longitude : row.longitude,
    timezone: row.timezone,
    serviceLocationMode: row.serviceLocationMode,
    homeServiceAvailable: row.homeServiceAvailable,
    serviceRadiusKm: row.serviceRadiusKm,
    travelFeeMinor: row.travelFeeMinor,
    travelFee: fromMinorUnits(row.travelFeeMinor, row.currency),
    currency: row.currency,
    status: row.status,
    identityStatus: row.identityStatus,
    identityVerifiedBadge: row.identityStatus === "verified",
    featured: row.featured,
    vacationMode: row.vacationMode,
    temporarilyClosed: row.temporarilyClosed,
    bookingLeadMinutes: row.bookingLeadMinutes,
    avgRating: row.avgRating,
    ratingCount: row.ratingCount,
    profileViews: row.profileViews,
    subscriptionPlan: row.subscriptionPlan,
    openNow: extras?.openNow ?? false,
    distanceKm: extras?.distanceKm ?? null,
    hours: (extras?.hours ?? []).map((h) => ({
      weekday: h.weekday,
      isClosed: h.isClosed,
      openTime: h.openTime,
      closeTime: h.closeTime,
      breakStart: h.breakStart,
      breakEnd: h.breakEnd,
      professionalId: h.professionalId,
    })),
    services: extras?.services,
    professionals: extras?.professionals,
    categories: extras?.categories,
    reviewsSummary: extras?.reviewsSummary ?? {
      avgRating: row.avgRating,
      ratingCount: row.ratingCount,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function shapeOwnerBusiness(row: typeof beautyBusinessesTable.$inferSelect) {
  return {
    ...shapePublicBusiness(row),
    privateResidentialAddress: row.privateResidentialAddress,
    adminNotes: row.adminNotes,
    onboardingStep: row.onboardingStep,
    termsAcceptedAt: row.termsAcceptedAt?.toISOString() ?? null,
    identityRejectionReason: row.identityRejectionReason,
    suspensionReason: row.suspensionReason,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function shapePublicService(row: typeof beautyServicesTable.$inferSelect) {
  return {
    id: row.id,
    businessId: row.businessId,
    categoryId: row.categoryId,
    name: row.name,
    description: row.description,
    imageUrl: row.imageUrl,
    priceType: row.priceType,
    priceMinor: row.priceMinor,
    price: fromMinorUnits(row.priceMinor, row.currency),
    currency: row.currency,
    durationMinutes: row.durationMinutes,
    prepMinutes: row.prepMinutes,
    cleanupMinutes: row.cleanupMinutes,
    serviceLocation: row.serviceLocation,
    travelFeeMinor: row.travelFeeMinor,
    travelFee: fromMinorUnits(row.travelFeeMinor, row.currency),
    depositRequired: row.depositRequired,
    depositMinor: row.depositMinor,
    depositType: row.depositType,
    preparationInstructions: row.preparationInstructions,
    cancellationPolicy: row.cancellationPolicy,
    status: row.status,
    sortOrder: row.sortOrder,
  };
}

function shapePublicProfessional(row: typeof beautyProfessionalsTable.$inferSelect) {
  return {
    id: row.id,
    businessId: row.businessId,
    fullName: row.fullName,
    photoUrl: row.photoUrl,
    biography: row.biography,
    yearsExperience: row.yearsExperience,
    specializations: row.specializations ?? [],
    certifications: row.certifications ?? [],
    role: row.role,
    isActive: row.isActive,
    avgRating: row.avgRating,
    ratingCount: row.ratingCount,
  };
}

function shapeAppointment(
  row: typeof beautyAppointmentsTable.$inferSelect,
  opts?: { includePrivateAddress?: boolean },
) {
  return {
    id: row.id,
    businessId: row.businessId,
    customerId: row.customerId,
    professionalId: row.professionalId,
    serviceId: row.serviceId,
    status: row.status,
    paymentStatus: row.paymentStatus,
    serviceLocation: row.serviceLocation,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    serviceNameSnapshot: row.serviceNameSnapshot,
    durationMinutesSnapshot: row.durationMinutesSnapshot,
    priceMinorSnapshot: row.priceMinorSnapshot,
    travelFeeMinorSnapshot: row.travelFeeMinorSnapshot,
    depositMinorSnapshot: row.depositMinorSnapshot,
    currency: row.currency,
    totalMinor: row.totalMinor,
    total: fromMinorUnits(row.totalMinor, row.currency),
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    customerNotes: row.customerNotes,
    customerAddress: opts?.includePrivateAddress ? row.customerAddress : null,
    customerAddressInstructions: opts?.includePrivateAddress ? row.customerAddressInstructions : null,
    customerLatitude: opts?.includePrivateAddress ? row.customerLatitude : null,
    customerLongitude: opts?.includePrivateAddress ? row.customerLongitude : null,
    estimatedTravelMinutes: row.estimatedTravelMinutes,
    reservationExpiresAt: row.reservationExpiresAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    cancellationReason: row.cancellationReason,
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function loadOwnerBusiness(ownerId: number, businessId: number) {
  const [row] = await db.select().from(beautyBusinessesTable).where(and(
    eq(beautyBusinessesTable.id, businessId),
    eq(beautyBusinessesTable.ownerId, ownerId),
  )).limit(1);
  return row ?? null;
}

/** Owner or active professional with matching userId (or super admin). */
async function canAccessBeautyCenter(
  userId: number,
  businessId: number,
  user?: { isSuperAdmin?: boolean; role?: string | null } | null,
): Promise<{ ok: boolean; business: typeof beautyBusinessesTable.$inferSelect | null; asStaff: boolean }> {
  const [business] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, businessId)).limit(1);
  if (!business) return { ok: false, business: null, asStaff: false };
  if (isStaff(user) || business.ownerId === userId) {
    return { ok: true, business, asStaff: business.ownerId !== userId && isStaff(user) };
  }
  const [pro] = await db.select().from(beautyProfessionalsTable).where(and(
    eq(beautyProfessionalsTable.businessId, businessId),
    eq(beautyProfessionalsTable.userId, userId),
    eq(beautyProfessionalsTable.isActive, true),
    eq(beautyProfessionalsTable.inviteStatus, "active"),
  )).limit(1);
  if (pro) return { ok: true, business, asStaff: true };
  return { ok: false, business, asStaff: false };
}

function computeDepositMinor(service: typeof beautyServicesTable.$inferSelect): number {
  if (!service.depositRequired) return 0;
  if (service.depositType === "percent") {
    const pct = Math.min(100, Math.max(0, service.depositMinor));
    return Math.round((service.priceMinor * pct) / 100);
  }
  return Math.min(service.priceMinor, Math.max(0, service.depositMinor));
}

async function loadHoursForSlot(
  businessId: number,
  professionalId: number | null,
): Promise<BeautyHourRow[]> {
  if (professionalId != null) {
    const proHours = await db.select().from(beautyWorkingHoursTable).where(and(
      eq(beautyWorkingHoursTable.businessId, businessId),
      eq(beautyWorkingHoursTable.professionalId, professionalId),
    ));
    if (proHours.length) {
      return proHours.map((h) => ({
        weekday: h.weekday,
        isClosed: h.isClosed,
        openTime: h.openTime,
        closeTime: h.closeTime,
        breakStart: h.breakStart,
        breakEnd: h.breakEnd,
      }));
    }
  }
  const bizHours = await db.select().from(beautyWorkingHoursTable).where(and(
    eq(beautyWorkingHoursTable.businessId, businessId),
    isNull(beautyWorkingHoursTable.professionalId),
  ));
  return bizHours.map((h) => ({
    weekday: h.weekday,
    isClosed: h.isClosed,
    openTime: h.openTime,
    closeTime: h.closeTime,
    breakStart: h.breakStart,
    breakEnd: h.breakEnd,
  }));
}

async function loadBlockingIntervals(
  businessId: number,
  professionalId: number | null,
  dayStart: Date,
  dayEnd: Date,
): Promise<Array<{ startsAt: Date; endsAt: Date }>> {
  const blocking = [...BEAUTY_BLOCKING_APPOINTMENT_STATUSES];
  const apptConds = [
    eq(beautyAppointmentsTable.businessId, businessId),
    inArray(beautyAppointmentsTable.status, blocking),
    gte(beautyAppointmentsTable.endsAt, dayStart),
    lte(beautyAppointmentsTable.startsAt, dayEnd),
  ];
  if (professionalId != null) {
    apptConds.push(eq(beautyAppointmentsTable.professionalId, professionalId));
  }
  const appointments = await db.select({
    startsAt: beautyAppointmentsTable.startsAt,
    endsAt: beautyAppointmentsTable.endsAt,
  }).from(beautyAppointmentsTable).where(and(...apptConds));

  const now = new Date();
  const resConds = [
    eq(beautyAppointmentReservationsTable.businessId, businessId),
    gte(beautyAppointmentReservationsTable.expiresAt, now),
    gte(beautyAppointmentReservationsTable.endsAt, dayStart),
    lte(beautyAppointmentReservationsTable.startsAt, dayEnd),
  ];
  if (professionalId != null) {
    resConds.push(eq(beautyAppointmentReservationsTable.professionalId, professionalId));
  }
  const reservations = await db.select({
    startsAt: beautyAppointmentReservationsTable.startsAt,
    endsAt: beautyAppointmentReservationsTable.endsAt,
  }).from(beautyAppointmentReservationsTable).where(and(...resConds));

  return [
    ...appointments.map((a) => ({ startsAt: a.startsAt, endsAt: a.endsAt })),
    ...reservations.map((r) => ({ startsAt: r.startsAt, endsAt: r.endsAt })),
  ];
}

async function loadExceptions(
  businessId: number,
  professionalId: number | null,
  dayStart: Date,
  dayEnd: Date,
) {
  const rows = await db.select().from(beautyAvailabilityExceptionsTable).where(and(
    eq(beautyAvailabilityExceptionsTable.businessId, businessId),
    gte(beautyAvailabilityExceptionsTable.endAt, dayStart),
    lte(beautyAvailabilityExceptionsTable.startAt, dayEnd),
    professionalId != null
      ? or(
        isNull(beautyAvailabilityExceptionsTable.professionalId),
        eq(beautyAvailabilityExceptionsTable.professionalId, professionalId),
      )
      : sql`true`,
  ));
  return rows.map((r) => ({
    exceptionType: r.exceptionType,
    startAt: r.startAt,
    endAt: r.endAt,
  }));
}

/* ─── Category seed ──────────────────────────────────────────────────────── */

const STUDIO_SERVICES = [
  { slug: "hair_styling", nameEn: "Hair Styling" },
  { slug: "braids", nameEn: "Braids" },
  { slug: "hair_extensions", nameEn: "Hair Extensions" },
  { slug: "wig_installation", nameEn: "Wig Installation" },
  { slug: "hair_coloring", nameEn: "Hair Coloring" },
  { slug: "hair_treatments", nameEn: "Hair Treatments" },
  { slug: "makeup", nameEn: "Makeup" },
  { slug: "eyelashes", nameEn: "Eyelashes" },
  { slug: "eyebrows", nameEn: "Eyebrows" },
  { slug: "manicure", nameEn: "Manicure" },
  { slug: "pedicure", nameEn: "Pedicure" },
  { slug: "facial_treatments", nameEn: "Facial Treatments" },
] as const;

const BARBER_SERVICES = [
  { slug: "mens_haircuts", nameEn: "Men's Haircuts" },
  { slug: "womens_short_haircuts", nameEn: "Women's Short Haircuts" },
  { slug: "childrens_haircuts", nameEn: "Children's Haircuts" },
  { slug: "beard_trimming", nameEn: "Beard Trimming" },
  { slug: "beard_styling", nameEn: "Beard Styling" },
  { slug: "hair_designs", nameEn: "Hair Designs" },
  { slug: "hair_coloring_barber", nameEn: "Hair Coloring" },
  { slug: "shaving", nameEn: "Shaving" },
  { slug: "grooming_packages", nameEn: "Grooming Packages" },
] as const;

async function ensureDefaultCategories() {
  // Upsert the 12 primary marketplace categories (safe on existing installs).
  for (const cat of BEAUTY_PRIMARY_CATEGORIES) {
    const [row] = await db.select({ id: beautyCategoriesTable.id })
      .from(beautyCategoriesTable)
      .where(eq(beautyCategoriesTable.slug, cat.slug))
      .limit(1);
    if (row) {
      await db.update(beautyCategoriesTable).set({
        kind: cat.kind,
        nameEn: cat.nameEn,
        nameFr: cat.nameFr,
        nameHt: cat.nameHt,
        nameEs: cat.nameEs,
        descriptionEn: cat.descriptionEn,
        imageUrl: cat.imageUrl,
        sortOrder: cat.sortOrder,
        isActive: true,
        updatedAt: new Date(),
      }).where(eq(beautyCategoriesTable.id, row.id));
    } else {
      await db.insert(beautyCategoriesTable).values({
        kind: cat.kind,
        slug: cat.slug,
        nameEn: cat.nameEn,
        nameFr: cat.nameFr,
        nameHt: cat.nameHt,
        nameEs: cat.nameEs,
        descriptionEn: cat.descriptionEn,
        imageUrl: cat.imageUrl,
        sortOrder: cat.sortOrder,
        isActive: true,
      });
    }
  }

  // Service-type children under Beauty Studio / Barbershop (first install only).
  const [studio] = await db.select().from(beautyCategoriesTable)
    .where(eq(beautyCategoriesTable.slug, "beauty-studio")).limit(1);
  const [barber] = await db.select().from(beautyCategoriesTable)
    .where(eq(beautyCategoriesTable.slug, "barbershop")).limit(1);
  if (!studio || !barber) return;

  const existingService = await db.select({ id: beautyCategoriesTable.id })
    .from(beautyCategoriesTable)
    .where(eq(beautyCategoriesTable.kind, "service"))
    .limit(1);
  if (existingService.length) return;

  await db.insert(beautyCategoriesTable).values([
    ...STUDIO_SERVICES.map((s, i) => ({
      kind: "service" as const,
      slug: s.slug,
      nameEn: s.nameEn,
      descriptionEn: "",
      parentId: studio.id,
      sortOrder: i + 1,
      isActive: true,
    })),
    ...BARBER_SERVICES.map((s, i) => ({
      kind: "service" as const,
      slug: s.slug,
      nameEn: s.nameEn,
      descriptionEn: "",
      parentId: barber.id,
      sortOrder: i + 1,
      isActive: true,
    })),
  ]);
}

/* ─── PUBLIC / META ──────────────────────────────────────────────────────── */

router.get("/beauty/launch", async (_req, res) => {
  res.json({
    native: true,
    publicLaunch: BEAUTY_PUBLIC_LAUNCH,
    access: BEAUTY_PUBLIC_LAUNCH ? "public" : "super_admin_preview",
    privacyNotice: BEAUTY_PRIVACY_NOTICE,
    platformFees: { commission: 0, registrationFee: 0, monthlySubscription: 0 },
  });
});

router.get("/beauty/categories", requireBeautyAccess, async (_req, res): Promise<void> => {
  await ensureDefaultCategories();
  const rows = await db.select().from(beautyCategoriesTable)
    .where(eq(beautyCategoriesTable.isActive, true))
    .orderBy(asc(beautyCategoriesTable.sortOrder), asc(beautyCategoriesTable.id));
  res.json({ categories: rows });
});

router.get("/beauty/countries", requireBeautyAccess, async (_req, res): Promise<void> => {
  const rows = await db.select().from(beautyCountryAvailabilityTable)
    .orderBy(asc(beautyCountryAvailabilityTable.countryCode));
  res.json({
    countries: rows.map((c) => ({
      countryCode: c.countryCode,
      enabled: c.enabled,
      status: c.status,
      publiclyActive: c.enabled && c.status === "approved",
      notes: c.notes,
    })),
  });
});

/* ─── DISCOVER ───────────────────────────────────────────────────────────── */

router.get("/beauty/businesses", requireBeautyAccess, async (req, res): Promise<void> => {
  try {
    const q = String(req.query.q || "").trim();
    const city = String(req.query.city || "").trim();
    const region = String(req.query.region || "").trim();
    const businessTypeRaw = String(req.query.businessType || "").trim();
    const businessType = businessTypeRaw ? normalizeBusinessType(businessTypeRaw) : "";
    const categorySlug = String(req.query.categorySlug || "").trim();
    const openNowOnly = req.query.openNow === "1" || req.query.openNow === "true";
    const homeService = req.query.homeService === "1" || req.query.homeService === "true";
    const featuredOnly = req.query.featured === "1" || req.query.featured === "true";
    const availableToday = req.query.availableToday === "1" || req.query.availableToday === "true";
    const minRating = req.query.minRating != null ? Number(req.query.minRating) : null;
    const maxPriceMinor = req.query.maxPriceMinor != null ? Number(req.query.maxPriceMinor) : null;
    const lat = req.query.lat != null ? Number(req.query.lat) : null;
    const lng = req.query.lng != null ? Number(req.query.lng) : null;
    const nearby = req.query.nearby === "1" || req.query.nearby === "true";
    const radiusKmRaw = req.query.radiusKm != null ? Number(req.query.radiusKm) : (nearby ? 25 : null);
    const radiusKm = radiusKmRaw != null && Number.isFinite(radiusKmRaw)
      ? Math.min(200, Math.max(1, radiusKmRaw))
      : null;
    const sortBy = String(req.query.sortBy || ((nearby || (lat != null && lng != null)) ? "distance" : "rating"));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 24));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const queryCountry = String(req.query.country || "").trim();
    const profileCountry = String(req.user?.country || "").trim();
    const staff = isStaff(req.user);
    const country = queryCountry || profileCountry;
    // Guests without a country: empty success so the UI can prompt for location
    // instead of treating discovery as a hard failure.
    if (!country && !staff) {
      res.json({
        businesses: [],
        total: 0,
        code: "COUNTRY_REQUIRED",
        message: "Select a country or city to browse nearby beauty businesses.",
        platformFees: { commission: 0 },
      });
      return;
    }
    if (queryCountry && profileCountry && !staff
      && queryCountry.toLowerCase() !== profileCountry.toLowerCase()) {
      res.status(403).json({ error: "Cannot browse beauty businesses outside your selected country" });
      return;
    }

    const conds = [
      sql`lower(${beautyBusinessesTable.status}) = 'approved'`,
    ];
    if (country) conds.push(sql`lower(${beautyBusinessesTable.country}) = lower(${country})`);
    if (city) conds.push(ilike(beautyBusinessesTable.city, city));
    if (region) conds.push(ilike(beautyBusinessesTable.region, region));
    if (businessType && businessType !== "all") {
      conds.push(sql`lower(replace(${beautyBusinessesTable.businessType}, '-', '_')) = ${businessType}`);
    }
    if (homeService) conds.push(eq(beautyBusinessesTable.homeServiceAvailable, true));
    if (featuredOnly) {
      conds.push(eq(beautyBusinessesTable.featured, true));
      conds.push(or(
        isNull(beautyBusinessesTable.featuredUntil),
        gte(beautyBusinessesTable.featuredUntil, new Date()),
      )!);
    }
    if (minRating != null && Number.isFinite(minRating)) {
      conds.push(gte(beautyBusinessesTable.avgRating, minRating));
    }
    if (q) {
      conds.push(or(
        ilike(beautyBusinessesTable.name, `%${q}%`),
        ilike(beautyBusinessesTable.description, `%${q}%`),
        ilike(beautyBusinessesTable.city, `%${q}%`),
      )!);
    }
    if (categorySlug) {
      const catDef = beautyCategoryBySlug(categorySlug);
      const typeFallbacks = (catDef?.businessTypes || [])
        .map((t) => t.toLowerCase().replace(/-/g, "_"));
      const linkMatch = sql`EXISTS (
        SELECT 1 FROM beauty_business_categories bbc
        JOIN beauty_categories bc ON bc.id = bbc.category_id
        WHERE bbc.business_id = ${beautyBusinessesTable.id}
          AND bc.slug = ${categorySlug}
          AND bc.is_active = TRUE
      )`;
      if (catDef?.mobileDelivery) {
        conds.push(or(
          linkMatch,
          eq(beautyBusinessesTable.homeServiceAvailable, true),
          sql`lower(replace(${beautyBusinessesTable.businessType}, '-', '_')) IN ('mobile_beauty', 'mobile_barber')`,
          sql`lower(${beautyBusinessesTable.serviceLocationMode}) IN ('at_customer', 'both')`,
        )!);
      } else if (typeFallbacks.length) {
        const inList = typeFallbacks.map((t) => `'${t.replace(/'/g, "")}'`).join(", ");
        conds.push(or(
          linkMatch,
          sql`lower(replace(${beautyBusinessesTable.businessType}, '-', '_')) IN (${sql.raw(inList)})`,
        )!);
      } else {
        conds.push(linkMatch);
      }
    }
    if (maxPriceMinor != null && Number.isFinite(maxPriceMinor)) {
      conds.push(sql`EXISTS (
        SELECT 1 FROM beauty_services bs
        WHERE bs.business_id = ${beautyBusinessesTable.id}
          AND bs.status = 'active'
          AND bs.price_minor <= ${maxPriceMinor}
      )`);
    }

    const rows = await db.select().from(beautyBusinessesTable)
      .where(and(...conds))
      .orderBy(desc(beautyBusinessesTable.featured), desc(beautyBusinessesTable.avgRating))
      .limit(Math.min(200, limit + offset + 40));

    const out = [];
    for (const row of rows) {
      try {
        const hours = await db.select().from(beautyWorkingHoursTable).where(and(
          eq(beautyWorkingHoursTable.businessId, row.id),
          isNull(beautyWorkingHoursTable.professionalId),
        ));
        const hourRows: BeautyHourRow[] = hours.map((h) => ({
          weekday: h.weekday,
          isClosed: h.isClosed,
          openTime: h.openTime,
          closeTime: h.closeTime,
          breakStart: h.breakStart,
          breakEnd: h.breakEnd,
        }));
        const openNow = isBusinessOpenNow(
          hourRows,
          row.timezone,
          new Date(),
          row.vacationMode,
          row.temporarilyClosed,
        );
        if (openNowOnly && !openNow) continue;
        if (availableToday && !openNow) {
          // Soft filter: require at least one open weekday matching today.
          const todayWeekday = new Date().getDay();
          const todayHours = hourRows.find((h) => h.weekday === todayWeekday);
          if (!todayHours || todayHours.isClosed) continue;
        }

        let distanceKm: number | null = null;
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
          && row.latitude != null && row.longitude != null) {
          distanceKm = Math.round(haversineKm(lat, lng, row.latitude, row.longitude) * 10) / 10;
        }
        if (radiusKm != null && lat != null && lng != null && distanceKm != null && distanceKm > radiusKm) {
          continue;
        }

        out.push(shapePublicBusiness(row, { openNow, distanceKm, hours }));
      } catch (rowErr) {
        req.log?.warn?.({ err: rowErr, businessId: row.id }, "GET /beauty/businesses skipped row");
      }
    }

    if (sortBy === "distance" && lat != null && lng != null) {
      out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    } else if (sortBy === "name") {
      out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    } else if (sortBy === "price") {
      // Keep rating/featured order from query; no per-row min price loaded here.
    } else if (sortBy === "newest") {
      out.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }

    res.json({
      businesses: out.slice(offset, offset + limit),
      total: out.length,
      platformFees: { commission: 0 },
    });
  } catch (err) {
    req.log?.error?.({ err }, "GET /beauty/businesses failed");
    res.status(500).json({ error: "Unable to load beauty businesses. Please try again." });
  }
});

router.get("/beauty/businesses/:id", requireBeautyAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [row] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, id)).limit(1);
  if (!row) { res.status(404).json({ error: "Business not found" }); return; }
  const isOwner = req.userId === row.ownerId;
  if (!BEAUTY_PUBLIC_LISTING_STATUSES.has(row.status) && !isOwner && !isStaff(req.user)) {
    res.status(404).json({ error: "Business not found" }); return;
  }

  const [hours, services, professionals, catLinks] = await Promise.all([
    db.select().from(beautyWorkingHoursTable).where(and(
      eq(beautyWorkingHoursTable.businessId, id),
      isNull(beautyWorkingHoursTable.professionalId),
    )),
    db.select().from(beautyServicesTable).where(and(
      eq(beautyServicesTable.businessId, id),
      eq(beautyServicesTable.status, "active"),
    )).orderBy(asc(beautyServicesTable.sortOrder)),
    db.select().from(beautyProfessionalsTable).where(and(
      eq(beautyProfessionalsTable.businessId, id),
      eq(beautyProfessionalsTable.isActive, true),
    )),
    db.select().from(beautyBusinessCategoriesTable)
      .where(eq(beautyBusinessCategoriesTable.businessId, id)),
  ]);

  let categories: Array<{ id: number; slug: string; nameEn: string; kind: string }> = [];
  if (catLinks.length) {
    const cats = await db.select().from(beautyCategoriesTable)
      .where(inArray(beautyCategoriesTable.id, catLinks.map((c) => c.categoryId)));
    categories = cats.map((c) => ({ id: c.id, slug: c.slug, nameEn: c.nameEn, kind: c.kind }));
  }

  const hourRows: BeautyHourRow[] = hours.map((h) => ({
    weekday: h.weekday,
    isClosed: h.isClosed,
    openTime: h.openTime,
    closeTime: h.closeTime,
    breakStart: h.breakStart,
    breakEnd: h.breakEnd,
  }));
  const openNow = isBusinessOpenNow(
    hourRows, row.timezone, new Date(), row.vacationMode, row.temporarilyClosed,
  );

  // Increment views (best-effort).
  void db.update(beautyBusinessesTable).set({
    profileViews: sql`${beautyBusinessesTable.profileViews} + 1`,
  }).where(eq(beautyBusinessesTable.id, id)).catch(() => undefined);

  res.json({
    business: shapePublicBusiness(row, {
      openNow,
      hours,
      services: services.map(shapePublicService),
      professionals: professionals.map(shapePublicProfessional),
      categories,
      reviewsSummary: { avgRating: row.avgRating, ratingCount: row.ratingCount },
    }),
  });
});

router.get("/beauty/businesses/:id/portfolio", requireBeautyAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [biz] = await db.select().from(beautyBusinessesTable).where(eq(beautyBusinessesTable.id, id)).limit(1);
  if (!biz || (!BEAUTY_PUBLIC_LISTING_STATUSES.has(biz.status) && !isStaff(req.user) && req.userId !== biz.ownerId)) {
    res.status(404).json({ error: "Business not found" }); return;
  }
  const items = await db.select().from(beautyPortfolioItemsTable).where(and(
    eq(beautyPortfolioItemsTable.businessId, id),
    eq(beautyPortfolioItemsTable.status, "published"),
  )).orderBy(desc(beautyPortfolioItemsTable.createdAt)).limit(100);
  res.json({ items });
});

router.get("/beauty/businesses/:id/reviews", requireBeautyAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [biz] = await db.select().from(beautyBusinessesTable).where(eq(beautyBusinessesTable.id, id)).limit(1);
  if (!biz || (!BEAUTY_PUBLIC_LISTING_STATUSES.has(biz.status) && !isStaff(req.user) && req.userId !== biz.ownerId)) {
    res.status(404).json({ error: "Business not found" }); return;
  }
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const reviews = await db.select().from(beautyReviewsTable).where(and(
    eq(beautyReviewsTable.businessId, id),
    eq(beautyReviewsTable.status, "published"),
  )).orderBy(desc(beautyReviewsTable.createdAt)).limit(limit).offset(offset);
  res.json({
    reviews: reviews.map((r) => ({
      id: r.id,
      overallRating: r.overallRating,
      serviceQuality: r.serviceQuality,
      professionalism: r.professionalism,
      punctuality: r.punctuality,
      cleanliness: r.cleanliness,
      comment: r.comment,
      photos: r.photos ?? [],
      ownerReply: r.ownerReply,
      ownerRepliedAt: r.ownerRepliedAt?.toISOString() ?? null,
      professionalId: r.professionalId,
      createdAt: r.createdAt.toISOString(),
    })),
    avgRating: biz.avgRating,
    ratingCount: biz.ratingCount,
  });
});

router.get("/beauty/professionals/:id", requireBeautyAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [pro] = await db.select().from(beautyProfessionalsTable)
    .where(eq(beautyProfessionalsTable.id, id)).limit(1);
  if (!pro || !pro.isActive) { res.status(404).json({ error: "Professional not found" }); return; }
  const [biz] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, pro.businessId)).limit(1);
  if (!biz || (!BEAUTY_PUBLIC_LISTING_STATUSES.has(biz.status) && !isStaff(req.user) && req.userId !== biz.ownerId)) {
    res.status(404).json({ error: "Professional not found" }); return;
  }
  const assignments = await db.select().from(beautyServiceAssignmentsTable)
    .where(eq(beautyServiceAssignmentsTable.professionalId, id));
  let services: Array<ReturnType<typeof shapePublicService>> = [];
  if (assignments.length) {
    const svc = await db.select().from(beautyServicesTable).where(and(
      inArray(beautyServicesTable.id, assignments.map((a) => a.serviceId)),
      eq(beautyServicesTable.status, "active"),
    ));
    services = svc.map(shapePublicService);
  }
  res.json({
    professional: shapePublicProfessional(pro),
    business: shapePublicBusiness(biz),
    services,
  });
});

router.get("/beauty/services/:id", requireBeautyAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [svc] = await db.select().from(beautyServicesTable)
    .where(eq(beautyServicesTable.id, id)).limit(1);
  if (!svc || svc.status !== "active") { res.status(404).json({ error: "Service not found" }); return; }
  const [biz] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, svc.businessId)).limit(1);
  if (!biz || (!BEAUTY_PUBLIC_LISTING_STATUSES.has(biz.status) && !isStaff(req.user) && req.userId !== biz.ownerId)) {
    res.status(404).json({ error: "Service not found" }); return;
  }
  const assignments = await db.select().from(beautyServiceAssignmentsTable)
    .where(eq(beautyServiceAssignmentsTable.serviceId, id));
  let professionals: Array<ReturnType<typeof shapePublicProfessional>> = [];
  if (assignments.length) {
    const pros = await db.select().from(beautyProfessionalsTable).where(and(
      inArray(beautyProfessionalsTable.id, assignments.map((a) => a.professionalId)),
      eq(beautyProfessionalsTable.isActive, true),
    ));
    professionals = pros.map(shapePublicProfessional);
  }
  res.json({
    service: shapePublicService(svc),
    business: shapePublicBusiness(biz),
    professionals,
  });
});

router.get("/beauty/availability", requireBeautyAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.query.businessId);
  const serviceId = Number(req.query.serviceId);
  const professionalId = req.query.professionalId != null && req.query.professionalId !== ""
    ? Number(req.query.professionalId)
    : null;
  const date = String(req.query.date || "").trim();
  const serviceLocation = String(req.query.serviceLocation || "").trim() || undefined;

  if (!Number.isFinite(businessId) || !Number.isFinite(serviceId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "businessId, serviceId, and date (YYYY-MM-DD) are required" });
    return;
  }

  const [biz] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, businessId)).limit(1);
  if (!biz || !BEAUTY_PUBLIC_LISTING_STATUSES.has(biz.status)) {
    res.status(404).json({ error: "Business not found" }); return;
  }
  if (biz.vacationMode || biz.temporarilyClosed) {
    res.json({ slots: [], date, timezone: biz.timezone, reason: "closed" });
    return;
  }

  const [service] = await db.select().from(beautyServicesTable).where(and(
    eq(beautyServicesTable.id, serviceId),
    eq(beautyServicesTable.businessId, businessId),
    eq(beautyServicesTable.status, "active"),
  )).limit(1);
  if (!service) { res.status(404).json({ error: "Service not found" }); return; }

  if (serviceLocation) {
    const mode = service.serviceLocation;
    if (mode !== "both" && mode !== serviceLocation) {
      res.status(400).json({ error: "Service is not offered at that location" }); return;
    }
  }

  const travelMinutes = (serviceLocation === "at_customer" || service.serviceLocation === "at_customer")
    ? Math.max(0, Number(req.query.travelMinutes) || 15)
    : 0;

  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  const candidatePros: Array<number | null> = [];
  if (professionalId != null && Number.isFinite(professionalId)) {
    candidatePros.push(professionalId);
  } else {
    const assignments = await db.select().from(beautyServiceAssignmentsTable)
      .where(eq(beautyServiceAssignmentsTable.serviceId, serviceId));
    if (assignments.length) {
      const pros = await db.select().from(beautyProfessionalsTable).where(and(
        inArray(beautyProfessionalsTable.id, assignments.map((a) => a.professionalId)),
        eq(beautyProfessionalsTable.isActive, true),
      ));
      for (const p of pros) candidatePros.push(p.id);
    } else {
      candidatePros.push(null);
    }
  }

  const byPro: Array<{ professionalId: number | null; slots: string[] }> = [];
  for (const proId of candidatePros) {
    const hours = await loadHoursForSlot(businessId, proId);
    const existing = await loadBlockingIntervals(businessId, proId, dayStart, dayEnd);
    const exceptions = await loadExceptions(businessId, proId, dayStart, dayEnd);
    const slots = generateDaySlots({
      dayYmd: date,
      timeZone: biz.timezone,
      hours,
      durationMinutes: service.durationMinutes,
      prepMinutes: service.prepMinutes,
      cleanupMinutes: service.cleanupMinutes,
      travelMinutes,
      leadMinutes: biz.bookingLeadMinutes,
      existing,
      exceptions,
    });
    byPro.push({ professionalId: proId, slots });
  }

  const allSlots = [...new Set(byPro.flatMap((p) => p.slots))].sort();
  res.json({
    date,
    timezone: biz.timezone,
    slots: allSlots,
    byProfessional: byPro,
    service: shapePublicService(service),
  });
});

/* ─── ONBOARDING ─────────────────────────────────────────────────────────── */

router.post("/beauty/businesses", requireBeautyAuthAccess, requireNotRestricted, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const name = String(body.name || "").trim().slice(0, 120);
  const country = String(body.country || "").trim();
  const city = String(body.city || "").trim();
  const businessType = normalizeBusinessType(String(body.businessType || "beauty_studio"));
  if (name.length < 2 || !country || !city) {
    res.status(400).json({ error: "Name, country, and city are required" }); return;
  }
  if (!ALLOWED_BUSINESS_TYPES.has(businessType)) {
    res.status(400).json({
      error: "Invalid business type",
      allowed: [...ALLOWED_BUSINESS_TYPES],
    });
    return;
  }
  const phone = body.phone != null ? String(body.phone).trim().slice(0, 40) : "";
  if (phone && !isValidBusinessPhone(phone)) {
    res.status(400).json({ error: "Invalid business phone number" }); return;
  }
  const whatsappRaw = body.whatsapp != null ? String(body.whatsapp).trim() : "";
  if (whatsappRaw && !isValidBusinessPhone(whatsappRaw)) {
    res.status(400).json({ error: "Invalid WhatsApp number" }); return;
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  for (let i = 0; i < 5; i++) {
    const [clash] = await db.select({ id: beautyBusinessesTable.id })
      .from(beautyBusinessesTable).where(eq(beautyBusinessesTable.slug, slug)).limit(1);
    if (!clash) break;
    slug = `${baseSlug}-${Math.floor(Math.random() * 9000 + 1000)}`;
  }

  const [created] = await db.insert(beautyBusinessesTable).values({
    ownerId: req.userId!,
    businessType,
    name,
    slug,
    description: String(body.description || "").trim().slice(0, 4000),
    logoUrl: body.logoUrl ? String(body.logoUrl) : null,
    coverUrl: body.coverUrl ? String(body.coverUrl) : null,
    phone: phone ? normalizeDialablePhone(phone).slice(0, 40) : null,
    email: body.email ? String(body.email).trim().slice(0, 160) : null,
    whatsapp: whatsappRaw ? normalizeDialablePhone(whatsappRaw).slice(0, 40) : null,
    country,
    region: body.region ? String(body.region).trim() : null,
    city,
    streetAddress: String(body.streetAddress || "").trim(),
    postalCode: body.postalCode ? String(body.postalCode) : null,
    latitude: body.latitude != null ? Number(body.latitude) : null,
    longitude: body.longitude != null ? Number(body.longitude) : null,
    timezone: String(body.timezone || "America/Port-au-Prince"),
    privateResidentialAddress: body.privateResidentialAddress
      ? String(body.privateResidentialAddress).slice(0, 500)
      : null,
    publicAddress: body.publicAddress ? String(body.publicAddress).slice(0, 500) : null,
    showPublicAddress: body.showPublicAddress !== false,
    serviceLocationMode: String(body.serviceLocationMode || "at_business"),
    homeServiceAvailable: !!body.homeServiceAvailable,
    serviceRadiusKm: body.serviceRadiusKm != null ? Number(body.serviceRadiusKm) : 10,
    travelFeeMinor: body.travelFeeMinor != null ? Math.max(0, Math.floor(Number(body.travelFeeMinor))) : 0,
    currency: String(body.currency || "USD").toUpperCase().slice(0, 3),
    status: "draft",
    onboardingStep: Number(body.onboardingStep) || 1,
    termsAcceptedAt: body.termsAccepted === true ? new Date() : null,
  }).returning();

  const defaultHours = Array.from({ length: 7 }, (_, weekday) => ({
    businessId: created.id,
    professionalId: null as number | null,
    weekday,
    isClosed: weekday === 0,
    openTime: "09:00",
    closeTime: "18:00",
    breakStart: null as string | null,
    breakEnd: null as string | null,
  }));
  await db.insert(beautyWorkingHoursTable).values(defaultHours);

  // Owner as default professional
  await db.insert(beautyProfessionalsTable).values({
    businessId: created.id,
    userId: req.userId!,
    fullName: String(body.ownerName || req.user?.name || name).slice(0, 120),
    role: "owner",
    inviteStatus: "active",
    isActive: true,
  });

  // Link one or more primary marketplace categories (max 12).
  let categoryIds = Array.isArray(body.categoryIds)
    ? body.categoryIds.map(Number).filter(Number.isFinite).slice(0, 12)
    : [];
  if (!categoryIds.length && Array.isArray(body.categorySlugs)) {
    await ensureDefaultCategories();
    const slugs = body.categorySlugs.map(String).filter(Boolean).slice(0, 12);
    if (slugs.length) {
      const rows = await db.select({ id: beautyCategoriesTable.id, slug: beautyCategoriesTable.slug })
        .from(beautyCategoriesTable)
        .where(inArray(beautyCategoriesTable.slug, slugs));
      categoryIds = rows.map((r) => r.id);
    }
  }
  if (categoryIds.length) {
    await db.insert(beautyBusinessCategoriesTable).values(
      categoryIds.map((categoryId: number) => ({ businessId: created.id, categoryId })),
    );
  }

  await writeAudit({
    actorId: req.userId!,
    businessId: created.id,
    action: "business_created",
    entityType: "business",
    entityId: created.id,
  });

  res.status(201).json({ business: shapeOwnerBusiness(created) });
});

router.get("/beauty/my-businesses", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const rows = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.ownerId, req.userId!))
    .orderBy(desc(beautyBusinessesTable.updatedAt));
  res.json({ businesses: rows.map(shapeOwnerBusiness) });
});

router.get("/beauty/my-businesses/:id", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const access = await canAccessBeautyCenter(req.userId!, id, req.user);
  if (!access.ok || !access.business) { res.status(404).json({ error: "Not found" }); return; }
  const biz = access.business;
  const [hours, services, professionals, portfolio] = await Promise.all([
    db.select().from(beautyWorkingHoursTable).where(eq(beautyWorkingHoursTable.businessId, id)),
    db.select().from(beautyServicesTable).where(eq(beautyServicesTable.businessId, id))
      .orderBy(asc(beautyServicesTable.sortOrder)),
    db.select().from(beautyProfessionalsTable).where(eq(beautyProfessionalsTable.businessId, id)),
    db.select().from(beautyPortfolioItemsTable).where(eq(beautyPortfolioItemsTable.businessId, id))
      .orderBy(desc(beautyPortfolioItemsTable.createdAt)),
  ]);
  res.json({
    business: shapeOwnerBusiness(biz),
    hours,
    services: services.map(shapePublicService),
    professionals,
    portfolio,
  });
});

router.patch("/beauty/my-businesses/:id", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const existing = await loadOwnerBusiness(req.userId!, id);
  if (!existing && !isStaff(req.user)) { res.status(404).json({ error: "Not found" }); return; }
  const row = existing ?? (await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, id)).limit(1))[0];
  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const body = req.body ?? {};
  const patch: Partial<typeof beautyBusinessesTable.$inferInsert> = { updatedAt: new Date() };

  for (const key of [
    "name", "description", "logoUrl", "coverUrl", "region", "city", "streetAddress",
    "postalCode", "timezone", "privateResidentialAddress", "publicAddress", "email",
    "serviceLocationMode", "currency",
  ] as const) {
    if (body[key] != null) (patch as any)[key] = String(body[key]);
  }
  if (Object.prototype.hasOwnProperty.call(body, "phone")) {
    const phone = body.phone == null ? "" : String(body.phone).trim();
    if (phone && !isValidBusinessPhone(phone)) {
      res.status(400).json({ error: "Invalid business phone number" }); return;
    }
    patch.phone = phone ? normalizeDialablePhone(phone).slice(0, 40) : null;
  }
  if (Object.prototype.hasOwnProperty.call(body, "whatsapp")) {
    const wa = body.whatsapp == null ? "" : String(body.whatsapp).trim();
    if (wa && !isValidBusinessPhone(wa)) {
      res.status(400).json({ error: "Invalid WhatsApp number" }); return;
    }
    patch.whatsapp = wa ? normalizeDialablePhone(wa).slice(0, 40) : null;
  }
  if (typeof body.showPublicAddress === "boolean") patch.showPublicAddress = body.showPublicAddress;
  if (typeof body.homeServiceAvailable === "boolean") patch.homeServiceAvailable = body.homeServiceAvailable;
  if (typeof body.vacationMode === "boolean") patch.vacationMode = body.vacationMode;
  if (typeof body.temporarilyClosed === "boolean") patch.temporarilyClosed = body.temporarilyClosed;
  if (body.serviceRadiusKm != null) patch.serviceRadiusKm = Number(body.serviceRadiusKm);
  if (body.travelFeeMinor != null) patch.travelFeeMinor = Math.max(0, Math.floor(Number(body.travelFeeMinor)));
  if (body.bookingLeadMinutes != null) patch.bookingLeadMinutes = Math.max(0, Math.floor(Number(body.bookingLeadMinutes)));
  if (body.latitude != null) patch.latitude = Number(body.latitude);
  if (body.longitude != null) patch.longitude = Number(body.longitude);
  if (body.onboardingStep != null) patch.onboardingStep = Math.max(1, Math.floor(Number(body.onboardingStep)));
  if (body.businessType != null) {
    const bt = normalizeBusinessType(String(body.businessType));
    if (!ALLOWED_BUSINESS_TYPES.has(bt)) {
      res.status(400).json({ error: "Invalid business type" }); return;
    }
    patch.businessType = bt;
  }
  if (body.termsAccepted === true && !row.termsAcceptedAt) {
    patch.termsAcceptedAt = new Date();
  }

  if (body.submit === true) {
    if (!row.name || String(row.name).trim().length < 2 || !row.city || !row.country) {
      res.status(400).json({ error: "Incomplete business profile" }); return;
    }
    const effectivePhone = Object.prototype.hasOwnProperty.call(patch, "phone")
      ? (patch.phone as string | null)
      : row.phone;
    if (!isValidBusinessPhone(effectivePhone)) {
      res.status(400).json({ error: "A valid business phone is required before submission" }); return;
    }
    patch.status = "submitted";
  }

  const [updated] = await db.update(beautyBusinessesTable).set(patch)
    .where(eq(beautyBusinessesTable.id, id)).returning();

  let patchCategoryIds: number[] | null = null;
  if (Array.isArray(body.categoryIds)) {
    patchCategoryIds = body.categoryIds.map(Number).filter(Number.isFinite).slice(0, 12);
  } else if (Array.isArray(body.categorySlugs)) {
    await ensureDefaultCategories();
    const slugs = body.categorySlugs.map(String).filter(Boolean).slice(0, 12);
    if (slugs.length) {
      const rows = await db.select({ id: beautyCategoriesTable.id })
        .from(beautyCategoriesTable)
        .where(inArray(beautyCategoriesTable.slug, slugs));
      patchCategoryIds = rows.map((r) => r.id);
    } else {
      patchCategoryIds = [];
    }
  }
  if (patchCategoryIds) {
    await db.delete(beautyBusinessCategoriesTable)
      .where(eq(beautyBusinessCategoriesTable.businessId, id));
    const ids = patchCategoryIds;
    if (ids.length) {
      await db.insert(beautyBusinessCategoriesTable).values(
        ids.map((categoryId: number) => ({ businessId: id, categoryId })),
      );
    }
  }

  await writeAudit({
    actorId: req.userId!,
    businessId: id,
    action: body.submit === true ? "business_submitted" : "business_updated",
    entityType: "business",
    entityId: id,
  });

  res.json({ business: shapeOwnerBusiness(updated) });
});

router.put("/beauty/my-businesses/:id/hours", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const business = await loadOwnerBusiness(req.userId!, id);
  if (!business && !isStaff(req.user)) { res.status(404).json({ error: "Not found" }); return; }
  if (!business) {
    const [row] = await db.select().from(beautyBusinessesTable)
      .where(eq(beautyBusinessesTable.id, id)).limit(1);
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
  }

  const hours = Array.isArray(req.body?.hours) ? req.body.hours : [];
  const professionalId = req.body?.professionalId != null ? Number(req.body.professionalId) : null;

  if (professionalId != null) {
    await db.delete(beautyWorkingHoursTable).where(and(
      eq(beautyWorkingHoursTable.businessId, id),
      eq(beautyWorkingHoursTable.professionalId, professionalId),
    ));
  } else {
    await db.delete(beautyWorkingHoursTable).where(and(
      eq(beautyWorkingHoursTable.businessId, id),
      isNull(beautyWorkingHoursTable.professionalId),
    ));
  }

  const rows = hours.slice(0, 7).map((h: any) => ({
    businessId: id,
    professionalId,
    weekday: Number(h.weekday),
    isClosed: !!h.isClosed,
    openTime: h.openTime ? String(h.openTime) : null,
    closeTime: h.closeTime ? String(h.closeTime) : null,
    breakStart: h.breakStart ? String(h.breakStart) : null,
    breakEnd: h.breakEnd ? String(h.breakEnd) : null,
  })).filter((h: { weekday: number }) => h.weekday >= 0 && h.weekday <= 6);

  if (rows.length) await db.insert(beautyWorkingHoursTable).values(rows);
  const saved = await db.select().from(beautyWorkingHoursTable)
    .where(eq(beautyWorkingHoursTable.businessId, id));
  res.json({ hours: saved });
});

function isValidPublicImageUrl(raw: unknown): boolean {
  const u = String(raw || "").trim();
  if (!u) return false;
  if (!/^https?:\/\//i.test(u)) return false;
  if (/^(data:|blob:|file:)/i.test(u)) return false;
  return true;
}

router.post("/beauty/my-businesses/:id/services", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const business = await loadOwnerBusiness(req.userId!, id);
  if (!business) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  const name = String(body.name || "").trim().slice(0, 160);
  const priceMinor = Math.max(0, Math.floor(Number(body.priceMinor)));
  if (!name || !Number.isFinite(priceMinor)) {
    res.status(400).json({ error: "name and priceMinor are required" }); return;
  }
  const status = String(body.status || "active");
  const imageUrl = body.imageUrl ? String(body.imageUrl).trim() : "";
  if (status === "active" && !isValidPublicImageUrl(imageUrl)) {
    res.status(400).json({ error: "A valid service image is required before publishing" });
    return;
  }
  const [created] = await db.insert(beautyServicesTable).values({
    businessId: id,
    categoryId: body.categoryId != null ? Number(body.categoryId) : null,
    name,
    description: String(body.description || "").slice(0, 4000),
    imageUrl: imageUrl || null,
    priceType: String(body.priceType || "fixed"),
    priceMinor,
    currency: String(body.currency || business.currency || "USD").toUpperCase().slice(0, 3),
    durationMinutes: Math.max(5, Math.floor(Number(body.durationMinutes) || 60)),
    prepMinutes: Math.max(0, Math.floor(Number(body.prepMinutes) || 0)),
    cleanupMinutes: Math.max(0, Math.floor(Number(body.cleanupMinutes) || 0)),
    serviceLocation: String(body.serviceLocation || "at_business"),
    travelFeeMinor: Math.max(0, Math.floor(Number(body.travelFeeMinor) || 0)),
    depositRequired: !!body.depositRequired,
    depositMinor: Math.max(0, Math.floor(Number(body.depositMinor) || 0)),
    depositType: String(body.depositType || "fixed"),
    preparationInstructions: String(body.preparationInstructions || ""),
    cancellationPolicy: String(body.cancellationPolicy || ""),
    status,
    sortOrder: Math.floor(Number(body.sortOrder) || 0),
  }).returning();

  if (Array.isArray(body.professionalIds) && body.professionalIds.length) {
    const proIds = body.professionalIds.map(Number).filter(Number.isFinite);
    if (proIds.length) {
      await db.insert(beautyServiceAssignmentsTable).values(
        proIds.map((professionalId: number) => ({ serviceId: created.id, professionalId })),
      );
    }
  }

  res.status(201).json({ service: shapePublicService(created) });
});

router.patch("/beauty/my-businesses/:id/services/:serviceId", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const serviceId = Number(req.params.serviceId);
  const business = await loadOwnerBusiness(req.userId!, id);
  if (!business) { res.status(404).json({ error: "Not found" }); return; }
  const [svc] = await db.select().from(beautyServicesTable).where(and(
    eq(beautyServicesTable.id, serviceId),
    eq(beautyServicesTable.businessId, id),
  )).limit(1);
  if (!svc) { res.status(404).json({ error: "Service not found" }); return; }

  const body = req.body ?? {};
  const patch: Partial<typeof beautyServicesTable.$inferInsert> = { updatedAt: new Date() };
  if (body.name != null) patch.name = String(body.name).slice(0, 160);
  if (body.description != null) patch.description = String(body.description).slice(0, 4000);
  if (body.imageUrl !== undefined) {
    const nextImage = body.imageUrl ? String(body.imageUrl).trim() : "";
    if (nextImage && !isValidPublicImageUrl(nextImage)) {
      res.status(400).json({ error: "Invalid service image URL" });
      return;
    }
    patch.imageUrl = nextImage || null;
  }
  if (body.priceType != null) patch.priceType = String(body.priceType);
  if (body.priceMinor != null) patch.priceMinor = Math.max(0, Math.floor(Number(body.priceMinor)));
  if (body.currency != null) patch.currency = String(body.currency).toUpperCase().slice(0, 3);
  if (body.durationMinutes != null) patch.durationMinutes = Math.max(5, Math.floor(Number(body.durationMinutes)));
  if (body.prepMinutes != null) patch.prepMinutes = Math.max(0, Math.floor(Number(body.prepMinutes)));
  if (body.cleanupMinutes != null) patch.cleanupMinutes = Math.max(0, Math.floor(Number(body.cleanupMinutes)));
  if (body.serviceLocation != null) patch.serviceLocation = String(body.serviceLocation);
  if (body.travelFeeMinor != null) patch.travelFeeMinor = Math.max(0, Math.floor(Number(body.travelFeeMinor)));
  if (typeof body.depositRequired === "boolean") patch.depositRequired = body.depositRequired;
  if (body.depositMinor != null) patch.depositMinor = Math.max(0, Math.floor(Number(body.depositMinor)));
  if (body.depositType != null) patch.depositType = String(body.depositType);
  if (body.preparationInstructions != null) patch.preparationInstructions = String(body.preparationInstructions);
  if (body.cancellationPolicy != null) patch.cancellationPolicy = String(body.cancellationPolicy);
  if (body.status != null) patch.status = String(body.status);
  if (body.sortOrder != null) patch.sortOrder = Math.floor(Number(body.sortOrder));
  if (body.categoryId !== undefined) patch.categoryId = body.categoryId != null ? Number(body.categoryId) : null;

  const nextStatus = patch.status ?? svc.status;
  const nextImage = patch.imageUrl !== undefined ? patch.imageUrl : svc.imageUrl;
  if (nextStatus === "active" && !isValidPublicImageUrl(nextImage)) {
    res.status(400).json({ error: "A valid service image is required before activating" });
    return;
  }

  const [updated] = await db.update(beautyServicesTable).set(patch)
    .where(eq(beautyServicesTable.id, serviceId)).returning();

  if (Array.isArray(body.professionalIds)) {
    await db.delete(beautyServiceAssignmentsTable)
      .where(eq(beautyServiceAssignmentsTable.serviceId, serviceId));
    const proIds = body.professionalIds.map(Number).filter(Number.isFinite);
    if (proIds.length) {
      await db.insert(beautyServiceAssignmentsTable).values(
        proIds.map((professionalId: number) => ({ serviceId, professionalId })),
      );
    }
  }

  res.json({ service: shapePublicService(updated) });
});

router.post("/beauty/my-businesses/:id/professionals", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const business = await loadOwnerBusiness(req.userId!, id);
  if (!business) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  const fullName = String(body.fullName || "").trim().slice(0, 120);
  if (!fullName) { res.status(400).json({ error: "fullName is required" }); return; }

  const [created] = await db.insert(beautyProfessionalsTable).values({
    businessId: id,
    userId: body.userId != null ? Number(body.userId) : null,
    fullName,
    photoUrl: body.photoUrl ? String(body.photoUrl) : null,
    biography: String(body.biography || "").slice(0, 4000),
    yearsExperience: Math.max(0, Math.floor(Number(body.yearsExperience) || 0)),
    specializations: Array.isArray(body.specializations)
      ? body.specializations.map(String).slice(0, 20)
      : [],
    certifications: Array.isArray(body.certifications)
      ? body.certifications.map(String).slice(0, 20)
      : [],
    role: String(body.role || "staff"),
    inviteStatus: body.userId ? "pending" : "active",
    inviteEmail: body.inviteEmail ? String(body.inviteEmail).slice(0, 160) : null,
    isActive: body.isActive !== false,
  }).returning();

  res.status(201).json({ professional: created });
});

router.patch("/beauty/my-businesses/:id/professionals/:proId", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const proId = Number(req.params.proId);
  const business = await loadOwnerBusiness(req.userId!, id);
  if (!business) { res.status(404).json({ error: "Not found" }); return; }
  const [pro] = await db.select().from(beautyProfessionalsTable).where(and(
    eq(beautyProfessionalsTable.id, proId),
    eq(beautyProfessionalsTable.businessId, id),
  )).limit(1);
  if (!pro) { res.status(404).json({ error: "Professional not found" }); return; }

  const body = req.body ?? {};
  const patch: Partial<typeof beautyProfessionalsTable.$inferInsert> = { updatedAt: new Date() };
  if (body.fullName != null) patch.fullName = String(body.fullName).slice(0, 120);
  if (body.photoUrl !== undefined) patch.photoUrl = body.photoUrl ? String(body.photoUrl) : null;
  if (body.biography != null) patch.biography = String(body.biography).slice(0, 4000);
  if (body.yearsExperience != null) patch.yearsExperience = Math.max(0, Math.floor(Number(body.yearsExperience)));
  if (Array.isArray(body.specializations)) patch.specializations = body.specializations.map(String).slice(0, 20);
  if (Array.isArray(body.certifications)) patch.certifications = body.certifications.map(String).slice(0, 20);
  if (body.role != null) patch.role = String(body.role);
  if (typeof body.isActive === "boolean") patch.isActive = body.isActive;
  if (body.inviteStatus != null) patch.inviteStatus = String(body.inviteStatus);
  if (body.userId !== undefined) patch.userId = body.userId != null ? Number(body.userId) : null;

  const [updated] = await db.update(beautyProfessionalsTable).set(patch)
    .where(eq(beautyProfessionalsTable.id, proId)).returning();
  res.json({ professional: updated });
});

router.post("/beauty/my-businesses/:id/portfolio", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const business = await loadOwnerBusiness(req.userId!, id);
  if (!business) { res.status(404).json({ error: "Not found" }); return; }
  const body = req.body ?? {};
  const mediaUrl = String(body.mediaUrl || "").trim();
  if (!mediaUrl) { res.status(400).json({ error: "mediaUrl is required" }); return; }
  if (String(body.mediaType || "photo") === "photo" && !isValidPublicImageUrl(mediaUrl)) {
    res.status(400).json({ error: "A valid mediaUrl is required for portfolio photos" });
    return;
  }

  const [created] = await db.insert(beautyPortfolioItemsTable).values({
    businessId: id,
    professionalId: body.professionalId != null ? Number(body.professionalId) : null,
    categoryId: body.categoryId != null ? Number(body.categoryId) : null,
    title: String(body.title || "").slice(0, 200),
    description: String(body.description || "").slice(0, 2000),
    mediaType: String(body.mediaType || "photo"),
    mediaUrl,
    thumbnailUrl: body.thumbnailUrl ? String(body.thumbnailUrl) : null,
    beforeUrl: body.beforeUrl ? String(body.beforeUrl) : null,
    afterUrl: body.afterUrl ? String(body.afterUrl) : null,
    priceReferenceMinor: body.priceReferenceMinor != null
      ? Math.max(0, Math.floor(Number(body.priceReferenceMinor)))
      : null,
    currency: String(body.currency || business.currency || "USD").toUpperCase().slice(0, 3),
    status: String(body.status || "published"),
  }).returning();

  res.status(201).json({ item: created });
});

router.delete("/beauty/my-businesses/:id/portfolio/:itemId", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  const business = await loadOwnerBusiness(req.userId!, id);
  if (!business) { res.status(404).json({ error: "Not found" }); return; }
  await db.delete(beautyPortfolioItemsTable).where(and(
    eq(beautyPortfolioItemsTable.id, itemId),
    eq(beautyPortfolioItemsTable.businessId, id),
  ));
  res.json({ ok: true });
});

/* ─── BOOKING ────────────────────────────────────────────────────────────── */

async function createAppointmentCore(input: {
  customerId: number;
  businessId: number;
  serviceId: number;
  professionalId: number | null;
  serviceLocation: string;
  startsAt: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  customerNotes?: string;
  customerAddress?: string | null;
  customerAddressInstructions?: string | null;
  customerLatitude?: number | null;
  customerLongitude?: number | null;
  estimatedTravelMinutes?: number | null;
  paymentMode: "full" | "deposit" | "pay_at_location";
  idempotencyKey?: string | null;
  actorId: number;
  manual?: boolean;
}): Promise<{
  appointment: typeof beautyAppointmentsTable.$inferSelect;
  payment: { clientSecret: string | null; paymentIntentId: string | null; mode: string };
  deduped?: boolean;
}> {
  if (input.idempotencyKey) {
    const [existing] = await db.select().from(beautyAppointmentsTable)
      .where(eq(beautyAppointmentsTable.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) {
      return {
        appointment: existing,
        payment: { clientSecret: null, paymentIntentId: existing.stripePaymentIntentId, mode: input.paymentMode },
        deduped: true,
      };
    }
  }

  const [biz] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, input.businessId)).limit(1);
  if (!biz || !BEAUTY_PUBLIC_LISTING_STATUSES.has(biz.status)) {
    throw Object.assign(new Error("BUSINESS_NOT_FOUND"), { http: 404 });
  }
  if (!input.manual && (biz.vacationMode || biz.temporarilyClosed)) {
    throw Object.assign(new Error("BUSINESS_CLOSED"), { http: 409 });
  }
  if (!input.manual && biz.ownerId === input.customerId) {
    throw Object.assign(new Error("OWN_BUSINESS"), { http: 400 });
  }

  const [service] = await db.select().from(beautyServicesTable).where(and(
    eq(beautyServicesTable.id, input.serviceId),
    eq(beautyServicesTable.businessId, input.businessId),
    eq(beautyServicesTable.status, "active"),
  )).limit(1);
  if (!service) throw Object.assign(new Error("SERVICE_NOT_FOUND"), { http: 404 });

  const loc = input.serviceLocation === "at_customer" ? "at_customer" : "at_business";
  if (service.serviceLocation !== "both" && service.serviceLocation !== loc) {
    throw Object.assign(new Error("LOCATION_UNSUPPORTED"), { http: 400 });
  }
  if (loc === "at_customer" && !input.customerAddress && !input.manual) {
    throw Object.assign(new Error("ADDRESS_REQUIRED"), { http: 400 });
  }

  let professionalId = input.professionalId;
  if (professionalId != null) {
    const [pro] = await db.select().from(beautyProfessionalsTable).where(and(
      eq(beautyProfessionalsTable.id, professionalId),
      eq(beautyProfessionalsTable.businessId, input.businessId),
      eq(beautyProfessionalsTable.isActive, true),
    )).limit(1);
    if (!pro) throw Object.assign(new Error("PRO_NOT_FOUND"), { http: 404 });
  } else {
    // First available professional assigned to this service (or any active pro).
    const assignments = await db.select().from(beautyServiceAssignmentsTable)
      .where(eq(beautyServiceAssignmentsTable.serviceId, service.id));
    const candidateIds = assignments.length
      ? assignments.map((a) => a.professionalId)
      : (await db.select({ id: beautyProfessionalsTable.id }).from(beautyProfessionalsTable).where(and(
        eq(beautyProfessionalsTable.businessId, input.businessId),
        eq(beautyProfessionalsTable.isActive, true),
      ))).map((p) => p.id);

    const dayYmd = localYmd(input.startsAt, biz.timezone);
    const dayStart = new Date(`${dayYmd}T00:00:00.000Z`);
    const dayEnd = new Date(`${dayYmd}T23:59:59.999Z`);
    const travelMinutes = loc === "at_customer"
      ? (input.estimatedTravelMinutes ?? 15)
      : 0;
    const totalBlock = service.durationMinutes + service.prepMinutes + service.cleanupMinutes + travelMinutes;
    const endsAtProbe = new Date(input.startsAt.getTime() + totalBlock * 60_000);

    let chosen: number | null = null;
    for (const cand of candidateIds) {
      const hours = await loadHoursForSlot(input.businessId, cand);
      const existing = await loadBlockingIntervals(input.businessId, cand, dayStart, dayEnd);
      const exceptions = await loadExceptions(input.businessId, cand, dayStart, dayEnd);
      const slots = generateDaySlots({
        dayYmd,
        timeZone: biz.timezone,
        hours,
        durationMinutes: service.durationMinutes,
        prepMinutes: service.prepMinutes,
        cleanupMinutes: service.cleanupMinutes,
        travelMinutes,
        leadMinutes: input.manual ? 0 : biz.bookingLeadMinutes,
        existing,
        exceptions,
        now: input.manual ? new Date(0) : new Date(),
      });
      if (slots.includes(input.startsAt.toISOString())
        || existing.every((e) => !(input.startsAt < e.endsAt && endsAtProbe > e.startsAt))) {
        // Prefer exact slot match; fall back to free interval check.
        if (slots.includes(input.startsAt.toISOString())
          || !existing.some((e) => input.startsAt < e.endsAt && endsAtProbe > e.startsAt)) {
          chosen = cand;
          break;
        }
      }
    }
    if (chosen == null && candidateIds.length) {
      // Still try first candidate — transaction will re-check conflicts.
      chosen = candidateIds[0] ?? null;
    }
    professionalId = chosen;
  }

  const travelFeeMinor = loc === "at_customer"
    ? (service.travelFeeMinor || biz.travelFeeMinor || 0)
    : 0;
  const travelMinutes = loc === "at_customer" ? (input.estimatedTravelMinutes ?? 15) : 0;
  const totalBlock = service.durationMinutes + service.prepMinutes + service.cleanupMinutes + travelMinutes;
  const endsAt = new Date(input.startsAt.getTime() + totalBlock * 60_000);
  const depositMinor = computeDepositMinor(service);
  const totalMinor = service.priceMinor + travelFeeMinor;
  const currency = service.currency || biz.currency || "USD";

  if (input.paymentMode === "deposit" && depositMinor <= 0) {
    throw Object.assign(new Error("DEPOSIT_NOT_OFFERED"), { http: 400 });
  }

  const appointment = await db.transaction(async (tx) => {
    // Re-check conflicts inside transaction.
    if (professionalId != null) {
      const blocking = [...BEAUTY_BLOCKING_APPOINTMENT_STATUSES];
      const conflicts = await tx.select({ id: beautyAppointmentsTable.id })
        .from(beautyAppointmentsTable).where(and(
          eq(beautyAppointmentsTable.businessId, input.businessId),
          eq(beautyAppointmentsTable.professionalId, professionalId),
          inArray(beautyAppointmentsTable.status, blocking),
          sql`${beautyAppointmentsTable.startsAt} < ${endsAt}`,
          sql`${beautyAppointmentsTable.endsAt} > ${input.startsAt}`,
        )).limit(1);
      if (conflicts.length) throw Object.assign(new Error("SLOT_TAKEN"), { http: 409 });

      const now = new Date();
      const resConflicts = await tx.select({ id: beautyAppointmentReservationsTable.id })
        .from(beautyAppointmentReservationsTable).where(and(
          eq(beautyAppointmentReservationsTable.businessId, input.businessId),
          eq(beautyAppointmentReservationsTable.professionalId, professionalId),
          gte(beautyAppointmentReservationsTable.expiresAt, now),
          sql`${beautyAppointmentReservationsTable.startsAt} < ${endsAt}`,
          sql`${beautyAppointmentReservationsTable.endsAt} > ${input.startsAt}`,
        )).limit(1);
      if (resConflicts.length) throw Object.assign(new Error("SLOT_TAKEN"), { http: 409 });
    }

    let paymentStatus = "unpaid";
    let status = "pending_confirmation";
    if (input.paymentMode === "pay_at_location") {
      paymentStatus = "pay_at_location";
      status = "confirmed";
    }

    const reservationExpiresAt = input.paymentMode === "pay_at_location"
      ? null
      : new Date(Date.now() + 15 * 60_000);

    const [created] = await tx.insert(beautyAppointmentsTable).values({
      businessId: input.businessId,
      customerId: input.customerId,
      professionalId,
      serviceId: service.id,
      status,
      paymentStatus,
      serviceLocation: loc,
      startsAt: input.startsAt,
      endsAt,
      timezone: biz.timezone,
      serviceNameSnapshot: service.name,
      durationMinutesSnapshot: service.durationMinutes,
      priceMinorSnapshot: service.priceMinor,
      travelFeeMinorSnapshot: travelFeeMinor,
      depositMinorSnapshot: depositMinor,
      currency,
      totalMinor,
      customerName: input.customerName ?? null,
      customerPhone: input.customerPhone ?? null,
      customerNotes: input.customerNotes ?? "",
      customerAddress: loc === "at_customer" ? (input.customerAddress ?? null) : null,
      customerAddressInstructions: input.customerAddressInstructions ?? null,
      customerLatitude: input.customerLatitude ?? null,
      customerLongitude: input.customerLongitude ?? null,
      estimatedTravelMinutes: travelMinutes || null,
      idempotencyKey: input.idempotencyKey ?? null,
      reservationExpiresAt,
    }).returning();

    await tx.insert(beautyAppointmentHistoryTable).values({
      appointmentId: created.id,
      fromStatus: null,
      toStatus: status,
      actorId: input.actorId,
      note: input.manual ? "Manual booking by business" : "Customer booking",
    });

    return created;
  });

  let payment: { clientSecret: string | null; paymentIntentId: string | null; mode: string } = {
    clientSecret: null,
    paymentIntentId: null,
    mode: input.paymentMode,
  };

  if (input.paymentMode === "full" || input.paymentMode === "deposit") {
    const amountMinor = input.paymentMode === "deposit" ? depositMinor : totalMinor;
    const pi = await createBeautyPaymentIntent({
      appointmentId: appointment.id,
      amountMinor,
      currency,
      customerId: input.customerId,
      businessId: input.businessId,
      mode: input.paymentMode,
      idempotencyKey: input.idempotencyKey,
    });
    payment = { ...pi, mode: input.paymentMode };
  }

  await notify(biz.ownerId, {
    businessId: biz.id,
    appointmentId: appointment.id,
    type: "new_appointment",
    title: "New beauty appointment",
    body: `${service.name} — ${input.startsAt.toISOString()}`,
    href: `/beauty/center/${biz.id}/appointments`,
  });
  await notify(input.customerId, {
    businessId: biz.id,
    appointmentId: appointment.id,
    type: "appointment_placed",
    title: `Appointment #${appointment.id}`,
    body: input.paymentMode === "pay_at_location"
      ? "Your appointment is confirmed. Pay at the location."
      : "Complete payment to confirm your appointment.",
    href: "/beauty/my-appointments",
  });

  const [fresh] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, appointment.id)).limit(1);
  return { appointment: fresh ?? appointment, payment };
}

router.post("/beauty/appointments", requireBeautyAuthAccess, requireNotRestricted, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const businessId = Number(body.businessId);
  const serviceId = Number(body.serviceId);
  const startsAtRaw = String(body.startsAt || "");
  const startsAt = new Date(startsAtRaw);
  const paymentMode = String(body.paymentMode || "full") as "full" | "deposit" | "pay_at_location";
  if (!Number.isFinite(businessId) || !Number.isFinite(serviceId) || Number.isNaN(startsAt.getTime())) {
    res.status(400).json({ error: "businessId, serviceId, and startsAt are required" }); return;
  }
  if (!["full", "deposit", "pay_at_location"].includes(paymentMode)) {
    res.status(400).json({ error: "Invalid paymentMode" }); return;
  }
  const phone = body.customerPhone != null ? String(body.customerPhone).trim() : "";
  if (phone && !isValidBusinessPhone(phone)) {
    res.status(400).json({ error: "Invalid customer phone" }); return;
  }

  try {
    const result = await createAppointmentCore({
      customerId: req.userId!,
      businessId,
      serviceId,
      professionalId: body.professionalId != null ? Number(body.professionalId) : null,
      serviceLocation: String(body.serviceLocation || "at_business"),
      startsAt,
      customerName: body.customerName != null ? String(body.customerName).slice(0, 120) : null,
      customerPhone: phone ? normalizeDialablePhone(phone).slice(0, 40) : null,
      customerNotes: String(body.customerNotes || "").slice(0, 2000),
      customerAddress: body.customerAddress != null ? String(body.customerAddress).slice(0, 500) : null,
      customerAddressInstructions: body.customerAddressInstructions != null
        ? String(body.customerAddressInstructions).slice(0, 500)
        : null,
      customerLatitude: body.customerLatitude != null ? Number(body.customerLatitude) : null,
      customerLongitude: body.customerLongitude != null ? Number(body.customerLongitude) : null,
      estimatedTravelMinutes: body.estimatedTravelMinutes != null
        ? Math.max(0, Math.floor(Number(body.estimatedTravelMinutes)))
        : null,
      paymentMode,
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey).slice(0, 80) : null,
      actorId: req.userId!,
    });
    res.status(result.deduped ? 200 : 201).json({
      appointment: shapeAppointment(result.appointment, { includePrivateAddress: true }),
      payment: result.payment,
      deduped: result.deduped ?? false,
    });
  } catch (err: any) {
    const code = String(err?.message || err);
    const map: Record<string, [number, string]> = {
      BUSINESS_NOT_FOUND: [404, "Business not found"],
      BUSINESS_CLOSED: [409, "Business is not accepting appointments right now"],
      OWN_BUSINESS: [400, "Owners cannot book their own business"],
      SERVICE_NOT_FOUND: [404, "Service not found"],
      LOCATION_UNSUPPORTED: [400, "Service is not offered at that location"],
      ADDRESS_REQUIRED: [400, "Customer address is required for home service"],
      PRO_NOT_FOUND: [404, "Professional not found"],
      DEPOSIT_NOT_OFFERED: [400, "This service does not require a deposit"],
      SLOT_TAKEN: [409, "That time slot is no longer available"],
    };
    const hit = map[code];
    if (hit) { res.status(hit[0]).json({ error: hit[1] }); return; }
    throw err;
  }
});

router.get("/beauty/my-appointments", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const rows = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.customerId, req.userId!))
    .orderBy(desc(beautyAppointmentsTable.startsAt))
    .limit(100);
  res.json({
    appointments: rows.map((r) => shapeAppointment(r, { includePrivateAddress: true })),
  });
});

router.get("/beauty/appointments/:id", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, id)).limit(1);
  if (!appt) { res.status(404).json({ error: "Not found" }); return; }

  const access = await canAccessBeautyCenter(req.userId!, appt.businessId, req.user);
  const isCustomer = appt.customerId === req.userId;
  if (!isCustomer && !access.ok) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const includePrivate = isCustomer || access.ok;
  // Private customer address only for owner/assigned pro on confirmed+ appointments, or customer.
  let showAddress = isCustomer;
  if (!showAddress && access.ok) {
    const confirmedLike = ["confirmed", "checked_in", "in_progress", "completed"].includes(appt.status);
    if (confirmedLike) {
      if (access.business?.ownerId === req.userId || isStaff(req.user)) {
        showAddress = true;
      } else if (appt.professionalId != null) {
        const [pro] = await db.select().from(beautyProfessionalsTable).where(and(
          eq(beautyProfessionalsTable.id, appt.professionalId),
          eq(beautyProfessionalsTable.userId, req.userId!),
        )).limit(1);
        if (pro) showAddress = true;
      }
    }
  }

  res.json({
    appointment: shapeAppointment(appt, { includePrivateAddress: includePrivate && showAddress }),
  });
});

router.patch("/beauty/appointments/:id/status", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, id)).limit(1);
  if (!appt) { res.status(404).json({ error: "Not found" }); return; }

  const access = await canAccessBeautyCenter(req.userId!, appt.businessId, req.user);
  const isCustomer = appt.customerId === req.userId;
  if (!isCustomer && !access.ok) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const toStatus = String(req.body?.status || "").trim();
  if (!canTransitionBeautyAppointment(appt.status, toStatus)) {
    res.status(400).json({ error: `Cannot transition from ${appt.status} to ${toStatus}` }); return;
  }

  // Customer may only cancel; business may do other transitions.
  const customerAllowed = new Set(["cancelled_by_customer"]);
  if (isCustomer && !access.ok && !customerAllowed.has(toStatus)) {
    res.status(403).json({ error: "Customers can only cancel appointments via this endpoint" }); return;
  }
  if (toStatus === "cancelled_by_business" && !access.ok) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const patch: Partial<typeof beautyAppointmentsTable.$inferInsert> = {
    status: toStatus,
    updatedAt: new Date(),
  };
  if (toStatus.startsWith("cancelled")) {
    patch.cancelledAt = new Date();
    patch.cancellationReason = String(req.body?.reason || "").slice(0, 500);
  }
  if (toStatus === "completed") patch.completedAt = new Date();
  if (toStatus === "checked_in" || toStatus === "in_progress") {
    if (!appt.arrivedAt) patch.arrivedAt = new Date();
  }

  const [updated] = await db.update(beautyAppointmentsTable).set(patch)
    .where(eq(beautyAppointmentsTable.id, id)).returning();

  await appendAppointmentHistory({
    appointmentId: id,
    fromStatus: appt.status,
    toStatus,
    actorId: req.userId!,
    note: String(req.body?.note || req.body?.reason || ""),
  });

  const notifyUserId = isCustomer ? (access.business?.ownerId ?? appt.customerId) : appt.customerId;
  await notify(notifyUserId, {
    businessId: appt.businessId,
    appointmentId: id,
    type: "appointment_status",
    title: `Appointment #${id} → ${toStatus}`,
    body: String(req.body?.note || ""),
    href: isCustomer ? `/beauty/center/${appt.businessId}/appointments` : "/beauty/my-appointments",
  });

  res.json({ appointment: shapeAppointment(updated, { includePrivateAddress: access.ok || isCustomer }) });
});

router.post("/beauty/appointments/:id/reschedule", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, id)).limit(1);
  if (!appt) { res.status(404).json({ error: "Not found" }); return; }

  const access = await canAccessBeautyCenter(req.userId!, appt.businessId, req.user);
  const isCustomer = appt.customerId === req.userId;
  if (!isCustomer && !access.ok) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (!canTransitionBeautyAppointment(appt.status, "rescheduled")
    && !["confirmed", "pending_confirmation", "rescheduled"].includes(appt.status)) {
    res.status(400).json({ error: "Appointment cannot be rescheduled" }); return;
  }

  const startsAt = new Date(String(req.body?.startsAt || ""));
  if (Number.isNaN(startsAt.getTime())) {
    res.status(400).json({ error: "startsAt is required" }); return;
  }
  const professionalId = req.body?.professionalId != null
    ? Number(req.body.professionalId)
    : appt.professionalId;
  const totalBlock = appt.durationMinutesSnapshot
    + (appt.estimatedTravelMinutes || 0);
  // Use snapshotted duration; prep/cleanup already baked into original endsAt delta when possible.
  const durationMs = appt.endsAt.getTime() - appt.startsAt.getTime();
  const endsAt = new Date(startsAt.getTime() + (durationMs > 0 ? durationMs : totalBlock * 60_000));

  try {
    const updated = await db.transaction(async (tx) => {
      if (professionalId != null) {
        const blocking = [...BEAUTY_BLOCKING_APPOINTMENT_STATUSES];
        const conflicts = await tx.select({ id: beautyAppointmentsTable.id })
          .from(beautyAppointmentsTable).where(and(
            eq(beautyAppointmentsTable.businessId, appt.businessId),
            eq(beautyAppointmentsTable.professionalId, professionalId),
            inArray(beautyAppointmentsTable.status, blocking),
            sql`${beautyAppointmentsTable.id} <> ${id}`,
            sql`${beautyAppointmentsTable.startsAt} < ${endsAt}`,
            sql`${beautyAppointmentsTable.endsAt} > ${startsAt}`,
          )).limit(1);
        if (conflicts.length) throw new Error("SLOT_TAKEN");
      }

      const [row] = await tx.update(beautyAppointmentsTable).set({
        startsAt,
        endsAt,
        professionalId,
        status: "confirmed",
        updatedAt: new Date(),
      }).where(eq(beautyAppointmentsTable.id, id)).returning();
      return row;
    });

    await appendAppointmentHistory({
      appointmentId: id,
      fromStatus: appt.status,
      toStatus: "rescheduled",
      actorId: req.userId!,
      note: `Rescheduled to ${startsAt.toISOString()}`,
    });
    await appendAppointmentHistory({
      appointmentId: id,
      fromStatus: "rescheduled",
      toStatus: "confirmed",
      actorId: req.userId!,
      note: "Auto-confirmed after reschedule",
    });

    await notify(isCustomer ? (access.business?.ownerId ?? appt.customerId) : appt.customerId, {
      businessId: appt.businessId,
      appointmentId: id,
      type: "appointment_rescheduled",
      title: `Appointment #${id} rescheduled`,
      body: startsAt.toISOString(),
      href: "/beauty/my-appointments",
    });

    res.json({ appointment: shapeAppointment(updated, { includePrivateAddress: true }) });
  } catch (err: any) {
    if (String(err?.message) === "SLOT_TAKEN") {
      res.status(409).json({ error: "That time slot is no longer available" }); return;
    }
    throw err;
  }
});

router.post("/beauty/appointments/:id/cancel", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, id)).limit(1);
  if (!appt) { res.status(404).json({ error: "Not found" }); return; }

  const access = await canAccessBeautyCenter(req.userId!, appt.businessId, req.user);
  const isCustomer = appt.customerId === req.userId;
  if (!isCustomer && !access.ok) {
    res.status(403).json({ error: "Forbidden" }); return;
  }

  const toStatus = isCustomer && !access.ok ? "cancelled_by_customer" : (
    access.ok && !isCustomer ? "cancelled_by_business" : (
      String(req.body?.by || "") === "business" ? "cancelled_by_business" : "cancelled_by_customer"
    )
  );
  if (!canTransitionBeautyAppointment(appt.status, toStatus)) {
    res.status(400).json({ error: `Cannot cancel from status ${appt.status}` }); return;
  }

  const [updated] = await db.update(beautyAppointmentsTable).set({
    status: toStatus,
    cancelledAt: new Date(),
    cancellationReason: String(req.body?.reason || "").slice(0, 500),
    updatedAt: new Date(),
  }).where(eq(beautyAppointmentsTable.id, id)).returning();

  await appendAppointmentHistory({
    appointmentId: id,
    fromStatus: appt.status,
    toStatus,
    actorId: req.userId!,
    note: String(req.body?.reason || ""),
  });

  await notify(isCustomer ? (access.business?.ownerId ?? appt.customerId) : appt.customerId, {
    businessId: appt.businessId,
    appointmentId: id,
    type: "appointment_cancelled",
    title: `Appointment #${id} cancelled`,
    body: String(req.body?.reason || ""),
    href: "/beauty/my-appointments",
  });

  res.json({ appointment: shapeAppointment(updated, { includePrivateAddress: true }) });
});

router.post("/beauty/appointments/:id/pay", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, id)).limit(1);
  if (!appt) { res.status(404).json({ error: "Not found" }); return; }
  if (appt.customerId !== req.userId && !isStaff(req.user)) {
    res.status(403).json({ error: "Forbidden" }); return;
  }
  if (["paid", "refunded"].includes(appt.paymentStatus)) {
    res.status(400).json({ error: "Appointment is already paid" }); return;
  }

  let amountMinor = appt.totalMinor;
  let mode: "full" | "deposit" = "full";
  if (appt.paymentStatus === "deposit_paid") {
    amountMinor = Math.max(0, appt.totalMinor - appt.depositMinorSnapshot);
    mode = "full";
  } else if (String(req.body?.mode || "") === "deposit" && appt.depositMinorSnapshot > 0) {
    amountMinor = appt.depositMinorSnapshot;
    mode = "deposit";
  }

  if (amountMinor <= 0) {
    res.status(400).json({ error: "Nothing left to pay" }); return;
  }

  const payment = await createBeautyPaymentIntent({
    appointmentId: appt.id,
    amountMinor,
    currency: appt.currency,
    customerId: appt.customerId,
    businessId: appt.businessId,
    mode,
    idempotencyKey: req.body?.idempotencyKey
      ? String(req.body.idempotencyKey).slice(0, 80)
      : `pay-${appt.id}-${mode}-${amountMinor}`,
  });

  res.json({ payment: { ...payment, mode, amountMinor } });
});

/* ─── OWNER DASHBOARD ────────────────────────────────────────────────────── */

router.get("/beauty/center/:businessId/overview", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const access = await canAccessBeautyCenter(req.userId!, businessId, req.user);
  if (!access.ok || !access.business) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [todayCount] = await db.select({ c: sql<number>`count(*)::int` })
    .from(beautyAppointmentsTable).where(and(
      eq(beautyAppointmentsTable.businessId, businessId),
      gte(beautyAppointmentsTable.startsAt, startOfDay),
      inArray(beautyAppointmentsTable.status, [...BEAUTY_BLOCKING_APPOINTMENT_STATUSES, "completed"]),
    ));
  const [pendingCount] = await db.select({ c: sql<number>`count(*)::int` })
    .from(beautyAppointmentsTable).where(and(
      eq(beautyAppointmentsTable.businessId, businessId),
      eq(beautyAppointmentsTable.status, "pending_confirmation"),
    ));
  const [completedCount] = await db.select({ c: sql<number>`count(*)::int` })
    .from(beautyAppointmentsTable).where(and(
      eq(beautyAppointmentsTable.businessId, businessId),
      eq(beautyAppointmentsTable.status, "completed"),
    ));
  const [revenue] = await db.select({
    total: sql<number>`coalesce(sum(${beautyAppointmentsTable.totalMinor}), 0)::int`,
  }).from(beautyAppointmentsTable).where(and(
    eq(beautyAppointmentsTable.businessId, businessId),
    inArray(beautyAppointmentsTable.paymentStatus, ["paid", "deposit_paid"]),
  ));
  const [svcCount] = await db.select({ c: sql<number>`count(*)::int` })
    .from(beautyServicesTable).where(and(
      eq(beautyServicesTable.businessId, businessId),
      eq(beautyServicesTable.status, "active"),
    ));
  const [proCount] = await db.select({ c: sql<number>`count(*)::int` })
    .from(beautyProfessionalsTable).where(and(
      eq(beautyProfessionalsTable.businessId, businessId),
      eq(beautyProfessionalsTable.isActive, true),
    ));

  res.json({
    business: shapeOwnerBusiness(access.business),
    stats: {
      todayAppointments: todayCount?.c ?? 0,
      pendingConfirmation: pendingCount?.c ?? 0,
      completedAllTime: completedCount?.c ?? 0,
      revenueMinor: revenue?.total ?? 0,
      revenue: fromMinorUnits(revenue?.total ?? 0, access.business.currency),
      activeServices: svcCount?.c ?? 0,
      activeProfessionals: proCount?.c ?? 0,
      avgRating: access.business.avgRating,
      ratingCount: access.business.ratingCount,
      profileViews: access.business.profileViews,
    },
  });
});

router.get("/beauty/center/:businessId/appointments", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const access = await canAccessBeautyCenter(req.userId!, businessId, req.user);
  if (!access.ok) { res.status(404).json({ error: "Not found" }); return; }

  const status = String(req.query.status || "").trim();
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const conds = [eq(beautyAppointmentsTable.businessId, businessId)];
  if (status) conds.push(eq(beautyAppointmentsTable.status, status));
  if (req.query.professionalId) {
    conds.push(eq(beautyAppointmentsTable.professionalId, Number(req.query.professionalId)));
  }

  const rows = await db.select().from(beautyAppointmentsTable)
    .where(and(...conds))
    .orderBy(desc(beautyAppointmentsTable.startsAt))
    .limit(limit);

  res.json({
    appointments: rows.map((r) => shapeAppointment(r, { includePrivateAddress: true })),
  });
});

router.get("/beauty/center/:businessId/revenue", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const access = await canAccessBeautyCenter(req.userId!, businessId, req.user);
  if (!access.ok || !access.business) { res.status(404).json({ error: "Not found" }); return; }
  const business = access.business;

  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400_000);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();

  const rows = await db.select({
    day: sql<string>`to_char(${beautyAppointmentsTable.startsAt} AT TIME ZONE ${business.timezone}, 'YYYY-MM-DD')`,
    totalMinor: sql<number>`coalesce(sum(${beautyAppointmentsTable.totalMinor}), 0)::int`,
    count: sql<number>`count(*)::int`,
  }).from(beautyAppointmentsTable).where(and(
    eq(beautyAppointmentsTable.businessId, businessId),
    inArray(beautyAppointmentsTable.paymentStatus, ["paid", "deposit_paid", "pay_at_location"]),
    gte(beautyAppointmentsTable.startsAt, from),
    lte(beautyAppointmentsTable.startsAt, to),
  )).groupBy(sql`1`).orderBy(sql`1`);

  const grand = rows.reduce((s, r) => s + (r.totalMinor || 0), 0);
  res.json({
    currency: business.currency,
    from: from.toISOString(),
    to: to.toISOString(),
    totalMinor: grand,
    total: fromMinorUnits(grand, business.currency),
    series: rows.map((r) => ({
      day: r.day,
      totalMinor: r.totalMinor,
      total: fromMinorUnits(r.totalMinor, business.currency),
      count: r.count,
    })),
  });
});

router.get("/beauty/center/:businessId/calendar", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const access = await canAccessBeautyCenter(req.userId!, businessId, req.user);
  if (!access.ok) { res.status(404).json({ error: "Not found" }); return; }

  const from = new Date(String(req.query.from || ""));
  const to = new Date(String(req.query.to || ""));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    res.status(400).json({ error: "from and to are required ISO dates" }); return;
  }

  const conds = [
    eq(beautyAppointmentsTable.businessId, businessId),
    gte(beautyAppointmentsTable.startsAt, from),
    lte(beautyAppointmentsTable.startsAt, to),
  ];
  if (req.query.professionalId) {
    conds.push(eq(beautyAppointmentsTable.professionalId, Number(req.query.professionalId)));
  }

  const appointments = await db.select().from(beautyAppointmentsTable)
    .where(and(...conds))
    .orderBy(asc(beautyAppointmentsTable.startsAt));

  const excConds = [
    eq(beautyAvailabilityExceptionsTable.businessId, businessId),
    gte(beautyAvailabilityExceptionsTable.endAt, from),
    lte(beautyAvailabilityExceptionsTable.startAt, to),
  ];
  if (req.query.professionalId) {
    excConds.push(or(
      isNull(beautyAvailabilityExceptionsTable.professionalId),
      eq(beautyAvailabilityExceptionsTable.professionalId, Number(req.query.professionalId)),
    )!);
  }
  const blocks = await db.select().from(beautyAvailabilityExceptionsTable).where(and(...excConds));

  res.json({
    appointments: appointments.map((r) => shapeAppointment(r, { includePrivateAddress: true })),
    blocks,
  });
});

router.post("/beauty/center/:businessId/appointments/manual", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const access = await canAccessBeautyCenter(req.userId!, businessId, req.user);
  if (!access.ok) { res.status(404).json({ error: "Not found" }); return; }

  const body = req.body ?? {};
  const serviceId = Number(body.serviceId);
  const startsAt = new Date(String(body.startsAt || ""));
  if (!Number.isFinite(serviceId) || Number.isNaN(startsAt.getTime())) {
    res.status(400).json({ error: "serviceId and startsAt are required" }); return;
  }

  // Manual bookings may target an existing customer userId or create under owner as placeholder.
  const customerId = body.customerId != null ? Number(body.customerId) : req.userId!;
  const paymentMode = String(body.paymentMode || "pay_at_location") as "full" | "deposit" | "pay_at_location";

  try {
    const result = await createAppointmentCore({
      customerId,
      businessId,
      serviceId,
      professionalId: body.professionalId != null ? Number(body.professionalId) : null,
      serviceLocation: String(body.serviceLocation || "at_business"),
      startsAt,
      customerName: body.customerName != null ? String(body.customerName).slice(0, 120) : null,
      customerPhone: body.customerPhone != null ? String(body.customerPhone).slice(0, 40) : null,
      customerNotes: String(body.customerNotes || "").slice(0, 2000),
      customerAddress: body.customerAddress != null ? String(body.customerAddress).slice(0, 500) : null,
      customerAddressInstructions: body.customerAddressInstructions != null
        ? String(body.customerAddressInstructions).slice(0, 500)
        : null,
      customerLatitude: body.customerLatitude != null ? Number(body.customerLatitude) : null,
      customerLongitude: body.customerLongitude != null ? Number(body.customerLongitude) : null,
      estimatedTravelMinutes: body.estimatedTravelMinutes != null
        ? Math.max(0, Math.floor(Number(body.estimatedTravelMinutes)))
        : null,
      paymentMode,
      idempotencyKey: body.idempotencyKey ? String(body.idempotencyKey).slice(0, 80) : null,
      actorId: req.userId!,
      manual: true,
    });
    res.status(201).json({
      appointment: shapeAppointment(result.appointment, { includePrivateAddress: true }),
      payment: result.payment,
    });
  } catch (err: any) {
    const code = String(err?.message || err);
    const map: Record<string, [number, string]> = {
      BUSINESS_NOT_FOUND: [404, "Business not found"],
      SERVICE_NOT_FOUND: [404, "Service not found"],
      LOCATION_UNSUPPORTED: [400, "Service is not offered at that location"],
      PRO_NOT_FOUND: [404, "Professional not found"],
      SLOT_TAKEN: [409, "That time slot is no longer available"],
      DEPOSIT_NOT_OFFERED: [400, "This service does not require a deposit"],
    };
    const hit = map[code];
    if (hit) { res.status(hit[0]).json({ error: hit[1] }); return; }
    throw err;
  }
});

router.post("/beauty/center/:businessId/blocks", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const access = await canAccessBeautyCenter(req.userId!, businessId, req.user);
  if (!access.ok) { res.status(404).json({ error: "Not found" }); return; }

  const body = req.body ?? {};
  const startAt = new Date(String(body.startAt || ""));
  const endAt = new Date(String(body.endAt || ""));
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
    res.status(400).json({ error: "Valid startAt and endAt are required" }); return;
  }

  const [created] = await db.insert(beautyAvailabilityExceptionsTable).values({
    businessId,
    professionalId: body.professionalId != null ? Number(body.professionalId) : null,
    exceptionType: String(body.exceptionType || "block"),
    startAt,
    endAt,
    note: String(body.note || "").slice(0, 500),
    createdBy: req.userId!,
  }).returning();

  res.status(201).json({ block: created });
});

/* ─── FAVORITES / RECENT ─────────────────────────────────────────────────── */

router.post("/beauty/favorites/businesses/:id", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [biz] = await db.select().from(beautyBusinessesTable).where(eq(beautyBusinessesTable.id, id)).limit(1);
  if (!biz || !BEAUTY_PUBLIC_LISTING_STATUSES.has(biz.status)) {
    res.status(404).json({ error: "Business not found" }); return;
  }
  try {
    await db.insert(beautyFavoritesTable).values({
      userId: req.userId!,
      businessId: id,
    });
  } catch {
    // unique — already favorited
  }
  res.status(201).json({ ok: true });
});

router.delete("/beauty/favorites/businesses/:id", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(beautyFavoritesTable).where(and(
    eq(beautyFavoritesTable.userId, req.userId!),
    eq(beautyFavoritesTable.businessId, id),
  ));
  res.json({ ok: true });
});

router.get("/beauty/favorites", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const favs = await db.select().from(beautyFavoritesTable)
    .where(eq(beautyFavoritesTable.userId, req.userId!))
    .orderBy(desc(beautyFavoritesTable.createdAt))
    .limit(100);
  const bizIds = favs.map((f) => f.businessId).filter((x): x is number => x != null);
  let businesses: Array<ReturnType<typeof shapePublicBusiness>> = [];
  if (bizIds.length) {
    const rows = await db.select().from(beautyBusinessesTable)
      .where(inArray(beautyBusinessesTable.id, bizIds));
    businesses = rows.map((r) => shapePublicBusiness(r));
  }
  res.json({ favorites: favs, businesses });
});

router.post("/beauty/recently-viewed/:businessId", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const businessId = Number(req.params.businessId);
  const [biz] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, businessId)).limit(1);
  if (!biz) { res.status(404).json({ error: "Business not found" }); return; }

  await db.execute(sql`
    INSERT INTO beauty_recently_viewed (user_id, business_id, viewed_at)
    VALUES (${req.userId!}, ${businessId}, NOW())
    ON CONFLICT (user_id, business_id)
    DO UPDATE SET viewed_at = NOW()
  `);
  res.json({ ok: true });
});

router.get("/beauty/recently-viewed", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const rows = await db.select().from(beautyRecentlyViewedTable)
    .where(eq(beautyRecentlyViewedTable.userId, req.userId!))
    .orderBy(desc(beautyRecentlyViewedTable.viewedAt))
    .limit(30);
  const bizIds = rows.map((r) => r.businessId);
  let businesses: Array<ReturnType<typeof shapePublicBusiness>> = [];
  if (bizIds.length) {
    const bizRows = await db.select().from(beautyBusinessesTable)
      .where(inArray(beautyBusinessesTable.id, bizIds));
    const map = new Map(bizRows.map((b) => [b.id, b]));
    businesses = bizIds
      .map((id) => map.get(id))
      .filter(Boolean)
      .map((b) => shapePublicBusiness(b!));
  }
  res.json({ recentlyViewed: businesses });
});

/* ─── REVIEWS ────────────────────────────────────────────────────────────── */

router.post("/beauty/appointments/:id/review", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [appt] = await db.select().from(beautyAppointmentsTable)
    .where(eq(beautyAppointmentsTable.id, id)).limit(1);
  if (!appt) { res.status(404).json({ error: "Not found" }); return; }
  if (appt.customerId !== req.userId) {
    res.status(403).json({ error: "Only the customer can review this appointment" }); return;
  }
  if (appt.status !== "completed") {
    res.status(400).json({ error: "Only completed appointments can be reviewed" }); return;
  }

  const [existing] = await db.select().from(beautyReviewsTable)
    .where(eq(beautyReviewsTable.appointmentId, id)).limit(1);
  if (existing) {
    res.status(409).json({ error: "This appointment already has a review" }); return;
  }

  const body = req.body ?? {};
  const overallRating = Math.min(5, Math.max(1, Math.floor(Number(body.overallRating) || 0)));
  if (!overallRating) {
    res.status(400).json({ error: "overallRating (1-5) is required" }); return;
  }

  const [created] = await db.insert(beautyReviewsTable).values({
    appointmentId: id,
    businessId: appt.businessId,
    professionalId: appt.professionalId,
    customerId: req.userId!,
    overallRating,
    serviceQuality: body.serviceQuality != null ? Math.min(5, Math.max(1, Number(body.serviceQuality))) : null,
    professionalism: body.professionalism != null ? Math.min(5, Math.max(1, Number(body.professionalism))) : null,
    punctuality: body.punctuality != null ? Math.min(5, Math.max(1, Number(body.punctuality))) : null,
    cleanliness: body.cleanliness != null ? Math.min(5, Math.max(1, Number(body.cleanliness))) : null,
    comment: String(body.comment || "").slice(0, 4000),
    photos: Array.isArray(body.photos) ? body.photos.map(String).slice(0, 6) : [],
    status: "published",
  }).returning();

  // Recompute business avg
  const [agg] = await db.select({
    avg: sql<number>`coalesce(avg(${beautyReviewsTable.overallRating}), 0)::float`,
    count: sql<number>`count(*)::int`,
  }).from(beautyReviewsTable).where(and(
    eq(beautyReviewsTable.businessId, appt.businessId),
    eq(beautyReviewsTable.status, "published"),
  ));
  await db.update(beautyBusinessesTable).set({
    avgRating: Number(agg?.avg || 0),
    ratingCount: agg?.count || 0,
    updatedAt: new Date(),
  }).where(eq(beautyBusinessesTable.id, appt.businessId));

  if (appt.professionalId != null) {
    const [proAgg] = await db.select({
      avg: sql<number>`coalesce(avg(${beautyReviewsTable.overallRating}), 0)::float`,
      count: sql<number>`count(*)::int`,
    }).from(beautyReviewsTable).where(and(
      eq(beautyReviewsTable.professionalId, appt.professionalId),
      eq(beautyReviewsTable.status, "published"),
    ));
    await db.update(beautyProfessionalsTable).set({
      avgRating: Number(proAgg?.avg || 0),
      ratingCount: proAgg?.count || 0,
      updatedAt: new Date(),
    }).where(eq(beautyProfessionalsTable.id, appt.professionalId));
  }

  const [biz] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, appt.businessId)).limit(1);
  if (biz) {
    await notify(biz.ownerId, {
      businessId: biz.id,
      appointmentId: id,
      type: "new_review",
      title: "New review received",
      body: `${overallRating}/5 — ${String(body.comment || "").slice(0, 120)}`,
      href: `/beauty/center/${biz.id}`,
    });
  }

  res.status(201).json({ review: created });
});

router.post("/beauty/reviews/:id/reply", requireBeautyAuthAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [review] = await db.select().from(beautyReviewsTable)
    .where(eq(beautyReviewsTable.id, id)).limit(1);
  if (!review) { res.status(404).json({ error: "Not found" }); return; }
  const business = await loadOwnerBusiness(req.userId!, review.businessId);
  if (!business && !isStaff(req.user)) {
    res.status(403).json({ error: "Only the business owner can reply" }); return;
  }
  const reply = String(req.body?.reply || req.body?.ownerReply || "").trim().slice(0, 2000);
  if (!reply) { res.status(400).json({ error: "reply is required" }); return; }

  const [updated] = await db.update(beautyReviewsTable).set({
    ownerReply: reply,
    ownerRepliedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(beautyReviewsTable.id, id)).returning();

  await notify(review.customerId, {
    businessId: review.businessId,
    type: "review_reply",
    title: "Business replied to your review",
    body: reply.slice(0, 160),
    href: `/beauty/businesses/${review.businessId}`,
  });

  res.json({ review: updated });
});

/* ─── MESSAGING ──────────────────────────────────────────────────────────── */

router.post("/beauty/conversations", requireBeautyAuthAccess, requireNotRestricted, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const businessId = Number(body.businessId);
  if (!Number.isFinite(businessId)) {
    res.status(400).json({ error: "businessId is required" }); return;
  }
  const [business] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, businessId)).limit(1);
  if (!business) { res.status(404).json({ error: "Business not found" }); return; }
  const isOwner = req.userId === business.ownerId;
  if (!BEAUTY_PUBLIC_LISTING_STATUSES.has(business.status) && !isOwner && !isStaff(req.user)) {
    res.status(404).json({ error: "Business not found" }); return;
  }
  if (Number(req.userId) === Number(business.ownerId)) {
    res.status(400).json({ error: "Cannot message your own business" }); return;
  }

  const sellerId = business.ownerId;
  const appointmentId = body.appointmentId != null ? Number(body.appointmentId) : null;

  const [existing] = await db.select().from(conversationsTable).where(and(
    eq(conversationsTable.beautyBusinessId, businessId),
    eq(conversationsTable.buyerId, req.userId!),
    eq(conversationsTable.sellerId, sellerId),
    eq(conversationsTable.conversationType, "beauty"),
  )).limit(1);

  const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, sellerId)).limit(1);
  const preview = {
    listingTitle: business.name,
    listingImage: business.logoUrl || business.coverUrl || null,
    listingPrice: 0,
    listingIsVideoOnly: false,
    beautyBusinessId: business.id,
    conversationType: "beauty" as const,
  };

  if (existing) {
    res.json({
      id: existing.id,
      listingId: null,
      restaurantId: null,
      appointmentId,
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
    restaurantId: null,
    beautyBusinessId: businessId,
    buyerId: req.userId!,
    sellerId,
    conversationType: "beauty",
  }).returning();

  res.status(201).json({
    id: conv.id,
    listingId: null,
    restaurantId: null,
    appointmentId,
    ...preview,
    otherUserId: sellerId,
    otherUserName: publicDisplayName(otherUser?.name, ""),
    otherUserAvatar: otherUser?.avatar ?? null,
    lastMessage: null,
    lastMessageAt: null,
    unreadCount: 0,
  });
});

/* ─── REPORTS ────────────────────────────────────────────────────────────── */

router.post("/beauty/reports", requireBeautyAuthAccess, requireNotRestricted, async (req, res): Promise<void> => {
  const body = req.body ?? {};
  const reason = String(body.reason || "").trim().slice(0, 200);
  if (!reason) { res.status(400).json({ error: "reason is required" }); return; }

  const [created] = await db.insert(beautyReportsTable).values({
    reporterId: req.userId!,
    businessId: body.businessId != null ? Number(body.businessId) : null,
    professionalId: body.professionalId != null ? Number(body.professionalId) : null,
    reviewId: body.reviewId != null ? Number(body.reviewId) : null,
    portfolioItemId: body.portfolioItemId != null ? Number(body.portfolioItemId) : null,
    appointmentId: body.appointmentId != null ? Number(body.appointmentId) : null,
    reason,
    details: String(body.details || "").slice(0, 4000),
    status: "open",
  }).returning();

  res.status(201).json({ report: created });
});

/* ─── ADMIN ──────────────────────────────────────────────────────────────── */

router.get("/beauty/admin/overview", requireAuth, requireSuperAdmin, async (_req, res) => {
  const [bizCounts] = await db.select({
    total: sql<number>`count(*)::int`,
    approved: sql<number>`count(*) FILTER (WHERE status = 'approved')::int`,
    submitted: sql<number>`count(*) FILTER (WHERE status IN ('submitted', 'under_review'))::int`,
    suspended: sql<number>`count(*) FILTER (WHERE status = 'suspended')::int`,
  }).from(beautyBusinessesTable);

  const [apptCounts] = await db.select({
    total: sql<number>`count(*)::int`,
    completed: sql<number>`count(*) FILTER (WHERE status = 'completed')::int`,
    pending: sql<number>`count(*) FILTER (WHERE status = 'pending_confirmation')::int`,
  }).from(beautyAppointmentsTable);

  const [reportCounts] = await db.select({
    open: sql<number>`count(*) FILTER (WHERE status = 'open')::int`,
  }).from(beautyReportsTable);

  res.json({
    businesses: bizCounts,
    appointments: apptCounts,
    openReports: reportCounts?.open ?? 0,
    publicLaunch: BEAUTY_PUBLIC_LAUNCH,
  });
});

router.get("/beauty/admin/businesses", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const status = String(req.query.status || "").trim();
  const conds = status
    ? [eq(beautyBusinessesTable.status, status)]
    : [];
  const rows = await db.select().from(beautyBusinessesTable)
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(beautyBusinessesTable.updatedAt))
    .limit(200);
  res.json({ businesses: rows.map(shapeOwnerBusiness) });
});

router.post("/beauty/admin/businesses/:id/decide", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [biz] = await db.select().from(beautyBusinessesTable)
    .where(eq(beautyBusinessesTable.id, id)).limit(1);
  if (!biz) { res.status(404).json({ error: "Not found" }); return; }

  const decision = String(req.body?.decision || req.body?.action || "").trim().toLowerCase();
  const notes = String(req.body?.notes || req.body?.reason || "").slice(0, 2000);
  const patch: Partial<typeof beautyBusinessesTable.$inferInsert> = {
    updatedAt: new Date(),
    adminNotes: notes || biz.adminNotes,
  };

  switch (decision) {
    case "approve":
      patch.status = "approved";
      patch.publishedAt = new Date();
      patch.suspendedAt = null;
      patch.suspensionReason = null;
      break;
    case "reject":
      patch.status = "rejected";
      break;
    case "additional_info":
      patch.status = "additional_info_required";
      break;
    case "suspend":
      patch.status = "suspended";
      patch.suspendedAt = new Date();
      patch.suspensionReason = notes || "Suspended by admin";
      break;
    case "reactivate":
      patch.status = "approved";
      patch.publishedAt = biz.publishedAt ?? new Date();
      patch.suspendedAt = null;
      patch.suspensionReason = null;
      break;
    case "under_review":
      patch.status = "under_review";
      break;
    default:
      res.status(400).json({
        error: "Invalid decision",
        allowed: ["approve", "reject", "additional_info", "suspend", "reactivate", "under_review"],
      });
      return;
  }

  const [updated] = await db.update(beautyBusinessesTable).set(patch)
    .where(eq(beautyBusinessesTable.id, id)).returning();

  await writeAudit({
    actorId: req.userId!,
    businessId: id,
    action: `admin_${decision}`,
    entityType: "business",
    entityId: id,
    meta: { notes },
  });

  await notify(biz.ownerId, {
    businessId: id,
    type: "admin_decision",
    title: `Séduire Beauty application: ${decision}`,
    body: notes || `Your business status is now ${patch.status}`,
    href: "/beauty/my-businesses",
  });

  res.json({ business: shapeOwnerBusiness(updated) });
});

router.get("/beauty/admin/categories", requireAuth, requireSuperAdmin, async (_req, res) => {
  await ensureDefaultCategories();
  const rows = await db.select().from(beautyCategoriesTable)
    .orderBy(asc(beautyCategoriesTable.sortOrder), asc(beautyCategoriesTable.id));
  res.json({ categories: rows });
});

router.put("/beauty/admin/categories", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const items = Array.isArray(req.body?.categories) ? req.body.categories : [];
  if (!items.length) { res.status(400).json({ error: "categories array required" }); return; }

  const saved = [];
  for (const item of items.slice(0, 200)) {
    const id = item.id != null ? Number(item.id) : null;
    const payload = {
      kind: String(item.kind || "service"),
      slug: String(item.slug || slugify(item.nameEn || "category")),
      nameEn: String(item.nameEn || "").slice(0, 120),
      nameFr: item.nameFr != null ? String(item.nameFr) : null,
      nameHt: item.nameHt != null ? String(item.nameHt) : null,
      nameEs: item.nameEs != null ? String(item.nameEs) : null,
      descriptionEn: String(item.descriptionEn || ""),
      imageUrl: item.imageUrl != null ? String(item.imageUrl) : null,
      parentId: item.parentId != null ? Number(item.parentId) : null,
      sortOrder: Math.floor(Number(item.sortOrder) || 0),
      isActive: item.isActive !== false,
      updatedAt: new Date(),
    };
    if (!payload.nameEn) continue;
    if (id) {
      const [row] = await db.update(beautyCategoriesTable).set(payload)
        .where(eq(beautyCategoriesTable.id, id)).returning();
      if (row) saved.push(row);
    } else {
      const [row] = await db.insert(beautyCategoriesTable).values(payload).returning();
      saved.push(row);
    }
  }
  res.json({ categories: saved });
});

router.get("/beauty/admin/countries", requireAuth, requireSuperAdmin, async (_req, res) => {
  const rows = await db.select().from(beautyCountryAvailabilityTable)
    .orderBy(asc(beautyCountryAvailabilityTable.countryCode));
  res.json({ countries: rows });
});

router.put("/beauty/admin/countries", requireAuth, requireSuperAdmin, async (req, res): Promise<void> => {
  const items = Array.isArray(req.body?.countries) ? req.body.countries : (
    req.body?.countryCode ? [req.body] : []
  );
  if (!items.length) { res.status(400).json({ error: "countries array or countryCode required" }); return; }

  const saved = [];
  for (const item of items.slice(0, 100)) {
    const countryCode = String(item.countryCode || "").trim().toUpperCase();
    if (!countryCode) continue;
    const [existing] = await db.select().from(beautyCountryAvailabilityTable)
      .where(eq(beautyCountryAvailabilityTable.countryCode, countryCode)).limit(1);
    const payload = {
      enabled: typeof item.enabled === "boolean" ? item.enabled : (existing?.enabled ?? false),
      status: String(item.status || existing?.status || "under_review"),
      notes: item.notes != null ? String(item.notes) : (existing?.notes ?? ""),
      updatedBy: req.userId!,
      updatedAt: new Date(),
    };
    if (existing) {
      const [row] = await db.update(beautyCountryAvailabilityTable).set(payload)
        .where(eq(beautyCountryAvailabilityTable.id, existing.id)).returning();
      saved.push(row);
    } else {
      const [row] = await db.insert(beautyCountryAvailabilityTable).values({
        countryCode,
        ...payload,
      }).returning();
      saved.push(row);
    }
  }
  res.json({ countries: saved });
});

router.get("/beauty/admin/reports", requireAuth, requireSuperAdmin, async (req, res) => {
  const status = String(req.query.status || "").trim();
  const conds = status ? [eq(beautyReportsTable.status, status)] : [];
  const rows = await db.select().from(beautyReportsTable)
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(beautyReportsTable.createdAt))
    .limit(200);
  res.json({ reports: rows });
});

router.get("/beauty/admin/audit", requireAuth, requireSuperAdmin, async (req, res) => {
  const businessId = req.query.businessId != null ? Number(req.query.businessId) : null;
  const conds = businessId != null && Number.isFinite(businessId)
    ? [eq(beautyAuditLogsTable.businessId, businessId)]
    : [];
  const rows = await db.select().from(beautyAuditLogsTable)
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(beautyAuditLogsTable.createdAt))
    .limit(200);
  res.json({ logs: rows });
});

export default router;
