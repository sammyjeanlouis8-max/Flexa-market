import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql, desc, and } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getClientIp, upsertRiskScore, logFraudEvent, createFraudAlert, applyRiskActions, assessNewAccount } from "../lib/fraudEngine";
import type { RiskLevel } from "../lib/fraudEngine";

const router = Router();

// ─── POST /api/fraud/fingerprint ──────────────────────────────────────────────
// Authenticated users submit a client-side device fingerprint.
// Used for ban-bypass detection and duplicate-account detection.
router.post("/fraud/fingerprint", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const { fingerprint, platform, screenRes, timezone, languages, hardwareConcurrency } = req.body as {
    fingerprint?: string;
    platform?: string;
    screenRes?: string;
    timezone?: string;
    languages?: string;
    hardwareConcurrency?: number;
  };

  if (!fingerprint || typeof fingerprint !== "string" || fingerprint.length < 8) {
    res.status(400).json({ error: "Invalid fingerprint" });
    return;
  }

  const ip = getClientIp(req);

  // Check if this fingerprint belongs to a banned account
  const [existing] = await db.execute(sql`
    SELECT user_id, is_banned FROM fraud_device_fingerprints fp
    JOIN users u ON u.id = fp.user_id
    WHERE fp.fingerprint = ${fingerprint} AND fp.user_id != ${userId}
    LIMIT 1
  `);

  if (existing && (existing as any).is_banned) {
    await logFraudEvent(userId, "ban_bypass_attempt", "critical", 20,
      { fingerprint: fingerprint.slice(0, 16), linkedUserId: (existing as any).user_id }, ip);
    await createFraudAlert(userId, "ban_bypass_fingerprint", "critical",
      "🚨 Ban Bypass — Fingerprint Match",
      `User #${userId} shares browser fingerprint with banned account #${(existing as any).user_id}.`,
      { linkedUserId: (existing as any).user_id }
    );
    const existing2 = await db.execute(sql`SELECT score, device_score FROM fraud_risk_scores WHERE user_id = ${userId}`);
    const prev = (existing2[0] as any);
    const newDeviceScore = Math.min(20, (prev?.device_score ?? 0) + 20);
    const newScore = await upsertRiskScore(userId, { deviceScore: newDeviceScore });
    const level: RiskLevel = newScore >= 80 ? "critical" : newScore >= 60 ? "high" : "medium";
    await applyRiskActions(userId, newScore, level);
  } else if (existing) {
    await logFraudEvent(userId, "device_reuse", "medium", 8,
      { fingerprint: fingerprint.slice(0, 16), linkedUserId: (existing as any).user_id }, ip);
  }

  // Upsert fingerprint
  await db.execute(sql`
    INSERT INTO fraud_device_fingerprints (user_id, fingerprint, platform, screen_res, timezone, languages, hardware_concurrency, last_seen_ip, last_seen_at, created_at)
    VALUES (${userId}, ${fingerprint}, ${platform ?? null}, ${screenRes ?? null}, ${timezone ?? null}, ${languages ?? null}, ${hardwareConcurrency ?? null}, ${ip}, NOW(), NOW())
    ON CONFLICT (user_id, fingerprint) DO UPDATE SET last_seen_ip = EXCLUDED.last_seen_ip, last_seen_at = NOW()
  `);

  res.json({ ok: true });
});

