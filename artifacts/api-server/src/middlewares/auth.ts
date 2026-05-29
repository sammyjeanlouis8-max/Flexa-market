import { Request, Response, NextFunction } from "express";
import { extractToken, verifyToken } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      user?: typeof usersTable.$inferSelect;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req.headers.authorization);
  if (!token) { res.status(401).json({ error: "Unauthorized" }); return; }
  const payload = verifyToken(token);
  if (!payload) { res.status(401).json({ error: "Invalid token" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.isBanned) { res.status(403).json({ error: "Your account has been suspended. Contact support for help.", suspended: true }); return; }
  if (user.tokenInvalidatedAt) {
    const invalidatedAtMs = new Date(user.tokenInvalidatedAt).getTime();
    const tokenIssuedAtMs = payload.iat * 1000;
    if (tokenIssuedAtMs < invalidatedAtMs) {
      res.status(401).json({ error: "Token has been invalidated" });
      return;
    }
  }
  req.userId = user.id;
  req.user = user;
  next();
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req.headers.authorization);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId));
      if (user && !user.isBanned) {
        if (!user.tokenInvalidatedAt || payload.iat * 1000 >= new Date(user.tokenInvalidatedAt).getTime()) {
          req.userId = user.id;
          req.user = user;
        }
      }
    }
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    if (!req.user?.isAdmin && !req.user?.isSuperAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    if ((req.user as any)?.isAdminSuspended && !req.user?.isSuperAdmin) {
      const until = (req.user as any)?.adminSuspendedUntil;
      if (!until || new Date(until) > new Date()) {
        res.status(403).json({ error: "Admin account suspended", suspended: true, until: until ?? null });
        return;
      }
    }
    next();
  });
}

export async function requireSuperAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    if (!req.user?.isSuperAdmin) {
      res.status(403).json({ error: "Super Admin access required" });
      return;
    }
    next();
  });
}

export type Role = "user" | "support" | "moderator" | "admin" | "superadmin";

export function getRole(user: typeof usersTable.$inferSelect | undefined | null): Role {
  if (!user) return "user";
  if (user.isSuperAdmin) return "superadmin";
  const r = (user.role || "user") as Role;
  if (r === "superadmin" || r === "admin" || r === "moderator" || r === "support") return r;
  if (user.isAdmin) return "admin";
  return "user";
}

const ROLE_RANK: Record<Role, number> = { user: 0, support: 1, moderator: 2, admin: 3, superadmin: 4 };

export function hasRole(user: typeof usersTable.$inferSelect | undefined | null, min: Role): boolean {
  return ROLE_RANK[getRole(user)] >= ROLE_RANK[min];
}

export function requireRole(min: Role) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    await requireAuth(req, res, async () => {
      if (!hasRole(req.user, min)) {
        res.status(403).json({ error: `${min} access required` });
        return;
      }
      next();
    });
  };
}

export const requireSupport = requireRole("support");
export const requireModerator = requireRole("moderator");

/**
 * requireNotRestricted — blocks restricted users from social actions.
 *
 * Must be placed AFTER requireAuth so that req.user is already populated.
 * If the restriction period has expired it is automatically lifted in the DB
 * and the request proceeds normally.
 *
 * Returns 403 with { code: "USER_RESTRICTED" } when active.
 */
export async function requireNotRestricted(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = req.user;
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (user.isRestricted) {
    if (user.restrictedUntil && new Date(user.restrictedUntil) <= new Date()) {
      await db.update(usersTable)
        .set({ isRestricted: false, restrictedUntil: null, restrictionReason: null })
        .where(eq(usersTable.id, user.id));
      next();
      return;
    }
    res.status(403).json({ error: "USER_RESTRICTED", code: "USER_RESTRICTED" });
    return;
  }
  next();
}

/**
 * requireFinanceAdmin — financial operations gate.
 *
 * Allows:  super_admin  OR  isAdmin=true with a non-support/non-moderator role.
 * Blocks:  support, moderator, and all regular users.
 *
 * Use on every endpoint that reads or writes financial data:
 *   cashout approvals, seller payout marking, fintech admin ops, etc.
 * Payment *config* (API keys, rates) must use requireSuperAdmin instead.
 */
export async function requireFinanceAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    const user = req.user!;
    if (user.isSuperAdmin) { next(); return; }
    const role = (user.role || "user") as string;
    const blockedRoles = ["support", "moderator", "user", "agent"];
    if (!user.isAdmin || blockedRoles.includes(role)) {
      res.status(403).json({ error: "Access denied: financial admin access required" });
      return;
    }
    next();
  });
}
