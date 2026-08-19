import { createServer, type Server } from "node:http";
import { Readable } from "node:stream";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const s3Mocks = vi.hoisted(() => ({
  getWasabiObject: vi.fn(),
  getWasabiObjectSize: vi.fn(),
}));

vi.mock("../lib/s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/s3")>();
  return {
    ...actual,
    isWasabiConfigured: () => true,
    getWasabiObject: s3Mocks.getWasabiObject,
    getWasabiObjectSize: s3Mocks.getWasabiObjectSize,
  };
});

import storageRouter from "../routes/storage";

describe("GET /api/storage/video-stream", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use("/api", storageRouter);
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

  beforeEach(() => {
    s3Mocks.getWasabiObject.mockReset();
    s3Mocks.getWasabiObjectSize.mockReset();
  });

  it("streams legacy QuickTime bytes with their correct MIME type", async () => {
    s3Mocks.getWasabiObject.mockResolvedValue({
      Body: Readable.from(Buffer.from("0123456789")),
      ContentLength: 10,
      ContentType: "video/quicktime",
      ETag: '"video-etag"',
    });

    const response = await fetch(
      `${baseUrl}/api/storage/video-stream?key=uploads%2Fvideos%2Fpromo.quicktime`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("video/quicktime");
    expect(response.headers.get("content-length")).toBe("10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(await response.text()).toBe("0123456789");
  });

  it("forwards a successful byte range as 206 Partial Content", async () => {
    s3Mocks.getWasabiObject.mockResolvedValue({
      Body: Readable.from(Buffer.from("2345")),
      ContentLength: 4,
      ContentRange: "bytes 2-5/10",
      ContentType: "video/quicktime",
    });

    const response = await fetch(
      `${baseUrl}/api/storage/video-stream?key=uploads%2Fvideos%2Fpromo.quicktime`,
      { headers: { Range: "bytes=2-5" } },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(response.headers.get("content-length")).toBe("4");
    expect(await response.text()).toBe("2345");
    expect(s3Mocks.getWasabiObject).toHaveBeenCalledWith(
      "uploads/videos/promo.quicktime",
      "bytes=2-5",
    );
  });

  it("returns 416 with the object length for an unsatisfiable range", async () => {
    s3Mocks.getWasabiObject.mockRejectedValue(
      Object.assign(new Error("Requested Range Not Satisfiable"), {
        name: "InvalidRange",
        $metadata: { httpStatusCode: 416 },
      }),
    );
    s3Mocks.getWasabiObjectSize.mockResolvedValue(10);

    const response = await fetch(
      `${baseUrl}/api/storage/video-stream?key=uploads%2Fvideos%2Fpromo.quicktime`,
      { headers: { Range: "bytes=20-30" } },
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    expect(response.headers.get("accept-ranges")).toBe("bytes");
  });

  it("rejects multi-range requests without opening the video body", async () => {
    s3Mocks.getWasabiObjectSize.mockResolvedValue(10);

    const response = await fetch(
      `${baseUrl}/api/storage/video-stream?key=uploads%2Fvideos%2Fpromo.quicktime`,
      { headers: { Range: "bytes=0-1,4-5" } },
    );

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */10");
    expect(s3Mocks.getWasabiObject).not.toHaveBeenCalled();
  });
});