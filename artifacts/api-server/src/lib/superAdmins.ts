import { db, usersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * The owner-level super-admins. These accounts (and only these accounts)
 * are allowed to add or remove other admins. The list is enforced at three
 * points:
 *   1. /auth/register — any signup with one of these emails is auto-promoted.
 *   2. boot-time sync — any matching existing user is promoted; any other
 *      user that somehow has super-admin is demoted to plain admin so the
 *      owners keep exclusive control of role management.
 *   3. The admin/super-admin checks in routes already exist; this module
 *      just guarantees the right people are on the list.
 *
 * To change the list, edit the array below and restart the server. We
 * deliberately keep this in source (not env) so it's reviewable in version
 * control — the emails are not secrets.
 */
export const SUPER_ADMIN_EMAILS: readonly string[] = [
  "jeanlouis.samy@gmail.com",
  "sammyjeanlouis8@gmail.com",
  "alexissheelove7@gmail.com",
];

const NORMALIZED = new Set(SUPER_ADMIN_EMAILS.map((e) => e.trim().toLowerCase()));

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return NORMALIZED.has(email.trim().toLowerCase());
}

/**
 * Promote any owner-listed users that already exist, and demote any
 * super-admins that are not on the list. Safe to call at every boot —
 * it's idempotent and only writes when state actually drifts from the
 * desired list.
 */
export async function syncSuperAdmins(): Promise<void> {
  const list = Array.from(NORMALIZED);
  if (list.length === 0) return;

  // Build a SQL array literal of lowercased owner emails so we can do
  // case-insensitive comparisons (the email column is plain text and
  // legacy rows may have mixed case even though /auth/register normalizes).
  const ownerArr = sql.raw(
    `ARRAY[${list.map((e) => `'${e.replace(/'/g, "''")}'`).join(",")}]::text[]`,
  );
  const isOwnerSql = sql`lower(${usersTable.email}) = ANY(${ownerArr})`;

  // 1) Force the canonical owner state on any owner row that has drifted
  //    in ANY of the three role fields. We don't gate on isSuperAdmin=false
  //    so partial drift (e.g. role mismatch) is also repaired.
  const promoted = await db.update(usersTable)
    .set({ isAdmin: true, isSuperAdmin: true, role: "superadmin" })
    .where(and(
      isOwnerSql,
      sql`(${usersTable.isSuperAdmin} = false OR ${usersTable.isAdmin} = false OR ${usersTable.role} <> 'superadmin')`,
    ))
    .returning({ id: usersTable.id, email: usersTable.email });

  if (promoted.length > 0) {
    logger.info({ promoted }, "Reconciled owner accounts to super-admin");
  }

  // 2) Demote any super-admin whose email is NOT on the list. We keep them
  //    as a regular admin (so test fixtures like alice@example.com still
  //    have the admin tools available) but they can no longer manage other
  //    admins. We explicitly set isAdmin=true so the demotion never
  //    accidentally strips admin access.
  const demoted = await db.update(usersTable)
    .set({ isAdmin: true, isSuperAdmin: false, role: "admin" })
    .where(and(
      eq(usersTable.isSuperAdmin, true),
      sql`lower(${usersTable.email}) <> ALL(${ownerArr})`,
    ))
    .returning({ id: usersTable.id, email: usersTable.email });

  if (demoted.length > 0) {
    logger.info({ demoted }, "Demoted non-owner super-admins to plain admin");
  }
}
