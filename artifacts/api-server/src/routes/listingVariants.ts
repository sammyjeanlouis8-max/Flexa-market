/**
 * Listing variants CRUD — additive multi-SKU API.
 * When the listing_variants table is not yet migrated, responses use
 * schemaReady:false / 503 VARIANTS_SCHEMA_PENDING (no invented stock).
 */
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, listingVariantsTable, listingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function isUndefinedTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return (
    e?.code === "42P01" ||
    /relation ["']?listing_variants["']? does not exist/i.test(String(e?.message ?? ""))
  );
}

function serialize(row: typeof listingVariantsTable.$inferSelect) {
  return {
    id: row.id,
    listingId: row.listingId,
    sku: row.sku,
    size: row.size,
    color: row.color,
    price: row.price,
    stockQuantity: row.stockQuantity,
    images: row.images ?? [],
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function assertSellerOwnsListing(listingId: number, userId: number) {
  const [listing] = await db
    .select({ id: listingsTable.id, sellerId: listingsTable.sellerId })
    .from(listingsTable)
    .where(eq(listingsTable.id, listingId))
    .limit(1);
  if (!listing) return { error: "Listing not found", status: 404 as const };
  if (listing.sellerId !== userId) {
    return { error: "Only the seller can manage variants", status: 403 as const };
  }
  return { listing };
}

/** GET /listings/:id/variants — public read of active variants */
router.get("/listings/:id/variants", async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  if (!listingId) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }
  try {
    const rows = await db
      .select()
      .from(listingVariantsTable)
      .where(
        and(
          eq(listingVariantsTable.listingId, listingId),
          eq(listingVariantsTable.isActive, true),
        ),
      );
    res.json({ schemaReady: true, variants: rows.map(serialize) });
  } catch (err) {
    if (isUndefinedTable(err)) {
      res.json({
        schemaReady: false,
        variants: [],
        code: "VARIANTS_SCHEMA_PENDING",
        error:
          "listing_variants table not migrated yet — use listing itemSize until approved",
      });
      return;
    }
    throw err;
  }
});

/** PUT /listings/:id/variants — replace seller variant set */
router.put("/listings/:id/variants", requireAuth, async (req, res): Promise<void> => {
  const listingId = parseInt(String(req.params.id), 10);
  if (!listingId) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }
  const ownership = await assertSellerOwnsListing(listingId, req.userId!);
  if ("error" in ownership && ownership.error) {
    res.status(ownership.status!).json({ error: ownership.error });
    return;
  }

  const incoming = Array.isArray(req.body?.variants) ? req.body.variants : null;
  if (!incoming) {
    res.status(400).json({ error: "variants array required" });
    return;
  }
  if (incoming.length > 40) {
    res.status(400).json({ error: "Too many variants (max 40)" });
    return;
  }

  const cleaned = incoming.map((v: any, idx: number) => {
    const size = typeof v.size === "string" ? v.size.trim() || null : null;
    const color = typeof v.color === "string" ? v.color.trim() || null : null;
    const sku =
      typeof v.sku === "string" && v.sku.trim()
        ? v.sku.trim().slice(0, 64)
        : null;
    const price =
      v.price === null || v.price === undefined || v.price === ""
        ? null
        : Number(v.price);
    const stockQuantity = Math.max(0, Math.floor(Number(v.stockQuantity) || 0));
    const images = Array.isArray(v.images)
      ? v.images.filter((u: unknown) => typeof u === "string").slice(0, 8)
      : [];
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      throw Object.assign(new Error(`Invalid price at index ${idx}`), {
        status: 400,
      });
    }
    if (!size && !color && !sku) {
      throw Object.assign(
        new Error(`Variant ${idx + 1} needs size, color, or sku`),
        { status: 400 },
      );
    }
    return {
      listingId,
      sku,
      size,
      color,
      price,
      stockQuantity,
      images,
      isActive: v.isActive === false ? false : true,
    };
  });

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(listingVariantsTable)
        .where(eq(listingVariantsTable.listingId, listingId));
      if (cleaned.length) {
        await tx.insert(listingVariantsTable).values(cleaned);
      }
    });
    const rows = await db
      .select()
      .from(listingVariantsTable)
      .where(eq(listingVariantsTable.listingId, listingId));
    res.json({ schemaReady: true, variants: rows.map(serialize) });
  } catch (err: any) {
    if (isUndefinedTable(err)) {
      res.status(503).json({
        schemaReady: false,
        code: "VARIANTS_SCHEMA_PENDING",
        error:
          "Apply artifacts/api-server/sql/2026-11-10_listing_variants.sql before enabling multi-SKU (requires explicit approval).",
      });
      return;
    }
    if (err?.status === 400) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
