import { Router } from "express";
import { db, driverApplicationsTable, driversTable, deliveriesTable, usersTable, notificationsTable, promoWalletTable, walletTransactionsTable, transactionsTable, listingsTable } from "@workspace/db";
import { eq, and, desc, or, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { releaseEscrow } from "./transactions";
import { emitDriverLocation, emitAdminDriverUpdate, emitDeliveryStatus } from "../lib/socketServer";

import { requireAuth, requireAdmin } from "../middlewares/auth";
import { logAdminAction } from "../lib/auditLogger";
import { sendSms } from "../lib/twilio";
import { calculateDeliveryPrice, getAvailableCities, haversineKm, lookupCity, getOsrmDistanceKm, DRIVER_COMMISSION_PCT, PLATFORM_COMMISSION_PCT } from "../lib/deliveryPricing";
import { getExchangeRate } from "../lib/exchange-rate";

const router = Router();

const DELIVERY_COUNTRIES = ["Haiti", "Dominican Republic"];

// ── Admin scope helpers (mirrors admin.ts pattern) ─────────────────────────
function parseAdminCountries(admin: any): string[] {
  if (!admin?.adminScopeCountries) return [];
  try { return JSON.parse(admin.adminScopeCountries) as string[]; } catch { return []; }
}

/** Returns WHERE conditions scoping to this admin's allowed countries/cities */
function driverAppScopeConditions(admin: any) {
  if (admin?.isSuperAdmin) return [];
  const conds: any[] = [];
  const countries = parseAdminCountries(admin);
  if (countries.length > 1) {
    conds.push(inArray(driverApplicationsTable.country, countries));
  } else if (countries.length === 1) {
    conds.push(eq(driverApplicationsTable.country, countries[0]));
  } else if (admin?.adminScopeCountry) {
    conds.push(eq(driverApplicationsTable.country, admin.adminScopeCountry));
  }
  return conds;
}

/** Returns error string if admin is not allowed to act on this app, or null if OK */
function assertDriverAppInScope(admin: any, appCountry: string | null): string | null {
  if (admin?.isSuperAdmin) return null;
  if (!appCountry) return null;
  const countries = parseAdminCountries(admin);
  if (countries.length > 0) {
    if (!countries.includes(appCountry)) {
      return `Aksè refize: chofe sa a nan "${appCountry}" — pa nan zòn ou (${countries.join(", ")})`;
    }
    return null;
  }
  if (admin?.adminScopeCountry && admin.adminScopeCountry !== appCountry) {
    return `Aksè refize: chofe sa a nan "${appCountry}" — pa nan zòn ou (${admin.adminScopeCountry})`;
  }
  return null;
}

function genCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ── Driver Applications ────────────────────────────────────────────────────────

// GET /api/delivery/application — get my application status (legacy path)
router.get("/delivery/application", requireAuth, async (req, res): Promise<void> => {
  const [app] = await db
    .select()
    .from(driverApplicationsTable)
    .where(eq(driverApplicationsTable.userId, req.userId!))
    .orderBy(desc(driverApplicationsTable.createdAt))
    .limit(1);

  const [driver] = await db
    .select()
    .from(driversTable)
    .where(eq(driversTable.userId, req.userId!))
    .limit(1);

  res.json({ application: app ?? null, driver: driver ?? null });
});

// GET /api/driver/my-application — get the driver's latest application with full status details
router.get("/driver/my-application", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [app] = await db
    .select({
      id: driverApplicationsTable.id,
      status: driverApplicationsTable.status,
      firstName: driverApplicationsTable.firstName,
      lastName: driverApplicationsTable.lastName,
      city: driverApplicationsTable.city,
      country: driverApplicationsTable.country,
      vehicleType: driverApplicationsTable.vehicleType,
      adminNote: driverApplicationsTable.adminNote,
      submittedAt: driverApplicationsTable.createdAt,
      reviewedAt: driverApplicationsTable.reviewedAt,
      updatedAt: driverApplicationsTable.updatedAt,
    })
    .from(driverApplicationsTable)
    .where(eq(driverApplicationsTable.userId, userId))
    .orderBy(desc(driverApplicationsTable.createdAt))
    .limit(1);

  const [driver] = await db
    .select({
      id: driversTable.id,
      status: driversTable.status,
      rating: driversTable.rating,
      deliveryCount: driversTable.deliveryCount,
      earningsTotal: driversTable.earningsTotal,
    })
    .from(driversTable)
    .where(eq(driversTable.userId, userId))
    .limit(1);

  res.json({
    application: app
      ? {
          id: app.id,
          status: app.status,
          firstName: app.firstName,
          lastName: app.lastName,
          city: app.city ?? null,
          country: app.country ?? null,
          vehicleType: app.vehicleType ?? null,
          adminNote: app.adminNote ?? null,
          rejectionReason: app.adminNote ?? null,
          submittedAt: app.submittedAt,
          reviewedAt: app.reviewedAt ?? null,
          updatedAt: app.updatedAt,
        }
      : null,
    driver: driver
      ? {
          id: driver.id,
          status: driver.status,
          rating: driver.rating,
          deliveryCount: driver.deliveryCount,
          earningsTotal: driver.earningsTotal,
        }
      : null,
  });
});

// POST /api/delivery/apply — submit driver application
router.post("/delivery/apply", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const country = req.user?.country ?? null;

  if (!country) {
    res.status(400).json({ error: "Country not set on your account" });
    return;
  }

  const existing = await db
    .select({ id: driverApplicationsTable.id, status: driverApplicationsTable.status })
    .from(driverApplicationsTable)
    .where(eq(driverApplicationsTable.userId, userId))
    .limit(1);

  if (existing.length > 0 && ["pending", "approved"].includes(existing[0].status)) {
    res.status(409).json({ error: "Application already submitted", status: existing[0].status });
    return;
  }

  const {
    firstName, lastName, dateOfBirth, address, city,
    whatsappNumber, callPhone,
    hasSmartphone, hasStableInternet, hasFastPhone,
    phoneBrand, phoneModel, phoneOs, internetProvider,
    vehicleType, vehicleBrand, vehicleModel, vehicleYear, vehicleColor,
    licensePlateNumber, licenseNumber, licenseExpiry,
    // Legacy photo fields (kept for backwards compat)
    photoFront, photoSide, photoBody, photoIdSelfie,
    // New dedicated document photo fields
    photoVehicleRegistration, photoVehicleInsurance,
    photoLicenseFront, photoLicenseBack,
    photoVehicleFront, photoVehicleSide, photoLicensePlate, photoVehicleBack,
    facePhotoFront, facePhotoLeft, facePhotoRight, facePhotoHoldingId,
    // New fields (redesigned form)
    insuranceNumber, selfiePhotoUrl,
    bankName, bankAccountName, bankAccountNumber, preferredPaymentMethod,
    workZones, workHours, maxDeliveryKm,
  } = req.body;

  if (!firstName || !lastName || !city || !whatsappNumber || !callPhone) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const [app] = await db
    .insert(driverApplicationsTable)
    .values({
      userId,
      status: "pending",
      firstName: String(firstName).trim().slice(0, 80),
      lastName: String(lastName).trim().slice(0, 80),
      dateOfBirth: String(dateOfBirth).trim(),
      address: String(address).trim().slice(0, 200),
      city: String(city).trim().slice(0, 100),
      country: country,
      whatsappNumber: String(whatsappNumber).trim().slice(0, 30),
      callPhone: String(callPhone).trim().slice(0, 30),
      hasSmartphone: Boolean(hasSmartphone),
      hasStableInternet: Boolean(hasStableInternet),
      hasFastPhone: Boolean(hasFastPhone),
      phoneBrand: phoneBrand ? String(phoneBrand).trim().slice(0, 60) : null,
      phoneModel: phoneModel ? String(phoneModel).trim().slice(0, 60) : null,
      phoneOs: phoneOs ? String(phoneOs).trim() : null,
      internetProvider: internetProvider ? String(internetProvider).trim().slice(0, 80) : null,
      vehicleType: vehicleType ? String(vehicleType) : null,
      vehicleBrand: vehicleBrand ? String(vehicleBrand).trim().slice(0, 80) : null,
      vehicleModel: vehicleModel ? String(vehicleModel).trim().slice(0, 80) : null,
      vehicleYear: vehicleYear ? String(vehicleYear).trim() : null,
      vehicleColor: vehicleColor ? String(vehicleColor).trim().slice(0, 40) : null,
      licensePlateNumber: licensePlateNumber ? String(licensePlateNumber).trim().toUpperCase().slice(0, 20) : null,
      licenseNumber: licenseNumber ? String(licenseNumber).trim().slice(0, 60) : null,
      licenseExpiry: licenseExpiry ? String(licenseExpiry).trim() : null,
      // Legacy fields (backward compat)
      photoFront: (photoFront ?? photoVehicleFront) ? String(photoFront ?? photoVehicleFront) : null,
      photoSide: (photoSide ?? photoVehicleSide) ? String(photoSide ?? photoVehicleSide) : null,
      photoBody: photoBody ? String(photoBody) : null,
      photoIdSelfie: photoIdSelfie ? String(photoIdSelfie) : null,
      // New document photo fields
      photoVehicleRegistration: photoVehicleRegistration ? String(photoVehicleRegistration) : null,
      photoVehicleInsurance: photoVehicleInsurance ? String(photoVehicleInsurance) : null,
      photoLicenseFront: photoLicenseFront ? String(photoLicenseFront) : null,
      photoLicenseBack: photoLicenseBack ? String(photoLicenseBack) : null,
      photoVehicleFront: photoVehicleFront ? String(photoVehicleFront) : null,
      photoVehicleSide: photoVehicleSide ? String(photoVehicleSide) : null,
      photoLicensePlate: photoLicensePlate ? String(photoLicensePlate) : null,
      facePhotoFront: facePhotoFront ? String(facePhotoFront) : null,
      facePhotoLeft: facePhotoLeft ? String(facePhotoLeft) : null,
      facePhotoRight: facePhotoRight ? String(facePhotoRight) : null,
      facePhotoHoldingId: facePhotoHoldingId ? String(facePhotoHoldingId) : null,
      // New fields from redesigned form
      photoVehicleBack: photoVehicleBack ? String(photoVehicleBack) : null,
      insuranceNumber: insuranceNumber ? String(insuranceNumber).trim().slice(0, 80) : null,
      selfiePhotoUrl: selfiePhotoUrl ? String(selfiePhotoUrl) : null,
      bankName: bankName ? String(bankName).trim().slice(0, 120) : null,
      bankAccountName: bankAccountName ? String(bankAccountName).trim().slice(0, 120) : null,
      bankAccountNumber: bankAccountNumber ? String(bankAccountNumber).trim().slice(0, 60) : null,
      preferredPaymentMethod: preferredPaymentMethod ? String(preferredPaymentMethod) : null,
      workZones: workZones ? JSON.stringify(workZones) : null,
      workHours: workHours ? JSON.stringify(workHours) : null,
      maxDeliveryKm: maxDeliveryKm ? Number(maxDeliveryKm) : null,
    })
    .returning();

  const appId = `DRV-${String(app.id).padStart(10, "0")}`;
  res.status(201).json({ application: app, applicationId: appId });
});

// ── Admin: Driver Application Management ──────────────────────────────────────

