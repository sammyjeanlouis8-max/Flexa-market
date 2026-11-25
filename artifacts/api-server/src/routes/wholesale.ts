import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  conversationsTable,
  messagesTable,
  wholesalePriceTiersTable,
  wholesaleProductsTable,
  wholesaleWarehousesTable,
  wholesaleInventoryTable,
  wholesaleFavoritesTable,
  wholesaleInquiriesTable,
} from "@workspace/db";
import { getRole, requireAuth } from "../middlewares/auth";
import {
  countriesMatch,
  isWarehouseBuyerVisible,
  normalizeWholesaleCountry,
  parsePagination,
  resolveBuyerCountry,
} from "../lib/wholesaleCountry";

const router = Router();

/** Keep in sync with marketplace `WHOLESALE_PUBLIC_LAUNCH` until public launch. */
const WHOLESALE_PUBLIC_LAUNCH = false;

/** Super Admin only while public launch is false — excludes regular admin/moderator/seller. */
function isWholesaleSuperAdmin(user: { isSuperAdmin?: boolean; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return !!user.isSuperAdmin || getRole(user as any) === "superadmin";
}

export {
  countriesMatch,
  isWarehouseBuyerVisible,
  normalizeWholesaleCountry,
  parsePagination,
  resolveBuyerCountry,
} from "../lib/wholesaleCountry";

/** Shared SQL predicates: buyer-visible product must sit in an owned, active, verified depot. */
function buyerVisibleWarehouseConds(buyerCountry: string) {
  return [
    eq(wholesaleWarehousesTable.verificationStatus, "verified"),
    eq(wholesaleWarehousesTable.isActive, true),
    sql`${wholesaleWarehousesTable.sellerId} = ${wholesaleProductsTable.sellerId}`,
    sql`lower(${wholesaleWarehousesTable.country}) = lower(${wholesaleProductsTable.country})`,
    sql`lower(${wholesaleProductsTable.country}) = lower(${buyerCountry})`,
  ];
}

async function loadProductWithWarehouse(productId: number) {
  const [row] = await db
    .select({
      product: wholesaleProductsTable,
      warehouse: wholesaleWarehousesTable,
    })
    .from(wholesaleProductsTable)
    .leftJoin(wholesaleWarehousesTable, eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id))
    .where(eq(wholesaleProductsTable.id, productId))
    .limit(1);
  return row ?? null;
}

async function requireWholesaleAccess(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) {
  await requireAuth(req, res, async () => {
    if (WHOLESALE_PUBLIC_LAUNCH || isWholesaleSuperAdmin(req.user)) {
      next();
      return;
    }
    res.status(403).json({ error: "Wholesale preview is Super Admin only" });
  });
}

