import { db, expoPushTokensTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  /** Expo delivery priority: "default" | "normal" | "high" */
  priority?: "default" | "normal" | "high";
  /** Seconds before Expo drops an undelivered notification (max 2419200) */
  ttl?: number;
};

function isExpoPushToken(token: string): boolean {
  return (
    token.startsWith("ExponentPushToken[") ||
    token.startsWith("ExpoPushToken[")
  );
}

/**
 * Send an Expo push notification to every device a user has registered.
 * Prunes dead tokens (DeviceNotRegistered). Never throws — errors are
 * logged only, so a push failure never blocks the request that triggered it.
 */
export async function sendExpoPushToUser(
  userId: number,
  payload: ExpoPushPayload,
): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(expoPushTokensTable)
      .where(eq(expoPushTokensTable.userId, userId));

    if (rows.length === 0) return;

    const [user] = await db
      .select({ notifyPush: usersTable.notifyPush })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (user && user.notifyPush === false) return;

    const validTokens = rows.filter((r) => isExpoPushToken(r.token));
    if (validTokens.length === 0) return;

    const messages = validTokens.map((r) => ({
      to: r.token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: payload.sound ?? "default",
      badge: payload.badge,
      channelId: payload.channelId ?? "default",
      priority: payload.priority ?? "default",
      ...(payload.ttl !== undefined ? { ttl: payload.ttl } : {}),
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    if (!res.ok) {
      logger.warn(
        { status: res.status, userId },
        "[expo-push] HTTP error from Expo push service",
      );
      return;
    }

    const json: any = await res.json().catch(() => null);
    if (!json?.data) return;

    const toDelete: string[] = [];
    for (let i = 0; i < json.data.length; i++) {
      const receipt = json.data[i];
      if (
        receipt?.status === "error" &&
        receipt?.details?.error === "DeviceNotRegistered"
      ) {
        toDelete.push(validTokens[i].token);
      }
    }

    for (const token of toDelete) {
      await db
        .delete(expoPushTokensTable)
        .where(eq(expoPushTokensTable.token, token))
        .catch(() => {});
      logger.info(
        { userId, token: token.slice(0, 40) },
        "[expo-push] Pruned dead token",
      );
    }
  } catch (err) {
    logger.error({ err, userId }, "[expo-push] sendExpoPushToUser unexpected failure");
  }
}

export async function upsertExpoPushToken(opts: {
  userId: number;
  token: string;
  deviceId?: string | null;
  platform?: string | null;
}): Promise<void> {
  if (!isExpoPushToken(opts.token)) return;

  const existing = await db
    .select()
    .from(expoPushTokensTable)
    .where(eq(expoPushTokensTable.token, opts.token));

  if (existing.length > 0) {
    await db
      .update(expoPushTokensTable)
      .set({
        userId: opts.userId,
        deviceId: opts.deviceId ?? null,
        platform: opts.platform ?? null,
        updatedAt: new Date(),
      })
      .where(eq(expoPushTokensTable.token, opts.token));
  } else {
    await db.insert(expoPushTokensTable).values({
      userId: opts.userId,
      token: opts.token,
      deviceId: opts.deviceId ?? null,
      platform: opts.platform ?? null,
    });
  }
}

export async function deleteExpoPushToken(
  userId: number,
  token: string,
): Promise<void> {
  await db
    .delete(expoPushTokensTable)
    .where(eq(expoPushTokensTable.token, token))
    .catch(() => {});
}
