import { createServer, type Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: dbMocks,
  };
});

import videosRouter, { resolveViewerScope } from "../routes/videos";

describe("promo video analytics", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      req.log = { info: vi.fn(), error: vi.fn() };
      next();
    });
    app.use("/api", videosRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    dbMocks.select.mockClear();
    dbMocks.select.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: 7 }],
        }),
      }),
    }));
    dbMocks.execute.mockReset();
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("increments a buy click with a successful database update", async () => {
    dbMocks.execute.mockResolvedValue({ rowCount: 1, rows: [{ id: 11 }] });

    const response = await fetch(`${baseUrl}/api/videos/7/buy-click`, { method: "POST" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(dbMocks.execute).toHaveBeenCalledOnce();
    expect(dbMocks.select).not.toHaveBeenCalled();
  });

  it("does not report a buy click when no active paid boost was updated", async () => {
    dbMocks.execute.mockResolvedValue({ rowCount: 0, rows: [] });

    const response = await fetch(`${baseUrl}/api/videos/7/buy-click`, { method: "POST" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns a safe server error when the buy-click update fails", async () => {
    dbMocks.execute.mockRejectedValue(new Error("database unavailable"));

    const response = await fetch(`${baseUrl}/api/videos/7/buy-click`, { method: "POST" });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to record video buy click" });
  });

  it("does not report an impression when no active paid boost was updated", async () => {
    dbMocks.execute.mockResolvedValue({ rowCount: 0, rows: [] });

    const response = await fetch(`${baseUrl}/api/videos/7/impression`, { method: "POST" });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(dbMocks.select).not.toHaveBeenCalled();
  });

  it("uses canonical roles and scopes promo videos by admin country assignment", () => {
    const roleAdmin = resolveViewerScope({
      user: {
        role: "admin",
        isAdmin: false,
        isSuperAdmin: false,
        country: "Haiti",
        adminScopeCountry: "Haiti",
        adminScopeDepartment: "Ouest",
      },
      headers: {},
    } as Request);
    expect(roleAdmin.isAdmin).toBe(true);
    expect(roleAdmin.isGlobalCountryAdmin).toBe(false);
    expect(roleAdmin.visibleCountries).toEqual(["Haiti"]);
    expect(roleAdmin.scopeCities).toContain("Port-au-Prince");
    expect(roleAdmin.hasCityScope).toBe(true);

    const multiCountryAdmin = resolveViewerScope({
      user: {
        role: "admin",
        isAdmin: true,
        isSuperAdmin: false,
        country: "Haiti",
        adminScopeCountries: JSON.stringify(["Haiti", "USA", "Canada"]),
      },
      headers: {},
    } as Request);
    expect(multiCountryAdmin.visibleCountries).toEqual(["Haiti", "USA", "Canada"]);
    expect(multiCountryAdmin.globalCountryAccess).toBe(false);
    expect(multiCountryAdmin.isGlobalCountryAdmin).toBe(false);

    const globalCountryAdmin = resolveViewerScope({
      user: { role: "admin", isAdmin: true, isSuperAdmin: false, country: "USA" },
      headers: {},
    } as Request);
    expect(globalCountryAdmin.isSuperAdmin).toBe(false);
    expect(globalCountryAdmin.isGlobalCountryAdmin).toBe(true);
    expect(globalCountryAdmin.globalCountryAccess).toBe(true);
    expect(globalCountryAdmin.visibleCountries).toEqual([]);

    const globalFiltered = resolveViewerScope({
      user: { role: "admin", isAdmin: true, isSuperAdmin: false, country: "USA" },
      headers: {},
    } as Request, "Canada");
    expect(globalFiltered.isSuperAdmin).toBe(false);
    expect(globalFiltered.globalCountryAccess).toBe(false);
    expect(globalFiltered.visibleCountries).toEqual(["Canada"]);

    const deniedCountry = resolveViewerScope({
      user: {
        role: "admin",
        isAdmin: true,
        isSuperAdmin: false,
        adminScopeCountry: "Haiti",
      },
      headers: {},
    } as Request, "USA");
    expect(deniedCountry.visibleCountries).toEqual(["__denied__"]);

    const canonicalLegacyUser = resolveViewerScope({
      user: { role: "user", isAdmin: true, isSuperAdmin: false, country: "Haiti" },
      headers: {},
    } as Request);
    expect(canonicalLegacyUser.isSuperAdmin).toBe(false);
    expect(canonicalLegacyUser.isAdmin).toBe(true);
  });
});