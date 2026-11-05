import { describe, expect, it } from "vitest";

/**
 * Lightweight guards mirroring apply payload rules used by the Haiti
 * driver application wizard (age + phone normalization expectations).
 */

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("509") && digits.length >= 11) return `+${digits}`;
  if (digits.length === 8) return `+509${digits}`;
  if (raw.trim().startsWith("+")) return raw.trim();
  return digits ? `+509${digits}` : "";
}

function ageFromDob(dob: string): number | null {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
}

describe("driver application wizard helpers", () => {
  it("normalizes Haiti phone numbers to +509", () => {
    expect(normalizePhone("37123456")).toBe("+50937123456");
    expect(normalizePhone("50937123456")).toBe("+50937123456");
    expect(normalizePhone("+509 37 12 34 56")).toBe("+50937123456");
  });

  it("enforces 18+ age gate", () => {
    expect(ageFromDob("2015-01-01")).toBeLessThan(18);
    expect(ageFromDob("1990-06-15")).toBeGreaterThanOrEqual(18);
  });
});
