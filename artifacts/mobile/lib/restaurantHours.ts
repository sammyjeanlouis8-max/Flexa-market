import type { DailyScheduleItem, Weekday } from "./restaurantTypes";
import { WEEKDAYS } from "./restaurantTypes";

const DAY_INDEX: Record<number, Weekday> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
};

export function weekdayLabel(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** Parse "HH:mm" → minutes from midnight. */
export function timeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Compute open-now from schedule in the device local timezone.
 * Supports overnight windows (e.g. Friday 18:00–02:00 still open Saturday 01:00).
 */
export function isOpenNow(
  schedule: DailyScheduleItem[],
  now: Date = new Date(),
): boolean {
  const cur = now.getHours() * 60 + now.getMinutes();
  const today = DAY_INDEX[now.getDay()];
  const yesterday = DAY_INDEX[(now.getDay() + 6) % 7];

  const todayItem = schedule.find((s) => s.day === today);
  if (todayItem?.isOpen) {
    const open = timeToMinutes(todayItem.openTime);
    const close = timeToMinutes(todayItem.closeTime);
    if (open != null && close != null) {
      if (close > open) {
        if (cur >= open && cur < close) return true;
      } else if (cur >= open) {
        // Overnight starting today (still before midnight)
        return true;
      }
    }
  }

  const yItem = schedule.find((s) => s.day === yesterday);
  if (yItem?.isOpen) {
    const open = timeToMinutes(yItem.openTime);
    const close = timeToMinutes(yItem.closeTime);
    // Overnight from yesterday: openTime > closeTime and we're before close
    if (open != null && close != null && close <= open && cur < close) return true;
  }

  return false;
}

export function applyMondayToOpenDays(schedule: DailyScheduleItem[]): DailyScheduleItem[] {
  const monday = schedule.find((s) => s.day === "monday");
  if (!monday) return schedule;
  return WEEKDAYS.map((day) => {
    const existing = schedule.find((s) => s.day === day) ?? {
      day,
      isOpen: false,
      openTime: null,
      closeTime: null,
    };
    if (day === "monday") return { ...monday, day };
    if (!existing.isOpen) return existing;
    return {
      ...existing,
      openTime: monday.openTime,
      closeTime: monday.closeTime,
      isOpen: true,
    };
  });
}

export function todayYmd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
