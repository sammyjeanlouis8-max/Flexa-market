/**
 * PRO MAX seller sales analytics dashboard.
 * Seller-scoped only (caller passes authenticated userId).
 * Completed revenue excludes cancelled / unpaid / pending / refunded orders.
 */
import type { SalesReportConnection } from "./sellerSalesReport";

export type DashboardPeriod = "overview" | "day" | "week" | "month" | "year";

export type DashboardFilters = {
  period: DashboardPeriod;
  timezone: string;
};

export type MoneyCard = {
  amount: number;
  orders: number;
  changePct: number | null;
};

export type SeriesPoint = {
  key: string;
  label: string;
  amount: number;
  orders: number;
};

export type TopProduct = {
  listingId: number;
  title: string;
  image: string | null;
  units: number;
  revenue: number;
};

export type RecentSale = {
  id: number;
  listingId: number | null;
  title: string | null;
  image: string | null;
  amount: number;
  currency: string;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
  buyerName: string | null;
};

const OWNER = `(t.seller_user_id = $1 OR (t.seller_user_id IS NULL AND l.seller_id = $1))`;
/** Completed revenue only — never cancelled, refunded, unpaid, or pending. */
const COMPLETED = `
  t.type = 'purchase'
  AND t.payment_status IN ('completed', 'paid')
  AND t.order_status NOT IN ('cancelled', 'canceled', 'failed', 'return_refunded')
  AND ${OWNER}
`;

const PERIODS: DashboardPeriod[] = ["overview", "day", "week", "month", "year"];

