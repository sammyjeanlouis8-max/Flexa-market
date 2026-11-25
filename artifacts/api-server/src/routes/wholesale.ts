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
  wholesaleSellerProfilesTable,
  wholesaleDocumentsTable,
  wholesaleBlocksTable,
  wholesaleDisputesTable,
  wholesaleNotificationsTable,
  wholesaleTeamMembersTable,
  wholesaleCompareSessionsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
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
    if (WHOLESALE_PUBLIC_LAUNCH || req.user?.isSuperAdmin) {
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
    videos: row.videos ?? [],
    featured: !!row.featured,
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
  const city = String(req.query.city ?? "").trim().slice(0, 80) || null;
  const warehouseId = req.query.warehouseId != null ? Number(req.query.warehouseId) : null;
  const statusFilter = String(req.query.status ?? "").trim();
  const featuredOnly = String(req.query.featured ?? "") === "1";
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
  if (city) conds.push(sql`lower(${wholesaleProductsTable.city}) = lower(${city})`);
  if (featuredOnly) conds.push(eq(wholesaleProductsTable.featured, true));
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
  const videos = Array.isArray(body.videos)
    ? body.videos.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 4)
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
    res.status(400).json({ error: "At least one valid product photo is required to publish (videos do not count)" });
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
    videos,
    featured: !!body.featured,
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
        res.status(400).json({ error: "At least one valid product photo is required to publish (videos do not count)" });
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
  if (Array.isArray(body.videos)) {
    patch.videos = body.videos.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 4);
  }
  if (body.featured != null) patch.featured = !!body.featured;
  if (body.offersLocalDelivery != null) patch.offersLocalDelivery = !!body.offersLocalDelivery;
  if (body.offersWarehousePickup != null) patch.offersWarehousePickup = !!body.offersWarehousePickup;
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
      quotedUnitPrice: r.inquiry.quotedUnitPrice,
      conversationId: r.inquiry.conversationId,
      createdAt: r.inquiry.createdAt.toISOString(),
      updatedAt: r.inquiry.updatedAt.toISOString(),
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

/* ─── Seller profile / onboarding / settings / hours / plans ─────────────── */

async function getOrCreateSellerProfile(userId: number) {
  const [existing] = await db
    .select()
    .from(wholesaleSellerProfilesTable)
    .where(eq(wholesaleSellerProfilesTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(wholesaleSellerProfilesTable)
    .values({ userId })
    .returning();
  return created;
}

function shapeSellerProfile(row: typeof wholesaleSellerProfilesTable.$inferSelect) {
  let hours: Record<string, unknown> = {};
  let settings: Record<string, unknown> = {};
  try {
    hours = JSON.parse(row.hoursJson || "{}");
  } catch {
    hours = {};
  }
  try {
    settings = JSON.parse(row.settingsJson || "{}");
  } catch {
    settings = {};
  }
  return {
    id: row.id,
    userId: row.userId,
    businessName: row.businessName,
    bio: row.bio,
    phone: row.phone,
    website: row.website,
    plan: row.plan,
    onboardingComplete: row.onboardingComplete,
    verificationStatus: row.verificationStatus,
    hours,
    settings,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/wholesale/seller/profile", requireWholesaleAccess, async (req, res): Promise<void> => {
  const profile = await getOrCreateSellerProfile(req.userId!);
  res.json({ profile: shapeSellerProfile(profile) });
});

router.patch("/wholesale/seller/profile", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  await getOrCreateSellerProfile(userId);
  const body = req.body ?? {};
  const patch: Partial<typeof wholesaleSellerProfilesTable.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.businessName != null) patch.businessName = String(body.businessName).slice(0, 160);
  if (body.bio != null) patch.bio = String(body.bio).slice(0, 2000);
  if (body.phone != null) patch.phone = String(body.phone).slice(0, 40) || null;
  if (body.website != null) patch.website = String(body.website).slice(0, 200) || null;
  if (body.plan != null) {
    const plan = String(body.plan).slice(0, 40);
    if (!["free", "growth", "pro"].includes(plan)) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }
    patch.plan = plan;
  }
  if (body.onboardingComplete != null) patch.onboardingComplete = !!body.onboardingComplete;
  if (body.hours != null) {
    patch.hoursJson = JSON.stringify(body.hours ?? {});
  }
  if (body.settings != null) {
    patch.settingsJson = JSON.stringify(body.settings ?? {});
  }
  if (body.verificationStatus != null && req.user?.isSuperAdmin) {
    patch.verificationStatus = String(body.verificationStatus).slice(0, 40);
  }
  const [updated] = await db
    .update(wholesaleSellerProfilesTable)
    .set(patch)
    .where(eq(wholesaleSellerProfilesTable.userId, userId))
    .returning();
  res.json({ profile: shapeSellerProfile(updated) });
});

