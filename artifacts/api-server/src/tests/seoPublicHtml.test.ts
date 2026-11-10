import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildCategoryMetaDescription,
  buildCategorySeoTitle,
  buildProductJsonLd,
  buildProductMetaDescription,
  escapeHtml,
  formatPublicPrice,
  renderCategorySeoHtml,
  renderProductSeoHtml,
} from "../lib/seoPublicHtml";

describe("seoPublicHtml helpers", () => {
  const sample = {
    id: 1,
    title: "Multi-Head Body Massager",
    description: "Deep tissue portable massager for home use in Haiti.",
    price: 98.99,
    currency: "USD",
    status: "available",
    condition: "new",
    images: ["/objects/massager.jpg"],
    country: "Haiti",
    city: "Carrefour",
    categoryName: "Sports & Outdoors",
    categorySlug: "sports-outdoors",
    sellerName: "Maya",
    deliverySupported: true,
  };

  it("builds unique meta description with price and optional place", () => {
    const desc = buildProductMetaDescription(sample);
    expect(desc).toContain("Multi-Head Body Massager");
    expect(desc).toContain("98.99");
    expect(desc).toContain("Carrefour");
    expect(desc.length).toBeLessThanOrEqual(160);
  });

  it("omits location from meta when delivery area is unsupported", () => {
    const desc = buildProductMetaDescription({ ...sample, deliverySupported: false });
    expect(desc).not.toContain("Carrefour");
  });

  it("emits Product JSON-LD matching visible offer fields", () => {
    const json = buildProductJsonLd(sample) as any;
    expect(json["@type"]).toBe("Product");
    expect(json.name).toBe(sample.title);
    expect(json.offers.price).toBe("98.99");
    expect(json.offers.priceCurrency).toBe("USD");
    expect(json.offers.availability).toBe("https://schema.org/InStock");
    expect(json.offers.areaServed.name).toBe("Haiti");
    expect(json.url).toBe("https://flexamarket.com/listings/1");
  });

  it("renders crawlable product HTML with canonical, image, price, and JSON-LD", () => {
    const html = renderProductSeoHtml(sample);
    expect(html).toContain("<h1");
    expect(html).toContain("Multi-Head Body Massager");
    expect(html).toContain('rel="canonical" href="https://flexamarket.com/listings/1"');
    expect(html).toContain("application/ld+json");
    expect(html).toContain("https://schema.org/InStock");
    expect(html).toContain(escapeHtml(formatPublicPrice(98.99, "USD")));
    expect(html).toContain("/objects/massager.jpg");
  });

  it("renders category HTML with ordinary product links", () => {
    const html = renderCategorySeoHtml({
      slug: "fashion",
      name: "Fashion",
      products: [
        { id: 32, title: "tshot for man", price: 25, currency: "USD", image: "/a.jpg" },
        { id: 45, title: "Boucle d’oreille", price: 30, currency: "USD", image: null },
      ],
      relatedCategories: [
        { slug: "electronics", name: "Electronics" },
        { slug: "shoes", name: "Shoes" },
      ],
    });
    expect(html).toContain('href="https://flexamarket.com/listings/32"');
    expect(html).toContain('href="https://flexamarket.com/listings/45"');
    expect(html).toContain("tshot for man");
    expect(html).toContain('rel="canonical" href="https://flexamarket.com/categories/fashion"');
    expect(html).toContain('href="https://flexamarket.com/categories/electronics"');
    expect(html).toContain("2 public listings");
    expect(html).toContain("Flexa Market");
  });

  it("keeps empty category pages indexable with unique meta", () => {
    const html = renderCategorySeoHtml({
      slug: "real-estate",
      name: "Real Estate",
      products: [],
    });
    expect(html).toContain('rel="canonical" href="https://flexamarket.com/categories/real-estate"');
    expect(html).toContain("No public products in this category right now.");
    expect(buildCategoryMetaDescription({
      slug: "real-estate",
      name: "Real Estate",
      products: [],
    })).toContain("Real Estate");
  });

  it("targets phone intents on the electronics category page", () => {
    expect(buildCategorySeoTitle({
      slug: "electronics",
      name: "Electronics",
      products: [],
    })).toContain("Electronics & phones");
    expect(buildCategoryMetaDescription({
      slug: "electronics",
      name: "Electronics",
      products: [{ id: 1, title: "Phone", price: 10, currency: "USD" }],
    })).toMatch(/electronics and phones/i);
  });
});

describe("SEO catalog wiring contracts", () => {
  it("exposes seo + full-catalog sitemap routes and bot nginx proxy", () => {
    const index = readFileSync(resolve(__dirname, "../routes/index.ts"), "utf8");
    const sitemap = readFileSync(resolve(__dirname, "../routes/sitemap.ts"), "utf8");
    const seo = readFileSync(resolve(__dirname, "../routes/seo.ts"), "utf8");
    const nginx = readFileSync(
      resolve(__dirname, "../../../marketplace/nginx.seo.conf"),
      "utf8",
    );
    const robots = readFileSync(
      resolve(__dirname, "../../../marketplace/public/robots.txt"),
      "utf8",
    );
    const smIndex = readFileSync(
      resolve(__dirname, "../../../marketplace/public/sitemap.xml"),
      "utf8",
    );

    expect(index).toMatch(/seoRouter/);
    expect(seo).toMatch(/\/seo\/listings\/:id/);
    expect(seo).toMatch(/\/seo\/categories\/:slug/);
    expect(seo).toMatch(/isPubliclyDiscoverable/);
    expect(seo).toMatch(/subcategoryId/);
    expect(sitemap).toMatch(/moderation_status = 'approved'/);
    expect(sitemap).not.toMatch(/is_removed/);
    expect(sitemap).toMatch(/sitemap-categories\.xml/);
    expect(sitemap).toMatch(/parent_id IS NULL/);
    expect(sitemap).not.toMatch(/INNER JOIN listings/);
    expect(nginx).toMatch(/flexa_is_seo_bot/);
    expect(nginx).toMatch(/\/api\/seo\/listings\/\$listing_id/);
    expect(nginx).toMatch(/\/api\/seo\/categories\/\$category_slug/);
    expect(nginx).toMatch(/https:\/\/flexamarket\.com/);
    expect(robots).toMatch(/Allow: \/listings\//);
    expect(robots).toMatch(/Disallow: \/cart/);
    expect(robots).toMatch(/Disallow: \/checkout/);
    expect(robots).toMatch(/Sitemap: https:\/\/flexamarket.com\/sitemap.xml/);
    expect(smIndex).toMatch(/sitemap-categories\.xml/);
  });
});
