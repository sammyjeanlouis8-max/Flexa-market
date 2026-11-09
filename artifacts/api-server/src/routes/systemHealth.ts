import { Router } from "express";
import { db, pool } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { getBoostVideoUploadReadiness } from "../lib/boostVideoUploadReadiness";

const router = Router();

/**
 * GET /api/admin/system-health
 * Real dependency probes for the Admin Control Center.
 * Never invents metrics — each probe reports measured or unavailable.
 */
router.get("/admin/system-health", requireRole("moderator"), async (_req, res): Promise<void> => {
  const started = Date.now();
  const checks: Record<string, unknown> = {};

  // Database
  const dbStarted = Date.now();
  try {
    await pool.query("SELECT 1");
    checks.database = {
      status: "ok",
      latencyMs: Date.now() - dbStarted,
      pool: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      },
    };
  } catch (err: any) {
    checks.database = {
      status: "error",
      latencyMs: Date.now() - dbStarted,
      error: "Database unreachable",
    };
  }

  // Stripe webhook freshness (real table when present)
  try {
    const { rows } = await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE processed_at IS NULL)::int AS pending,
        MAX(received_at) AS last_received_at
      FROM stripe_webhook_events
    `) as unknown as { rows: Array<{ total: number; pending: number; last_received_at: string | null }> };
    const row = rows?.[0];
    checks.stripeWebhooks = {
      status: "ok",
      total: row?.total ?? 0,
      pending: row?.pending ?? 0,
      lastReceivedAt: row?.last_received_at ?? null,
    };
  } catch {
    checks.stripeWebhooks = {
      status: "unavailable",
      reason: "stripe_webhook_events table not readable in this environment",
    };
  }

  // Open buyer-protection disputes
  try {
    const { rows } = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('OPEN','UNDER_REVIEW','WAITING_FOR_SELLER','WAITING_FOR_BUYER'))::int AS open_count,
        COUNT(*)::int AS total
      FROM order_disputes
    `) as unknown as { rows: Array<{ open_count: number; total: number }> };
    checks.orderDisputes = {
      status: "ok",
      open: rows?.[0]?.open_count ?? 0,
      total: rows?.[0]?.total ?? 0,
    };
  } catch {
    checks.orderDisputes = {
      status: "unavailable",
      reason: "order_disputes table not ready yet",
    };
  }

  // Wasabi / boost video upload readiness (in-process probe maintained by storage routes)
  const wasabi = getBoostVideoUploadReadiness();
  checks.videoStorage = {
    status: wasabi.ready ? "ok" : "degraded",
    ready: wasabi.ready,
    lastError: wasabi.lastError,
  };

  // API process
  checks.api = {
    status: "ok",
    uptimeSec: Math.round(process.uptime()),
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    memoryRssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  };

  const overall = Object.values(checks).some((c: any) => c?.status === "error")
    ? "error"
    : Object.values(checks).some((c: any) => c?.status === "degraded" || c?.status === "unavailable")
      ? "degraded"
      : "ok";

  res.set("Cache-Control", "no-store");
  res.status(overall === "error" ? 503 : 200).json({
    status: overall,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    checks,
  });
});

export default router;