router.get("/wholesale/seller/analytics", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [productStats] = await db
    .select({
      active: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'active')`,
      draft: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'draft')`,
      featured: sql<number>`count(*) filter (where ${wholesaleProductsTable.featured} = true)`,
      totalStock: sql<number>`coalesce(sum(${wholesaleProductsTable.stockQuantity}), 0)`,
    })
    .from(wholesaleProductsTable)
    .where(eq(wholesaleProductsTable.sellerId, userId));

  const [inquiryStats] = await db
    .select({
      open: sql<number>`count(*) filter (where ${wholesaleInquiriesTable.status} = 'open')`,
      quoted: sql<number>`count(*) filter (where ${wholesaleInquiriesTable.status} = 'quoted')`,
      closed: sql<number>`count(*) filter (where ${wholesaleInquiriesTable.status} = 'closed')`,
      total: sql<number>`count(*)`,
    })
    .from(wholesaleInquiriesTable)
    .where(eq(wholesaleInquiriesTable.sellerId, userId));

  const warehouses = await db
    .select()
    .from(wholesaleWarehousesTable)
    .where(eq(wholesaleWarehousesTable.sellerId, userId));

  const profile = await getOrCreateSellerProfile(userId);

  res.json({
    products: {
      active: Number(productStats?.active ?? 0),
      draft: Number(productStats?.draft ?? 0),
      featured: Number(productStats?.featured ?? 0),
      totalStock: Number(productStats?.totalStock ?? 0),
    },
    inquiries: {
      open: Number(inquiryStats?.open ?? 0),
      quoted: Number(inquiryStats?.quoted ?? 0),
      closed: Number(inquiryStats?.closed ?? 0),
      total: Number(inquiryStats?.total ?? 0),
    },
    warehouses: {
      total: warehouses.length,
      verified: warehouses.filter((w) => w.verificationStatus === "verified").length,
      pending: warehouses.filter((w) => w.verificationStatus === "pending").length,
    },
    plan: profile.plan,
    verificationStatus: profile.verificationStatus,
  });
});

router.get("/wholesale/seller/customers", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select({
      buyerId: wholesaleInquiriesTable.buyerId,
      buyerName: usersTable.name,
      buyerAvatar: usersTable.avatar,
      inquiries: sql<number>`count(*)::int`,
      lastAt: sql<Date>`max(${wholesaleInquiriesTable.createdAt})`,
    })
    .from(wholesaleInquiriesTable)
    .innerJoin(usersTable, eq(usersTable.id, wholesaleInquiriesTable.buyerId))
    .where(eq(wholesaleInquiriesTable.sellerId, userId))
    .groupBy(wholesaleInquiriesTable.buyerId, usersTable.name, usersTable.avatar)
    .orderBy(sql`max(${wholesaleInquiriesTable.createdAt}) desc`)
    .limit(100);

  res.json({
    customers: rows.map((r) => ({
      buyerId: r.buyerId,
      buyerName: r.buyerName,
      buyerAvatar: r.buyerAvatar,
      inquiries: Number(r.inquiries),
      lastAt: r.lastAt,
    })),
  });
});

