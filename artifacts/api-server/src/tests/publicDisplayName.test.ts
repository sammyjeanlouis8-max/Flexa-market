import { describe, expect, it } from "vitest";
import { publicDisplayName } from "../lib/publicDisplayName";

describe("publicDisplayName", () => {
  it("returns the profile display name", () => {
    expect(publicDisplayName("Fanfan")).toBe("Fanfan");
  });

  it("never exposes ADM-#### style identifiers", () => {
    expect(publicDisplayName("ADM-0001")).toBe("User");
    expect(publicDisplayName("adm-42")).toBe("User");
  });

  it("falls back when missing", () => {
    expect(publicDisplayName(null)).toBe("User");
    expect(publicDisplayName("")).toBe("User");
  });
});
