import { describe, expect, it } from "vitest";
import {
  dishAvailabilityLabel,
  dishIsOrderableNow,
  isRestaurantOpenNow,
  parseHm,
} from "../lib/restaurantSchedule";
import { gradeFoodSafetyQuiz, FOOD_SAFETY_QUESTIONS } from "../lib/restaurantFoodSafety";

describe("restaurantSchedule", () => {
  it("parses HH:mm", () => {
    expect(parseHm("07:30")).toBe(7 * 60 + 30);
    expect(parseHm("24:00")).toBeNull();
  });

  it("detects open now within same-day hours", () => {
    const hours = [
      { weekday: 1, isClosed: false, openTime: "08:00", closeTime: "20:00", overnight: false },
    ];
    // Monday 2026-11-23 15:00 UTC ≈ 10:00 America/Port-au-Prince (UTC-5, no DST)
    const mondayAfternoon = new Date("2026-11-23T15:00:00Z");
    expect(
      isRestaurantOpenNow(hours, "America/Port-au-Prince", mondayAfternoon),
    ).toBe(true);
    const mondayNight = new Date("2026-11-24T02:00:00Z"); // 21:00 local Mon
    expect(
      isRestaurantOpenNow(hours, "America/Port-au-Prince", mondayNight),
    ).toBe(false);
  });

  it("labels dish windows", () => {
    const dish = {
      availableFrom: "10:00",
      availableUntil: "12:00",
      soldOut: false,
      availablePortions: 10,
      soldCount: 0,
      recurringWeekdays: [] as number[],
    };
    // Monday 11:00 local
    const mid = new Date("2026-11-23T16:00:00Z");
    expect(dishAvailabilityLabel(dish, "America/Port-au-Prince", { menuDate: "2026-11-23" }, mid)).toBe(
      "available_now",
    );
    expect(dishIsOrderableNow(dish, "America/Port-au-Prince", "2026-11-23", mid)).toBe(true);
    const late = new Date("2026-11-23T18:00:00Z"); // 13:00 local
    expect(
      dishAvailabilityLabel(
        dish,
        "America/Port-au-Prince",
        { menuDate: "2026-11-23", acceptsReservations: true },
        late,
      ),
    ).toBe("reserve_tomorrow");
  });
});

describe("food safety quiz", () => {
  it("passes at 5/6 with one miss", () => {
    const answers: Record<string, string> = {};
    for (const q of FOOD_SAFETY_QUESTIONS) answers[q.id] = q.correctChoiceId;
    answers.q5 = "a";
    const graded = gradeFoodSafetyQuiz(answers);
    expect(FOOD_SAFETY_QUESTIONS.length).toBe(6);
    expect(graded.score).toBe(5);
    expect(graded.passed).toBe(true);
  });
});