// GET /api/admin/delivery/applications
router.get("/admin/delivery/applications", requireAdmin, async (req, res): Promise<void> => {
  const { status } = req.query;
  const admin = req.user as any;
  const scopeConds = driverAppScopeConditions(admin);

  const conditions: any[] = [];
  if (status) conditions.push(eq(driverApplicationsTable.status, String(status)));
  conditions.push(...scopeConds);

  const apps = await db
    .select({
      id: driverApplicationsTable.id,
      userId: driverApplicationsTable.userId,
      status: driverApplicationsTable.status,
      firstName: driverApplicationsTable.firstName,
      lastName: driverApplicationsTable.lastName,
      city: driverApplicationsTable.city,
      country: driverApplicationsTable.country,
      vehicleType: driverApplicationsTable.vehicleType,
      whatsappNumber: driverApplicationsTable.whatsappNumber,
      callPhone: driverApplicationsTable.callPhone,
      phoneBrand: driverApplicationsTable.phoneBrand,
      phoneModel: driverApplicationsTable.phoneModel,
      phoneOs: driverApplicationsTable.phoneOs,
      hasSmartphone: driverApplicationsTable.hasSmartphone,
      hasStableInternet: driverApplicationsTable.hasStableInternet,
      hasFastPhone: driverApplicationsTable.hasFastPhone,
      photoFront: driverApplicationsTable.photoFront,
      photoSide: driverApplicationsTable.photoSide,
      photoBody: driverApplicationsTable.photoBody,
      photoIdSelfie: driverApplicationsTable.photoIdSelfie,
      photoVehicleRegistration: driverApplicationsTable.photoVehicleRegistration,
      photoVehicleInsurance: driverApplicationsTable.photoVehicleInsurance,
      photoLicenseFront: driverApplicationsTable.photoLicenseFront,
      photoLicenseBack: driverApplicationsTable.photoLicenseBack,
      photoVehicleFront: driverApplicationsTable.photoVehicleFront,
      photoVehicleSide: driverApplicationsTable.photoVehicleSide,
      photoLicensePlate: driverApplicationsTable.photoLicensePlate,
      facePhotoFront: driverApplicationsTable.facePhotoFront,
      facePhotoLeft: driverApplicationsTable.facePhotoLeft,
      facePhotoRight: driverApplicationsTable.facePhotoRight,
      facePhotoHoldingId: driverApplicationsTable.facePhotoHoldingId,
      adminNote: driverApplicationsTable.adminNote,
      dateOfBirth: driverApplicationsTable.dateOfBirth,
      address: driverApplicationsTable.address,
      internetProvider: driverApplicationsTable.internetProvider,
      vehicleBrand: driverApplicationsTable.vehicleBrand,
      vehicleModel: driverApplicationsTable.vehicleModel,
      vehicleYear: driverApplicationsTable.vehicleYear,
      vehicleColor: driverApplicationsTable.vehicleColor,
      licensePlateNumber: driverApplicationsTable.licensePlateNumber,
      licenseNumber: driverApplicationsTable.licenseNumber,
      licenseExpiry: driverApplicationsTable.licenseExpiry,
      createdAt: driverApplicationsTable.createdAt,
      updatedAt: driverApplicationsTable.updatedAt,
      userName: usersTable.name,
      userAvatar: usersTable.avatar,
      userEmail: usersTable.email,
    })
    .from(driverApplicationsTable)
    .leftJoin(usersTable, eq(driverApplicationsTable.userId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(driverApplicationsTable.createdAt))
    .limit(200);

  res.json({ applications: apps });
});

// PATCH /api/admin/delivery/applications/:id/approve
router.patch("/admin/delivery/applications/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;
  const admin = req.user as any;
  const { adminNote, vehicleType } = req.body;

  const [app] = await db
    .select()
    .from(driverApplicationsTable)
    .where(eq(driverApplicationsTable.id, appId))
    .limit(1);

  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertDriverAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  await db
    .update(driverApplicationsTable)
    .set({ status: "approved", adminNote: adminNote ?? null, reviewedById: adminId, reviewedAt: new Date() })
    .where(eq(driverApplicationsTable.id, appId));

  // Create driver record (copy vehicle fields from application)
  const existing = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, app.userId)).limit(1);
  const vehicleFields = {
    vehicleType: vehicleType ?? app.vehicleType ?? null,
    vehicleBrand: (app as any).vehicleBrand ?? null,
    vehicleModel: (app as any).vehicleModel ?? null,
    vehicleYear: (app as any).vehicleYear ?? null,
    vehicleColor: (app as any).vehicleColor ?? null,
    licensePlateNumber: (app as any).licensePlateNumber ?? null,
    photoFront: app.photoFront ?? null,
    photoSide: app.photoSide ?? null,
    facePhotoFront: (app as any).facePhotoFront ?? null,
    facePhotoLeft: (app as any).facePhotoLeft ?? null,
    facePhotoRight: (app as any).facePhotoRight ?? null,
    facePhotoHoldingId: (app as any).facePhotoHoldingId ?? null,
  };
  if (existing.length === 0) {
    await db.insert(driversTable).values({
      userId: app.userId,
      applicationId: appId,
      status: "active",
      country: app.country,
      city: app.city,
      ...vehicleFields,
    });
  } else {
    await db.update(driversTable).set({ status: "active", ...vehicleFields }).where(eq(driversTable.userId, app.userId));
  }

  // Notify driver
  await db.insert(notificationsTable).values({
    userId: app.userId,
    type: "driver_approved",
    isRead: false,
  } as any).catch(() => {});

  res.json({ success: true });
});

