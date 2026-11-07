import { describe, expect, it } from "vitest";
import { publicDisplayName } from "./publicDisplayName";

describe("publicDisplayName", () => {
  it("returns the profile display name", () => {
    expect(publicDisplayName("Fanfan")).toBe("Fanfan");
    expect(publicDisplayName("  Marie  ")).toBe("Marie");
  });

  it("never exposes internal admin or account identifiers", () => {
    expect(publicDisplayName("ADM-0001")).toBe("User");
    expect(publicDisplayName("adm-42")).toBe("User");
    expect(publicDisplayName("USER-12")).toBe("User");
    expect(publicDisplayName("12345")).toBe("User");
  });

  it("uses the provided fallback when name is missing", () => {
    expect(publicDisplayName(null)).toBe("User");
    expect(publicDisplayName(undefined, "Guest")).toBe("Guest");
    expect(publicDisplayName("   ", "Guest")).toBe("Guest");
  });
});
