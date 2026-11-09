import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildListingsQuery } from "../lib/listingsQuery.ts";
import { normalizeMarketplaceCountry } from "../lib/countries.ts";

describe("normalizeMarketplaceCountry", () => {
  it("maps legacy ISO HT to Haiti", () => {
    assert.equal(normalizeMarketplaceCountry("HT"), "Haiti");
  });
  it("keeps canonical Haiti", () => {
    assert.equal(normalizeMarketplaceCountry("Haiti"), "Haiti");
  });
  it("defaults empty to Haiti", () => {
    assert.equal(normalizeMarketplaceCountry(""), "Haiti");
    assert.equal(normalizeMarketplaceCountry(null), "Haiti");
  });
});

describe("buildListingsQuery", () => {
  it("requires country for guests", () => {
    const qs = buildListingsQuery({ country: "Haiti", page: 1, limit: 20 }, { guest: true });
    const params = new URLSearchParams(qs);
    assert.equal(params.get("country"), "Haiti");
    assert.equal(params.get("page"), "1");
  });
  it("omits country for authed users", () => {
    const qs = buildListingsQuery({ country: "Haiti", q: "phone", category: "electronics" }, { guest: false });
    const params = new URLSearchParams(qs);
    assert.equal(params.get("country"), null);
    assert.equal(params.get("q"), "phone");
    assert.equal(params.get("category"), "electronics");
  });
  it("caps limit at 50", () => {
    const qs = buildListingsQuery({ limit: 999, country: "USA" }, { guest: true });
    const params = new URLSearchParams(qs);
    assert.equal(params.get("limit"), "50");
  });
});
