import { Router } from "express";
import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getClientIp, upsertRiskScore, logFraudEvent, createFraudAlert, applyRiskActions, assessNewAccount, getUserRiskScore } from "../lib/fraudEngine";
import type { RiskLevel } from "../lib/fraudEngine";

const router = Router();

// ─── Whitelists (prevent SQL injection on enum columns) ───────────────────────

const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const VALID_RISK_LEVELS = new Set(["low", "medium", "high", "critical"]);
const VALID_EVENT_TYPES = new Set([
  "device_reuse", "banned_device", "vpn_detected", "datacenter_ip",
  "high_risk_country", "rapid_account_creation", "rapid_posting",
  "mass_messaging", "scam_message", "scam_listing", "suspicious_price",
  "ban_bypass_attempt", "ip_shared", "chargeback_risk",
  "kyc_triggered", "auto_suspended", "admin_review",
]);

function validateSeverity(v: unknown): string | null {
  if (typeof v === "string" && VALID_SEVERITIES.has(v)) return v;
  return null;
}
function validateLevel(v: unknown): string | null {
  if (typeof v === "string" && VALID_RISK_LEVELS.has(v)) return v;
  return null;
}
function validateEventType(v: unknown): string | null {
  if (typeof v === "string" && VALID_EVENT_TYPES.has(v)) return v;
  return null;
}