router.get("/wholesale/seller/earnings", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const closed = await db
    .select()
    .from(wholesaleInquiriesTable)
    .where(
      and(
        eq(wholesaleInquiriesTable.sellerId, userId),
        eq(wholesaleInquiriesTable.status, "closed"),
      ),
    )
    .orderBy(desc(wholesaleInquiriesTable.updatedAt))
    .limit(100);

  let estimatedTotal = 0;
  const deals = closed.map((row) => {
    const unit = row.quotedUnitPrice ?? 0;
    const line = unit * row.qty;
    estimatedTotal += line;
    return {
      id: row.id,
      productId: row.productId,
      qty: row.qty,
      quotedUnitPrice: row.quotedUnitPrice,
      estimatedTotal: line,
      updatedAt: row.updatedAt,
    };
  });

  res.json({
    estimatedTotal,
    closedDeals: deals.length,
    deals,
    note: "Flexa Wholesale is chat-only — earnings are estimated from closed quoted inquiries, not checkout payments.",
  });
});

/* ─── Documents ──────────────────────────────────────────────────────────── */

router.get("/wholesale/seller/documents", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(wholesaleDocumentsTable)
    .where(eq(wholesaleDocumentsTable.sellerId, userId))
    .orderBy(desc(wholesaleDocumentsTable.createdAt));
  res.json({ documents: rows });
});

router.post("/wholesale/seller/documents", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const body = req.body ?? {};
  const title = String(body.title ?? "").trim().slice(0, 160);
  const fileUrl = String(body.fileUrl ?? "").trim();
  const docType = String(body.docType ?? "business").trim().slice(0, 40) || "business";
  if (!title || !fileUrl) {
    res.status(400).json({ error: "Title and fileUrl are required" });
    return;
  }
  const [created] = await db
    .insert(wholesaleDocumentsTable)
    .values({ sellerId: userId, title, fileUrl, docType, status: "pending" })
    .returning();
  res.status(201).json({ document: created });
});

router.delete("/wholesale/seller/documents/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [existing] = await db
    .select()
    .from(wholesaleDocumentsTable)
    .where(eq(wholesaleDocumentsTable.id, id))
    .limit(1);
  if (!existing || existing.sellerId !== req.userId) {
    res.status(404).json({ error: "Document not found" });
    return;
  }
  await db.delete(wholesaleDocumentsTable).where(eq(wholesaleDocumentsTable.id, id));
  res.json({ ok: true });
});

/* ─── Team ───────────────────────────────────────────────────────────────── */

router.get("/wholesale/seller/team", requireWholesaleAccess, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(wholesaleTeamMembersTable)
    .where(eq(wholesaleTeamMembersTable.ownerId, req.userId!))
    .orderBy(desc(wholesaleTeamMembersTable.createdAt));
  res.json({ members: rows });
});

router.post("/wholesale/seller/team", requireWholesaleAccess, async (req, res): Promise<void> => {
  const email = String(req.body?.email ?? "").trim().toLowerCase().slice(0, 160);
  const role = String(req.body?.role ?? "staff").trim().slice(0, 40) || "staff";
  if (!email || !email.includes("@")) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }
  const [memberUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`lower(${usersTable.email}) = ${email}`)
    .limit(1);
  const [created] = await db
    .insert(wholesaleTeamMembersTable)
    .values({
      ownerId: req.userId!,
      email,
      role,
      memberUserId: memberUser?.id ?? null,
      status: memberUser ? "active" : "invited",
    })
    .returning();
  res.status(201).json({ member: created });
});

router.delete("/wholesale/seller/team/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db
    .select()
    .from(wholesaleTeamMembersTable)
    .where(eq(wholesaleTeamMembersTable.id, id))
    .limit(1);
  if (!existing || existing.ownerId !== req.userId) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  await db.delete(wholesaleTeamMembersTable).where(eq(wholesaleTeamMembersTable.id, id));
  res.json({ ok: true });
});

/* ─── Compare ────────────────────────────────────────────────────────────── */

