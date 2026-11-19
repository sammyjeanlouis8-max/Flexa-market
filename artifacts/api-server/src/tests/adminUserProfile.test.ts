import { describe, expect, it } from "vitest";
import {
  buildDevicesFromLoginLogs,
  formatControlUserDisplayId,
  maskEmail,
  maskPhone,
  resolveControlRoles,
} from "../lib/adminUserProfile";
import { parseUserAgentLoose } from "../lib/adminUserPresence";

describe("formatControlUserDisplayId", () => {
  it("uses FM- prefix with the stable numeric id", () => {
    expect(formatControlUserDisplayId(10482)).toBe("FM-10482");
  });
});

describe("maskEmail / maskPhone", () => {
  it("masks contact fields for limited admins", () => {
    expect(maskEmail("maya.laurent@example.com")).toBe("m•••@example.com");
    expect(maskPhone("+509 3712 0184")).toBe("••• ••• 0184");
    expect(maskEmail(null)).toBe("Unavailable");
    expect(maskPhone("12")).toBe("Unavailable");
  });
});

describe("resolveControlRoles", () => {
  it("marks Message System and marketplace participation", () => {
    expect(resolveControlRoles({ isSystemAccount: true })).toEqual(["System Account"]);
    expect(resolveControlRoles({ listingCount: 0 })).toEqual(["Buyer"]);
    expect(resolveControlRoles({ listingCount: 2 })).toEqual(["Buyer", "Seller"]);
    expect(resolveControlRoles({ isSuperAdmin: true, listingCount: 1 })).toEqual([
      "Super Admin",
      "Buyer",
      "Seller",
    ]);
  });
});

describe("parseUserAgentLoose + buildDevicesFromLoginLogs", () => {
  const formatLastSeen = () => "Last seen 4 hours ago";

  it("parses named iPhone models and generic Android", () => {
    expect(
      parseUserAgentLoose(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 iPhone 15",
      ).device,
    ).toBe("iPhone 15");
    expect(
      parseUserAgentLoose(
        "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      ).device,
    ).toBe("SM-S911B");
    expect(
      parseUserAgentLoose(
        "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
      ).device,
    ).toBe("Android");
  });

  it("counts known devices, active sessions, and most-recent / most-used badges", () => {
    const now = Date.parse("2026-11-10T17:00:00.000Z");
    const logs = [
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 iPhone 15",
        action: "login",
        createdAt: new Date(now - 4 * 3600_000),
      },
      {
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 iPhone 15",
        action: "login",
        createdAt: new Date(now - 5 * 3600_000),
      },
      {
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
        action: "login",
        createdAt: new Date(now - 86_400_000),
      },
      {
        userAgent:
          "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
        action: "login",
        createdAt: new Date(now - 90 * 86_400_000),
      },
    ];

    const built = buildDevicesFromLoginLogs(logs, {
      activeSocketCount: 3,
      formatLastSeen,
    });

    expect(built.knownDeviceCount).toBe(3);
    expect(built.activeSessionCount).toBe(3);
    expect(built.devicesWithActiveSessions).toBe(1);
    expect(built.knownDevices[0]!.label).toBe("iPhone 15");
    expect(built.knownDevices[0]!.badges).toContain("most_recent");
    expect(built.knownDevices[0]!.activeSessionCount).toBe(3);
    expect(built.knownDevices[0]!.sessionCount).toBe(2);

    const androidGeneric = built.knownDevices.find((d) => d.label === "Android");
    expect(androidGeneric?.modelNote).toBe("Model unavailable");
    expect(androidGeneric?.activeSessionCount).toBe(0);

    // Most used requires reliable multi-login history (iPhone 15 has 2).
    expect(built.knownDevices[0]!.badges).toContain("most_used");
  });

  it("surfaces unmatched active sessions as an unknown device", () => {
    const built = buildDevicesFromLoginLogs([], {
      activeSocketCount: 2,
      formatLastSeen,
    });
    expect(built.activeSessionCount).toBe(2);
    expect(built.knownDeviceCount).toBe(0);
    expect(built.unmatchedActiveSessions).toBe(2);
    expect(built.knownDevices[0]!.label).toBe("Unknown device");
    expect(built.knownDevices[0]!.modelNote).toBe("Model unavailable");
  });
});
