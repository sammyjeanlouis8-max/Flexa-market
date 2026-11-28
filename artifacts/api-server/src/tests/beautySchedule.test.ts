import { describe, expect, it } from "vitest";
import {
  generateDaySlots,
  haversineKm,
  isBusinessOpenNow,
  overlaps,
  type BeautyHourRow,
} from "../lib/beautySchedule";

describe("beautySchedule", () => {
  const weekdayHours: BeautyHourRow[] = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    isClosed: weekday === 0,
    openTime: "09:00",
    closeTime: "17:00",
    breakStart: "12:00",
    breakEnd: "13:00",
  }));

  it("computes haversine distance", () => {
    const km = haversineKm(18.5944, -72.3074, 18.55, -72.3);
    expect(km).toBeGreaterThan(0);
    expect(km).toBeLessThan(20);
  });

  it("detects interval overlaps", () => {
    const a0 = new Date("2026-06-01T14:00:00.000Z");
    const a1 = new Date("2026-06-01T15:00:00.000Z");
    const b0 = new Date("2026-06-01T14:30:00.000Z");
    const b1 = new Date("2026-06-01T15:30:00.000Z");
    expect(overlaps(a0, a1, b0, b1)).toBe(true);
    expect(overlaps(a0, a1, a1, b1)).toBe(false);
  });

  it("respects vacation and closed flags for open-now", () => {
    expect(isBusinessOpenNow(weekdayHours, "UTC", new Date("2026-06-01T14:00:00.000Z"), true, false)).toBe(false);
    expect(isBusinessOpenNow(weekdayHours, "UTC", new Date("2026-06-01T14:00:00.000Z"), false, true)).toBe(false);
  });

  it("generates slots that skip breaks and existing bookings", () => {
    const day = "2026-06-02"; // Tuesday
    const existing = [
      {
        startsAt: new Date("2026-06-02T14:00:00.000Z"),
        endsAt: new Date("2026-06-02T15:00:00.000Z"),
      },
    ];
    const slots = generateDaySlots({
      dayYmd: day,
      timeZone: "UTC",
      hours: weekdayHours,
      durationMinutes: 60,
      prepMinutes: 0,
      cleanupMinutes: 0,
      leadMinutes: 0,
      existing,
      now: new Date("2026-06-01T00:00:00.000Z"),
      stepMinutes: 30,
    });
    expect(slots.length).toBeGreaterThan(0);
    // No slot should start inside the lunch break or the existing booking.
    for (const iso of slots) {
      const d = new Date(iso);
      const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
      expect(minutes < 12 * 60 || minutes >= 13 * 60).toBe(true);
      expect(!(minutes >= 14 * 60 && minutes < 15 * 60)).toBe(true);
    }
  });

  it("returns no slots on closed weekdays", () => {
    const slots = generateDaySlots({
      dayYmd: "2026-06-07", // Sunday
      timeZone: "UTC",
      hours: weekdayHours,
      durationMinutes: 60,
      existing: [],
      now: new Date("2026-06-01T00:00:00.000Z"),
    });
    expect(slots).toEqual([]);
  });
});
