import { describe, expect, it } from "vitest";
import {
  canonicalizeDriverAppStatus,
  comparePersonNames,
  decideDriverVerification,
  normalizePersonName,
  outcomeToApplicationStatus,
} from "../lib/driverIdVerification";

describe("normalizePersonName", () => {
  it("strips accents, punctuation, and case", () => {
    expect(normalizePersonName("Jean-Marie  PÉTION")).toBe("jean marie petion");
    expect(normalizePersonName("  Marie  Claire ")).toBe("marie claire");
  });
});

describe("comparePersonNames", () => {
  it("matches exact normalized names", () => {
    const r = comparePersonNames("Jean Pierre", "jean pierre");
    expect(r.exact).toBe(true);
    expect(r.score).toBe(1);
    expect(r.significantMismatch).toBe(false);
  });

  it("tolerates accents and minor spelling as minorDiff, not rejection", () => {
    const r = comparePersonNames("Jean Petion", "Jean Pétion");
    expect(r.significantMismatch).toBe(false);
    expect(r.score).toBeGreaterThan(0.9);
  });

  it("flags clearly different people as significantMismatch", () => {
    const r = comparePersonNames("Jean Pierre", "Marie Claire");
    expect(r.significantMismatch).toBe(true);
    expect(r.score).toBeLessThan(0.55);
  });

  it("tolerates token order / middle-name differences when core tokens match", () => {
    const r = comparePersonNames("Jean Marie Pierre", "Jean Pierre");
    expect(r.significantMismatch).toBe(false);
  });
});

describe("decideDriverVerification", () => {
  it("queues human review when AI unavailable — never auto-rejects", () => {
    const d = decideDriverVerification({
      registeredFullName: "Jean Pierre",
      aiAvailable: false,
    });
    expect(d.outcome).toBe("pending_review");
    expect(outcomeToApplicationStatus(d.outcome)).toBe("pending_review");
  });

  it("requests correction for blurry documents", () => {
    const d = decideDriverVerification({
      registeredFullName: "Jean Pierre",
      cinExtractedName: "Jean Pierre",
      licenseExtractedName: "Jean Pierre",
      cinQuality: ["blurry"],
      aiAvailable: true,
    });
    expect(d.outcome).toBe("needs_correction");
    expect(outcomeToApplicationStatus(d.outcome)).toBe("needs_correction");
  });

  it("sends significant mismatches to human review (not auto-reject)", () => {
    const d = decideDriverVerification({
      registeredFullName: "Jean Pierre",
      cinExtractedName: "Totally Different",
      licenseExtractedName: "Jean Pierre",
      aiAvailable: true,
    });
    expect(d.outcome).toBe("pending_review");
    expect(d.flags).toContain("name_mismatch");
  });

  it("clear_for_review still requires admin final approval", () => {
    const d = decideDriverVerification({
      registeredFullName: "Jean Pierre",
      cinExtractedName: "Jean Pierre",
      licenseExtractedName: "Jean Pierre",
      aiAvailable: true,
    });
    expect(d.outcome).toBe("clear_for_review");
    expect(outcomeToApplicationStatus(d.outcome)).toBe("pending_review");
    expect(d.adminNotes.some((n) => /administrator/i.test(n))).toBe(true);
  });
});

describe("canonicalizeDriverAppStatus", () => {
  it("maps legacy pending and needs_changes", () => {
    expect(canonicalizeDriverAppStatus("pending")).toBe("pending_review");
    expect(canonicalizeDriverAppStatus("needs_changes")).toBe("needs_correction");
    expect(canonicalizeDriverAppStatus("approved")).toBe("approved");
  });
});