function shapeWarehouse(row: typeof wholesaleWarehousesTable.$inferSelect, sellerName?: string | null) {
  return {
    id: row.id,
    sellerId: row.sellerId,
    sellerName: sellerName ?? null,
    name: row.name,
    country: row.country,
    region: row.region,
    city: row.city,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    verificationStatus: row.verificationStatus,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function shapeProduct(
  row: typeof wholesaleProductsTable.$inferSelect,
  seller: { id: number; name: string; avatar: string | null } | null,
  tiers: Array<typeof wholesalePriceTiersTable.$inferSelect> = [],
  warehouse: typeof wholesaleWarehousesTable.$inferSelect | null = null,
) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    unitPrice: row.unitPrice,
    currency: row.currency,
    images: row.images ?? [],
    category: row.category,
    country: row.country,
    city: row.city,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName ?? warehouse?.name ?? null,
    warehouseCity: row.warehouseCity ?? warehouse?.city ?? null,
    warehouse: warehouse ? shapeWarehouse(warehouse) : null,
    minOrderQty: row.minOrderQty,
    wholesaleUnitType: row.wholesaleUnitType,
    stockQuantity: row.stockQuantity,
    sku: row.sku,
    status: row.status,
    contactOnly: row.contactOnly,
    offersLocalDelivery: row.offersLocalDelivery,
    offersWarehousePickup: row.offersWarehousePickup,
    sellerId: row.sellerId,
    sellerName: seller?.name ?? null,
    sellerAvatar: seller?.avatar ?? null,
    tiers: tiers
      .slice()
      .sort((a, b) => a.minQuantity - b.minQuantity)
      .map((t) => ({
        id: t.id,
        minQuantity: t.minQuantity,
        maxQuantity: t.maxQuantity,
        unitPrice: t.unitPrice,
      })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Keep public launch metadata for menu / hub. */
router.get("/wholesale/launch", (_req, res): void => {
  const raw = process.env.FLEXA_WHOLESALE_PUBLIC_URL || process.env.FLEXA_WHOLESALE_BASE_URL || "";
  const url = raw.trim().replace(/\/$/, "") || null;
  res.json({
    configured: !!url,
    url,
    label: "Flexa Wholesale",
    native: true,
    publicLaunch: WHOLESALE_PUBLIC_LAUNCH,
  });
});

/* ─── Warehouses ─────────────────────────────────────────────────────────── */

router.get("/wholesale/warehouses", requireWholesaleAccess, async (req, res): Promise<void> => {
  const mine = String(req.query.mine ?? "") === "1";
  const verifiedOnly = String(req.query.verified ?? "1") !== "0";
  const adminAll = !!req.user?.isSuperAdmin && (String(req.query.admin ?? "") === "1" || !mine);
  const userId = req.userId!;
  const { limit, offset } = parsePagination(req.query);

  const resolved = resolveBuyerCountry({
    queryCountry: String(req.query.country ?? ""),
    profileCountry: req.user?.country ?? null,
    mine,
    admin: adminAll && !mine,
  });
  if (resolved.error) {
    res.status(400).json({ error: resolved.error });
    return;
  }
  const country = resolved.country;

  const conds = [];
  if (mine) {
    conds.push(eq(wholesaleWarehousesTable.sellerId, userId));
    // Sellers see all their depots (including pending / inactive) for management.
  } else if (adminAll && String(req.query.status ?? "").trim()) {
    conds.push(eq(wholesaleWarehousesTable.verificationStatus, String(req.query.status).trim()));
  } else {
    // Buyer browse: only active verified depots in the account country.
    conds.push(eq(wholesaleWarehousesTable.isActive, true));
    if (verifiedOnly) conds.push(eq(wholesaleWarehousesTable.verificationStatus, "verified"));
    if (!resolved.allCountries) {
      if (!country) {
        res.status(400).json({ error: "Your account country is required" });
        return;
      }
      conds.push(sql`lower(${wholesaleWarehousesTable.country}) = lower(${country})`);
    } else if (country) {
      conds.push(sql`lower(${wholesaleWarehousesTable.country}) = lower(${country})`);
    }
  }
  if (mine && country) {
    conds.push(sql`lower(${wholesaleWarehousesTable.country}) = lower(${country})`);
  }

  const whereClause = and(...conds);
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wholesaleWarehousesTable)
    .where(whereClause);
  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      warehouse: wholesaleWarehousesTable,
      sellerName: usersTable.name,
    })
    .from(wholesaleWarehousesTable)
    .leftJoin(usersTable, eq(wholesaleWarehousesTable.sellerId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(wholesaleWarehousesTable.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({
    warehouses: rows.map((r) => shapeWarehouse(r.warehouse, r.sellerName)),
    pagination: { limit, offset, total, hasMore: offset + rows.length < total },
    countryFilter: !mine && !adminAll ? country : country,
  });
});

router.post("/wholesale/warehouses", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = req.body ?? {};
  const name = String(body.name ?? "").trim().slice(0, 120);
  const country = String(body.country ?? "").trim().slice(0, 80);
  const city = String(body.city ?? "").trim().slice(0, 80);
  const address = String(body.address ?? "").trim().slice(0, 240);
  const region = body.region ? String(body.region).trim().slice(0, 80) : null;
  const latitude = body.latitude != null && body.latitude !== "" ? Number(body.latitude) : null;
  const longitude = body.longitude != null && body.longitude !== "" ? Number(body.longitude) : null;

  if (name.length < 2 || !country || !city) {
    res.status(400).json({ error: "Warehouse name, country, and city are required" });
    return;
  }
  if (latitude != null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
    res.status(400).json({ error: "Invalid latitude" });
    return;
  }
  if (longitude != null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    res.status(400).json({ error: "Invalid longitude" });
    return;
  }

  const [created] = await db
    .insert(wholesaleWarehousesTable)
    .values({
      sellerId: userId,
      name,
      country,
      region,
      city,
      address,
      latitude: latitude != null && Number.isFinite(latitude) ? latitude : null,
      longitude: longitude != null && Number.isFinite(longitude) ? longitude : null,
      verificationStatus: "pending",
      isActive: true,
    })
    .returning();

  res.status(201).json({ warehouse: shapeWarehouse(created) });
});

router.patch("/wholesale/warehouses/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.userId!;
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid warehouse id" });
    return;
  }

  const [existing] = await db.select().from(wholesaleWarehousesTable).where(eq(wholesaleWarehousesTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Warehouse not found" });
    return;
  }
  if (existing.sellerId !== userId && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }

  const body = req.body ?? {};
  const patch: Partial<typeof wholesaleWarehousesTable.$inferInsert> = {};

  // Admin verification
  if (body.verificationStatus != null && req.user?.isSuperAdmin) {
    const status = String(body.verificationStatus);
    if (!["pending", "verified", "rejected"].includes(status)) {
      res.status(400).json({ error: "Invalid verification status" });
      return;
    }
    patch.verificationStatus = status;
    if (status === "verified") {
      patch.verifiedAt = new Date();
      patch.verifiedBy = userId;
      patch.rejectionReason = null;
    } else if (status === "rejected") {
      patch.verifiedAt = null;
      patch.verifiedBy = null;
      patch.rejectionReason = body.rejectionReason ? String(body.rejectionReason).slice(0, 500) : "Rejected by admin";
    }
  }

  if (body.name != null) patch.name = String(body.name).trim().slice(0, 120);
  if (body.country != null) patch.country = String(body.country).trim().slice(0, 80);
  if (body.region != null) patch.region = String(body.region).trim().slice(0, 80) || null;
  if (body.city != null) patch.city = String(body.city).trim().slice(0, 80);
  if (body.address != null) patch.address = String(body.address).trim().slice(0, 240);
  if (body.isActive != null) patch.isActive = !!body.isActive;
  if (body.latitude != null) {
    const latitude = Number(body.latitude);
    patch.latitude = Number.isFinite(latitude) ? latitude : null;
  }
  if (body.longitude != null) {
    const longitude = Number(body.longitude);
    patch.longitude = Number.isFinite(longitude) ? longitude : null;
  }

  // Seller edits to location reset verification (ownership stays; admin re-checks).
  if (
    existing.sellerId === userId &&
    !req.user?.isSuperAdmin &&
    (patch.country != null || patch.city != null || patch.address != null || patch.latitude != null || patch.longitude != null) &&
    existing.verificationStatus === "verified"
  ) {
    patch.verificationStatus = "pending";
    patch.verifiedAt = null;
    patch.verifiedBy = null;
  }

  const [updated] = await db
    .update(wholesaleWarehousesTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(wholesaleWarehousesTable.id, id))
    .returning();

  res.json({ warehouse: shapeWarehouse(updated) });
});

/* ─── Products ───────────────────────────────────────────────────────────── */

router.get("/wholesale/products", requireWholesaleAccess, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  const category = String(req.query.category ?? "").trim().slice(0, 80) || null;
  const warehouseId = req.query.warehouseId != null ? Number(req.query.warehouseId) : null;
  const statusFilter = String(req.query.status ?? "").trim();
  const mine = String(req.query.mine ?? "") === "1";
  const isAdmin = !!req.user?.isSuperAdmin;
  const userId = req.userId!;
  const { limit, offset } = parsePagination(req.query);

  const resolved = resolveBuyerCountry({
    queryCountry: String(req.query.country ?? ""),
    profileCountry: req.user?.country ?? null,
    mine,
    admin: isAdmin && !mine,
  });
  if (resolved.error) {
    res.status(400).json({ error: resolved.error });
    return;
  }
  const country = resolved.country;

  const conds = [];
  if (mine) {
    conds.push(eq(wholesaleProductsTable.sellerId, userId));
    if (statusFilter && ["active", "draft", "archived"].includes(statusFilter)) {
      conds.push(eq(wholesaleProductsTable.status, statusFilter));
    }
    if (country) {
      conds.push(sql`lower(${wholesaleProductsTable.country}) = lower(${country})`);
    }
  } else {
    conds.push(eq(wholesaleProductsTable.status, "active"));
    if (!resolved.allCountries) {
      if (!country) {
        res.status(400).json({ error: "Your account country is required" });
        return;
      }
      // Buyer catalog: account country + verified/active owned warehouse only.
      conds.push(...buyerVisibleWarehouseConds(country));
    } else if (country) {
      conds.push(sql`lower(${wholesaleProductsTable.country}) = lower(${country})`);
    }
  }
  if (category) conds.push(eq(wholesaleProductsTable.category, category));
  if (warehouseId && Number.isFinite(warehouseId)) {
    conds.push(eq(wholesaleProductsTable.warehouseId, warehouseId));
  }
  if (q) {
    conds.push(sql`(${wholesaleProductsTable.title} ILIKE ${`%${q}%`} OR ${wholesaleProductsTable.description} ILIKE ${`%${q}%`})`);
  }

  const whereClause = and(...conds);
  const buyerJoinRequired = !mine && !resolved.allCountries;

  const countQuery = buyerJoinRequired
    ? db
        .select({ total: sql<number>`count(distinct ${wholesaleProductsTable.id})::int` })
        .from(wholesaleProductsTable)
        .innerJoin(
          wholesaleWarehousesTable,
          eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id),
        )
        .where(whereClause)
    : db.select({ total: sql<number>`count(*)::int` }).from(wholesaleProductsTable).where(whereClause);

  const [countRow] = await countQuery;
  const total = Number(countRow?.total ?? 0);

  const baseSelect = db
    .select({
      product: wholesaleProductsTable,
      sellerId: usersTable.id,
      sellerName: usersTable.name,
      sellerAvatar: usersTable.avatar,
      warehouse: wholesaleWarehousesTable,
    })
    .from(wholesaleProductsTable)
    .leftJoin(usersTable, eq(wholesaleProductsTable.sellerId, usersTable.id));

  const rows = await (buyerJoinRequired
    ? baseSelect.innerJoin(
        wholesaleWarehousesTable,
        eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id),
      )
    : baseSelect.leftJoin(
        wholesaleWarehousesTable,
        eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id),
      )
  )
    .where(whereClause)
    .orderBy(desc(wholesaleProductsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const productIds = rows.map((r) => r.product.id);
  const tiers = productIds.length
    ? await db.select().from(wholesalePriceTiersTable).where(inArray(wholesalePriceTiersTable.productId, productIds))
    : [];

  const tiersByProduct = new Map<number, typeof tiers>();
  for (const tier of tiers) {
    const list = tiersByProduct.get(tier.productId) ?? [];
    list.push(tier);
    tiersByProduct.set(tier.productId, list);
  }

  res.json({
    products: rows.map((r) =>
      shapeProduct(
        r.product,
        r.sellerId ? { id: r.sellerId, name: r.sellerName ?? "", avatar: r.sellerAvatar } : null,
        tiersByProduct.get(r.product.id) ?? [],
        r.warehouse,
      ),
    ),
    pagination: { limit, offset, total, hasMore: offset + rows.length < total },
    countryFilter: country,
  });
});

