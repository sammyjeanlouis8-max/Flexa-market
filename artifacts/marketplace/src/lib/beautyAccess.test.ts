import { describe, expect, it } from "vitest";
import { BEAUTY_PUBLIC_LAUNCH, canAccessBeauty } from "./beautyAccess";

describe("marketplace beautyAccess", () => {
  it("enables public launch for everyone including guests", () => {
    expect(BEAUTY_PUBLIC_LAUNCH).toBe(true);
    expect(canAccessBeauty(null)).toBe(true);
    expect(canAccessBeauty({ role: "user" } as any)).toBe(true);
    expect(canAccessBeauty({ isAdmin: true } as any)).toBe(true);
    expect(canAccessBeauty({ role: "moderator" } as any)).toBe(true);
    expect(canAccessBeauty({ isSuperAdmin: true } as any)).toBe(true);
    expect(canAccessBeauty({ role: "superadmin" } as any)).toBe(true);
  });
});
