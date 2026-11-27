import { describe, expect, it } from "vitest";
import { RESTAURANT_PUBLIC_LAUNCH, canAccessRestaurant } from "./restaurantAccess";

describe("marketplace restaurantAccess", () => {
  it("defaults to Super Admin–only preview", () => {
    expect(RESTAURANT_PUBLIC_LAUNCH).toBe(false);
    expect(canAccessRestaurant(null)).toBe(false);
    expect(canAccessRestaurant({ role: "user" } as any)).toBe(false);
    expect(canAccessRestaurant({ isAdmin: true } as any)).toBe(false);
    expect(canAccessRestaurant({ role: "moderator" } as any)).toBe(false);
    expect(canAccessRestaurant({ isSuperAdmin: true } as any)).toBe(true);
    expect(canAccessRestaurant({ role: "superadmin" } as any)).toBe(true);
  });
});
