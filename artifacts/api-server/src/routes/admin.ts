import { Router } from "express";
import crypto from "node:crypto";
import { db, usersTable, listingsTable, boostsTable, reportsTable, adminLogsTable, categoriesTable, loginLogsTable, notificationsTable, transactionsTable, jobsTable, platformSettingsTable, messagesTable, conversationsTable, listingViewsTable, userRestrictionsTable, deliveriesTable, vendorSubscriptionsTable, promoWalletTable, flexCardDebtsTable } from "@workspace/db";
import { eq, count, sql, desc, and, ilike, or, ne, inArray, gte, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdmin, requireSuperAdmin, requireRole, getRole, getOnlineUserCount } from "../middlewares/auth";
import { hashPassword } from "../lib/auth";
import { logAdminAction } from "../lib/auditLogger";
import { sendEmailBatch, sendEmail } from "../lib/email";
import { accountRestrictedEmail, broadcastEmail } from "../lib/emailTemplates";
import { verifyAndCanonicalizeBoostVideoUrl } from "../lib/boostVideoAsset";

const router = Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _, ...rest } = user;
  return rest;
}

export type RiskLevel = "low" | "medium" | "high";
export interface RiskResult { score: number; level: RiskLevel; factors: string[] }

function computeRisk(
  user: typeof usersTable.$inferSelect,
  linkedByIpCount = 0,
  linkedByDeviceCount = 0,
): RiskResult {
  if (user.isTrusted) return { score: 0, level: "low", factors: ["Marked as trusted by admin"] };
  if (user.isBanned) return { score: 100, level: "high", factors: ["Account is banned"] };

  let score = 0;
  const factors: string[] = [];

  if (user.isFlagged) {
    score += 25;
    factors.push("Account was auto-flagged during registration");
  }
  if (linkedByIpCount >= 3) {
    score += 45;
    factors.push(`${linkedByIpCount} other accounts share the same registration IP`);
  } else if (linkedByIpCount >= 1) {
    score += 20;
    factors.push(`${linkedByIpCount} other account(s) share the same registration IP`);
  }
  if (linkedByDeviceCount >= 2) {
    score += 40;
    factors.push(`${linkedByDeviceCount} other accounts share the same device`);
  } else if (linkedByDeviceCount === 1) {
    score += 25;
    factors.push("Another account shares the same device fingerprint");
  }

  const level: RiskLevel = score >= 60 ? "high" : score >= 25 ? "medium" : "low";
  return { score: Math.min(score, 99), level, factors };
}

async function log(adminId: number, action: string, targetType?: string, targetId?: number, details?: string) {
  await db.insert(adminLogsTable).values({ adminId, action, targetType: targetType ?? null, targetId: targetId ?? null, details: details ?? null });
}

// ─── Hierarchical Scope System ────────────────────────────────────────────────

export const SCOPE_OPTIONS: Record<string, { departments: string[]; citiesByDept: Record<string, string[]> }> = {
  Haiti: {
    departments: ["Ouest", "Nord", "Nord-Est", "Nord-Ouest", "Artibonite", "Centre", "Sud", "Grand'Anse", "Sud-Est", "Nippes"],
    citiesByDept: {
      Ouest: ["Port-au-Prince", "Pétion-Ville", "Delmas", "Carrefour"],
      Nord: ["Cap-Haïtien"],
      "Nord-Ouest": ["Port-de-Paix"],
      "Sud-Est": ["Jacmel"],
      Sud: ["Les Cayes"],
      Artibonite: ["Gonaïves"],
      "Grand'Anse": ["Jérémie"],
    },
  },
  USA: {
    departments: ["Northeast", "Southeast", "Midwest", "Southwest", "West"],
    citiesByDept: {
      Northeast: ["New York, NY", "Brooklyn, NY", "Queens, NY", "Boston, MA", "Philadelphia, PA", "Newark, NJ"],
      Southeast: ["Miami, FL", "Orlando, FL", "Atlanta, GA", "Washington, DC"],
      Midwest: ["Chicago, IL"],
      Southwest: ["Houston, TX"],
      West: ["Los Angeles, CA"],
    },
  },
  "Dominican Republic": {
    departments: ["Norte", "Sur", "Este"],
    citiesByDept: {
      Norte: ["Santiago", "Puerto Plata"],
      Sur: ["Santo Domingo", "San Pedro de Macorís"],
      Este: ["La Romana", "Punta Cana", "Higüey"],
    },
  },
  Canada: {
    departments: ["Quebec", "Ontario", "British Columbia", "Alberta"],
    citiesByDept: {
      Quebec: ["Montréal, QC", "Québec, QC"],
      Ontario: ["Toronto, ON", "Ottawa, ON"],
      "British Columbia": ["Vancouver, BC"],
      Alberta: ["Calgary, AB", "Edmonton, AB"],
    },
  },
};

type AdminUser = typeof usersTable.$inferSelect;

/** Parse adminScopeCountries JSON field into a string array (empty = not set) */
function parseAdminCountries(admin: AdminUser): string[] {
  if (!admin.adminScopeCountries) return [];
  try { return JSON.parse(admin.adminScopeCountries) as string[]; } catch { return []; }
}

/** Returns ALL countries this admin has scope over (combines single + multi-country fields). Empty = super/global. */
function getAdminCountryList(admin: AdminUser): string[] {
  const multi = parseAdminCountries(admin);
  if (multi.length > 0) return multi;
  if (admin.adminScopeCountry) return [admin.adminScopeCountry];
  return [];
}

/** Returns true if the given country is within the admin's geographic scope. */
function isCountryInAdminScope(admin: AdminUser, country: string | null | undefined): boolean {
  if (admin.isSuperAdmin) return true;
  const countries = getAdminCountryList(admin);
  if (countries.length === 0) return true; // global admin
  return !!country && countries.includes(country);
}

/** Returns a human-readable scope level label */
export function getScopeLevel(admin: AdminUser): string {
  if (admin.isSuperAdmin) return "Super Admin";
  if (admin.adminScopeCity) return "City Admin";
  if (admin.adminScopeDepartment) return "Department Admin";
  const countries = parseAdminCountries(admin);
  if (countries.length > 1) return "Multi-Country Admin";
  if (countries.length === 1 || admin.adminScopeCountry) return "Country Admin";
  return "Global Admin";
}

/** Builds listing-table WHERE conditions enforcing admin's geographic scope */
function getListingScopeConditions(admin: AdminUser): ReturnType<typeof eq>[] {
  if (admin.isSuperAdmin) return [];
  const conds: ReturnType<typeof eq>[] = [];
  const countries = parseAdminCountries(admin);
  if (countries.length > 1) {
    conds.push(inArray(listingsTable.country!, countries) as any);
  } else if (countries.length === 1) {
    conds.push(eq(listingsTable.country!, countries[0]));
  } else if (admin.adminScopeCountry) {
    conds.push(eq(listingsTable.country!, admin.adminScopeCountry));
  }
  if (admin.adminScopeCity) {
    conds.push(eq(listingsTable.city!, admin.adminScopeCity));
  } else if (admin.adminScopeDepartment && admin.adminScopeCountry) {
    const scopeData = SCOPE_OPTIONS[admin.adminScopeCountry];
    const deptCities = scopeData?.citiesByDept[admin.adminScopeDepartment];
    if (deptCities && deptCities.length > 0) {
      conds.push(inArray(listingsTable.city!, deptCities) as any);
    }
  }
  return conds;
}

/** Builds user-table WHERE conditions enforcing admin's geographic scope */
function getUserScopeConditions(admin: AdminUser): ReturnType<typeof eq>[] {
  if (admin.isSuperAdmin) return [];
  const conds: ReturnType<typeof eq>[] = [];
  const countries = parseAdminCountries(admin);
  if (countries.length > 1) {
    conds.push(inArray(usersTable.country!, countries) as any);
  } else if (countries.length === 1) {
    conds.push(eq(usersTable.country!, countries[0]));
  } else if (admin.adminScopeCountry) {
    conds.push(eq(usersTable.country!, admin.adminScopeCountry));
  }
  return conds;
}

/**
 * 403-guard for user-scoped actions.
 * Returns an error message if the calling admin is not allowed to act on
 * `target`, or null if the action is permitted.
 */
function assertUserInScope(admin: AdminUser, target: AdminUser): string | null {
  if (admin.isSuperAdmin) return null;
  const countries = parseAdminCountries(admin);
  if (countries.length > 0) {
    if (target.country && !countries.includes(target.country)) {
      return `Access denied: this user is in "${target.country}" — outside your scope (${countries.join(", ")})`;
    }
    return null;
  }
  if (admin.adminScopeCountry && target.country !== admin.adminScopeCountry) {
    return `Access denied: this user is in "${target.country ?? "unknown"}" — outside your scope (${admin.adminScopeCountry})`;
  }
  return null;
}

/**
 * 403-guard for listing-scoped actions.
 * Returns an error message if the calling admin is not allowed to act on
 * `listing`, or null if the action is permitted.
 */
function assertListingInScope(admin: AdminUser, listing: typeof listingsTable.$inferSelect): string | null {
  if (admin.isSuperAdmin) return null;
  const countries = parseAdminCountries(admin);
  if (countries.length > 0) {
    if (listing.country && !countries.includes(listing.country)) {
      return `Access denied: listing is in "${listing.country}" — outside your scope (${countries.join(", ")})`;
    }
    return null;
  }
  if (admin.adminScopeCountry && listing.country !== admin.adminScopeCountry) {
    return `Access denied: listing is in "${listing.country ?? "unknown"}" — outside your scope (${admin.adminScopeCountry})`;
  }
  if (admin.adminScopeCity && listing.city !== admin.adminScopeCity) {
    return `Access denied: listing is in "${listing.city ?? "unknown"}" — outside your city scope (${admin.adminScopeCity})`;
  }
  if (admin.adminScopeDepartment && admin.adminScopeCountry && !admin.adminScopeCity) {
    const deptCities = SCOPE_OPTIONS[admin.adminScopeCountry]?.citiesByDept[admin.adminScopeDepartment] ?? [];
    if (deptCities.length > 0 && listing.city && !deptCities.includes(listing.city)) {
      return `Access denied: listing is in "${listing.city}" — outside your department scope (${admin.adminScopeDepartment})`;
    }
  }
  return null;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  const admin = req.user!;
  const lScope = getListingScopeConditions(admin);
  const uScope = getUserScopeConditions(admin);

  const listingWhere = (extra?: any) => {
    const all = [...lScope, ...(extra ? [extra] : [])];
    return all.length ? and(...all) : undefined;
  };
  const userWhere = (extra?: any) => {
    const all = [...uScope, ...(extra ? [extra] : [])];
    return all.length ? and(...all) : undefined;
  };

  const [
    [totalUsers], [totalListings], [activeListings],
    [boostedListings], [featuredListings], [totalBoosts],
    [pendingReports], [flaggedUsers], [bannedUsers], [adminUsers],
    revenueResult,
    [activeSubscriptions], [graceSubscriptions],
  ] = await Promise.all([
    db.select({ count: count() }).from(usersTable).where(userWhere()),
    db.select({ count: count() }).from(listingsTable).where(listingWhere()),
    db.select({ count: count() }).from(listingsTable).where(listingWhere(eq(listingsTable.status, "available"))),
    db.select({ count: count() }).from(listingsTable).where(listingWhere(eq(listingsTable.isBoosted, true))),
    db.select({ count: count() }).from(listingsTable).where(listingWhere(eq(listingsTable.isFeatured, true))),
    db.select({ count: count() }).from(boostsTable),
    db.select({ count: count() }).from(reportsTable).where(eq(reportsTable.status, "pending")),
    db.select({ count: count() }).from(usersTable).where(userWhere(eq(usersTable.isFlagged, true))),
    db.select({ count: count() }).from(usersTable).where(userWhere(eq(usersTable.isBanned, true))),
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.isAdmin, true)),
    db.select({ total: sql<number>`COALESCE(SUM(price), 0)` }).from(boostsTable),
    db.select({ count: count() }).from(vendorSubscriptionsTable).where(eq(vendorSubscriptionsTable.status, "active")),
    db.select({ count: count() }).from(vendorSubscriptionsTable).where(eq(vendorSubscriptionsTable.status, "grace_period")),
  ]);

  res.json({
    totalUsers: Number(totalUsers.count),
    onlineUsers: getOnlineUserCount(),
    totalListings: Number(totalListings.count),
    activeListings: Number(activeListings.count),
    boostedListings: Number(boostedListings.count),
    featuredListings: Number(featuredListings.count),
    totalBoosts: Number(totalBoosts.count),
    pendingReports: Number(pendingReports.count),
    flaggedUsers: Number(flaggedUsers.count),
    bannedUsers: Number(bannedUsers.count),
    adminUsers: Number(adminUsers.count),
    totalRevenue: Number(revenueResult[0]?.total ?? 0),
    activeSubscriptions: Number(activeSubscriptions.count),
    graceSubscriptions: Number(graceSubscriptions.count),
    // Scope metadata for the frontend to display
    scopeLevel: getScopeLevel(admin),
    scopeCountry: admin.adminScopeCountry ?? null,
    scopeDepartment: admin.adminScopeDepartment ?? null,
    scopeCity: admin.adminScopeCity ?? null,
  });
});

// ─── Password Hash Stats ──────────────────────────────────────────────────────

const NUDGE_SETTING_KEY = "last_password_nudge_sent_at";
const NUDGE_COOLDOWN_HOURS_KEY = "nudge_cooldown_hours";
const DEFAULT_NUDGE_COOLDOWN_HOURS = 24;
const ALLOWED_COOLDOWN_HOURS = [6, 12, 24, 48, 72] as const;

async function getNudgeCooldownHours(): Promise<number> {
  const [setting] = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, NUDGE_COOLDOWN_HOURS_KEY));
  const parsed = setting?.value ? parseInt(setting.value, 10) : NaN;
  return !isNaN(parsed) && (ALLOWED_COOLDOWN_HOURS as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_NUDGE_COOLDOWN_HOURS;
}

function hoursToMs(hours: number): number {
  return hours * 60 * 60 * 1000;
}