// PATCH /api/admin/delivery/applications/:id/reject
router.patch("/admin/delivery/applications/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;
  const admin = req.user as any;
  const { adminNote, allowEdit } = req.body;

  const [app] = await db.select().from(driverApplicationsTable).where(eq(driverApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertDriverAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  await db
    .update(driverApplicationsTable)
    .set({ status: "rejected", adminNote: adminNote ?? null, reviewedById: adminId, reviewedAt: new Date(), allowEdit: allowEdit === true })
    .where(eq(driverApplicationsTable.id, appId));

  // Only suspend the driver record for hard rejections (not when edit is allowed)
  if (!allowEdit) {
    await db.update(driversTable).set({ status: "suspended" }).where(eq(driversTable.userId, app.userId)).catch(() => {});
  }

  await db.insert(notificationsTable).values({
    userId: app.userId,
    type: "driver_rejected",
    isRead: false,
  } as any).catch(() => {});

  res.json({ success: true });
});

// PATCH /api/admin/delivery/applications/:id/request-changes
router.patch("/admin/delivery/applications/:id/request-changes", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;
  const admin = req.user as any;
  const { adminNote, changesRequestedReason } = req.body;

  const [app] = await db.select().from(driverApplicationsTable).where(eq(driverApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertDriverAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  await db.update(driverApplicationsTable).set({
    status: "needs_changes",
    adminNote: adminNote ?? null,
    reviewedById: adminId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(driverApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({
    userId: app.userId,
    type: "driver_needs_changes",
    isRead: false,
  } as any).catch(() => {});

  await logAdminAction(req, {
    actionType: "driver_request_changes",
    actionCategory: "driver",
    description: `Requested changes on driver application #${appId} for ${app.firstName} ${app.lastName}. Reason: ${changesRequestedReason ?? "None"}`,
    targetType: "driver_application",
    targetId: appId,
    targetName: `${app.firstName} ${app.lastName}`,
    beforeState: { status: app.status },
    afterState: { status: "needs_changes", changesRequestedReason },
    riskLevel: "low",
  });

  res.json({ success: true });
});

// PATCH /api/admin/delivery/applications/:id/suspend
router.patch("/admin/delivery/applications/:id/suspend", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;
  const admin = req.user as any;
  const { reason, durationDays } = req.body as { reason?: string; durationDays?: number };

  const [app] = await db.select().from(driverApplicationsTable).where(eq(driverApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertDriverAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  const now = new Date();
  const suspendedUntil = durationDays && durationDays > 0
    ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  await db.update(driversTable).set({
    status: "suspended",
    suspensionReason: reason ?? null,
    suspendedUntil,
    suspendedBy: adminId,
    suspendedAt: now,
  }).where(eq(driversTable.userId, app.userId));

  await db.update(driverApplicationsTable).set({ status: "suspended", reviewedById: adminId, reviewedAt: now }).where(eq(driverApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({ userId: app.userId, type: "driver_suspended", isRead: false } as any).catch(() => {});

  res.json({ success: true });
});

// PATCH /api/admin/delivery/applications/:id/unsuspend
router.patch("/admin/delivery/applications/:id/unsuspend", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;
  const admin = req.user as any;

  const [app] = await db.select().from(driverApplicationsTable).where(eq(driverApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertDriverAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  await db.update(driversTable).set({
    status: "active",
    suspensionReason: null,
    suspendedUntil: null,
    suspendedBy: null,
    suspendedAt: null,
  }).where(eq(driversTable.userId, app.userId));

  await db.update(driverApplicationsTable).set({ status: "approved", reviewedById: adminId, reviewedAt: new Date() }).where(eq(driverApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({ userId: app.userId, type: "driver_unsuspended", isRead: false } as any).catch(() => {});

  res.json({ success: true });
});

// GET /api/delivery/my-suspension — driver checks their own suspension details
router.get("/delivery/my-suspension", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [driver] = await db
    .select({
      status: driversTable.status,
      suspensionReason: driversTable.suspensionReason,
      suspendedUntil: driversTable.suspendedUntil,
      suspendedAt: driversTable.suspendedAt,
      suspendedBy: driversTable.suspendedBy,
    })
    .from(driversTable)
    .where(eq(driversTable.userId, userId))
    .limit(1);

  if (!driver || driver.status !== "suspended") {
    res.json({ suspended: false });
    return;
  }

  let suspendedByName: string | null = null;
  if (driver.suspendedBy) {
    const [admin] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, driver.suspendedBy)).limit(1);
    suspendedByName = admin?.name ?? null;
  }

  res.json({
    suspended: true,
    reason: driver.suspensionReason,
    suspendedAt: driver.suspendedAt,
    suspendedUntil: driver.suspendedUntil,
    suspendedByName,
    isPermanent: !driver.suspendedUntil,
  });
});

// ── Browse Deliveries (all auth'd users in delivery countries) ─────────────────

// GET /api/delivery/browse — lets any authenticated user browse available
// deliveries regardless of driver status. Returns a driverCta so the frontend
// can render the correct call-to-action per user state without a second request.
// Admins/super-admins bypass country restriction and can pass ?country= to filter.
router.get("/delivery/browse", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const userCountry = req.user?.country ?? null;
  const isAdmin = !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  const isSuperAdmin = !!(req.user?.isSuperAdmin);
  const adminScopeCountry = (req.user as any)?.adminScopeCountry ?? null;

  // ── Admin path: bypass country gate, use ?country= param ──────────────────
  if (isAdmin) {
    const reqCountry = req.query.country ? String(req.query.country) : null;

    // Zone admin scope enforcement: if admin has a country scope and isn't super,
    // they can only see their own scope country
    let effectiveCountry: string | null = reqCountry;
    if (!isSuperAdmin && adminScopeCountry) {
      effectiveCountry = adminScopeCountry;
    }

    const conditions: any[] = [
      inArray(deliveriesTable.status, ["waiting", "driver_assigned", "picked_up", "on_the_way", "arrived"]),
      or(
        eq(deliveriesTable.deliveryMethod, "motorcycle"),
        eq(deliveriesTable.deliveryMethod, "car"),
      ),
    ];
    if (effectiveCountry && effectiveCountry !== "all") {
      conditions.push(eq(deliveriesTable.country, effectiveCountry));
    }

    const buyerTable = alias(usersTable, "buyer");
    const rows = await db
      .select({
        id: deliveriesTable.id,
        deliveryMethod: deliveriesTable.deliveryMethod,
        pickupAddress: deliveriesTable.pickupAddress,
        pickupCity: deliveriesTable.pickupCity,
        deliveryAddress: deliveriesTable.deliveryAddress,
        deliveryCity: deliveriesTable.deliveryCity,
        country: deliveriesTable.country,
        status: deliveriesTable.status,
        feeUsd: deliveriesTable.feeUsd,
        feeLocal: deliveriesTable.feeLocal,
        distanceKm: deliveriesTable.distanceKm,
        tipUsd: deliveriesTable.tipUsd,
        currency: deliveriesTable.currency,
        sellerNote: deliveriesTable.sellerNote,
        speedTier: deliveriesTable.speedTier,
        transactionIdNum: deliveriesTable.transactionId,
        createdAt: deliveriesTable.createdAt,
        buyerPhone: buyerTable.phone,
        buyerName: buyerTable.name,
        paymentMethod: transactionsTable.paymentMethod,
      })
      .from(deliveriesTable)
      .leftJoin(buyerTable, eq(deliveriesTable.buyerId, buyerTable.id))
      .leftJoin(transactionsTable, eq(deliveriesTable.transactionId, transactionsTable.id))
      .where(and(...conditions))
      .orderBy(desc(deliveriesTable.createdAt))
      .limit(500);

    const htgRateAdmin = await getExchangeRate().catch(() => 130);
    const deliveries = rows.map(d => {
      if (d.feeUsd != null) {
        return { ...d, distanceFromDriverKm: null, driverEarnings: Math.round(d.feeUsd * DRIVER_COMMISSION_PCT * 100) / 100 };
      }
      if (d.pickupCity && d.deliveryCity && d.country && d.deliveryMethod && d.deliveryMethod !== "self") {
        const calc = calculateDeliveryPrice(d.pickupCity, d.deliveryCity, d.country, d.deliveryMethod, htgRateAdmin);
        return { ...d, distanceFromDriverKm: null, feeUsd: calc.feeUsd, feeLocal: calc.feeLocal, distanceKm: calc.distanceKm, driverEarnings: calc.driverEarningsUsd, currency: calc.currency };
      }
      return { ...d, distanceFromDriverKm: null, driverEarnings: null };
    });

    res.json({
      deliveries,
      driverCta: "approved" as const,   // admins see full details
      isApprovedDriver: false,
      isAdminView: true,
      driverHasGps: false,
      driverCommune: null,
      rejectedAllowEdit: false,
      rejectedAdminNote: null,
      effectiveCountry,
      adminScopeCountry,
    });
    return;
  }

  // ── Regular user / driver path ─────────────────────────────────────────────
  const [driver] = await db
    .select({ status: driversTable.status, latitude: driversTable.latitude, longitude: driversTable.longitude, commune: driversTable.commune })
    .from(driversTable).where(eq(driversTable.userId, userId)).limit(1);

  const [app] = await db
    .select({ status: driverApplicationsTable.status, allowEdit: driverApplicationsTable.allowEdit, adminNote: driverApplicationsTable.adminNote })
    .from(driverApplicationsTable).where(eq(driverApplicationsTable.userId, userId))
    .orderBy(desc(driverApplicationsTable.createdAt)).limit(1);

  let driverCta: "none" | "pending" | "approved" | "rejected" | "suspended" = "none";
  if (driver?.status === "active") driverCta = "approved";
  else if (driver?.status === "suspended") driverCta = "suspended";
  else if (app?.status === "pending") driverCta = "pending";
  else if (app?.status === "rejected") driverCta = "rejected";
  const rejectedAllowEdit = app?.status === "rejected" ? (app?.allowEdit ?? false) : false;
  const rejectedAdminNote = app?.status === "rejected" ? (app?.adminNote ?? null) : null;

  const driverLat = driver?.latitude;
  const driverLng = driver?.longitude;
  const driverCommune = driver?.commune ?? null;

  // Commune filter: approved drivers with a commune set see only their commune's deliveries
  const communeFilter = driverCta === "approved" && driverCommune
    ? sql`LOWER(${deliveriesTable.pickupCity}) = LOWER(${driverCommune})`
    : undefined;

  const buyerAlias = alias(usersTable, "buyer");
  const browseRawRows = await db
    .select({
      id: deliveriesTable.id,
      deliveryMethod: deliveriesTable.deliveryMethod,
      pickupAddress: deliveriesTable.pickupAddress,
      pickupCity: deliveriesTable.pickupCity,
      deliveryAddress: deliveriesTable.deliveryAddress,
      deliveryCity: deliveriesTable.deliveryCity,
      country: deliveriesTable.country,
      status: deliveriesTable.status,
      feeUsd: deliveriesTable.feeUsd,
      feeLocal: deliveriesTable.feeLocal,
      distanceKm: deliveriesTable.distanceKm,
      tipUsd: deliveriesTable.tipUsd,
      currency: deliveriesTable.currency,
      sellerNote: deliveriesTable.sellerNote,
      speedTier: deliveriesTable.speedTier,
      transactionIdNum: deliveriesTable.transactionId,
      createdAt: deliveriesTable.createdAt,
      buyerPhone: buyerAlias.phone,
      buyerName: buyerAlias.name,
      paymentMethod: transactionsTable.paymentMethod,
      listingTitle: listingsTable.title,
      listingImages: listingsTable.images,
    })
    .from(deliveriesTable)
    .leftJoin(buyerAlias, eq(deliveriesTable.buyerId, buyerAlias.id))
    .leftJoin(transactionsTable, eq(deliveriesTable.transactionId, transactionsTable.id))
    .leftJoin(listingsTable, eq(deliveriesTable.listingId, listingsTable.id))
    .where(and(
      eq(deliveriesTable.status, "waiting"),
      eq(deliveriesTable.country, userCountry),
      or(
        eq(deliveriesTable.deliveryMethod, "motorcycle"),
        eq(deliveriesTable.deliveryMethod, "car"),
      ),
      communeFilter,
    ))
    .orderBy(sql`${deliveriesTable.tipUsd} DESC NULLS LAST`, desc(deliveriesTable.createdAt))
    .limit(200);

  const rows = browseRawRows.map(({ listingImages, ...d }) => ({
    ...d,
    listingImage: Array.isArray(listingImages) && listingImages.length > 0 ? listingImages[0] : null,
  }));

  type BrowseRow = (typeof rows)[number] & { distanceFromDriverKm: number | null; driverEarnings: number | null };
  let deliveries: BrowseRow[];

  const htgRateBrowse = await getExchangeRate().catch(() => 130);
  const enrichBrowse = (d: (typeof rows)[number]): Omit<BrowseRow, "distanceFromDriverKm"> => {
    if (d.feeUsd != null) return { ...d, driverEarnings: Math.round(d.feeUsd * DRIVER_COMMISSION_PCT * 100) / 100 };
    if (d.pickupCity && d.deliveryCity && d.country && d.deliveryMethod && d.deliveryMethod !== "self") {
      const calc = calculateDeliveryPrice(d.pickupCity, d.deliveryCity, d.country, d.deliveryMethod, htgRateBrowse);
      return { ...d, feeUsd: calc.feeUsd, feeLocal: calc.feeLocal, distanceKm: calc.distanceKm, driverEarnings: calc.driverEarningsUsd, currency: calc.currency };
    }
    return { ...d, driverEarnings: null };
  };

  if (driverCta === "approved" && driverLat != null && driverLng != null) {
    // Sort by distance from driver (closest pickup first)
    const mapped = rows.map(d => {
      const coords = d.pickupCity ? lookupCity(d.pickupCity) : null;
      const dist = coords ? haversineKm(driverLat, driverLng, coords[0], coords[1]) : 999;
      return { ...enrichBrowse(d), _dist: dist, distanceFromDriverKm: null as number | null };
    }).sort((a, b) => a._dist - b._dist);

    deliveries = mapped.slice(0, 50).map(({ _dist, ...d }) => ({ ...d, distanceFromDriverKm: _dist > 0 && _dist < 999 ? Math.round(_dist * 10) / 10 : null }));
  } else {
    deliveries = rows.slice(0, 50).map(d => ({ ...enrichBrowse(d), distanceFromDriverKm: null }));
  }

  res.json({
    deliveries,
    driverCta,
    isApprovedDriver: driverCta === "approved",
    driverHasGps: driverLat != null,
    driverCommune,
    rejectedAllowEdit,
    rejectedAdminNote,
  });
});

// ── Available Deliveries (approved drivers, full details incl. seller contact) ──

// GET /api/delivery/available
router.get("/delivery/available", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [driver] = await db.select().from(driversTable).where(and(eq(driversTable.userId, userId), eq(driversTable.status, "active"))).limit(1);
  if (!driver) { res.status(403).json({ error: "Not an approved driver" }); return; }

  const driverLat = driver.latitude;
  const driverLng = driver.longitude;
  const driverCommune = driver.commune; // e.g. "Delmas", "Cap-Haïtien"

  // ── Build WHERE clause ────────────────────────────────────────────────────
  // Primary: commune-based — only pickupCity matching driver's commune
  // Fallback (no commune set): GPS 10km radius (Haiti) or country-wide
  const baseWhere = and(
    eq(deliveriesTable.status, "waiting"),
    eq(deliveriesTable.country, driver.country),
    or(
      eq(deliveriesTable.deliveryMethod, "motorcycle"),
      eq(deliveriesTable.deliveryMethod, "car"),
    ),
    // Commune filter: match case-insensitively when commune is set
    driverCommune
      ? sql`LOWER(${deliveriesTable.pickupCity}) = LOWER(${driverCommune})`
      : undefined,
  );

  const rows = await db
    .select({
      id: deliveriesTable.id,
      deliveryMethod: deliveriesTable.deliveryMethod,
      pickupAddress: deliveriesTable.pickupAddress,
      pickupCity: deliveriesTable.pickupCity,
      deliveryAddress: deliveriesTable.deliveryAddress,
      deliveryCity: deliveriesTable.deliveryCity,
      country: deliveriesTable.country,
      status: deliveriesTable.status,
      totalAmount: deliveriesTable.totalAmount,
      driverEarnings: deliveriesTable.driverEarnings,
      currency: deliveriesTable.currency,
      feeLocal: deliveriesTable.feeLocal,
      feeUsd: deliveriesTable.feeUsd,
      distanceKm: deliveriesTable.distanceKm,
      tipUsd: deliveriesTable.tipUsd,
      sellerNote: deliveriesTable.sellerNote,
      createdAt: deliveriesTable.createdAt,
      sellerName: usersTable.name,
      sellerAvatar: usersTable.avatar,
      sellerPhone: usersTable.phone,
      listingTitle: listingsTable.title,
      listingImages: listingsTable.images,
    })
    .from(deliveriesTable)
    .leftJoin(usersTable, eq(deliveriesTable.sellerId, usersTable.id))
    .leftJoin(listingsTable, eq(deliveriesTable.listingId, listingsTable.id))
    .where(baseWhere)
    .orderBy(sql`${deliveriesTable.tipUsd} DESC NULLS LAST`, desc(deliveriesTable.createdAt))
    .limit(200);

  type WithDist = (typeof rows)[number] & { _distKm: number };
  let deliveries: WithDist[];

  if (driverLat != null && driverLng != null) {
    // Sort by distance from driver GPS — closest pickup first
    deliveries = rows
      .map(d => {
        const coords = d.pickupCity ? lookupCity(d.pickupCity) : null;
        const dist = coords ? haversineKm(driverLat, driverLng, coords[0], coords[1]) : 999;
        return { ...d, _distKm: dist };
      })
      .sort((a, b) => a._distKm - b._distKm)
      .slice(0, 50);

    // If no commune set + Haiti: apply 10km radius (legacy behaviour)
    if (!driverCommune && driver.country === "Haiti") {
      deliveries = deliveries.filter(d => d._distKm <= 10);
    }
  } else {
    // No GPS — sorted by recency already
    deliveries = rows.map(d => ({ ...d, _distKm: 0 })).slice(0, 50);
  }

  const htgRateAvail = await getExchangeRate().catch(() => 130);
  const result = deliveries.map(({ _distKm, listingImages, ...d }) => {
    const base = {
      ...d,
      listingImage: Array.isArray(listingImages) && listingImages.length > 0 ? listingImages[0] : null,
      distanceFromDriverKm: _distKm > 0 ? Math.round(_distKm * 10) / 10 : null,
    };
    // Auto-calculate fee if missing
    if (base.feeUsd == null && base.pickupCity && base.deliveryCity && base.country && base.deliveryMethod && base.deliveryMethod !== "self") {
      const calc = calculateDeliveryPrice(base.pickupCity, base.deliveryCity, base.country, base.deliveryMethod, htgRateAvail);
      return { ...base, feeUsd: calc.feeUsd, feeLocal: calc.feeLocal, distanceKm: calc.distanceKm, driverEarnings: calc.driverEarningsUsd, currency: calc.currency };
    }
    if (base.driverEarnings == null && base.feeUsd != null) {
      return { ...base, driverEarnings: Math.round(base.feeUsd * DRIVER_COMMISSION_PCT * 100) / 100 };
    }
    return base;
  });

  res.json({
    deliveries: result,
    driverHasGps: driverLat != null,
    driverCommune: driverCommune ?? null,
  });
});

// GET /api/delivery/my — driver's active deliveries
router.get("/delivery/my", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const sellerUser = alias(usersTable, "seller_user");
  const buyerUser  = alias(usersTable, "buyer_user");

  const rows = await db
    .select({
      id: deliveriesTable.id,
      deliveryMethod: deliveriesTable.deliveryMethod,
      pickupAddress: deliveriesTable.pickupAddress,
      pickupCity: deliveriesTable.pickupCity,
      deliveryAddress: deliveriesTable.deliveryAddress,
      deliveryCity: deliveriesTable.deliveryCity,
      country: deliveriesTable.country,
      status: deliveriesTable.status,
      totalAmount: deliveriesTable.totalAmount,
      driverEarnings: deliveriesTable.driverEarnings,
      currency: deliveriesTable.currency,
      feeUsd: deliveriesTable.feeUsd,
      feeLocal: deliveriesTable.feeLocal,
      distanceKm: deliveriesTable.distanceKm,
      acceptedAt: deliveriesTable.acceptedAt,
      pickedUpAt: deliveriesTable.pickedUpAt,
      deliveredAt: deliveriesTable.deliveredAt,
      arrivedAt: deliveriesTable.arrivedAt,
      buyerAbsentAt: deliveriesTable.buyerAbsentAt,
      buyerRescheduleDeadline: deliveriesTable.buyerRescheduleDeadline,
      rescheduleCount: deliveriesTable.rescheduleCount,
      holdAmountUsd: deliveriesTable.holdAmountUsd,
      returnCode: deliveriesTable.returnCode,
      returnFeeUsd: deliveriesTable.returnFeeUsd,
      failedPickupAt: deliveriesTable.failedPickupAt,
      transactionId: deliveriesTable.transactionId,
      createdAt: deliveriesTable.createdAt,
      pickupPhotoUrl:  sql<string | null>`deliveries.pickup_photo_url`,
      dropoffPhotoUrl: sql<string | null>`deliveries.dropoff_photo_url`,
      sellerName: sellerUser.name,
      sellerPhone: sellerUser.phone,
      buyerName: buyerUser.name,
      buyerPhone: buyerUser.phone,
      listingTitle: listingsTable.title,
      listingImages: listingsTable.images,
    })
    .from(deliveriesTable)
    .leftJoin(sellerUser, eq(deliveriesTable.sellerId, sellerUser.id))
    .leftJoin(buyerUser,  eq(deliveriesTable.buyerId,  buyerUser.id))
    .leftJoin(listingsTable, eq(deliveriesTable.listingId, listingsTable.id))
    .where(eq(deliveriesTable.driverUserId, userId))
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(30);

  const deliveries = rows.map(({ listingImages, ...d }) => ({
    ...d,
    listingImage: Array.isArray(listingImages) && listingImages.length > 0 ? listingImages[0] : null,
  }));

  res.json({ deliveries });
});

// POST /api/delivery/:id/accept — driver accepts a delivery
router.post("/delivery/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);

  const [driver] = await db.select().from(driversTable).where(and(eq(driversTable.userId, userId), eq(driversTable.status, "active"))).limit(1);
  if (!driver) { res.status(403).json({ error: "Not an approved driver" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }
  if (delivery.status !== "waiting") { res.status(409).json({ error: "Delivery already taken" }); return; }

  const code = genCode();

  const [updated] = await db
    .update(deliveriesTable)
    .set({
      driverId: driver.id,
      driverUserId: userId,
      status: "driver_assigned",
      verificationCode: code,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(deliveriesTable.id, deliveryId), eq(deliveriesTable.status, "waiting")))
    .returning();

  if (!updated) { res.status(409).json({ error: "Delivery already taken" }); return; }

  // Notify buyer: driver accepted + reveal verification code immediately
  // The buyer must show this code to the driver upon delivery — it is secret.
  await db.insert(notificationsTable).values({
    userId: delivery.buyerId,
    type: "driver_assigned",
    isRead: false,
    message: `Yon chofè aksepte kòmand ou. Kòd sekrè ou: ${code}. Kenbe kòd sa — ba li chofè a SÈLMAN lè li rive ba ou kòmand lan. Pa pataje li ak pèsonn.`,
  } as any).catch(() => {});

  // Send SMS to buyer with the secret code
  if (delivery.buyerId) {
    const [buyer] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, delivery.buyerId))
      .limit(1);
    if (buyer?.phone) {
      await sendSms(
        buyer.phone,
        `FLEXA MARKET — Yon chofè aksepte kòmand ou! Kòd sekrè ou: ${code}. Ba li chofè a SÈLMAN lè li rive. Pa pataje li ak pèsonn.`,
      ).catch(() => {});
    }
  }

  // Real-time socket push so buyer sees code instantly on screen
  emitDeliveryStatus(deliveryId, {
    status: "driver_assigned",
    verificationCode: code,
  });

  res.json({ delivery: updated, verificationCode: code });
});

// PATCH /api/delivery/:id/status — driver updates status
router.patch("/delivery/:id/status", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  const { status } = req.body;

  const validStatuses = ["picked_up", "on_the_way", "arrived", "delivered", "cancelled"];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const now = new Date();
  const updates: Partial<typeof deliveriesTable.$inferInsert> = {
    status,
    updatedAt: now,
  };

  if (status === "picked_up") updates.pickedUpAt = now;
  if (status === "arrived") (updates as any).arrivedAt = now;
  if (status === "delivered") {
    updates.deliveredAt = now;
    updates.paymentHeldUntil = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  }

  const [updated] = await db
    .update(deliveriesTable)
    .set(updates)
    .where(eq(deliveriesTable.id, deliveryId))
    .returning();

  // Notify buyer/seller of status change
  // Note: the secret verification code is sent when driver ACCEPTS (see accept route),
  // not on pickup. On pickup we just notify that the driver is en route.
  for (const uid of [delivery.buyerId, delivery.sellerId]) {
    const isBuyer = uid === delivery.buyerId;
    const msg = (status === "picked_up" && isBuyer)
      ? `Chofe a pran kòmand ou epi li sou wout ba ou. Ba li kòd ou a lè li rive.`
      : undefined;
    await db.insert(notificationsTable).values({
      userId: uid,
      type: `delivery_${status}`,
      isRead: false,
      actorId: uid,
      ...(msg ? { message: msg } : {}),
    } as any).catch(() => {});
  }

  // On pickup: push a socket update (no code reveal — code was already shared on accept)
  if (status === "picked_up") {
    emitDeliveryStatus(deliveryId, { status: "picked_up" });
  }

  res.json({ delivery: updated });
});

// POST /api/delivery/:id/verify-code — driver confirms delivery with buyer code
// Triggers IMMEDIATE: escrow release to seller + driver FM wallet credit
router.post("/delivery/:id/verify-code", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  const { code } = req.body;

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  // Idempotency guard — prevent double-payment if driver submits code twice
  if (delivery.status === "delivered" || delivery.codeVerifiedAt !== null) {
    res.status(409).json({ error: "Delivery already confirmed", alreadyProcessed: true });
    return;
  }

  if (delivery.verificationCode !== String(code)) {
    res.status(400).json({ error: "Invalid code" });
    return;
  }

  const now = new Date();

  // Mark delivery complete — no hold, payment is immediate
  await db
    .update(deliveriesTable)
    .set({
      codeVerifiedAt: now,
      status: "delivered",
      deliveredAt: now,
      paymentHeldUntil: now,
      sellerPaymentReleased: true,
      sellerPaymentReleasedAt: now,
      updatedAt: now,
    })
    .where(eq(deliveriesTable.id, deliveryId));

  // ── 1. Release escrow to seller immediately ────────────────────────────────
  if (delivery.transactionId) {
    await releaseEscrow(delivery.transactionId, "buyer").catch((err: unknown) => {
      req.log.error({ err, deliveryId, transactionId: delivery.transactionId }, "Escrow release failed on delivery confirm");
    });
  }

  // ── 2. Credit driver FM wallet immediately (DRIVER_COMMISSION_PCT × fee + 100% tip) ────────────
  // Split: DRIVER_COMMISSION_PCT (85%) of delivery fee → driver, PLATFORM_COMMISSION_PCT (15%) → platform.
  const baseFeeEarnings =
    delivery.driverEarnings ??
    (delivery.feeUsd != null ? Math.round(delivery.feeUsd * DRIVER_COMMISSION_PCT * 100) / 100 : 0);
  const tipEarnings = delivery.tipUsd != null && delivery.tipUsd > 0 ? delivery.tipUsd : 0;
  const driverEarningsUsd = Math.round((baseFeeEarnings + tipEarnings) * 100) / 100;

  if (driverEarningsUsd > 0) {
    // Upsert into promoWallet (FM wallet)
    const [existing] = await db
      .select({ id: promoWalletTable.id })
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId))
      .limit(1);

    if (existing) {
      await db
        .update(promoWalletTable)
        .set({
          balanceUsd: sql`${promoWalletTable.balanceUsd} + ${driverEarningsUsd}`,
          updatedAt: now,
        })
        .where(eq(promoWalletTable.userId, userId));
    } else {
      await db
        .insert(promoWalletTable)
        .values({ userId, balanceUsd: driverEarningsUsd });
    }

    const tipNote = tipEarnings > 0 ? ` + $${tipEarnings.toFixed(2)} tip` : "";
    // Wallet audit log for driver
    await db.insert(walletTransactionsTable).values({
      userId,
      type: "delivery_earnings",
      amountUsd: driverEarningsUsd,
      paymentRef: `delivery-${deliveryId}`,
      status: "completed",
      note: `Chauffè peman — livrezon #FL-${deliveryId}${tipNote}`,
    }).catch(() => {});

    // Update driver lifetime stats atomically
    await db
      .update(driversTable)
      .set({
        deliveryCount: sql`${driversTable.deliveryCount} + 1`,
        earningsTotal: sql`${driversTable.earningsTotal} + ${driverEarningsUsd}`,
      })
      .where(eq(driversTable.userId, userId))
      .catch(() => {});

    // Notify driver of wallet credit with exact amount
    await db.insert(notificationsTable).values({
      userId,
      type: "delivery_paid",
      isRead: false,
      message: `💰 $${driverEarningsUsd.toFixed(2)} kredite nan kont FM ou imedyatman — livrezon #FL-${deliveryId} konfime!`,
    } as any).catch(() => {});

    // SMS driver with earnings amount
    const [driverUser] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (driverUser?.phone) {
      await sendSms(driverUser.phone, `FLEXA MARKET — $${driverEarningsUsd.toFixed(2)} kredite nan kont FM ou! Livrezon #FL-${deliveryId} konfime avèk siksè.`).catch(() => {});
    }
  } else {
    // No earnings to credit but still increment delivery count
    await db
      .update(driversTable)
      .set({ deliveryCount: sql`${driversTable.deliveryCount} + 1` })
      .where(eq(driversTable.userId, userId))
      .catch(() => {});
  }

  // ── 3. Release $10 hold back to buyer FM wallet ────────────────────────────
  const holdAmt = delivery.holdAmountUsd ?? 10;
  if (holdAmt > 0 && delivery.buyerId) {
    const [buyerWallet] = await db
      .select({ id: promoWalletTable.id })
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, delivery.buyerId))
      .limit(1);

    if (buyerWallet) {
      await db
        .update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${holdAmt}`, updatedAt: now })
        .where(eq(promoWalletTable.userId, delivery.buyerId));
    } else {
      await db.insert(promoWalletTable).values({ userId: delivery.buyerId, balanceUsd: holdAmt });
    }
    await db.insert(walletTransactionsTable).values({
      userId: delivery.buyerId,
      type: "delivery_hold_release",
      amountUsd: holdAmt,
      paymentRef: `delivery-hold-${deliveryId}`,
      status: "completed",
      note: `Depo livrezon retounen — livrezon #FL-${deliveryId}`,
    }).catch(() => {});
    await db
      .update(deliveriesTable)
      .set({ holdReleased: true, holdReleasedAt: now, updatedAt: now })
      .where(eq(deliveriesTable.id, deliveryId));
  }

  // ── 4. Notify seller with exact earnings amount + SMS ──────────────────────
  if (delivery.sellerId) {
    // Get seller earnings from linked transaction
    let sellerEarningsAmt: number | null = null;
    if (delivery.transactionId) {
      const [tx] = await db.select({ sellerEarnings: transactionsTable.sellerEarnings, amount: transactionsTable.amount })
        .from(transactionsTable).where(eq(transactionsTable.id, delivery.transactionId)).limit(1);
      sellerEarningsAmt = tx ? Number(tx.sellerEarnings ?? tx.amount) : null;
    }

    const sellerMsg = sellerEarningsAmt != null
      ? `💰 $${sellerEarningsAmt.toFixed(2)} kredite nan kont FM ou imedyatman — livrezon #FL-${deliveryId} livré avèk siksè!`
      : `✅ Livrezon #FL-${deliveryId} livré avèk siksè! Kòb ou kredite nan kont FM ou.`;

    await db.insert(notificationsTable).values({
      userId: delivery.sellerId,
      type: "delivery_delivered",
      isRead: false,
      message: sellerMsg,
    } as any).catch(() => {});

    // SMS seller
    const [sellerUser] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, delivery.sellerId)).limit(1);
    if (sellerUser?.phone) {
      await sendSms(sellerUser.phone, `FLEXA MARKET — ${sellerMsg}`).catch(() => {});
    }
  }

  // Notify buyer of successful delivery
  if (delivery.buyerId) {
    await db.insert(notificationsTable).values({
      userId: delivery.buyerId,
      type: "delivery_delivered",
      isRead: false,
      message: `✅ Livrezon #FL-${deliveryId} konfime! Chofè a livré kòmand ou avèk siksè.`,
    } as any).catch(() => {});
  }

  res.json({ success: true, driverEarnings: driverEarningsUsd });
});

