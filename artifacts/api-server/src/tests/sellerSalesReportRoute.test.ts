import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";

const mocks = vi.hoisted(() => ({
  query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [] })),
  release: vi.fn(), connect: vi.fn(),
  read: vi.fn(async (_connection: unknown, _seller: number, _filters: unknown) => ({ summary: [], sales: [] })),
}));
vi.mock("@workspace/db", () => ({ pool: { connect: mocks.connect } }));
vi.mock("../lib/sellerSalesReport", () => ({ readSellerSalesReport: mocks.read }));
import { handleSellerSalesReport } from "../routes/sellerSalesReport";

let server: Server;
let url: string;
beforeAll(async () => {
  const app = express();
  // Isolate the reporting handler: fake authentication is confined to tests.
  app.use((req, _res, next) => {
    if (req.headers.authorization === "Bearer synthetic-seller-one") req.userId = 1;
    next();
  });
  app.get("/sales/summary", handleSellerSalesReport);
  server = await new Promise<Server>(resolve => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("TEST_SERVER_NOT_STARTED");
  url = `http://127.0.0.1:${address.port}/sales/summary`;
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.connect.mockResolvedValue({ query: mocks.query, release: mocks.release });
  mocks.read.mockResolvedValue({ summary: [], sales: [] });
});
afterAll(() => new Promise<void>((resolve,reject) => server.close(error => error ? reject(error) : resolve())));

describe("seller report HTTP boundary", () => {
  it("refuses unauthenticated access without opening a database connection", async () => {
    expect((await fetch(url + "?report=monthly")).status).toBe(401);
    expect(mocks.connect).not.toHaveBeenCalled();
    const mounted = readFileSync(new URL("../routes/transactions.ts",import.meta.url),"utf8");
    expect(mounted).toContain('router.get("/sales/summary", requireAuth');
  });
  it("rejects attempted seller overrides before reading any financial records", async () => {
    const r = await fetch(url + "?report=monthly&sellerId=2", { headers:{Authorization:"Bearer synthetic-seller-one"} });
    expect(r.status).toBe(400);
    expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("uses only authenticated identity and a read-only consistent snapshot", async () => {
    const r = await fetch(url + "?report=monthly&month=2026-03", { headers:{Authorization:"Bearer synthetic-seller-one"} });
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("vary")).toContain("Authorization");
    expect(mocks.read.mock.calls[0]?.[1]).toBe(1);
    expect(mocks.query.mock.calls.map(x => x[0])).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "SET LOCAL statement_timeout = '15000ms'", "COMMIT",
    ]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("fails explicitly without fabricated data and always releases the connection", async () => {
    mocks.read.mockRejectedValueOnce(new Error("synthetic database failure"));
    const r = await fetch(url + "?report=monthly", { headers:{Authorization:"Bearer synthetic-seller-one"} });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ error: "SALES_REPORT_UNAVAILABLE" });
    expect(mocks.query).toHaveBeenCalledWith("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});