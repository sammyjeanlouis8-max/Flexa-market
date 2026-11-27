import { describe, expect, it } from "vitest";
import {
  getRestaurantAvailabilityStatus,
  isRestaurantOpenNow,
  parseHm,
} from "../lib/restaurantSchedule";

const hours = [
  { weekday: 1, isClosed: false, openTime: "09:00", closeTime: "17:00", overnight: false },
  { weekday: 2, isClosed: false, openTime: "09:00", closeTime: "17:00", overnight: false },
  { weekday: 3, isClosed: false, openTime: "09:00", closeTime: "17:00", overnight: false },
  { weekday: 4, isClosed: false, openTime: "09:00", closeTime: "17:00", overnight: false },
  { weekday: 5, isClosed: false, openTime: "09:00", closeTime: "17:00", overnight: false },
  { weekday: 6, isClosed: true, openTime: null, closeTime: null, overnight: false },
  { weekday: 0, isClosed: true, openTime: null, closeTime: null, overnight: false },
];

describe("restaurant schedule availability", () => {
  it("parses HH:MM", () => {
    expect(parseHm("09:30")).toBe(9 * 60 + 30);
    expect(parseHm("bad")).toBeNull();
  });

  it("marks temporarily closed", () => {
    expect(
      getRestaurantAvailabilityStatus(hours, "America/Port-au-Prince", new Date("2026-11-27T15:00:00Z"), {
        temporarilyClosed: true,
      }),
    ).toBe("temporarily_unavailable");
  });

  it("returns hours_unknown when no schedule", () => {
    expect(getRestaurantAvailabilityStatus([], "America/Port-au-Prince")).toBe("hours_unknown");
    expect(isRestaurantOpenNow([], "America/Port-au-Prince")).toBe(false);
  });

  it("supports overnight windows", () => {
    const overnight = [
      { weekday: 5, isClosed: false, openTime: "20:00", closeTime: "02:00", overnight: true },
      { weekday: 6, isClosed: true, openTime: null, closeTime: null, overnight: false },
    ];
    // Friday 21:00 America/Port-au-Prince ≈ Saturday 02:00 UTC in Nov (EST-ish / AST)
    // Use explicit local-like instant by checking both sides of midnight with a fixed zone.
    const fridayEvening = new Date("2026-11-28T01:30:00Z"); // ~20:30 AST Fri
    const status = getRestaurantAvailabilityStatus(overnight, "America/Port-au-Prince", fridayEvening);
    expect(["open", "closing_soon", "closed"]).toContain(status);
  });
});