router.get("/wholesale/products/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [row] = await db
    .select({
      product: wholesaleProductsTable,
      sellerId: usersTable.id,
      sellerName: usersTable.name,
      sellerAvatar: usersTable.avatar,
      warehouse: wholesaleWarehousesTable,
    })
    .from(wholesaleProductsTable)
    .leftJoin(usersTable, eq(wholesaleProductsTable.sellerId, usersTable.id))
    .leftJoin(wholesaleWarehousesTable, eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id))
    .where(eq(wholesaleProductsTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const isOwner = row.product.sellerId === req.userId;
  const isAdmin = !!req.user?.isSuperAdmin;
  if (!isOwner && !isAdmin) {
    const buyerCountry = normalizeWholesaleCountry(req.user?.country ?? null);
    if (
      !buyerCountry ||
      !isWarehouseBuyerVisible({
        warehouse: row.warehouse,
        product: row.product,
        buyerCountry,
      })
    ) {
      res.status(404).json({
        error: "Product not available in your account country (requires an active verified warehouse)",
        countryFilter: buyerCountry,
      });
      return;
    }
  }

  const tiers = await db
    .select()
    .from(wholesalePriceTiersTable)
    .where(eq(wholesalePriceTiersTable.productId, id));

  res.json({
    product: shapeProduct(
      row.product,
      row.sellerId ? { id: row.sellerId, name: row.sellerName ?? "", avatar: row.sellerAvatar } : null,
      tiers,
      row.warehouse,
    ),
  });
});