// ─── GET /api/admin/fraud/dashboard ───────────────────────────────────────────
router.get("/admin/fraud/dashboard", requireAdmin, async (req, res): Promise<void> => {
  try {
    const [stats] = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = false)::int AS open_alerts,
        (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = false AND severity = 'critical')::int AS critical_alerts,
        (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = false AND severity = 'high')::int AS high_alerts,
        (SELECT COUNT(*) FROM fraud_risk_scores WHERE level = 'critical')::int AS critical_users,
        (SELECT COUNT(*) FROM fraud_risk_scores WHERE level = 'high')::int AS high_users,
        (SELECT COUNT(*) FROM fraud_risk_scores WHERE level = 'medium')::int AS medium_users,
        (SELECT COUNT(*) FROM users WHERE is_flagged = true AND is_banned = false)::int AS flagged_users,
        (SELECT COUNT(*) FROM users WHERE is_banned = true)::int AS banned_users,
        (SELECT COUNT(*) FROM fraud_events WHERE created_at > NOW() - INTERVAL '24 hours')::int AS events_24h,
        (SELECT COUNT(*) FROM fraud_events WHERE event_type = 'scam_message' AND created_at > NOW() - INTERVAL '24 hours')::int AS scam_msgs_24h,
        (SELECT COUNT(*) FROM fraud_events WHERE event_type IN ('vpn_detected','datacenter_ip') AND created_at > NOW() - INTERVAL '24 hours')::int AS vpn_24h,
        (SELECT COUNT(*) FROM fraud_events WHERE event_type = 'ban_bypass_attempt' AND created_at > NOW() - INTERVAL '24 hours')::int AS bypass_24h
    `);

    const recentAlerts = await db.execute(sql`
      SELECT fa.id, fa.user_id, fa.alert_type, fa.severity, fa.title, fa.description, fa.created_at,
             u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar,
             u.is_banned, u.is_flagged, u.country
      FROM fraud_alerts fa
      JOIN users u ON u.id = fa.user_id
      WHERE fa.resolved = false
      ORDER BY
        CASE fa.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        fa.created_at DESC
      LIMIT 20
    `);

    const topRiskUsers = await db.execute(sql`
      SELECT frs.user_id, frs.score, frs.level, frs.device_score, frs.ip_score, frs.behavior_score, frs.payment_score, frs.content_score,
             u.name, u.email, u.avatar, u.country, u.is_banned, u.is_flagged, u.created_at AS joined_at
      FROM fraud_risk_scores frs
      JOIN users u ON u.id = frs.user_id
      WHERE frs.level IN ('critical','high')
      ORDER BY frs.score DESC
      LIMIT 15
    `);

    res.json({
      stats: stats as any,
      recentAlerts,
      topRiskUsers,
    });
  } catch (err) {
    logger.error({ err }, "fraud dashboard error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/alerts ──────────────────────────────────────────────
router.get("/admin/fraud/alerts", requireAdmin, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = 30;
  const offset = (page - 1) * limit;
  const severityFilter = req.query.severity as string | undefined;
  const resolvedFilter = req.query.resolved === "true";

  try {
    const whereClause = [
      `fa.resolved = ${resolvedFilter}`,
      severityFilter ? `fa.severity = '${severityFilter}'` : null,
    ].filter(Boolean).join(" AND ");

    const alerts = await db.execute(sql.raw(`
      SELECT fa.id, fa.user_id, fa.alert_type, fa.severity, fa.title, fa.description, fa.meta,
             fa.resolved, fa.resolved_at, fa.created_at,
             u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar,
             u.country, u.is_banned, u.is_flagged,
             resolver.name AS resolved_by_name
      FROM fraud_alerts fa
      JOIN users u ON u.id = fa.user_id
      LEFT JOIN users resolver ON resolver.id = fa.resolved_by
      WHERE ${whereClause}
      ORDER BY
        CASE fa.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
        fa.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `));

    const [countRow] = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS total FROM fraud_alerts fa WHERE ${whereClause}
    `));

    res.json({ alerts, total: (countRow as any)?.total ?? 0, page, limit });
  } catch (err) {
    logger.error({ err }, "fraud alerts error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── POST /api/admin/fraud/alerts/:id/resolve ─────────────────────────────────
router.post("/admin/fraud/alerts/:id/resolve", requireAdmin, async (req, res): Promise<void> => {
  const alertId = parseInt(req.params.id, 10);
  const adminId = req.userId!;
  try {
    await db.execute(sql`
      UPDATE fraud_alerts SET resolved = true, resolved_by = ${adminId}, resolved_at = NOW()
      WHERE id = ${alertId}
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/users ───────────────────────────────────────────────
router.get("/admin/fraud/users", requireAdmin, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = 25;
  const offset = (page - 1) * limit;
  const level = req.query.level as string | undefined;
  const search = req.query.q as string | undefined;

  try {
    const levelFilter = level ? `AND frs.level = '${level}'` : "AND frs.level IN ('critical','high','medium')";
    const searchFilter = search ? `AND (u.name ILIKE '%${search.replace(/'/g, "''")}%' OR u.email ILIKE '%${search.replace(/'/g, "''")}%')` : "";

    const users = await db.execute(sql.raw(`
      SELECT frs.user_id, frs.score, frs.level, frs.device_score, frs.ip_score, frs.behavior_score, frs.payment_score, frs.content_score, frs.last_computed_at,
             u.name, u.email, u.avatar, u.country, u.is_banned, u.is_flagged, u.is_trusted, u.created_at AS joined_at,
             (SELECT COUNT(*)::int FROM fraud_events fe WHERE fe.user_id = u.id) AS event_count,
             (SELECT COUNT(*)::int FROM fraud_alerts fa WHERE fa.user_id = u.id AND fa.resolved = false) AS open_alerts
      FROM fraud_risk_scores frs
      JOIN users u ON u.id = frs.user_id
      WHERE 1=1 ${levelFilter} ${searchFilter}
      ORDER BY frs.score DESC
      LIMIT ${limit} OFFSET ${offset}
    `));

    const [countRow] = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS total FROM fraud_risk_scores frs JOIN users u ON u.id = frs.user_id
      WHERE 1=1 ${levelFilter} ${searchFilter}
    `));

    res.json({ users, total: (countRow as any)?.total ?? 0, page, limit });
  } catch (err) {
    logger.error({ err }, "fraud users error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/user/:id ────────────────────────────────────────────
router.get("/admin/fraud/user/:id", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [riskScore] = await db.execute(sql`SELECT * FROM fraud_risk_scores WHERE user_id = ${userId}`);
    const events = await db.execute(sql`
      SELECT * FROM fraud_events WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50
    `);
    const alerts = await db.execute(sql`
      SELECT fa.*, u.name AS resolved_by_name FROM fraud_alerts fa
      LEFT JOIN users u ON u.id = fa.resolved_by
      WHERE fa.user_id = ${userId} ORDER BY fa.created_at DESC LIMIT 30
    `);
    const fingerprints = await db.execute(sql`
      SELECT * FROM fraud_device_fingerprints WHERE user_id = ${userId} ORDER BY last_seen_at DESC LIMIT 10
    `);
    const ipLogs = await db.execute(sql`
      SELECT * FROM fraud_ip_logs WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 20
    `);

    // Shared IP accounts
    const sharedIpUsers = await db.execute(sql`
      SELECT DISTINCT u.id, u.name, u.email, u.is_banned, u.is_flagged, uil.ip
      FROM fraud_ip_logs uil
      JOIN fraud_ip_logs uil2 ON uil2.ip = uil.ip AND uil2.user_id = ${userId} AND uil2.user_id != uil.user_id
      JOIN users u ON u.id = uil.user_id
      WHERE uil.user_id != ${userId}
      LIMIT 10
    `);

    res.json({
      user: {
        id: user.id, name: user.name, email: user.email, avatar: user.avatar,
        country: user.country, isBanned: user.isBanned, isFlagged: user.isFlagged,
        isTrusted: user.isTrusted, createdAt: user.createdAt, phone: user.phone,
      },
      riskScore: riskScore ?? null,
      events,
      alerts,
      fingerprints,
      ipLogs,
      sharedIpUsers,
    });
  } catch (err) {
    logger.error({ err, userId }, "fraud user detail error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── POST /api/admin/fraud/user/:id/action ────────────────────────────────────
router.post("/admin/fraud/user/:id/action", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  const adminId = req.userId!;
  const { action, reason } = req.body as { action: string; reason?: string };

  const validActions = ["ban", "unban", "flag", "unflag", "trust", "untrust", "kyc_require", "resolve_alerts", "reassess"];
  if (!validActions.includes(action)) {
    res.status(400).json({ error: "Invalid action" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    switch (action) {
      case "ban":
        await db.update(usersTable).set({ isBanned: true, isFlagged: true }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "high", 0, { action: "ban", adminId, reason });
        break;
      case "unban":
        await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "low", 0, { action: "unban", adminId, reason });
        break;
      case "flag":
        await db.update(usersTable).set({ isFlagged: true }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "medium", 0, { action: "flag", adminId, reason });
        break;
      case "unflag":
        await db.update(usersTable).set({ isFlagged: false }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "low", 0, { action: "unflag", adminId, reason });
        break;
      case "trust":
        await db.update(usersTable).set({ isTrusted: true, isFlagged: false }).where(eq(usersTable.id, userId));
        await upsertRiskScore(userId, { deviceScore: 0, ipScore: 0, behaviorScore: 0, paymentScore: 0, contentScore: 0 });
        await logFraudEvent(userId, "admin_review", "low", 0, { action: "trust", adminId });
        break;
      case "untrust":
        await db.update(usersTable).set({ isTrusted: false }).where(eq(usersTable.id, userId));
        break;
      case "kyc_require":
        await db.update(usersTable).set({ isFlagged: true }).where(eq(usersTable.id, userId));
        await createFraudAlert(userId, "kyc_required_manual", "high",
          "KYC Required — Admin Triggered",
          `Admin #${adminId} manually triggered KYC for user #${userId}. Reason: ${reason ?? "none"}`,
          { adminId, reason }
        );
        break;
      case "resolve_alerts":
        await db.execute(sql`
          UPDATE fraud_alerts SET resolved = true, resolved_by = ${adminId}, resolved_at = NOW()
          WHERE user_id = ${userId} AND resolved = false
        `);
        break;
      case "reassess": {
        const ip = user.registrationIp ?? "unknown";
        void assessNewAccount(userId, ip, user.deviceId ?? null, user.country ?? null);
        break;
      }
    }

    res.json({ ok: true, action });
  } catch (err) {
    logger.error({ err, userId, action }, "fraud action error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/events ──────────────────────────────────────────────
router.get("/admin/fraud/events", requireAdmin, async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = 40;
  const offset = (page - 1) * limit;
  const eventType = req.query.type as string | undefined;
  const severity = req.query.severity as string | undefined;

  try {
    const typeFilter = eventType ? `AND fe.event_type = '${eventType}'` : "";
    const severityFilter = severity ? `AND fe.severity = '${severity}'` : "";

    const events = await db.execute(sql.raw(`
      SELECT fe.*, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar, u.country, u.is_banned
      FROM fraud_events fe
      JOIN users u ON u.id = fe.user_id
      WHERE 1=1 ${typeFilter} ${severityFilter}
      ORDER BY fe.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `));

    const [countRow] = await db.execute(sql.raw(`
      SELECT COUNT(*)::int AS total FROM fraud_events fe WHERE 1=1 ${typeFilter} ${severityFilter}
    `));

    res.json({ events, total: (countRow as any)?.total ?? 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/rules ───────────────────────────────────────────────
router.get("/admin/fraud/rules", requireAdmin, async (req, res): Promise<void> => {
  try {
    const rules = await db.execute(sql`SELECT * FROM fraud_rules ORDER BY country NULLS FIRST, rule_key`);
    res.json({ rules });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── POST /api/admin/fraud/rules ─────────────────────────────────────────────
router.post("/admin/fraud/rules", requireAdmin, async (req, res): Promise<void> => {
  const { country, ruleKey, ruleValue, description, enabled } = req.body as {
    country?: string; ruleKey: string; ruleValue: string; description?: string; enabled?: boolean;
  };
  if (!ruleKey || !ruleValue) { res.status(400).json({ error: "ruleKey and ruleValue required" }); return; }
  try {
    await db.execute(sql`
      INSERT INTO fraud_rules (country, rule_key, rule_value, description, enabled, updated_at)
      VALUES (${country ?? null}, ${ruleKey}, ${ruleValue}, ${description ?? null}, ${enabled ?? true}, NOW())
      ON CONFLICT (COALESCE(country,'__global__'), rule_key) DO UPDATE SET
        rule_value = EXCLUDED.rule_value, description = EXCLUDED.description,
        enabled = EXCLUDED.enabled, updated_at = NOW()
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
