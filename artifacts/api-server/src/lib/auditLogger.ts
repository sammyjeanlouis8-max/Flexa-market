import { db, adminAuditLogsTable } from "@workspace/db";
import { Request } from "express";
import { logger } from "./logger";

function generateId(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${prefix}-${year}-${rand}`;
}

export type AuditActionCategory =
  | "wallet" | "user" | "listing" | "security" | "agent" | "driver"
  | "subscription" | "delivery" | "support" | "system" | "escrow" | "fintech";

export type AuditRiskLevel = "low" | "medium" | "high" | "critical";

export interface AuditEntry {
  actionType:     string;
  actionCategory: AuditActionCategory;
  description:    string;
  targetType?:    string;
  targetId?:      number;
  targetName?:    string;
  beforeState?:   unknown;
  afterState?:    unknown;
  metadata?:      unknown;
  riskLevel?:     AuditRiskLevel;
}

/**
 * Log an admin action to the immutable audit trail.
 * Call this from any admin route handler.
 */
export async function logAdminAction(req: Request, entry: AuditEntry): Promise<void> {
  try {
    const actor = req.user as any;
    const actorId = req.userId!;
    const actorRole = actor?.isSuperAdmin ? "super_admin" : actor?.isAdmin ? "admin" : "agent";
    const actorName = actor?.name ?? "Unknown";

    const auditId  = generateId("AUD-ADM");
    const traceId  = generateId("SEC-TRACE");
    const ipAddress = (
      req.headers["x-forwarded-for"] as string
        ?? req.socket?.remoteAddress
        ?? "unknown"
    ).split(",")[0].trim();

    const riskLevel = entry.riskLevel ?? inferRiskLevel(entry.actionType);

    await db.insert(adminAuditLogsTable).values({
      auditId,
      traceId,
      actorId,
      actorName,
      actorRole,
      actionType:       entry.actionType,
      actionCategory:   entry.actionCategory,
      targetType:       entry.targetType ?? null,
      targetId:         entry.targetId ?? null,
      targetName:       entry.targetName ?? null,
      description:      entry.description,
      beforeState:      entry.beforeState ? JSON.stringify(entry.beforeState) : null,
      afterState:       entry.afterState  ? JSON.stringify(entry.afterState)  : null,
      metadata:         entry.metadata    ? JSON.stringify(entry.metadata)    : null,
      ipAddress,
      userAgent:        req.headers["user-agent"] ?? null,
      deviceFingerprint:req.headers["x-device-fp"] as string ?? null,
      geolocation:      req.headers["x-geo"] as string ?? null,
      sessionId:        req.headers["x-session-id"] as string ?? null,
      riskLevel,
      status:           "completed",
      flagged:          riskLevel === "critical",
    });
  } catch (err) {
    logger.warn({ err }, "auditLogger: failed to write audit entry");
  }
}

function inferRiskLevel(actionType: string): AuditRiskLevel {
  const critical = ["user_ban", "wallet_large_debit", "escrow_force_release", "privilege_change", "admin_create", "super_admin_action", "transaction_reverse"];
  const high     = ["wallet_credit", "wallet_debit", "user_suspend", "withdrawal_approve", "refund_approve", "dispute_resolve", "agent_approve", "kyc_approve"];
  const medium   = ["listing_delete", "listing_edit", "user_edit", "agent_reject", "boost_approve", "content_remove"];
  if (critical.some(k => actionType.includes(k))) return "critical";
  if (high.some(k => actionType.includes(k)))     return "high";
  if (medium.some(k => actionType.includes(k)))   return "medium";
  return "low";
}
