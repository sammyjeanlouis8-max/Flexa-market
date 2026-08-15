import { db, expoPushTokensTable, usersTable, notificationsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
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

    // Badge: default to the user's unread notification count so the app
    // icon shows a number (like WhatsApp) on every push.
    let badge = payload.badge;
    if (badge === undefined) {
      try {
        const unread = await db
          .select({ id: notificationsTable.id })
          .from(notificationsTable)
          .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
        badge = unread.length;
      } catch {
        /* badge is cosmetic — never block the push */
      }
    }

    // ── APNs (native Swift app) ────────────────────────────────────────────
    const apnsRows = rows.filter((r) => isApnsToken(r.token));
    if (apnsRows.length > 0) {
      const apnsPayload: ApnsPayload = {
        title: payload.title,
        body: payload.body,
        badge,
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
      badge,
      channelId: payload.channelId ?? "default",
      priority: payload.priority ?? "high",
      ...(payload.ttl !== undefined ? { ttl: payload.ttl } : {}),
    }));

    logger.info(
      { userId, tokenCount: messages.length, tokens: validTokens.map(r => r.token.slice(0, 30)) },
      "[expo-push] Sending push notification",
    );

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
      const body = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, userId, body },
        "[expo-push] HTTP error from Expo push service",
      );
      return;
    }

    const json: any = await res.json().catch(() => null);
    logger.info({ userId, expoResponse: json }, "[expo-push] Expo push send response");

    if (!json?.data) return;

    const toDelete: string[] = [];
    const ticketIds: string[] = [];

    for (let i = 0; i < json.data.length; i++) {
      const ticket = json.data[i];
      if (ticket?.status === "ok" && ticket?.id) {
        ticketIds.push(ticket.id);
      } else if (ticket?.status === "error") {
        const errCode = ticket?.details?.error;
        logger.warn(
          { userId, token: validTokens[i]?.token?.slice(0, 40), errCode, ticket },
          "[expo-push] Ticket error from Expo",
        );
        if (errCode === "DeviceNotRegistered") {
          toDelete.push(validTokens[i].token);
        }
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

    // ── Async receipt check (3 min later) ────────────────────────────────────
    // Expo delivers tickets immediately, but the actual FCM/APNs delivery
    // status (e.g. InvalidRegistration, MessageRateExceeded) only appears
    // in receipts ~1-5 minutes later.  We check in the background so we
    // can log FCM-level failures without blocking the request.
    if (ticketIds.length > 0) {
      setTimeout(() => {
        checkExpoReceipts(ticketIds, validTokens.map(r => r.token), userId).catch(() => {});
      }, 3 * 60 * 1000);
    }
  } catch (err) {
    logger.error({ err, userId }, "[expo-push] sendExpoPushToUser unexpected failure");
  }
}

const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/**
 * Check Expo push receipts ~3 minutes after sending.
 * Receipts reveal FCM/APNs-level delivery errors (InvalidRegistration,
 * MessageRateExceeded, etc.) that are not visible in the initial ticket.
 */
async function checkExpoReceipts(
  ticketIds: string[],
  tokens: string[],
  userId: number,
): Promise<void> {
  try {
    const res = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: ticketIds }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status, userId }, "[expo-push] receipt HTTP error");
      return;
    }
    const json: any = await res.json().catch(() => null);
    if (!json?.data) return;

    const toDelete: string[] = [];
    for (const [id, receipt] of Object.entries(json.data as Record<string, any>)) {
      if (receipt?.status === "ok") {
        logger.info({ userId, ticketId: id }, "[expo-push] FCM delivery confirmed ✓");
      } else if (receipt?.status === "error") {
        const errCode = receipt?.details?.error;
        logger.error(
          { userId, ticketId: id, errCode, receipt },
          "[expo-push] FCM delivery FAILED",
        );
        // Find the token that matches this ticket position
        const idx = ticketIds.indexOf(id);
        if (idx >= 0 && errCode === "DeviceNotRegistered") {
          toDelete.push(tokens[idx]);
        }
      }
    }

    for (const token of toDelete) {
      await db
        .delete(expoPushTokensTable)
        .where(eq(expoPushTokensTable.token, token))
        .catch(() => {});
      logger.info({ userId, token: token.slice(0, 40) }, "[expo-push] Pruned dead token (receipt)");
    }
  } catch (err) {
    logger.warn({ err, userId }, "[expo-push] receipt check failed");
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
