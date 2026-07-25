/**
 * FlexaMarket Fraud Prevention & Risk Engine
 *
 * Risk score: 0–100
 *   0–29   → LOW    — normal user, no action
 *   30–59  → MEDIUM — soft flag, increased monitoring
 *   60–79  → HIGH   — hard flag, KYC trigger
 *   80–100 → CRITICAL — auto-suspend + admin alert
 *
 * Score components (each 0–20):
 *   device   — device reuse / fingerprint signals
 *   ip       — VPN, datacenter, high-risk country
 *   behavior — rapid posting, mass messaging, burst activity
 *   payment  — chargeback patterns, suspicious amounts
 *   content  — scam keywords in messages and listings
 */

import { db, usersTable, notificationsTable } from "@workspace/db";
import { eq, sql, and, gte, desc } from "drizzle-orm";
import { logger } from "./logger";
import type { Request } from "express";

// ─── Constants ───────────────────────────────────────────────────────────────

export const RISK_THRESHOLDS = {
  LOW: 0,
  MEDIUM: 30,
  HIGH: 60,
  CRITICAL: 80,
} as const;

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Known datacenter/cloud ASN prefixes that are highly associated with VPNs */
const DATACENTER_KEYWORDS = [
  "amazon", "aws", "microsoft", "azure", "google", "digitalocean", "linode",
  "vultr", "hetzner", "ovh", "leaseweb", "choopa", "quadranet", "psychz",
  "vpn", "proxy", "tor", "relay", "tunnel", "anonymi",
];

/** Known VPN/proxy ASN numbers (abbreviated list of common ones) */
const DATACENTER_ASNS = new Set([
  "AS14618", "AS16509", "AS8075", "AS396982", "AS15169", "AS14061",
  "AS14618", "AS20473", "AS63949", "AS16276", "AS24940",
]);

/** Countries with elevated fraud risk — apply stricter rules */
export const HIGH_RISK_COUNTRIES = new Set([
  "Nigeria", "Ghana", "Cameroon", "Ivory Coast", "Senegal",
  "Indonesia", "Malaysia", "Philippines", "Vietnam",
  "Romania", "Ukraine", "Moldova", "Belarus",
  "Colombia", "Venezuela", "Bolivia",
]);

/** Scam keyword patterns — weighted by severity */
const SCAM_PATTERNS: { pattern: RegExp; score: number; label: string }[] = [
  // External payment redirect
  { pattern: /cashapp|cash\s*app|\$cashtag/i, score: 8, label: "cashapp_redirect" },
  { pattern: /zelle|zellepay/i, score: 7, label: "zelle_redirect" },
  { pattern: /western\s*union|wu\s*transfer/i, score: 10, label: "western_union" },
  { pattern: /moneygram|money\s*gram/i, score: 10, label: "moneygram" },
  { pattern: /paypal\.me|venmo\.com/i, score: 6, label: "external_payment_link" },
  { pattern: /bitcoin|btc|crypto\s*pay|ethereum|usdt/i, score: 9, label: "crypto_payment" },
  // Advance fee fraud
  { pattern: /send.*first|pay.*upfront|advance.*fee|deposit.*first/i, score: 12, label: "advance_fee" },
  { pattern: /inheritance|beneficiary|million.*transfer|next.*of.*kin/i, score: 20, label: "419_fraud" },
  { pattern: /government.*grant|lottery.*winner|you.*won|prize.*claim/i, score: 18, label: "lottery_scam" },
  // Account takeover / phishing
  { pattern: /verify.*account.*link|click.*here.*login|confirm.*password/i, score: 15, label: "phishing" },
  { pattern: /whatsapp.*deal|telegram.*contact|dm.*for.*price/i, score: 8, label: "offplatform_redirect" },
  // Too good to be true
  { pattern: /\b(100%\s*free|totally\s*free)\b.*\$\d+/i, score: 7, label: "too_good" },
  { pattern: /work.*from.*home.*earn|\d+\s*k.*per.*day|make.*money.*fast/i, score: 10, label: "mlm_scam" },
  // Phone number in messages (high fraud signal)
  { pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/, score: 5, label: "phone_in_message" },
  // Haitian/Caribbean-specific scams
  { pattern: /voye.*lajan.*anba|envoye.*avant|transfere.*dabò/i, score: 12, label: "ht_advance_fee" },
  { pattern: /moncash.*link|moncash.*klike/i, score: 10, label: "moncash_phish" },
];

