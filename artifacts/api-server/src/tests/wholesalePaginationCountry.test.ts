import { describe, expect, it } from "vitest";
import {
  countriesMatch,
  isWarehouseBuyerVisible,
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

  it("locks authenticated buyers to profile country; guests may use query country", () => {
    expect(
      resolveBuyerCountry({
        queryCountry: null,
        profileCountry: null,
        mine: false,
      }).error,
    ).toMatch(/account country/i);

    expect(
      resolveBuyerCountry({
        queryCountry: "Haiti",
        profileCountry: null,
        mine: false,
      }).country,
    ).toBe("Haiti");

    expect(
      resolveBuyerCountry({
        queryCountry: "United States",
        profileCountry: "Haiti",
        mine: false,
      }).country,
    ).toBe("Haiti");

    expect(
      resolveBuyerCountry({
        queryCountry: null,
        profileCountry: "Haiti",
        mine: false,
      }).country,
    ).toBe("Haiti");
  });

  it("allows mine filter via query; Super Admin may browse all countries", () => {
    expect(
      resolveBuyerCountry({
        queryCountry: "Dominican Republic",
        profileCountry: "Haiti",
        mine: true,
      }).country,
    ).toBe("Dominican Republic");

    const adminAll = resolveBuyerCountry({
      queryCountry: null,
      profileCountry: "Haiti",
      admin: true,
    });
    expect(adminAll.allCountries).toBe(true);
    expect(adminAll.country).toBeNull();

    expect(
      resolveBuyerCountry({
        queryCountry: "Haiti",
        profileCountry: "United States",
        admin: true,
      }).country,
    ).toBe("Haiti");
  });
});

describe("warehouse buyer visibility", () => {
  const verifiedHt = {
    sellerId: 10,
    country: "Haiti",
    verificationStatus: "verified",
    isActive: true,
  };

  it("requires verified + active + ownership + country match", () => {
    expect(
      isWarehouseBuyerVisible({
        warehouse: verifiedHt,
        product: { sellerId: 10, country: "Haiti" },
        buyerCountry: "Haiti",
      }),
    ).toBe(true);

    expect(
      isWarehouseBuyerVisible({
        warehouse: { ...verifiedHt, verificationStatus: "pending" },
        product: { sellerId: 10, country: "Haiti" },
        buyerCountry: "Haiti",
      }),
    ).toBe(false);

    expect(
      isWarehouseBuyerVisible({
        warehouse: { ...verifiedHt, isActive: false },
        product: { sellerId: 10, country: "Haiti" },
        buyerCountry: "Haiti",
      }),
    ).toBe(false);

    expect(
      isWarehouseBuyerVisible({
        warehouse: verifiedHt,
        product: { sellerId: 99, country: "Haiti" },
        buyerCountry: "Haiti",
      }),
    ).toBe(false);

    expect(
      isWarehouseBuyerVisible({
        warehouse: verifiedHt,
        product: { sellerId: 10, country: "Haiti" },
        buyerCountry: "United States",
      }),
    ).toBe(false);
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
    expect(parsePagination({ page: 3, offset: undefined })).toEqual({ limit: 20, offset: 40 });
    expect(parsePagination({ limit: 10, page: 2 })).toEqual({ limit: 10, offset: 10 });
  });

  it("prefers explicit offset over page", () => {
    expect(parsePagination({ limit: 10, offset: 5, page: 9 })).toEqual({ limit: 10, offset: 5 });
  });
});

describe("cross-country warehouse visibility contract", () => {
  it("US-resident seller Haiti depot product visible only to Haiti account buyers", () => {
    const warehouse = {
      sellerId: 1,
      country: "Haiti",
      verificationStatus: "verified",
      isActive: true,
    };
    const product = { sellerId: 1, country: "Haiti" };
    expect(isWarehouseBuyerVisible({ warehouse, product, buyerCountry: "Haiti" })).toBe(true);
    expect(isWarehouseBuyerVisible({ warehouse, product, buyerCountry: "United States" })).toBe(false);
  });

  it("suspended warehouse hides products from buyers", () => {
    expect(
      isWarehouseBuyerVisible({
        warehouse: {
          sellerId: 1,
          country: "Haiti",
          verificationStatus: "verified",
          isActive: false,
        },
        product: { sellerId: 1, country: "Haiti" },
        buyerCountry: "Haiti",
      }),
    ).toBe(false);
  });
});