router.get("/admin/password-hash-stats", requireAdmin, async (_req, res): Promise<void> => {
  const SHA256_FILTER = sql`(length(${usersTable.passwordHash}) = 64 AND ${usersTable.passwordHash} ~ '^[0-9a-fA-F]{64}$')`;
  const BCRYPT_FILTER = sql`${usersTable.passwordHash} LIKE '$2%'`;
  const PHONE_ONLY_FILTER = sql`${usersTable.passwordHash} = 'PHONE_ONLY_NO_PASSWORD'`;

  const [row] = await db.select({
    sha256: sql<number>`COUNT(*) FILTER (WHERE ${SHA256_FILTER})`,
    bcrypt: sql<number>`COUNT(*) FILTER (WHERE ${BCRYPT_FILTER})`,
    phoneOnly: sql<number>`COUNT(*) FILTER (WHERE ${PHONE_ONLY_FILTER})`,
    sha256NoPhone: sql<number>`COUNT(*) FILTER (WHERE ${SHA256_FILTER} AND ${usersTable.phone} IS NULL)`,
    other: sql<number>`COUNT(*) FILTER (WHERE NOT ${SHA256_FILTER} AND NOT ${BCRYPT_FILTER} AND NOT ${PHONE_ONLY_FILTER})`,
    // Users eligible to receive the nudge email — all SHA-256 users who can still log in
    // (not banned). notifyEmail is intentionally ignored because this is a
    // security-critical message, not a marketing email.
    eligibleForNudge: sql<number>`COUNT(*) FILTER (WHERE ${SHA256_FILTER} AND ${usersTable.isBanned} = false)`,
    total: count(),
  }).from(usersTable);

  const [[nudgeSetting], nudgeCooldownHours, lastResetRow] = await Promise.all([
    db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, NUDGE_SETTING_KEY)),
    getNudgeCooldownHours(),
    db
      .select({ actorName: usersTable.name, createdAt: adminLogsTable.createdAt })
      .from(adminLogsTable)
      .innerJoin(usersTable, eq(adminLogsTable.adminId, usersTable.id))
      .where(eq(adminLogsTable.action, "reset_nudge_cooldown"))
      .orderBy(desc(adminLogsTable.createdAt))
      .limit(1),
  ]);
  const nudgeCooldownMs = hoursToMs(nudgeCooldownHours);

  const rawNudgeValue = nudgeSetting?.value ?? null;
  const nudgeParsed = rawNudgeValue ? new Date(rawNudgeValue) : null;
  const lastNudgeSentAt = nudgeParsed && !isNaN(nudgeParsed.getTime()) ? nudgeParsed.toISOString() : null;
  const nudgeCooldownEndsAt = lastNudgeSentAt
    ? new Date(new Date(lastNudgeSentAt).getTime() + nudgeCooldownMs).toISOString()
    : null;

  const lastResetEvent = lastResetRow[0] ?? null;

  res.json({
    sha256: Number(row.sha256),
    sha256NoPhone: Number(row.sha256NoPhone),
    bcrypt: Number(row.bcrypt),
    phoneOnly: Number(row.phoneOnly),
    other: Number(row.other),
    eligibleForNudge: Number(row.eligibleForNudge),
    total: Number(row.total),
    lastNudgeSentAt,
    nudgeCooldownEndsAt,
    nudgeCooldownHours,
    lastCooldownResetBy: lastResetEvent ? lastResetEvent.actorName : null,
    lastCooldownResetAt: lastResetEvent ? lastResetEvent.createdAt.toISOString() : null,
  });
});

// ─── Invalidate SHA-256 Passwords (Super Admin only) ─────────────────────────
// Sets all SHA-256 password hashes (for users who have a phone number) to
// PHONE_ONLY_NO_PASSWORD so those users can no longer sign in with their old
// password. They must use the phone OTP flow (/auth/forgot-password) to set a
// new bcrypt password. Accounts with no phone on file are intentionally
// skipped — they have no OTP recovery path and would be permanently locked
// out. The skipped count is returned so admins can handle those accounts
// separately. This action is irreversible and is logged in the admin audit log.

router.post("/admin/invalidate-sha256-passwords", requireSuperAdmin, async (req, res): Promise<void> => {
  const SHA256_CONDITION = sql`length(${usersTable.passwordHash}) = 64 AND ${usersTable.passwordHash} ~ '^[0-9a-fA-F]{64}$'`;

  // Count SHA-256 accounts with no phone before touching anything
  const [skipRow] = await db
    .select({ count: count() })
    .from(usersTable)
    .where(sql`${SHA256_CONDITION} AND ${usersTable.phone} IS NULL`);
  const skipped = Number(skipRow.count);

  // Only invalidate accounts that have a phone number and can recover via OTP
  const result = await db
    .update(usersTable)
    .set({ passwordHash: "PHONE_ONLY_NO_PASSWORD" })
    .where(sql`${SHA256_CONDITION} AND ${usersTable.phone} IS NOT NULL`)
    .returning({ id: usersTable.id });

  const affected = result.length;
  await log(req.userId!, "invalidate_sha256_passwords", undefined, undefined,
    `Force-invalidated ${affected} SHA-256 password hash(es) — accounts must reset via phone OTP; ${skipped} skipped (no phone on file)`);

  res.json({
    message: `${affected} SHA-256 password hash(es) invalidated. Affected users must reset their password via phone OTP.`,
    affected,
    skipped,
    ...(skipped > 0 ? { warning: `${skipped} SHA-256 account(s) were skipped because they have no phone number on file and cannot recover via OTP. Review these accounts manually.` } : {}),
  });
});

// ─── Notify Legacy-Password Users (Super Admin only) ─────────────────────────
// Sends a password-upgrade reminder email to every non-banned user whose
// password is still stored as a plain SHA-256 hex hash.  The notifyEmail
// preference is intentionally ignored — this is a security-critical message,
// not a marketing email, so all reachable accounts are included.
// Every trigger is recorded in the admin audit log (including zero-send runs).

router.post("/admin/notify-legacy-password-users", requireSuperAdmin, async (req, res): Promise<void> => {
  // ── Cooldown check ──────────────────────────────────────────────────────────
  const [[nudgeSetting], nudgeCooldownHours] = await Promise.all([
    db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, NUDGE_SETTING_KEY)),
    getNudgeCooldownHours(),
  ]);
  const nudgeCooldownMs = hoursToMs(nudgeCooldownHours);

  if (nudgeSetting?.value) {
    const lastSent = new Date(nudgeSetting.value);
    if (!isNaN(lastSent.getTime())) {
      const cooldownEndsAt = new Date(lastSent.getTime() + nudgeCooldownMs);
      if (cooldownEndsAt > new Date()) {
        await log(
          req.userId!,
          "notify_legacy_password_users_blocked",
          undefined,
          undefined,
          `Blocked email blast attempt — cooldown active until ${cooldownEndsAt.toISOString()} (last sent: ${lastSent.toISOString()})`,
        );
        res.status(429).json({
          error: `A password-upgrade email blast was already sent recently. You can send the next one after ${cooldownEndsAt.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.`,
          cooldownEndsAt: cooldownEndsAt.toISOString(),
          lastSentAt: lastSent.toISOString(),
        });
        return;
      }
    }
  }

  const SHA256_CONDITION = sql`length(${usersTable.passwordHash}) = 64 AND ${usersTable.passwordHash} ~ '^[0-9a-fA-F]{64}$'`;

  // Target all SHA-256 users who can still log in (not banned).
  // notifyEmail is intentionally ignored because this is a security-critical
  // message — users must be made aware regardless of marketing preferences.
  const legacyUsers = await db
    .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(sql`${SHA256_CONDITION} AND ${usersTable.isBanned} = false`);

  if (legacyUsers.length === 0) {
    await log(
      req.userId!,
      "notify_legacy_password_users",
      undefined,
      undefined,
      "Password-upgrade reminder email campaign triggered — no eligible users found (0 sent)",
    );
    res.json({ sent: 0, total: 0, message: "No users with legacy SHA-256 passwords found." });
    return;
  }

  const appDomain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim() || "flexamarket.com";
  const settingsUrl = `https://${appDomain}/settings/security`;

  const subject = "Action Required: Upgrade Your Password";
  const text = [
    "Hello,",
    "",
    "Our platform recently upgraded its security infrastructure. Your account still uses an older password format that will be phased out soon.",
    "",
    "Please log in and change your password now to avoid losing access to your account:",
    settingsUrl,
    "",
    "Steps:",
    "1. Log in to your account",
    "2. Go to Settings → Security",
    "3. Set a new password",
    "",
    "If you have any questions, feel free to contact our support team.",
    "",
    "— The FLEXA MARKET Team",
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
        <tr><td style="background:#f59e0b;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Action Required: Upgrade Your Password</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Hello,</p>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
            Our platform recently upgraded its security infrastructure. Your account still uses an older password format that will be phased out soon.
          </p>
          <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
            Please update your password now to avoid losing access to your account.
          </p>
          <div style="text-align:center;margin:0 0 28px;">
            <a href="${settingsUrl}" style="display:inline-block;background:#f59e0b;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;">
              Change My Password
            </a>
          </div>
          <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.5;"><strong>Steps:</strong></p>
          <ol style="margin:0 0 24px;padding-left:20px;color:#6b7280;font-size:13px;line-height:1.8;">
            <li>Log in to your account</li>
            <li>Go to <strong>Settings → Security</strong></li>
            <li>Set a new password</li>
          </ol>
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">
            If you have any questions, contact our support team. You received this email because you have an account on FLEXA MARKET.
          </p>
        </td></tr>
        <tr><td style="background:#f3f4f6;padding:16px 32px;text-align:center;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© FLEXA MARKET. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  // Stamp the blast timestamp BEFORE sending to close the concurrency window.
  // Two simultaneous requests could both pass the cooldown check above, but only
  // one will actually send because the upsert is idempotent — the second request's
  // POST will either be serialized after this upsert (and blocked by the cooldown
  // re-check on the next call) or will overwrite with the same time window.
  // Writing before send is intentional: even a partially-delivered blast should
  // start the cooldown clock so admins cannot immediately re-trigger.
  const sentAt = new Date().toISOString();
  await db
    .insert(platformSettingsTable)
    .values({ key: NUDGE_SETTING_KEY, value: sentAt })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: sentAt, updatedAt: new Date() } });

  const recipients = legacyUsers.map(u => ({ email: u.email, name: u.name }));
  const sent = await sendEmailBatch(recipients, subject, text, html);

  await log(
    req.userId!,
    "notify_legacy_password_users",
    undefined,
    undefined,
    `Sent password-upgrade reminder emails to ${sent} of ${legacyUsers.length} eligible user(s) with legacy SHA-256 passwords`,
  );

  res.json({
    sent,
    total: legacyUsers.length,
    lastNudgeSentAt: sentAt,
    nudgeCooldownEndsAt: new Date(new Date(sentAt).getTime() + nudgeCooldownMs).toISOString(),
    message: sent === legacyUsers.length
      ? `Reminder emails sent to all ${sent} user(s) with legacy passwords.`
      : `Reminder emails sent to ${sent} of ${legacyUsers.length} eligible user(s). ${legacyUsers.length - sent} failed — check server logs.`,
  });
});

// ─── Reset Nudge Cooldown (Super Admin only) ──────────────────────────────────

router.post("/admin/reset-nudge-cooldown", requireSuperAdmin, async (req, res): Promise<void> => {
  await db.delete(platformSettingsTable).where(eq(platformSettingsTable.key, NUDGE_SETTING_KEY));
  await log(req.userId!, "reset_nudge_cooldown", undefined, undefined,
    "Manually reset the password-upgrade email blast cooldown");
  res.json({ message: "Cooldown reset — blast can be sent immediately." });
});

// ─── Update Nudge Cooldown Duration (Super Admin only) ────────────────────────

router.post("/admin/nudge-cooldown-settings", requireSuperAdmin, async (req, res): Promise<void> => {
  const { hours } = req.body as { hours: unknown };
  const parsed = typeof hours === "number" ? hours : parseInt(String(hours), 10);
  if (isNaN(parsed) || !(ALLOWED_COOLDOWN_HOURS as readonly number[]).includes(parsed)) {
    res.status(400).json({ error: `Invalid cooldown. Allowed values: ${ALLOWED_COOLDOWN_HOURS.join(", ")} hours.` });
    return;
  }
  await db
    .insert(platformSettingsTable)
    .values({ key: NUDGE_COOLDOWN_HOURS_KEY, value: String(parsed) })
    .onConflictDoUpdate({ target: platformSettingsTable.key, set: { value: String(parsed), updatedAt: new Date() } });
  await log(req.userId!, "update_nudge_cooldown_duration", undefined, undefined,
    `Updated email blast cooldown duration to ${parsed}h`);
  res.json({ nudgeCooldownHours: parsed });
});

// ─── Users ────────────────────────────────────────────────────────────────────

router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const { country, q } = req.query as Record<string, string>;
  const admin = req.user!;
  const scopeConds = getUserScopeConditions(admin);
  const conditions: any[] = [...scopeConds];
  // Scoped admins can only filter within their scope; super admin can filter by any country
  if (country && admin.isSuperAdmin) conditions.push(eq(usersTable.country, country));
  if (q) conditions.push(or(ilike(usersTable.name, `%${q}%`), ilike(usersTable.email, `%${q}%`))!);
  const users = await db.select().from(usersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(usersTable.createdAt));
  res.json(users.map(formatUser));
});

