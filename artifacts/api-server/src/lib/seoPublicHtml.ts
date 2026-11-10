/**
 * Crawlable public HTML + Product JSON-LD for Flexa Market SEO Phase 1.
 * Used by /api/seo/* so search engines receive real product content at
 * canonical /listings/:id and /categories/:slug URLs (via nginx bot proxy).
 */

export const SEO_BASE_URL = "https://flexamarket.com";
export const SEO_BRAND_NAME = "Flexa Market";

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function absoluteAssetUrl(url: string | null | undefined, baseUrl = SEO_BASE_URL): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${baseUrl}${trimmed}`;
  return `${baseUrl}/${trimmed}`;
}

export function formatPublicPrice(price: number, currency: string): string {
  const cur = (currency || "USD").toUpperCase();
  const n = Number.isFinite(price) ? price : 0;
  if (cur === "HTG") return `${n.toLocaleString("fr-HT")} HTG`;
  if (cur === "DOP") return `RD$ ${n.toLocaleString("es-DO")}`;
  return `$${n.toLocaleString("en-US")} ${cur}`;
}

export function truncateMeta(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

const CONDITION_MAP: Record<string, string> = {
  new: "https://schema.org/NewCondition",
  like_new: "https://schema.org/LikeNewCondition",
  good: "https://schema.org/UsedCondition",
  fair: "https://schema.org/UsedCondition",
  poor: "https://schema.org/DamagedCondition",
};

export type PublicListingSeoInput = {
  id: number;
  title: string;
  description: string;
  price: number;
  currency: string;
  status: string;
  condition?: string | null;
  images: string[];
  country?: string | null;
  city?: string | null;
  location?: string | null;
  categoryName?: string | null;
  categorySlug?: string | null;
  sellerName?: string | null;
  updatedAt?: Date | string | null;
  /** Only set when the listing actually supports delivery / local area. */
  deliverySupported?: boolean;
};

export function buildProductJsonLd(listing: PublicListingSeoInput, baseUrl = SEO_BASE_URL) {
  const url = `${baseUrl}/listings/${listing.id}`;
  const images = listing.images
    .map((img) => absoluteAssetUrl(img, baseUrl))
    .filter((x): x is string => !!x);
  const currency = (listing.currency || "USD").toUpperCase();
  const availability =
    listing.status === "available"
      ? "https://schema.org/InStock"
      : "https://schema.org/SoldOut";

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url,
    priceCurrency: currency,
    price: String(listing.price ?? 0),
    availability,
    itemCondition: CONDITION_MAP[listing.condition || ""] ?? "https://schema.org/UsedCondition",
  };

  if (listing.sellerName) {
    offer.seller = { "@type": "Organization", name: listing.sellerName };
  }

  // Only attach area when the listing supports a delivery / local area.
  if (listing.deliverySupported && listing.country) {
    offer.areaServed = {
      "@type": "Country",
      name: listing.country,
    };
  }

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: truncateMeta(listing.description || listing.title, 5000),
    url,
    image: images.length ? images : undefined,
    sku: `FM-${listing.id}`,
    brand: { "@type": "Brand", name: SEO_BRAND_NAME },
    offers: offer,
  };

  if (listing.categoryName) {
    jsonLd.category = listing.categoryName;
  }

  return jsonLd;
}

export function buildProductMetaDescription(listing: PublicListingSeoInput): string {
  const price = formatPublicPrice(listing.price, listing.currency);
  const parts = [listing.title, price];
  if (listing.deliverySupported) {
    const place = [listing.city, listing.country].filter(Boolean).join(", ");
    if (place) parts.push(place);
  }
  const body = listing.description?.trim()
    ? truncateMeta(listing.description, 90)
    : `Available on ${SEO_BRAND_NAME}.`;
  parts.push(body);
  return truncateMeta(parts.join(" — "), 160);
}

export function renderProductSeoHtml(listing: PublicListingSeoInput, baseUrl = SEO_BASE_URL): string {
  const url = `${baseUrl}/listings/${listing.id}`;
  const title = `${listing.title} — ${SEO_BRAND_NAME}`;
  const description = buildProductMetaDescription(listing);
  const images = listing.images
    .map((img) => absoluteAssetUrl(img, baseUrl))
    .filter((x): x is string => !!x);
  const primaryImage = images[0] ?? `${baseUrl}/opengraph.jpg`;
  const priceLabel = formatPublicPrice(listing.price, listing.currency);
  const availabilityLabel = listing.status === "available" ? "In stock" : "Sold out";
  const jsonLd = buildProductJsonLd(listing, baseUrl);
  const place =
    listing.deliverySupported
      ? [listing.city || listing.location, listing.country].filter(Boolean).join(", ")
      : "";
  const categoryHref = listing.categorySlug
    ? `${baseUrl}/categories/${encodeURIComponent(listing.categorySlug)}`
    : null;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />
  <link rel="canonical" href="${escapeHtml(url)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="${escapeHtml(SEO_BRAND_NAME)}" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(primaryImage)}" />
  <meta property="product:price:amount" content="${escapeHtml(String(listing.price ?? 0))}" />
  <meta property="product:price:currency" content="${escapeHtml((listing.currency || "USD").toUpperCase())}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(primaryImage)}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#fff;color:#111;line-height:1.45}
    main{max-width:720px;margin:0 auto;padding:1.25rem}
    img{max-width:100%;height:auto;border-radius:12px}
    .price{font-size:1.35rem;font-weight:800;margin:0.5rem 0}
    .muted{color:#555;font-size:0.95rem}
    a{color:#0f6b3c}
    .nav{font-size:0.85rem;margin-bottom:1rem}
  </style>
</head>
<body>
  <main>
    <p class="nav"><a href="${escapeHtml(baseUrl)}/">${escapeHtml(SEO_BRAND_NAME)}</a>${
      categoryHref && listing.categoryName
        ? ` · <a href="${escapeHtml(categoryHref)}">${escapeHtml(listing.categoryName)}</a>`
        : ""
    }</p>
    <article itemscope itemtype="https://schema.org/Product">
      <h1 itemprop="name">${escapeHtml(listing.title)}</h1>
      <p class="price"><span itemprop="offers" itemscope itemtype="https://schema.org/Offer"><meta itemprop="priceCurrency" content="${escapeHtml((listing.currency || "USD").toUpperCase())}" /><span itemprop="price">${escapeHtml(String(listing.price ?? 0))}</span> · ${escapeHtml(priceLabel)}</span> · ${escapeHtml(availabilityLabel)}</p>
      ${place ? `<p class="muted">${escapeHtml(place)}</p>` : ""}
      ${primaryImage ? `<p><img src="${escapeHtml(primaryImage)}" alt="${escapeHtml(listing.title)}" itemprop="image" width="800" height="800" /></p>` : ""}
      <div itemprop="description"><p>${escapeHtml(listing.description || listing.title).replace(/\n/g, "<br/>")}</p></div>
      <p class="muted"><a href="${escapeHtml(url)}">View product on ${escapeHtml(SEO_BRAND_NAME)}</a></p>
    </article>
  </main>
</body>
</html>`;
}