router.get("/wholesale/compare", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const country = normalizeWholesaleCountry(req.user?.country ?? null);
  const rows = await db
    .select({
      id: wholesaleCompareSessionsTable.id,
      productId: wholesaleCompareSessionsTable.productId,
      createdAt: wholesaleCompareSessionsTable.createdAt,
      product: wholesaleProductsTable,
    })
    .from(wholesaleCompareSessionsTable)
    .innerJoin(
      wholesaleProductsTable,
      eq(wholesaleCompareSessionsTable.productId, wholesaleProductsTable.id),
    )
    .where(eq(wholesaleCompareSessionsTable.userId, userId))
    .orderBy(desc(wholesaleCompareSessionsTable.createdAt))
    .limit(8);

  const products = rows
    .map((r) => r.product)
    .filter((p) => {
      if (!country) return true;
      return countriesMatch(p.country, country);
    });

  res.json({ products: products.map((p) => shapeProduct(p, null)) });
});

router.post("/wholesale/compare", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const productId = Number(req.body?.productId);
  if (!Number.isFinite(productId)) {
    res.status(400).json({ error: "productId required" });
    return;
  }
  const existing = await db
    .select()
    .from(wholesaleCompareSessionsTable)
    .where(eq(wholesaleCompareSessionsTable.userId, userId));
  if (existing.length >= 4 && !existing.some((e) => e.productId === productId)) {
    res.status(400).json({ error: "Compare list is full (max 4). Remove one first." });
    return;
  }
  await db
    .insert(wholesaleCompareSessionsTable)
    .values({ userId, productId })
    .onConflictDoNothing({
      target: [wholesaleCompareSessionsTable.userId, wholesaleCompareSessionsTable.productId],
    });
  res.status(201).json({ ok: true });
});

router.delete("/wholesale/compare/:productId", requireWholesaleAccess, async (req, res): Promise<void> => {
  const productId = Number(req.params.productId);
  await db
    .delete(wholesaleCompareSessionsTable)
    .where(
      and(
        eq(wholesaleCompareSessionsTable.userId, req.userId!),
        eq(wholesaleCompareSessionsTable.productId, productId),
      ),
    );
  res.json({ ok: true });
});

/* ─── Blocks ─────────────────────────────────────────────────────────────── */

router.get("/wholesale/blocks", requireWholesaleAccess, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: wholesaleBlocksTable.id,
      blockedId: wholesaleBlocksTable.blockedId,
      reason: wholesaleBlocksTable.reason,
      createdAt: wholesaleBlocksTable.createdAt,
      blockedName: usersTable.name,
      blockedAvatar: usersTable.avatar,
    })
    .from(wholesaleBlocksTable)
    .innerJoin(usersTable, eq(usersTable.id, wholesaleBlocksTable.blockedId))
    .where(eq(wholesaleBlocksTable.blockerId, req.userId!))
    .orderBy(desc(wholesaleBlocksTable.createdAt));
  res.json({ blocks: rows });
});

router.post("/wholesale/blocks", requireWholesaleAccess, async (req, res): Promise<void> => {
  const blockedId = Number(req.body?.blockedId);
  const reason = String(req.body?.reason ?? "").trim().slice(0, 400);
  if (!Number.isFinite(blockedId) || blockedId === req.userId) {
    res.status(400).json({ error: "Valid blockedId required" });
    return;
  }
  const [created] = await db
    .insert(wholesaleBlocksTable)
    .values({ blockerId: req.userId!, blockedId, reason })
    .onConflictDoNothing({
      target: [wholesaleBlocksTable.blockerId, wholesaleBlocksTable.blockedId],
    })
    .returning();
  res.status(201).json({ block: created ?? null, ok: true });
});

router.delete("/wholesale/blocks/:blockedId", requireWholesaleAccess, async (req, res): Promise<void> => {
  const blockedId = Number(req.params.blockedId);
  await db
    .delete(wholesaleBlocksTable)
    .where(
      and(
        eq(wholesaleBlocksTable.blockerId, req.userId!),
        eq(wholesaleBlocksTable.blockedId, blockedId),
      ),
    );
  res.json({ ok: true });
});

/* ─── Disputes ───────────────────────────────────────────────────────────── */

