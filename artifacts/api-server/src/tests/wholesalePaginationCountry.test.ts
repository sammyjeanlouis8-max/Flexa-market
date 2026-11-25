import { describe, expect, it } from "vitest";
import {
  countriesMatch,
  normalizeWholesaleCountry,
  parsePagination,
  resolveBuyerCountry,
} from "../lib/wholesaleCountry";

describe("wholesale country helpers", () => {
  it("normalizes whitespace", () => {
    expect(normalizeWholesaleCountry("  Haiti  ")).toBe("Haiti");
    expect(normalizeWholesaleCountry("")).toBeNull();
    expect(normalizeWholesaleCountry(null)).toBeNull();
  });

  it("matches countries case-insensitively", () => {
    expect(countriesMatch("Haiti", "haiti")).toBe(true);
    expect(countriesMatch("United States", "united states")).toBe(true);
    expect(countriesMatch("Haiti", "United States")).toBe(false);
    expect(countriesMatch("Haiti", null)).toBe(false);
  });

  it("requires buyer country for browse (strict)", () => {
    expect(
      resolveBuyerCountry({
        queryCountry: null,
        profileCountry: null,
        mine: false,
      }).error,
    ).toMatch(/country/i);

    expect(
      resolveBuyerCountry({
        queryCountry: null,
        profileCountry: "Haiti",
        mine: false,
      }).country,
    ).toBe("Haiti");

    expect(
      resolveBuyerCountry({
        queryCountry: "United States",
        profileCountry: "Haiti",
        mine: false,
      }).country,
    ).toBe("United States");
  });

  it("allows mine/admin without country", () => {
    expect(
      resolveBuyerCountry({
        queryCountry: null,
        profileCountry: null,
        mine: true,
      }).error,
    ).toBeUndefined();
    expect(
      resolveBuyerCountry({
        queryCountry: null,
        profileCountry: null,
        admin: true,
      }).error,
    ).toBeUndefined();
  });
});

describe("wholesale pagination helpers", () => {
  it("defaults limit/offset", () => {
    expect(parsePagination({})).toEqual({ limit: 20, offset: 0 });
  });

  it("clamps limit to max 50", () => {
    expect(parsePagination({ limit: 999 }).limit).toBe(50);
    expect(parsePagination({ limit: 0 }).limit).toBe(20);
  });

  it("supports page= as offset shortcut", () => {
    expect(parsePagination({ page: 3, limit: undefined })).toEqual({ limit: 20, offset: 40 });
    expect(parsePagination({ limit: 10, page: 2 })).toEqual({ limit: 10, offset: 10 });
  });

  it("prefers explicit offset over page", () => {
    expect(parsePagination({ limit: 10, offset: 5, page: 9 })).toEqual({ limit: 10, offset: 5 });
  });
});

/**
 * Cross-country warehouse scenarios (logic contract):
 * A seller living in the US with a verified Haiti warehouse publishes Haiti stock.
 * Haiti buyers see it; US buyers browsing US marketplace do not.
 */
describe("cross-country warehouse visibility contract", () => {
  const sellerHome = "United States";
  const haitiDepot = { country: "Haiti", verified: true };
  const usDepot = { country: "United States", verified: true };

  function visibleToBuyer(
    productCountry: string,
    buyerMarketplaceCountry: string,
  ): boolean {
    return countriesMatch(productCountry, buyerMarketplaceCountry);
  }

  it("US-resident seller: Haiti warehouse product visible only in Haiti marketplace", () => {
    expect(sellerHome).toBe("United States");
    expect(haitiDepot.verified).toBe(true);
    expect(visibleToBuyer("Haiti", "Haiti")).toBe(true);
    expect(visibleToBuyer("Haiti", "United States")).toBe(false);
  });

  it("same seller can also sell in US via separate verified US warehouse", () => {
    expect(usDepot.verified).toBe(true);
    expect(visibleToBuyer("United States", "United States")).toBe(true);
    expect(visibleToBuyer("United States", "Haiti")).toBe(false);
  });

  it("favorites must stay in buyer marketplace country", () => {
    const favoriteProductCountry = "Haiti";
    const buyerCountry = "United States";
    expect(countriesMatch(favoriteProductCountry, buyerCountry)).toBe(false);
  });
});
