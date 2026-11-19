/**
 * Flexa Control Users — system account + presence badge helpers.
 *
 * Message System is the official automated-messages sender
 * (email system-notifications@flexamarket.internal, role "system").
 * Presence for humans uses live socket online status + DB lastSeenAt only —
 * never account creation, background jobs, or automated message activity.
 */

export const MESSAGE_SYSTEM_EMAIL = "system-notifications@flexamarket.internal";
export const MESSAGE_SYSTEM_NAME = "Message System";
export const MESSAGE_SYSTEM_AVATAR = "/flexa-logo-v2.png";
export const MESSAGE_SYSTEM_SUBTITLE = "Automated messages";

export type ControlPresenceKind =
  | "system"
  | "online"
  | "last_seen"
  | "unavailable"
  | "suspended"
  | "blocked";

export type ControlPresenceBadge = {
  kind: ControlPresenceKind;
  /** Compact list label, e.g. "Online" / "Last seen 4 hours ago". */
  label: string;
};

/** Shared UA parser for Control presence + Devices & Sessions. */
export function parseUserAgentLoose(
  ua: string | null | undefined,
): { device: string; os: string; browser: string } {
  if (!ua || !String(ua).trim()) {
    return { device: "Unavailable", os: "Unavailable", browser: "Unavailable" };
  }
  const s = String(ua);
  let device = "Unavailable";
  let os = "Unavailable";
  let browser = "Unavailable";
  if (/iPhone/.test(s)) {
    // Prefer an explicit model token when present (e.g. "iPhone 15", "iPhone15,2").
    const named = s.match(/\b(iPhone\s?\d{1,2}(?:\s?(?:Pro(?:\s?Max)?|Plus|mini))?)\b/i);
    const ident = s.match(/\b(iPhone\d{1,2},\d)\b/i);
    if (named) device = named[1]!.replace(/\s+/g, " ").trim();
    else if (ident) device = ident[1]!;
    else device = "iPhone";
  } else if (/iPad/.test(s)) device = "iPad";
  else if (/Android/.test(s)) {
    const m = s.match(/Android [^;]+; ([^)]+)\)/);
    device = m ? m[1]!.trim() : "Android";
  } else if (/Macintosh/.test(s)) device = "Mac";
  else if (/Windows/.test(s)) device = "Windows PC";
  else if (/Linux/.test(s)) device = "Linux";
  const iosM = s.match(/OS ([\d_]+) like/);
  if (iosM) os = "iOS " + iosM[1]!.replace(/_/g, ".");
  else {
    const andM = s.match(/Android ([\d.]+)/);
    if (andM) os = "Android " + andM[1];
    else {
      const winM = s.match(/Windows NT ([\d.]+)/);
      if (winM) {
        const nm: Record<string, string> = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" };
        os = "Windows " + (nm[winM[1]!] || winM[1]);
      } else {
        const macM = s.match(/Mac OS X ([\d_]+)/);
        if (macM) os = "macOS " + macM[1]!.replace(/_/g, ".");
      }
    }
  }
  if (/CriOS/.test(s)) browser = "Chrome iOS";
  else if (/FxiOS/.test(s)) browser = "Firefox iOS";
  else if (/SamsungBrowser/.test(s)) browser = "Samsung Browser";
  else if (/EdgA?\//.test(s)) browser = "Edge";
  else if (/OPR\//.test(s)) browser = "Opera";
  else if (/Chrome\//.test(s)) browser = "Chrome";
  else if (/Firefox\//.test(s)) browser = "Firefox";
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = "Safari";
  return { device, os, browser };
}

export function isMessageSystemAccount(user: {
  email?: string | null;
  role?: string | null;
  name?: string | null;
}): boolean {
  const email = (user.email ?? "").trim().toLowerCase();
  if (email === MESSAGE_SYSTEM_EMAIL) return true;
  if ((user.role ?? "").toLowerCase() === "system") return true;
  return false;
}

/** Relative “Last seen …” label from a verified presence timestamp. */
export function formatLastSeenAgoLabel(
  lastSeenAt: Date | string | null | undefined,
  nowMs: number = Date.now(),
): string {
  if (!lastSeenAt) return "Last seen unavailable";
  const ts = lastSeenAt instanceof Date ? lastSeenAt.getTime() : new Date(lastSeenAt).getTime();
  if (!Number.isFinite(ts) || ts <= 0) return "Last seen unavailable";
  const diffMs = Math.max(0, nowMs - ts);
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "Last seen just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return min === 1 ? "Last seen 1 minute ago" : `Last seen ${min} minutes ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "Last seen 1 hour ago" : `Last seen ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? "Last seen 1 day ago" : `Last seen ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "Last seen 1 month ago" : `Last seen ${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "Last seen 1 year ago" : `Last seen ${years} years ago`;
}

/** Exact admin-facing timestamp with timezone abbreviation. */
export function formatLastSeenExact(
  lastSeenAt: Date | string | null | undefined,
  timeZone?: string,
): string | null {
  if (!lastSeenAt) return null;
  const d = lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || undefined,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

/**
 * Build the compact list badge. Account status (Suspended/Blocked) wins over
 * presence. System accounts never show human presence.
 */
export function buildControlPresenceBadge(input: {
  isSystemAccount: boolean;
  isBanned?: boolean | null;
  isRestricted?: boolean | null;
  isOnline: boolean;
  /** Verified presence only (users.last_seen_at from session/socket). */
  lastSeenAt?: Date | string | null;
  nowMs?: number;
}): ControlPresenceBadge {
  if (input.isSystemAccount) {
    return { kind: "system", label: "System Account" };
  }
  if (input.isBanned) {
    return { kind: "blocked", label: "Blocked" };
  }
  if (input.isRestricted) {
    return { kind: "suspended", label: "Suspended" };
  }
  if (input.isOnline) {
    return { kind: "online", label: "Online" };
  }
  const label = formatLastSeenAgoLabel(input.lastSeenAt, input.nowMs);
  if (label === "Last seen unavailable") {
    return { kind: "unavailable", label };
  }
  return { kind: "last_seen", label };
}
