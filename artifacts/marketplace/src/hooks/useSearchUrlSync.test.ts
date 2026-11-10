import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPathname,
  buildSearch,
  buildSearchUrl,
  categorySlugFromPath,
  SEARCH_DEFAULT_MAX_PRICE,
} from "./useSearchUrlSync.ts";

const base = {
  q: "",
  category: "",
  subcategory: "",
  condition: "",
  city: "",
  minPrice: 0,
  maxPrice: SEARCH_DEFAULT_MAX_PRICE,
  page: 1,
  boosted: false,
};

test("categorySlugFromPath reads public category URLs", () => {
  assert.equal(categorySlugFromPath("/categories/fashion"), "fashion");
  assert.equal(categorySlugFromPath("/categories/real-estate/"), "real-estate");
  assert.equal(categorySlugFromPath("/search"), null);
});

test("empty filters produce no query string", () => {
  assert.equal(buildSearch(base, "/search"), "");
});

test("encodes shareable search filters", () => {
  const qs = buildSearch(
    {
      ...base,
      q: "iphone",
      category: "electronics",
      subcategory: "phones",
      condition: "good",
      city: "Port-au-Prince",
      minPrice: 50,
      maxPrice: 400,
      page: 2,
    },
    "/search",
  );
  const params = new URLSearchParams(qs.slice(1));
  assert.equal(params.get("q"), "iphone");
  assert.equal(params.get("category"), "electronics");
  assert.equal(params.get("subcategory"), "phones");
  assert.equal(params.get("condition"), "good");
  assert.equal(params.get("city"), "Port-au-Prince");
  assert.equal(params.get("minPrice"), "50");
  assert.equal(params.get("maxPrice"), "400");
  assert.equal(params.get("page"), "2");
});

test("keeps canonical category path while that category stays selected", () => {
  assert.equal(
    buildPathname({ category: "fashion" }, "/categories/fashion"),
    "/categories/fashion",
  );
  assert.equal(
    buildSearchUrl({ ...base, category: "fashion", q: "robe" }, "/categories/fashion"),
    "/categories/fashion?q=robe",
  );
});

test("clearing category from a category page moves to /search", () => {
  assert.equal(buildPathname({ category: "" }, "/categories/fashion"), "/search");
  assert.equal(
    buildSearchUrl({ ...base, category: "" }, "/categories/fashion"),
    "/search",
  );
});

test("switching category from a category page uses /search?category=", () => {
  assert.equal(
    buildSearchUrl({ ...base, category: "electronics" }, "/categories/fashion"),
    "/search?category=electronics",
  );
});

test("search path keeps category as a query param", () => {
  assert.equal(
    buildSearchUrl({ ...base, category: "shoes", q: "nike" }, "/search"),
    "/search?q=nike&category=shoes",
  );
});