// POST /api/delivery/:id/report-buyer-absent — driver reports buyer is not available at delivery address
// Flow:
//   1. Driver arrives (status must be "arrived" or "on_the_way")
//   2. Buyer has BUYER_ABSENT_GRACE_HOURS to reschedule via /reschedule
//   3. After deadline: auto-release job refunds buyer, credits driver, marks listing available
router.post("/delivery/:id/report-buyer-absent", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }

  const allowed = ["arrived", "on_the_way"];
  if (!allowed.includes(delivery.status)) {
    res.status(400).json({ error: `Sèlman posib lè status = arrived oswa on_the_way. Aktyèl: ${delivery.status}` });
    return;
  }

  // Driver must wait 20 minutes at buyer's location before reporting absent
  const ARRIVED_WAIT_MINUTES = 20;
  const arrivedAt = (delivery as any).arrivedAt ? new Date((delivery as any).arrivedAt) : null;
  if (arrivedAt) {
    const waitUntil = new Date(arrivedAt.getTime() + ARRIVED_WAIT_MINUTES * 60 * 1000);
    const nowCheck = new Date();
    if (nowCheck < waitUntil) {
      const remainMin = Math.ceil((waitUntil.getTime() - nowCheck.getTime()) / 60000);
      res.status(429).json({
        error: `Ou dwe tann ${remainMin} minit ankò apre ou rive avan ou ka rapòte kliyan absan.`,
        waitUntil: waitUntil.toISOString(),
      });
      return;
    }
  }

  const BUYER_ABSENT_GRACE_HOURS = 2;
  const now = new Date();
  const deadline = new Date(now.getTime() + BUYER_ABSENT_GRACE_HOURS * 3600 * 1000);

  await db.update(deliveriesTable)
    .set({
      status: "buyer_absent",
      buyerAbsentAt: now,
      buyerRescheduleDeadline: deadline,
      updatedAt: now,
    } as any)
    .where(eq(deliveriesTable.id, deliveryId));

  // Notify buyer — with deadline info
  if (delivery.buyerId) {
    const deadlineStr = deadline.toLocaleTimeString("fr-HT", { hour: "2-digit", minute: "2-digit" });
    await db.insert(notificationsTable).values({
      userId: delivery.buyerId,
      type: "delivery_buyer_absent",
      isRead: false,
      message: `⚠️ Chofè a rive men ou pa la. Ou gen jiska ${deadlineStr} (${BUYER_ABSENT_GRACE_HOURS}h) pou reskède livrezon an. Sinon kòmand retounen bay machann epi ou ap resevwa ranbousman pou pwodwi a.`,
    } as any).catch(() => {});

    const [buyer] = await db.select({ phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, delivery.buyerId)).limit(1);
    if (buyer?.phone) {
      await sendSms(
        buyer.phone,
        `FLEXA MARKET — Chofè a rive men ou pa disponib. Ou gen ${BUYER_ABSENT_GRACE_HOURS}h pou reskède. Konekte sou app la pou reskède livrezon an. Sinon kòmand retounen bay machann.`,
      ).catch(() => {});
    }
  }

  // Notify seller — informational
  if (delivery.sellerId) {
    await db.insert(notificationsTable).values({
      userId: delivery.sellerId,
      type: "delivery_buyer_absent",
      isRead: false,
      message: `ℹ️ Achtè a pa t disponib pou resevwa kòmand li. N ap tann reskèd pandan ${BUYER_ABSENT_GRACE_HOURS}h. Si li pa reskède, kòmand retounen ba ou.`,
    } as any).catch(() => {});
  }

  req.log.info({ deliveryId, driverUserId: userId, deadline }, "Buyer absent at delivery — grace period started");
  res.json({ ok: true, deadlineIso: deadline.toISOString(), graceHours: BUYER_ABSENT_GRACE_HOURS });
});