router.post("/wholesale/products", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = req.body ?? {};
  const title = String(body.title ?? "").trim().slice(0, 160);
  const description = String(body.description ?? "").trim().slice(0, 4000);
  const unitPrice = Number(body.unitPrice);
  const minOrderQty = Math.max(1, Math.floor(Number(body.minOrderQty) || 1));
  const stockQuantity = Math.max(0, Math.floor(Number(body.stockQuantity) || 0));
  const images = Array.isArray(body.images)
    ? body.images.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 8)
    : [];
  const tiersInput = Array.isArray(body.tiers) ? body.tiers : [];
  const category = body.category ? String(body.category).trim().slice(0, 80) : null;
  const currency = String(body.currency ?? "USD").trim().slice(0, 8) || "USD";
  const status = String(body.status ?? "active");
  const warehouseId = body.warehouseId != null ? Number(body.warehouseId) : null;

  if (title.length < 3 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    res.status(400).json({ error: "Title and a valid unit price are required" });
    return;
  }
  if (!category) {
    res.status(400).json({ error: "Category is required" });
    return;
  }
  if (!["USD", "HTG", "EUR", "DOP"].includes(currency.toUpperCase()) && currency.length < 2) {
    res.status(400).json({ error: "Invalid currency" });
    return;
  }
  if (images.length < 1 && status === "active") {
    res.status(400).json({ error: "At least one product image is required to publish" });
    return;
  }
  if (!["active", "draft", "archived"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  if (minOrderQty < 1) {
    res.status(400).json({ error: "Minimum order quantity must be at least 1" });
    return;
  }

  let warehouse: typeof wholesaleWarehousesTable.$inferSelect | null = null;
  if (status === "active") {
    if (!warehouseId || !Number.isFinite(warehouseId)) {
      res.status(400).json({
        error: "A verified warehouse in the selling country is required before publishing",
      });
      return;
    }
    const [wh] = await db
      .select()
      .from(wholesaleWarehousesTable)
      .where(eq(wholesaleWarehousesTable.id, warehouseId))
      .limit(1);
    if (!wh || wh.sellerId !== userId) {
      res.status(400).json({ error: "Warehouse not found or not owned by you" });
      return;
    }
    if (wh.verificationStatus !== "verified" || !wh.isActive) {
      res.status(400).json({
        error: `Warehouse must be verified before publishing. Status: ${wh.verificationStatus}. Sellers living abroad can sell in a country only after that country's warehouse is verified.`,
      });
      return;
    }
    warehouse = wh;
  } else if (warehouseId && Number.isFinite(warehouseId)) {
    const [wh] = await db
      .select()
      .from(wholesaleWarehousesTable)
      .where(eq(wholesaleWarehousesTable.id, warehouseId))
      .limit(1);
    if (wh && wh.sellerId === userId) warehouse = wh;
  }

  const [created] = await db.insert(wholesaleProductsTable).values({
    sellerId: userId,
    warehouseId: warehouse?.id ?? null,
    title,
    description,
    unitPrice,
    currency: currency.toUpperCase(),
    images,
    category,
    country: warehouse?.country ?? (body.country ? String(body.country).slice(0, 80) : null),
    city: warehouse?.city ?? (body.city ? String(body.city).slice(0, 80) : null),
    warehouseName: warehouse?.name ?? (body.warehouseName ? String(body.warehouseName).slice(0, 120) : null),
    warehouseCity: warehouse?.city ?? (body.warehouseCity ? String(body.warehouseCity).slice(0, 80) : null),
    minOrderQty,
    wholesaleUnitType: String(body.wholesaleUnitType ?? "unit").slice(0, 40) || "unit",
    stockQuantity,
    sku: body.sku ? String(body.sku).slice(0, 60) : null,
    status,
    contactOnly: true,
    offersLocalDelivery: !!body.offersLocalDelivery,
    offersWarehousePickup: body.offersWarehousePickup !== false,
  }).returning();

  if (warehouse) {
    await db
      .insert(wholesaleInventoryTable)
      .values({
        warehouseId: warehouse.id,
        productId: created.id,
        stockQuantity,
      })
      .onConflictDoUpdate({
        target: [wholesaleInventoryTable.warehouseId, wholesaleInventoryTable.productId],
        set: { stockQuantity, updatedAt: new Date() },
      });
  }

  const tierRows = tiersInput
    .map((t: { minQuantity?: unknown; maxQuantity?: unknown; unitPrice?: unknown }) => ({
      productId: created.id,
      minQuantity: Math.max(1, Math.floor(Number(t.minQuantity) || 1)),
      maxQuantity: t.maxQuantity == null || t.maxQuantity === "" ? null : Math.floor(Number(t.maxQuantity)),
      unitPrice: Number(t.unitPrice),
    }))
    .filter((t) => Number.isFinite(t.unitPrice) && t.unitPrice > 0);

  let tiers: Array<typeof wholesalePriceTiersTable.$inferSelect> = [];
  if (tierRows.length) {
    tiers = await db.insert(wholesalePriceTiersTable).values(tierRows).returning();
  }

  const [seller] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  res.status(201).json({ product: shapeProduct(created, seller ?? null, tiers, warehouse) });
});