export function parseDashboardFilters(query: Record<string, unknown>): DashboardFilters {
  for (const key of ["seller_id", "sellerId", "userId", "user_id"]) {
    if (query[key] !== undefined) throw new Error("INVALID_DASHBOARD_FILTER");
  }
  const rawPeriod = String(query.period ?? "overview").toLowerCase();
  if (!PERIODS.includes(rawPeriod as DashboardPeriod)) throw new Error("INVALID_DASHBOARD_FILTER");
  const tzRaw = String(query.timezone ?? "UTC");
  if (tzRaw.length > 100) throw new Error("INVALID_DASHBOARD_FILTER");
  let timezone = "UTC";
  try {
    timezone = new Intl.DateTimeFormat("en", { timeZone: tzRaw }).resolvedOptions().timeZone;
  } catch {
    throw new Error("INVALID_DASHBOARD_FILTER");
  }
  return { period: rawPeriod as DashboardPeriod, timezone };
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

async function cardForWindow(
  connection: SalesReportConnection,
  sellerId: number,
  timezone: string,
  startSql: string,
  endSql: string,
  prevStartSql: string,
  prevEndSql: string,
): Promise<MoneyCard> {
  const q = `
    WITH cur AS (
      SELECT COALESCE(SUM(t.amount::numeric),0) AS amount, COUNT(*)::int AS orders
      FROM transactions t LEFT JOIN listings l ON l.id = t.listing_id
      WHERE ${COMPLETED}
        AND t.created_at >= (${startSql})
        AND t.created_at < (${endSql})
    ), prev AS (
      SELECT COALESCE(SUM(t.amount::numeric),0) AS amount
      FROM transactions t LEFT JOIN listings l ON l.id = t.listing_id
      WHERE ${COMPLETED}
        AND t.created_at >= (${prevStartSql})
        AND t.created_at < (${prevEndSql})
    )
    SELECT cur.amount, cur.orders, prev.amount AS prev_amount FROM cur, prev
  `;
  // $1 seller, $2 timezone (referenced inside start/end SQL fragments as $2)
  const { rows } = await connection.query(q, [sellerId, timezone]);
  const row = rows[0] ?? {};
  return {
    amount: num(row.amount),
    orders: num(row.orders),
    changePct: pctChange(num(row.amount), num(row.prev_amount)),
  };
}

async function totalCard(connection: SalesReportConnection, sellerId: number): Promise<MoneyCard> {
  const { rows } = await connection.query(
    `SELECT COALESCE(SUM(t.amount::numeric),0) AS amount, COUNT(*)::int AS orders
     FROM transactions t LEFT JOIN listings l ON l.id = t.listing_id
     WHERE ${COMPLETED}`,
    [sellerId],
  );
  return { amount: num(rows[0]?.amount), orders: num(rows[0]?.orders), changePct: null };
}

function seriesBucket(period: DashboardPeriod): { trunc: string; range: string; labelFmt: string } {
  switch (period) {
    case "day":
      return {
        trunc: "hour",
        range: `(date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`,
        labelFmt: "HH24h",
      };
    case "week":
      return {
        trunc: "day",
        range: `(date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2) - INTERVAL '6 days'`,
        labelFmt: "Dy",
      };
    case "month":
      return {
        trunc: "day",
        range: `(date_trunc('month', now() AT TIME ZONE $2) AT TIME ZONE $2)`,
        labelFmt: "DD",
      };
    case "year":
      return {
        trunc: "month",
        range: `(date_trunc('year', now() AT TIME ZONE $2) AT TIME ZONE $2)`,
        labelFmt: "Mon",
      };
    default: // overview → last 7 days
      return {
        trunc: "day",
        range: `(date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2) - INTERVAL '6 days'`,
        labelFmt: "Dy",
      };
  }
}

export async function readSellerSalesDashboard(
  connection: SalesReportConnection,
  sellerId: number,
  filters: DashboardFilters,
) {
  if (!Number.isSafeInteger(sellerId) || sellerId < 1) throw new Error("INVALID_DASHBOARD_IDENTITY");
  const { timezone, period } = filters;

  const dayStart = `(date_trunc('day', now() AT TIME ZONE $2) AT TIME ZONE $2)`;
  const dayEnd = `${dayStart} + INTERVAL '1 day'`;
  const prevDayStart = `${dayStart} - INTERVAL '1 day'`;

  const weekStart = `${dayStart} - INTERVAL '6 days'`;
  const prevWeekStart = `${weekStart} - INTERVAL '7 days'`;
  const prevWeekEnd = weekStart;

  const monthStart = `(date_trunc('month', now() AT TIME ZONE $2) AT TIME ZONE $2)`;
  const monthEnd = `${monthStart} + INTERVAL '1 month'`;
  const prevMonthStart = `${monthStart} - INTERVAL '1 month'`;

  const yearStart = `(date_trunc('year', now() AT TIME ZONE $2) AT TIME ZONE $2)`;
  const yearEnd = `${yearStart} + INTERVAL '1 year'`;
  const prevYearStart = `${yearStart} - INTERVAL '1 year'`;

  // Sequential on the pinned transaction client — node-pg forbids concurrent
  // queries on one connection (queued today, hard error in pg@9).
  const total = await totalCard(connection, sellerId);
  const today = await cardForWindow(connection, sellerId, timezone, dayStart, dayEnd, prevDayStart, dayStart);
  const week = await cardForWindow(connection, sellerId, timezone, weekStart, dayEnd, prevWeekStart, prevWeekEnd);
  const month = await cardForWindow(connection, sellerId, timezone, monthStart, monthEnd, prevMonthStart, monthStart);
  const year = await cardForWindow(connection, sellerId, timezone, yearStart, yearEnd, prevYearStart, yearStart);

  const bucket = seriesBucket(period);
  const seriesSql = `
    WITH bounds AS (
      SELECT ${bucket.range} AS start_at, now() AS end_at
    ), pts AS (
      SELECT date_trunc('${bucket.trunc}', t.created_at AT TIME ZONE $2) AS bucket,
        SUM(t.amount::numeric) AS amount, COUNT(*)::int AS orders
      FROM transactions t LEFT JOIN listings l ON l.id = t.listing_id, bounds
      WHERE ${COMPLETED}
        AND t.created_at >= bounds.start_at
        AND t.created_at < bounds.end_at + INTERVAL '1 day'
      GROUP BY 1
    )
    SELECT to_char(bucket, 'YYYY-MM-DD"T"HH24:MI:SS') AS key,
      to_char(bucket, '${bucket.labelFmt}') AS label,
      amount, orders
    FROM pts
    ORDER BY bucket
  `;
  const seriesRes = await connection.query(seriesSql, [sellerId, timezone]);
  const series: SeriesPoint[] = seriesRes.rows.map((r) => ({
    key: String(r.key),
    label: String(r.label ?? ""),
    amount: num(r.amount),
    orders: num(r.orders),
  }));

  // Top products for the active chart window (or all-time on overview total).
  const topRange =
    period === "day" ? dayStart
    : period === "week" ? weekStart
    : period === "month" ? monthStart
    : period === "year" ? yearStart
    : `'-infinity'::timestamptz`;
  const topEnd =
    period === "overview" ? `'infinity'::timestamptz` : dayEnd;

  // Overview bounds are plain timestamptz literals (no $2). Passing an unused
  // timezone bind makes Postgres reject the query:
  // "bind message supplies 2 parameters, but prepared statement requires 1".
  // That is the default /sales tab, so the whole dashboard 503'd on every load.
  const topParams = period === "overview" ? [sellerId] : [sellerId, timezone];
  const topRes = await connection.query(
    `
    SELECT t.listing_id AS "listingId",
      COALESCE(MAX(l.title), 'Product') AS title,
      (MAX(l.images))[1] AS image,
      COUNT(*)::int AS units,
      COALESCE(SUM(t.amount::numeric),0) AS revenue
    FROM transactions t LEFT JOIN listings l ON l.id = t.listing_id
    WHERE ${COMPLETED}
      AND t.listing_id IS NOT NULL
      AND t.created_at >= (${topRange})
      AND t.created_at < (${topEnd})
    GROUP BY t.listing_id
    ORDER BY revenue DESC, units DESC
    LIMIT 5
    `,
    topParams,
  );
  const topProducts: TopProduct[] = topRes.rows.map((r) => ({
    listingId: num(r.listingId),
    title: String(r.title ?? "Product"),
    image: r.image ? String(r.image) : null,
    units: num(r.units),
    revenue: num(r.revenue),
  }));

  // Buyer PII is not expanded here — keep parity with the existing sales report rows.
  const recentRes = await connection.query(
    `
    SELECT t.id, t.listing_id AS "listingId", l.title,
      (l.images)[1] AS image,
      t.amount::float AS amount, UPPER(t.currency) AS currency,
      t.order_status AS "orderStatus", t.payment_status AS "paymentStatus",
      t.created_at AS "createdAt"
    FROM transactions t
    LEFT JOIN listings l ON l.id = t.listing_id
    WHERE ${COMPLETED}
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT 8
    `,
    [sellerId],
  );
  const recentSales: RecentSale[] = recentRes.rows.map((r) => ({
    id: num(r.id),
    listingId: r.listingId == null ? null : num(r.listingId),
    title: r.title == null ? null : String(r.title),
    image: r.image ? String(r.image) : null,
    amount: num(r.amount),
    currency: String(r.currency ?? "USD"),
    orderStatus: String(r.orderStatus ?? ""),
    paymentStatus: String(r.paymentStatus ?? ""),
    createdAt: new Date(String(r.createdAt)).toISOString(),
    buyerName: null,
  }));

  // Primary display currency from latest sale, else USD.
  const currency = recentSales[0]?.currency ?? "USD";

  return {
    period,
    timezone,
    currency,
    asOf: new Date().toISOString(),
    cards: { total, today, week, month, year },
    series,
    topProducts,
    recentSales,
  };
}