// POST /api/delivery/:id/reschedule — buyer reschedules when driver marked them absent
// Rules:
//   • Only the buyer can call this
//   • Status must be "buyer_absent"
//   • Must be before buyer_reschedule_deadline
//   • Max 1 reschedule (reschedule_count < 1)
//   • Reverts status to "driver_assigned" with a NEW verification code
router.post("/delivery/:id/reschedule", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.buyerId !== userId) { res.status(403).json({ error: "Sèlman achtè a ka reskède" }); return; }
  if (delivery.status !== "buyer_absent") {
    res.status(400).json({ error: "Livrezon sa pa nan etap buyer_absent" }); return;
  }

  const deadline = delivery.buyerRescheduleDeadline ? new Date(delivery.buyerRescheduleDeadline) : null;
  if (deadline && new Date() > deadline) {
    res.status(410).json({ error: "Delè reskèd pase. Kòmand ap retounen bay machann otomatikman." }); return;
  }

  const rescheduleCount = (delivery.rescheduleCount as number | null) ?? 0;
  if (rescheduleCount >= 1) {
    res.status(409).json({ error: "Ou deja itilize yon reskèd pou livrezon sa." }); return;
  }

  const newCode = String(Math.floor(100000 + Math.random() * 900000));
  const now = new Date();

  await db.update(deliveriesTable)
    .set({
      status: "driver_assigned",
      verificationCode: newCode,
      buyerAbsentAt: null,
      buyerRescheduleDeadline: null,
      rescheduleCount: rescheduleCount + 1,
      updatedAt: now,
    } as any)
    .where(eq(deliveriesTable.id, deliveryId));

  // Notify driver with new code
  if (delivery.driverUserId) {
    await db.insert(notificationsTable).values({
      userId: delivery.driverUserId,
      type: "delivery_rescheduled",
      isRead: false,
      message: `✅ Achtè a reskède! Retounen ba li kòmand lan. Nouvo kòd konfimasyon: ${newCode}`,
    } as any).catch(() => {});

    const [driver] = await db.select({ phone: usersTable.phone })
      .from(usersTable).where(eq(usersTable.id, delivery.driverUserId)).limit(1);
    if (driver?.phone) {
      await sendSms(
        driver.phone,
        `FLEXA MARKET — Achtè a reskède! Retounen ba li kòmand lan. Nouvo kòd: ${newCode}`,
      ).catch(() => {});
    }
  }

  // Send buyer the new code too
  const [buyer] = await db.select({ phone: usersTable.phone })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (buyer?.phone) {
    await sendSms(
      buyer.phone,
      `FLEXA MARKET — Reskèd konfime! Chofè a ap retounen ba ou. Nouvo kòd sekrè ou: ${newCode}. Ba li sèlman lè li rive.`,
    ).catch(() => {});
  }

  req.log.info({ deliveryId, buyerId: userId, newCode }, "Delivery rescheduled by buyer");
  res.json({ ok: true, message: "Reskèd konfime. Chofè a ap retounen ba ou." });
});

// POST /api/delivery/:id/driver-return — driver manually initiates return after 20-min cooldown
// Rules:
//   • Status must be buyer_absent
//   • Must wait 20 minutes after buyerAbsentAt (give buyer a chance to arrive)
//   • Credits driver 2× earnings (original trip + return trip)
//   • Refunds buyer: max(0, tx.amount − feeUsd) — deducts return delivery fee from escrow
//   • Seller is notified that buyer must pay re-delivery fee via FM transfer to get item back
router.post("/delivery/:id/driver-return", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (delivery.status !== "buyer_absent") {
    res.status(400).json({ error: "Retou sèlman posib si status = buyer_absent." }); return;
  }

  const RETURN_COOLDOWN_MINUTES = 20;
  const absentAt = delivery.buyerAbsentAt ? new Date(delivery.buyerAbsentAt) : null;
  if (!absentAt) { res.status(400).json({ error: "buyerAbsentAt pa defini." }); return; }

  const returnAllowedAt = new Date(absentAt.getTime() + RETURN_COOLDOWN_MINUTES * 60 * 1000);
  const now = new Date();
  if (now < returnAllowedAt) {
    const remainMin = Math.ceil((returnAllowedAt.getTime() - now.getTime()) / 60000);
    res.status(429).json({
      error: `Tann ${remainMin} minit ankò avan ou ka fè retou a.`,
      returnAllowedAt: returnAllowedAt.toISOString(),
    });
    return;
  }

  // Generate a 6-digit return confirmation code for the seller
  const sellerReturnCode = String(Math.floor(100000 + Math.random() * 900000));

  // Change status to "returning" — money not processed yet
  await db.update(deliveriesTable)
    .set({ status: "returning", returnCode: sellerReturnCode, updatedAt: now } as any)
    .where(eq(deliveriesTable.id, deliveryId));

  // Notify seller: they need to give the driver this code when he arrives
  if (delivery.sellerId) {
    const [seller] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, delivery.sellerId))
      .limit(1);

    await db.insert(notificationsTable).values({
      userId: delivery.sellerId,
      type: "delivery_returned",
      isRead: false,
      message: `📦 Chofè a ap retounen atik ou a — achtè a pa t prezan. Kòd konfirmasyon retou ou: ${sellerReturnCode}. Bay chofè a kòd sa SÈLMAN lè li rive kay ou. Pa pataje li avèk okenn lòt moun.`,
    } as any).catch(() => {});

    if (seller?.phone) {
      await sendSms(
        seller.phone,
        `FLEXA MARKET — Chofè a ap retounen atik ou a. Kòd retou: ${sellerReturnCode}. Bay chofè a kòd sa lè li rive. Pa pataje li.`,
      ).catch(() => {});
    }
  }

  // Notify buyer: driver is heading back with the item
  if (delivery.buyerId) {
    await db.insert(notificationsTable).values({
      userId: delivery.buyerId,
      type: "delivery_returned",
      isRead: false,
      message: `📦 Chofè a ap retounen kòmand lan bay machann. Lè retou a konfime, ou ap resevwa ranbousman ou otomatikman.`,
    } as any).catch(() => {});
  }

  req.log.info({ deliveryId, driverUserId: userId, sellerReturnCode }, "Driver initiated return (buyer absent) — awaiting seller return code confirmation");
  res.json({ ok: true, status: "returning" });
});

