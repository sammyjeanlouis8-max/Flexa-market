import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { getBoostVideoUploadReadiness } from "../lib/boostVideoUploadReadiness";

const router: IRouter = Router();

/**
 * Liveness + shallow readiness.
 * - Always returns JSON `{ status }` for load balancers.
 * - Runs `SELECT 1` against Postgres; returns 503 if the DB is unreachable.
 * - Does not expose connection strings or query details.
 */
router.get("/healthz", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const videoStorage = getBoostVideoUploadReadiness();
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json({
      ...data,
      checks: {
        database: "ok",
        videoStorage: videoStorage.ready ? "ok" : "degraded",
      },
    });
  } catch {
    res.status(503).json({ status: "degraded", checks: { database: "error" } });
  }
});

export default router;
