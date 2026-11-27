/**
 * Restaurant-local schedule helpers (Open Now + dish availability windows).
 * Uses IANA timezones; overnight windows supported.
 */

export type OpeningHourRow = {
  weekday: number;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  overnight: boolean;
};

export type DishAvailability = {
  availableFrom: string;
  availableUntil: string;
  soldOut: boolean;
  availablePortions: number | null;
  soldCount: number;
  recurringWeekdays: number[];
};

export type DishAvailabilityLabel =
  | "available_now"
  | "available_later_today"
  | "sold_out"
  | "finished_today"
  | "reserve_tomorrow";

function partsInTz(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const bits = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const hour = bits.hour === "24" ? 0 : Number(bits.hour);
  return {
    weekday: weekdayMap[bits.weekday!] ?? 0,
    ymd: `${bits.year}-${bits.month}-${bits.day}`,
    minutes: hour * 60 + Number(bits.minute),
  };
}

export function parseHm(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export type RestaurantAvailabilityStatus =
  | "open"
  | "closing_soon"
  | "closed"
  | "temporarily_unavailable"
  | "hours_unknown";

export function isRestaurantOpenNow(
  hours: OpeningHourRow[],
  timeZone: string,
  now = new Date(),
  opts?: { vacationMode?: boolean; temporarilyClosed?: boolean },
): boolean {
  const status = getRestaurantAvailabilityStatus(hours, timeZone, now, opts);
  return status === "open" || status === "closing_soon";
}

/**
 * Accurate Open / Closed / Closing Soon / Temporarily Unavailable.
 * Unknown hours must never report as Open.
 */
export function getRestaurantAvailabilityStatus(
  hours: OpeningHourRow[],
  timeZone: string,
  now = new Date(),
  opts?: { vacationMode?: boolean; temporarilyClosed?: boolean; closingSoonMinutes?: number },
): RestaurantAvailabilityStatus {
  if (opts?.vacationMode || opts?.temporarilyClosed) return "temporarily_unavailable";
  if (!hours?.length) return "hours_unknown";

  const closingSoonMinutes = opts?.closingSoonMinutes ?? 45;
  const { weekday, minutes } = partsInTz(now, timeZone);
  const today = hours.find((h) => h.weekday === weekday);
  const prev = hours.find((h) => h.weekday === (weekday + 6) % 7);

  const evaluateWindow = (open: number, close: number, overnight: boolean): RestaurantAvailabilityStatus | null => {
    if (overnight) {
      if (minutes >= open || minutes < close) {
        // Minutes until close across midnight
        const untilClose = minutes >= open ? (24 * 60 - minutes) + close : close - minutes;
        return untilClose <= closingSoonMinutes ? "closing_soon" : "open";
      }
      return null;
    }
    if (minutes >= open && minutes < close) {
      return close - minutes <= closingSoonMinutes ? "closing_soon" : "open";
    }
    return null;
  };

  if (today && !today.isClosed) {
    const open = parseHm(today.openTime);
    const close = parseHm(today.closeTime);
    if (open == null || close == null) return "hours_unknown";
    const hit = evaluateWindow(open, close, !!today.overnight);
    if (hit) return hit;
  }

  // Overnight from previous day into this morning
  if (prev && !prev.isClosed && prev.overnight) {
    const open = parseHm(prev.openTime);
    const close = parseHm(prev.closeTime);
    if (open != null && close != null && minutes < close) {
      return close - minutes <= closingSoonMinutes ? "closing_soon" : "open";
    }
  }

  if (today?.isClosed) return "closed";
  if (today && (parseHm(today.openTime) == null || parseHm(today.closeTime) == null)) return "hours_unknown";
  return "closed";
}

export function localYmd(timeZone: string, now = new Date()): string {
  return partsInTz(now, timeZone).ymd;
}

export function localWeekday(timeZone: string, now = new Date()): number {
  return partsInTz(now, timeZone).weekday;
}

export function localMinutes(timeZone: string, now = new Date()): number {
  return partsInTz(now, timeZone).minutes;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function dishAvailabilityLabel(
  dish: DishAvailability,
  timeZone: string,
  opts?: { acceptsReservations?: boolean; menuDate?: string },
  now = new Date(),
): DishAvailabilityLabel {
  const portionsLeft =
    dish.availablePortions == null ? Infinity : Math.max(0, dish.availablePortions - dish.soldCount);
  if (dish.soldOut || portionsLeft <= 0) return "sold_out";

  const { weekday, minutes, ymd } = partsInTz(now, timeZone);
  if (dish.recurringWeekdays?.length && !dish.recurringWeekdays.includes(weekday)) {
    if (opts?.acceptsReservations) return "reserve_tomorrow";
    return "finished_today";
  }
  if (opts?.menuDate && opts.menuDate !== ymd) {
    if (opts.menuDate > ymd && opts.acceptsReservations) return "reserve_tomorrow";
    return "finished_today";
  }

  const from = parseHm(dish.availableFrom) ?? 0;
  const until = parseHm(dish.availableUntil) ?? 24 * 60;
  if (minutes < from) return "available_later_today";
  if (minutes >= until) {
    return opts?.acceptsReservations ? "reserve_tomorrow" : "finished_today";
  }
  return "available_now";
}

export function dishIsOrderableNow(
  dish: DishAvailability,
  timeZone: string,
  menuDate?: string,
  now = new Date(),
): boolean {
  return dishAvailabilityLabel(dish, timeZone, { menuDate, acceptsReservations: false }, now) === "available_now";
}
