/**
 * Flexa Control User Details helpers — masking, display IDs, device grouping.
 */

import { parseUserAgentLoose } from "./adminUserPresence";

export { parseUserAgentLoose };

export function formatControlUserDisplayId(userId: number): string {
  return `FM-${userId}`;
}

export function maskEmail(email: string | null | undefined): string {
  const e = (email ?? "").trim();
  if (!e || !e.includes("@")) return "Unavailable";
  const [local, domain] = e.split("@");
  if (!local || !domain) return "Unavailable";
  const first = local[0] ?? "•";
  return `${first}•••@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "Unavailable";
  const last4 = digits.slice(-4);
  return `••• ••• ${last4}`;
}

export function resolveControlRoles(user: {
  isSuperAdmin?: boolean | null;
  isAdmin?: boolean | null;
  role?: string | null;
  listingCount?: number | null;
  isSystemAccount?: boolean;
}): string[] {
  if (user.isSystemAccount || (user.role ?? "").toLowerCase() === "system") {
    return ["System Account"];
  }
  const roles: string[] = [];
  if (user.isSuperAdmin || user.role === "superadmin") roles.push("Super Admin");
  else if (user.isAdmin || user.role === "admin") roles.push("Admin");
  else if (user.role === "moderator") roles.push("Moderator");
  // Marketplace participation — a user can be both buyer and seller.
  roles.push("Buyer");
  if ((user.listingCount ?? 0) > 0) roles.push("Seller");
  return roles;
}

export type DeviceSessionRow = {
  key: string;
  label: string;
  modelAvailable: boolean;
  modelNote: string | null;
  platform: string;
  os: string;
  browser: string;
  sessionCount: number;
  activeSessionCount: number;
  lastSeenAt: string | null;
  lastSeenLabel: string;
  badges: Array<"most_recent" | "most_used">;
  history: Array<{ at: string; action: string }>;
};

/**
 * Group login history into known devices. Active socket sessions are attributed
 * to the most recently used device when the user is currently online (JWT
 * sessions are not persisted per-device).
 */
export function buildDevicesFromLoginLogs(
  logs: Array<{ userAgent: string | null; action: string; createdAt: Date | string }>,
  opts: {
    activeSocketCount: number;
    formatLastSeen: (at: Date | string | null) => string;
  },
): {
  knownDevices: DeviceSessionRow[];
  knownDeviceCount: number;
  devicesWithActiveSessions: number;
  activeSessionCount: number;
  unmatchedActiveSessions: number;
} {
  const map = new Map<string, {
    label: string;
    modelAvailable: boolean;
    modelNote: string | null;
    platform: string;
    os: string;
    browser: string;
    lastSeenAt: Date;
    history: Array<{ at: string; action: string }>;
  }>();

  for (const log of logs) {
    const parsed = parseUserAgentLoose(log.userAgent);
    const key = `${parsed.device}|${parsed.os}|${parsed.browser}`;
    const at = new Date(log.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    const existing = map.get(key);
    if (existing) {
      existing.history.push({ at: at.toISOString(), action: log.action });
      if (at > existing.lastSeenAt) existing.lastSeenAt = at;
    } else {
      // Exact model is available only when UA carries more than a platform family name.
      const generic = /^(Unavailable|Android|iPhone|iPad|Mac|Windows PC|Linux)$/i.test(parsed.device);
      const modelAvailable = parsed.device !== "Unavailable" && !generic;
      map.set(key, {
        label: parsed.device === "Unavailable" ? "Unknown device" : parsed.device,
        modelAvailable,
        modelNote: modelAvailable ? null : "Model unavailable",
        platform: parsed.device,
        os: parsed.os,
        browser: parsed.browser,
        lastSeenAt: at,
        history: [{ at: at.toISOString(), action: log.action }],
      });
    }
  }

  let devices = Array.from(map.entries()).map(([key, d]) => ({
    key,
    label: d.label,
    modelAvailable: d.modelAvailable,
    modelNote: d.modelNote,
    platform: d.platform,
    os: d.os,
    browser: d.browser,
    sessionCount: d.history.length,
    activeSessionCount: 0,
    lastSeenAt: d.lastSeenAt.toISOString(),
    lastSeenLabel: opts.formatLastSeen(d.lastSeenAt),
    badges: [] as Array<"most_recent" | "most_used">,
    history: d.history
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 40),
  }));

  devices.sort(
    (a, b) => new Date(b.lastSeenAt!).getTime() - new Date(a.lastSeenAt!).getTime(),
  );

  if (devices.length > 0) {
    devices[0]!.badges.push("most_recent");
    const maxUse = Math.max(...devices.map((d) => d.sessionCount));
    if (maxUse >= 2) {
      const mostUsed = devices.find((d) => d.sessionCount === maxUse);
      if (mostUsed && !mostUsed.badges.includes("most_recent")) {
        mostUsed.badges.push("most_used");
      } else if (mostUsed && devices.filter((d) => d.sessionCount === maxUse).length === 1) {
        // Allow both badges on the same device when it is clearly both.
        if (!mostUsed.badges.includes("most_used")) mostUsed.badges.push("most_used");
      }
    }
  }

  const active = Math.max(0, opts.activeSocketCount);
  let unmatched = 0;
  if (active > 0) {
    if (devices.length > 0) {
      devices[0]!.activeSessionCount = active;
    } else {
      unmatched = active;
      devices = [
        {
          key: "unknown-active",
          label: "Unknown device",
          modelAvailable: false,
          modelNote: "Model unavailable",
          platform: "Unavailable",
          os: "Unavailable",
          browser: "Unavailable",
          sessionCount: active,
          activeSessionCount: active,
          lastSeenAt: null,
          lastSeenLabel: "Last seen unavailable",
          badges: [],
          history: [],
        },
      ];
    }
  }

  const devicesWithActive = devices.filter((d) => d.activeSessionCount > 0).length;

  const known = devices.filter((d) => d.key !== "unknown-active");
  return {
    knownDevices: devices,
    knownDeviceCount: known.length,
    devicesWithActiveSessions: devicesWithActive,
    activeSessionCount: active,
    unmatchedActiveSessions: unmatched,
  };
}
