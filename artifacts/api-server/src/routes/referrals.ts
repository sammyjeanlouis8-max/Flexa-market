import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, referralsTable } from "@workspace/db/schema";
import { eq, desc, sql, and, ne } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const POINTS_PER_REFERRAL = 10;

// ── Helpers ────────────────────────────────────────────────────────────────

function getReferralLink(referralCode: string): string {
  const base = process.env.FRONTEND_URL ?? "https://bonjour-tool.replit.app";
  return `${base}/auth/register?ref=${referralCode}`;
}

// ── GET /api/referrals/my-stats ────────────────────────────────────────────
// Merchant's own dashboard: link, points, history, leaderboard position
router.get("/referrals/my-stats", requireAuth, async (req, res): Promise<void> => {
  try {
    const userId = req.userId!;
    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        referralCode: usersTable.referralCode,
        referralPoints: usersTable.referralPoints,
        referralCount: usersTable.referralCount,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    // Leaderboard position (rank by referralPoints DESC)
    const [rankRow] = await db.execute<{ rank: string }>(
      sql`SELECT COUNT(*)::int AS rank FROM users WHERE referral_points > ${user.referralPoints}`
    );
    const rank = Number((rankRow as any)?.rank ?? 0) + 1;

    // Recent referral history (last 50)
    const history = await db
      .select({
        id: referralsTable.id,
        status: referralsTable.status,
        pointsAwarded: referralsTable.pointsAwarded,
        isFlagged: referralsTable.isFlagged,
        flagReason: referralsTable.flagReason,
        createdAt: referralsTable.createdAt,
        referredName: usersTable.name,
      })
      .from(referralsTable)
      .leftJoin(usersTable, eq(referralsTable.referredUserId, usersTable.id))
      .where(eq(referralsTable.referrerId, userId))
      .orderBy(desc(referralsTable.createdAt))
      .limit(50);

    res.json({
      referralLink: user.referralCode ? getReferralLink(user.referralCode) : null,
      referralCode: user.referralCode,
      referralPoints: user.referralPoints ?? 0,
      referralCount: user.referralCount ?? 0,
      leaderboardRank: rank,
      history: history.map(h => ({
        id: h.id,
        status: h.status,
        pointsAwarded: h.pointsAwarded,
        isFlagged: h.isFlagged,
        flagReason: h.flagReason,
        createdAt: h.createdAt,
        referredName: h.referredName ?? "—",
      })),
    });
  } catch (err) {
    logger.error({ err }, "GET /referrals/my-stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/referrals/leaderboard ────────────────────────────────────────
// Public leaderboard — top 50 merchants by referral points
router.get("/referrals/leaderboard", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        avatar: usersTable.avatar,
        referralPoints: usersTable.referralPoints,
        referralCount: usersTable.referralCount,
      })
      .from(usersTable)
      .where(sql`${usersTable.referralPoints} > 0`)
      .orderBy(desc(usersTable.referralPoints), desc(usersTable.referralCount))
      .limit(50);

    const leaderboard = rows.map((u, i) => ({
      rank: i + 1,
      id: u.id,
      name: u.name,
      avatar: u.avatar ?? null,
      referralPoints: u.referralPoints ?? 0,
      referralCount: u.referralCount ?? 0,
    }));

    res.json({ leaderboard });
  } catch (err) {
    logger.error({ err }, "GET /referrals/leaderboard error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/referrals ───────────────────────────────────────────────
// Admin: all referrals with pagination
router.get("/admin/referrals", requireAdmin, async (req, res): Promise<void> => {
  try {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = Math.min(parseInt((req.query.limit as string) || "50", 10), 100);
    const offset = (page - 1) * limit;
    const flaggedOnly = req.query.flagged === "true";

    const conditions = flaggedOnly ? [eq(referralsTable.isFlagged, true)] : [];

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(referralsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const referrerUser = db.$with("referrer_user").as(
      db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email }).from(usersTable)
    );

    const rows = await db
      .select({
        referral: referralsTable,
        referrerName: sql<string>`r.name`,
        referrerEmail: sql<string>`r.email`,
        referredName: sql<string>`rd.name`,
        referredEmail: sql<string>`rd.email`,
      })
      .from(referralsTable)
      .leftJoin(sql`users r`, sql`r.id = ${referralsTable.referrerId}`)
      .leftJoin(sql`users rd`, sql`rd.id = ${referralsTable.referredUserId}`)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(referralsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      referrals: rows.map(r => ({
        ...r.referral,
        referrerName: r.referrerName,
        referrerEmail: r.referrerEmail,
        referredName: r.referredName,
        referredEmail: r.referredEmail,
      })),
      total: Number(count),
      page,
      totalPages: Math.ceil(Number(count) / limit),
    });
  } catch (err) {
    logger.error({ err }, "GET /admin/referrals error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/admin/referrals/:id/adjust ───────────────────────────────────
// Admin: manually adjust points awarded for a referral
router.put("/admin/referrals/:id/adjust", requireAdmin, async (req, res): Promise<void> => {
  try {
    const referralId = parseInt(req.params.id, 10);
    const newPoints = parseInt(req.body.points, 10);
    const adminNote: string = req.body.adminNote ?? "";

    if (isNaN(newPoints) || newPoints < 0) {
      res.status(400).json({ error: "Invalid points value" });
      return;
    }

    const [referral] = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.id, referralId));

    if (!referral) { res.status(404).json({ error: "Referral not found" }); return; }

    const diff = newPoints - (referral.pointsAwarded ?? 0);

    await db.update(referralsTable).set({
      pointsAwarded: newPoints,
      adminNote,
      reviewedAt: new Date(),
      reviewedBy: req.userId!,
    }).where(eq(referralsTable.id, referralId));

    if (diff !== 0) {
      await db.update(usersTable).set({
        referralPoints: sql`GREATEST(0, ${usersTable.referralPoints} + ${diff})`,
      }).where(eq(usersTable.id, referral.referrerId));
    }

    res.json({ ok: true, diff });
  } catch (err) {
    logger.error({ err }, "PUT /admin/referrals/:id/adjust error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── PUT /api/admin/referrals/:id/flag ─────────────────────────────────────
// Admin: flag or unflag a suspicious referral, optionally revoke points
router.put("/admin/referrals/:id/flag", requireAdmin, async (req, res): Promise<void> => {
  try {
    const referralId = parseInt(req.params.id, 10);
    const { flag, reason, revokePoints } = req.body as {
      flag: boolean;
      reason?: string;
      revokePoints?: boolean;
    };

    const [referral] = await db
      .select()
      .from(referralsTable)
      .where(eq(referralsTable.id, referralId));

    if (!referral) { res.status(404).json({ error: "Referral not found" }); return; }

    await db.update(referralsTable).set({
      isFlagged: flag,
      flagReason: reason ?? null,
      status: flag ? "flagged" : "verified",
      reviewedAt: new Date(),
      reviewedBy: req.userId!,
    }).where(eq(referralsTable.id, referralId));

    if (flag && revokePoints && referral.pointsAwarded > 0) {
      await db.update(usersTable).set({
        referralPoints: sql`GREATEST(0, ${usersTable.referralPoints} - ${referral.pointsAwarded})`,
        referralCount:  sql`GREATEST(0, ${usersTable.referralCount} - 1)`,
      }).where(eq(usersTable.id, referral.referrerId));

      await db.update(referralsTable).set({ pointsAwarded: 0 }).where(eq(referralsTable.id, referralId));
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "PUT /admin/referrals/:id/flag error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/referrals/stats ────────────────────────────────────────
router.get("/admin/referrals/stats", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const [totals] = await db.execute<{ total: string; flagged: string; total_points: string }>(
      sql`SELECT
        COUNT(*)::int AS total,
        SUM(CASE WHEN is_flagged THEN 1 ELSE 0 END)::int AS flagged,
        SUM(points_awarded)::int AS total_points
      FROM referrals`
    );
    const [topReferrers] = await db.execute<{ rows: unknown[] }>(
      sql`SELECT u.id, u.name, u.referral_points, u.referral_count
          FROM users u
          WHERE u.referral_points > 0
          ORDER BY u.referral_points DESC
          LIMIT 10`
    );
    res.json({
      total: Number((totals as any)?.total ?? 0),
      flagged: Number((totals as any)?.flagged ?? 0),
      totalPoints: Number((totals as any)?.total_points ?? 0),
    });
  } catch (err) {
    logger.error({ err }, "GET /admin/referrals/stats error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
