import { useEffect } from "react";

const BASE_TITLE = "FLEXA MARKET";
const BASE_URL = "https://flexamarket.com";
const DEFAULT_DESC =
  "FlexaMarket — premye marketplace achte & vann ann Ayiti. Jwenn bon pri sou elektwonik, rad, machin, meuble ak plis. Sekirize, lokal, fasil.";
const DEFAULT_IMAGE = `${BASE_URL}/opengraph.jpg`;

interface SEOOptions {
  title?: string;
  description?: string;
  image?: string;
  path?: string;
  type?: "website" | "article" | "product";
  noindex?: boolean;
  jsonLd?: object | null;
}

function setMeta(name: string, content: string, attr: "name" | "property" = "name") {
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function useSEO({ title, description, image, path, type = "website", noindex = false, jsonLd }: SEOOptions = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${BASE_TITLE}` : `${BASE_TITLE} — Achte & Vann ann Ayiti`;
    const desc = description ?? DEFAULT_DESC;
    const img = image ?? DEFAULT_IMAGE;
    const canonical = path ? `${BASE_URL}${path}` : BASE_URL;

    document.title = fullTitle;

    setMeta("description", desc);
    setMeta("robots", noindex ? "noindex, nofollow" : "index, follow");

    setLink("canonical", canonical);

    setMeta("og:site_name", BASE_TITLE, "property");
    setMeta("og:title", fullTitle, "property");
    setMeta("og:description", desc, "property");
    setMeta("og:image", img, "property");
    setMeta("og:image:secure_url", img, "property");
    setMeta("og:image:type", "image/jpeg", "property");
    setMeta("og:url", canonical, "property");
    setMeta("og:type", type, "property");

    setMeta("twitter:title", fullTitle, "name");
    setMeta("twitter:description", desc, "name");
    setMeta("twitter:image", img, "name");
    setMeta("twitter:creator", "@flexamarket", "name");

    // JSON-LD structured data (schema.org)
    const existing = document.querySelector('script[type="application/ld+json"][data-seo]');
    if (jsonLd) {
      const el = (existing ?? document.createElement("script")) as HTMLScriptElement;
      el.type = "application/ld+json";
      el.setAttribute("data-seo", "true");
      el.textContent = JSON.stringify(jsonLd);
      if (!existing) document.head.appendChild(el);
    } else {
      existing?.remove();
    }
  }, [title, description, image, path, type, noindex, jsonLd]);
}

export default useSEO;
