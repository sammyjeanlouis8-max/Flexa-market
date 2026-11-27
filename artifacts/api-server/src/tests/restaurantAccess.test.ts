import { describe, expect, it } from "vitest";
import {
  RESTAURANT_PUBLIC_LAUNCH,
  canAccessRestaurantModule,
  canAccessRestaurantStaff,
  canTransitionRestaurantOrder,
} from "../lib/restaurantAccess";

describe("restaurantAccess gate", () => {
  it("keeps public launch disabled until Super Admin approval", () => {
    expect(RESTAURANT_PUBLIC_LAUNCH).toBe(false);
  });

  it("allows staff while public launch is false", () => {
    expect(canAccessRestaurantStaff({ isSuperAdmin: true })).toBe(true);
    expect(canAccessRestaurantStaff({ isAdmin: true })).toBe(true);
    expect(canAccessRestaurantStaff({ role: "moderator" })).toBe(true);
    expect(canAccessRestaurantStaff({ role: "user" })).toBe(false);
    expect(canAccessRestaurantStaff(null)).toBe(false);
  });

  it("denies regular users while public launch is false", () => {
    expect(canAccessRestaurantModule({ role: "user" })).toBe(false);
    expect(canAccessRestaurantModule({ isSuperAdmin: true })).toBe(true);
  });
});

describe("restaurant order transitions", () => {
  it("enforces valid owner lifecycle moves", () => {
    expect(canTransitionRestaurantOrder("pending", "accepted")).toBe(true);
    expect(canTransitionRestaurantOrder("pending", "completed")).toBe(false);
    expect(canTransitionRestaurantOrder("preparing", "ready_for_pickup")).toBe(true);
    expect(canTransitionRestaurantOrder("completed", "pending")).toBe(false);
  });
});
