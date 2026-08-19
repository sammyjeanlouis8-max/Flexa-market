import { createServer, type Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({
  update: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@workspace/db")>();
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: async () => [{ id: 7, userId: 99, country: "Haiti" }],
        }),
      }),
      update: dbMocks.update,
      insert: dbMocks.insert,
    },
  };
});

vi.mock("../middlewares/auth", () => {
  const asAdmin = (req: Request, _res: Response, next: NextFunction) => {
    req.userId = 42;
    req.user = { id: 42, role: "super_admin", country: "Haiti" } as any;
    next();
  };
  return {
    requireAdmin: asAdmin,
    requireSuperAdmin: asAdmin,
    requireRole: () => asAdmin,
    getRole: () => "super_admin",
    getOnlineUserCount: () => 0,
  };
});

import adminRouter from "../routes/admin";

describe("admin free-boost video validation", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    process.env["SESSION_SECRET"] = "admin-boost-video-test-secret";
    const app = express();
    app.use(express.json());
    app.use("/api", adminRouter);
    server = createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  it("rejects a legacy object path instead of silently persisting or dropping it", async () => {
    const response = await fetch(`${baseUrl}/api/admin/listings/7/boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        days: 7,
        videoUrl: "/objects/legacy-unconverted-video",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Video must be a completed normalized Boost upload.",
    });
    expect(dbMocks.update).not.toHaveBeenCalled();
    expect(dbMocks.insert).not.toHaveBeenCalled();
  });
});