/** Listing price scam detection */
const SUSPICIOUS_PRICE_RATIO = 0.15; // listing price < 15% of category average → suspicious

// ─── IP Reputation ───────────────────────────────────────────────────────────

/** Extract real client IP from request (handles proxies) */
export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = (typeof forwarded === "string" ? forwarded : forwarded[0]).split(",");
    return ips[0].trim();
  }
  return req.socket?.remoteAddress ?? req.ip ?? "unknown";
}

/** Quick datacenter/VPN heuristic based on IP + optional ASN info */
export function isDatacenterIp(ip: string, asn?: string, ispName?: string): boolean {
  if (asn && DATACENTER_ASNS.has(asn)) return true;
  if (ispName) {
    const lower = ispName.toLowerCase();
    return DATACENTER_KEYWORDS.some(k => lower.includes(k));
  }
  // Heuristic: common cloud/VPN IP ranges (not exhaustive, but catches obvious cases)
  if (ip.startsWith("35.") || ip.startsWith("34.") || ip.startsWith("104.18.")) return true;
  return false;
}

/** Fetch basic IP info from ipapi.co (free tier, no key required, ~1000 req/day) */
export async function fetchIpReputation(ip: string): Promise<{
  country: string | null; asn: string | null; isp: string | null;
  isVpn: boolean; isDatacenter: boolean;
}> {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) {
    return { country: null, asn: null, isp: null, isVpn: false, isDatacenter: false };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(`https://ipapi.co/${ip}/json/`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!resp.ok) return { country: null, asn: null, isp: null, isVpn: false, isDatacenter: false };
    const data = await resp.json();
    const asn = data.asn ?? null;
    const isp = data.org ?? null;
    const isDatacenter = isDatacenterIp(ip, asn, isp);
    return {
      country: data.country_name ?? null,
      asn,
      isp,
      isVpn: isDatacenter,
      isDatacenter,
    };
  } catch {
    return { country: null, asn: null, isp: null, isVpn: false, isDatacenter: false };
  }
}

// ─── Scam Pattern Detection ───────────────────────────────────────────────────

export interface ScamResult {
  flagged: boolean;
  score: number;
  labels: string[];
}

export function detectScamPatterns(text: string): ScamResult {
  if (!text || text.length < 3) return { flagged: false, score: 0, labels: [] };
  const labels: string[] = [];
  let score = 0;
  for (const { pattern, score: s, label } of SCAM_PATTERNS) {
    if (pattern.test(text)) {
      score += s;
      labels.push(label);
    }
  }
  return { flagged: score >= 8, score: Math.min(score, 20), labels };
}

// ─── Behavioral Analysis ──────────────────────────────────────────────────────