router.get("/admin/users/:id/activity", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, user);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  const ACTIVE_DELIVERY_STATUSES = ["waiting", "accepted", "picked_up", "in_transit", "arrived", "seller_delivering", "seller_arrived"];

  const [listings, purchases, sales, loginLogs, wallet, activeDeliveriesBuyer, activeDeliveriesSeller, activeDebts, subscription] = await Promise.all([
    // Listings created by user
    db.select({ id: listingsTable.id, title: listingsTable.title, status: listingsTable.status, createdAt: listingsTable.createdAt, price: listingsTable.price, currency: sql<string>`${listingsTable}.currency` })
      .from(listingsTable).where(eq(listingsTable.sellerId, id)).orderBy(desc(listingsTable.createdAt)).limit(30),

    // Purchases made by user
    db.select({
      id: transactionsTable.id,
      listingId: transactionsTable.listingId,
      amount: transactionsTable.amount,
      currency: transactionsTable.currency,
      paymentMethod: transactionsTable.paymentMethod,
      paymentStatus: transactionsTable.paymentStatus,
      description: transactionsTable.description,
      createdAt: transactionsTable.createdAt,
    }).from(transactionsTable)
      .where(and(eq(transactionsTable.userId, id), eq(transactionsTable.type, "purchase")))
      .orderBy(desc(transactionsTable.createdAt)).limit(30),

    // Sales made by user (as seller)
    db.select({
      id: transactionsTable.id,
      listingId: transactionsTable.listingId,
      amount: transactionsTable.amount,
      currency: transactionsTable.currency,
      paymentMethod: transactionsTable.paymentMethod,
      paymentStatus: transactionsTable.paymentStatus,
      description: transactionsTable.description,
      commissionAmount: transactionsTable.commissionAmount,
      sellerEarnings: transactionsTable.sellerEarnings,
      createdAt: transactionsTable.createdAt,
    }).from(transactionsTable)
      .where(eq(transactionsTable.sellerUserId, id))
      .orderBy(desc(transactionsTable.createdAt)).limit(30),

    // Login history
    db.select({ id: loginLogsTable.id, action: loginLogsTable.action, ip: loginLogsTable.ip, userAgent: loginLogsTable.userAgent, createdAt: loginLogsTable.createdAt })
      .from(loginLogsTable).where(eq(loginLogsTable.userId, id)).orderBy(desc(loginLogsTable.createdAt)).limit(30),

    // Wallet balance
    db.select({ balanceUsd: promoWalletTable.balanceUsd, promoBalance: promoWalletTable.promoBalance })
      .from(promoWalletTable).where(eq(promoWalletTable.userId, id)).limit(1),

    // Active deliveries where user is buyer
    db.select({
      id: deliveriesTable.id, status: deliveriesTable.status, deliveryMethod: deliveriesTable.deliveryMethod,
      deliveryCity: deliveriesTable.deliveryCity, totalAmount: deliveriesTable.totalAmount,
      currency: deliveriesTable.currency, createdAt: deliveriesTable.createdAt, updatedAt: deliveriesTable.updatedAt,
      role: sql<string>`'buyer'`,
    }).from(deliveriesTable)
      .where(and(eq(deliveriesTable.buyerId, id), inArray(deliveriesTable.status, ACTIVE_DELIVERY_STATUSES)))
      .orderBy(desc(deliveriesTable.updatedAt)).limit(15),

    // Active deliveries where user is seller
    db.select({
      id: deliveriesTable.id, status: deliveriesTable.status, deliveryMethod: deliveriesTable.deliveryMethod,
      deliveryCity: deliveriesTable.deliveryCity, totalAmount: deliveriesTable.totalAmount,
      currency: deliveriesTable.currency, createdAt: deliveriesTable.createdAt, updatedAt: deliveriesTable.updatedAt,
      role: sql<string>`'seller'`,
    }).from(deliveriesTable)
      .where(and(eq(deliveriesTable.sellerId, id), inArray(deliveriesTable.status, ACTIVE_DELIVERY_STATUSES)))
      .orderBy(desc(deliveriesTable.updatedAt)).limit(15),

    // Active debts
    db.select({
      id: flexCardDebtsTable.id, reason: flexCardDebtsTable.reason, referenceCode: flexCardDebtsTable.referenceCode,
      originalAmountUsd: flexCardDebtsTable.originalAmountUsd, outstandingUsd: flexCardDebtsTable.outstandingUsd,
      status: flexCardDebtsTable.status, deadline: flexCardDebtsTable.deadline, createdAt: flexCardDebtsTable.createdAt,
    }).from(flexCardDebtsTable)
      .where(and(eq(flexCardDebtsTable.userId, id), eq(flexCardDebtsTable.status, "active")))
      .orderBy(desc(flexCardDebtsTable.createdAt)).limit(10),

    // Current subscription
    db.select({
      id: vendorSubscriptionsTable.id, plan: vendorSubscriptionsTable.plan, status: vendorSubscriptionsTable.status,
      startedAt: vendorSubscriptionsTable.startedAt, expiresAt: vendorSubscriptionsTable.expiresAt,
      amountUsd: vendorSubscriptionsTable.amountUsd, interval: vendorSubscriptionsTable.interval,
      createdAt: vendorSubscriptionsTable.createdAt,
    }).from(vendorSubscriptionsTable)
      .where(eq(vendorSubscriptionsTable.userId, id))
      .orderBy(desc(vendorSubscriptionsTable.createdAt)).limit(1),
  ]);

  // Merge buyer/seller active deliveries, deduplicate by id
  const seenDeliveries = new Set<number>();
  const activeDeliveries: typeof activeDeliveriesBuyer = [];
  for (const d of [...activeDeliveriesBuyer, ...activeDeliveriesSeller]) {
    if (!seenDeliveries.has(d.id)) { seenDeliveries.add(d.id); activeDeliveries.push(d); }
  }

  res.json({
    user: formatUser(user),
    listings,
    purchases,
    sales,
    loginLogs: loginLogs.map(l => ({ ...l, ...parseUserAgent(l.userAgent) })),
    wallet: wallet[0] ?? null,
    activeDeliveries,
    activeDebts,
    subscription: subscription[0] ?? null,
  });
});

// Parse a user-agent string into human-readable device/OS/browser info
function parseUserAgent(ua: string | null): { device: string; os: string; browser: string } {
  if (!ua) return { device: "Enkoni", os: "—", browser: "—" };
  let device = "Òdinatè";
  let os = "—";
  let browser = "—";
  // Device
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) {
    const m = ua.match(/Android [^;]+; ([^)]+)\)/);
    device = m ? m[1].trim() : "Android";
  } else if (/Macintosh/.test(ua)) device = "Mac";
  else if (/Windows/.test(ua)) device = "Windows PC";
  else if (/Linux/.test(ua)) device = "Linux";
  // OS
  const iosM = ua.match(/OS ([\d_]+) like/);
  if (iosM) os = "iOS " + iosM[1].replace(/_/g, ".");
  else {
    const andM = ua.match(/Android ([\d.]+)/);
    if (andM) os = "Android " + andM[1];
    else {
      const winM = ua.match(/Windows NT ([\d.]+)/);
      if (winM) { const nm: Record<string, string> = { "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }; os = "Windows " + (nm[winM[1]] || winM[1]); }
      else { const macM = ua.match(/Mac OS X ([\d_]+)/); if (macM) os = "macOS " + macM[1].replace(/_/g, "."); }
    }
  }
  // Browser
  if (/CriOS/.test(ua)) browser = "Chrome iOS";
  else if (/FxiOS/.test(ua)) browser = "Firefox iOS";
  else if (/SamsungBrowser/.test(ua)) browser = "Samsung Browser";
  else if (/EdgA?\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && /Version\//.test(ua)) browser = "Safari";
  return { device, os, browser };
}

router.get("/admin/users/:id/security", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const isSuperAdmin = !!(req.user as any)?.isSuperAdmin;

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  // Super admin sees ALL login history; regular admin sees last 60
  const loginLogs = isSuperAdmin
    ? await db.select().from(loginLogsTable).where(eq(loginLogsTable.userId, id)).orderBy(desc(loginLogsTable.createdAt))
    : await db.select().from(loginLogsTable).where(eq(loginLogsTable.userId, id)).orderBy(desc(loginLogsTable.createdAt)).limit(60);

  const totalLoginCount = loginLogs.length; // accurate for admin (≤60), exact for super admin

  // Build unique device fingerprints from user agents
  const deviceMap = new Map<string, { device: string; os: string; browser: string; ua: string; firstSeen: Date; lastSeen: Date; count: number }>();
  for (const log of loginLogs) {
    const ua = log.userAgent ?? null;
    const parsed = parseUserAgent(ua);
    const key = `${parsed.device}|${parsed.os}|${parsed.browser}`;
    const ts = new Date(log.createdAt);
    if (deviceMap.has(key)) {
      const entry = deviceMap.get(key)!;
      entry.count++;
      if (ts > entry.lastSeen) entry.lastSeen = ts;
      if (ts < entry.firstSeen) entry.firstSeen = ts;
    } else {
      deviceMap.set(key, { ...parsed, ua: ua ?? "", firstSeen: ts, lastSeen: ts, count: 1 });
    }
  }
  const uniqueDevices = Array.from(deviceMap.values()).sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
  const latestDevice = uniqueDevices[0] ?? null;

  const linkedByIp = target.registrationIp
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, country: usersTable.country, isBanned: usersTable.isBanned, isFlagged: usersTable.isFlagged, createdAt: usersTable.createdAt })
        .from(usersTable).where(and(eq(usersTable.registrationIp, target.registrationIp), ne(usersTable.id, id)))
    : [];

  const linkedByDevice = target.deviceId
    ? await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, country: usersTable.country, isBanned: usersTable.isBanned, isFlagged: usersTable.isFlagged, createdAt: usersTable.createdAt })
        .from(usersTable).where(and(eq(usersTable.deviceId, target.deviceId), ne(usersTable.id, id)))
    : [];

  const linkedAccounts = [...linkedByIp, ...linkedByDevice].filter((u, _, arr) =>
    arr.findIndex(x => x.id === u.id) === arr.indexOf(u)
  );

  const risk = computeRisk(target, linkedByIp.length, linkedByDevice.length);

  res.json({
    // === Shared: both admin and super admin ===
    registrationIp: target.registrationIp,
    isTrusted: target.isTrusted,
    phone: target.phone,
    location: (target as any).location ?? null,
    latitude: (target as any).latitude ?? null,
    longitude: (target as any).longitude ?? null,
    lastSeenAt: (target as any).lastSeenAt ?? null,
    latestDevice,                       // parsed model of most recent device
    uniqueDevices: isSuperAdmin ? uniqueDevices : uniqueDevices.slice(0, 5),
    loginLogs: isSuperAdmin ? loginLogs : loginLogs.slice(0, 60),
    totalLoginCount,
    linkedAccounts,
    linkedByIpCount: linkedByIp.length,
    linkedByDeviceCount: linkedByDevice.length,
    risk,
    // === Super admin only ===
    deviceId: isSuperAdmin ? target.deviceId : (target.deviceId ? target.deviceId.slice(0, 8) + "••••••••••••" : null),
    deviceIdFull: isSuperAdmin,         // flag so frontend knows if deviceId is full or masked
    allLogCount: isSuperAdmin ? loginLogs.length : null,
    rawUserAgents: isSuperAdmin ? loginLogs.map(l => ({ ua: l.userAgent, ip: l.ip, at: l.createdAt, action: l.action })).slice(0, 200) : null,
  });
});

// PATCH /admin/users/:id/phone — any admin can override a user's phone number
router.patch("/admin/users/:id/phone", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : null;
  if (!phone) { res.status(400).json({ error: "phone is required" }); return; }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isSuperAdmin) { res.status(403).json({ error: "Cannot modify another super admin" }); return; }

  // Check uniqueness
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(and(eq(usersTable.phone, phone), ne(usersTable.id, id)));
  if (existing) { res.status(409).json({ error: "Nimewo telefòn sa a deja itilize pa yon lòt kont" }); return; }

  await db.update(usersTable).set({ phone } as any).where(eq(usersTable.id, id));
  req.log.info({ adminId: req.userId, targetId: id, phone }, "admin phone override");
  res.json({ success: true, phone });
});

router.post("/admin/users/:id/trust", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isTrusted: true, isFlagged: false, flagReason: null }).where(eq(usersTable.id, id));
  await log(req.userId!, "trust_user", "user", id, `Marked ${target.name} as trusted`);
  res.json({ message: "User marked as trusted" });
});

router.post("/admin/users/:id/untrust", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isTrusted: false }).where(eq(usersTable.id, id));
  await log(req.userId!, "untrust_user", "user", id, `Removed trusted status from ${target.name}`);
  res.json({ message: "Trusted status removed" });
});

router.post("/admin/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isSuperAdmin) { res.status(403).json({ error: "Cannot ban a Super Admin" }); return; }
  if (target.isAdmin && !req.user?.isSuperAdmin) { res.status(403).json({ error: "Only Super Admins can ban admins" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isBanned: true, isFlagged: false }).where(eq(usersTable.id, id));
  await db.update(listingsTable).set({ status: "removed" }).where(and(eq(listingsTable.sellerId, id), eq(listingsTable.status, "available")));
  await log(req.userId!, "ban_user", "user", id, `Banned user: ${target.name} (${target.email})`);
  await logAdminAction(req, { actionType: "user_ban", actionCategory: "user", description: `Bann itilizatè: ${target.name} (${target.email})`, targetType: "user", targetId: id, targetName: target.name, riskLevel: "critical" });
  res.json({ message: "User banned" });
});

router.post("/admin/users/:id/unban", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.id, id));
  await log(req.userId!, "unban_user", "user", id, `Unbanned user: ${target.name}`);
  await logAdminAction(req, { actionType: "user_unban", actionCategory: "user", description: `Leve bann sou itilizatè: ${target.name}`, targetType: "user", targetId: id, targetName: target.name, riskLevel: "high" });
  res.json({ message: "User unbanned" });
});

router.post("/admin/users/:id/restrict", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isSuperAdmin) { res.status(403).json({ error: "Cannot restrict a Super Admin" }); return; }
  if (target.isAdmin && !req.user?.isSuperAdmin) { res.status(403).json({ error: "Only Super Admins can restrict admins" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  const VALID_REASONS = ["spam", "abuse", "suspicious_activity"];
  const reason = req.body?.reason ?? "spam";
  if (!VALID_REASONS.includes(reason)) { res.status(400).json({ error: "Invalid reason" }); return; }

  const durationDays = req.body?.durationDays != null ? parseInt(req.body.durationDays, 10) : null;
  const notes = req.body?.notes ? String(req.body.notes).slice(0, 500) : null;

  const expiresAt = durationDays && durationDays > 0
    ? new Date(Date.now() + durationDays * 86_400_000)
    : null;

  await db.update(usersTable).set({
    isRestricted: true,
    restrictedUntil: expiresAt,
    restrictionReason: reason,
  }).where(eq(usersTable.id, id));

  // Mark any previous active restriction logs inactive
  await db.update(userRestrictionsTable).set({ isActive: false })
    .where(and(eq(userRestrictionsTable.userId, id), eq(userRestrictionsTable.isActive, true)));

  // Insert audit log entry
  await db.insert(userRestrictionsTable).values({
    userId: id,
    adminId: req.userId!,
    reason,
    durationDays: durationDays ?? null,
    notes,
    isActive: true,
    expiresAt,
  });

  const durLabel = durationDays ? `${durationDays} days` : "permanent";
  await log(req.userId!, "restrict_user", "user", id, `Restricted ${target.name} — reason: ${reason}, duration: ${durLabel}`);
  await logAdminAction(req, { actionType: "user_suspend", actionCategory: "user", description: `Restriksyon sou ${target.name} — rezon: ${reason}, dire: ${durLabel}`, targetType: "user", targetId: id, targetName: target.name, riskLevel: "high" });

  // Fire-and-forget email to restricted user
  void (async () => {
    const tpl = accountRestrictedEmail({ name: target.name, reason, durationLabel: durLabel });
    await sendEmail({ to: target.email, ...tpl });
  })();

  res.json({ message: "User restricted" });
});

router.post("/admin/users/:id/unrestrict", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isRestricted: false, restrictedUntil: null, restrictionReason: null }).where(eq(usersTable.id, id));
  await db.update(userRestrictionsTable).set({ isActive: false })
    .where(and(eq(userRestrictionsTable.userId, id), eq(userRestrictionsTable.isActive, true)));
  await log(req.userId!, "unrestrict_user", "user", id, `Lifted restriction on ${target.name}`);
  await logAdminAction(req, { actionType: "user_unrestrict", actionCategory: "user", description: `Leve restriksyon sou ${target.name}`, targetType: "user", targetId: id, targetName: target.name, riskLevel: "medium" });
  res.json({ message: "User unrestricted" });
});