router.patch("/wholesale/products/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.userId!;
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [existing] = await db.select().from(wholesaleProductsTable).where(eq(wholesaleProductsTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (existing.sellerId !== userId && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Not allowed" });
    return;
  }

  const body = req.body ?? {};
  const patch: Partial<typeof wholesaleProductsTable.$inferInsert> = {};
  if (body.title != null) patch.title = String(body.title).trim().slice(0, 160);
  if (body.description != null) patch.description = String(body.description).trim().slice(0, 4000);
  if (body.unitPrice != null) {
    const unitPrice = Number(body.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      res.status(400).json({ error: "Invalid unit price" });
      return;
    }
    patch.unitPrice = unitPrice;
  }
  if (body.category != null) patch.category = String(body.category).trim().slice(0, 80) || null;
  if (body.currency != null) patch.currency = String(body.currency).trim().slice(0, 8).toUpperCase();
  if (body.status != null) {
    const status = String(body.status);
    if (!["active", "draft", "archived"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    if (status === "active") {
      const whId = body.warehouseId != null ? Number(body.warehouseId) : existing.warehouseId;
      if (!whId) {
        res.status(400).json({ error: "Verified warehouse required to publish" });
        return;
      }
      const [wh] = await db.select().from(wholesaleWarehousesTable).where(eq(wholesaleWarehousesTable.id, whId)).limit(1);
      if (!wh || wh.sellerId !== existing.sellerId || wh.verificationStatus !== "verified") {
        res.status(400).json({ error: "Warehouse must be verified in the selling country before publishing" });
        return;
      }
      patch.warehouseId = wh.id;
      patch.country = wh.country;
      patch.city = wh.city;
      patch.warehouseName = wh.name;
      patch.warehouseCity = wh.city;
      const imgs = Array.isArray(body.images) ? body.images : existing.images;
      if (!imgs?.length) {
        res.status(400).json({ error: "At least one product image is required to publish" });
        return;
      }
    }
    patch.status = status;
  }
  if (body.stockQuantity != null) patch.stockQuantity = Math.max(0, Math.floor(Number(body.stockQuantity) || 0));
  if (body.minOrderQty != null) patch.minOrderQty = Math.max(1, Math.floor(Number(body.minOrderQty) || 1));
  if (Array.isArray(body.images)) {
    patch.images = body.images.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 8);
  }
  if (body.warehouseId != null) {
    const whId = Number(body.warehouseId);
    const [wh] = await db.select().from(wholesaleWarehousesTable).where(eq(wholesaleWarehousesTable.id, whId)).limit(1);
    if (!wh || wh.sellerId !== existing.sellerId) {
      res.status(400).json({ error: "Invalid warehouse" });
      return;
    }
    patch.warehouseId = wh.id;
    patch.country = wh.country;
    patch.city = wh.city;
    patch.warehouseName = wh.name;
    patch.warehouseCity = wh.city;
  }

  const [updated] = await db
    .update(wholesaleProductsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(wholesaleProductsTable.id, id))
    .returning();

  if (patch.stockQuantity != null && updated.warehouseId) {
    await db
      .insert(wholesaleInventoryTable)
      .values({
        warehouseId: updated.warehouseId,
        productId: updated.id,
        stockQuantity: updated.stockQuantity,
      })
      .onConflictDoUpdate({
        target: [wholesaleInventoryTable.warehouseId, wholesaleInventoryTable.productId],
        set: { stockQuantity: updated.stockQuantity, updatedAt: new Date() },
      });
  }

  if (Array.isArray(body.tiers)) {
    await db.delete(wholesalePriceTiersTable).where(eq(wholesalePriceTiersTable.productId, id));
    const tierRows = body.tiers
      .map((t: { minQuantity?: unknown; maxQuantity?: unknown; unitPrice?: unknown }) => ({
        productId: id,
        minQuantity: Math.max(1, Math.floor(Number(t.minQuantity) || 1)),
        maxQuantity: t.maxQuantity == null || t.maxQuantity === "" ? null : Math.floor(Number(t.maxQuantity)),
        unitPrice: Number(t.unitPrice),
      }))
      .filter((t: { unitPrice: number }) => Number.isFinite(t.unitPrice) && t.unitPrice > 0);
    if (tierRows.length) {
      await db.insert(wholesalePriceTiersTable).values(tierRows);
    }
  }

  const tiers = await db.select().from(wholesalePriceTiersTable).where(eq(wholesalePriceTiersTable.productId, id));
  const [seller] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar })
    .from(usersTable)
    .where(eq(usersTable.id, updated.sellerId))
    .limit(1);
  let warehouse: typeof wholesaleWarehousesTable.$inferSelect | null = null;
  if (updated.warehouseId) {
    const [wh] = await db.select().from(wholesaleWarehousesTable).where(eq(wholesaleWarehousesTable.id, updated.warehouseId)).limit(1);
    warehouse = wh ?? null;
  }

  res.json({ product: shapeProduct(updated, seller ?? null, tiers, warehouse) });
});

/* ─── Inventory ──────────────────────────────────────────────────────────── */

router.get("/wholesale/inventory", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const warehouseId = req.query.warehouseId != null ? Number(req.query.warehouseId) : null;

  const myWarehouses = await db
    .select()
    .from(wholesaleWarehousesTable)
    .where(eq(wholesaleWarehousesTable.sellerId, userId));
  const whIds = myWarehouses.map((w) => w.id);
  if (!whIds.length) {
    res.json({ inventory: [], warehouses: [] });
    return;
  }

  const filterIds = warehouseId && whIds.includes(warehouseId) ? [warehouseId] : whIds;
  const rows = await db
    .select({
      inventory: wholesaleInventoryTable,
      product: wholesaleProductsTable,
      warehouse: wholesaleWarehousesTable,
    })
    .from(wholesaleInventoryTable)
    .innerJoin(wholesaleProductsTable, eq(wholesaleInventoryTable.productId, wholesaleProductsTable.id))
    .innerJoin(wholesaleWarehousesTable, eq(wholesaleInventoryTable.warehouseId, wholesaleWarehousesTable.id))
    .where(inArray(wholesaleInventoryTable.warehouseId, filterIds))
    .orderBy(desc(wholesaleInventoryTable.updatedAt))
    .limit(200);

  res.json({
    warehouses: myWarehouses.map((w) => shapeWarehouse(w)),
    inventory: rows.map((r) => ({
      id: r.inventory.id,
      warehouseId: r.inventory.warehouseId,
      warehouseName: r.warehouse.name,
      warehouseCountry: r.warehouse.country,
      productId: r.product.id,
      productTitle: r.product.title,
      sku: r.product.sku,
      stockQuantity: r.inventory.stockQuantity,
      productStatus: r.product.status,
      updatedAt: r.inventory.updatedAt.toISOString(),
    })),
  });
});

