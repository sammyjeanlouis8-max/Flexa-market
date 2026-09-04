import { describe, expect, it } from "vitest";
import { canonicalTransferKeyRow } from "../lib/idempotency";

describe("historical transfer idempotency canonicalization", () => {
  it("prefers a completed row, then the earliest id, without removing rows", () => {
    const rows = [
      { id: 2, status: "pending", key: "same" },
      { id: 9, status: "completed", key: "same" },
      { id: 4, status: "completed", key: "same" },
      { id: 1, status: "failed", key: "same" },
    ];
    const canonical = canonicalTransferKeyRow(rows);
    expect(canonical?.id).toBe(4);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.key === "same")).toBe(true);
  });
});