// ── Admin / Moderator Suspension (Super Admin only) ────────────────────────
router.post("/admin/users/:id/admin-suspend", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { reason, durationDays } = req.body as { reason?: string; durationDays?: number };

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isSuperAdmin) { res.status(403).json({ error: "Cannot suspend a Super Admin" }); return; }
  if (!target.isAdmin && target.role !== "moderator") { res.status(400).json({ error: "User is not an admin or moderator" }); return; }

  const now = new Date();
  const suspendedUntil = durationDays && durationDays > 0
    ? new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000)
    : null;

  await db.update(usersTable).set({
    isAdminSuspended: true,
    adminSuspendedUntil: suspendedUntil,
    adminSuspensionReason: reason ?? null,
    adminSuspendedBy: req.userId!,
    adminSuspendedAt: now,
  } as any).where(eq(usersTable.id, id));

  await log(req.userId!, "admin_suspend", "user", id, `Suspended admin/moderator ${target.name} — reason: ${reason ?? "none"}, duration: ${durationDays ? `${durationDays}d` : "permanent"}`);
  res.json({ success: true });
});

router.post("/admin/users/:id/admin-unsuspend", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  await db.update(usersTable).set({
    isAdminSuspended: false,
    adminSuspendedUntil: null,
    adminSuspensionReason: null,
    adminSuspendedBy: null,
    adminSuspendedAt: null,
  } as any).where(eq(usersTable.id, id));

  await log(req.userId!, "admin_unsuspend", "user", id, `Lifted admin suspension on ${target.name}`);
  res.json({ success: true });
});

router.post("/admin/users/:id/reset-country-lock", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ countryChangedAt: null }).where(eq(usersTable.id, id));
  await log(req.userId!, "reset_country_lock", "user", id, `Reset country lock for: ${target.name}`);
  res.json({ message: "Country lock reset" });
});

router.post("/admin/users/:id/set-country", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { country } = req.body as { country: string };
  if (!country) { res.status(400).json({ error: "Country required" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ country, countryChangedAt: new Date() }).where(eq(usersTable.id, id));
  await log(req.userId!, "set_country", "user", id, `Set country of ${target.name} to "${country}"`);
  res.json({ message: "Country updated", country });
});

router.post("/admin/users/:id/unflag", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isFlagged: false, flagReason: null }).where(eq(usersTable.id, id));
  await log(req.userId!, "unflag_user", "user", id, `Cleared flag on: ${target.name}`);
  await logAdminAction(req, { actionType: "user_unflag", actionCategory: "user", description: `Retire flag sou ${target.name}`, targetType: "user", targetId: id, targetName: target.name, riskLevel: "low" });
  res.json({ message: "User cleared" });
});

router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isSuperAdmin) { res.status(403).json({ error: "Cannot delete a Super Admin" }); return; }
  if (target.isAdmin && !req.user?.isSuperAdmin) { res.status(403).json({ error: "Only Super Admins can delete admins" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(listingsTable).set({ status: "removed" }).where(eq(listingsTable.sellerId, id));
  await db.delete(usersTable).where(eq(usersTable.id, id));
  await log(req.userId!, "delete_user", "user", id, `Deleted user: ${target.name} (${target.email})`);
  await logAdminAction(req, { actionType: "user_delete", actionCategory: "user", description: `Efase kont itilizatè: ${target.name} (${target.email})`, targetType: "user", targetId: id, targetName: target.name, riskLevel: "critical" });
  res.json({ message: "User deleted" });
});

// ─── Admin Team Management (Super Admin only) ──────────────────────────────────

router.get("/admin/admins", requireSuperAdmin, async (_req, res): Promise<void> => {
  const admins = await db.select().from(usersTable).where(eq(usersTable.isAdmin, true)).orderBy(desc(usersTable.createdAt));
  res.json(admins.map(formatUser));
});

// Helper: check if user has active financing obligations
async function hasActiveLoan(userId: number): Promise<{ blocked: boolean; status: string | null; amountOwed: number }> {
  const res = await db.execute(sql`
    SELECT status, amount_requested, amount_paid_usd, total_repayment_usd
    FROM loan_applications
    WHERE user_id = ${userId}
      AND status IN ('pending_review','under_verification','approved','active')
    ORDER BY created_at DESC LIMIT 1
  `);
  if (res.rows.length === 0) return { blocked: false, status: null, amountOwed: 0 };
  const row = res.rows[0] as any;
  const owed = Math.max(0, parseFloat(row.total_repayment_usd ?? row.amount_requested ?? "0") - parseFloat(row.amount_paid_usd ?? "0"));
  return { blocked: true, status: row.status, amountOwed: owed };
}

router.get("/admin/users/:id/loan-status", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const loan = await hasActiveLoan(id);
  const histRes = await db.execute(sql`
    SELECT status, amount_requested, term_months, created_at, amount_paid_usd, total_repayment_usd
    FROM loan_applications WHERE user_id = ${id}
    ORDER BY created_at DESC LIMIT 5
  `);
  res.json({ ...loan, history: histRes.rows });
});

router.post("/admin/users/:id/set-role", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { role, scopeCountry, scopeCountries, scopeDepartment, scopeCity } = req.body as {
    role: "user" | "support" | "moderator" | "admin" | "superadmin";
    scopeCountry?: string; scopeCountries?: string[]; scopeDepartment?: string; scopeCity?: string;
  };
  if (!["user", "support", "moderator", "admin", "superadmin"].includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }
  if (id === req.userId && role !== "superadmin") { res.status(400).json({ error: "Cannot demote yourself" }); return; }

  // Block staff promotion if user has active financing obligations
  const staffRoles = ["support", "moderator", "admin", "superadmin"];
  if (staffRoles.includes(role)) {
    const loanCheck = await hasActiveLoan(id);
    if (loanCheck.blocked) {
      res.status(409).json({
        error: "This user is not eligible for admin privileges until all financing obligations are fully completed.",
        loanStatus: loanCheck.status,
        amountOwed: loanCheck.amountOwed,
        code: "ACTIVE_LOAN",
      });
      return;
    }
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }

  const roleFields: { role: string; isAdmin: boolean; isSuperAdmin: boolean } =
    role === "superadmin"
      ? { role, isAdmin: true, isSuperAdmin: true }
      : role === "admin"
      ? { role, isAdmin: true, isSuperAdmin: false }
      : role === "moderator" || role === "support"
      ? { role, isAdmin: true, isSuperAdmin: false }
      : { role, isAdmin: false, isSuperAdmin: false };

  // Resolve multi-country: if scopeCountries array has 2+ entries, store as JSON; otherwise fall back to single
  const resolvedCountries = Array.isArray(scopeCountries) && scopeCountries.length > 0 ? scopeCountries : null;
  const resolvedScopeCountry = resolvedCountries ? (resolvedCountries.length === 1 ? resolvedCountries[0] : null) : (scopeCountry?.trim() || null);
  const resolvedScopeCountriesJson = resolvedCountries && resolvedCountries.length > 1 ? JSON.stringify(resolvedCountries) : null;

  const scopeFields = role === "superadmin" || role === "user"
    ? { adminScopeCountry: null as string | null, adminScopeCountries: null as string | null, adminScopeDepartment: null as string | null, adminScopeCity: null as string | null }
    : {
        adminScopeCountry: resolvedScopeCountry,
        adminScopeCountries: resolvedScopeCountriesJson,
        adminScopeDepartment: scopeDepartment?.trim() || null,
        adminScopeCity: scopeCity?.trim() || null,
      };

  const [updated] = await db.update(usersTable).set({ ...roleFields, ...scopeFields }).where(eq(usersTable.id, id)).returning();
  const scopeStr = scopeFields.adminScopeCity ?? scopeFields.adminScopeDepartment ?? scopeFields.adminScopeCountries ?? scopeFields.adminScopeCountry ?? "global";
  await log(req.userId!, "set_role", "user", id, `Set role of ${target.name} to "${role}" (scope: ${scopeStr})`);
  await logAdminAction(req, { actionType: "privilege_change", actionCategory: "security", description: `Chanje wòl ${target.name}: "${role}" (scope: ${scopeStr})`, targetType: "user", targetId: id, targetName: target.name, riskLevel: "critical" });
  res.json(formatUser(updated));
});

router.post("/admin/users/:id/set-scope", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { scopeCountry, scopeCountries, scopeDepartment, scopeCity } = req.body as {
    scopeCountry?: string; scopeCountries?: string[]; scopeDepartment?: string; scopeCity?: string;
  };
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.isSuperAdmin) { res.status(403).json({ error: "Super Admins have no scope restrictions" }); return; }
  if (!target.isAdmin) { res.status(400).json({ error: "User is not an admin" }); return; }

  const resolvedCountries = Array.isArray(scopeCountries) && scopeCountries.length > 0 ? scopeCountries : null;
  const resolvedScopeCountry = resolvedCountries ? (resolvedCountries.length === 1 ? resolvedCountries[0] : null) : (scopeCountry?.trim() || null);
  const resolvedScopeCountriesJson = resolvedCountries && resolvedCountries.length > 1 ? JSON.stringify(resolvedCountries) : null;

  const [updated] = await db.update(usersTable).set({
    adminScopeCountry: resolvedScopeCountry,
    adminScopeCountries: resolvedScopeCountriesJson,
    adminScopeDepartment: scopeDepartment?.trim() || null,
    adminScopeCity: scopeCity?.trim() || null,
  }).where(eq(usersTable.id, id)).returning();
  const scopeStr = updated.adminScopeCountries ?? updated.adminScopeCity ?? updated.adminScopeDepartment ?? updated.adminScopeCountry ?? "global";
  await log(req.userId!, "set_admin_scope", "user", id, `Updated scope of ${target.name} to "${scopeStr}"`);
  res.json(formatUser(updated));
});

router.post("/admin/users/add-admin-by-email", requireSuperAdmin, async (req, res): Promise<void> => {
  const { email, role = "admin", scopeCountry, scopeCountries, scopeDepartment, scopeCity } = req.body as {
    email: string; role?: string;
    scopeCountry?: string; scopeCountries?: string[]; scopeDepartment?: string; scopeCity?: string;
  };
  if (!email) { res.status(400).json({ error: "Email required" }); return; }
  if (!["support", "moderator", "admin", "superadmin"].includes(role)) { res.status(400).json({ error: "Invalid role" }); return; }
  const [target] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));
  if (!target) { res.status(404).json({ error: "No user found with that email" }); return; }
  const roleFields =
    role === "superadmin" ? { role, isAdmin: true, isSuperAdmin: true }
    : role === "admin" ? { role, isAdmin: true, isSuperAdmin: false }
    : { role, isAdmin: true, isSuperAdmin: false };

  const resolvedCountries = Array.isArray(scopeCountries) && scopeCountries.length > 0 ? scopeCountries : null;
  const resolvedScopeCountry = resolvedCountries ? (resolvedCountries.length === 1 ? resolvedCountries[0] : null) : (scopeCountry?.trim() || null);
  const resolvedScopeCountriesJson = resolvedCountries && resolvedCountries.length > 1 ? JSON.stringify(resolvedCountries) : null;

  const scopeFields = role === "superadmin"
    ? { adminScopeCountry: null as string | null, adminScopeCountries: null as string | null, adminScopeDepartment: null as string | null, adminScopeCity: null as string | null }
    : {
        adminScopeCountry: resolvedScopeCountry,
        adminScopeCountries: resolvedScopeCountriesJson,
        adminScopeDepartment: scopeDepartment?.trim() || null,
        adminScopeCity: scopeCity?.trim() || null,
      };
  const [updated] = await db.update(usersTable).set({ ...roleFields, ...scopeFields }).where(eq(usersTable.id, target.id)).returning();
  const scopeStr = scopeFields.adminScopeCountries ?? scopeFields.adminScopeCity ?? scopeFields.adminScopeDepartment ?? scopeFields.adminScopeCountry ?? "global";
  await log(req.userId!, "add_admin", "user", target.id, `Added ${target.name} as ${role} (scope: ${scopeStr})`);
  await logAdminAction(req, { actionType: "admin_create", actionCategory: "security", description: `Ajoute ${target.name} kòm ${role} (scope: ${scopeStr})`, targetType: "user", targetId: target.id, targetName: target.name, riskLevel: "critical" });
  res.json(formatUser(updated));
});

// ─── Listings ─────────────────────────────────────────────────────────────────

router.get("/admin/listings", requireAdmin, async (req, res): Promise<void> => {
  const { country } = req.query as Record<string, string>;
  const admin = req.user!;
  const scopeConds = getListingScopeConditions(admin);
  const conditions: any[] = [...scopeConds];
  if (country && admin.isSuperAdmin) conditions.push(eq(listingsTable.country!, country));
  const rows = await db.select().from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(listingsTable.createdAt));
  res.json(rows.map(r => ({
    id: r.listings.id, title: r.listings.title, description: r.listings.description, price: r.listings.price,
    category: r.categories?.name ?? "Other", condition: r.listings.condition, location: r.listings.location,
    country: r.listings.country, images: r.listings.images ?? [], status: r.listings.status,
    isBoosted: r.listings.isBoosted, boostExpiresAt: r.listings.boostExpiresAt?.toISOString() ?? null,
    isFeatured: r.listings.isFeatured,
    viewCount: r.listings.viewCount, favoriteCount: r.listings.favoriteCount, sellerId: r.listings.sellerId,
    sellerName: r.users?.name ?? "Unknown", sellerAvatar: r.users?.avatar ?? null,
    sellerRating: r.users?.rating ?? 0, sellerIsVerified: r.users?.isVerified ?? false,
    createdAt: r.listings.createdAt.toISOString(),
  })));
});

router.put("/admin/listings/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeErr = assertListingInScope(req.user!, existing);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  const { title, description, price, condition, status } = req.body;
  const updates: Record<string, unknown> = {};
  if (title) updates.title = title;
  if (description) updates.description = description;
  if (price !== undefined) updates.price = parseFloat(price);
  if (condition) updates.condition = condition;
  if (status) updates.status = status;
  if (!Object.keys(updates).length) { res.status(400).json({ error: "No fields to update" }); return; }
  const [listing] = await db.update(listingsTable).set(updates).where(eq(listingsTable.id, id)).returning();
  await log(req.userId!, "edit_listing", "listing", id, `Updated: ${Object.keys(updates).join(", ")}`);
  res.json(listing);
});

