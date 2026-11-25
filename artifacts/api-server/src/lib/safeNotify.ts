/**
 * Schema-safe notification insert. `actorId` is NOT NULL — callers must pass it.
 * Failures are logged instead of silently swallowed so production isn't blind.
 */
import { db, notificationsTable } from "@workspace/db";
import type { Request } from "express";

export type SafeNotifyInput = {
  userId: number;
  actorId: number;
  type: string;
  listingId?: number | null;
  referenceId?: number | null;
  commentId?: number | null;
  message?: string | null;
  isRead?: boolean;
};

export async function safeNotify(
  input: SafeNotifyInput,
  log?: Pick<Request, "log">["log"] | { warn: (obj: unknown, msg?: string) => void },
): Promise<boolean> {
  if (!Number.isInteger(input.userId) || input.userId <= 0) {
    log?.warn?.({ input }, "safeNotify skipped: invalid userId");
    return false;
  }
  if (!Number.isInteger(input.actorId) || input.actorId <= 0) {
    log?.warn?.({ input }, "safeNotify skipped: invalid actorId");
    return false;
  }
  if (!input.type?.trim()) {
    log?.warn?.({ input }, "safeNotify skipped: empty type");
    return false;
  }
  try {
    await db.insert(notificationsTable).values({
      userId: input.userId,
      actorId: input.actorId,
      type: input.type.trim(),
      listingId: input.listingId ?? null,
      referenceId: input.referenceId ?? null,
      commentId: input.commentId ?? null,
      message: input.message ?? null,
      isRead: input.isRead ?? false,
    });
    return true;
  } catch (err) {
    log?.warn?.({ err, input }, "safeNotify insert failed");
    return false;
  }
}
