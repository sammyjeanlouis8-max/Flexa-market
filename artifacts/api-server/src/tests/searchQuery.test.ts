import { describe, it, expect } from "vitest";
import {
  escapeIlikePattern,
  normalizeSearchQuery,
  searchTokens,
  editDistance,
  suggestCorrection,
  containsPattern,
  prefixPattern,
} from "../lib/searchQuery";

describe("searchQuery helpers", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeIlikePattern("100%_off")).toBe("100\\%\\_off");
    expect(containsPattern("a%b")).toBe("%a\\%b%");
    expect(prefixPattern("iph")).toBe("iph%");
  });

  it("normalizes whitespace, strips wildcards, and caps length", () => {
    expect(normalizeSearchQuery("  iPhone   15  ")).toBe("iPhone 15");
    expect(normalizeSearchQuery("100% off_sale")).toBe("100 off sale");
    expect(normalizeSearchQuery("x".repeat(200)).length).toBe(120);
    expect(normalizeSearchQuery(null)).toBe("");
  });

  it("tokenizes significant words", () => {
    expect(searchTokens("iPhone 15 Pro")).toEqual(["iPhone", "15", "Pro"]);
    expect(searchTokens("a b cd")).toEqual(["cd"]);
  });

  it("computes edit distance for typos", () => {
    expect(editDistance("iphone", "iphone")).toBe(0);
    expect(editDistance("iphon", "iphone")).toBe(1);
    expect(editDistance("samung", "samsung")).toBe(1);
  });

  it("suggests corrections from candidates", () => {
    const popular = ["iphone", "samsung", "nike shoes"];
    expect(suggestCorrection("iphon", popular)).toBe("iphone");
    expect(suggestCorrection("samung", popular)).toBe("samsung");
    expect(suggestCorrection("iphone", popular)).toBeNull();
  });
});