/** Check if user is posting listings too fast */
export async function checkRapidPosting(userId: number): Promise<{ flagged: boolean; count: number }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [row] = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM listings
      WHERE seller_id = ${userId} AND created_at > ${oneHourAgo}
    `);
    const cnt = Number((row as any)?.cnt ?? 0);
    return { flagged: cnt >= 8, count: cnt };
  } catch { return { flagged: false, count: 0 }; }
}

/** Check if user is mass-messaging many different people */
export async function checkMassMessaging(userId: number): Promise<{ flagged: boolean; count: number }> {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [row] = await db.execute(sql`
      SELECT COUNT(DISTINCT conversation_id)::int AS cnt FROM messages
      WHERE sender_id = ${userId} AND created_at > ${oneHourAgo}
    `);
    const cnt = Number((row as any)?.cnt ?? 0);
    return { flagged: cnt >= 15, count: cnt };
  } catch { return { flagged: false, count: 0 }; }
}

/** Check for rapid account creation from same IP recently */
export async function checkAccountVelocity(ip: string): Promise<{ flagged: boolean; count: number }> {
  if (!ip || ip === "unknown") return { flagged: false, count: 0 };
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [row] = await db.execute(sql`
      SELECT COUNT(*)::int AS cnt FROM users
      WHERE registration_ip = ${ip} AND created_at > ${oneDayAgo}
    `);
    const cnt = Number((row as any)?.cnt ?? 0);
    return { flagged: cnt >= 3, count: cnt };
  } catch { return { flagged: false, count: 0 }; }
}

// ─── Risk Score Persistence ────────────────────────────────────────────────────

export async function getUserRiskScore(userId: number): Promise<{
  score: number; level: RiskLevel; deviceScore: number; ipScore: number;
  behaviorScore: number; paymentScore: number; contentScore: number;
} | null> {
  try {
    const [row] = await db.execute(sql`
      SELECT score, level, device_score, ip_score, behavior_score, payment_score, content_score
      FROM fraud_risk_scores WHERE user_id = ${userId}
    `);
    if (!row) return null;
    return {
      score: (row as any).score,
      level: (row as any).level as RiskLevel,
      deviceScore: (row as any).device_score,
      ipScore: (row as any).ip_score,
      behaviorScore: (row as any).behavior_score,
      paymentScore: (row as any).payment_score,
      contentScore: (row as any).content_score,
    };
  } catch { return null; }
}

export async function upsertRiskScore(userId: number, updates: {
  deviceScore?: number; ipScore?: number; behaviorScore?: number;
  paymentScore?: number; contentScore?: number;
}): Promise<number> {
  try {
    const existing = await getUserRiskScore(userId);
    const d = updates.deviceScore   ?? existing?.deviceScore   ?? 0;
    const i = updates.ipScore       ?? existing?.ipScore       ?? 0;
    const b = updates.behaviorScore ?? existing?.behaviorScore ?? 0;
    const p = updates.paymentScore  ?? existing?.paymentScore  ?? 0;
    const c = updates.contentScore  ?? existing?.contentScore  ?? 0;
    const composite = Math.min(100, d + i + b + p + c);
    const level: RiskLevel =
      composite >= RISK_THRESHOLDS.CRITICAL ? "critical" :
      composite >= RISK_THRESHOLDS.HIGH     ? "high" :
      composite >= RISK_THRESHOLDS.MEDIUM   ? "medium" : "low";

    await db.execute(sql`
      INSERT INTO fraud_risk_scores (user_id, score, level, device_score, ip_score, behavior_score, payment_score, content_score, last_computed_at, updated_at)
      VALUES (${userId}, ${composite}, ${level}, ${d}, ${i}, ${b}, ${p}, ${c}, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        score = EXCLUDED.score, level = EXCLUDED.level,
        device_score = EXCLUDED.device_score, ip_score = EXCLUDED.ip_score,
        behavior_score = EXCLUDED.behavior_score, payment_score = EXCLUDED.payment_score,
        content_score = EXCLUDED.content_score,
        last_computed_at = NOW(), updated_at = NOW()
    `);
    return composite;
  } catch (err) {
    logger.warn({ err, userId }, "fraud: upsertRiskScore failed");
    return 0;
  }
}

// ─── Event Logging ────────────────────────────────────────────────────────────

export type FraudEventType =
  | "device_reuse" | "banned_device" | "vpn_detected" | "datacenter_ip"
  | "high_risk_country" | "rapid_account_creation" | "rapid_posting"
  | "mass_messaging" | "scam_message" | "scam_listing" | "suspicious_price"
  | "ban_bypass_attempt" | "ip_shared" | "chargeback_risk"
  | "kyc_triggered" | "auto_suspended" | "admin_review";

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export async function logFraudEvent(
  userId: number,
  eventType: FraudEventType,
  severity: AlertSeverity,
  scoreDelta: number,
  details?: Record<string, unknown>,
  ip?: string,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO fraud_events (user_id, event_type, severity, score_delta, details, ip, created_at)
      VALUES (${userId}, ${eventType}, ${severity}, ${scoreDelta}, ${JSON.stringify(details ?? {})}, ${ip ?? null}, NOW())
    `);
  } catch (err) {
    logger.warn({ err, userId, eventType }, "fraud: logFraudEvent failed");
  }
}

// ─── Alert System ─────────────────────────────────────────────────────────────

export async function createFraudAlert(
  userId: number,
  alertType: string,
  severity: AlertSeverity,
  title: string,
  description: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  try {
    // Dedup: don't create same alert type for same user if already unresolved
    const [existing] = await db.execute(sql`
      SELECT id FROM fraud_alerts WHERE user_id = ${userId} AND alert_type = ${alertType} AND resolved = false
    `);
    if (existing) return;

    await db.execute(sql`
      INSERT INTO fraud_alerts (user_id, alert_type, severity, title, description, meta, created_at)
      VALUES (${userId}, ${alertType}, ${severity}, ${title}, ${description}, ${JSON.stringify(meta ?? {})}, NOW())
    `);

    // Notify all admins via in-app notification for high/critical alerts
    if (severity === "high" || severity === "critical") {
      const admins = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.isAdmin, true));
      if (admins.length > 0) {
        await db.insert(notificationsTable).values(
          admins.map(a => ({
            userId: a.id,
            type: "fraud_alert" as any,
            actorId: userId,
            isRead: false,
            meta: JSON.stringify({ alertType, severity, title, userId }),
          }))
        ).catch(() => {});
      }
    }
  } catch (err) {
    logger.warn({ err, userId, alertType }, "fraud: createFraudAlert failed");
  }
}