router.get("/wholesale/disputes", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const isAdmin = !!req.user?.isSuperAdmin;
  const rows = isAdmin
    ? await db
        .select()
        .from(wholesaleDisputesTable)
        .orderBy(desc(wholesaleDisputesTable.createdAt))
        .limit(100)
    : await db
        .select()
        .from(wholesaleDisputesTable)
        .where(
          sql`${wholesaleDisputesTable.openerId} = ${userId} OR ${wholesaleDisputesTable.againstId} = ${userId}`,
        )
        .orderBy(desc(wholesaleDisputesTable.createdAt))
        .limit(100);
  res.json({ disputes: rows });
});

router.post("/wholesale/disputes", requireWholesaleAccess, async (req, res): Promise<void> => {
  const againstId = Number(req.body?.againstId);
  const reason = String(req.body?.reason ?? "").trim().slice(0, 1000);
  const productId = req.body?.productId != null ? Number(req.body.productId) : null;
  const inquiryId = req.body?.inquiryId != null ? Number(req.body.inquiryId) : null;
  if (!Number.isFinite(againstId) || !reason) {
    res.status(400).json({ error: "againstId and reason are required" });
    return;
  }
  const [created] = await db
    .insert(wholesaleDisputesTable)
    .values({
      openerId: req.userId!,
      againstId,
      reason,
      productId: Number.isFinite(productId as number) ? productId : null,
      inquiryId: Number.isFinite(inquiryId as number) ? inquiryId : null,
    })
    .returning();
  res.status(201).json({ dispute: created });
});

router.patch("/wholesale/disputes/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  const id = Number(req.params.id);
  const status = String(req.body?.status ?? "").trim();
  if (!["open", "resolved", "rejected"].includes(status)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }
  const [updated] = await db
    .update(wholesaleDisputesTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(wholesaleDisputesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ dispute: updated });
});

/* ─── Notifications ──────────────────────────────────────────────────────── */

router.get("/wholesale/notifications", requireWholesaleAccess, async (req, res): Promise<void> => {
  const { limit, offset } = parsePagination(req.query);
  const userId = req.userId!;
  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(wholesaleNotificationsTable)
    .where(eq(wholesaleNotificationsTable.userId, userId));
  const rows = await db
    .select()
    .from(wholesaleNotificationsTable)
    .where(eq(wholesaleNotificationsTable.userId, userId))
    .orderBy(desc(wholesaleNotificationsTable.createdAt))
    .limit(limit)
    .offset(offset);
  const total = Number(countRow?.total ?? 0);
  res.json({
    notifications: rows,
    pagination: { limit, offset, total, hasMore: offset + rows.length < total },
  });
});

router.post("/wholesale/notifications/read", requireWholesaleAccess, async (req, res): Promise<void> => {
  const ids = Array.isArray(req.body?.ids)
    ? req.body.ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n))
    : [];
  const userId = req.userId!;
  if (ids.length === 0) {
    await db
      .update(wholesaleNotificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(wholesaleNotificationsTable.userId, userId),
          sql`${wholesaleNotificationsTable.readAt} IS NULL`,
        ),
      );
  } else {
    await db
      .update(wholesaleNotificationsTable)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(wholesaleNotificationsTable.userId, userId),
          inArray(wholesaleNotificationsTable.id, ids),
        ),
      );
  }
  res.json({ ok: true });
});

/* ─── Inquiry detail + quote ─────────────────────────────────────────────── */

router.get("/wholesale/inquiries/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [row] = await db
    .select()
    .from(wholesaleInquiriesTable)
    .where(eq(wholesaleInquiriesTable.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Inquiry not found" });
    return;
  }
  const userId = req.userId!;
  if (row.buyerId !== userId && row.sellerId !== userId && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  let product = null;
  if (row.productId) {
    const [p] = await db
      .select()
      .from(wholesaleProductsTable)
      .where(eq(wholesaleProductsTable.id, row.productId))
      .limit(1);
    if (p) product = shapeProduct(p, null);
  }
  const [buyer] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar })
    .from(usersTable)
    .where(eq(usersTable.id, row.buyerId))
    .limit(1);
  const [seller] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar })
    .from(usersTable)
    .where(eq(usersTable.id, row.sellerId))
    .limit(1);

  res.json({
    inquiry: {
      ...row,
      product,
      buyer,
      seller,
    },
  });
});