// ─── POST /api/fraud/fingerprint ──────────────────────────────────────────────
// Authenticated users submit a client-side device fingerprint.
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

  const [existing] = await db.execute(sql`
    SELECT fp.user_id, u.is_banned FROM fraud_device_fingerprints fp
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
    const prev = await getUserRiskScore(userId);
    const newDeviceScore = Math.min(20, (prev?.deviceScore ?? 0) + 20);
    const newScore = await upsertRiskScore(userId, { deviceScore: newDeviceScore });
    const level: RiskLevel = newScore >= 80 ? "critical" : newScore >= 60 ? "high" : "medium";
    await applyRiskActions(userId, newScore, level);
  } else if (existing) {
    await logFraudEvent(userId, "device_reuse", "medium", 8,
      { fingerprint: fingerprint.slice(0, 16), linkedUserId: (existing as any).user_id }, ip);
  }

  await db.execute(sql`
    INSERT INTO fraud_device_fingerprints
      (user_id, fingerprint, platform, screen_res, timezone, languages, hardware_concurrency, last_seen_ip, last_seen_at, created_at)
    VALUES
      (${userId}, ${fingerprint}, ${platform ?? null}, ${screenRes ?? null},
       ${timezone ?? null}, ${languages ?? null}, ${hardwareConcurrency ?? null},
       ${ip}, NOW(), NOW())
    ON CONFLICT (user_id, fingerprint)
    DO UPDATE SET last_seen_ip = EXCLUDED.last_seen_ip, last_seen_at = NOW()
  `);

  res.json({ ok: true });
});

// ─── GET /api/admin/fraud/dashboard ───────────────────────────────────────────
router.get("/admin/fraud/dashboard", requireAdmin, async (req, res): Promise<void> => {
  try {
    const [stats] = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = false)::int                             AS open_alerts,
        (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = false AND severity = 'critical')::int   AS critical_alerts,
        (SELECT COUNT(*) FROM fraud_alerts WHERE resolved = false AND severity = 'high')::int       AS high_alerts,
        (SELECT COUNT(*) FROM fraud_risk_scores WHERE level = 'critical')::int                     AS critical_users,
        (SELECT COUNT(*) FROM fraud_risk_scores WHERE level = 'high')::int                         AS high_users,
        (SELECT COUNT(*) FROM fraud_risk_scores WHERE level = 'medium')::int                       AS medium_users,
        (SELECT COUNT(*) FROM users WHERE is_flagged = true AND is_banned = false)::int            AS flagged_users,
        (SELECT COUNT(*) FROM users WHERE is_banned = true)::int                                   AS banned_users,
        (SELECT COUNT(*) FROM fraud_events WHERE created_at > NOW() - INTERVAL '24 hours')::int    AS events_24h,
        (SELECT COUNT(*) FROM fraud_events WHERE event_type = 'scam_message'
          AND created_at > NOW() - INTERVAL '24 hours')::int                                       AS scam_msgs_24h,
        (SELECT COUNT(*) FROM fraud_events WHERE event_type IN ('vpn_detected','datacenter_ip')
          AND created_at > NOW() - INTERVAL '24 hours')::int                                       AS vpn_24h,
        (SELECT COUNT(*) FROM fraud_events WHERE event_type = 'ban_bypass_attempt'
          AND created_at > NOW() - INTERVAL '24 hours')::int                                       AS bypass_24h
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
      SELECT frs.user_id, frs.score, frs.level, frs.device_score, frs.ip_score,
             frs.behavior_score, frs.payment_score, frs.content_score,
             u.name, u.email, u.avatar, u.country, u.is_banned, u.is_flagged, u.created_at AS joined_at
      FROM fraud_risk_scores frs
      JOIN users u ON u.id = frs.user_id
      WHERE frs.level IN ('critical', 'high')
      ORDER BY frs.score DESC
      LIMIT 15
    `);

    res.json({ stats: stats as any, recentAlerts, topRiskUsers });
  } catch (err) {
    logger.error({ err }, "fraud dashboard error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/alerts ──────────────────────────────────────────────
router.get("/admin/fraud/alerts", requireAdmin, async (req, res): Promise<void> => {
  const page   = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit  = 30;
  const offset = (page - 1) * limit;
  // Validate enum values against whitelists — never interpolate raw user input
  const severity   = validateSeverity(req.query.severity);
  const resolved   = req.query.resolved === "true";

  try {
    const alerts = await db.execute(
      severity
        ? sql`
            SELECT fa.id, fa.user_id, fa.alert_type, fa.severity, fa.title, fa.description, fa.meta,
                   fa.resolved, fa.resolved_at, fa.created_at,
                   u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar,
                   u.country, u.is_banned, u.is_flagged,
                   resolver.name AS resolved_by_name
            FROM fraud_alerts fa
            JOIN users u ON u.id = fa.user_id
            LEFT JOIN users resolver ON resolver.id = fa.resolved_by
            WHERE fa.resolved = ${resolved} AND fa.severity = ${severity}
            ORDER BY
              CASE fa.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
              fa.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : sql`
            SELECT fa.id, fa.user_id, fa.alert_type, fa.severity, fa.title, fa.description, fa.meta,
                   fa.resolved, fa.resolved_at, fa.created_at,
                   u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar,
                   u.country, u.is_banned, u.is_flagged,
                   resolver.name AS resolved_by_name
            FROM fraud_alerts fa
            JOIN users u ON u.id = fa.user_id
            LEFT JOIN users resolver ON resolver.id = fa.resolved_by
            WHERE fa.resolved = ${resolved}
            ORDER BY
              CASE fa.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
              fa.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
    );

    const [countRow] = await db.execute(
      severity
        ? sql`SELECT COUNT(*)::int AS total FROM fraud_alerts WHERE resolved = ${resolved} AND severity = ${severity}`
        : sql`SELECT COUNT(*)::int AS total FROM fraud_alerts WHERE resolved = ${resolved}`
    );

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
  if (isNaN(alertId)) { res.status(400).json({ error: "Invalid alert id" }); return; }
  try {
    await db.execute(sql`
      UPDATE fraud_alerts
      SET resolved = true, resolved_by = ${adminId}, resolved_at = NOW()
      WHERE id = ${alertId}
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/users ───────────────────────────────────────────────
router.get("/admin/fraud/users", requireAdmin, async (req, res): Promise<void> => {
  const page   = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit  = 25;
  const offset = (page - 1) * limit;
  // Validated whitelist — never interpolate raw level string
  const level  = validateLevel(req.query.level);
  // Search: passed as a SQL parameter, never interpolated as raw SQL
  const search = typeof req.query.q === "string" && req.query.q.trim().length > 0
    ? `%${req.query.q.trim()}%`
    : null;

  try {
    const users = await db.execute(
      level !== null && search !== null
        ? sql`
            SELECT frs.user_id, frs.score, frs.level, frs.device_score, frs.ip_score,
                   frs.behavior_score, frs.payment_score, frs.content_score, frs.last_computed_at,
                   u.name, u.email, u.avatar, u.country, u.is_banned, u.is_flagged, u.is_trusted, u.created_at AS joined_at,
                   (SELECT COUNT(*)::int FROM fraud_events fe WHERE fe.user_id = u.id) AS event_count,
                   (SELECT COUNT(*)::int FROM fraud_alerts fa WHERE fa.user_id = u.id AND fa.resolved = false) AS open_alerts
            FROM fraud_risk_scores frs JOIN users u ON u.id = frs.user_id
            WHERE frs.level = ${level} AND (u.name ILIKE ${search} OR u.email ILIKE ${search})
            ORDER BY frs.score DESC LIMIT ${limit} OFFSET ${offset}
          `
        : level !== null
        ? sql`
            SELECT frs.user_id, frs.score, frs.level, frs.device_score, frs.ip_score,
                   frs.behavior_score, frs.payment_score, frs.content_score, frs.last_computed_at,
                   u.name, u.email, u.avatar, u.country, u.is_banned, u.is_flagged, u.is_trusted, u.created_at AS joined_at,
                   (SELECT COUNT(*)::int FROM fraud_events fe WHERE fe.user_id = u.id) AS event_count,
                   (SELECT COUNT(*)::int FROM fraud_alerts fa WHERE fa.user_id = u.id AND fa.resolved = false) AS open_alerts
            FROM fraud_risk_scores frs JOIN users u ON u.id = frs.user_id
            WHERE frs.level = ${level}
            ORDER BY frs.score DESC LIMIT ${limit} OFFSET ${offset}
          `
        : search !== null
        ? sql`
            SELECT frs.user_id, frs.score, frs.level, frs.device_score, frs.ip_score,
                   frs.behavior_score, frs.payment_score, frs.content_score, frs.last_computed_at,
                   u.name, u.email, u.avatar, u.country, u.is_banned, u.is_flagged, u.is_trusted, u.created_at AS joined_at,
                   (SELECT COUNT(*)::int FROM fraud_events fe WHERE fe.user_id = u.id) AS event_count,
                   (SELECT COUNT(*)::int FROM fraud_alerts fa WHERE fa.user_id = u.id AND fa.resolved = false) AS open_alerts
            FROM fraud_risk_scores frs JOIN users u ON u.id = frs.user_id
            WHERE frs.level IN ('critical','high','medium') AND (u.name ILIKE ${search} OR u.email ILIKE ${search})
            ORDER BY frs.score DESC LIMIT ${limit} OFFSET ${offset}
          `
        : sql`
            SELECT frs.user_id, frs.score, frs.level, frs.device_score, frs.ip_score,
                   frs.behavior_score, frs.payment_score, frs.content_score, frs.last_computed_at,
                   u.name, u.email, u.avatar, u.country, u.is_banned, u.is_flagged, u.is_trusted, u.created_at AS joined_at,
                   (SELECT COUNT(*)::int FROM fraud_events fe WHERE fe.user_id = u.id) AS event_count,
                   (SELECT COUNT(*)::int FROM fraud_alerts fa WHERE fa.user_id = u.id AND fa.resolved = false) AS open_alerts
            FROM fraud_risk_scores frs JOIN users u ON u.id = frs.user_id
            WHERE frs.level IN ('critical','high','medium')
            ORDER BY frs.score DESC LIMIT ${limit} OFFSET ${offset}
          `
    );

    const [countRow] = await db.execute(
      level !== null && search !== null
        ? sql`SELECT COUNT(*)::int AS total FROM fraud_risk_scores frs JOIN users u ON u.id = frs.user_id WHERE frs.level = ${level} AND (u.name ILIKE ${search} OR u.email ILIKE ${search})`
        : level !== null
        ? sql`SELECT COUNT(*)::int AS total FROM fraud_risk_scores WHERE level = ${level}`
        : search !== null
        ? sql`SELECT COUNT(*)::int AS total FROM fraud_risk_scores frs JOIN users u ON u.id = frs.user_id WHERE frs.level IN ('critical','high','medium') AND (u.name ILIKE ${search} OR u.email ILIKE ${search})`
        : sql`SELECT COUNT(*)::int AS total FROM fraud_risk_scores WHERE level IN ('critical','high','medium')`
    );

    res.json({ users, total: (countRow as any)?.total ?? 0, page, limit });
  } catch (err) {
    logger.error({ err }, "fraud users error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/user/:id ────────────────────────────────────────────
router.get("/admin/fraud/user/:id", requireAdmin, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const [riskScore] = await db.execute(sql`
      SELECT * FROM fraud_risk_scores WHERE user_id = ${userId}
    `);
    const events = await db.execute(sql`
      SELECT * FROM fraud_events WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 50
    `);
    const alerts = await db.execute(sql`
      SELECT fa.*, u.name AS resolved_by_name FROM fraud_alerts fa
      LEFT JOIN users u ON u.id = fa.resolved_by
      WHERE fa.user_id = ${userId} ORDER BY fa.created_at DESC LIMIT 30
    `);
    const fingerprints = await db.execute(sql`
      SELECT * FROM fraud_device_fingerprints WHERE user_id = ${userId}
      ORDER BY last_seen_at DESC LIMIT 10
    `);
    const ipLogs = await db.execute(sql`
      SELECT * FROM fraud_ip_logs WHERE user_id = ${userId}
      ORDER BY created_at DESC LIMIT 20
    `);
    // Accounts that share an IP address with this user
    const sharedIpUsers = await db.execute(sql`
      SELECT DISTINCT u.id, u.name, u.email, u.is_banned, u.is_flagged, uil.ip
      FROM fraud_ip_logs uil
      JOIN fraud_ip_logs uil2
        ON uil2.ip = uil.ip
       AND uil2.user_id = ${userId}
       AND uil.user_id  != ${userId}
      JOIN users u ON u.id = uil.user_id
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
  const userId  = parseInt(req.params.id, 10);
  const adminId = req.userId!;
  if (isNaN(userId)) { res.status(400).json({ error: "Invalid user id" }); return; }

  const { action, reason } = req.body as { action: string; reason?: string };
  const VALID_ACTIONS = new Set([
    "ban", "unban", "flag", "unflag", "trust", "untrust",
    "kyc_require", "resolve_alerts", "reassess",
  ]);
  if (!VALID_ACTIONS.has(action)) {
    res.status(400).json({ error: "Invalid action" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const safeReason = typeof reason === "string" ? reason.slice(0, 500) : null;

    switch (action) {
      case "ban":
        await db.update(usersTable).set({ isBanned: true, isFlagged: true }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "high", 0, { action: "ban", adminId, reason: safeReason });
        break;
      case "unban":
        await db.update(usersTable).set({ isBanned: false }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "low", 0, { action: "unban", adminId, reason: safeReason });
        break;
      case "flag":
        await db.update(usersTable).set({ isFlagged: true }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "medium", 0, { action: "flag", adminId, reason: safeReason });
        break;
      case "unflag":
        await db.update(usersTable).set({ isFlagged: false }).where(eq(usersTable.id, userId));
        await logFraudEvent(userId, "admin_review", "low", 0, { action: "unflag", adminId, reason: safeReason });
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
          `Admin #${adminId} manually triggered KYC for user #${userId}. Reason: ${safeReason ?? "none"}`,
          { adminId, reason: safeReason }
        );
        break;
      case "resolve_alerts":
        await db.execute(sql`
          UPDATE fraud_alerts
          SET resolved = true, resolved_by = ${adminId}, resolved_at = NOW()
          WHERE user_id = ${userId} AND resolved = false
        `);
        break;
      case "reassess":
        void assessNewAccount(
          userId,
          user.registrationIp ?? "unknown",
          user.deviceId ?? null,
          user.country ?? null,
        );
        break;
    }

    res.json({ ok: true, action });
  } catch (err) {
    logger.error({ err, userId, action }, "fraud action error");
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/events ──────────────────────────────────────────────
router.get("/admin/fraud/events", requireAdmin, async (req, res): Promise<void> => {
  const page      = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit     = 40;
  const offset    = (page - 1) * limit;
  // Validated against whitelists — no raw interpolation
  const eventType = validateEventType(req.query.type);
  const severity  = validateSeverity(req.query.severity);

  try {
    const events = await db.execute(
      eventType !== null && severity !== null
        ? sql`
            SELECT fe.*, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar, u.country, u.is_banned
            FROM fraud_events fe JOIN users u ON u.id = fe.user_id
            WHERE fe.event_type = ${eventType} AND fe.severity = ${severity}
            ORDER BY fe.created_at DESC LIMIT ${limit} OFFSET ${offset}
          `
        : eventType !== null
        ? sql`
            SELECT fe.*, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar, u.country, u.is_banned
            FROM fraud_events fe JOIN users u ON u.id = fe.user_id
            WHERE fe.event_type = ${eventType}
            ORDER BY fe.created_at DESC LIMIT ${limit} OFFSET ${offset}
          `
        : severity !== null
        ? sql`
            SELECT fe.*, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar, u.country, u.is_banned
            FROM fraud_events fe JOIN users u ON u.id = fe.user_id
            WHERE fe.severity = ${severity}
            ORDER BY fe.created_at DESC LIMIT ${limit} OFFSET ${offset}
          `
        : sql`
            SELECT fe.*, u.name AS user_name, u.email AS user_email, u.avatar AS user_avatar, u.country, u.is_banned
            FROM fraud_events fe JOIN users u ON u.id = fe.user_id
            ORDER BY fe.created_at DESC LIMIT ${limit} OFFSET ${offset}
          `
    );

    const [countRow] = await db.execute(
      eventType !== null && severity !== null
        ? sql`SELECT COUNT(*)::int AS total FROM fraud_events WHERE event_type = ${eventType} AND severity = ${severity}`
        : eventType !== null
        ? sql`SELECT COUNT(*)::int AS total FROM fraud_events WHERE event_type = ${eventType}`
        : severity !== null
        ? sql`SELECT COUNT(*)::int AS total FROM fraud_events WHERE severity = ${severity}`
        : sql`SELECT COUNT(*)::int AS total FROM fraud_events`
    );

    res.json({ events, total: (countRow as any)?.total ?? 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── GET /api/admin/fraud/rules ───────────────────────────────────────────────
router.get("/admin/fraud/rules", requireAdmin, async (req, res): Promise<void> => {
  try {
    const rules = await db.execute(sql`
      SELECT * FROM fraud_rules ORDER BY country NULLS FIRST, rule_key
    `);
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

  if (!ruleKey || typeof ruleKey !== "string" || !ruleValue || typeof ruleValue !== "string") {
    res.status(400).json({ error: "ruleKey and ruleValue required" });
    return;
  }
  // Sanitise: rule keys and values are short identifiers/numbers — enforce length caps
  const safeKey     = ruleKey.slice(0, 100);
  const safeValue   = ruleValue.slice(0, 500);
  const safeCountry = typeof country === "string" ? country.slice(0, 100) : null;
  const safeDesc    = typeof description === "string" ? description.slice(0, 500) : null;
  const safeEnabled = typeof enabled === "boolean" ? enabled : true;

  try {
    await db.execute(sql`
      INSERT INTO fraud_rules (country, rule_key, rule_value, description, enabled, updated_at)
      VALUES (${safeCountry}, ${safeKey}, ${safeValue}, ${safeDesc}, ${safeEnabled}, NOW())
      ON CONFLICT (COALESCE(country, '__global__'), rule_key)
      DO UPDATE SET
        rule_value  = EXCLUDED.rule_value,
        description = EXCLUDED.description,
        enabled     = EXCLUDED.enabled,
        updated_at  = NOW()
    `);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
