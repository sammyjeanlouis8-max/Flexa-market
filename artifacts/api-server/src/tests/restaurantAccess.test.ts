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

  it("allows Super Admin only while public launch is false", () => {
    expect(canAccessRestaurantStaff({ isSuperAdmin: true })).toBe(true);
    expect(canAccessRestaurantStaff({ isAdmin: true })).toBe(false);
    expect(canAccessRestaurantStaff({ role: "moderator" })).toBe(false);
    expect(canAccessRestaurantStaff({ role: "admin" })).toBe(false);
    expect(canAccessRestaurantStaff({ role: "user" })).toBe(false);
    expect(canAccessRestaurantStaff(null)).toBe(false);
  });

  it("denies regular users and non–super-admin staff while public launch is false", () => {
    expect(canAccessRestaurantModule({ role: "user" })).toBe(false);
    expect(canAccessRestaurantModule({ isAdmin: true })).toBe(false);
    expect(canAccessRestaurantModule({ isSuperAdmin: true })).toBe(true);
  });
});

describe("restaurant order transitions", () => {
  it("enforces valid owner lifecycle moves", () => {
    expect(canTransitionRestaurantOrder("order_placed", "confirmed")).toBe(true);
    expect(canTransitionRestaurantOrder("pending_payment", "completed")).toBe(false);
    expect(canTransitionRestaurantOrder("preparing", "ready_for_pickup")).toBe(true);
    expect(canTransitionRestaurantOrder("completed", "order_placed")).toBe(false);
  });
});
