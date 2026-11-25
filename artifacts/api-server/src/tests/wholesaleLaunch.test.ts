import { afterEach, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";

process.env.DATABASE_URL ??= "postgres://localhost:5432/flexa_test";
process.env.SESSION_SECRET ??= "test-only-session-secret-for-wholesale-launch";

const originalPublic = process.env.FLEXA_WHOLESALE_PUBLIC_URL;
const originalBase = process.env.FLEXA_WHOLESALE_BASE_URL;

let wholesaleRouter: typeof import("../routes/wholesale").default;

beforeAll(async () => {
  ({ default: wholesaleRouter } = await import("../routes/wholesale"));
});

afterEach(() => {
  if (originalPublic === undefined) delete process.env.FLEXA_WHOLESALE_PUBLIC_URL;
  else process.env.FLEXA_WHOLESALE_PUBLIC_URL = originalPublic;
  if (originalBase === undefined) delete process.env.FLEXA_WHOLESALE_BASE_URL;
  else process.env.FLEXA_WHOLESALE_BASE_URL = originalBase;
});

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
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

describe("GET /api/wholesale/launch", () => {
  it("returns native launch payload when no external URL is set", async () => {
    delete process.env.FLEXA_WHOLESALE_PUBLIC_URL;
    delete process.env.FLEXA_WHOLESALE_BASE_URL;
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/wholesale/launch`);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        configured: false,
        url: null,
        label: "Flexa Wholesale",
        native: true,
        publicLaunch: false,
      });
    });
  });

  it("prefers FLEXA_WHOLESALE_PUBLIC_URL and strips trailing slash", async () => {
    process.env.FLEXA_WHOLESALE_PUBLIC_URL = "https://wholesale.example.com/";
    process.env.FLEXA_WHOLESALE_BASE_URL = "https://ignored.example.com";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/wholesale/launch`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.configured).toBe(true);
      expect(body.url).toBe("https://wholesale.example.com");
      expect(body.native).toBe(true);
    });
  });

  it("appends Market language to the external Wholesale URL", async () => {
    process.env.FLEXA_WHOLESALE_PUBLIC_URL = "https://wholesale.example.com/";
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/wholesale/launch?lang=ht`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.url).toBe("https://wholesale.example.com?lang=ht");
      expect(body.lang).toBe("ht");
    });
  });
});