// ─── Automatic Actions ────────────────────────────────────────────────────────

/** Apply automatic actions based on new composite risk score */
export async function applyRiskActions(userId: number, score: number, level: RiskLevel): Promise<void> {
  try {
    const [user] = await db.select({
      isFlagged: usersTable.isFlagged,
      isBanned: usersTable.isBanned,
      isVerified: usersTable.isVerified,
    }).from(usersTable).where(eq(usersTable.id, userId));

    if (!user || user.isBanned) return;

    // MEDIUM → soft flag
    if (level === "medium" && !user.isFlagged) {
      await db.update(usersTable)
        .set({ isFlagged: true })
        .where(eq(usersTable.id, userId));
      logger.info({ userId, score }, "fraud: user auto-flagged (medium risk)");
    }

    // HIGH → hard flag + KYC trigger
    if (level === "high") {
      await db.update(usersTable)
        .set({ isFlagged: true })
        .where(eq(usersTable.id, userId));
      await logFraudEvent(userId, "kyc_triggered", "high", 0, { reason: "high_risk_score", score });
      await createFraudAlert(userId, "kyc_required", "high",
        "KYC Required — High Risk Account",
        `User risk score reached ${score}/100. Identity verification required before continued use.`,
        { score }
      );
    }

    // CRITICAL → auto-suspend
    if (level === "critical") {
      await db.update(usersTable)
        .set({ isFlagged: true, isBanned: true })
        .where(and(eq(usersTable.id, userId), eq(usersTable.isBanned, false)));
      await logFraudEvent(userId, "auto_suspended", "critical", 0, { reason: "critical_risk_score", score });
      await createFraudAlert(userId, "auto_suspended", "critical",
        "🚨 Account Auto-Suspended — Critical Risk",
        `User risk score reached ${score}/100 — account suspended pending admin review.`,
        { score }
      );
    }
  } catch (err) {
    logger.warn({ err, userId }, "fraud: applyRiskActions failed");
  }
}

// ─── High-Level Assessment Functions ─────────────────────────────────────────

/**
 * Full assessment at registration.
 * Called after user is created so we have the userId.
 * Fire-and-forget from register endpoint.
 */
export async function assessNewAccount(
  userId: number,
  ip: string,
  deviceId: string | null,
  country: string | null,
): Promise<void> {
  let deviceScore = 0;
  let ipScore = 0;

  // Device reuse signal (already handled in register, but record in fraud system)
  if (deviceId) {
    const [reused] = await db.execute(sql`
      SELECT id, is_banned FROM users WHERE device_id = ${deviceId} AND id != ${userId} LIMIT 1
    `);
    if (reused) {
      const wasBanned = (reused as any).is_banned;
      if (wasBanned) {
        deviceScore = 20;
        await logFraudEvent(userId, "banned_device", "critical", 20, { deviceId, linkedUserId: (reused as any).id }, ip);
        await createFraudAlert(userId, "banned_device", "critical",
          "🚨 Banned Device Detected",
          `New account registered with device previously linked to a banned account (#${(reused as any).id}).`,
          { deviceId, linkedUserId: (reused as any).id }
        );
      } else {
        deviceScore = 10;
        await logFraudEvent(userId, "device_reuse", "medium", 10, { deviceId, linkedUserId: (reused as any).id }, ip);
      }
    }
  }

  // IP signals
  const ipInfo = await fetchIpReputation(ip);
  if (ipInfo.isVpn || ipInfo.isDatacenter) {
    ipScore += 12;
    await logFraudEvent(userId, "vpn_detected", "high", 12, { ip, asn: ipInfo.asn, isp: ipInfo.isp }, ip);
    await createFraudAlert(userId, "vpn_registration", "high",
      "VPN/Proxy Registration Detected",
      `Account registered via VPN/datacenter IP: ${ip} (${ipInfo.isp ?? "unknown"})`,
      { ip, asn: ipInfo.asn, isp: ipInfo.isp }
    );
  }

  // IP velocity (shared IP accounts)
  const velocity = await checkAccountVelocity(ip);
  if (velocity.flagged) {
    ipScore += 8;
    await logFraudEvent(userId, "rapid_account_creation", "high", 8, { ip, count: velocity.count }, ip);
  }

  // High-risk country
  const effectiveCountry = country ?? ipInfo.country;
  if (effectiveCountry && HIGH_RISK_COUNTRIES.has(effectiveCountry)) {
    ipScore += 5;
    await logFraudEvent(userId, "high_risk_country", "low", 5, { country: effectiveCountry }, ip);
  }

  // Log IP
  await logIpAccess(userId, ip, ipInfo.country, ipInfo.isVpn, ipInfo.isDatacenter, ipInfo.asn, "register");

  const newScore = await upsertRiskScore(userId, { deviceScore, ipScore });
  const level: RiskLevel =
    newScore >= RISK_THRESHOLDS.CRITICAL ? "critical" :
    newScore >= RISK_THRESHOLDS.HIGH     ? "high" :
    newScore >= RISK_THRESHOLDS.MEDIUM   ? "medium" : "low";

  await applyRiskActions(userId, newScore, level);
}

