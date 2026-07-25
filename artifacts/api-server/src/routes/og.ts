import { Router } from "express";
import { db, listingsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * GET /api/og/:id
 *
 * Open Graph preview endpoint for WhatsApp, Facebook, Telegram, etc.
 * Social media crawlers hit this URL and get OG meta tags (title, image,
 * description, price).  Real users are instantly redirected to the SPA
 * listing page at /listings/:id via meta-refresh + JS.
 *
 * The WhatsApp share message embeds this URL so the chat shows a rich
 * product card instead of a bare link.
 */
router.get("/og/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).send("Invalid listing ID");
    return;
  }

  try {
    const rows = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        description: listingsTable.description,
        price: listingsTable.price,
        currency: listingsTable.currency,
        images: listingsTable.images,
        location: listingsTable.location,
        city: listingsTable.city,
        country: listingsTable.country,
        sellerName: usersTable.name,
      })
      .from(listingsTable)
      .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
      .where(eq(listingsTable.id, id))
      .limit(1);

    if (!rows.length) {
      res.status(404).send("Listing not found");
      return;
    }

    const listing = rows[0]!;

    const host = req.get("host") ?? "localhost";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const baseUrl = `${protocol}://${host}`;
    const listingUrl = `${baseUrl}/listings/${id}`;

    const currency = listing.currency ?? "USD";
    const priceNum = typeof listing.price === "number" ? listing.price : parseFloat(String(listing.price));
    const priceStr = currency === "HTG"
      ? `${priceNum.toLocaleString("fr-HT")} HTG`
      : `$${priceNum.toLocaleString("en-US")} USD`;

    const images = (listing.images as string[] | null) ?? [];
    let ogImage = images[0] ?? null;
    if (ogImage && ogImage.startsWith("/")) {
      ogImage = `${baseUrl}${ogImage}`;
    }
    if (!ogImage) {
      ogImage = `${baseUrl}/favicon.svg`;
    }

    const locationStr = listing.city ?? listing.location ?? listing.country ?? "";
    const sellerName = listing.sellerName ?? "FLEXA MARKET";

    const ogTitle = escapeHtml(listing.title);
    const ogDesc = escapeHtml(
      [
        priceStr,
        locationStr || null,
        listing.description ? listing.description.slice(0, 100) : null,
      ]
        .filter(Boolean)
        .join(" • ")
    );
    const ogImageSafe = escapeHtml(ogImage);
    const listingUrlSafe = escapeHtml(listingUrl);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");

    res.send(`<!DOCTYPE html>
<html lang="ht">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${ogTitle} — FLEXA MARKET</title>

  <!-- Open Graph — WhatsApp, Facebook, Telegram, iMessage -->
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="FLEXA MARKET" />
  <meta property="og:url" content="${listingUrlSafe}" />
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDesc}" />
  <meta property="og:image" content="${ogImageSafe}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${ogTitle}" />
  <meta property="og:locale" content="ht_HT" />

  <!-- Twitter / X Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDesc}" />
  <meta name="twitter:image" content="${ogImageSafe}" />

  <!-- Product schema -->
  <meta name="description" content="${ogDesc}" />
  <meta property="product:price:amount" content="${priceNum}" />
  <meta property="product:price:currency" content="${currency}" />

  <!-- Instant redirect for real users (crawlers ignore these) -->
  <meta http-equiv="refresh" content="0;url=${listingUrlSafe}" />
  <script>window.location.replace("${listingUrlSafe}");</script>
</head>
<body style="margin:0;padding:2rem;font-family:system-ui,sans-serif;background:#fff;color:#111;text-align:center">
  <p style="color:#aaa;font-size:13px;margin-bottom:12px">Ap redirijé ou sou FLEXA MARKET…</p>
  <a href="${listingUrlSafe}" style="color:#f97316;font-size:20px;font-weight:700;text-decoration:none;display:block">
    ${ogTitle}
  </a>
  <p style="color:#555;font-size:15px;margin-top:8px">${escapeHtml(priceStr)}</p>
  ${locationStr ? `<p style="color:#888;font-size:13px">${escapeHtml(locationStr)}</p>` : ""}
  <p style="color:#bbb;font-size:12px;margin-top:16px">Vendu pa ${escapeHtml(sellerName)} sou FLEXA MARKET</p>
</body>
</html>`);
  } catch (err) {
    logger.error({ err }, "OG preview endpoint error");
    res.status(500).send("Server error");
  }
});

export default router;
