import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Score weights ──────────────────────────────────────────────────────────────
const W = {
  sales: 20,        // volume of real sales
  reviews: 25,      // quality of buyer reviews
  activity: 15,     // recency of platform activity
  orders: 15,       // completed orders without issues
  age: 10,          // account tenure
  responseRate: 5,  // message response rate
  listings: 65,     // quality of listing history (scaled ×6.5)
};
// Total possible before penalties: ~652 (base 200 + max 652 pts → capped at 200+650=850)

// ── Level labels (200–850 FICO-style scale) ───────────────────────────────────
function getLevel(score: number): string {
  if (score >= 780) return "excellent";
  if (score >= 600) return "good";
  if (score >= 450) return "fair";
  if (score >= 200) return "poor";
  return "inactive";
}

// ── Anti-fraud signal computation ─────────────────────────────────────────────
async function computeFraudSignals(userId: number): Promise<{
  flags: string[];
  penalty: number;
}> {
  const flags: string[] = [];
  let penalty = 0;

  // 1. Reviews received in a burst (>5 in 48 h from distinct reviewers)
  const burstRes = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM reviews
    WHERE seller_id = ${userId}
      AND created_at > NOW() - INTERVAL '48 hours'
  `);
  const burstReviews = parseInt((burstRes.rows[0] as any)?.cnt ?? "0", 10);
  if (burstReviews >= 5) {
    flags.push("review_burst");
    penalty += 98;   // scaled ×6.5 from original 15
  }

  // 2. Listing spam (>8 listings created in 24 h)
  const spamRes = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM listings
    WHERE seller_id = ${userId}
      AND created_at > NOW() - INTERVAL '24 hours'
      AND moderation_status != 'rejected'
  `);
  const recentListings = parseInt((spamRes.rows[0] as any)?.cnt ?? "0", 10);
  if (recentListings >= 8) {
    flags.push("listing_spam");
    penalty += 65;   // scaled ×6.5 from original 10
  }

  // 3. Abnormally high dispute rate (>30% of completed sales)
  const disputeRes = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE order_status = 'delivered') as completed,
      COUNT(*) as total
    FROM transactions
    WHERE seller_user_id = ${userId}
  `);
  const dr = disputeRes.rows[0] as any;
  const completed = parseInt(dr?.completed ?? "0", 10);
  const totalOrders = parseInt(dr?.total ?? "0", 10);
  if (totalOrders >= 5 && completed / totalOrders < 0.5) {
    flags.push("high_dispute_rate");
    penalty += 130;  // scaled ×6.5 from original 20
  }

  // 4. Many reports filed against this user
  const reportRes = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM reports
    WHERE target_id = ${userId} AND target_type = 'user' AND status != 'dismissed'
  `);
  const reportCount = parseInt((reportRes.rows[0] as any)?.cnt ?? "0", 10);
  if (reportCount >= 3) {
    flags.push("multiple_reports");
    penalty += reportCount * 33;  // scaled ×6.5 from original ×5
  }

  return { flags, penalty: Math.min(penalty, 260) }; // cap (was 40 × 6.5 = 260)
}

// ── Improvement tips ──────────────────────────────────────────────────────────
function computeTips(metrics: {
  salesPts: number;
  reviewsPts: number;
  activityPts: number;
  ordersPts: number;
  agePts: number;
  responseRatePts: number;
  listingsPts: number;
  fraudFlags: string[];
  reportCount: number;
}): string[] {
  const tips: string[] = [];

  if (metrics.salesPts < 65)  tips.push("increase_sales");
  if (metrics.reviewsPts < 98) tips.push("improve_reviews");
  if (metrics.activityPts < 65) tips.push("stay_active");
  if (metrics.ordersPts < 65) tips.push("complete_orders");
  if (metrics.responseRatePts < 20) tips.push("respond_faster");
  if (metrics.reportCount > 0) tips.push("resolve_disputes");
  if (metrics.fraudFlags.includes("listing_spam")) tips.push("reduce_spam");
  if (tips.length === 0) tips.push("maintain_excellence");

  return tips.slice(0, 4); // max 4 tips
}

