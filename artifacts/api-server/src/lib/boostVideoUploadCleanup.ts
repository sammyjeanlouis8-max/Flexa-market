import { logger } from "./logger";
import {
  claimExpiredBoostVideoUpload,
  completeBoostVideoCleanup,
  getBoostVideoUploadChunks,
  releaseBoostVideoCleanup,
} from "./boostVideoUploadStore";
import { deleteWasabiObject } from "./s3";

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const CLEANUP_LEASE_STALE_MS = 10 * 60 * 1000;
const CLEANUP_BATCH_LIMIT = 20;

let cleanupRunning = false;
let workerStarted = false;

export async function runBoostVideoUploadCleanup(): Promise<void> {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    for (let processed = 0; processed < CLEANUP_BATCH_LIMIT; processed += 1) {
      const claimed = await claimExpiredBoostVideoUpload(
        new Date(),
        new Date(Date.now() - CLEANUP_LEASE_STALE_MS),
      );
      if (!claimed) break;

      try {
        const chunks = await getBoostVideoUploadChunks(claimed.id);
        for (const chunk of chunks) {
          await deleteWasabiObject(chunk.storageKey);
        }
        const deleted = await completeBoostVideoCleanup(claimed.id, claimed.processingToken);
        if (!deleted) {
          throw new Error("Cleanup lease was replaced before metadata deletion");
        }
        logger.info(
          { uploadId: claimed.id, stagedChunks: chunks.length },
          "Expired Boost video upload cleaned",
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await releaseBoostVideoCleanup(claimed.id, claimed.processingToken, message).catch(() => {});
        logger.warn(
          { err: error, uploadId: claimed.id },
          "Expired Boost video cleanup will retry",
        );
      }
    }
  } finally {
    cleanupRunning = false;
  }
}

export function startBoostVideoUploadCleanupWorker(): void {
  if (workerStarted) return;
  workerStarted = true;
  void runBoostVideoUploadCleanup().catch((error) => {
    logger.warn({ err: error }, "Initial Boost video cleanup failed");
  });
  const timer = setInterval(() => {
    void runBoostVideoUploadCleanup().catch((error) => {
      logger.warn({ err: error }, "Scheduled Boost video cleanup failed");
    });
  }, CLEANUP_INTERVAL_MS);
  timer.unref();
}