/**
 * Assessment on login — detect ban bypass attempts.
 * Fire-and-forget.
 */
export async function assessLogin(userId: number, ip: string, deviceId?: string | null): Promise<void> {
  try {
    // Check if this device belongs to a banned user
    if (deviceId) {
      const [bannedDevice] = await db.execute(sql`
        SELECT id FROM users WHERE device_id = ${deviceId} AND is_banned = true AND id != ${userId} LIMIT 1
      `);
      if (bannedDevice) {
        const deviceScore = 20;
        await logFraudEvent(userId, "ban_bypass_attempt", "critical", 20,
          { deviceId, bannedUserId: (bannedDevice as any).id }, ip);
        await createFraudAlert(userId, "ban_bypass", "critical",
          "🚨 Ban Bypass Attempt",
          `User #${userId} logged in with a device linked to banned account #${(bannedDevice as any).id}.`,
          { deviceId, bannedUserId: (bannedDevice as any).id }
        );
        const existing = await getUserRiskScore(userId);
        const newScore = await upsertRiskScore(userId, { deviceScore: Math.max(deviceScore, existing?.deviceScore ?? 0) });
        const level: RiskLevel = newScore >= RISK_THRESHOLDS.CRITICAL ? "critical" :
          newScore >= RISK_THRESHOLDS.HIGH ? "high" : newScore >= RISK_THRESHOLDS.MEDIUM ? "medium" : "low";
        await applyRiskActions(userId, newScore, level);
      }
    }

    // Log IP access
    const ipInfo = await fetchIpReputation(ip).catch(() => ({ country: null, asn: null, isp: null, isVpn: false, isDatacenter: false }));
    await logIpAccess(userId, ip, ipInfo.country, ipInfo.isVpn, ipInfo.isDatacenter, ipInfo.asn, "login");
  } catch (err) {
    logger.warn({ err, userId }, "fraud: assessLogin failed");
  }
}

/**
 * Scan a message for scam patterns.
 * Returns whether message was flagged and the score increment.
 */
export async function assessMessage(
  userId: number,
  content: string,
  conversationId: number,
): Promise<{ blocked: boolean; flagged: boolean; labels: string[] }> {
  const result = detectScamPatterns(content);
  if (!result.flagged) return { blocked: false, flagged: false, labels: [] };

  await logFraudEvent(userId, "scam_message", "high", result.score,
    { conversationId, labels: result.labels, excerpt: content.slice(0, 200) });

  // Update content score
  const existing = await getUserRiskScore(userId);
  const newContentScore = Math.min(20, (existing?.contentScore ?? 0) + result.score);
  const newScore = await upsertRiskScore(userId, { contentScore: newContentScore });

  const level: RiskLevel =
    newScore >= RISK_THRESHOLDS.CRITICAL ? "critical" :
    newScore >= RISK_THRESHOLDS.HIGH     ? "high" :
    newScore >= RISK_THRESHOLDS.MEDIUM   ? "medium" : "low";

  await applyRiskActions(userId, newScore, level);

  const isCritical = result.labels.some(l =>
    ["419_fraud", "lottery_scam", "phishing", "western_union", "moneygram"].includes(l)
  );

  if (isCritical) {
    await createFraudAlert(userId, "scam_message", "high",
      "⚠️ Scam Message Detected",
      `User sent a message with high-risk patterns: ${result.labels.join(", ")}`,
      { conversationId, labels: result.labels, excerpt: content.slice(0, 300) }
    );
  }

  // Block only for critical patterns (419, phishing, advance fee)
  const blocked = isCritical && newScore >= RISK_THRESHOLDS.HIGH;
  return { blocked, flagged: true, labels: result.labels };
}

