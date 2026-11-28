import { describe, expect, it } from "vitest";
import { BEAUTY_PUBLIC_LAUNCH, canAccessBeauty } from "./beautyAccess";

describe("marketplace beautyAccess", () => {
  it("defaults to Super Admin–only preview", () => {
    expect(BEAUTY_PUBLIC_LAUNCH).toBe(false);
    expect(canAccessBeauty(null)).toBe(false);
    expect(canAccessBeauty({ role: "user" } as any)).toBe(false);
    expect(canAccessBeauty({ isAdmin: true } as any)).toBe(false);
    expect(canAccessBeauty({ role: "moderator" } as any)).toBe(false);
    expect(canAccessBeauty({ isSuperAdmin: true } as any)).toBe(true);
    expect(canAccessBeauty({ role: "superadmin" } as any)).toBe(true);
  });
});
