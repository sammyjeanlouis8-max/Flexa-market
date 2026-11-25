import { afterEach, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";

process.env.DATABASE_URL ??= "postgres://localhost:5432/flexa_test";

const originalPublic = process.env.FLEXA_WHOLESALE_PUBLIC_URL;
const originalBase = process.env.FLEXA_WHOLESALE_BASE_URL;

let bridgeRouter: typeof import("../routes/bridge").default;

beforeAll(async () => {
  ({ default: bridgeRouter } = await import("../routes/bridge"));
});

afterEach(() => {
  if (originalPublic === undefined) delete process.env.FLEXA_WHOLESALE_PUBLIC_URL;
  else process.env.FLEXA_WHOLESALE_PUBLIC_URL = originalPublic;
  if (originalBase === undefined) delete process.env.FLEXA_WHOLESALE_BASE_URL;
  else process.env.FLEXA_WHOLESALE_BASE_URL = originalBase;
});

async function withServer<T>(run: (baseUrl: string) => Promise<T>): Promise<T> {
  const app = express();
  app.use("/api", bridgeRouter);
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
  it("returns unconfigured when no wholesale URL env is set", async () => {
    delete process.env.FLEXA_WHOLESALE_PUBLIC_URL;
    delete process.env.FLEXA_WHOLESALE_BASE_URL;
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/wholesale/launch`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        configured: false,
        url: null,
        label: "Flexa Wholesale",
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
    });
  });
});
