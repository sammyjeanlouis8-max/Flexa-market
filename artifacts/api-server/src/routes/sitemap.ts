/**
 * Dynamic sitemap for product listings.
 *
 * GET /api/sitemap-listings.xml
 *   Returns a sitemap XML with up to 49 000 active listing URLs so Google
 *   can discover and index every product page on flexamarket.com.
 *
 * Cached for 4 hours (max-age) to avoid hitting the DB on every crawler visit.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

const BASE_URL = "https://flexamarket.com";
const CACHE_TTL = 4 * 60 * 60; // 4 hours in seconds

router.get("/sitemap-listings.xml", async (req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT id, updated_at
      FROM listings
      WHERE status IN ('available', 'sold')
        AND is_removed = false
      ORDER BY updated_at DESC
      LIMIT 49000
    `) as unknown as { id: number; updated_at: Date | string | null }[];

    const urlEntries = (rows as any[]).map((row: any) => {
      const lastmod = row.updated_at
        ? new Date(row.updated_at).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];
      return `  <url>\n    <loc>${BASE_URL}/listings/${row.id}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>`;

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", `public, max-age=${CACHE_TTL}, s-maxage=${CACHE_TTL}`);
    res.send(xml);
  } catch (err) {
    logger.error({ err }, "sitemap-listings generation failed");
    res.status(500).send("<?xml version=\"1.0\"?><urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\"/>");
  }
});

export default router;
