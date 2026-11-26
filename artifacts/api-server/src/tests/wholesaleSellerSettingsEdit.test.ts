import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { NextFunction, Request, Response } from "express";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.DATABASE_URL ??= "postgres://localhost:5432/flexa_test";
process.env.SESSION_SECRET ??= "test-only-session-secret-for-wholesale-seller";

vi.mock("../middlewares/auth", () => ({
  getRole: (user: { role?: string | null } | null | undefined) => user?.role ?? "user",
  requireAuth: (req: Request, _res: Response, next: NextFunction) => {
    const id = Number(req.headers["x-test-user"] ?? 0);
    req.userId = id;
    req.user = {
      id,
      isAdmin: true,
      isSuperAdmin: false,
      role: "admin",
    } as any;
    next();
  },
}));

const { db, usersTable, wholesaleProductsTable, wholesaleWarehousesTable, wholesaleSellerSettingsTable, wholesaleInventoryTable } =
  await import("@workspace/db");
const { eq, sql } = await import("drizzle-orm");
const { default: wholesaleRouter } = await import("../routes/wholesale");

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use(express.json());
  app.use("/api", wholesaleRouter);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  try {
    const { port } = server.address() as AddressInfo;
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

const stamp = Date.now();
let sellerA = 0;
let sellerB = 0;
let productId = 0;
let warehouseId = 0;

beforeAll(async () => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wholesale_seller_settings (
      seller_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      company TEXT NOT NULL,
      chat_auto BOOLEAN NOT NULL,
      show_stock BOOLEAN NOT NULL
    )
  `);

  const [a] = await db.insert(usersTable).values({
    name: "Wholesale Seller A",
    email: `ws-seller-a-${stamp}@example.com`,
    passwordHash: "x",
    country: "Haiti",
    role: "admin",
    isAdmin: true,
  } as any).returning({ id: usersTable.id });
  const [b] = await db.insert(usersTable).values({
    name: "Wholesale Seller B",
    email: `ws-seller-b-${stamp}@example.com`,
    passwordHash: "x",
    country: "Haiti",
    role: "admin",
    isAdmin: true,
  } as any).returning({ id: usersTable.id });
  sellerA = a.id;
  sellerB = b.id;

  const [wh] = await db.insert(wholesaleWarehousesTable).values({
    sellerId: sellerA,
    name: "Test Delmas Depot",
    country: "Haiti",
    city: "Delmas",
    address: "1 Test St",
    verificationStatus: "verified",
    isActive: true,
  }).returning();
  warehouseId = wh.id;

  const [product] = await db.insert(wholesaleProductsTable).values({
    sellerId: sellerA,
    warehouseId,
    title: "Original Rice Bags",
    description: "test",
    unitPrice: 28.5,
    currency: "USD",
    country: "Haiti",
    city: "Delmas",
    warehouseName: wh.name,
    warehouseCity: wh.city,
    stockQuantity: 420,
    status: "active",
  }).returning();
  productId = product.id;
});

beforeEach(async () => {
  await db.delete(wholesaleSellerSettingsTable).where(
    sql`${wholesaleSellerSettingsTable.sellerId} in (${sellerA}, ${sellerB})`,
  );
});

afterAll(async () => {
  if (productId) {
    await db.delete(wholesaleInventoryTable).where(eq(wholesaleInventoryTable.productId, productId));
    await db.delete(wholesaleProductsTable).where(eq(wholesaleProductsTable.id, productId));
  }
  if (warehouseId) {
    await db.delete(wholesaleWarehousesTable).where(eq(wholesaleWarehousesTable.id, warehouseId));
  }
  if (sellerA) await db.delete(usersTable).where(eq(usersTable.id, sellerA));
  if (sellerB) await db.delete(usersTable).where(eq(usersTable.id, sellerB));
});

describe("wholesale seller product edit + stock 0", () => {
  it("persists title, price, and stock 0 across save and reload", async () => {
    await withServer(async (baseUrl) => {
      const patch = await fetch(`${baseUrl}/api/wholesale/products/${productId}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-test-user": String(sellerA),
        },
        body: JSON.stringify({
          title: "Updated Cement Bags",
          unitPrice: 19.75,
          stockQuantity: 0,
        }),
      });
      expect(patch.status).toBe(200);
      const saved = await patch.json();
      expect(saved.product.title).toBe("Updated Cement Bags");
      expect(saved.product.unitPrice).toBe(19.75);
      expect(saved.product.stockQuantity).toBe(0);

      const reload = await fetch(`${baseUrl}/api/wholesale/products/${productId}`, {
        headers: { "x-test-user": String(sellerA) },
      });
      expect(reload.status).toBe(200);
      const body = await reload.json();
      expect(body.product.title).toBe("Updated Cement Bags");
      expect(body.product.unitPrice).toBe(19.75);
      expect(body.product.stockQuantity).toBe(0);

      const [inv] = await db.select().from(wholesaleInventoryTable)
        .where(eq(wholesaleInventoryTable.productId, productId));
      expect(inv?.stockQuantity).toBe(0);
    });
  });
});