router.patch("/wholesale/inquiries/:id", requireWholesaleAccess, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [existing] = await db
    .select()
    .from(wholesaleInquiriesTable)
    .where(eq(wholesaleInquiriesTable.id, id))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Inquiry not found" });
    return;
  }
  const userId = req.userId!;
  const isSeller = existing.sellerId === userId;
  const isBuyer = existing.buyerId === userId;
  if (!isSeller && !isBuyer && !req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const body = req.body ?? {};
  const patch: Partial<typeof wholesaleInquiriesTable.$inferInsert> = { updatedAt: new Date() };
  if (body.status != null) {
    const status = String(body.status);
    if (!["open", "quoted", "closed"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    if (status === "quoted" && !isSeller && !req.user?.isSuperAdmin) {
      res.status(403).json({ error: "Only the seller can quote" });
      return;
    }
    patch.status = status;
  }
  if (body.quotedUnitPrice != null) {
    if (!isSeller && !req.user?.isSuperAdmin) {
      res.status(403).json({ error: "Only the seller can set a quote" });
      return;
    }
    const price = Number(body.quotedUnitPrice);
    if (!Number.isFinite(price) || price <= 0) {
      res.status(400).json({ error: "Invalid quote price" });
      return;
    }
    patch.quotedUnitPrice = price;
    if (!patch.status) patch.status = "quoted";
  }
  const [updated] = await db
    .update(wholesaleInquiriesTable)
    .set(patch)
    .where(eq(wholesaleInquiriesTable.id, id))
    .returning();

  if (patch.status === "quoted" || patch.quotedUnitPrice != null) {
    await db.insert(wholesaleNotificationsTable).values({
      userId: existing.buyerId,
      title: "New wholesale quote",
      body: `Seller quoted inquiry #${id}`,
      kind: "quote",
      href: `/wholesale/quotes/${id}`,
    });
  }
  if (patch.status === "closed") {
    await db.insert(wholesaleNotificationsTable).values({
      userId: isBuyer ? existing.sellerId : existing.buyerId,
      title: "Wholesale deal closed",
      body: `Inquiry #${id} marked closed`,
      kind: "deal",
      href: `/wholesale/deals`,
    });
  }

  res.json({ inquiry: updated });
});

/* ─── Storefront (seller store) ──────────────────────────────────────────── */

router.get("/wholesale/stores/:sellerId", requireWholesaleAccess, async (req, res): Promise<void> => {
  const sellerId = Number(req.params.sellerId);
  if (!Number.isFinite(sellerId)) {
    res.status(400).json({ error: "Invalid seller id" });
    return;
  }
  const [seller] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar: usersTable.avatar,
      country: usersTable.country,
    })
    .from(usersTable)
    .where(eq(usersTable.id, sellerId))
    .limit(1);
  if (!seller) {
    res.status(404).json({ error: "Seller not found" });
    return;
  }
  const [profile] = await db
    .select()
    .from(wholesaleSellerProfilesTable)
    .where(eq(wholesaleSellerProfilesTable.userId, sellerId))
    .limit(1);

  const buyerCountry = normalizeWholesaleCountry(req.user?.country ?? null);
  const isAdmin = !!req.user?.isSuperAdmin;
  const { limit, offset } = parsePagination(req.query);

  const conds = [
    eq(wholesaleProductsTable.sellerId, sellerId),
    eq(wholesaleProductsTable.status, "active"),
  ];
  if (!isAdmin) {
    if (!buyerCountry) {
      res.status(400).json({ error: "Your account country is required" });
      return;
    }
    conds.push(...buyerVisibleWarehouseConds(buyerCountry));
  }

  const whereClause = and(...conds);
  const [countRow] = await db
    .select({ total: sql<number>`count(distinct ${wholesaleProductsTable.id})::int` })
    .from(wholesaleProductsTable)
    .innerJoin(
      wholesaleWarehousesTable,
      eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id),
    )
    .where(whereClause);
  const total = Number(countRow?.total ?? 0);
  const productRows = await db
    .select({ product: wholesaleProductsTable })
    .from(wholesaleProductsTable)
    .innerJoin(
      wholesaleWarehousesTable,
      eq(wholesaleProductsTable.warehouseId, wholesaleWarehousesTable.id),
    )
    .where(whereClause)
    .orderBy(desc(wholesaleProductsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const warehouseConds = [
    eq(wholesaleWarehousesTable.sellerId, sellerId),
    eq(wholesaleWarehousesTable.verificationStatus, "verified"),
    eq(wholesaleWarehousesTable.isActive, true),
  ];
  if (buyerCountry && !isAdmin) {
    warehouseConds.push(sql`lower(${wholesaleWarehousesTable.country}) = lower(${buyerCountry})`);
  }
  const warehouses = await db
    .select()
    .from(wholesaleWarehousesTable)
    .where(and(...warehouseConds));

  res.json({
    seller,
    profile: profile ? shapeSellerProfile(profile) : null,
    warehouses: warehouses.map(shapeWarehouse),
    products: productRows.map((r) => shapeProduct(r.product, null)),
    pagination: { limit, offset, total, hasMore: offset + productRows.length < total },
  });
});