// POST /api/delivery/:id/confirm-buyer-return — driver enters seller's return code to complete buyer-absent return
// Seller gives driver the code when driver arrives back at seller's address
router.post("/delivery/:id/confirm-buyer-return", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const { code } = req.body;
  if (!code) { res.status(400).json({ error: "Kòd retou obligatwa." }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (delivery.status !== "returning") {
    res.status(400).json({ error: "Konfirmasyon retou sèlman posib si status = returning." }); return;
  }
  if (delivery.returnCode !== String(code)) {
    res.status(400).json({ error: "Kòd retou pa kòrèk. Mande machann nan pou bay kòd la ankò." }); return;
  }

  const now = new Date();
  const driverFeePerTrip = delivery.driverEarnings ??
    (delivery.feeUsd != null ? Math.round(delivery.feeUsd * DRIVER_COMMISSION_PCT * 100) / 100 : 0);
  const driverTotal = Math.round(driverFeePerTrip * 2 * 100) / 100;
  const feeUsd = delivery.feeUsd ?? (driverFeePerTrip > 0 ? Math.round(driverFeePerTrip / DRIVER_COMMISSION_PCT * 100) / 100 : 0);

  // Mark delivery returned + record confirmation time
  await db.update(deliveriesTable)
    .set({ status: "returned", returnConfirmedAt: now, updatedAt: now } as any)
    .where(eq(deliveriesTable.id, deliveryId));

  // Restore listing to available
  if (delivery.listingId) {
    await db.update(listingsTable)
      .set({ status: "available" } as any)
      .where(eq(listingsTable.id, delivery.listingId));
  }

  // Process escrow: partial refund to buyer
  let refundAmt = 0;
  if (delivery.transactionId) {
    const [tx] = await db.select({
      amount: transactionsTable.amount,
      userId: transactionsTable.userId,
      escrowReleased: transactionsTable.escrowReleased,
    }).from(transactionsTable).where(eq(transactionsTable.id, delivery.transactionId)).limit(1);

    if (tx && !tx.escrowReleased) {
      refundAmt = Math.max(0, Math.round((tx.amount - feeUsd) * 100) / 100);
      const buyerId = tx.userId;

      await db.update(transactionsTable)
        .set({ escrowReleased: true, escrowReleasedAt: now, orderStatus: "return_refunded" } as any)
        .where(eq(transactionsTable.id, delivery.transactionId));

      if (refundAmt > 0) {
        const [bw] = await db.select({ id: promoWalletTable.id })
          .from(promoWalletTable).where(eq(promoWalletTable.userId, buyerId)).limit(1);
        if (bw) {
          await db.update(promoWalletTable)
            .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${refundAmt}`, updatedAt: now })
            .where(eq(promoWalletTable.userId, buyerId));
        } else {
          await db.insert(promoWalletTable).values({ userId: buyerId, balanceUsd: refundAmt });
        }
        await db.insert(walletTransactionsTable).values({
          userId: buyerId,
          type: "refund",
          amountUsd: refundAmt,
          paymentRef: `buyer-return-refund-${deliveryId}`,
          note: `Ranbousman retou — achtè absan — #FL-${deliveryId} (pri $${tx.amount.toFixed(2)} − frè retou $${feeUsd.toFixed(2)})`,
        }).catch(() => {});
      }

      await db.insert(notificationsTable).values({
        userId: buyerId,
        type: "delivery_returned",
        isRead: false,
        message: `📦 Retou konfime. ${refundAmt > 0
          ? `💰 $${refundAmt.toFixed(2)} ajoute nan wallet ou (pri $${tx.amount.toFixed(2)} − frè retou $${feeUsd.toFixed(2)}).`
          : "Pa gen ranbousman — frè livrezon kouvri tout kòb la."
        } Kontakte machann nan si ou vle ranje nouvo livrezon.`,
      } as any).catch(() => {});
    }
  }

  // Credit driver 2× earnings
  if (driverTotal > 0) {
    const [dw] = await db.select({ id: promoWalletTable.id })
      .from(promoWalletTable).where(eq(promoWalletTable.userId, userId)).limit(1);
    if (dw) {
      await db.update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${driverTotal}`, updatedAt: now })
        .where(eq(promoWalletTable.userId, userId));
    } else {
      await db.insert(promoWalletTable).values({ userId, balanceUsd: driverTotal });
    }
    await db.insert(walletTransactionsTable).values({
      userId,
      type: "delivery_earnings",
      amountUsd: driverTotal,
      paymentRef: `buyer-return-driver-${deliveryId}`,
      note: `Frè 2× (ale + retou) — achtè absan konfime — #FL-${deliveryId} ($${driverFeePerTrip.toFixed(2)} × 2)`,
    }).catch(() => {});
    await db.update(driversTable)
      .set({ earningsTotal: sql`${driversTable.earningsTotal} + ${driverTotal}`, updatedAt: now } as any)
      .where(eq(driversTable.userId, userId));
    await db.insert(notificationsTable).values({
      userId,
      type: "delivery_returned",
      isRead: false,
      message: `✅ Retou konfime pa machann! $${driverTotal.toFixed(2)} ($${driverFeePerTrip.toFixed(2)} ale + $${driverFeePerTrip.toFixed(2)} retou) kredite nan kont ou imedyatman.`,
    } as any).catch(() => {});
  }

  // Notify seller
  if (delivery.sellerId) {
    await db.insert(notificationsTable).values({
      userId: delivery.sellerId,
      type: "delivery_returned",
      isRead: false,
      message: `✅ Ou konfime retou kòmand #FL-${deliveryId}. Atik la nan men ou. Si achtè a vle resevwa l, li dwe peye frè nouvo livrezon via transfert FM.`,
    } as any).catch(() => {});
  }

  req.log.info({ deliveryId, driverUserId: userId, driverTotal, refundAmt }, "Buyer-absent return confirmed by seller code");
  res.json({ ok: true, driverTotal, refundAmt });
});

// POST /api/delivery/:id/seller-closed — driver reports seller unavailable when returning item
// Happens when driver arrives at seller's address but nobody answers (door locked, seller left, etc.)
// Driver keeps item safe until admin coordinates next delivery attempt
router.post("/delivery/:id/seller-closed", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (delivery.status !== "returning") {
    res.status(400).json({ error: "seller-closed sèlman posib si status = returning." }); return;
  }

  const now = new Date();

  await db.update(deliveriesTable)
    .set({ status: "seller_closed", updatedAt: now } as any)
    .where(eq(deliveriesTable.id, deliveryId));

  // Notify all admins in the same country
  const adminUsers = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isAdmin, true),
        delivery.country ? eq(usersTable.country, delivery.country) : sql`true`,
      ),
    )
    .limit(20);

  for (const admin of adminUsers) {
    await db.insert(notificationsTable).values({
      userId: admin.id,
      type: "delivery_seller_closed",
      isRead: false,
      message: `🔴 Livrezon #FL-${deliveryId}: chofè a rive kay machann pou retounen atik la men machann nan pa t prezan (pòt fèmen). Chofè a ap kenbe atik la an sekirite. Kontakte machann nan pou ranje nouvo tentativ retou.`,
    } as any).catch(() => {});
  }

  // Notify seller
  if (delivery.sellerId) {
    const [seller] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, delivery.sellerId))
      .limit(1);

    await db.insert(notificationsTable).values({
      userId: delivery.sellerId,
      type: "delivery_seller_closed",
      isRead: false,
      message: `⚠️ Chofè a rive pou retounen atik ou a men li pa jwenn ou (pòt fèmen). Atik la an sekirite ak chofè a. Admin FlexaMarket ap kontakte ou byento pou ranje retou a.`,
    } as any).catch(() => {});

    if (seller?.phone) {
      await sendSms(
        seller.phone,
        `FLEXA MARKET — Chofè a pa jwenn ou pou retou #FL-${deliveryId}. Atik la an sekirite. Admin ap kontakte ou byento.`,
      ).catch(() => {});
    }
  }

  req.log.info({ deliveryId, driverUserId: userId }, "Driver reported seller closed during return trip");
  res.json({
    ok: true,
    message: "Mèsi pou efò ou! Kenbe atik la byen pwoteje epi an sekirite. Admin FlexaMarket ap kontakte machann nan pou ranje yon nouvo dat livrezon. Ou ka kontinye aksepte lòt livrezon nòmalman.",
  });
});

// POST /api/delivery/:id/report-failed — driver marks seller as absent at pickup
// Charges buyer double fee, credits driver with $10 hold, generates return code for seller
router.post("/delivery/:id/report-failed", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (delivery.status !== "driver_assigned") {
    res.status(400).json({ error: "Can only report failed pickup when in driver_assigned status" });
    return;
  }

  const now = new Date();
  const returnCode = String(Math.floor(100000 + Math.random() * 900000));
  const returnFeeUsd = delivery.feeUsd ?? 0;
  const holdAmt = delivery.holdAmountUsd ?? 10;

  // Update delivery: mark failed, generate return code & return fee
  await db
    .update(deliveriesTable)
    .set({
      status: "failed_pickup",
      failedPickupAt: now,
      returnCode,
      returnFeeUsd,
      updatedAt: now,
    })
    .where(eq(deliveriesTable.id, deliveryId));

  // Credit driver with $10 hold immediately (compensation for failed trip)
  if (holdAmt > 0) {
    const [driverWallet] = await db
      .select({ id: promoWalletTable.id })
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId))
      .limit(1);

    if (driverWallet) {
      await db
        .update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${holdAmt}`, updatedAt: now })
        .where(eq(promoWalletTable.userId, userId));
    } else {
      await db.insert(promoWalletTable).values({ userId, balanceUsd: holdAmt });
    }
    await db.insert(walletTransactionsTable).values({
      userId,
      type: "delivery_hold_failed_pickup",
      amountUsd: holdAmt,
      paymentRef: `delivery-hold-failed-${deliveryId}`,
      status: "completed",
      note: `Depo $${holdAmt} — machann pat prezan — livrezon #FL-${deliveryId}`,
    }).catch(() => {});
  }

  // Notify seller with the return code
  if (delivery.sellerId) {
    const [seller] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, delivery.sellerId))
      .limit(1);

    await db.insert(notificationsTable).values({
      userId: delivery.sellerId,
      type: "delivery_failed_pickup",
      isRead: false,
      message: `Chofe a rive men ou pa t prezan. Kòd retour ou: ${returnCode}. Bay chofe a kòd sa pou konfime retour a.`,
    } as any).catch(() => {});

    if (seller?.phone) {
      await sendSms(
        seller.phone,
        `FLEXA MARKET — Chofe a rive men ou pa t prezan. Kòd retour ou: ${returnCode}. Bay chofe a kòd sa pou konfime retour a. Pa pataje li.`,
      ).catch(() => {});
    }
  }

  // Notify buyer they'll be charged delivery fee twice
  if (delivery.buyerId) {
    await db.insert(notificationsTable).values({
      userId: delivery.buyerId,
      type: "delivery_failed_pickup",
      isRead: false,
      message: `Machann nan pa t prezan pou chofe a. Ou pral peye frè livrezon an 2 fwa (ale + retou).`,
    } as any).catch(() => {});
  }

  req.log.info({ deliveryId, driverUserId: userId, returnCode }, "Delivery failed pickup reported");
  res.json({ success: true });
});