describe("wholesale seller settings isolation", () => {
  it("saves per seller and does not leak across accounts", async () => {
    await withServer(async (baseUrl) => {
      const putA = await fetch(`${baseUrl}/api/wholesale/seller/settings`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-test-user": String(sellerA),
        },
        body: JSON.stringify({ company: "Caribbean Bulk Co", chatAuto: true, showStock: false }),
      });
      expect(putA.status).toBe(200);
      expect(await putA.json()).toEqual({
        settings: { company: "Caribbean Bulk Co", chatAuto: true, showStock: false },
      });

      const putB = await fetch(`${baseUrl}/api/wholesale/seller/settings`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-test-user": String(sellerB),
        },
        body: JSON.stringify({ company: "Nord Supply", chatAuto: false, showStock: true }),
      });
      expect(putB.status).toBe(200);

      const getA = await fetch(`${baseUrl}/api/wholesale/seller/settings`, {
        headers: { "x-test-user": String(sellerA) },
      });
      const getB = await fetch(`${baseUrl}/api/wholesale/seller/settings`, {
        headers: { "x-test-user": String(sellerB) },
      });
      expect(await getA.json()).toEqual({
        settings: { company: "Caribbean Bulk Co", chatAuto: true, showStock: false, sellerId: sellerA },
      });
      expect(await getB.json()).toEqual({
        settings: { company: "Nord Supply", chatAuto: false, showStock: true, sellerId: sellerB },
      });
    });
  });
});

describe("wholesale free plans + search empty UX (source)", () => {
  const root = join(import.meta.dirname, "../../..");

  it("shows free wholesale copy and drops paid plan onboarding step", () => {
    const plansWeb = readFileSync(join(root, "marketplace/src/pages/wholesale/WholesaleSellerPlans.tsx"), "utf8");
    const plansMobile = readFileSync(join(root, "mobile/app/wholesale/seller/plans.tsx"), "utf8");
    const onboarding = readFileSync(join(root, "marketplace/src/pages/wholesale/WholesaleOnboarding.tsx"), "utf8");
    const locales = readFileSync(join(root, "marketplace/src/i18n/wholesaleLocales.ts"), "utf8");
    const demo = readFileSync(join(root, "marketplace/src/lib/wholesaleDemo.ts"), "utf8");

    expect(locales).toMatch(/Flexa Wholesale is currently free/);
    expect(locales).toMatch(/Flexa Wholesale gratis pou kounye a/);
    expect(plansWeb).toMatch(/wholesale\.plansSubtitle/);
    expect(plansWeb).not.toMatch(/WHOLESALE_PLANS|\$29|Choose/);
    expect(plansMobile).toMatch(/wholesale_plansSubtitle/);
    expect(onboarding).not.toMatch(/wholesale\/seller\/plans|stepPlan/);
    expect(demo).not.toMatch(/WHOLESALE_PLANS/);
  });

  it("shows Creole empty-search copy only after a finished search", () => {
    const search = readFileSync(join(root, "mobile/app/wholesale/search.tsx"), "utf8");
    const lang = readFileSync(join(root, "mobile/context/LanguageContext.tsx"), "utf8");
    expect(lang).toMatch(/wholesale_noSearchMatches:\s*"Pa gen pwodwi ki koresponn ak rechèch ou a\."/);
    expect(search).toMatch(/setSearched\(true\)/);
    expect(search).toMatch(/!searched \? null : products\.length === 0/);
    expect(search).toMatch(/t\("wholesale_noSearchMatches"\)/);
    expect(search).not.toMatch(/No matches in/);
  });
});
