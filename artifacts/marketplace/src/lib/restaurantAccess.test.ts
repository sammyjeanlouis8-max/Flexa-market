import { describe, expect, it } from "vitest";
import { RESTAURANT_PUBLIC_LAUNCH, canAccessRestaurant } from "./restaurantAccess";

describe("marketplace restaurantAccess", () => {
  it("defaults to staff-only preview", () => {
    expect(RESTAURANT_PUBLIC_LAUNCH).toBe(false);
    expect(canAccessRestaurant(null)).toBe(false);
    expect(canAccessRestaurant({ role: "user" } as any)).toBe(false);
    expect(canAccessRestaurant({ isSuperAdmin: true } as any)).toBe(true);
    expect(canAccessRestaurant({ isAdmin: true } as any)).toBe(true);
    expect(canAccessRestaurant({ role: "moderator" } as any)).toBe(true);
  });
});