// POST /api/delivery/:id/confirm-return — driver enters seller's return code to complete the return trip
router.post("/delivery/:id/confirm-return", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const { code } = req.body;
  if (!code) { res.status(400).json({ error: "Return code required" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Forbidden" }); return; }
  if (delivery.status !== "failed_pickup") {
    res.status(400).json({ error: "Delivery is not in failed_pickup status" });
    return;
  }
  if (delivery.returnCode !== String(code)) {
    res.status(400).json({ error: "Invalid return code" });
    return;
  }

  const now = new Date();
  const returnFeeUsd = delivery.returnFeeUsd ?? delivery.feeUsd ?? 0;
  const driverReturnEarnings = Math.round(returnFeeUsd * DRIVER_COMMISSION_PCT * 100) / 100;

  await db
    .update(deliveriesTable)
    .set({ status: "returned", returnConfirmedAt: now, updatedAt: now })
    .where(eq(deliveriesTable.id, deliveryId));

  // Credit driver with DRIVER_COMMISSION_PCT (85%) of return fee
  if (driverReturnEarnings > 0) {
    const [driverWallet] = await db
      .select({ id: promoWalletTable.id })
      .from(promoWalletTable)
      .where(eq(promoWalletTable.userId, userId))
      .limit(1);

    if (driverWallet) {
      await db
        .update(promoWalletTable)
        .set({ balanceUsd: sql`${promoWalletTable.balanceUsd} + ${driverReturnEarnings}`, updatedAt: now })
        .where(eq(promoWalletTable.userId, userId));
    } else {
      await db.insert(promoWalletTable).values({ userId, balanceUsd: driverReturnEarnings });
    }
    await db.insert(walletTransactionsTable).values({
      userId,
      type: "delivery_return_earnings",
      amountUsd: driverReturnEarnings,
      paymentRef: `delivery-return-${deliveryId}`,
      status: "completed",
      note: `Kòb retou — livrezon #FL-${deliveryId}`,
    }).catch(() => {});
    await db
      .update(driversTable)
      .set({ earningsTotal: sql`${driversTable.earningsTotal} + ${driverReturnEarnings}` })
      .where(eq(driversTable.userId, userId))
      .catch(() => {});
  }

  // Notify buyer and seller that return is complete
  for (const uid of [delivery.buyerId, delivery.sellerId]) {
    if (!uid) continue;
    await db.insert(notificationsTable).values({
      userId: uid,
      type: "delivery_returned",
      isRead: false,
      message: `Chofe a fin konfime retou livrezon #FL-${deliveryId}.`,
    } as any).catch(() => {});
  }

  req.log.info({ deliveryId, driverUserId: userId, driverReturnEarnings }, "Delivery return confirmed");
  res.json({ success: true, driverReturnEarnings });
});

// GET /api/delivery/tracking/:id — buyer/seller sees tracking
router.get("/delivery/tracking/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);

  const [delivery] = await db
    .select({
      id: deliveriesTable.id,
      status: deliveriesTable.status,
      deliveryMethod: deliveriesTable.deliveryMethod,
      pickupAddress: deliveriesTable.pickupAddress,
      pickupCity: deliveriesTable.pickupCity,
      deliveryAddress: deliveriesTable.deliveryAddress,
      deliveryCity: deliveriesTable.deliveryCity,
      verificationCode: deliveriesTable.verificationCode,
      country: deliveriesTable.country,
      totalAmount: deliveriesTable.totalAmount,
      currency: deliveriesTable.currency,
      acceptedAt: deliveriesTable.acceptedAt,
      pickedUpAt: deliveriesTable.pickedUpAt,
      deliveredAt: deliveriesTable.deliveredAt,
      paymentHeldUntil: deliveriesTable.paymentHeldUntil,
      createdAt: deliveriesTable.createdAt,
      sellerId: deliveriesTable.sellerId,
      buyerId: deliveriesTable.buyerId,
      driverUserId: deliveriesTable.driverUserId,
      feeUsd: deliveriesTable.feeUsd,
      buyerAbsentAt: deliveriesTable.buyerAbsentAt,
      buyerRescheduleDeadline: deliveriesTable.buyerRescheduleDeadline,
      returnCode: deliveriesTable.returnCode,
      returnFeeUsd: deliveriesTable.returnFeeUsd,
      holdAmountUsd: deliveriesTable.holdAmountUsd,
      failedPickupAt: deliveriesTable.failedPickupAt,
      pickupPhotoUrl:  sql<string | null>`deliveries.pickup_photo_url`,
      dropoffPhotoUrl: sql<string | null>`deliveries.dropoff_photo_url`,
    })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery) { res.status(404).json({ error: "Not found" }); return; }

  const canView = [delivery.sellerId, delivery.buyerId, delivery.driverUserId].includes(userId)
    || !!(req.user?.isAdmin || req.user?.isSuperAdmin);
  if (!canView) { res.status(403).json({ error: "Forbidden" }); return; }

  // Fetch driver info if assigned (including vehicle fields)
  let driverInfo = null;
  if (delivery.driverUserId) {
    const [drv] = await db
      .select({
        name: usersTable.name,
        avatar: usersTable.avatar,
        phone: usersTable.phone,
        rating: driversTable.rating,
        deliveryCount: driversTable.deliveryCount,
        isOnline: driversTable.isOnline,
        vehicleType: driversTable.vehicleType,
        vehicleBrand: driversTable.vehicleBrand,
        vehicleModel: driversTable.vehicleModel,
        vehicleYear: driversTable.vehicleYear,
        vehicleColor: driversTable.vehicleColor,
        licensePlateNumber: driversTable.licensePlateNumber,
        photoFront: driversTable.photoFront,
        photoSide: driversTable.photoSide,
        facePhotoFront: driversTable.facePhotoFront,
        latitude: driversTable.latitude,
        longitude: driversTable.longitude,
        lastLocationAt: driversTable.lastLocationAt,
      })
      .from(usersTable)
      .leftJoin(driversTable, eq(driversTable.userId, usersTable.id))
      .where(eq(usersTable.id, delivery.driverUserId))
      .limit(1);
    driverInfo = drv ?? null;
  }

  // Only share verification code with buyer
  const responseDelivery = {
    ...delivery,
    verificationCode: userId === delivery.buyerId ? delivery.verificationCode : undefined,
  };

  res.json({ delivery: responseDelivery, driver: driverInfo });
});

// GET /api/admin/deliveries — admin analytics panel
router.get("/admin/deliveries", requireAdmin, async (req, res): Promise<void> => {
  const { status, country } = req.query;

  const sellerUsers = alias(usersTable, "seller_users");
  const driverUsers = alias(usersTable, "driver_users");

  const conditions: ReturnType<typeof eq>[] = [];
  if (status && status !== "all") conditions.push(eq(deliveriesTable.status, String(status)));
  if (country && country !== "all") conditions.push(eq(deliveriesTable.country, String(country)));

  const adminCountry = req.user?.country;
  const isSuperAdmin = (req.user as any)?.isSuperAdmin ?? false;
  if (!isSuperAdmin && adminCountry) conditions.push(eq(deliveriesTable.country, adminCountry));

  const deliveries = await db
    .select({
      id: deliveriesTable.id,
      deliveryMethod: deliveriesTable.deliveryMethod,
      pickupCity: deliveriesTable.pickupCity,
      deliveryCity: deliveriesTable.deliveryCity,
      country: deliveriesTable.country,
      status: deliveriesTable.status,
      totalAmount: deliveriesTable.totalAmount,
      driverEarnings: deliveriesTable.driverEarnings,
      feeLocal: deliveriesTable.feeLocal,
      feeUsd: deliveriesTable.feeUsd,
      distanceKm: deliveriesTable.distanceKm,
      currency: deliveriesTable.currency,
      createdAt: deliveriesTable.createdAt,
      sellerName: sellerUsers.name,
      sellerAvatar: sellerUsers.avatar,
      driverName: driverUsers.name,
      driverAvatar: driverUsers.avatar,
    })
    .from(deliveriesTable)
    .leftJoin(sellerUsers, eq(deliveriesTable.sellerId, sellerUsers.id))
    .leftJoin(driverUsers, eq(deliveriesTable.driverUserId, driverUsers.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(200);

  res.json({ deliveries });
});

// POST /api/admin/deliveries/:id/cancel — admin force-cancels any delivery
router.post("/admin/deliveries/:id/cancel", requireAdmin, async (req, res): Promise<void> => {
  const deliveryId = Number(req.params.id);
  if (!deliveryId) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const [delivery] = await db.select().from(deliveriesTable).where(eq(deliveriesTable.id, deliveryId)).limit(1);
  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }
  if (delivery.status === "delivered" || delivery.status === "cancelled") {
    res.status(400).json({ error: `Delivery is already ${delivery.status}` }); return;
  }

  await db.update(deliveriesTable)
    .set({ status: "cancelled" })
    .where(eq(deliveriesTable.id, deliveryId));

  req.log.info({ deliveryId, adminId: req.userId }, "Admin force-cancelled delivery");
  res.json({ success: true, deliveryId, status: "cancelled" });
});

// ── Driver GPS / Online Status ─────────────────────────────────────────────────

// PATCH /api/delivery/driver/location — update GPS + online toggle
router.patch("/delivery/driver/location", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { latitude, longitude, commune, zone, isOnline } = req.body;

  const [driver] = await db.select({ id: driversTable.id }).from(driversTable).where(eq(driversTable.userId, userId)).limit(1);
  if (!driver) { res.status(403).json({ error: "Not a driver" }); return; }

  const now = new Date();
  await db.update(driversTable).set({
    ...(latitude != null ? { latitude: Number(latitude) } : {}),
    ...(longitude != null ? { longitude: Number(longitude) } : {}),
    ...(commune != null ? { commune: String(commune) } : {}),
    ...(zone != null ? { zone: String(zone) } : {}),
    ...(isOnline != null ? { isOnline: Boolean(isOnline) } : {}),
    ...(latitude != null ? { lastLocationAt: now } : {}),
  }).where(eq(driversTable.userId, userId));

  // Broadcast real-time GPS to delivery watchers (buyer + seller) and admin room
  if (latitude != null && longitude != null) {
    const locationPayload = {
      lat: Number(latitude),
      lng: Number(longitude),
      updatedAt: now.toISOString(),
    };
    // Find this driver's active delivery to broadcast to its room
    db.select({ id: deliveriesTable.id })
      .from(deliveriesTable)
      .where(and(
        eq(deliveriesTable.driverUserId, userId),
        inArray(deliveriesTable.status, ["driver_assigned", "picked_up", "on_the_way", "arrived"]),
      ))
      .limit(1)
      .then(([active]) => {
        if (active) {
          emitDriverLocation(active.id, { ...locationPayload, deliveryId: active.id });
        }
      })
      .catch(() => {});
    // Also broadcast to admin live-map room
    emitAdminDriverUpdate({ userId, ...locationPayload });
  }

  res.json({ success: true });
});

// GET /api/admin/drivers/live — all online drivers with GPS for live map
router.get("/admin/drivers/live", requireAdmin, async (req, res): Promise<void> => {
  const isSuperAdmin = (req.user as any)?.isSuperAdmin ?? false;
  const adminCountry = req.user?.country;

  const rows = await db
    .select({
      id: driversTable.id,
      userId: driversTable.userId,
      name: usersTable.name,
      avatar: usersTable.avatar,
      phone: usersTable.phone,
      latitude: driversTable.latitude,
      longitude: driversTable.longitude,
      lastLocationAt: driversTable.lastLocationAt,
      isOnline: driversTable.isOnline,
      commune: driversTable.commune,
      zone: driversTable.zone,
      vehicleType: driversTable.vehicleType,
      vehicleBrand: driversTable.vehicleBrand,
      vehicleModel: driversTable.vehicleModel,
      vehicleColor: driversTable.vehicleColor,
      licensePlateNumber: driversTable.licensePlateNumber,
      rating: driversTable.rating,
      deliveryCount: driversTable.deliveryCount,
      status: driversTable.status,
      country: usersTable.country,
    })
    .from(driversTable)
    .leftJoin(usersTable, eq(driversTable.userId, usersTable.id))
    .where(
      isSuperAdmin
        ? eq(driversTable.isOnline, true)
        : and(eq(driversTable.isOnline, true), adminCountry ? eq(usersTable.country, adminCountry) : undefined),
    )
    .orderBy(desc(driversTable.lastLocationAt))
    .limit(500);

  res.json({ drivers: rows, total: rows.length });
});

// GET /api/delivery/driver/stats — driver dashboard stats
router.get("/delivery/driver/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [driver] = await db.select().from(driversTable).where(eq(driversTable.userId, userId)).limit(1);
  if (!driver) { res.status(404).json({ error: "Not a driver" }); return; }
  res.json({ driver });
});

// PATCH /api/admin/delivery/applications/:id/request-changes
router.patch("/admin/delivery/applications/:id/request-changes", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const { adminNote, changesRequestedReason } = req.body;
  const adminId = req.userId!;
  const admin = req.user as any;

  const [app] = await db.select().from(driverApplicationsTable).where(eq(driverApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }
  const scopeErr = assertDriverAppInScope(admin, app.country ?? null);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  await db.update(driverApplicationsTable).set({
    status: "needs_changes",
    adminNote: adminNote ?? null,
    changesRequestedReason: changesRequestedReason ?? null,
    reviewedById: adminId,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  } as any).where(eq(driverApplicationsTable.id, appId));

  await db.insert(notificationsTable).values({
    userId: app.userId,
    type: "driver_needs_changes",
    isRead: false,
  } as any).catch(() => {});

  res.json({ success: true });
});