/**
 * Scan a listing for scam patterns.
 * Fire-and-forget.
 */
export async function assessListing(
  userId: number,
  listingId: number,
  title: string,
  description: string,
  price: number,
): Promise<void> {
  const combined = `${title} ${description}`;
  const result = detectScamPatterns(combined);

  if (result.flagged) {
    await logFraudEvent(userId, "scam_listing", "medium", result.score,
      { listingId, labels: result.labels, title });
    const existing = await getUserRiskScore(userId);
    const newContentScore = Math.min(20, (existing?.contentScore ?? 0) + Math.floor(result.score / 2));
    const newScore = await upsertRiskScore(userId, { contentScore: newContentScore });
    const level: RiskLevel =
      newScore >= RISK_THRESHOLDS.CRITICAL ? "critical" :
      newScore >= RISK_THRESHOLDS.HIGH     ? "high" :
      newScore >= RISK_THRESHOLDS.MEDIUM   ? "medium" : "low";
    await applyRiskActions(userId, newScore, level);
  }

  // Check rapid posting
  const posting = await checkRapidPosting(userId);
  if (posting.flagged) {
    await logFraudEvent(userId, "rapid_posting", "medium", 8,
      { listingId, count: posting.count });
    const existing = await getUserRiskScore(userId);
    const newBehaviorScore = Math.min(20, (existing?.behaviorScore ?? 0) + 8);
    const newScore = await upsertRiskScore(userId, { behaviorScore: newBehaviorScore });
    const level: RiskLevel =
      newScore >= RISK_THRESHOLDS.CRITICAL ? "critical" :
      newScore >= RISK_THRESHOLDS.HIGH     ? "high" :
      newScore >= RISK_THRESHOLDS.MEDIUM   ? "medium" : "low";
    await applyRiskActions(userId, newScore, level);
    await createFraudAlert(userId, "rapid_posting", "medium",
      "Rapid Listing Activity",
      `User posted ${posting.count} listings in the last hour.`,
      { count: posting.count }
    );
  }
}

/**
 * Assess unusual mass messaging.
 * Called after message is sent.
 */
export async function assessMassMessaging(userId: number): Promise<void> {
  const mass = await checkMassMessaging(userId);
  if (!mass.flagged) return;
  await logFraudEvent(userId, "mass_messaging", "medium", 8,
    { count: mass.count });
  const existing = await getUserRiskScore(userId);
  const newBehaviorScore = Math.min(20, (existing?.behaviorScore ?? 0) + 8);
  const newScore = await upsertRiskScore(userId, { behaviorScore: newBehaviorScore });
  const level: RiskLevel =
    newScore >= RISK_THRESHOLDS.CRITICAL ? "critical" :
    newScore >= RISK_THRESHOLDS.HIGH     ? "high" :
    newScore >= RISK_THRESHOLDS.MEDIUM   ? "medium" : "low";
  await applyRiskActions(userId, newScore, level);
  await createFraudAlert(userId, "mass_messaging", "medium",
    "Mass Messaging Detected",
    `User sent messages to ${mass.count} different conversations in the last hour.`,
    { count: mass.count }
  );
}

// ─── IP Log Utility ───────────────────────────────────────────────────────────

export async function logIpAccess(
  userId: number,
  ip: string,
  country: string | null,
  isVpn: boolean,
  isDatacenter: boolean,
  asn: string | null,
  action: string,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO fraud_ip_logs (user_id, ip, country, is_vpn, is_datacenter, asn, action, created_at)
      VALUES (${userId}, ${ip}, ${country}, ${isVpn}, ${isDatacenter}, ${asn}, ${action}, NOW())
    `);
  } catch { /* non-critical */ }
}
