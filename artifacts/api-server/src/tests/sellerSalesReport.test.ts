import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { pool } from "@workspace/db";
import { parseSalesReportFilters } from "../lib/sellerSalesReportFilters";
import { readSellerSalesReport, type SalesReportConnection } from "../lib/sellerSalesReport";
import { REPORT_CTE_SQL } from "../lib/sellerSalesReportSql";

// All fixtures are CONNECTION-LOCAL PostgreSQL TEMP tables. They shadow public
// names only on this test connection: no user, wallet balance, payment, or
// persistent financial record is created, changed, or deleted.
let client: SalesReportConnection & { release(destroy?: boolean): void };
const baseFilters = () => parseSalesReportFilters({ month: "2026-03", timezone: "UTC", limit: 20 });
const fixtures = `
CREATE TEMP TABLE listings (id integer PRIMARY KEY, seller_id integer, title text, images text[]);
CREATE TEMP TABLE transactions (
  id integer PRIMARY KEY, listing_id integer, seller_user_id integer, type text DEFAULT 'purchase',
  amount real DEFAULT 100, currency text DEFAULT 'USD', payment_method text DEFAULT 'stripe',
  payment_status text DEFAULT 'completed', order_status text DEFAULT 'completed',
  commission_amount real DEFAULT 7, seller_earnings real DEFAULT 93, buyer_total real DEFAULT 100,
  listing_country text DEFAULT 'Haiti', settlement_status text DEFAULT 'pending',
  settlement_method text, stripe_transfer_id text, escrow_released boolean DEFAULT false,
  escrow_released_at timestamptz, stripe_verified_status text, stripe_verified_currency text,
  stripe_verified_amount_cents integer, created_at timestamptz DEFAULT '2026-03-15T12:00:00Z'
);
CREATE TEMP TABLE stripe_refund_ledger (
  id integer PRIMARY KEY, transaction_id integer, amount_cents integer, currency text DEFAULT 'USD',
  provider_status text DEFAULT 'succeeded', created_at timestamptz DEFAULT '2026-04-10T12:00:00Z'
);
CREATE TEMP TABLE order_returns (
  id integer PRIMARY KEY, order_id integer, status text, refund_amount real, refunded_at timestamptz
);
CREATE TEMP TABLE wallet_transactions (
  id integer PRIMARY KEY, user_id integer, payment_ref text UNIQUE, type text DEFAULT 'sale_earnings',
  status text DEFAULT 'completed', amount_usd real, created_at timestamptz DEFAULT '2026-03-20T12:00:00Z'
);
CREATE TEMP TABLE marketplace_seller_payouts (
  transaction_id integer UNIQUE, seller_id integer, status text, net_amount real,
  paid_at timestamptz, payment_method text
);
`;
async function report(seller = 1, patch = {}) {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    return await readSellerSalesReport(client, seller, { ...baseFilters(), ...patch });
  } finally {
    await client.query("ROLLBACK");
  }
}
async function seed(count = 1) {
  await client.query(`INSERT INTO pg_temp.transactions(id,listing_id,seller_user_id)
    SELECT n,1,1 FROM generate_series(1,$1::integer) n`, [count]);
}
beforeAll(async () => {
  client = await pool.connect();
  await client.query(fixtures);
}, 20_000);
beforeEach(async () => {
  await client.query(`TRUNCATE pg_temp.transactions, pg_temp.listings, pg_temp.stripe_refund_ledger,
    pg_temp.order_returns, pg_temp.wallet_transactions, pg_temp.marketplace_seller_payouts`);
  await client.query("INSERT INTO pg_temp.listings VALUES (1,1,'Synthetic product',ARRAY[]::text[]),(2,2,'Other seller',ARRAY[]::text[])");
});
afterAll(async () => { client?.release(true); await pool.end(); });

