import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

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
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch {
    res.status(503).json({ status: "degraded" });
  }
});

export default router;