// ── Badge computation ─────────────────────────────────────────────────────────
async function computeBadges(
  userId: number,
  score: number,
  salesCount: number,
  avgRating: number,
  isVerified: boolean
): Promise<string[]> {
  const badges: string[] = [];

  if (isVerified) badges.push("verified_merchant");
  if (score >= 650 && salesCount >= 10 && avgRating >= 4.5) badges.push("trusted_seller");
  if (score >= 750 && salesCount >= 20) badges.push("top_vendor");

  // Fast Repayer: at least 1 loan with all paid installments
  const repayRes = await db.execute(sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'paid') as paid_cnt,
      COUNT(*) as total_cnt
    FROM loan_installments
    WHERE user_id = ${userId}
  `);
  const rr = repayRes.rows[0] as any;
  const paidCnt = parseInt(rr?.paid_cnt ?? "0", 10);
  const totalCnt = parseInt(rr?.total_cnt ?? "0", 10);
  if (totalCnt >= 3 && paidCnt === totalCnt) badges.push("fast_repayer");

  return badges;
}

// ── Main score calculation ────────────────────────────────────────────────────
export async function calculateCreditScore(userId: number) {
  // 1. Fetch user base data
  const [user] = await db
    .select({
      id: usersTable.id,
      createdAt: usersTable.createdAt,
      lastSeenAt: usersTable.lastSeenAt,
      isBanned: usersTable.isBanned,
      isFlagged: usersTable.isFlagged,
      isRestricted: usersTable.isRestricted,
      isVerified: usersTable.isVerified,
      rating: usersTable.rating,
      reviewCount: usersTable.reviewCount,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return null;

  const now = new Date();

  // 2. Account age in days
  const accountDays = Math.floor(
    (now.getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  // 3. Days since last activity
  const daysSinceActive = user.lastSeenAt
    ? Math.floor((now.getTime() - new Date(user.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24))
    : 9999;

  // 4. Sales count (delivered transactions as seller)
  const salesRes = await db.execute(sql`
    SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total_volume
    FROM transactions
    WHERE seller_user_id = ${userId} AND order_status = 'delivered'
  `);
  const salesRow = salesRes.rows[0] as any;
  const salesCount = parseInt(salesRow?.cnt ?? "0", 10);

  // 5. Completed orders (orders that reached delivered state without dispute)
  const ordersRes = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM transactions
    WHERE seller_user_id = ${userId} AND order_status = 'delivered'
  `);
  const completedOrders = parseInt((ordersRes.rows[0] as any)?.cnt ?? "0", 10);

  // 6. Reports / disputes filed against this user
  const reportRes = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM reports
    WHERE target_id = ${userId} AND target_type = 'user' AND status != 'dismissed'
  `);
  const reportCount = parseInt((reportRes.rows[0] as any)?.cnt ?? "0", 10);

  // 7. Listing count (non-rejected listings)
  const listingRes = await db.execute(sql`
    SELECT COUNT(*) as cnt
    FROM listings
    WHERE seller_id = ${userId} AND moderation_status != 'rejected'
  `);
  const listingCount = parseInt((listingRes.rows[0] as any)?.cnt ?? "0", 10);

  // 8. Message response rate (conversations with at least one reply from seller)
  const msgRes = await db.execute(sql`
    SELECT
      COUNT(DISTINCT c.id) as total_convs,
      COUNT(DISTINCT m.conversation_id) FILTER (
        WHERE m.sender_id = ${userId}
      ) as replied_convs
    FROM conversations c
    LEFT JOIN messages m ON m.conversation_id = c.id
    WHERE c.seller_id = ${userId}
  `);
  const msgRow = msgRes.rows[0] as any;
  const totalConvs = parseInt(msgRow?.total_convs ?? "0", 10);
  const repliedConvs = parseInt(msgRow?.replied_convs ?? "0", 10);
  const responseRate = totalConvs > 0 ? repliedConvs / totalConvs : 1;

  // 9. Average rating and review count
  const avgRating = parseFloat(user.rating as any ?? "0");
  const reviewCount = parseInt(user.reviewCount as any ?? "0", 10);

  // ── Compute sub-scores ────────────────────────────────────────────────────

  // ── All sub-scores scaled to 200–850 FICO-style (multiplier ≈ ×6.5 from old 0-100 base) ──

  // Sales pts (0-130, was 0-20)
  let salesPts = 0;
  if (salesCount >= 50) salesPts = 130;
  else if (salesCount >= 21) salesPts = 98;
  else if (salesCount >= 6)  salesPts = 65;
  else if (salesCount >= 1)  salesPts = 33;

  // Reviews pts (0-163, was 0-25): weighted by count & quality
  let reviewsPts = 0;
  if (reviewCount > 0) {
    if (avgRating >= 4.8)      reviewsPts = 163;
    else if (avgRating >= 4.5) reviewsPts = 130;
    else if (avgRating >= 4.0) reviewsPts = 98;
    else if (avgRating >= 3.5) reviewsPts = 65;
    else                       reviewsPts = 33;
    // Boost for high review volume
    if (reviewCount >= 20) reviewsPts = Math.min(reviewsPts + 20, 163);
  }

  // Activity pts (0-98, was 0-15)
  let activityPts = 0;
  if      (daysSinceActive <= 3)  activityPts = 98;
  else if (daysSinceActive <= 7)  activityPts = 78;
  else if (daysSinceActive <= 30) activityPts = 52;
  else if (daysSinceActive <= 90) activityPts = 26;

  // Orders pts (0-98, was 0-15)
  let ordersPts = 0;
  if      (completedOrders >= 20) ordersPts = 98;
  else if (completedOrders >= 10) ordersPts = 78;
  else if (completedOrders >= 5)  ordersPts = 52;
  else if (completedOrders >= 1)  ordersPts = 26;

  // Account age pts (0-65, was 0-10)
  let agePts = 0;
  if      (accountDays >= 365) agePts = 65;
  else if (accountDays >= 180) agePts = 46;
  else if (accountDays >= 90)  agePts = 26;
  else if (accountDays >= 30)  agePts = 13;

  // Response rate pts (0-33, was 0-5)
  const responseRatePts = Math.round(responseRate * 33);

  // Listings pts (0-65, was 0-10) — minimum 10 posts required to unlock any listing points
  let listingsPts = 0;
  if      (listingCount >= 50) listingsPts = 65;
  else if (listingCount >= 20) listingsPts = 52;
  else if (listingCount >= 10) listingsPts = 33;
  // < 10 posts = 0 pts (threshold: post at least 10 items to start earning)

  // ── Anti-fraud signals ────────────────────────────────────────────────────
  const { flags: fraudFlags, penalty: fraudPenalty } = await computeFraudSignals(userId);

  // ── Hard penalties (scaled ×6.5 from original 0-100 base) ───────────────────
  let hardPenalty = 0;
  if (user.isBanned) hardPenalty = 650;        // max wipe to floor
  else if (user.isFlagged) hardPenalty += 130; // was 20
  if ((user as any).isRestricted) hardPenalty += 98; // was 15
  hardPenalty += reportCount * 33;             // was ×5

  // ── Raw score (max 652 → effectively capped at 650) ───────────────────────
  const rawScore =
    salesPts + reviewsPts + activityPts + ordersPts + agePts + responseRatePts + listingsPts;

  // ── Inactivity decay — kicks in after 1 month on accounts older than 30 days ──
  // Score recovers naturally when user logs in (lastSeenAt resets daysSinceActive to 0)
  let inactivityPenalty = 0;
  if (accountDays > 30) {
    if      (daysSinceActive > 180) inactivityPenalty = 78;
    else if (daysSinceActive > 90)  inactivityPenalty = 52;
    else if (daysSinceActive > 60)  inactivityPenalty = 26;
    else if (daysSinceActive > 30)  inactivityPenalty = 13;
  }

  // Base 200 + points earned − penalties, clamped to 150–850
  // Floor is 150 (not 200) so inactive accounts can drop below the starting point
  const totalPenalty = fraudPenalty + hardPenalty + inactivityPenalty;
  const score = Math.max(150, Math.min(850, 200 + rawScore - totalPenalty));
  const level = getLevel(score);

  // ── Badges & tips ──────────────────────────────────────────────────────────
  const badges = await computeBadges(userId, score, salesCount, avgRating, !!(user as any).isVerified);

  const tips = computeTips({
    salesPts, reviewsPts, activityPts, ordersPts, agePts,
    responseRatePts, listingsPts, fraudFlags, reportCount,
  });

  // ── Loan recommendation (600 = "bon kredi" threshold) ─────────────────────
  let loanRecommendation: "auto_approve" | "fast_review" | "limited" | "declined";
  if (score >= 780) loanRecommendation = "auto_approve";
  else if (score >= 700) loanRecommendation = "fast_review";
  else if (score >= 600) loanRecommendation = "limited";
  else loanRecommendation = "declined";

  return {
    score,
    level,
    loanRecommendation,
    breakdown: {
      salesPts,
      reviewsPts,
      activityPts,
      ordersPts,
      agePts,
      responseRatePts,
      listingsPts,
      fraudPenalty: fraudPenalty + hardPenalty,
    },
    metrics: {
      salesCount,
      avgRating,
      reviewCount,
      completedOrders,
      reportCount,
      listingCount,
      accountDays,
      daysSinceActive,
      responseRatePct: Math.round(responseRate * 100),
    },
    fraudFlags,
    badges,
    tips,
    calculatedAt: now.toISOString(),
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/credit-score/my — user's own score
router.get("/credit-score/my", requireAuth, async (req, res) => {
  try {
    const userId = (req as any).userId;
    const result = await calculateCreditScore(userId);
    if (!result) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "credit-score/my error");
    res.status(500).json({ error: "Failed to compute credit score" });
  }
});

// GET /api/credit-score/user/:id — admin view any user's score
router.get("/credit-score/user/:id", requireAuth, async (req, res) => {
  try {
    const me = (req as any).user;
    if (me.role !== "admin" && me.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const targetId = parseInt(String(req.params.id), 10);
    if (isNaN(targetId)) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const result = await calculateCreditScore(targetId);
    if (!result) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "credit-score/user/:id error");
    res.status(500).json({ error: "Failed to compute credit score" });
  }
});

// GET /api/admin/credit-scores — paginated list for admin dashboard
router.get("/admin/credit-scores", requireAuth, async (req, res) => {
  try {
    const me = (req as any).user;
    if (me.role !== "admin" && me.role !== "super_admin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    const limit = Math.min(parseInt(req.query.limit as string ?? "20", 10), 50);
    const offset = parseInt(req.query.offset as string ?? "0", 10);

    // Return users with their denormalized metrics for fast listing
    const usersRes = await db.execute(sql`
      SELECT
        u.id,
        u.name,
        u.avatar,
        u.country,
        u.rating,
        u.review_count,
        u.created_at,
        u.last_seen_at,
        u.is_banned,
        u.is_flagged,
        (SELECT COUNT(*) FROM transactions t WHERE t.seller_user_id = u.id AND t.order_status = 'delivered') as sales_count,
        (SELECT COUNT(*) FROM reports r WHERE r.target_id = u.id AND r.target_type = 'user' AND r.status != 'dismissed') as report_count
      FROM users u
      WHERE u.role = 'user'
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await db.execute(sql`SELECT COUNT(*) as cnt FROM users WHERE role = 'user'`);
    const total = parseInt((countRes.rows[0] as any)?.cnt ?? "0", 10);

    res.json({ users: usersRes.rows, total, limit, offset });
  } catch (err) {
    req.log.error({ err }, "admin/credit-scores error");
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
