import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  wholesalePriceTiersTable,
  wholesaleProductsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

/** Keep in sync with marketplace `WHOLESALE_PUBLIC_LAUNCH` until public launch. */
const WHOLESALE_PUBLIC_LAUNCH = false;

async function requireWholesaleAccess(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], next: Parameters<typeof requireAuth>[2]) {
  await requireAuth(req, res, async () => {
    if (WHOLESALE_PUBLIC_LAUNCH || req.user?.isSuperAdmin) {
      next();
      return;
    }
    res.status(403).json({ error: "Wholesale preview is Super Admin only" });
  });
}

function shapeProduct(
  row: typeof wholesaleProductsTable.$inferSelect,
  seller: { id: number; name: string; avatar: string | null } | null,
  tiers: Array<typeof wholesalePriceTiersTable.$inferSelect> = [],
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
    warehouseName: row.warehouseName,
    warehouseCity: row.warehouseCity,
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

router.get("/wholesale/products", requireWholesaleAccess, async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "").trim().slice(0, 100);
  const country = String(req.query.country ?? "").trim().slice(0, 80) || null;
  const mine = String(req.query.mine ?? "") === "1";
  const userId = req.userId!;

  const conds = [eq(wholesaleProductsTable.status, "active")];
  if (mine) conds.push(eq(wholesaleProductsTable.sellerId, userId));
  if (country) conds.push(eq(wholesaleProductsTable.country, country));
  if (q) {
    conds.push(sql`(${wholesaleProductsTable.title} ILIKE ${`%${q}%`} OR ${wholesaleProductsTable.description} ILIKE ${`%${q}%`})`);
  }

  const rows = await db
    .select({
      product: wholesaleProductsTable,
      sellerId: usersTable.id,
      sellerName: usersTable.name,
      sellerAvatar: usersTable.avatar,
    })
    .from(wholesaleProductsTable)
    .leftJoin(usersTable, eq(wholesaleProductsTable.sellerId, usersTable.id))
    .where(and(...conds))
    .orderBy(desc(wholesaleProductsTable.createdAt))
    .limit(100);

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
      ),
    ),
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
    })
    .from(wholesaleProductsTable)
    .leftJoin(usersTable, eq(wholesaleProductsTable.sellerId, usersTable.id))
    .where(eq(wholesaleProductsTable.id, id))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Product not found" });
    return;
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

  if (title.length < 3 || !Number.isFinite(unitPrice) || unitPrice <= 0) {
    res.status(400).json({ error: "Title and a valid unit price are required" });
    return;
  }

  const [created] = await db.insert(wholesaleProductsTable).values({
    sellerId: userId,
    title,
    description,
    unitPrice,
    currency: String(body.currency ?? "USD").slice(0, 8) || "USD",
    images,
    category: body.category ? String(body.category).slice(0, 80) : null,
    country: body.country ? String(body.country).slice(0, 80) : (req.user?.country ?? null),
    city: body.city ? String(body.city).slice(0, 80) : null,
    warehouseName: body.warehouseName ? String(body.warehouseName).slice(0, 120) : null,
    warehouseCity: body.warehouseCity ? String(body.warehouseCity).slice(0, 80) : null,
    minOrderQty,
    wholesaleUnitType: String(body.wholesaleUnitType ?? "unit").slice(0, 40) || "unit",
    stockQuantity,
    sku: body.sku ? String(body.sku).slice(0, 60) : null,
    status: "active",
    // Wholesale is chat-only: no checkout / buy button on Market.
    contactOnly: true,
    offersLocalDelivery: !!body.offersLocalDelivery,
    offersWarehousePickup: body.offersWarehousePickup !== false,
  }).returning();

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

  res.status(201).json({ product: shapeProduct(created, seller ?? null, tiers) });
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
  if (body.status != null) {
    const status = String(body.status);
    if (!["active", "draft", "archived"].includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }
    patch.status = status;
  }
  if (body.stockQuantity != null) patch.stockQuantity = Math.max(0, Math.floor(Number(body.stockQuantity) || 0));
  if (body.minOrderQty != null) patch.minOrderQty = Math.max(1, Math.floor(Number(body.minOrderQty) || 1));
  if (Array.isArray(body.images)) {
    patch.images = body.images.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 8);
  }

  const [updated] = await db
    .update(wholesaleProductsTable)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(wholesaleProductsTable.id, id))
    .returning();

  const tiers = await db.select().from(wholesalePriceTiersTable).where(eq(wholesalePriceTiersTable.productId, id));
  const [seller] = await db
    .select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar })
    .from(usersTable)
    .where(eq(usersTable.id, updated.sellerId))
    .limit(1);

  res.json({ product: shapeProduct(updated, seller ?? null, tiers) });
});

export default router;
