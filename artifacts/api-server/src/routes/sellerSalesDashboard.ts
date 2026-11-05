import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import {
  parseDashboardFilters,
  readSellerSalesDashboard,
} from "../lib/sellerSalesDashboard";
import type { SalesReportConnection } from "../lib/sellerSalesReport";

/** Mounted behind requireAuth — seller identity always from session. */
export async function handleSellerSalesDashboard(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  res.vary("Authorization");
  res.vary("Cookie");
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let filters;
  try {
    filters = parseDashboardFilters(req.query as Record<string, unknown>);
  } catch {
    res.status(400).json({ error: "INVALID_DASHBOARD_FILTER" });
    return;
  }
  let connection: (SalesReportConnection & { release(): void }) | undefined;
  try {
    connection = await pool.connect();
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await connection.query("SET LOCAL statement_timeout = '15000ms'");
    const dashboard = await readSellerSalesDashboard(connection, req.userId, filters);
    await connection.query("COMMIT");
    res.json(dashboard);
  } catch (error) {
    if (connection) await connection.query("ROLLBACK").catch(() => undefined);
    req.log?.error({ error }, "Seller sales dashboard unavailable");
    res.status(503).json({ error: "SALES_DASHBOARD_UNAVAILABLE" });
  } finally {
    connection?.release();
  }
}
