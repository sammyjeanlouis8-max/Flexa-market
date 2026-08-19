import { beforeEach, describe, expect, it, vi } from "vitest";

const cleanupMocks = vi.hoisted(() => ({
  claims: [] as any[],
  chunks: [] as any[],
  claim: vi.fn(),
  complete: vi.fn(),
  release: vi.fn(),
  deleteObject: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock("../lib/boostVideoUploadStore", () => ({
  claimExpiredBoostVideoUpload: cleanupMocks.claim,
  completeBoostVideoCleanup: cleanupMocks.complete,
  getBoostVideoUploadChunks: vi.fn(async () => cleanupMocks.chunks),
  releaseBoostVideoCleanup: cleanupMocks.release,
}));

vi.mock("../lib/s3", () => ({
  deleteWasabiObject: cleanupMocks.deleteObject,
}));

vi.mock("../lib/logger", () => ({
  logger: {
    info: cleanupMocks.info,
    warn: cleanupMocks.warn,
  },
}));

import { runBoostVideoUploadCleanup } from "../lib/boostVideoUploadCleanup";

describe("Boost video upload cleanup", () => {
  beforeEach(() => {
    cleanupMocks.claims = [];
    cleanupMocks.chunks = [];
    cleanupMocks.claim.mockReset().mockImplementation(async () => cleanupMocks.claims.shift() ?? null);
    cleanupMocks.complete.mockReset().mockResolvedValue(true);
    cleanupMocks.release.mockReset().mockResolvedValue(true);
    cleanupMocks.deleteObject.mockReset().mockResolvedValue(undefined);
    cleanupMocks.info.mockReset();
    cleanupMocks.warn.mockReset();
  });

  it("keeps a retryable tombstone when staged-object deletion fails", async () => {
    cleanupMocks.claims.push({
      id: "expired-upload",
      processingToken: "cleanup-lease",
    });
    cleanupMocks.chunks = [
      { storageKey: "uploads/boost-staging/expired-upload/0000-a.part" },
      { storageKey: "uploads/boost-staging/expired-upload/0001-b.part" },
    ];
    cleanupMocks.deleteObject
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("temporary Wasabi failure"));

    await runBoostVideoUploadCleanup();

    expect(cleanupMocks.complete).not.toHaveBeenCalled();
    expect(cleanupMocks.release).toHaveBeenCalledWith(
      "expired-upload",
      "cleanup-lease",
      "temporary Wasabi failure",
    );
  });

  it("deletes metadata only after every staged object is deleted", async () => {
    cleanupMocks.claims.push({
      id: "expired-upload",
      processingToken: "cleanup-lease",
    });
    cleanupMocks.chunks = [
      { storageKey: "uploads/boost-staging/expired-upload/0000-a.part" },
    ];

    await runBoostVideoUploadCleanup();

    expect(cleanupMocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(cleanupMocks.complete).toHaveBeenCalledWith(
      "expired-upload",
      "cleanup-lease",
    );
    expect(cleanupMocks.release).not.toHaveBeenCalled();
  });

  it("removes an expired processing job after its worker lease is stale", async () => {
    // The store only returns processing uploads after its heartbeat lease is stale.
    // Once atomically claimed, cleanup must treat it exactly like any other tombstone.
    cleanupMocks.claims.push({
      id: "interrupted-upload",
      status: "processing",
      processingToken: "replacement-cleanup-lease",
    });
    cleanupMocks.chunks = [
      { storageKey: "uploads/boost-staging/interrupted-upload/0000-a.part" },
    ];

    await runBoostVideoUploadCleanup();

    expect(cleanupMocks.deleteObject).toHaveBeenCalledWith(
      "uploads/boost-staging/interrupted-upload/0000-a.part",
    );
    expect(cleanupMocks.complete).toHaveBeenCalledWith(
      "interrupted-upload",
      "replacement-cleanup-lease",
    );
  });
});