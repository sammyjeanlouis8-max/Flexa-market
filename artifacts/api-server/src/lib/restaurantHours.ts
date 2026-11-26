/** Shared open-now helpers for Flexa Restaurant (server). */

export type ScheduleItem = {
  day: string;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
};

export function timeToMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function isOpenNow(schedule: ScheduleItem[], now: Date = new Date()): boolean {
  const dayIndex = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const cur = now.getHours() * 60 + now.getMinutes();
  const today = dayIndex[now.getDay()];
  const yesterday = dayIndex[(now.getDay() + 6) % 7];

  const todayItem = schedule.find((s) => s.day === today);
  if (todayItem?.isOpen) {
    const open = timeToMinutes(todayItem.openTime);
    const close = timeToMinutes(todayItem.closeTime);
    if (open != null && close != null) {
      if (close > open) {
        if (cur >= open && cur < close) return true;
      } else if (cur >= open) {
        return true;
      }
    }
  }

  const yItem = schedule.find((s) => s.day === yesterday);
  if (yItem?.isOpen) {
    const open = timeToMinutes(yItem.openTime);
    const close = timeToMinutes(yItem.closeTime);
    if (open != null && close != null && close <= open && cur < close) return true;
  }
  return false;
}
