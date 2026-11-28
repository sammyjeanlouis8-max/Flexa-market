/**
 * Séduire Beauty availability helpers — timezone-aware open/slot checks.
 */

export type BeautyHourRow = {
  weekday: number;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
};

export type BeautyException = {
  exceptionType: string;
  startAt: Date;
  endAt: Date;
};

function parseHm(hm: string | null | undefined): number | null {
  if (!hm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** Local calendar parts in a given IANA timezone. */
export function localParts(date: Date, timeZone: string): {
  ymd: string;
  weekday: number;
  minutes: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const weekday = weekdayMap[parts.weekday ?? ""] ?? date.getUTCDay();
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return { ymd, weekday, minutes };
}

export function localYmd(date: Date, timeZone: string): string {
  return localParts(date, timeZone).ymd;
}

export function isBusinessOpenNow(
  hours: BeautyHourRow[],
  timeZone: string,
  now = new Date(),
  vacationMode = false,
  temporarilyClosed = false,
): boolean {
  if (vacationMode || temporarilyClosed) return false;
  const { weekday, minutes } = localParts(now, timeZone);
  const row = hours.find((h) => h.weekday === weekday);
  if (!row || row.isClosed) return false;
  const open = parseHm(row.openTime);
  const close = parseHm(row.closeTime);
  if (open == null || close == null) return false;
  if (minutes < open || minutes >= close) return false;
  const bs = parseHm(row.breakStart);
  const be = parseHm(row.breakEnd);
  if (bs != null && be != null && minutes >= bs && minutes < be) return false;
  return true;
}

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

/**
 * Generate available start slots for a day given working hours and existing blocks.
 * Slot step defaults to 15 minutes.
 */
export function generateDaySlots(input: {
  dayYmd: string;
  timeZone: string;
  hours: BeautyHourRow[];
  durationMinutes: number;
  prepMinutes?: number;
  cleanupMinutes?: number;
  travelMinutes?: number;
  leadMinutes?: number;
  existing: Array<{ startsAt: Date; endsAt: Date }>;
  exceptions?: BeautyException[];
  now?: Date;
  stepMinutes?: number;
}): string[] {
  const {
    dayYmd,
    timeZone,
    hours,
    durationMinutes,
    prepMinutes = 0,
    cleanupMinutes = 0,
    travelMinutes = 0,
    leadMinutes = 0,
    existing,
    exceptions = [],
    now = new Date(),
    stepMinutes = 15,
  } = input;

  const weekday = (() => {
    // Parse YMD as noon UTC then read weekday in business TZ to avoid DST edge issues.
    const probe = new Date(`${dayYmd}T12:00:00.000Z`);
    return localParts(probe, timeZone).weekday;
  })();

  const row = hours.find((h) => h.weekday === weekday);
  if (!row || row.isClosed) return [];
  const open = parseHm(row.openTime);
  const close = parseHm(row.closeTime);
  if (open == null || close == null) return [];

  const totalBlock = durationMinutes + prepMinutes + cleanupMinutes + travelMinutes;
  if (totalBlock <= 0) return [];

  const slots: string[] = [];
  const leadMs = Math.max(0, leadMinutes) * 60_000;

  for (let startMin = open; startMin + totalBlock <= close; startMin += stepMinutes) {
    const bs = parseHm(row.breakStart);
    const be = parseHm(row.breakEnd);
    if (bs != null && be != null) {
      // Reject slots overlapping break.
      if (startMin < be && startMin + totalBlock > bs) continue;
    }

    const startUtc = wallTimeToUtc(dayYmd, startMin, timeZone);
    const endUtc = new Date(startUtc.getTime() + totalBlock * 60_000);
    if (startUtc.getTime() < now.getTime() + leadMs) continue;

    const blockedByException = exceptions.some((ex) =>
      overlaps(startUtc, endUtc, new Date(ex.startAt), new Date(ex.endAt)),
    );
    if (blockedByException) continue;

    const blockedByExisting = existing.some((ex) =>
      overlaps(startUtc, endUtc, new Date(ex.startsAt), new Date(ex.endsAt)),
    );
    if (blockedByExisting) continue;

    slots.push(startUtc.toISOString());
  }

  return slots;
}

/** Convert local wall-clock minutes on a YMD date in TZ to a UTC Date. */
export function wallTimeToUtc(ymd: string, minutesFromMidnight: number, timeZone: string): Date {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  // Binary search UTC instant whose local parts match.
  let lo = Date.parse(`${ymd}T00:00:00.000Z`) - 36 * 3600_000;
  let hi = Date.parse(`${ymd}T00:00:00.000Z`) + 36 * 3600_000;
  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const parts = localParts(new Date(mid), timeZone);
    const midMin = parts.minutes;
    const cmpYmd = parts.ymd.localeCompare(ymd);
    if (cmpYmd < 0 || (cmpYmd === 0 && midMin < minutesFromMidnight)) {
      lo = mid + 1;
    } else if (cmpYmd > 0 || midMin > minutesFromMidnight) {
      hi = mid - 1;
    } else {
      // Exact minute match — refine hour/minute pad
      const target = new Date(mid);
      // Ensure hour/minute exact via small adjust
      const p = localParts(target, timeZone);
      const diff = (h * 60 + m) - p.minutes;
      return new Date(target.getTime() + diff * 60_000);
    }
  }
  return new Date(lo);
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