export type PublicCategorySeoInput = {
  slug: string;
  name: string;
  description?: string | null;
  products: Array<{
    id: number;
    title: string;
    price: number;
    currency: string;
    image?: string | null;
  }>;
  /** Other public marketplace categories for crawlable navigation. */
  relatedCategories?: Array<{ slug: string; name: string }>;
};

export function buildCategoryMetaDescription(category: PublicCategorySeoInput): string {
  if (category.description?.trim()) {
    return truncateMeta(category.description, 160);
  }
  const count = category.products.length;
  const isElectronics = category.slug === "electronics";
  if (isElectronics) {
    if (count > 0) {
      return truncateMeta(
        `Shop electronics and phones on ${SEO_BRAND_NAME} — ${count} public listing${count === 1 ? "" : "s"} with secure checkout in Haiti and other supported markets.`,
        160,
      );
    }
    return truncateMeta(
      `Browse electronics and phones on ${SEO_BRAND_NAME}. New approved listings appear here as sellers publish them.`,
      160,
    );
  }
  if (count > 0) {
    return truncateMeta(
      `Shop ${category.name} on ${SEO_BRAND_NAME} — ${count} public listing${count === 1 ? "" : "s"} with secure checkout across Haiti and other supported markets.`,
      160,
    );
  }
  return truncateMeta(
    `Browse ${category.name} on ${SEO_BRAND_NAME}. New approved listings appear here as sellers publish them.`,
    160,
  );
}