describe("read-only monthly seller reporting on PostgreSQL", () => {
  it("uses stored commission and net, without charging buyer or delivery fees to seller", async () => {
    await seed(2);
    await client.query("UPDATE pg_temp.transactions SET buyer_total=113");
    const r = await report();
    expect(r.summary[0]).toMatchObject({
      orderCount: 2, grossSalesMinor: "20000", feesMinor: "0", commissionsMinor: "1400",
      netSellerAmountMinor: "18600", pendingAmountMinor: "18600", transferredAmountMinor: "0", complete: true,
    });
    expect(r.sales[0].customerPaymentMinor).toBe("11300");
  });
  it("does not count failed, unpaid or cancelled records as earnings", async () => {
    await seed(4);
    await client.query("UPDATE pg_temp.transactions SET payment_status='failed' WHERE id=2");
    await client.query("UPDATE pg_temp.transactions SET payment_status='pending' WHERE id=3");
    await client.query("UPDATE pg_temp.transactions SET order_status='cancelled' WHERE id=4");
    const r = await report();
    expect(r.pagination.total).toBe(4);
    expect(r.summary[0].grossSalesMinor).toBe("10000");
    expect(r.summary[0].netSellerAmountMinor).toBe("9300");
    expect(r.sales.filter(x => x.id !== 1).every(x => x.netSellerAmountMinor === "0")).toBe(true);
  });
  it("supports full and multiple partial refunds; ignores failed or unconfirmed refunds", async () => {
    await seed(2);
    await client.query(`INSERT INTO pg_temp.stripe_refund_ledger(id,transaction_id,amount_cents,provider_status)
      VALUES (1,1,2000,'succeeded'),(2,1,3000,'succeeded'),(3,1,9000,'failed'),(4,1,9000,'pending'),(5,2,10000,'succeeded')`);
    const r = await report();
    expect(r.summary[0]).toMatchObject({
      grossSalesMinor: "20000", refundsMinor: "15000", commissionsMinor: "350",
      netSellerAmountMinor: "4650", pendingAmountMinor: "4650",
    });
    expect(r.sales.find(x => x.id === 1)?.refunds).toHaveLength(2);
    expect(r.sales.find(x => x.id === 2)?.payoutStatus).toBe("not_applicable");
  });
  it("does not double-count a Stripe refund also recorded as an order return", async () => {
    await seed();
    await client.query("INSERT INTO pg_temp.stripe_refund_ledger(id,transaction_id,amount_cents) VALUES (1,1,5000)");
    await client.query("INSERT INTO pg_temp.order_returns VALUES(1,1,'refunded',50,'2026-04-01')");
    expect((await report()).summary[0].refundsMinor).toBe("5000");
  });
  it("does not override an unconfirmed provider refund with a premature local refunded status", async () => {
    await seed();
    await client.query("UPDATE pg_temp.transactions SET payment_status='refunded'");
    await client.query("INSERT INTO pg_temp.stripe_refund_ledger(id,transaction_id,amount_cents,provider_status) VALUES(1,1,10000,'pending')");
    const r = await report();
    expect(r.sales[0].customerRefundMinor).toBeNull();
    expect(r.sales[0].refunds).toHaveLength(0);
    expect(r.summary[0].netSellerAmountMinor).toBeNull();
  });
  it("distinguishes an authoritative full-refund status from a partial refund with missing amount", async () => {
    await seed(2);
    await client.query("UPDATE pg_temp.transactions SET payment_status='refunded',order_status='return_refunded' WHERE id=1");
    await client.query("UPDATE pg_temp.transactions SET payment_status='partially_refunded' WHERE id=2");
    const r = await report();
    expect(r.sales.find(x => x.id === 1)?.netSellerAmountMinor).toBe("0");
    expect(r.sales.find(x => x.id === 2)?.netSellerAmountMinor).toBeNull();
    expect(r.summary[0].netSellerAmountMinor).toBeNull();
    expect(r.summary[0].complete).toBe(false);
  });
  it("keeps transferred proof separate from paid/escrow flags and post-payout refund adjustments", async () => {
    await seed(4);
    await client.query("UPDATE pg_temp.transactions SET settlement_status='paid',escrow_released=true,settlement_method='stripe_connect'");
    await client.query("UPDATE pg_temp.transactions SET stripe_transfer_id='tr_synthetic',escrow_released_at='2026-03-20' WHERE id=1");
    await client.query("INSERT INTO pg_temp.wallet_transactions(id,user_id,payment_ref,amount_usd) VALUES(1,1,'order-2',93),(2,1,'order-3-stripe-release',93)");
    await client.query("UPDATE pg_temp.transactions SET settlement_status='refund_recovery_required' WHERE id=1");
    await client.query("INSERT INTO pg_temp.stripe_refund_ledger(id,transaction_id,amount_cents) VALUES(1,1,5000)");
    const r = await report();
    expect(r.sales.find(x => x.id === 1)).toMatchObject({ payoutStatus: "transferred", netSellerAmountMinor: "4650", transferredMinor: "9300" });
    expect(r.sales.find(x => x.id === 1)?.warnings).toContain("recovery_required");
    expect(r.sales.find(x => x.id === 2)?.payoutDestination).toBe("FM Card");
    expect(r.sales.find(x => x.id === 3)?.payoutStatus).toBe("verification_required");
    expect(r.sales.find(x => x.id === 4)?.payoutDate).toBeNull();
    expect(r.sales.find(x => x.id === 3)?.transferredMinor).toBeNull();
    expect(r.summary[0].transferredAmountMinor).toBeNull();
  });
  it("shows pending, processing, failed, MonCash-confirmed and returned states independently", async () => {
    await seed(5);
    await client.query("UPDATE pg_temp.transactions SET settlement_status='processing' WHERE id=2");
    await client.query("UPDATE pg_temp.transactions SET settlement_status='failed' WHERE id=3");
    await client.query("INSERT INTO pg_temp.marketplace_seller_payouts VALUES(4,1,'paid',93,'2026-03-21','moncash')");
    await client.query("INSERT INTO pg_temp.order_returns VALUES(5,5,'refunded',100,'2026-03-22')");
    await client.query("INSERT INTO pg_temp.wallet_transactions VALUES(5,1,'order-5','sale_earnings','completed',93,'2026-03-20'),(6,1,'return-5','return_debit','completed',-100,'2026-03-22')");
    const r = await report();
    const statuses = Object.fromEntries(r.sales.map(x => [x.id,x.payoutStatus]));
    expect(statuses).toEqual({ 1: "pending", 2: "processing", 3: "failed", 4: "transferred", 5: "returned" });
    expect(r.summary[0].pendingAmountMinor).toBe("27900");
    expect(r.summary[0].processingAmountMinor).toBe("9300");
    expect(r.summary[0].returnedAmountMinor).toBe("10000");
  });
  it("never sums currencies and blocks unverifiable cross-currency payout attribution", async () => {
    await seed(3);
    await client.query("UPDATE pg_temp.transactions SET currency='EUR' WHERE id=2");
    await client.query("UPDATE pg_temp.transactions SET currency='JPY',amount=1000,buyer_total=1000,commission_amount=70,seller_earnings=930 WHERE id=3");
    const r = await report();
    expect(r.summary.map(x => x.currency)).toEqual(["EUR","JPY","USD"]);
    expect(r.summary.find(x => x.currency === "JPY")?.grossSalesMinor).toBe("1000");
    await client.query("INSERT INTO pg_temp.wallet_transactions(id,user_id,payment_ref,amount_usd) VALUES(1,1,'order-2',93)");
    expect((await report()).sales.find(x => x.id === 2)).toMatchObject({ payoutStatus: "verification_required", transferredMinor: null });
  });
  it("uses half-open month boundaries with DST and a consistent selected timezone", async () => {
    await seed(4);
    await client.query(`UPDATE pg_temp.transactions SET created_at=CASE id
      WHEN 1 THEN '2026-03-01T04:59:59Z'::timestamptz WHEN 2 THEN '2026-03-01T05:00:00Z'::timestamptz
      WHEN 3 THEN '2026-04-01T03:59:59Z'::timestamptz ELSE '2026-04-01T04:00:00Z'::timestamptz END`);
    const r = await report(1,{timezone:"America/New_York"});
    expect(r.sales.map(x => x.id)).toEqual([3,2]);
    expect(r.filters.periodStart.toISOString()).toBe("2026-03-01T05:00:00.000Z");
    expect(r.filters.periodEnd.toISOString()).toBe("2026-04-01T04:00:00.000Z");
  });
  it("handles empty histories without fabricated amounts", async () => {
    const r = await report();
    expect(r.sales).toEqual([]);
    expect(r.summary).toEqual([]);
    expect(r.pagination).toMatchObject({ total: 0, totalPages: 0 });
  });
  it("paginates large histories with stable ordering and totals over the entire filtered month", async () => {
    await seed(1001);
    const r = await report(1,{page:2,limit:20});
    expect(r.sales).toHaveLength(20);
    expect(r.sales[0].id).toBe(981);
    expect(r.pagination).toMatchObject({ total:1001,totalPages:51 });
    expect(r.summary[0].grossSalesMinor).toBe("10010000");
    const filtered = await report(1,{payoutStatus:"failed"});
    expect(filtered.pagination.total).toBe(0);
  });
  it("enforces seller snapshots, legacy ownership, deleted listings, and all-country access", async () => {
    await seed(4);
    await client.query("UPDATE pg_temp.transactions SET seller_user_id=2,listing_id=1 WHERE id=2");
    await client.query("UPDATE pg_temp.transactions SET seller_user_id=NULL,listing_id=2 WHERE id=3");
    await client.query("UPDATE pg_temp.transactions SET listing_id=NULL,listing_country='France' WHERE id=4");
    expect((await report()).sales.map(x => x.id)).toEqual([4,1]);
    expect((await report(2)).sales.map(x => x.id)).toEqual([3,2]);
    await expect(readSellerSalesReport(client,0,baseFilters())).rejects.toThrow("INVALID_REPORT_IDENTITY");
  });
  it("exposes rather than hides excessive, wrong-currency, or inconsistent historical amounts", async () => {
    await seed(3);
    await client.query("INSERT INTO pg_temp.stripe_refund_ledger(id,transaction_id,amount_cents,currency) VALUES(1,1,12000,'USD'),(2,2,1000,'EUR')");
    await client.query("UPDATE pg_temp.transactions SET seller_earnings=95,commission_amount=7 WHERE id=3");
    const r = await report();
    expect(r.sales.every(x => x.netSellerAmountMinor === null)).toBe(true);
    expect(r.summary[0].complete).toBe(false);
    expect(r.summary[0].customerRefundsMinor).toBeNull();
  });
  it("retains exact decimal cents and reconciles rounding without negative phantom fees", async () => {
    await seed(3);
    await client.query("UPDATE pg_temp.transactions SET amount=0.03,buyer_total=0.03,commission_amount=0.01,seller_earnings=0.02");
    await client.query("INSERT INTO pg_temp.stripe_refund_ledger(id,transaction_id,amount_cents) VALUES(1,1,1),(2,2,1)");
    const r = await report();
    for (const x of r.sales) {
      expect(BigInt(x.netSaleMinor!)).toBe(BigInt(x.feesMinor!)+BigInt(x.commissionsMinor!)+BigInt(x.netSellerAmountMinor!));
      expect(BigInt(x.feesMinor!)).toBeGreaterThanOrEqual(0n);
    }
    expect(r.summary[0].grossSalesMinor).toBe("9");
  });
});

