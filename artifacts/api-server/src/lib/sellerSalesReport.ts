import { GetSellerSalesReportResponse } from "@workspace/api-zod";
import type { SalesReportFilters } from "./sellerSalesReportFilters";
import {
  REPORT_CTE_SQL, REPORT_COUNT_SQL, REPORT_PERIODS_SQL, REPORT_ROWS_SQL, REPORT_SUMMARY_SQL,
} from "./sellerSalesReportSql";

export interface SalesReportConnection {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Caller must open a REPEATABLE READ, READ ONLY transaction. */
export async function readSellerSalesReport(
  connection: SalesReportConnection, sellerId: number, filters: SalesReportFilters,
) {
  if (!Number.isSafeInteger(sellerId) || sellerId < 1) throw new Error("INVALID_REPORT_IDENTITY");
  const params = [
    sellerId, `${filters.month}-01`, filters.timezone, filters.currency,
    filters.orderStatus, filters.paymentStatus, filters.payoutStatus,
  ];
  const summary = await connection.query(REPORT_SUMMARY_SQL, params);
  const count = await connection.query(REPORT_COUNT_SQL, params);
  const sales = await connection.query(REPORT_ROWS_SQL, [
    ...params, filters.limit, (filters.page - 1) * filters.limit,
  ]);
  const periods = await connection.query(REPORT_PERIODS_SQL, [sellerId, filters.timezone]);
  const currencies = await connection.query(
    REPORT_CTE_SQL + `SELECT DISTINCT UPPER(currency) AS currency FROM base ORDER BY currency`,
    [...params.slice(0, 3), null, null, null, null],
  );
  const bounds = await connection.query(`
    SELECT ($1::date::timestamp AT TIME ZONE $2) AS start,
      (($1::date + INTERVAL '1 month')::timestamp AT TIME ZONE $2) AS end,
      transaction_timestamp() AS now
  `, [`${filters.month}-01`, filters.timezone]);
  const total = Number(count.rows[0]?.total ?? 0);
  // Validate our output against the shared contract; never silently invent
  // defaults when the database/contract is incompatible.
  return GetSellerSalesReportResponse.parse({
    summary: summary.rows, sales: sales.rows,
    pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) },
    filters: {
      month: filters.month, timezone: filters.timezone,
      periodStart: bounds.rows[0].start, periodEnd: bounds.rows[0].end,
      asOf: bounds.rows[0].now, basis: "sale_created_at",
      availableMonths: [...new Set([filters.month, ...periods.rows.map(row => row.month as string)])].sort().reverse(),
      availableCurrencies: currencies.rows.map(row => row.currency),
    },
  });
}