import { describe, expect, it } from "vitest";
import {
  hasPermission,
  permissionMapForRole,
  permissionsForRole,
  type AdminPermission,
} from "../lib/adminPermissions";

const SUPERADMIN_ONLY: AdminPermission[] = [
  "refunds",
  "adminTeam",
  "resetPasswords",
  "audit",
  "setScope",
  "rechargeCards",
  "chargebacks",
  "settings",
  "broadcast",
];

const FINANCIAL: AdminPermission[] = [
  "payments",
  "refunds",
  "finance",
  "chargebacks",
  "rechargeCards",
];

describe("admin permission matrix", () => {
  it("grants superadmin every capability", () => {
    const map = permissionMapForRole("superadmin");
    for (const key of Object.keys(map) as AdminPermission[]) {
      expect(map[key]).toBe(true);
    }
  });

  it("denies moderators financial, refund, team, and settings controls", () => {
    for (const perm of [...FINANCIAL, "adminTeam", "resetPasswords", "audit", "settings", "broadcast", "bans"]) {
      expect(hasPermission("moderator", perm)).toBe(false);
    }
    expect(hasPermission("moderator", "moderation")).toBe(true);
    expect(hasPermission("moderator", "listings")).toBe(true);
    expect(hasPermission("moderator", "reports")).toBe(true);
    expect(hasPermission("moderator", "users")).toBe(true);
  });

  it("gives admins finance visibility but not refunds or team management", () => {
    expect(hasPermission("admin", "finance")).toBe(true);
    expect(hasPermission("admin", "payments")).toBe(true);
    expect(hasPermission("admin", "bans")).toBe(true);
    expect(hasPermission("admin", "loans")).toBe(true);
    expect(hasPermission("admin", "translation")).toBe(true);
    for (const perm of SUPERADMIN_ONLY) {
      expect(hasPermission("admin", perm)).toBe(false);
    }
  });

  it("keeps support to users + reports only", () => {
    expect([...permissionsForRole("support")].sort()).toEqual(["reports", "users"]);
    expect(hasPermission("support", "moderation")).toBe(false);
    expect(hasPermission("user", "users")).toBe(false);
  });
});