router.post("/admin/listings/:id/remove", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeErr = assertListingInScope(req.user!, listing);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(listingsTable).set({ status: "removed" }).where(eq(listingsTable.id, id));
  await log(req.userId!, "remove_listing", "listing", id, `Removed listing: "${listing.title}"`);
  res.json({ message: "Listing removed" });
});

// ─── Jobs (admin overview) ───────────────────────────────────────────────────
// Admins/super-admins get full visibility and edit/delete rights on every job
// in the system, regardless of poster, status, or country. The public
// /api/jobs endpoint hides the viewer's own posts and only returns "open"
// jobs, neither of which is appropriate for a moderation surface.

/** Canonical job statuses (must match lib/db/src/schema/jobs.ts comment). */
const JOB_STATUSES = ["draft", "open", "claimed", "cancelled"] as const;

/** GET /api/admin/jobs — list jobs with poster + claimer info.
 *  Supports ?limit (1-1000, default 200) and ?offset for pagination so
 *  admins can traverse the entire job set, plus a `total` count header. */
router.get("/admin/jobs", requireAdmin, async (req, res): Promise<void> => {
  const { status, country, q } = req.query as Record<string, string | undefined>;
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "200"), 10) || 200, 1), 1000);
  const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

  const admin = req.user!;
  const conds: any[] = [];
  // Enforce country scope for non-super-admins
  const adminCountries = parseAdminCountries(admin);
  if (!admin.isSuperAdmin && adminCountries.length > 0) {
    conds.push(inArray(jobsTable.country, adminCountries) as any);
  } else if (!admin.isSuperAdmin && admin.adminScopeCountry) {
    conds.push(eq(jobsTable.country, admin.adminScopeCountry));
  } else if (country) {
    conds.push(eq(jobsTable.country, country));
  }
  if (status) {
    if (!JOB_STATUSES.includes(status as any)) { res.status(400).json({ error: "Invalid status" }); return; }
    conds.push(eq(jobsTable.status, status));
  }
  if (q && q.trim()) {
    const pat = `%${q.trim()}%`;
    conds.push(or(ilike(jobsTable.title, pat), ilike(jobsTable.description, pat)));
  }
  const where = conds.length ? and(...conds) : undefined;

  const [{ value: total }] = await db
    .select({ value: count() }).from(jobsTable).where(where);

  const rows = await db
    .select()
    .from(jobsTable)
    .leftJoin(usersTable, eq(jobsTable.posterId, usersTable.id))
    .where(where)
    .orderBy(desc(jobsTable.createdAt))
    .limit(limit)
    .offset(offset);

  // Hydrate claimer names in a single follow-up query (rare second join,
  // cleaner than a 2nd leftJoin alias on the same table).
  const claimerIds = Array.from(
    new Set(rows.map(r => r.jobs.claimedById).filter((x): x is number => typeof x === "number")),
  );
  const claimers = claimerIds.length
    ? await db.select({ id: usersTable.id, name: usersTable.name, avatar: usersTable.avatar })
        .from(usersTable).where(inArray(usersTable.id, claimerIds))
    : [];
  const claimerMap = new Map(claimers.map(c => [c.id, c]));

  res.json(rows.map(r => ({
    id: r.jobs.id,
    title: r.jobs.title,
    description: r.jobs.description,
    budget: r.jobs.budget ?? null,
    location: r.jobs.location ?? null,
    country: r.jobs.country ?? null,
    status: r.jobs.status,
    paid: Boolean(r.jobs.paid),
    feeAmount: r.jobs.feeAmount ?? null,
    feeCurrency: r.jobs.feeCurrency ?? null,
    paymentMethod: r.jobs.paymentMethod ?? null,
    paymentRef: r.jobs.paymentRef ?? null,
    posterId: r.jobs.posterId,
    posterName: r.users?.name ?? "Unknown",
    posterAvatar: r.users?.avatar ?? null,
    claimedById: r.jobs.claimedById ?? null,
    claimedByName: r.jobs.claimedById ? claimerMap.get(r.jobs.claimedById)?.name ?? null : null,
    claimedAt: r.jobs.claimedAt?.toISOString() ?? null,
    createdAt: r.jobs.createdAt.toISOString(),
  })));
});

/** PUT /api/admin/jobs/:id — admin can edit any field. */
router.put("/admin/jobs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Scope guard: fetch job country and check against full multi-country scope
  if (!req.user!.isSuperAdmin) {
    const [jobRow] = await db.select({ country: jobsTable.country }).from(jobsTable).where(eq(jobsTable.id, id));
    if (jobRow && !isCountryInAdminScope(req.user!, jobRow.country)) {
      const scopeList = getAdminCountryList(req.user!);
      res.status(403).json({ error: `Access denied: job is in "${jobRow.country ?? "unknown"}" — outside your scope (${scopeList.join(", ") || "global"})` }); return;
    }
  }
  const { title, description, budget, location, status, country } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (typeof title === "string" && title.trim()) updates.title = title.trim().slice(0, 120);
  if (typeof description === "string" && description.trim()) updates.description = description.trim().slice(0, 2000);
  if (budget !== undefined) {
    if (budget === null || budget === "") updates.budget = null;
    else {
      const n = typeof budget === "number" ? budget : parseFloat(String(budget));
      if (!Number.isFinite(n) || n < 0) { res.status(400).json({ error: "Invalid budget" }); return; }
      updates.budget = n;
    }
  }
  if (typeof location === "string") updates.location = location.trim().slice(0, 120) || null;
  if (typeof country === "string" && country.trim()) updates.country = country.trim();
  if (typeof status === "string") {
    if (!JOB_STATUSES.includes(status as any)) { res.status(400).json({ error: "Invalid status" }); return; }
    updates.status = status;
    // If admin reopens a claimed job, drop the claimer so it can be picked up again.
    if (status === "open") {
      updates.claimedById = null;
      updates.claimedAt = null;
    }
  }
  if (Object.keys(updates).length === 0) { res.status(400).json({ error: "No fields to update" }); return; }
  const [updated] = await db.update(jobsTable).set(updates).where(eq(jobsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Job not found" }); return; }
  await log(req.userId!, "edit_job", "job", id, `Updated: ${Object.keys(updates).join(", ")}`);
  res.json(updated);
});

/** DELETE /api/admin/jobs/:id — force-delete any job (admin override).
 *  Uses a transaction so the destructive write and the audit log are atomic.
 *  Verifies the row was actually deleted (returning()) so we never log a
 *  ghost deletion under concurrent requests. */
router.delete("/admin/jobs/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  // Scope guard: full multi-country scope check
  if (!req.user!.isSuperAdmin) {
    const [jobRow] = await db.select({ country: jobsTable.country }).from(jobsTable).where(eq(jobsTable.id, id));
    if (jobRow && !isCountryInAdminScope(req.user!, jobRow.country)) {
      const scopeList = getAdminCountryList(req.user!);
      res.status(403).json({ error: `Access denied: job is in "${jobRow.country ?? "unknown"}" — outside your scope (${scopeList.join(", ") || "global"})` }); return;
    }
  }
  const adminId = req.userId!;

  const deletedTitle = await db.transaction(async (tx) => {
    const deleted = await tx.delete(jobsTable).where(eq(jobsTable.id, id)).returning({ id: jobsTable.id, title: jobsTable.title });
    if (deleted.length === 0) return null;
    await tx.insert(adminLogsTable).values({
      adminId,
      action: "delete_job",
      targetType: "job",
      targetId: id,
      details: `Deleted job: "${deleted[0].title}"`,
    });
    return deleted[0].title;
  });

  if (deletedTitle === null) { res.status(404).json({ error: "Job not found" }); return; }
  res.json({ message: "Job deleted" });
});

// ─── Moderation Queue ────────────────────────────────────────────────────────

router.get("/admin/moderation", requireAdmin, async (req, res): Promise<void> => {
  const { status } = req.query as Record<string, string>;
  const admin = req.user!;
  const scopeConds = getListingScopeConditions(admin);
  const conditions: any[] = [...scopeConds];
  if (status === "pending" || status === "rejected" || status === "approved") {
    conditions.push(eq(listingsTable.moderationStatus, status));
  } else {
    conditions.push(sql`${listingsTable.moderationStatus} <> 'approved'`);
  }
  const rows = await db.select().from(listingsTable)
    .leftJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .leftJoin(categoriesTable, eq(listingsTable.categoryId, categoriesTable.id))
    .where(and(...conditions))
    .orderBy(desc(listingsTable.createdAt));
  res.json(rows.map((r) => ({
    id: r.listings.id,
    title: r.listings.title,
    description: r.listings.description,
    price: r.listings.price,
    category: r.categories?.name ?? "Other",
    images: r.listings.images ?? [],
    location: r.listings.location,
    country: r.listings.country,
    moderationStatus: r.listings.moderationStatus,
    moderationRiskLevel: r.listings.moderationRiskLevel,
    moderationReason: r.listings.moderationReason,
    moderationConfidence: r.listings.moderationConfidence,
    moderationFlags: r.listings.moderationFlags ?? [],
    moderationSource: r.listings.moderationSource,
    moderatedAt: r.listings.moderatedAt?.toISOString() ?? null,
    sellerId: r.listings.sellerId,
    sellerName: r.users?.name ?? "Unknown",
    sellerAvatar: r.users?.avatar ?? null,
    createdAt: r.listings.createdAt.toISOString(),
  })));
});

router.post("/admin/moderation/:id/approve", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeErr = assertListingInScope(req.user!, listing);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  const wasApproved = listing.moderationStatus === "approved";
  await db.update(listingsTable).set({
    moderationStatus: "approved",
    moderationRiskLevel: "low",
    moderationReason: "Approved by admin override",
    status: "available",
    moderatedAt: new Date(),
    moderatedBy: req.userId!,
  }).where(eq(listingsTable.id, id));
  if (!wasApproved) {
    await db.update(categoriesTable).set({ listingCount: sql`${categoriesTable.listingCount} + 1` }).where(eq(categoriesTable.id, listing.categoryId));
    if (listing.subcategoryId) {
      await db.update(categoriesTable).set({ listingCount: sql`${categoriesTable.listingCount} + 1` }).where(eq(categoriesTable.id, listing.subcategoryId));
    }
    await db.update(usersTable).set({ listingCount: sql`${usersTable.listingCount} + 1` }).where(eq(usersTable.id, listing.sellerId));
    await db.insert(notificationsTable).values({
      userId: listing.sellerId,
      actorId: req.userId!,
      type: "moderation_approved",
      listingId: id,
    });
  }
  await log(req.userId!, "moderation_approve", "listing", id, `Approved listing: "${listing.title}"`);
  res.json({ message: "Listing approved" });
});

router.post("/admin/moderation/:id/reject", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { reason } = req.body as { reason?: string };
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeErr = assertListingInScope(req.user!, listing);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  const wasApproved = listing.moderationStatus === "approved";
  await db.update(listingsTable).set({
    moderationStatus: "rejected",
    moderationRiskLevel: "high",
    moderationReason: reason || listing.moderationReason || "Rejected by admin",
    status: "removed",
    moderatedAt: new Date(),
    moderatedBy: req.userId!,
  }).where(eq(listingsTable.id, id));
  if (wasApproved) {
    await db.update(categoriesTable).set({ listingCount: sql`GREATEST(${categoriesTable.listingCount} - 1, 0)` }).where(eq(categoriesTable.id, listing.categoryId));
    if (listing.subcategoryId) {
      await db.update(categoriesTable).set({ listingCount: sql`GREATEST(${categoriesTable.listingCount} - 1, 0)` }).where(eq(categoriesTable.id, listing.subcategoryId));
    }
    await db.update(usersTable).set({ listingCount: sql`GREATEST(${usersTable.listingCount} - 1, 0)` }).where(eq(usersTable.id, listing.sellerId));
  }
  await db.insert(notificationsTable).values({
    userId: listing.sellerId,
    actorId: req.userId!,
    type: "moderation_rejected",
    listingId: id,
  });
  await log(req.userId!, "moderation_reject", "listing", id, `Rejected listing: "${listing.title}"`);
  res.json({ message: "Listing rejected" });
});

router.post("/admin/listings/:id/feature", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeErr = assertListingInScope(req.user!, existing);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  const { featured } = req.body as { featured: boolean };
  const [listing] = await db.update(listingsTable).set({ isFeatured: !!featured }).where(eq(listingsTable.id, id)).returning();
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  await log(req.userId!, featured ? "feature_listing" : "unfeature_listing", "listing", id, `"${listing.title}"`);
  res.json({ isFeatured: listing.isFeatured });
});

// ─── Boost Records (admin view) ───────────────────────────────────────────────

router.get("/admin/boosts", requireAdmin, async (req, res): Promise<void> => {
  const payMethod = req.query.paymentMethod as string | undefined;
  const status    = req.query.status as string | undefined;
  const country   = req.query.country as string | undefined;

  const rows = await db
    .select({
      id:            boostsTable.id,
      plan:          boostsTable.plan,
      price:         boostsTable.price,
      paymentMethod: boostsTable.paymentMethod,
      paymentStatus: boostsTable.paymentStatus,
      paymentRef:    boostsTable.paymentRef,
      expiresAt:     boostsTable.expiresAt,
      createdAt:     boostsTable.createdAt,
      listingId:     listingsTable.id,
      listingTitle:  listingsTable.title,
      listingImage:  listingsTable.images,
      listingCountry: listingsTable.country,
      listingPrice:  listingsTable.price,
      isBoosted:     listingsTable.isBoosted,
      sellerId:      usersTable.id,
      sellerName:    usersTable.name,
    })
    .from(boostsTable)
    .innerJoin(listingsTable, eq(boostsTable.listingId, listingsTable.id))
    .innerJoin(usersTable, eq(listingsTable.sellerId, usersTable.id))
    .orderBy(desc(boostsTable.createdAt));

  const admin = req.user!;
  let filtered = rows;
  // Enforce country scope — scoped admins only see boosts for their country's listings.
  // Super-admins still get the manual ?country filter applied below.
  const adminBoostCountries = getAdminCountryList(admin);
  if (!admin.isSuperAdmin && adminBoostCountries.length > 0) {
    filtered = filtered.filter(r => r.listingCountry && adminBoostCountries.includes(r.listingCountry));
  } else if (country && country !== "all") {
    filtered = filtered.filter(r => r.listingCountry === country);
  }
  if (payMethod && payMethod !== "all") filtered = filtered.filter(r => r.paymentMethod === payMethod);
  if (status   && status   !== "all") filtered = filtered.filter(r => r.paymentStatus  === status);

  res.json(filtered.map(r => ({
    ...r,
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    isExpired: r.expiresAt < new Date(),
    listingImage: (r.listingImage as string[])?.[0] ?? null,
  })));
});

// ─── Boost Control ────────────────────────────────────────────────────────────

