import { GetSellerSalesReportQueryParams } from "@workspace/api-zod";

export type SalesReportFilters = {
  month: string; timezone: string; page: number; limit: number;
  currency: string | null; orderStatus: string | null;
  paymentStatus: string | null; payoutStatus: string | null;
};

export function parseSalesReportFilters(query: Record<string, unknown>, now = new Date()): SalesReportFilters {
  // Seller identity is never an accepted report parameter.
  for (const key of ["seller_id", "sellerId", "userId", "user_id"]) {
    if (query[key] !== undefined) throw new Error("INVALID_REPORT_FILTER");
  }
  const parsed = GetSellerSalesReportQueryParams.parse({ ...query, report: query.report ?? "monthly" });
  if (parsed.timezone.length > 100) throw new Error("INVALID_REPORT_FILTER");
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: parsed.timezone, year: "numeric", month: "2-digit",
  });
  // Canonicalize aliases so Intl month selection and PostgreSQL boundaries
  // cannot disagree about abbreviations such as CST.
  const timezone = formatter.resolvedOptions().timeZone;
  const parts = formatter.formatToParts(now);
  const month = parsed.month ?? `${parts.find(p => p.type === "year")!.value}-${parts.find(p => p.type === "month")!.value}`;
  if (Number(month.slice(0, 4)) < 1900 || Number(month.slice(0, 4)) > 2100 || parsed.page > 1_000_000) {
    throw new Error("INVALID_REPORT_FILTER");
  }
  const status = (value: string | undefined) => {
    if (!value || value === "all") return null;
    if (!/^[a-z_]{1,50}$/.test(value)) throw new Error("INVALID_REPORT_FILTER");
    return value;
  };
  const currency = parsed.currency?.toUpperCase() ?? null;
  if (currency !== null && !/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_REPORT_FILTER");
  const payoutStatus = status(parsed.payoutStatus);
  if (payoutStatus && !["pending", "processing", "transferred", "failed", "returned", "not_applicable", "verification_required"].includes(payoutStatus)) {
    throw new Error("INVALID_REPORT_FILTER");
  }
  return {
    month, timezone, page: parsed.page, limit: parsed.limit, currency,
    orderStatus: status(parsed.orderStatus), paymentStatus: status(parsed.paymentStatus), payoutStatus,
  };
}