// PATCH /api/admin/delivery/applications/:id/reactivate — re-approve suspended
router.patch("/admin/delivery/applications/:id/reactivate", requireAdmin, async (req, res): Promise<void> => {
  const appId = parseInt(String(req.params.id), 10);
  const adminId = req.userId!;

  const [app] = await db.select().from(driverApplicationsTable).where(eq(driverApplicationsTable.id, appId)).limit(1);
  if (!app) { res.status(404).json({ error: "Application not found" }); return; }

  await db.update(driverApplicationsTable)
    .set({ status: "approved", reviewedById: adminId, reviewedAt: new Date() })
    .where(eq(driverApplicationsTable.id, appId));

  await db.update(driversTable).set({ status: "active" }).where(eq(driversTable.userId, app.userId));

  await db.insert(notificationsTable).values({
    userId: app.userId,
    type: "driver_approved",
    isRead: false,
  } as any).catch(() => {});

  res.json({ success: true });
});

// POST /api/delivery/calculate-price — real-time pricing calculation
// Uses OSRM for road distance (falls back to Haversine if OSRM unavailable).
// All distance calculations are backend-only for anti-fraud security.
router.post("/delivery/calculate-price", requireAuth, async (req, res): Promise<void> => {
  const { sellerCity, buyerCity, country, method, listingPriceUsd } = req.body;
  if (!sellerCity || !buyerCity || !country || !method) {
    res.status(400).json({ error: "Missing required fields: sellerCity, buyerCity, country, method" });
    return;
  }
  if (!DELIVERY_COUNTRIES.includes(country)) {
    res.status(400).json({ error: "Delivery only available in Haiti and Dominican Republic" });
    return;
  }
  try {
    const htgRate = await getExchangeRate();

    // Try OSRM for real road distance (more accurate than straight-line)
    let overrideDistanceKm: number | undefined;
    let usedRoadDistance = false;
    const sellerCoords = lookupCity(String(sellerCity));
    const buyerCoords  = lookupCity(String(buyerCity));
    if (sellerCoords && buyerCoords) {
      const osrm = await getOsrmDistanceKm(
        sellerCoords[0], sellerCoords[1],
        buyerCoords[0],  buyerCoords[1],
      );
      if (osrm != null) {
        overrideDistanceKm = osrm;
        usedRoadDistance   = true;
      } else {
        // Haversine fallback (straight-line)
        overrideDistanceKm = Math.max(0.1, haversineKm(
          sellerCoords[0], sellerCoords[1],
          buyerCoords[0],  buyerCoords[1],
        ));
      }
    }

    const itemPrice = listingPriceUsd != null ? parseFloat(String(listingPriceUsd)) : 0;

    const result = calculateDeliveryPrice(
      String(sellerCity), String(buyerCity), String(country), String(method),
      htgRate, overrideDistanceKm, usedRoadDistance, isNaN(itemPrice) ? 0 : itemPrice,
    );
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message ?? "Calculation failed" });
  }
});

// GET /api/driver/delivery-history — driver sees their own delivery history
router.get("/driver/delivery-history", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [driver] = await db
    .select({ id: driversTable.id })
    .from(driversTable)
    .where(eq(driversTable.userId, userId))
    .limit(1);
  if (!driver) { res.status(403).json({ error: "Not a driver" }); return; }

  const deliveries = await db
    .select({
      id: deliveriesTable.id,
      deliveryMethod: deliveriesTable.deliveryMethod,
      pickupAddress: deliveriesTable.pickupAddress,
      pickupCity: deliveriesTable.pickupCity,
      deliveryAddress: deliveriesTable.deliveryAddress,
      deliveryCity: deliveriesTable.deliveryCity,
      country: deliveriesTable.country,
      status: deliveriesTable.status,
      feeUsd: deliveriesTable.feeUsd,
      driverEarnings: deliveriesTable.driverEarnings,
      distanceKm: deliveriesTable.distanceKm,
      createdAt: deliveriesTable.createdAt,
      acceptedAt: deliveriesTable.acceptedAt,
      pickedUpAt: deliveriesTable.pickedUpAt,
      deliveredAt: deliveriesTable.deliveredAt,
    })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.driverUserId, userId))
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(200);

  res.json({ deliveries });
});

// GET /api/delivery/cities — list available cities per country
router.get("/delivery/cities", requireAuth, async (req, res): Promise<void> => {
  const country = String(req.query.country ?? "");
  res.json({ cities: getAvailableCities(country) });
});

// POST /api/delivery — seller creates delivery for an order
router.post("/delivery", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const {
    transactionId, listingId, buyerId, deliveryMethod,
    pickupAddress, pickupCity, deliveryAddress, deliveryCity,
    country, sellerNote, feeUsd, feeLocal, distanceKm, tipUsd, speedTier,
  } = req.body;

  if (!deliveryMethod || !country || !deliveryAddress) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  if (!DELIVERY_COUNTRIES.includes(country)) {
    res.status(400).json({ error: "Delivery only available in Haiti and Dominican Republic" });
    return;
  }

  // Pre-compute driver earnings (85% of fee) — tip is 100% separate
  const feeUsdNum = feeUsd != null ? parseFloat(String(feeUsd)) : null;
  const driverEarningsNum = feeUsdNum != null ? Math.round(feeUsdNum * DRIVER_COMMISSION_PCT * 100) / 100 : null;
  const tipUsdNum = tipUsd != null && parseFloat(String(tipUsd)) > 0 ? parseFloat(parseFloat(String(tipUsd)).toFixed(2)) : null;

  const [delivery] = await db
    .insert(deliveriesTable)
    .values({
      transactionId: transactionId ? parseInt(transactionId, 10) : null,
      listingId: listingId ? parseInt(listingId, 10) : null,
      sellerId: userId,
      buyerId: parseInt(buyerId, 10),
      deliveryMethod: String(deliveryMethod),
      pickupAddress: pickupAddress ? String(pickupAddress) : null,
      pickupCity: pickupCity ? String(pickupCity) : null,
      deliveryAddress: String(deliveryAddress),
      deliveryCity: deliveryCity ? String(deliveryCity) : null,
      country: String(country),
      status: deliveryMethod === "self" ? "on_the_way" : "waiting",
      sellerNote: sellerNote ? String(sellerNote).slice(0, 500) : null,
      currency: "USD",
      feeUsd: feeUsdNum,
      feeLocal: feeLocal != null ? parseFloat(String(feeLocal)) : null,
      distanceKm: distanceKm != null ? parseFloat(String(distanceKm)) : null,
      driverEarnings: driverEarningsNum,
      tipUsd: tipUsdNum,
      speedTier: speedTier ? String(speedTier) : null,
      holdAmountUsd: 10,
    })
    .returning();

  res.status(201).json({ delivery });
});

// PATCH /api/delivery/:id/tip — buyer adds or updates driver tip
router.patch("/delivery/:id/tip", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  const { tipUsd } = req.body;

  if (tipUsd == null || isNaN(parseFloat(String(tipUsd)))) {
    res.status(400).json({ error: "tipUsd required" });
    return;
  }

  const tipNum = Math.max(0, parseFloat(parseFloat(String(tipUsd)).toFixed(2)));

  const [delivery] = await db
    .select({ id: deliveriesTable.id, buyerId: deliveriesTable.buyerId, status: deliveriesTable.status, driverUserId: deliveriesTable.driverUserId })
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }
  if (delivery.buyerId !== userId) { res.status(403).json({ error: "Only the buyer can update the tip" }); return; }
  if (delivery.status === "delivered" || delivery.status === "cancelled") {
    res.status(400).json({ error: "Cannot update tip on a completed delivery" });
    return;
  }

  await db
    .update(deliveriesTable)
    .set({ tipUsd: tipNum, updatedAt: new Date() })
    .where(eq(deliveriesTable.id, deliveryId));

  res.json({ success: true, tipUsd: tipNum });
});

// GET /api/delivery/buyer/active — buyer checks their most recent active delivery
router.get("/delivery/buyer/active", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [delivery] = await db
    .select({
      id: deliveriesTable.id,
      status: deliveriesTable.status,
      tipUsd: deliveriesTable.tipUsd,
      createdAt: deliveriesTable.createdAt,
      driverUserId: deliveriesTable.driverUserId,
    })
    .from(deliveriesTable)
    .where(and(
      eq(deliveriesTable.buyerId, userId),
      sql`${deliveriesTable.status} IN ('waiting', 'accepted', 'picked_up', 'on_the_way')`,
    ))
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(1);

  res.json({ delivery: delivery ?? null });
});

// GET /api/admin/delivery/list — admin sees all deliveries
router.get("/admin/delivery/list", requireAdmin, async (req, res): Promise<void> => {
  const deliveries = await db
    .select({
      id: deliveriesTable.id,
      status: deliveriesTable.status,
      deliveryMethod: deliveriesTable.deliveryMethod,
      country: deliveriesTable.country,
      deliveryCity: deliveriesTable.deliveryCity,
      totalAmount: deliveriesTable.totalAmount,
      currency: deliveriesTable.currency,
      createdAt: deliveriesTable.createdAt,
      sellerName: usersTable.name,
      pickupPhotoUrl:  sql<string | null>`deliveries.pickup_photo_url`,
      dropoffPhotoUrl: sql<string | null>`deliveries.dropoff_photo_url`,
    })
    .from(deliveriesTable)
    .leftJoin(usersTable, eq(deliveriesTable.sellerId, usersTable.id))
    .orderBy(desc(deliveriesTable.createdAt))
    .limit(100);

  res.json({ deliveries });
});

// ─── Driver cancels an accepted delivery (before pickup) ───────────────────────
// POST /api/delivery/:id/driver-cancel
// Rules:
//   • Only the assigned driver can cancel
//   • Only allowed when status is "driver_assigned" (before pickup)
//   • Resets delivery to "waiting" so another driver can accept
//   • Driver loses the job but keeps any previously earned credits (none yet at this stage)
router.post("/delivery/:id/driver-cancel", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const deliveryId = parseInt(String(req.params.id), 10);
  if (isNaN(deliveryId)) { res.status(400).json({ error: "Invalid delivery id" }); return; }

  const [delivery] = await db
    .select()
    .from(deliveriesTable)
    .where(eq(deliveriesTable.id, deliveryId))
    .limit(1);

  if (!delivery) { res.status(404).json({ error: "Delivery not found" }); return; }
  if (delivery.driverUserId !== userId) { res.status(403).json({ error: "Pa livrezon ou sa" }); return; }

  // Locked once driver has the parcel
  const lockedStatuses = ["picked_up", "on_the_way", "arrived", "delivered"];
  if (lockedStatuses.includes(delivery.status)) {
    res.status(409).json({ error: "Ou deja pran kòmand lan. Ou pa kapab anile apre prise." }); return;
  }

  if (delivery.status !== "driver_assigned") {
    res.status(409).json({ error: "Livrezon sa pa nan etap kòrèk pou anile." }); return;
  }

  const now = new Date();

  // Reset delivery to waiting pool
  await db
    .update(deliveriesTable)
    .set({
      status: "waiting",
      driverId: null,
      driverUserId: null,
      verificationCode: null,
      acceptedAt: null,
      updatedAt: now,
    } as any)
    .where(eq(deliveriesTable.id, deliveryId));

  // Notify buyer that the driver cancelled and order is back in the pool
  if (delivery.buyerId) {
    await db.insert(notificationsTable).values({
      userId: delivery.buyerId,
      type: "driver_assigned",
      actorId: userId,
      message: "Chofe a anile livrezon an. Kòmand ou ap chèche yon nouvo chofe. Ou p ap peye anyen anplis.",
    } as any).catch(() => {});
  }

  req.log.info({ deliveryId, driverUserId: userId }, "Driver cancelled delivery — reset to waiting");
  res.json({ ok: true, message: "Livrezon kansele. Li retounen nan pool pou yon lòt chofe." });
});

export default router;