// GET /api/admin/free-boost-quota — returns current month's free boost usage for this admin
router.get("/admin/free-boost-quota", requireAdmin, async (req, res): Promise<void> => {
  const FREE_BOOST_LIMIT = 3;
  const isSuperAdmin = !!req.user?.isSuperAdmin;
  if (isSuperAdmin) {
    res.json({ used: 0, limit: null, isSuperAdmin: true });
    return;
  }
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ cnt: count() })
    .from(boostsTable)
    .where(and(
      eq(boostsTable.userId, req.userId!),
      eq(boostsTable.paymentMethod, "admin"),
      gte(boostsTable.createdAt, startOfMonth),
    ));
  const used = Number((row as any)?.cnt ?? 0);
  res.json({ used, limit: FREE_BOOST_LIMIT, isSuperAdmin: false });
});

router.post("/admin/listings/:id/boost", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);

  const isSuperAdmin = !!req.user?.isSuperAdmin;

  // Accept `plan` (1day/3day/7day) OR custom `days` integer.
  // Super admins: up to 365 days. Regular admins: up to 90 days.
  const planId = typeof req.body.plan === "string" ? req.body.plan : null;
  const days = planId === "1day" ? 1 : planId === "3day" ? 3 : planId === "7day" ? 7
    : parseInt(req.body.days ?? "7", 10);
  const maxDays = isSuperAdmin ? 365 : 90;
  if (!days || days < 1 || days > maxDays) {
    res.status(400).json({ error: `days must be 1–${maxDays}` }); return;
  }

  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeErr = assertListingInScope(req.user!, listing);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }

  // ── Monthly quota — super admins are unlimited; regular admins get 3/month ──
  const FREE_BOOST_LIMIT = 3;
  let used = 0;
  if (!isSuperAdmin) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [row] = await db
      .select({ cnt: count() })
      .from(boostsTable)
      .where(and(
        eq(boostsTable.userId, req.userId!),
        eq(boostsTable.paymentMethod, "admin"),
        gte(boostsTable.createdAt, startOfMonth),
      ));
    used = Number((row as any)?.cnt ?? 0);
    if (used >= FREE_BOOST_LIMIT) {
      res.status(403).json({ error: "Monthly free boost limit reached", used, limit: FREE_BOOST_LIMIT });
      return;
    }
  }

  // Optional promo video — require the owner-bound proof returned only after
  // the shared H.264/AAC Wasabi normalization pipeline completes.
  const rawVideo = req.body?.videoUrl;
  let videoUrl: string | null = null;
  if (typeof rawVideo === "string") {
    const v = rawVideo.trim();
    if (v.length > 0) {
      videoUrl = verifyAndCanonicalizeBoostVideoUrl(v, req.userId!);
      if (!videoUrl) {
        res.status(400).json({ error: "Video must be a completed normalized Boost upload." });
        return;
      }
    }
  }

  // Audience fields — super admins can pick any country; regular admins locked to listing's country.
  const aud = (req.body.audience && typeof req.body.audience === "object") ? req.body.audience : {};
  const requestedCountry = typeof aud.country === "string" ? aud.country.trim() : null;
  const audienceCountry = isSuperAdmin && requestedCountry
    ? requestedCountry
    : (listing.country ?? null);
  const audState = typeof aud.state === "string" ? aud.state.trim() || null : null;
  const audCity = typeof aud.city === "string" ? aud.city.trim() || null : null;
  const audAudienceType = aud.audienceType === "custom" ? "custom" : "advantage_plus";
  const audAgeMin = typeof aud.ageMin === "number" ? aud.ageMin : 18;
  const audAgeMax = typeof aud.ageMax === "number" ? aud.ageMax : 65;
  const audGender = (["all", "male", "female"] as const).includes(aud.gender) ? aud.gender as "all" | "male" | "female" : "all";
  const audObjective = (["auto", "messages", "views"] as const).includes(aud.objective) ? aud.objective as "auto" | "messages" | "views" : "auto";

  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  // Stamp all audience fields + boostStartAt=NOW so video feed shows it immediately.
  await db.update(listingsTable)
    .set({
      isBoosted: true,
      boostExpiresAt: expiresAt,
      boostVideoUrl: videoUrl,
      boostAudienceCountry: audienceCountry,
      boostAudienceCity: audCity,
      boostAudienceAgeMin: audAgeMin,
      boostAudienceAgeMax: audAgeMax,
      boostAudienceGender: audGender,
      boostAudienceObjective: audObjective,
      boostAudienceType: audAudienceType,
      boostStartAt: now,
    })
    .where(eq(listingsTable.id, id));

  await db.insert(boostsTable).values({
    listingId: id,
    userId: req.userId!,
    plan: planId ?? `admin_${days}day`,
    price: 0,
    budget: 0,
    estimatedReach: isSuperAdmin ? 999_999 : 10_000, // super admin boosts get max reach
    paymentMethod: "admin",
    paymentStatus: "paid",
    expiresAt,
    audienceCountry,
    audienceState: audState,
    audienceCity: audCity,
    audienceAgeMin: audAgeMin,
    audienceAgeMax: audAgeMax,
    audienceGender: audGender,
    objective: audObjective,
    audienceType: audAudienceType,
  });

  await log(req.userId!, "boost_listing", "listing", id,
    `Free boost (${isSuperAdmin ? `super admin · ${audienceCountry}` : `${used + 1}/${FREE_BOOST_LIMIT} this month`}) for ${days} day(s): "${listing.title}"`);

  res.json({
    message: `Listing boosted for ${days} day(s)`,
    expiresAt: expiresAt.toISOString(),
    used: isSuperAdmin ? null : used + 1,
    limit: isSuperAdmin ? null : FREE_BOOST_LIMIT,
    isSuperAdmin,
    audienceCountry,
  });
});

router.delete("/admin/listings/:id/boost", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeErr = assertListingInScope(req.user!, listing);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(listingsTable).set({ isBoosted: false, boostExpiresAt: null }).where(eq(listingsTable.id, id));
  await log(req.userId!, "remove_boost", "listing", id, `Removed boost from: "${listing.title}"`);
  res.json({ message: "Boost removed" });
});

router.post("/admin/listings/:id/boost/extend", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const days = parseInt(req.body.days ?? "3", 10);
  const [listing] = await db.select().from(listingsTable).where(eq(listingsTable.id, id));
  if (!listing) { res.status(404).json({ error: "Listing not found" }); return; }
  const scopeExtErr = assertListingInScope(req.user!, listing);
  if (scopeExtErr) { res.status(403).json({ error: scopeExtErr }); return; }
  const base = listing.boostExpiresAt && listing.boostExpiresAt > new Date() ? listing.boostExpiresAt : new Date();
  const expiresAt = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  // Preserve / stamp the country on extension so the COALESCE fallback is not needed.
  await db.update(listingsTable)
    .set({ isBoosted: true, boostExpiresAt: expiresAt, boostAudienceCountry: listing.country ?? null })
    .where(eq(listingsTable.id, id));
  await log(req.userId!, "extend_boost", "listing", id, `Extended boost by ${days} day(s): "${listing.title}"`);
  res.json({ message: `Boost extended by ${days} day(s)`, expiresAt: expiresAt.toISOString() });
});

// ─── Boost Payment Approval ───────────────────────────────────────────────────

// Approve a pending_review boost: verify the payment reference against the
// stated method, then activate the listing boost.
router.post("/admin/boosts/:boostId/approve", requireAdmin, async (req, res): Promise<void> => {
  const boostId = parseInt(req.params.boostId, 10);
  const [boost] = await db.select().from(boostsTable).where(eq(boostsTable.id, boostId));
  if (!boost) { res.status(404).json({ error: "Boost not found" }); return; }
  if (boost.paymentStatus !== "pending_review") {
    res.status(400).json({ error: `Cannot approve a boost with status '${boost.paymentStatus}'` }); return;
  }
  // Scope guard: check the listing's country (supports multi-country admins)
  if (!req.user!.isSuperAdmin) {
    const adminCountriesBoostApprove = getAdminCountryList(req.user!);
    if (adminCountriesBoostApprove.length > 0) {
      const [listingRow] = await db.select({ country: listingsTable.country }).from(listingsTable).where(eq(listingsTable.id, boost.listingId));
      if (listingRow && !adminCountriesBoostApprove.includes(listingRow.country ?? "")) {
        res.status(403).json({ error: `Access denied: boost's listing is in "${listingRow.country ?? "unknown"}" — outside your scope (${adminCountriesBoostApprove.join(", ")})` }); return;
      }
    }
  }

  await db.transaction(async (tx) => {
    // Mark the boost as paid.
    await tx.update(boostsTable)
      .set({ paymentStatus: "paid" })
      .where(eq(boostsTable.id, boostId));

    // Activate the listing with the original audience/expiry from initiate.
    // boostStartAt = NOW() so the video feed shows it immediately.
    await tx.update(listingsTable)
      .set({
        isBoosted: true,
        boostExpiresAt: boost.expiresAt,
        boostStartAt: new Date(),
        boostAudienceCountry: boost.audienceCountry,
        boostAudienceState: boost.audienceState,
        boostAudienceCity: boost.audienceCity,
        boostAudienceCities: boost.audienceCities,
        boostAudienceNeighborhood: boost.audienceNeighborhood,
        boostAudienceRadiusKm: boost.audienceRadiusKm,
      })
      .where(eq(listingsTable.id, boost.listingId));

    // Upgrade the audit transaction from pending → completed.
    await tx.update(transactionsTable)
      .set({ paymentStatus: "completed" })
      .where(
        and(
          eq(transactionsTable.listingId, boost.listingId),
          eq(transactionsTable.paymentRef, boost.paymentRef ?? ""),
        )
      );
  });

  // Notify the seller their boost is live.
  await db.insert(notificationsTable).values({
    userId: boost.userId!, actorId: req.userId!, type: "boost_activated", listingId: boost.listingId,
  }).catch(() => {});

  await log(req.userId!, "boost_listing", "listing", boost.listingId,
    `Approved boost #${boostId} (${boost.paymentMethod} ${boost.paymentRef})`);

  res.json({ message: "Boost approved and listing activated" });
});

// Reject a pending_review boost: payment could not be verified.
router.post("/admin/boosts/:boostId/reject", requireAdmin, async (req, res): Promise<void> => {
  const boostId = parseInt(req.params.boostId, 10);
  const reason  = String(req.body?.reason ?? "Payment could not be verified").trim();

  const [boost] = await db.select().from(boostsTable).where(eq(boostsTable.id, boostId));
  if (!boost) { res.status(404).json({ error: "Boost not found" }); return; }
  if (boost.paymentStatus !== "pending_review") {
    res.status(400).json({ error: `Cannot reject a boost with status '${boost.paymentStatus}'` }); return;
  }
  // Scope guard: check the listing's country (supports multi-country admins)
  if (!req.user!.isSuperAdmin) {
    const adminCountriesBoostReject = getAdminCountryList(req.user!);
    if (adminCountriesBoostReject.length > 0) {
      const [listingRow] = await db.select({ country: listingsTable.country }).from(listingsTable).where(eq(listingsTable.id, boost.listingId));
      if (listingRow && !adminCountriesBoostReject.includes(listingRow.country ?? "")) {
        res.status(403).json({ error: `Access denied: boost's listing is in "${listingRow.country ?? "unknown"}" — outside your scope (${adminCountriesBoostReject.join(", ")})` }); return;
      }
    }
  }

  await db.update(boostsTable)
    .set({ paymentStatus: "rejected" })
    .where(eq(boostsTable.id, boostId));

  // Downgrade the pending transaction to failed.
  await db.update(transactionsTable)
    .set({ paymentStatus: "failed" })
    .where(
      and(
        eq(transactionsTable.listingId, boost.listingId),
        eq(transactionsTable.paymentRef, boost.paymentRef ?? ""),
      )
    ).catch(() => {});

  // Notify the seller so they can retry.
  await db.insert(notificationsTable).values({
    userId: boost.userId!, actorId: req.userId!, type: "boost_rejected", listingId: boost.listingId,
  }).catch(() => {});

  await log(req.userId!, "remove_boost", "listing", boost.listingId,
    `Rejected boost #${boostId}: ${reason}`);

  res.json({ message: "Boost rejected", reason });
});

// ─── Activity Log ─────────────────────────────────────────────────────────────

router.get("/admin/logs", requireAdmin, async (req, res): Promise<void> => {
  const { since, until } = req.query as { since?: string; until?: string };
  const admin = req.user!;
  const conditions: any[] = [];
  // Scoped admins can only see their own activity log — they cannot inspect
  // the action history of admins from other countries / scopes.
  if (!admin.isSuperAdmin) {
    conditions.push(eq(adminLogsTable.adminId, admin.id));
  }
  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) conditions.push(gte(adminLogsTable.createdAt, sinceDate));
  }
  if (until) {
    const untilDate = new Date(until);
    if (!isNaN(untilDate.getTime())) conditions.push(lte(adminLogsTable.createdAt, untilDate));
  }
  const rows = await db
    .select({ log: adminLogsTable, admin: { name: usersTable.name, avatar: usersTable.avatar } })
    .from(adminLogsTable)
    .leftJoin(usersTable, eq(adminLogsTable.adminId, usersTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminLogsTable.createdAt))
    .limit(500);
  res.json(rows.map(r => ({
    id: r.log.id, adminId: r.log.adminId, adminName: r.admin?.name ?? "Unknown",
    adminAvatar: r.admin?.avatar ?? null,
    action: r.log.action, targetType: r.log.targetType, targetId: r.log.targetId,
    details: r.log.details, createdAt: r.log.createdAt.toISOString(),
  })));
});

// ─── Identity Verification ────────────────────────────────────────────────────

router.post("/admin/users/:id/verify", requireRole("moderator"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { reason } = (req.body ?? {}) as { reason?: string };
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isVerified: true }).where(eq(usersTable.id, id));
  await db.insert(notificationsTable).values({
    userId: id, actorId: req.userId!, type: "identity_verified",
  });
  await log(req.userId!, "verify_user", "user", id, `Verified ${target.name}${reason ? ` — ${reason}` : ""}`);
  res.json({ ok: true });
});

router.post("/admin/users/:id/unverify", requireRole("moderator"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const scopeErr = assertUserInScope(req.user!, target);
  if (scopeErr) { res.status(403).json({ error: scopeErr }); return; }
  await db.update(usersTable).set({ isVerified: false }).where(eq(usersTable.id, id));
  await log(req.userId!, "unverify_user", "user", id, `Removed verification from ${target.name}`);
  res.json({ ok: true });
});

// ─── Reset Password (Super Admin only) ───────────────────────────────────────

