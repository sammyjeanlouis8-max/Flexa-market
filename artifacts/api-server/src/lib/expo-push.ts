import { db, expoPushTokensTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";
import { sendApnsToTokens, type ApnsPayload } from "./apns";

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

/** Raw APNs device tokens are stored with an "apns:" prefix. */
export function isApnsToken(token: string): boolean {
  return token.startsWith("apns:");
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

    // ── APNs (native Swift app) ────────────────────────────────────────────
    const apnsRows = rows.filter((r) => isApnsToken(r.token));
    if (apnsRows.length > 0) {
      const apnsPayload: ApnsPayload = {
        title: payload.title,
        body: payload.body,
        badge: payload.badge,
        sound: payload.sound ?? "default",
        data: payload.data,
        collapseId: payload.channelId,
      };
      const rawTokens = apnsRows.map((r) => r.token.slice("apns:".length));
      const dead = await sendApnsToTokens(rawTokens, apnsPayload);
      for (const t of dead) {
        await db.delete(expoPushTokensTable)
          .where(eq(expoPushTokensTable.token, `apns:${t}`))
          .catch(() => {});
      }
    }

    // ── Expo push (managed / React Native app) ─────────────────────────────
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
  if (!isExpoPushToken(opts.token) && !isApnsToken(opts.token)) return;

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

/**
 * Send a new-order alert to the seller AND their store manager (if one exists).
 * Covers both Expo (mobile) and web push so the manager is notified regardless
 * of which device they are on.
 * Use this in all purchase-completion paths so the manager is always in the loop.
 */
export async function sendNewOrderAlertsForSeller(
  sellerId: number,
  payload: ExpoPushPayload,
): Promise<void> {
  // Send to seller (Expo only — caller already sends web push to seller)
  void sendExpoPushToUser(sellerId, payload);

  // Look up store manager linked to this seller and notify them via both channels
  try {
    const [mgr] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.managedSellerId, sellerId))
      .limit(1);

    if (mgr) {
      const mgrPayload = { ...payload, title: `🏪 ${payload.title}` };

      // Expo push (mobile)
      void sendExpoPushToUser(mgr.id, mgrPayload);

      // Web push (browser / PWA) — lazy import to avoid circular dependency
      import("./push").then(({ sendPushToUser }) => {
        void sendPushToUser(mgr.id, {
          title: mgrPayload.title ?? "New Order",
          body: typeof mgrPayload.body === "string" ? mgrPayload.body : "",
          url: (mgrPayload.data as any)?.url ?? "/manager",
          tag: `mgr-order-${Date.now()}`,
        });
      }).catch(() => {});
    }
  } catch {
    // Non-fatal — manager lookup failure must never block order flow
  }
}
