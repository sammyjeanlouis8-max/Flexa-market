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

vi.mock("../lib/boostAnalytics", () => ({
  recordBoostEvent: vi.fn(async () => ({ inserted: true })),
  normalizeTrafficSource: vi.fn(() => "other"),
}));

import videosRouter, { isVideoVisibleForCountries, resolveViewerScope } from "../routes/videos";

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
    await expect(response.json()).resolves.toEqual({ ok: true, counted: true });
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

    const regularUser = resolveViewerScope({
      user: { role: "user", isAdmin: false, isSuperAdmin: false, country: "Haiti" },
      headers: {},
    } as Request, "USA");
    expect(regularUser.visibleCountries).toEqual(["Haiti"]);
    expect(regularUser.globalCountryAccess).toBe(false);

    // Guest browsing USA must not receive Haiti-only CF fallback when country is set.
    const guestUsa = resolveViewerScope({
      user: undefined,
      headers: { "cf-ipcountry": "HT" },
    } as Request, "USA");
    expect(guestUsa.visibleCountries).toEqual(["USA"]);
    expect(guestUsa.globalCountryAccess).toBe(false);

    // Guest cannot force All Countries via empty scope tricks.
    const guestAllDenied = resolveViewerScope({
      user: undefined,
      headers: {},
    } as Request, "", { forceAllCountries: true });
    expect(guestAllDenied.globalCountryAccess).toBe(false);
    expect(guestAllDenied.isSuperAdmin).toBe(false);

    const superAdmin = resolveViewerScope({
      user: { role: "superadmin", isAdmin: true, isSuperAdmin: true, country: "Haiti" },
      headers: {},
    } as Request);
    expect(superAdmin.isSuperAdmin).toBe(true);
    expect(superAdmin.globalCountryAccess).toBe(true);

    // Super Admin + specific country → filter promo feed to that country only.
    // Does not change the admin's registered account country.
    const superAdminDominicanRepublic = resolveViewerScope({
      user: { role: "superadmin", isAdmin: true, isSuperAdmin: true, country: "Haiti" },
      headers: {},
    } as Request, "Dominican Republic");
    expect(superAdminDominicanRepublic.globalCountryAccess).toBe(false);
    expect(superAdminDominicanRepublic.visibleCountries).toEqual(["Dominican Republic"]);

    // Explicit All Countries unlock wins over a stale ?country= param.
    const superAdminAllVideos = resolveViewerScope({
      user: { role: "superadmin", isAdmin: true, isSuperAdmin: true, country: "Haiti" },
      headers: {},
    } as Request, "Haiti", { forceAllCountries: true });
    expect(superAdminAllVideos.globalCountryAccess).toBe(true);
    expect(superAdminAllVideos.visibleCountries).toEqual([]);

    const globalAdminAllVideos = resolveViewerScope({
      user: { role: "admin", isAdmin: true, isSuperAdmin: false, country: "USA" },
      headers: {},
    } as Request, "Canada", { forceAllCountries: true });
    expect(globalAdminAllVideos.isSuperAdmin).toBe(false);
    expect(globalAdminAllVideos.globalCountryAccess).toBe(true);
    expect(globalAdminAllVideos.visibleCountries).toEqual([]);

    // Multi-country admin selecting one authorized country.
    const multiFiltered = resolveViewerScope({
      user: {
        role: "admin",
        isAdmin: true,
        isSuperAdmin: false,
        adminScopeCountries: JSON.stringify(["Haiti", "Dominican Republic"]),
      },
      headers: {},
    } as Request, "Dominican Republic");
    expect(multiFiltered.visibleCountries).toEqual(["Dominican Republic"]);
    expect(multiFiltered.globalCountryAccess).toBe(false);
  });

  it("scopes promo video visibility by listing country and audience ALL / multi-target", () => {
    expect(isVideoVisibleForCountries("Haiti", "ALL", ["Haiti"], false)).toBe(true);
    expect(isVideoVisibleForCountries("USA", "ALL", ["Haiti"], false)).toBe(false);
    expect(isVideoVisibleForCountries("Haiti", "Haiti", ["Haiti"], false)).toBe(true);
    expect(isVideoVisibleForCountries("Haiti", "USA", ["Haiti"], false)).toBe(false);
    expect(isVideoVisibleForCountries("Dominican Republic", "Haiti,Dominican Republic", ["Haiti", "Dominican Republic"], false)).toBe(true);
    expect(isVideoVisibleForCountries("USA", "Haiti|USA", ["Haiti"], false)).toBe(false);
    expect(isVideoVisibleForCountries("Canada", null, [], true)).toBe(true);
    expect(isVideoVisibleForCountries("Haiti", "ALL", ["__denied__"], false)).toBe(false);
    expect(isVideoVisibleForCountries(null, "Haiti", ["Haiti"], false)).toBe(true);
    expect(isVideoVisibleForCountries(null, "ALL", ["Haiti"], false)).toBe(false);
  });
});