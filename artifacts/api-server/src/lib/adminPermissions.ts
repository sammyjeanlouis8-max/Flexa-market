/**
 * Enterprise admin permission matrix — source of truth for RBAC.
 *
 * Roles inherit upward: support ⊂ moderator ⊂ admin ⊂ superadmin.
 * Backend must enforce via requirePermission / hasPermission — never UI alone.
 */

/** Staff roles used by the permission matrix (mirrors auth.getRole). */
export type StaffRole = "user" | "support" | "moderator" | "admin" | "superadmin";

/** Stable permission keys used by /admin/me and requirePermission(). */
export type AdminPermission =
  | "users"
  | "bans"
  | "moderation"
  | "listings"
  | "reports"
  | "payments"
  | "refunds"
  | "boosts"
  | "adminTeam"
  | "resetPasswords"
  | "logs"
  | "audit"
  | "setScope"
  | "loans"
  | "rechargeCards"
  | "chargebacks"
  | "media"
  | "translation"
  | "fraud"
  | "returns"
  | "finance"
  | "settings"
  | "broadcast"
  | "analytics";

const ALL: AdminPermission[] = [
  "users", "bans", "moderation", "listings", "reports", "payments", "refunds",
  "boosts", "adminTeam", "resetPasswords", "logs", "audit", "setScope",
  "loans", "rechargeCards", "chargebacks", "media", "translation", "fraud",
  "returns", "finance", "settings", "broadcast", "analytics",
];

/** Default grants per role. Superadmin gets everything. */
const ROLE_PERMISSIONS: Record<Exclude<StaffRole, "user">, readonly AdminPermission[]> = {
  support: ["users", "reports"],
  moderator: [
    "users", "moderation", "listings", "reports", "logs",
  ],
  admin: [
    "users", "bans", "moderation", "listings", "reports",
    "payments", "boosts", "logs", "loans", "media", "translation",
    "fraud", "returns", "finance", "analytics",
  ],
  superadmin: ALL,
};

export function permissionsForRole(role: StaffRole): ReadonlySet<AdminPermission> {
  if (role === "user") return new Set();
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function hasPermission(role: StaffRole, permission: AdminPermission): boolean {
  return permissionsForRole(role).has(permission);
}

/** Boolean map for /admin/me clients. */
export function permissionMapForRole(role: StaffRole): Record<AdminPermission, boolean> {
  const granted = permissionsForRole(role);
  const out = {} as Record<AdminPermission, boolean>;
  for (const key of ALL) out[key] = granted.has(key);
  return out;
}

export const ADMIN_PERMISSION_KEYS: readonly AdminPermission[] = ALL;
