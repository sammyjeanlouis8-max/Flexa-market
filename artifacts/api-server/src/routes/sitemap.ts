/**
 * Dynamic sitemaps for public catalog URLs.
 *
 * GET /api/sitemap-listings.xml  — approved, available products with usable images
 * GET /api/sitemap-categories.xml — every public parent category in the catalog
 *
 * Drafts, unapproved, suspended, and archived listings are excluded.
 * Admin / checkout / private routes are never listed here.
 * Empty categories stay in the categories sitemap so newly published
 * inventory is discoverable as soon as products appear.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const BASE_URL = "https://flexamarket.com";
const CACHE_TTL = 4 * 60 * 60; // 4 hours

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

function ymd(value: Date | string | null | undefined): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

router.get("/sitemap-listings.xml", async (_req, res): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT l.id, l.updated_at
      FROM listings l
      WHERE l.status = 'available'
        AND l.moderation_status = 'approved'
        AND COALESCE(l.lifecycle_status, 'published') NOT IN ('suspended', 'archived', 'draft', 'pending_review', 'rejected')
        AND EXISTS (
          SELECT 1
          FROM unnest(l.images) AS listing_image
          WHERE btrim(listing_image) <> ''
            AND listing_image NOT ILIKE '%placehold.co%'
            AND listing_image NOT ILIKE '%via.placeholder.com%'
        )
      ORDER BY l.updated_at DESC
      LIMIT 49000
    `);

    const rows = asRows<{ id: number; updated_at: Date | string | null }>(result);
    const urlEntries = rows.map((row) => {
      return `  <url>\n    <loc>${BASE_URL}/listings/${row.id}</loc>\n    <lastmod>${ymd(row.updated_at)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
    res.status(200).send(xml);
  } catch (err) {
    logger.error({ err }, "sitemap-listings generation failed");
    res.status(500).type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
    );
  }
});

router.get("/sitemap-categories.xml", async (_req, res): Promise<void> => {
  try {
    // Public marketplace category pages are parent slugs (/categories/{slug}).
    // Include every parent from the catalog — even with zero public products —
    // so crawlers keep stable category URLs as inventory changes.
    const result = await db.execute(sql`
      SELECT
        c.slug,
        COALESCE(
          (
            SELECT MAX(l.updated_at)
            FROM listings l
            WHERE l.category_id = c.id
              AND l.status = 'available'
              AND l.moderation_status = 'approved'
              AND COALESCE(l.lifecycle_status, 'published') NOT IN ('suspended', 'archived', 'draft', 'pending_review', 'rejected')
              AND EXISTS (
                SELECT 1
                FROM unnest(l.images) AS listing_image
                WHERE btrim(listing_image) <> ''
                  AND listing_image NOT ILIKE '%placehold.co%'
                  AND listing_image NOT ILIKE '%via.placeholder.com%'
              )
          ),
          NOW()
        ) AS updated_at
      FROM categories c
      WHERE c.parent_id IS NULL
        AND c.slug IS NOT NULL
        AND btrim(c.slug) <> ''
      ORDER BY c.slug ASC
      LIMIT 5000
    `);

    const rows = asRows<{ slug: string; updated_at: Date | string | null }>(result);
    const urlEntries = rows.map((row) => {
      const slug = encodeURIComponent(String(row.slug).trim());
      return `  <url>\n    <loc>${BASE_URL}/categories/${slug}</loc>\n    <lastmod>${ymd(row.updated_at)}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>0.7</priority>\n  </url>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
    res.status(200).send(xml);
  } catch (err) {
    logger.error({ err }, "sitemap-categories generation failed");
    res.status(500).type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`,
    );
  }
});

export default router;
