import { describe, expect, it } from "vitest";
import { cleanAuditSnapshot, queuePriority, uniquePositiveIds, validReportTransition } from "../lib/adminOperationsHelpers";

describe("admin operation pure guards", () => {
  it("deduplicates IDs and enforces the cap", () => {
    expect(uniquePositiveIds([3, 3, 2]).ids).toEqual([3, 2]);
    expect(uniquePositiveIds(Array.from({ length: 51 }, (_, i) => i + 1)).error).toBeTruthy();
  });
  it("orders queue priorities deterministically", () => expect(["low", "normal", "high", "urgent"].sort((a, b) => queuePriority(a) - queuePriority(b))).toEqual(["urgent", "high", "normal", "low"]));
  it("only permits pending report decisions", () => {
    expect(validReportTransition("pending", "resolve")).toBe(true);
    expect(validReportTransition("resolved", "dismiss")).toBe(false);
  });
  it("removes credentials from audit snapshots", () => expect(cleanAuditSnapshot({ id: 1, passwordHash: "x", token: "y" })).toEqual({ id: 1 }));
});