export function buildCategorySeoTitle(category: PublicCategorySeoInput): string {
  if (category.slug === "electronics") {
    return `Electronics & phones — Buy & sell on ${SEO_BRAND_NAME}`;
  }
  return `${category.name} — Buy & sell on ${SEO_BRAND_NAME}`;
}

export function renderCategorySeoHtml(category: PublicCategorySeoInput, baseUrl = SEO_BASE_URL): string {
  const url = `${baseUrl}/categories/${encodeURIComponent(category.slug)}`;
  const title = buildCategorySeoTitle(category);
  const description = buildCategoryMetaDescription(category);
  const itemList = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    description,
    url,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: category.products.length,
      itemListElement: category.products.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${baseUrl}/listings/${p.id}`,
        name: p.title,
      })),
    },
  };

  const links = category.products.map((p) => {
    const href = `${baseUrl}/listings/${p.id}`;
    const img = absoluteAssetUrl(p.image, baseUrl);
    const price = formatPublicPrice(p.price, p.currency);
    return `<li style="margin:0 0 1rem;list-style:none;border-bottom:1px solid #eee;padding-bottom:1rem">
  ${img ? `<a href="${escapeHtml(href)}"><img src="${escapeHtml(img)}" alt="${escapeHtml(p.title)}" width="160" height="160" style="border-radius:8px;object-fit:cover" /></a>` : ""}
  <p style="margin:0.4rem 0 0"><a href="${escapeHtml(href)}"><strong>${escapeHtml(p.title)}</strong></a></p>
  <p style="margin:0.2rem 0;color:#555">${escapeHtml(price)}</p>
</li>`;
  }).join("\n");

  const related = (category.relatedCategories ?? [])
    .filter((c) => c.slug && c.slug !== category.slug)
    .map((c) => {
      const href = `${baseUrl}/categories/${encodeURIComponent(c.slug)}`;
      return `<li style="display:inline;margin-right:0.75rem"><a href="${escapeHtml(href)}">${escapeHtml(c.name)}</a></li>`;
    })
    .join(" ");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${escapeHtml(url)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(url)}" />
  <script type="application/ld+json">${JSON.stringify(itemList)}</script>
  <style>
    body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#fff;color:#111}
    main{max-width:720px;margin:0 auto;padding:1.25rem}
    a{color:#0f6b3c}
  </style>
</head>
<body>
  <main>
    <p><a href="${escapeHtml(baseUrl)}/">${escapeHtml(SEO_BRAND_NAME)}</a> · <a href="${escapeHtml(baseUrl)}/search">Search</a>${
      category.slug !== "electronics"
        ? ` · <a href="${escapeHtml(baseUrl)}/categories/electronics">Electronics &amp; phones</a>`
        : ""
    }</p>
    <h1>${escapeHtml(category.name)}</h1>
    <p>${escapeHtml(description)}</p>
    <ul style="padding:0;margin:1.5rem 0">
${links || "<li>No public products in this category right now.</li>"}
    </ul>
    ${related ? `<nav aria-label="Categories"><p class="muted" style="color:#555">More categories</p><ul style="padding:0;margin:0.5rem 0 0;list-style:none">${related}</ul></nav>` : ""}
  </main>
</body>
</html>`;
}
