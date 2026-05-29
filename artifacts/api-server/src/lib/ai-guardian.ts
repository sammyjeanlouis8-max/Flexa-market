/**
 * AI Guardian — Automatic security enforcement for FlexaMarket.
 *
 * Two background jobs:
 *  1. runHighRiskAutoBlock()  — Runs every 30 min.
 *     Scans every non-trusted, non-banned user.  Computes the same risk
 *     formula used in the Admin Security Panel.  When score ≥ 60 ("high")
 *     the user is automatically restricted for 72 h and an
 *     ai_guardian_decisions record is written.
 *
 *  2. runAiActivityMonitor()  — Runs every 2 h.
 *     Collects behavioural signals from the last 24 h (reports, rapid
 *     logins, flagged listings, large transfers) and sends a compact
 *     summary to Claude Haiku for threat assessment.  Claude returns a
 *     structured verdict per suspect and the action is applied immediately.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import {
  usersTable,
  loginLogsTable,
  reportsTable,
  notificationsTable,
  userRestrictionsTable,
} from "@workspace/db";
import { eq, and, gte, ne, sql, inArray, count } from "drizzle-orm";
import { logger } from "./logger";

// ── Anthropic client ──────────────────────────────────────────────────────────
const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const ai = baseURL && apiKey ? new Anthropic({ baseURL, apiKey }) : null;

// ── Risk helpers (same formula as admin.ts computeRisk) ───────────────────────
function computeRiskScore(
  user: typeof usersTable.$inferSelect,
  linkedByIpCount: number,
  linkedByDeviceCount: number,
): number {
  if (user.isTrusted || user.isBanned) return user.isBanned ? 100 : 0;
  let score = 0;
  if (user.isFlagged)              score += 25;
  if (linkedByIpCount >= 3)        score += 45;
  else if (linkedByIpCount >= 1)   score += 20;
  if (linkedByDeviceCount >= 2)    score += 40;
  else if (linkedByDeviceCount >= 1) score += 25;
  return Math.min(score, 99);
}

// ── Shared helpers ────────────────────────────────────────────────────────────
const SYSTEM_ADMIN_ID = 1; // used as the "admin" for auto-actions in the restrictions table

async function autoRestrict(
  userId: number,
  reason: string,
  triggeredBy: string,
  aiAnalysis?: string,
) {
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 h

  // 1. Update users table
  await db.update(usersTable).set({
    isRestricted:      true,
    restrictedUntil:   expiresAt,
    restrictionReason: reason,
  }).where(eq(usersTable.id, userId));

  // 2. Log in user_restrictions (admin_id = SYSTEM_ADMIN_ID)
  await db.insert(userRestrictionsTable).values({
    userId,
    adminId:      SYSTEM_ADMIN_ID,
    reason,
    durationDays: 3,
    notes:        `[AI Guardian — ${triggeredBy}]${aiAnalysis ? " " + aiAnalysis : ""}`,
    isActive:     true,
    expiresAt,
  });

  // 3. Log in ai_guardian_decisions
  await db.execute(sql.raw(`
    INSERT INTO ai_guardian_decisions
      (user_id, action, reason, triggered_by, ai_analysis, expires_at)
    VALUES
      (${userId}, 'restrict', ${JSON.stringify(reason)}, ${JSON.stringify(triggeredBy)},
       ${aiAnalysis ? JSON.stringify(aiAnalysis) : "NULL"}, '${expiresAt.toISOString()}')
  `));

  // 4. Notify user
  await db.insert(notificationsTable).values({
    userId,
    type:    "system_alert",
    title:   "⚠️ Kont ou an anba revizyon",
    message: `Kont ou an te sispann pou 72 èdtan akòz aktivite sispèk. Rezon: ${reason}`,
  } as any);
}

async function autoFlag(userId: number, reason: string, aiAnalysis?: string) {
  await db.update(usersTable).set({
    isFlagged:  true,
    flagReason: reason,
  }).where(eq(usersTable.id, userId));

  await db.execute(sql.raw(`
    INSERT INTO ai_guardian_decisions
      (user_id, action, reason, triggered_by, ai_analysis)
    VALUES
      (${userId}, 'flag', ${JSON.stringify(reason)}, 'ai_monitor',
       ${aiAnalysis ? JSON.stringify(aiAnalysis) : "NULL"})
  `));
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB 1 — High Risk Auto-Block
// ─────────────────────────────────────────────────────────────────────────────
export async function runHighRiskAutoBlock(): Promise<void> {
  // Fetch candidates: not banned, not trusted, not already restricted, not admin
  const candidates = await db
    .select({
      id:           usersTable.id,
      name:         usersTable.name,
      isFlagged:    usersTable.isFlagged,
      isBanned:     usersTable.isBanned,
      isTrusted:    usersTable.isTrusted,
      isAdmin:      usersTable.isAdmin,
      isSuperAdmin: usersTable.isSuperAdmin,
      registrationIp: usersTable.registrationIp,
      deviceId:     usersTable.deviceId,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.isBanned,     false),
        eq(usersTable.isTrusted,    false),
        eq(usersTable.isRestricted, false),
        eq(usersTable.isAdmin,      false),
        eq(usersTable.isSuperAdmin, false),
      )
    )
    .limit(500);

  let blocked = 0;

  for (const user of candidates) {
    // Skip admins just in case
    if (user.isAdmin || user.isSuperAdmin) continue;

    // Count other accounts sharing the same registration IP
    let linkedByIp = 0;
    if (user.registrationIp) {
      const [row] = await db
        .select({ c: count() })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.registrationIp, user.registrationIp),
            ne(usersTable.id, user.id),
          )
        );
      linkedByIp = Number(row?.c ?? 0);
    }

    // Count other accounts sharing the same device fingerprint
    let linkedByDevice = 0;
    if (user.deviceId) {
      const [row] = await db
        .select({ c: count() })
        .from(usersTable)
        .where(
          and(
            eq(usersTable.deviceId, user.deviceId),
            ne(usersTable.id, user.id),
          )
        );
      linkedByDevice = Number(row?.c ?? 0);
    }

    const score = computeRiskScore(user as any, linkedByIp, linkedByDevice);

    if (score >= 60) {
      const reasons: string[] = [];
      if (user.isFlagged)      reasons.push("kont te flagged pandan enskripsyon");
      if (linkedByIp >= 3)     reasons.push(`${linkedByIp} lòt kont pataje menm IP`);
      else if (linkedByIp >= 1) reasons.push(`${linkedByIp} kont lòt pataje menm IP`);
      if (linkedByDevice >= 2) reasons.push(`${linkedByDevice} kont lòt pataje menm aparèy`);
      else if (linkedByDevice >= 1) reasons.push("yon lòt kont pataje menm aparèy");

      await autoRestrict(
        user.id,
        `Risk leve (skor ${score}/100) — ${reasons.join("; ")}`,
        "high_risk_score",
      );
      blocked++;
      logger.info({ userId: user.id, score, linkedByIp, linkedByDevice }, "ai-guardian: auto-restricted high-risk user");
    }
  }

  if (blocked > 0) {
    logger.info({ blocked }, "ai-guardian: high-risk auto-block complete");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JOB 2 — AI Activity Monitor
// ─────────────────────────────────────────────────────────────────────────────
export async function runAiActivityMonitor(): Promise<void> {
  if (!ai) {
    logger.warn("ai-guardian: Anthropic not configured — skipping AI monitor");
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 h

  // ── Collect suspects ───────────────────────────────────────────────────────

  // 1. Users reported 2+ times in last 24 h (by target_type='user')
  const reportedUsers = await db
    .select({ targetId: reportsTable.targetId, c: count() })
    .from(reportsTable)
    .where(
      and(
        eq(reportsTable.targetType, "user"),
        gte(reportsTable.createdAt, since),
      )
    )
    .groupBy(reportsTable.targetId)
    .having(sql`count(*) >= 2`);

  // 2. Users with 10+ logins in 1 h (brute-force / account sharing)
  const rapidLoginRows = await db.execute(sql.raw(`
    SELECT user_id, COUNT(*) AS login_count
    FROM login_logs
    WHERE created_at >= NOW() - INTERVAL '1 hour'
    GROUP BY user_id
    HAVING COUNT(*) >= 10
  `));
  const rapidLoginUsers = (rapidLoginRows.rows as any[]).map(r => ({
    userId: Number(r.user_id), loginCount: Number(r.login_count),
  }));

  // 3. Users with flagged listings in last 24h
  const flaggedListingRows = await db.execute(sql.raw(`
    SELECT DISTINCT user_id
    FROM listings
    WHERE is_flagged = true AND created_at >= NOW() - INTERVAL '24 hours'
  `));
  const flaggedListingUsers = (flaggedListingRows.rows as any[]).map(r => Number(r.user_id));

  // 4. Users who sent $500+ in transfers in last 24h (velocity check)
  const highTransferRows = await db.execute(sql.raw(`
    SELECT from_user_id, SUM(amount_usd) AS total
    FROM wallet_transfers
    WHERE created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY from_user_id
    HAVING SUM(amount_usd) >= 500
  `));
  const highTransferUsers = (highTransferRows.rows as any[]).map(r => ({
    userId: Number(r.from_user_id), totalUsd: Number(r.total),
  }));

  // ── Build suspect set ──────────────────────────────────────────────────────
  type Suspect = {
    userId: number;
    signals: string[];
  };
  const suspectMap = new Map<number, Suspect>();

  const addSignal = (uid: number, signal: string) => {
    if (!suspectMap.has(uid)) suspectMap.set(uid, { userId: uid, signals: [] });
    suspectMap.get(uid)!.signals.push(signal);
  };

  for (const r of reportedUsers) addSignal(r.targetId, `${r.c} signalman an 24h`);
  for (const r of rapidLoginUsers) addSignal(r.userId, `${r.loginCount} login nan 1 èdtan (potansyèl partaj kont)`);
  for (const uid of flaggedListingUsers) addSignal(uid, "lis flagged pa moderasyon");
  for (const r of highTransferUsers) addSignal(r.userId, `$${r.totalUsd.toFixed(2)} transfere nan 24h`);

  if (suspectMap.size === 0) return;

  // ── Fetch user details for suspects ───────────────────────────────────────
  const suspectIds = [...suspectMap.keys()];
  const suspectUsers = await db
    .select({
      id:          usersTable.id,
      name:        usersTable.name,
      isBanned:    usersTable.isBanned,
      isRestricted:usersTable.isRestricted,
      isTrusted:   usersTable.isTrusted,
      isAdmin:     usersTable.isAdmin,
      isFlagged:   usersTable.isFlagged,
      createdAt:   usersTable.createdAt,
    })
    .from(usersTable)
    .where(inArray(usersTable.id, suspectIds));

  // Filter out already-banned / admins / trusted
  const actionable = suspectUsers.filter(
    u => !u.isBanned && !u.isTrusted && !u.isAdmin && !u.isRestricted
  );
  if (actionable.length === 0) return;

  // ── Build prompt ───────────────────────────────────────────────────────────
  const suspectList = actionable.map(u => {
    const s = suspectMap.get(u.id);
    const daysSinceReg = Math.floor((Date.now() - new Date(u.createdAt).getTime()) / 86400000);
    return `- ID ${u.id} | ${u.name} | registered ${daysSinceReg}d ago | flagged=${u.isFlagged} | signals: ${s?.signals.join(", ")}`;
  }).join("\n");

  let rawResponse = "";
  try {
    const msg = await ai.messages.create({
      model:      "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `You are FlexaMarket's AI Security Guardian. Analyze these suspicious users and decide on an action.

SUSPECTS (last 24h signals):
${suspectList}

For each suspect, respond with ONLY a JSON array (no markdown):
[
  {
    "userId": <number>,
    "action": "restrict" | "flag" | "warn" | "clear",
    "confidence": "high" | "medium" | "low",
    "reason": "<short English reason, max 20 words>"
  }
]

Rules:
- "restrict": account is clearly malicious (multiple strong signals) — auto-applies 72h restriction
- "flag": suspicious but not certain — marks account for admin review  
- "warn": mild concern — no action, just log
- "clear": signals are not actually suspicious — no action
- Only use "restrict" when confidence is "high" AND multiple independent signals exist
- Never restrict a user based on a single signal alone
- Prefer "flag" over "restrict" when signals are ambiguous`,
      }],
    });

    rawResponse = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    const match = rawResponse.match(/\[[\s\S]*\]/);
    const decisions: Array<{ userId: number; action: string; confidence: string; reason: string }> =
      JSON.parse(match?.[0] ?? "[]");

    for (const d of decisions) {
      if (!d.userId || !d.action) continue;
      const user = actionable.find(u => u.id === d.userId);
      if (!user) continue;

      if (d.action === "restrict" && d.confidence === "high") {
        await autoRestrict(d.userId, d.reason, "ai_monitor", `AI confidence: ${d.confidence}`);
        logger.info({ userId: d.userId, reason: d.reason }, "ai-guardian: AI auto-restricted user");
      } else if (d.action === "flag") {
        await autoFlag(d.userId, d.reason, `AI confidence: ${d.confidence}`);
        logger.info({ userId: d.userId, reason: d.reason }, "ai-guardian: AI flagged user");
      } else {
        // warn / clear — just log
        await db.execute(sql.raw(`
          INSERT INTO ai_guardian_decisions
            (user_id, action, reason, triggered_by, ai_analysis)
          VALUES
            (${d.userId}, ${JSON.stringify(d.action)}, ${JSON.stringify(d.reason)},
             'ai_monitor', ${JSON.stringify(`confidence: ${d.confidence}`)})
        `));
      }
    }

    logger.info({ suspects: suspectIds.length, decisions: decisions.length }, "ai-guardian: AI monitor complete");
  } catch (err) {
    logger.error({ err, rawResponse }, "ai-guardian: AI monitor error");
  }
}
