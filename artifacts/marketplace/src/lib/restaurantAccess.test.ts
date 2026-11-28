import { describe, expect, it } from "vitest";
import { RESTAURANT_PUBLIC_LAUNCH, canAccessRestaurant } from "./restaurantAccess";

describe("marketplace restaurantAccess", () => {
  it("enables public launch for everyone including guests", () => {
    expect(RESTAURANT_PUBLIC_LAUNCH).toBe(true);
    expect(canAccessRestaurant(null)).toBe(true);
    expect(canAccessRestaurant({ role: "user" } as any)).toBe(true);
    expect(canAccessRestaurant({ isAdmin: true } as any)).toBe(true);
    expect(canAccessRestaurant({ role: "moderator" } as any)).toBe(true);
    expect(canAccessRestaurant({ isSuperAdmin: true } as any)).toBe(true);
    expect(canAccessRestaurant({ role: "superadmin" } as any)).toBe(true);
  });
});