router.post("/admin/users/:id/reset-password", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  if (target.id === req.userId) {
    res.status(403).json({ error: "Cannot reset your own password this way" }); return;
  }
  const tempPassword = crypto.randomBytes(8).toString("base64url");
  await db.update(usersTable).set({ passwordHash: hashPassword(tempPassword) }).where(eq(usersTable.id, id));
  await db.insert(notificationsTable).values({
    userId: id, actorId: req.userId!, type: "password_reset",
  });
  await log(req.userId!, "reset_password", "user", id, `Reset password for ${target.name}`);
  // Returned only once to the requesting admin so they can communicate it securely.
  res.json({ ok: true, tempPassword });
});

// ─── Payments / Transactions ─────────────────────────────────────────────────

router.get("/admin/payments", requireRole("admin"), async (req, res): Promise<void> => {
  const { status, method, suspicious } = req.query as Record<string, string>;
  const admin = req.user!;
  const conditions: any[] = [];
  if (status) conditions.push(eq(transactionsTable.paymentStatus, status));
  if (method) conditions.push(eq(transactionsTable.paymentMethod, method));
  // Enforce country scope: scoped admins only see transactions for users in their country(ies)
  const adminTxCountries = getAdminCountryList(admin);
  if (!admin.isSuperAdmin && adminTxCountries.length > 0) {
    conditions.push(adminTxCountries.length === 1
      ? eq(usersTable.country!, adminTxCountries[0])
      : inArray(usersTable.country!, adminTxCountries) as any);
  }

  const txs = await db
    .select({
      id: transactionsTable.id,
      userId: transactionsTable.userId,
      listingId: transactionsTable.listingId,
      type: transactionsTable.type,
      amount: transactionsTable.amount,
      currency: transactionsTable.currency,
      paymentMethod: transactionsTable.paymentMethod,
      paymentStatus: transactionsTable.paymentStatus,
      paymentRef: transactionsTable.paymentRef,
      description: transactionsTable.description,
      createdAt: transactionsTable.createdAt,
      listingTitle: listingsTable.title,
      userName: usersTable.name,
      userEmail: usersTable.email,
      userIsBanned: usersTable.isBanned,
      userIsFlagged: usersTable.isFlagged,
    })
    .from(transactionsTable)
    .leftJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .leftJoin(usersTable, eq(transactionsTable.userId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(transactionsTable.createdAt))
    .limit(500);

  // Suspicion heuristics: high-value pending/failed payments, banned/flagged user, or
  // 3+ failed payments by the same user in the last 24h.
  const recentFailedByUser = await db
    .select({ userId: transactionsTable.userId, n: count() })
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.paymentStatus, "failed"),
      sql`${transactionsTable.createdAt} > NOW() - INTERVAL '24 hours'`,
    ))
    .groupBy(transactionsTable.userId);
  const failuresMap = new Map(recentFailedByUser.map((r) => [r.userId, Number(r.n)]));

  const enriched = txs.map((t) => {
    const reasons: string[] = [];
    if (t.userIsBanned) reasons.push("User is banned");
    if (t.userIsFlagged) reasons.push("User is flagged");
    if (t.paymentStatus === "failed" && t.amount >= 50) reasons.push("High-value failed payment");
    if (t.paymentStatus === "pending" && t.amount >= 100) reasons.push("High-value pending payment");
    const fails = failuresMap.get(t.userId) ?? 0;
    if (fails >= 3) reasons.push(`${fails} failed payments in last 24h`);
    // Normalized contract for frontend: nested user{} + status/isSuspicious aliases.
    return {
      ...t,
      status: t.paymentStatus,
      isSuspicious: reasons.length > 0,
      suspicionReasons: reasons,
      suspicious: reasons.length > 0,
      user: t.userId
        ? {
            id: t.userId,
            name: t.userName,
            email: t.userEmail,
            isBanned: t.userIsBanned,
            isFlagged: t.userIsFlagged,
          }
        : null,
    };
  });

  const filtered = suspicious === "true" ? enriched.filter((t) => t.isSuspicious) : enriched;
  res.json(filtered);
});

router.post("/admin/payments/:id/mark-verified", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const admin = req.user!;
  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.paymentStatus === "refunded") { res.status(400).json({ error: "Cannot verify a refunded payment" }); return; }
  // Scope guard: scoped admins can only verify transactions for users in their country(ies)
  if (!admin.isSuperAdmin && tx.userId) {
    const adminTxVerifyCountries = getAdminCountryList(admin);
    if (adminTxVerifyCountries.length > 0) {
      const [txUser] = await db.select({ country: usersTable.country }).from(usersTable).where(eq(usersTable.id, tx.userId));
      if (txUser && !adminTxVerifyCountries.includes(txUser.country ?? "")) {
        res.status(403).json({ error: `Access denied: this transaction belongs to a user in "${txUser.country ?? "unknown"}" — outside your scope (${adminTxVerifyCountries.join(", ")})` });
        return;
      }
    }
  }
  await db.update(transactionsTable).set({ paymentStatus: "completed" }).where(eq(transactionsTable.id, id));
  await log(req.userId!, "verify_payment", "transaction", id, `Marked tx #${id} as completed`);
  res.json({ ok: true });
});

router.post("/admin/payments/:id/refund", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { reason } = (req.body ?? {}) as { reason?: string };
  const [tx] = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id));
  if (!tx) { res.status(404).json({ error: "Transaction not found" }); return; }
  if (tx.paymentStatus === "refunded") { res.status(400).json({ error: "Already refunded" }); return; }

  await db.update(transactionsTable).set({
    paymentStatus: "refunded",
    description: `${tx.description ?? ""} | REFUND: ${reason ?? "no reason provided"}`.trim(),
  }).where(eq(transactionsTable.id, id));

  // If this transaction was for a boost, only deactivate the listing's boost flag if
  // there is no other active (paid + unexpired) boost on the same listing.
  if (tx.type === "boost" && tx.listingId) {
    const otherActive = await db
      .select({ id: boostsTable.id })
      .from(boostsTable)
      .where(and(
        eq(boostsTable.listingId, tx.listingId),
        eq(boostsTable.paymentStatus, "completed"),
        sql`${boostsTable.expiresAt} > NOW()`,
      ))
      .limit(1);
    if (otherActive.length === 0) {
      await db.update(listingsTable).set({ isBoosted: false, boostExpiresAt: null }).where(eq(listingsTable.id, tx.listingId));
    }
  }

  await db.insert(notificationsTable).values({
    userId: tx.userId, actorId: req.userId!, type: "payment_refunded",
    listingId: tx.listingId ?? null,
  });
  await log(req.userId!, "refund_payment", "transaction", id, `Refunded tx #${id} (${tx.currency} ${tx.amount})${reason ? ` — ${reason}` : ""}`);
  res.json({ ok: true });
});

// ─── Admin Audit Trail (super-admin only) ────────────────────────────────────

router.get("/admin/users/:id/admin-audit", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [target] = await db.select({ id: usersTable.id, name: usersTable.name, isAdmin: usersTable.isAdmin, isSuperAdmin: usersTable.isSuperAdmin, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, id));
  if (!target || (!target.isAdmin && !target.isSuperAdmin)) {
    res.status(404).json({ error: "Admin not found" }); return;
  }

  const auditLogs = await db.select()
    .from(adminLogsTable)
    .where(eq(adminLogsTable.adminId, id))
    .orderBy(desc(adminLogsTable.createdAt))
    .limit(200);

  const buyerUser = alias(usersTable, "buyer_user");
  const sellerUser = alias(usersTable, "seller_user");

  const msgRows = await db.select({
    id: messagesTable.id,
    conversationId: messagesTable.conversationId,
    content: messagesTable.content,
    messageType: messagesTable.messageType,
    createdAt: messagesTable.createdAt,
    convBuyerId: conversationsTable.buyerId,
    convSellerId: conversationsTable.sellerId,
    buyerName: buyerUser.name,
    sellerName: sellerUser.name,
    listingTitle: listingsTable.title,
  })
  .from(messagesTable)
  .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
  .leftJoin(buyerUser, eq(conversationsTable.buyerId, buyerUser.id))
  .leftJoin(sellerUser, eq(conversationsTable.sellerId, sellerUser.id))
  .leftJoin(listingsTable, eq(conversationsTable.listingId, listingsTable.id))
  .where(eq(messagesTable.senderId, id))
  .orderBy(desc(messagesTable.createdAt))
  .limit(100);

  const sentMessages = msgRows.map(r => {
    const recipientName = r.convBuyerId === id ? (r.sellerName ?? "Unknown") : (r.buyerName ?? "Unknown");
    const recipientId = r.convBuyerId === id ? r.convSellerId : r.convBuyerId;
    return {
      id: r.id,
      conversationId: r.conversationId,
      content: r.content,
      messageType: r.messageType,
      createdAt: r.createdAt?.toISOString() ?? null,
      recipientName,
      recipientId,
      listingTitle: r.listingTitle ?? "—",
    };
  });

  res.json({
    adminId: `ADM-${String(id).padStart(4, "0")}`,
    name: target.name,
    role: target.role,
    auditLogs: auditLogs.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    sentMessages,
    stats: { totalActions: auditLogs.length, totalMessages: sentMessages.length },
  });
});

// ─── Scope Options (for admin creation UI) ────────────────────────────────────

router.get("/admin/scope-options", requireSuperAdmin, (_req, res): void => {
  res.json(
    Object.entries(SCOPE_OPTIONS).map(([country, data]) => ({
      country,
      departments: data.departments,
      citiesByDept: data.citiesByDept,
    }))
  );
});

// ─── Current admin's role/permissions ────────────────────────────────────────

// ─── GET /admin/analytics/views — Super Admin view analytics ─────────────────
router.get("/admin/analytics/views", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    // Top 20 listings by total viewCount
    const topListings = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        viewCount: listingsTable.viewCount,
        country: listingsTable.country,
        isBoosted: listingsTable.isBoosted,
      })
      .from(listingsTable)
      .orderBy(desc(listingsTable.viewCount))
      .limit(20);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Views by country — last 7 days from the deduplicated event log
    const byCountry = await db
      .select({ country: listingViewsTable.country, views: count() })
      .from(listingViewsTable)
      .where(gte(listingViewsTable.viewedAt, sevenDaysAgo))
      .groupBy(listingViewsTable.country)
      .orderBy(desc(count()))
      .limit(20);

    // Views by UTC hour — last 24 h (for peak-time heatmap)
    const byHourResult = await db.execute(sql`
      SELECT
        DATE_TRUNC('hour', viewed_at AT TIME ZONE 'UTC') AS hour,
        COUNT(*)::int AS views
      FROM listing_views
      WHERE viewed_at >= ${oneDayAgo.toISOString()}
      GROUP BY hour
      ORDER BY hour ASC
    `);

    // Suspicious IPs: >15 events in 24 h across any listings
    const suspiciousResult = await db.execute(sql`
      SELECT
        ip_hash,
        COUNT(*)::int            AS total_views,
        COUNT(DISTINCT listing_id)::int AS unique_listings,
        MAX(viewed_at)           AS last_seen
      FROM listing_views
      WHERE viewed_at >= ${oneDayAgo.toISOString()}
      GROUP BY ip_hash
      HAVING COUNT(*) > 15
      ORDER BY total_views DESC
      LIMIT 20
    `);

    res.json({
      topListings,
      byCountry,
      byHour: (byHourResult as any).rows ?? [],
      suspiciousIps: (suspiciousResult as any).rows ?? [],
    });
  } catch (err) {
    req.log.error({ err }, "GET /admin/analytics/views error");
    res.status(500).json({ error: "Failed to load view analytics" });
  }
});

router.get("/admin/me", requireRole("support"), async (req, res): Promise<void> => {
  const role = getRole(req.user);
  const admin = req.user!;
  const parsedCountries = parseAdminCountries(admin);
  res.json({
    id: req.userId,
    name: admin.name,
    email: admin.email,
    role,
    scopeLevel: getScopeLevel(admin),
    scopeCountry: admin.adminScopeCountry ?? null,
    scopeCountries: parsedCountries.length > 0 ? parsedCountries : null,
    scopeDepartment: admin.adminScopeDepartment ?? null,
    scopeCity: admin.adminScopeCity ?? null,
    permissions: {
      users: role !== "user",
      bans: role === "moderator" || role === "admin" || role === "superadmin",
      moderation: role === "moderator" || role === "admin" || role === "superadmin",
      listings: role === "moderator" || role === "admin" || role === "superadmin",
      payments: role === "admin" || role === "superadmin",
      refunds: role === "superadmin",
      boosts: role === "admin" || role === "superadmin",
      adminTeam: role === "superadmin",
      resetPasswords: role === "superadmin",
      logs: role === "admin" || role === "superadmin",
      reports: role !== "user",
      setScope: role === "superadmin",
    },
  });
});

// ── Chargebacks ──────────────────────────────────────────────────────────────
router.get("/admin/chargebacks", requireSuperAdmin, async (req, res): Promise<void> => {
  const rows = await db.execute(sql`
    SELECT cb.*,
           u.name        AS user_name,
           u.email       AS user_email,
           u.phone       AS user_phone,
           u.is_banned   AS user_is_banned,
           u.is_restricted AS user_is_restricted
    FROM chargebacks cb
    LEFT JOIN users u ON u.id = cb.user_id
    ORDER BY cb.created_at DESC
    LIMIT 300
  `);
  res.json(rows.rows);
});

router.post("/admin/chargebacks/:id/resolve", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { notes, restoreWallet, unrestrictUser, banUser } = req.body as {
    notes?: string; restoreWallet?: boolean; unrestrictUser?: boolean; banUser?: boolean;
  };

  const rows = await db.execute(sql`SELECT * FROM chargebacks WHERE id = ${id} LIMIT 1`);
  const cb = (rows.rows as any[])[0];
  if (!cb) { res.status(404).json({ error: "Chargeback not found" }); return; }
  if (cb.status === "admin_resolved") { res.status(400).json({ error: "Already resolved" }); return; }

  if (restoreWallet && cb.wallet_deducted && cb.user_id) {
    await db.execute(sql`
      UPDATE promo_wallets SET balance_usd = balance_usd + ${cb.amount_usd}, updated_at = NOW()
      WHERE user_id = ${cb.user_id}
    `);
    await db.insert(walletTransactionsTable).values({
      userId: cb.user_id,
      type: "chargeback_reversal",
      amountUsd: cb.amount_usd,
      paymentRef: cb.stripe_dispute_id ?? `cb_${id}`,
      status: "completed",
      note: `Admin rezoud chajbak #${id} — wallet retounen`,
    });
  }

  if (unrestrictUser && cb.user_id) {
    await db.execute(sql`UPDATE users SET is_restricted = false WHERE id = ${cb.user_id}`);
  }

  if (banUser && cb.user_id) {
    await db.update(usersTable).set({ isBanned: true }).where(eq(usersTable.id, cb.user_id));
  }

  await db.execute(sql`
    UPDATE chargebacks
    SET status = 'admin_resolved',
        notes = ${notes ?? null},
        resolved_at = NOW(),
        resolved_by = ${req.userId!}
    WHERE id = ${id}
  `);

  await log(req.userId!, "resolve_chargeback", "chargeback", id,
    `Resolved chargeback #${id}${restoreWallet ? " — wallet restored" : ""}${unrestrictUser ? " — user unrestricted" : ""}${banUser ? " — user BANNED" : ""}${notes ? ` | ${notes}` : ""}`
  );
  res.json({ ok: true });
});