/* ─── Media library (seller product assets) ──────────────────────────────── */

router.get("/wholesale/seller/media", requireWholesaleAccess, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const products = await db
    .select({
      id: wholesaleProductsTable.id,
      title: wholesaleProductsTable.title,
      images: wholesaleProductsTable.images,
      videos: wholesaleProductsTable.videos,
      status: wholesaleProductsTable.status,
      updatedAt: wholesaleProductsTable.updatedAt,
    })
    .from(wholesaleProductsTable)
    .where(eq(wholesaleProductsTable.sellerId, userId))
    .orderBy(desc(wholesaleProductsTable.updatedAt))
    .limit(100);

  const photos: Array<{ productId: number; title: string; url: string; status: string }> = [];
  const videos: Array<{ productId: number; title: string; url: string; status: string }> = [];
  for (const p of products) {
    for (const url of p.images ?? []) {
      photos.push({ productId: p.id, title: p.title, url, status: p.status });
    }
    for (const url of p.videos ?? []) {
      videos.push({ productId: p.id, title: p.title, url, status: p.status });
    }
  }
  res.json({ photos, videos });
});

/* ─── Admin extras ───────────────────────────────────────────────────────── */

router.get("/wholesale/admin/categories", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  const rows = await db
    .select({
      category: wholesaleProductsTable.category,
      count: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${wholesaleProductsTable.status} = 'active')::int`,
    })
    .from(wholesaleProductsTable)
    .where(sql`${wholesaleProductsTable.category} IS NOT NULL`)
    .groupBy(wholesaleProductsTable.category)
    .orderBy(sql`count(*) desc`);
  res.json({
    categories: rows.map((r) => ({
      category: r.category,
      count: Number(r.count),
      active: Number(r.active),
    })),
  });
});

router.get("/wholesale/admin/countries", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  const productCountries = await db
    .select({
      country: wholesaleProductsTable.country,
      products: sql<number>`count(*)::int`,
    })
    .from(wholesaleProductsTable)
    .where(sql`${wholesaleProductsTable.country} IS NOT NULL`)
    .groupBy(wholesaleProductsTable.country);

  const warehouseCountries = await db
    .select({
      country: wholesaleWarehousesTable.country,
      warehouses: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where ${wholesaleWarehousesTable.verificationStatus} = 'verified')::int`,
    })
    .from(wholesaleWarehousesTable)
    .groupBy(wholesaleWarehousesTable.country);

  const map = new Map<string, { country: string; products: number; warehouses: number; verified: number }>();
  for (const r of productCountries) {
    const key = (r.country || "").toLowerCase();
    map.set(key, {
      country: r.country || "",
      products: Number(r.products),
      warehouses: 0,
      verified: 0,
    });
  }
  for (const r of warehouseCountries) {
    const key = (r.country || "").toLowerCase();
    const prev = map.get(key) ?? { country: r.country, products: 0, warehouses: 0, verified: 0 };
    prev.warehouses = Number(r.warehouses);
    prev.verified = Number(r.verified);
    map.set(key, prev);
  }
  res.json({ countries: [...map.values()].sort((a, b) => a.country.localeCompare(b.country)) });
});