router.patch("/wholesale/inventory/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const userId = req.userId!;
  const stockQuantity = Math.max(0, Math.floor(Number(req.body?.stockQuantity) || 0));
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid inventory id" });
    return;
  }

  const [row] = await db
    .select({
      inventory: wholesaleInventoryTable,
      warehouse: wholesaleWarehousesTable,
    })
    .from(wholesaleInventoryTable)
    .innerJoin(wholesaleWarehousesTable, eq(wholesaleInventoryTable.warehouseId, wholesaleWarehousesTable.id))
    .where(eq(wholesaleInventoryTable.id, id))
    .limit(1);

  if (!row || row.warehouse.sellerId !== userId) {
    res.status(404).json({ error: "Inventory row not found" });
    return;
  }

  const [updated] = await db
    .update(wholesaleInventoryTable)
    .set({ stockQuantity, updatedAt: new Date() })
    .where(eq(wholesaleInventoryTable.id, id))
    .returning();

  // Keep product.stockQuantity in sync when this is the product's primary warehouse.
  const [product] = await db
    .select()
    .from(wholesaleProductsTable)
    .where(eq(wholesaleProductsTable.id, updated.productId))
    .limit(1);
  if (product?.warehouseId === updated.warehouseId) {
    await db
      .update(wholesaleProductsTable)
      .set({ stockQuantity, updatedAt: new Date() })
      .where(eq(wholesaleProductsTable.id, product.id));
  }

  res.json({ inventory: updated });
});

/* ─── Favorites ──────────────────────────────────────────────────────────── */

router.get("/wholesale/favorites", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { limit, offset } = parsePagination(req.query);
  const isAdmin = !!req.user?.isSuperAdmin;
  const resolved = resolveBuyerCountry({
    queryCountry: String(req.query.country ?? ""),
    profileCountry: req.user?.country ?? null,
    mine: false,
    admin: isAdmin,
  });
  if (resolved.error || (!resolved.country && !resolved.allCountries)) {
    res.status(400).json({ error: resolved.error || "Your account country is required" });
    return;
  }
  const country = resolved.country;

  const favConds = [
    eq(wholesaleFavoritesTable.userId, userId),
    eq(wholesaleProductsTable.status, "active"),
    ...(!resolved.allCountries && country ? buyerVisibleWarehouseConds(country) : []),
  ];
  const whereClause = and(...favConds);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wholesaleFavoritesTable)
    .innerJoin(wholesaleProductsTable, eq(wholesaleFavoritesTable.productId, wholesaleProductsTable.id))
    .innerJoin(wholesaleWarehousesTable, eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id))
    .where(whereClause);
  const total = Number(countRow?.total ?? 0);

  const rows = await db
    .select({
      favorite: wholesaleFavoritesTable,
      product: wholesaleProductsTable,
      sellerName: usersTable.name,
      sellerAvatar: usersTable.avatar,
      sellerId: usersTable.id,
      warehouse: wholesaleWarehousesTable,
    })
    .from(wholesaleFavoritesTable)
    .innerJoin(wholesaleProductsTable, eq(wholesaleFavoritesTable.productId, wholesaleProductsTable.id))
    .innerJoin(wholesaleWarehousesTable, eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id))
    .leftJoin(usersTable, eq(wholesaleProductsTable.sellerId, usersTable.id))
    .where(whereClause)
    .orderBy(desc(wholesaleFavoritesTable.createdAt))
    .limit(limit)
    .offset(offset);

  const productIds = rows.map((r) => r.product.id);
  const tiers = productIds.length
    ? await db.select().from(wholesalePriceTiersTable).where(inArray(wholesalePriceTiersTable.productId, productIds))
    : [];
  const tiersByProduct = new Map<number, typeof tiers>();
  for (const tier of tiers) {
    const list = tiersByProduct.get(tier.productId) ?? [];
    list.push(tier);
    tiersByProduct.set(tier.productId, list);
  }

  res.json({
    favorites: rows.map((r) => ({
      id: r.favorite.id,
      createdAt: r.favorite.createdAt.toISOString(),
      product: shapeProduct(
        r.product,
        r.sellerId ? { id: r.sellerId, name: r.sellerName ?? "", avatar: r.sellerAvatar } : null,
        tiersByProduct.get(r.product.id) ?? [],
        r.warehouse,
      ),
    })),
    pagination: { limit, offset, total, hasMore: offset + rows.length < total },
    countryFilter: country,
  });
});

