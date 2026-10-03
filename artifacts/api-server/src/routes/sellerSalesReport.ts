import type { Request, Response } from "express";
import { pool } from "@workspace/db";
import { parseSalesReportFilters } from "../lib/sellerSalesReportFilters";
import { readSellerSalesReport, type SalesReportConnection } from "../lib/sellerSalesReport";

/** Mounted behind requireAuth on the existing /sales/summary endpoint. */
export async function handleSellerSalesReport(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "private, no-store");
  res.vary("Authorization");
  res.vary("Cookie");
  if (!req.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  let filters;
  try {
    filters = parseSalesReportFilters(req.query);
  } catch {
    res.status(400).json({ error: "INVALID_REPORT_FILTER" });
    return;
  }
  let connection: (SalesReportConnection & { release(): void }) | undefined;
  try {
    connection = await pool.connect();
    // Enforced by PostgreSQL, not just a convention: report queries cannot
    // mutate ANY persistent financial record or call a settlement operation.
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await connection.query("SET LOCAL statement_timeout = '15000ms'");
    const report = await readSellerSalesReport(connection, req.userId, filters);
    await connection.query("COMMIT");
    res.json(report);
  } catch (error) {
    if (connection) await connection.query("ROLLBACK").catch(() => undefined);
    req.log?.error({ error }, "Seller sales report unavailable");
    res.status(503).json({ error: "SALES_REPORT_UNAVAILABLE" });
  } finally {
    connection?.release();
  }
}