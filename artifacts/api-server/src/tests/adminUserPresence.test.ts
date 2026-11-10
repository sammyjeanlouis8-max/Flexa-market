import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  MESSAGE_SYSTEM_AVATAR,
  MESSAGE_SYSTEM_EMAIL,
  MESSAGE_SYSTEM_NAME,
  buildControlPresenceBadge,
  formatLastSeenAgoLabel,
  formatLastSeenExact,
  isMessageSystemAccount,
} from "../lib/adminUserPresence";

describe("isMessageSystemAccount", () => {
  it("identifies Message System by official email or role", () => {
    expect(
      isMessageSystemAccount({
        email: MESSAGE_SYSTEM_EMAIL,
        role: "user",
        name: "x",
      }),
    ).toBe(true);
    expect(isMessageSystemAccount({ email: "a@b.com", role: "system" })).toBe(true);
    expect(isMessageSystemAccount({ email: "maya@test.com", role: "user" })).toBe(false);
  });
});

describe("formatLastSeenAgoLabel", () => {
  const now = Date.parse("2026-11-10T17:50:00.000Z");

  it("formats hours, days, months, and years from verified timestamps", () => {
    expect(formatLastSeenAgoLabel(new Date(now - 4 * 3600_000), now)).toBe(
      "Last seen 4 hours ago",
    );
    expect(formatLastSeenAgoLabel(new Date(now - 1 * 86_400_000), now)).toBe(
      "Last seen 1 day ago",
    );
    expect(formatLastSeenAgoLabel(new Date(now - 90 * 86_400_000), now)).toBe(
      "Last seen 3 months ago",
    );
    expect(formatLastSeenAgoLabel(new Date(now - 730 * 86_400_000), now)).toBe(
      "Last seen 2 years ago",
    );
  });

  it("returns Last seen unavailable without a verified timestamp", () => {
    expect(formatLastSeenAgoLabel(null, now)).toBe("Last seen unavailable");
    expect(formatLastSeenAgoLabel(undefined, now)).toBe("Last seen unavailable");
    expect(formatLastSeenAgoLabel("not-a-date", now)).toBe("Last seen unavailable");
  });
});

describe("buildControlPresenceBadge", () => {
  const now = Date.parse("2026-11-10T17:50:00.000Z");

  it("uses System Account for Message System and skips human presence", () => {
    expect(
      buildControlPresenceBadge({
        isSystemAccount: true,
        isOnline: true,
        lastSeenAt: new Date(now),
        nowMs: now,
      }),
    ).toEqual({ kind: "system", label: "System Account" });
  });

  it("prefers Suspended / Blocked over Online or Last seen", () => {
    expect(
      buildControlPresenceBadge({
        isSystemAccount: false,
        isRestricted: true,
        isOnline: true,
        lastSeenAt: new Date(now),
        nowMs: now,
      }).label,
    ).toBe("Suspended");
    expect(
      buildControlPresenceBadge({
        isSystemAccount: false,
        isBanned: true,
        isOnline: true,
        nowMs: now,
      }).label,
    ).toBe("Blocked");
  });

  it("shows Online only with a live presence signal", () => {
    expect(
      buildControlPresenceBadge({
        isSystemAccount: false,
        isOnline: true,
        lastSeenAt: new Date(now - 3600_000),
        nowMs: now,
      }),
    ).toEqual({ kind: "online", label: "Online" });
  });

  it("falls back to Last seen from the verified timestamp", () => {
    expect(
      buildControlPresenceBadge({
        isSystemAccount: false,
        isOnline: false,
        lastSeenAt: new Date(now - 4 * 3600_000),
        nowMs: now,
      }).label,
    ).toBe("Last seen 4 hours ago");
  });
});

describe("formatLastSeenExact", () => {
  it("includes a timezone name for admins", () => {
    const exact = formatLastSeenExact("2026-11-10T12:50:00.000Z", "America/New_York");
    expect(exact).toBeTruthy();
    expect(exact!).toMatch(/2026/);
    expect(exact!).toMatch(/EST|EDT|GMT|UTC/);
  });
});

describe("Control Users presence contract", () => {
  it("wires Message System logo + presence helpers into admin routes and UI", () => {
    const adminRoutes = readFileSync(
      resolve(__dirname, "../routes/admin.ts"),
      "utf8",
    );
    const ui = readFileSync(
      resolve(__dirname, "../../../marketplace/src/pages/AdminUsers.tsx"),
      "utf8",
    );
    expect(adminRoutes).toMatch(/isMessageSystemAccount/);
    expect(adminRoutes).toMatch(/buildControlPresenceBadge/);
    expect(adminRoutes).toMatch(/isUserOnline/);
    expect(adminRoutes).toMatch(/MESSAGE_SYSTEM_AVATAR/);
    expect(adminRoutes).toMatch(/formatLastSeenExact/);
    expect(ui).toMatch(/PresenceListBadge/);
    expect(ui).toMatch(/flexa-logo-v2\.png/);
    expect(ui).toMatch(/Message System/);
    expect(ui).toMatch(/lastSeenExact/);
    expect(MESSAGE_SYSTEM_NAME).toBe("Message System");
    expect(MESSAGE_SYSTEM_AVATAR).toBe("/flexa-logo-v2.png");
  });
});