router.post("/wholesale/favorites", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const productId = Number(req.body?.productId);
  if (!Number.isFinite(productId) || productId <= 0) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  const loaded = await loadProductWithWarehouse(productId);
  if (!loaded) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const { product, warehouse } = loaded;
  const buyerCountry = normalizeWholesaleCountry(req.user?.country ?? null);
  if (
    !req.user?.isSuperAdmin &&
    (!buyerCountry ||
      !isWarehouseBuyerVisible({ warehouse, product, buyerCountry }))
  ) {
    res.status(400).json({
      error: "Can only favorite products available in your account country with a verified warehouse",
      countryFilter: buyerCountry,
      productCountry: product.country,
    });
    return;
  }
  if (product.status !== "active") {
    res.status(400).json({ error: "Product is not active" });
    return;
  }
  const [existing] = await db
    .select()
    .from(wholesaleFavoritesTable)
    .where(and(eq(wholesaleFavoritesTable.userId, userId), eq(wholesaleFavoritesTable.productId, productId)))
    .limit(1);
  if (existing) {
    res.json({ favorite: existing });
    return;
  }
  const [created] = await db
    .insert(wholesaleFavoritesTable)
    .values({ userId, productId })
    .returning();
  res.status(201).json({ favorite: created });
});

router.delete("/wholesale/favorites/:productId", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const productId = Number(req.params.productId);
  if (!Number.isFinite(productId)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }
  await db
    .delete(wholesaleFavoritesTable)
    .where(and(eq(wholesaleFavoritesTable.userId, userId), eq(wholesaleFavoritesTable.productId, productId)));
  res.json({ ok: true });
});

/* ─── Inquiries / quotes ─────────────────────────────────────────────────── */

router.get("/wholesale/inquiries", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const role = String(req.query.role ?? "buyer");
  const isSeller = role === "seller";
  const buyerCountry = normalizeWholesaleCountry(req.user?.country ?? null);

  const conds = [
    isSeller
      ? eq(wholesaleInquiriesTable.sellerId, userId)
      : eq(wholesaleInquiriesTable.buyerId, userId),
  ];
  // Buyer inquiry list stays scoped to account country when product is linked.
  if (!isSeller && !req.user?.isSuperAdmin) {
    if (!buyerCountry) {
      res.status(400).json({ error: "Your account country is required" });
      return;
    }
    conds.push(
      sql`(${wholesaleInquiriesTable.productId} IS NULL OR lower(${wholesaleProductsTable.country}) = lower(${buyerCountry}))`,
    );
  }

  const rows = await db
    .select({
      inquiry: wholesaleInquiriesTable,
      productTitle: wholesaleProductsTable.title,
      productCountry: wholesaleProductsTable.country,
    })
    .from(wholesaleInquiriesTable)
    .leftJoin(wholesaleProductsTable, eq(wholesaleInquiriesTable.productId, wholesaleProductsTable.id))
    .where(and(...conds))
    .orderBy(desc(wholesaleInquiriesTable.createdAt))
    .limit(100);

  res.json({
    inquiries: rows.map((r) => ({
      id: r.inquiry.id,
      buyerId: r.inquiry.buyerId,
      sellerId: r.inquiry.sellerId,
      productId: r.inquiry.productId,
      productTitle: r.productTitle,
      productCountry: r.productCountry,
      qty: r.inquiry.qty,
      message: r.inquiry.message,
      status: r.inquiry.status,
      conversationId: r.inquiry.conversationId,
      createdAt: r.inquiry.createdAt.toISOString(),
    })),
  });
});

router.post("/wholesale/inquiries", requireWholesaleAccess, async (req, res): Promise<void> => {
  const buyerId = req.userId!;
  const sellerId = Number(req.body?.sellerId);
  const productId = req.body?.productId != null ? Number(req.body.productId) : null;
  const qty = Math.max(1, Math.floor(Number(req.body?.qty) || 1));
  const message = String(req.body?.message ?? "").trim().slice(0, 2000);

  if (!Number.isFinite(sellerId) || sellerId <= 0) {
    res.status(400).json({ error: "Invalid seller" });
    return;
  }
  if (buyerId === sellerId) {
    res.status(400).json({ error: "Cannot inquire with yourself" });
    return;
  }
  if (!productId || !Number.isFinite(productId)) {
    res.status(400).json({ error: "Product id is required for wholesale inquiries" });
    return;
  }

  const loaded = await loadProductWithWarehouse(productId);
  if (!loaded) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (loaded.product.sellerId !== sellerId) {
    res.status(400).json({ error: "Seller does not own this product" });
    return;
  }
  const buyerCountry = normalizeWholesaleCountry(req.user?.country ?? null);
  if (
    !req.user?.isSuperAdmin &&
    (!buyerCountry ||
      !isWarehouseBuyerVisible({
        warehouse: loaded.warehouse,
        product: loaded.product,
        buyerCountry,
      }))
  ) {
    res.status(400).json({
      error: "Inquiry blocked: product must be in your account country with an active verified warehouse",
    });
    return;
  }

  const [created] = await db
    .insert(wholesaleInquiriesTable)
    .values({
      buyerId,
      sellerId,
      productId,
      qty,
      message,
      status: "open",
    })
    .returning();

  res.status(201).json({ inquiry: created });
});

/* ─── Seller dashboard stats ─────────────────────────────────────────────── */