// ══ Orders Overview (all admins, scoped by country) ══════════════════════
router.get("/admin/orders-overview", requireAdmin, async (req, res): Promise<void> => {
  const { status, search, limit: limitStr = "100", offset: offsetStr = "0" } = req.query as Record<string, string>;
  const lim = Math.min(parseInt(limitStr) || 100, 200);
  const off = parseInt(offsetStr) || 0;
  const admin = req.user!;

  let whereClause = sql`t.type = 'purchase'`;

  // Enforce country scope for non-super-admins
  const adminOrderCountries = getAdminCountryList(admin);
  if (!admin.isSuperAdmin && adminOrderCountries.length > 0) {
    if (adminOrderCountries.length === 1) {
      whereClause = sql`${whereClause} AND t.listing_country = ${adminOrderCountries[0]}`;
    } else {
      const countryList = sql.join(adminOrderCountries.map(c => sql`${c}`), sql`, `);
      whereClause = sql`${whereClause} AND t.listing_country IN (${countryList})`;
    }
  }

  if (status && status !== "all") {
    whereClause = sql`${whereClause} AND t.order_status = ${status}`;
  }
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    whereClause = sql`${whereClause} AND (
      CONCAT('BZH-', LPAD(t.id::text, 6, '0')) ILIKE ${q}
      OR b.name ILIKE ${q}
      OR l.title ILIKE ${q}
    )`;
  }

  const rows = await db.execute(sql`
    SELECT
      t.id, t.order_status, t.amount, t.payment_method, t.listing_country,
      t.driver_name, t.driver_phone, t.delivery_description, t.delivery_type,
      t.shipping_city, t.shipping_region, t.created_at, t.shipped_at,
      t.auto_release_at, t.escrow_released,
      b.id   AS buyer_id,   b.name AS buyer_name,   b.phone AS buyer_phone,
      s.id   AS seller_id,  s.name AS seller_name,
      l.title AS listing_title,
      d.id   AS delivery_id, d.status AS delivery_status,
      d.verification_code,
      du.name AS driver_user_name, du.phone AS driver_user_phone
    FROM transactions t
    LEFT JOIN users b  ON b.id  = t.user_id
    LEFT JOIN users s  ON s.id  = t.seller_user_id
    LEFT JOIN listings l ON l.id = t.listing_id
    LEFT JOIN deliveries d ON d.transaction_id = t.id
    LEFT JOIN users du ON du.id = d.driver_user_id
    WHERE ${whereClause}
    ORDER BY t.id DESC
    LIMIT ${lim} OFFSET ${off}
  `);

  res.json((rows as any[]).map(r => ({
    id: r.id,
    orderRef: `BZH-${String(r.id).padStart(6, "0")}`,
    orderStatus: r.order_status,
    amount: r.amount,
    paymentMethod: r.payment_method,
    listingCountry: r.listing_country,
    driverName: r.driver_name,
    driverPhone: r.driver_phone,
    deliveryDescription: r.delivery_description,
    deliveryType: r.delivery_type,
    shippingCity: r.shipping_city,
    shippingRegion: r.shipping_region,
    createdAt: r.created_at,
    shippedAt: r.shipped_at,
    autoReleaseAt: r.auto_release_at,
    escrowReleased: r.escrow_released,
    buyer:  r.buyer_id  ? { id: r.buyer_id,  name: r.buyer_name,  phone: r.buyer_phone }  : null,
    seller: r.seller_id ? { id: r.seller_id, name: r.seller_name } : null,
    listingTitle: r.listing_title,
    delivery: r.delivery_id ? {
      id:               r.delivery_id,
      status:           r.delivery_status,
      verificationCode: r.verification_code,
      driverUserName:   r.driver_user_name,
      driverUserPhone:  r.driver_user_phone,
    } : null,
  })));
});

// ── Super Admin: Cancel any order ─────────────────────────────────────────
router.post("/admin/orders/:id/cancel", requireSuperAdmin, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const order = await db.select().from(transactionsTable).where(eq(transactionsTable.id, id)).then(r => r[0]);
  if (!order) { res.status(404).json({ error: "Oder pa jwenn" }); return; }
  if (["cancelled", "completed", "return_refunded"].includes(order.orderStatus ?? "")) {
    res.status(400).json({ error: "Oder sa a deja fini" }); return;
  }

  await db.update(transactionsTable)
    .set({ orderStatus: "cancelled" })
    .where(eq(transactionsTable.id, id));

  await db.execute(sql`
    UPDATE deliveries SET status = 'cancelled', updated_at = NOW()
    WHERE transaction_id = ${id}
  `);

  if (order.userId) {
    await db.insert(notificationsTable).values({
      userId: order.userId,
      type: "order_update",
      isRead: false,
      message: `Kòmand ou a BZH-${String(id).padStart(6, "0")} te anile pa admin. Kontakte sipò si ou gen kesyon.`,
    } as any).catch(() => {});
  }

  await log(req.userId!, "cancel_order", "transaction", id, `Super admin anile kòmand #${id}`);
  res.json({ ok: true });
});

// ─── Platform Fees — super admin configurable revenue rates ──────────────────

const FEE_KEYS = new Set([
  "transfer_fee_pct",
  "recharge_fee_pct",
  "music_platform_fee_pct",
  "delivery_platform_fee_pct",
  "sub_price_standard",
  "sub_price_premium",
  "sub_price_vip",
  "artist_plan_price_usd",
]);

const FEE_DEFAULTS: Record<string, number> = {
  transfer_fee_pct:         0.05,
  recharge_fee_pct:         0.02,
  music_platform_fee_pct:   0.20,
  delivery_platform_fee_pct:0.20,
  sub_price_standard:       15,
  sub_price_premium:        30,
  sub_price_vip:            50,
  artist_plan_price_usd:    50,
};

router.get("/admin/platform-fees", requireSuperAdmin, async (_req, res): Promise<void> => {
  const keyList = Array.from(FEE_KEYS);
  const rows = await db.select({ key: platformSettingsTable.key, value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(sql`${platformSettingsTable.key} = ANY(${keyList})`);
  const m = new Map(rows.map(r => [r.key, r.value]));
  const out: Record<string, number> = {};
  for (const key of keyList) {
    const raw = m.get(key);
    const parsed = raw !== undefined ? parseFloat(raw) : NaN;
    out[key] = Number.isFinite(parsed) ? parsed : FEE_DEFAULTS[key] ?? 0;
  }
  res.json(out);
});

router.put("/admin/platform-fees", requireSuperAdmin, async (req: any, res): Promise<void> => {
  const { key, value } = req.body as { key: string; value: number };
  if (!FEE_KEYS.has(key)) { res.status(400).json({ error: "Kle envalid" }); return; }
  if (!Number.isFinite(value) || value < 0) { res.status(400).json({ error: "Valè envalid" }); return; }
  const PCT_KEYS = new Set(["transfer_fee_pct","recharge_fee_pct","music_platform_fee_pct","delivery_platform_fee_pct"]);
  if (PCT_KEYS.has(key) && value > 0.99) { res.status(400).json({ error: "Posantaj dwe ant 0% ak 99%" }); return; }
  if (!PCT_KEYS.has(key) && value > 9999) { res.status(400).json({ error: "Pri trò wo" }); return; }
  await db.execute(sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (${key}, ${String(value)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `);
  await log(req.userId, "update_platform_fee", "platform_settings", undefined, `${key} → ${value}`);
  res.json({ ok: true, key, value });
});

// ─── GET /api/admin/broadcast-recipients ─────────────────────────────────────
// ─── SMS Broadcast ────────────────────────────────────────────────────────────
import { sendSms, sendSmsBatch, isTwilioConfigured } from "../lib/sms";

// GET /api/admin/broadcast-sms-recipients — users with valid phone, optionally filtered by country
router.get("/admin/broadcast-sms-recipients", requireSuperAdmin, async (req, res): Promise<void> => {
  const country = (req.query.country as string) || "";
  const conditions: any[] = [
    sql`${usersTable.phone} IS NOT NULL`,
    sql`${usersTable.phone} != ''`,
    eq(usersTable.isBanned, false),
  ];
  if (country) conditions.push(eq(usersTable.country, country));

  const users = await db
    .select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, country: usersTable.country })
    .from(usersTable)
    .where(and(...conditions))
    .orderBy(usersTable.name);

  res.json({ users, total: users.length, twilioConfigured: isTwilioConfigured() });
});

// POST /api/admin/broadcast-sms — send SMS to selected recipients or a test number
router.post("/admin/broadcast-sms", requireSuperAdmin, async (req, res): Promise<void> => {
  const { message, testPhone, recipientIds } = req.body as {
    message?: string;
    testPhone?: string;
    recipientIds?: number[];
  };

  if (!message?.trim()) { res.status(400).json({ error: "Mesaj SMS obligatwa" }); return; }
  if (message.trim().length > 1600) { res.status(400).json({ error: "Mesaj twò long (maks 1600 karaktè)" }); return; }

  if (!isTwilioConfigured()) {
    res.status(503).json({ error: "Twilio pa konfigiré — ajoute TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER" });
    return;
  }

  // ── Test mode ──
  if (testPhone?.trim()) {
    const { ok, error } = await sendSms(testPhone.trim(), message.trim());
    if (!ok) {
      res.status(500).json({ error: error ?? "SMS pa voye — verifye konfigirasyon Twilio" });
      return;
    }
    res.json({ ok: true, mode: "test", sent: 1 });
    return;
  }

  // ── Broadcast mode ──
  const whereClause = and(
    sql`${usersTable.phone} IS NOT NULL`,
    sql`${usersTable.phone} != ''`,
    eq(usersTable.isBanned, false),
    ...(Array.isArray(recipientIds) && recipientIds.length > 0
      ? [sql`${usersTable.id} = ANY(ARRAY[${sql.join(recipientIds.map(id => sql`${id}`), sql`, `)}]::int[])`]
      : []),
  );

  const users = await db
    .select({ phone: usersTable.phone, name: usersTable.name })
    .from(usersTable)
    .where(whereClause);

  const recipients = users
    .filter(u => u.phone && u.phone.trim().length > 5)
    .map(u => ({ phone: u.phone!, name: u.name }));

  if (recipients.length === 0) {
    res.status(400).json({ error: "Pa gen itilizatè ak nimewo telefòn" });
    return;
  }

  const { sent, failed, firstError } = await sendSmsBatch(recipients, message.trim());

  await db.insert(adminLogsTable).values({
    adminId: req.userId!,
    action: "broadcast_sms",
    targetId: null,
    note: `recipients=${recipients.length} | sent=${sent} | failed=${failed}${firstError ? ` | err=${firstError.slice(0, 120)}` : ""}`,
  } as any).catch(() => {});

  res.json({ ok: true, mode: "broadcast", total: recipients.length, sent, failed, firstError });
});

// Super-admin only. Returns all non-banned users with a valid email address.
router.get("/admin/broadcast-recipients", requireSuperAdmin, async (req, res): Promise<void> => {
  const users = await db
    .select({
      id:      usersTable.id,
      name:    usersTable.name,
      email:   usersTable.email,
      country: usersTable.country,
    })
    .from(usersTable)
    .where(and(
      sql`${usersTable.email} IS NOT NULL`,
      sql`${usersTable.email} != ''`,
      eq(usersTable.isBanned, false),
    ))
    .orderBy(usersTable.name);

  const filtered = users.filter(u => u.email?.includes("@"));
  res.json({ users: filtered, total: filtered.length });
});

// ─── POST /api/admin/broadcast-email ─────────────────────────────────────────
// Super-admin only. Send a custom email to all users (or a single test address).
// Accepts optional recipientIds[] to restrict the send to a subset of users.
router.post("/admin/broadcast-email", requireSuperAdmin, async (req, res): Promise<void> => {
  const { subject, htmlBody, testEmail, recipientIds } = req.body as {
    subject?: string;
    htmlBody?: string;
    testEmail?: string;
    recipientIds?: number[];
  };

  if (!subject?.trim()) { res.status(400).json({ error: "subject obligatwa" }); return; }
  if (!htmlBody?.trim()) { res.status(400).json({ error: "kò mesaj obligatwa" }); return; }

  // Wrap admin HTML in the branded Flexa Market email shell
  const branded = broadcastEmail({ subject, contentHtml: htmlBody });

  // ── Test mode: send to one address only ──
  if (testEmail?.trim()) {
    const ok = await sendEmail({ to: testEmail.trim(), subject: `[TEST] ${branded.subject}`, text: branded.text, html: branded.html });
    if (!ok) { res.status(500).json({ error: "Email pa voye — verifye konfigirasyon Resend" }); return; }
    res.json({ ok: true, mode: "test", sent: 1 });
    return;
  }

  // ── Broadcast mode: send to selected (or all) users with valid emails ──
  const whereClause = and(
    sql`${usersTable.email} IS NOT NULL`,
    sql`${usersTable.email} != ''`,
    eq(usersTable.isBanned, false),
    ...(Array.isArray(recipientIds) && recipientIds.length > 0
      ? [sql`${usersTable.id} = ANY(ARRAY[${sql.join(recipientIds.map(id => sql`${id}`), sql`, `)}]::int[])`]
      : []),
  );

  const users = await db
    .select({ email: usersTable.email, name: usersTable.name })
    .from(usersTable)
    .where(whereClause);

  const recipients = users
    .filter(u => u.email && u.email.includes("@"))
    .map(u => ({ email: u.email!, name: u.name ?? undefined }));

  if (recipients.length === 0) {
    res.status(400).json({ error: "Pa gen itilizatè ak email" });
    return;
  }

  const sent = await sendEmailBatch(recipients, branded.subject, branded.text, branded.html);

  await db.insert(adminLogsTable).values({
    adminId: req.userId!,
    action: "broadcast_email",
    targetId: null,
    note: `subject="${subject}" | recipients=${recipients.length} | sent=${sent}`,
  } as any).catch(() => {});

  res.json({ ok: true, mode: "broadcast", total: recipients.length, sent });
});

export default router;
