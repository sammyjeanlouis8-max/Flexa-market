import { describe, expect, it } from "vitest";
import { isOpenNow, timeToMinutes } from "../lib/restaurantHours";

describe("restaurantHours", () => {
  it("parses HH:mm", () => {
    expect(timeToMinutes("08:00")).toBe(480);
    expect(timeToMinutes("22:30")).toBe(22 * 60 + 30);
    expect(timeToMinutes("bad")).toBeNull();
  });

  it("computes same-day open window", () => {
    const schedule = [
      { day: "monday", isOpen: true, openTime: "08:00", closeTime: "22:00" },
    ];
    expect(isOpenNow(schedule, new Date(2026, 10, 23, 12, 0, 0))).toBe(true);
    expect(isOpenNow(schedule, new Date(2026, 10, 23, 23, 0, 0))).toBe(false);
  });

  it("supports overnight spanning midnight", () => {
    const schedule = [
      { day: "friday", isOpen: true, openTime: "18:00", closeTime: "02:00" },
      { day: "saturday", isOpen: false, openTime: null, closeTime: null },
    ];
    expect(isOpenNow(schedule, new Date(2026, 10, 27, 20, 0, 0))).toBe(true);
    expect(isOpenNow(schedule, new Date(2026, 10, 28, 1, 0, 0))).toBe(true);
    expect(isOpenNow(schedule, new Date(2026, 10, 28, 3, 0, 0))).toBe(false);
  });
});
