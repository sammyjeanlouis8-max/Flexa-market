import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const boostSrc = readFileSync(
  resolve(__dirname, "../routes/boost.ts"),
  "utf8",
);

describe("boost delivery path source contracts (Phase 3P)", () => {
  it("Advantage+ initiate does not stamp seller registered region", () => {
    // Regression: previously Advantage+ used `req.user?.state || bodyState...`
    // which forced seller commune into feed filters.
    expect(boostSrc).toContain('audienceType === "advantage_plus"');
    expect(boostSrc).toContain("resolvedState = audienceType === \"advantage_plus\"");
    expect(boostSrc).not.toMatch(
      /audienceType === "custom"[\s\S]{0,80}\(req\.user\?\.state \|\| bodyState/,
    );
    // The old Advantage+ fallback that preferred seller state must be gone.
    expect(boostSrc).not.toMatch(
      /: \(req\.user\?\.state \|\| bodyState \|\| bodyStates\[0\] \|\| null\)/,
    );
  });

  it("video-only Advantage+ uses null department/city (country-wide)", () => {
    expect(boostSrc).toContain("const state: string | null = null;");
    expect(boostSrc).toContain("const city: string | null = null;");
    expect(boostSrc).not.toMatch(
      /country === "Haiti"\) \? \(req\.user!\.state \?\? "Ouest"\)/,
    );
  });
});