describe("report security and financial-write firewall", () => {
  it("rejects identity overrides, invalid limits, timezone and SQL-injection filters", () => {
    for (const q of [
      { sellerId:2 }, { user_id:2 }, { page:0 }, { limit:101 }, { month:"2026-13" },
      { timezone:"US/not-a-zone" }, { currency:"USD';DROP TABLE transactions" }, { orderStatus:"completed' OR 1=1" },
      { report:"balance" }, { month:"1800-01" },
    ]) expect(() => parseSalesReportFilters(q)).toThrow();
    expect(parseSalesReportFilters({timezone:"America/New_York"},new Date("2026-04-01T01:00:00Z")).month).toBe("2026-03");
  });
  it("contains no financial writes, provider operations, balances, or payout preferences", () => {
    const sql = REPORT_CTE_SQL.replace(/--[^\n]*/g,"");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|merge|call)\b/i);
    expect(sql).not.toMatch(/promo_wallets|balance_usd|seller_payout_accounts|bank_account/i);
    const route = readFileSync(new URL("../routes/sellerSalesReport.ts",import.meta.url),"utf8");
    expect(route).toContain("REPEATABLE READ READ ONLY");
    expect(route).toContain("req.userId");
    expect(route).not.toMatch(/getStripeClient|releaseEscrow|\.transfer|\.insert|\.update|\.delete/);
  });
  it("does not perform per-row requests (bounded query count regardless of history)", async () => {
    await seed(30);
    let queries = 0;
    const wrapper: SalesReportConnection = { query: async (...args) => { queries++; return client.query(...args); } };
    await readSellerSalesReport(wrapper,1,baseFilters());
    expect(queries).toBe(6);
  });
});