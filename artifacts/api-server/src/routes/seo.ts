/**
 * Crawlable SEO HTML for public product + category pages.
 * Mounted at /api/seo/* ; marketplace nginx proxies Googlebot (etc.) from
 * /listings/:id and /categories/:slug to these handlers.
 */

import { Router } from "express";
import { and, desc, eq, isNull, ne, or } from "drizzle-orm";
import { db, listingsTable, categoriesTable, usersTable } from "@workspace/db";
import { isPubliclyDiscoverable } from "../lib/productEligibility";
import { cleanListingImages, hasUsableListingImage, listingHasUsableImageSql } from "../lib/listingMedia";
import { logger } from "../lib/logger";
import {
  renderCategorySeoHtml,
  renderProductSeoHtml,
  type PublicListingSeoInput,
} from "../lib/seoPublicHtml";

const router = Router();

function listingSupportsDeliveryArea(row: {
  country?: string | null;
  city?: string | null;
  location?: string | null;
  deliveryMethod?: string | null;
  shippingCost?: number | null;
}): boolean {
  // Only expose area when the listing has a real geography or delivery/shipping signal.
  if (row.deliveryMethod && String(row.deliveryMethod).trim()) return true;
  if (typeof row.shippingCost === "number" && row.shippingCost >= 0) return true;
  if (row.country && String(row.country).trim()) return true;
  if (row.city && String(row.city).trim()) return true;
  if (row.location && String(row.location).trim()) return true;
  return false;
}

router.get("/seo/listings/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).type("html").send("<!DOCTYPE html><title>Invalid</title><p>Invalid listing id</p>");
    return;
  }

  try {
    const [row] = await db
      .select({
        listing: listingsTable,
        sellerName: usersTable.name,
        categoryName: categoriesTable.name,
        categorySlug: categoriesTable.slug,
      })
      .from(listingsTable)
      .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
      .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
      .where(eq(listingsTable.id, id))
      .limit(1);

    if (!row) {
      res.status(404).type("html").send("<!DOCTYPE html><title>Not found</title><p>Product not found</p>");
      return;
    }

    const listing = row.listing;
    if (
      !isPubliclyDiscoverable({
        status: listing.status,
        moderationStatus: listing.moderationStatus,
        lifecycleStatus: listing.lifecycleStatus,
      }) || !hasUsableListingImage(listing.images)
    ) {
      // Drafts / unapproved / removed stay out of the public catalog.
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      res.status(404).type("html").send("<!DOCTYPE html><title>Not found</title><p>Product not available</p>");
      return;
    }

    const images = cleanListingImages(listing.images);
    const payload: PublicListingSeoInput = {
      id: listing.id,
      title: listing.title,
      description: listing.description || listing.title,
      price: Number(listing.price) || 0,
      currency: listing.currency || "USD",
      status: listing.status,
      condition: listing.condition,
      images,
      country: listing.country,
      city: listing.city,
      location: listing.location,
      categoryName: row.categoryName,
      categorySlug: row.categorySlug,
      sellerName: row.sellerName,
      updatedAt: listing.updatedAt,
      deliverySupported: listingSupportsDeliveryArea(listing),
    };

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=86400");
    res.setHeader("X-Robots-Tag", "index, follow");
    res.status(200).send(renderProductSeoHtml(payload));
  } catch (err) {
    logger.error({ err, id }, "seo listing html failed");
    res.status(500).type("html").send("<!DOCTYPE html><title>Error</title><p>Temporary error</p>");
  }
});

router.get("/seo/categories/:slug", async (req, res): Promise<void> => {
  const slug = String(req.params.slug || "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) {
    res.status(400).type("html").send("<!DOCTYPE html><title>Invalid</title><p>Invalid category</p>");
    return;
  }

  try {
    const [category] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, slug))
      .limit(1);

    if (!category) {
      res.status(404).type("html").send("<!DOCTYPE html><title>Not found</title><p>Category not found</p>");
      return;
    }

    // Parent categories store inventory on category_id; child categories use
    // subcategory_id (with rare legacy rows still on category_id).
    const categoryMatch = category.parentId == null
      ? eq(listingsTable.categoryId, category.id)
      : or(
          eq(listingsTable.subcategoryId, category.id),
          eq(listingsTable.categoryId, category.id),
        );

    const products = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        price: listingsTable.price,
        currency: listingsTable.currency,
        images: listingsTable.images,
      })
      .from(listingsTable)
      .where(and(
        categoryMatch,
        eq(listingsTable.status, "available"),
        eq(listingsTable.moderationStatus, "approved"),
        ne(listingsTable.lifecycleStatus, "suspended"),
        ne(listingsTable.lifecycleStatus, "archived"),
        listingHasUsableImageSql(),
      ))
      .orderBy(desc(listingsTable.updatedAt))
      .limit(50);

    const excludeId = category.parentId == null ? category.id : category.parentId;
    const siblingCategories = await db
      .select({
        slug: categoriesTable.slug,
        name: categoriesTable.name,
      })
      .from(categoriesTable)
      .where(and(
        isNull(categoriesTable.parentId),
        ne(categoriesTable.id, excludeId),
      ))
      .orderBy(categoriesTable.name)
      .limit(30);

    // Always include the current parent in the nav for child pages.
    let parentNav: { slug: string; name: string } | null = null;
    if (category.parentId != null) {
      const [parent] = await db
        .select({ slug: categoriesTable.slug, name: categoriesTable.name })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, category.parentId))
        .limit(1);
      parentNav = parent ?? null;
    }

    const relatedCategories = [
      ...(parentNav && parentNav.slug !== category.slug ? [parentNav] : []),
      ...siblingCategories.filter((c) => c.slug !== category.slug),
    ].slice(0, 24);

    const seoInput = {
      slug: category.slug,
      name: category.name,
      description: (category as any).description ?? null,
      products: products.map((p) => ({
        id: p.id,
        title: p.title,
        price: Number(p.price) || 0,
        currency: p.currency || "USD",
        image: cleanListingImages(p.images)[0] ?? null,
      })),
      relatedCategories,
    };
    const html = renderCategorySeoHtml(seoInput);
    // Empty categories remain guest-browsable but stay out of the index
    // until at least one eligible public product exists.
    const robots = seoInput.products.length > 0 ? "index, follow" : "noindex, follow";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=600, stale-while-revalidate=86400");
    res.setHeader("X-Robots-Tag", robots);
    res.status(200).send(html);
  } catch (err) {
    logger.error({ err, slug }, "seo category html failed");
    res.status(500).type("html").send("<!DOCTYPE html><title>Error</title><p>Temporary error</p>");
  }
});

export default router;
