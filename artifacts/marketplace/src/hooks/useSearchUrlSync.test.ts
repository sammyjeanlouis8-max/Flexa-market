import assert from "node:assert/strict";
import test from "node:test";

/**
 * Lightweight unit coverage for URL encoding rules used by Search sync.
 * Mirrors buildSearch behavior without importing React hooks.
 */

const DEFAULT_MAX = 5000;

function buildSearch(state: {
  q: string;
  category: string;
  subcategory: string;
  condition: string;
  city: string;
  minPrice: number;
  maxPrice: number;
  page: number;
}): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  if (state.category) params.set("category", state.category);
  if (state.subcategory) params.set("subcategory", state.subcategory);
  if (state.condition) params.set("condition", state.condition);
  if (state.city.trim()) params.set("city", state.city.trim());
  if (state.minPrice > 0) params.set("minPrice", String(state.minPrice));
  if (state.maxPrice < DEFAULT_MAX) params.set("maxPrice", String(state.maxPrice));
  if (state.page > 1) params.set("page", String(state.page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

test("empty filters produce no query string", () => {
  assert.equal(
    buildSearch({
      q: "  ",
      category: "",
      subcategory: "",
      condition: "",
      city: "",
      minPrice: 0,
      maxPrice: DEFAULT_MAX,
      page: 1,
    }),
    "",
  );
});

test("encodes shareable search filters", () => {
  const qs = buildSearch({
    q: "iphone",
    category: "electronics",
    subcategory: "phones",
    condition: "good",
    city: "Port-au-Prince",
    minPrice: 50,
    maxPrice: 400,
    page: 2,
  });
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