router.get("/wholesale/admin/sellers", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  const rows = await db
    .select({
      sellerId: wholesaleWarehousesTable.sellerId,
      sellerName: usersTable.name,
      sellerAvatar: usersTable.avatar,
      warehouses: sql<number>`count(*)::int`,
      verified: sql<number>`count(*) filter (where ${wholesaleWarehousesTable.verificationStatus} = 'verified')::int`,
    })
    .from(wholesaleWarehousesTable)
    .innerJoin(usersTable, eq(usersTable.id, wholesaleWarehousesTable.sellerId))
    .groupBy(wholesaleWarehousesTable.sellerId, usersTable.name, usersTable.avatar)
    .orderBy(sql`count(*) desc`)
    .limit(200);

  const profiles = await db.select().from(wholesaleSellerProfilesTable);
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  res.json({
    sellers: rows.map((r) => {
      const profile = profileMap.get(r.sellerId);
      return {
        sellerId: r.sellerId,
        sellerName: r.sellerName,
        sellerAvatar: r.sellerAvatar,
        warehouses: Number(r.warehouses),
        verified: Number(r.verified),
        plan: profile?.plan ?? "free",
        verificationStatus: profile?.verificationStatus ?? "unverified",
        onboardingComplete: profile?.onboardingComplete ?? false,
      };
    }),
  });
});

router.get("/wholesale/admin/chats", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  const rows = await db
    .select({
      id: conversationsTable.id,
      buyerId: conversationsTable.buyerId,
      sellerId: conversationsTable.sellerId,
      lastMessage: conversationsTable.lastMessage,
      lastMessageAt: conversationsTable.lastMessageAt,
      conversationType: conversationsTable.conversationType,
    })
    .from(conversationsTable)
    .where(eq(conversationsTable.conversationType, "wholesale"))
    .orderBy(desc(conversationsTable.lastMessageAt))
    .limit(100);
  res.json({ conversations: rows });
});

router.get("/wholesale/admin/flags", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  // Flagged = active products with zero photos, or missing warehouse (data integrity)
  const flagged = await db
    .select()
    .from(wholesaleProductsTable)
    .where(
      and(
        eq(wholesaleProductsTable.status, "active"),
        sql`(cardinality(${wholesaleProductsTable.images}) = 0 OR ${wholesaleProductsTable.warehouseId} IS NULL)`,
      ),
    )
    .orderBy(desc(wholesaleProductsTable.updatedAt))
    .limit(100);
  res.json({ products: flagged.map((p) => shapeProduct(p, null)) });
});

router.get("/wholesale/admin/reports", requireWholesaleAccess, async (req, res): Promise<void> => {
  if (!req.user?.isSuperAdmin) {
    res.status(403).json({ error: "Super Admin only" });
    return;
  }
  const disputes = await db
    .select()
    .from(wholesaleDisputesTable)
    .orderBy(desc(wholesaleDisputesTable.createdAt))
    .limit(100);
  const [overview] = await db
    .select({
      openDisputes: sql<number>`count(*) filter (where ${wholesaleDisputesTable.status} = 'open')`,
      total: sql<number>`count(*)`,
    })
    .from(wholesaleDisputesTable);
  res.json({
    overview: {
      openDisputes: Number(overview?.openDisputes ?? 0),
      totalDisputes: Number(overview?.total ?? 0),
    },
    disputes,
  });
});

export default router;