router.get("/wholesale/seller/stats", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [listingCounts] = await db
    .select({
      active: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'active')`,
      draft: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'draft')`,
      archived: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'archived')`,
    })
    .from(wholesaleProductsTable)
    .where(eq(wholesaleProductsTable.sellerId, userId));

  const [whCounts] = await db
    .select({
      total: sql<number>`count(*)`,
      verified: sql<number>`count(*) filter (where ${wholesaleWarehousesTable.verificationStatus} = 'verified')`,
    })
    .from(wholesaleWarehousesTable)
    .where(and(eq(wholesaleWarehousesTable.sellerId, userId), eq(wholesaleWarehousesTable.isActive, true)));

  const [inqCounts] = await db
    .select({ open: sql<number>`count(*) filter (where ${wholesaleInquiriesTable.status} = 'open')` })
    .from(wholesaleInquiriesTable)
    .where(eq(wholesaleInquiriesTable.sellerId, userId));

  const countries = await db
    .selectDistinct({ country: wholesaleWarehousesTable.country })
    .from(wholesaleWarehousesTable)
    .where(
      and(
        eq(wholesaleWarehousesTable.sellerId, userId),
        eq(wholesaleWarehousesTable.verificationStatus, "verified"),
        eq(wholesaleWarehousesTable.isActive, true),
      ),
    );

  res.json({
    listings: {
      active: Number(listingCounts?.active ?? 0),
      draft: Number(listingCounts?.draft ?? 0),
      archived: Number(listingCounts?.archived ?? 0),
    },
    warehouses: {
      total: Number(whCounts?.total ?? 0),
      verified: Number(whCounts?.verified ?? 0),
    },
    openInquiries: Number(inqCounts?.open ?? 0),
    sellableCountries: countries.map((c) => c.country).filter(Boolean),
  });
});

/**
 * Chat-only wholesale inquiry. Creates/reuses conversationType=wholesale
 * (listingId null) and seeds a "From Flexa Wholesale" opener.
 */
router.post("/wholesale/conversations", requireWholesaleAccess, async (req, res): Promise<void> => {
  const buyerId = req.userId!;
  const sellerId = Number(req.body?.sellerId);
  const productId = Number(req.body?.productId);
  const productTitle = String(req.body?.productTitle ?? "Wholesale product").trim().slice(0, 160);
  const qty = Math.max(1, Math.floor(Number(req.body?.qty) || 1));

  if (!Number.isFinite(sellerId) || sellerId <= 0) {
    res.status(400).json({ error: "Invalid seller" });
    return;
  }
  if (buyerId === sellerId) {
    res.status(400).json({ error: "Cannot chat with yourself" });
    return;
  }
  if (!Number.isFinite(productId) || productId <= 0) {
    res.status(400).json({ error: "Product id is required" });
    return;
  }

  const loaded = await loadProductWithWarehouse(productId);
  if (!loaded) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (loaded.product.sellerId !== sellerId) {
    res.status(400).json({ error: "Seller does not own this product" });
    return;
  }
  const buyerCountry = normalizeWholesaleCountry(req.user?.country ?? null);
  if (
    !req.user?.isSuperAdmin &&
    (!buyerCountry ||
      !isWarehouseBuyerVisible({
        warehouse: loaded.warehouse,
        product: loaded.product,
        buyerCountry,
      }))
  ) {
    res.status(400).json({
      error: "Chat blocked: product must be in your account country with an active verified warehouse",
    });
    return;
  }

  const title = loaded.product.title || productTitle;
  const marker = `[wholesale:${productId}]`;
  const [existing] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.buyerId, buyerId),
        eq(conversationsTable.sellerId, sellerId),
        eq(conversationsTable.conversationType, "wholesale"),
        sql`${conversationsTable.lastMessage} ILIKE ${`%${marker}%`}`,
      ),
    )
    .limit(1);

  if (existing) {
    res.json({ id: existing.id, conversationType: "wholesale", productId });
    return;
  }

  const [open] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.buyerId, buyerId),
        eq(conversationsTable.sellerId, sellerId),
        eq(conversationsTable.conversationType, "wholesale"),
      ),
    )
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(1);

  const opener = `From Flexa Wholesale · ${title} · qty ${qty} ${marker}`;

  let conversationId: number;
  if (open) {
    await db.insert(messagesTable).values({
      conversationId: open.id,
      senderId: buyerId,
      content: opener,
      messageType: "text",
    });
    await db
      .update(conversationsTable)
      .set({ lastMessage: opener, lastMessageAt: new Date() })
      .where(eq(conversationsTable.id, open.id));
    conversationId = open.id;
  } else {
    const [conv] = await db
      .insert(conversationsTable)
      .values({
        listingId: null,
        buyerId,
        sellerId,
        conversationType: "wholesale",
        lastMessage: opener,
        lastMessageAt: new Date(),
      })
      .returning();

    await db.insert(messagesTable).values({
      conversationId: conv.id,
      senderId: buyerId,
      content: opener,
      messageType: "text",
    });
    conversationId = conv.id;
  }

  await db.insert(wholesaleInquiriesTable).values({
    buyerId,
    sellerId,
    productId,
    qty,
    message: opener,
    status: "open",
    conversationId,
  });

  res.status(open ? 200 : 201).json({
    id: conversationId,
    conversationType: "wholesale",
    productId,
  });
});

/* ─── Admin overview ─────────────────────────────────────────────────────── */

router.get("/wholesale/admin/overview", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }

  const [products] = await db
    .select({
      active: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'active')`,
      draft: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'draft')`,
      total: sql<number>`count(*)`,
    })
    .from(wholesaleProductsTable);

  const [warehouses] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${wholesaleWarehousesTable.verificationStatus} = 'pending')`,
      verified: sql<number>`count(*) filter (where ${wholesaleWarehousesTable.verificationStatus} = 'verified')`,
      total: sql<number>`count(*)`,
    })
    .from(wholesaleWarehousesTable);

  const sellers = await db
    .selectDistinct({ sellerId: wholesaleWarehousesTable.sellerId })
    .from(wholesaleWarehousesTable);

  res.json({
    products: {
      active: Number(products?.active ?? 0),
      draft: Number(products?.draft ?? 0),
      total: Number(products?.total ?? 0),
    },
    warehouses: {
      pending: Number(warehouses?.pending ?? 0),
      verified: Number(warehouses?.verified ?? 0),
      total: Number(warehouses?.total ?? 0),
    },
    sellers: sellers.length,
    publicLaunch: WHOLESALE_PUBLIC_LAUNCH,
  });
});

export default router;
