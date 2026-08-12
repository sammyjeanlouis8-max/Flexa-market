import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import { getVapidPublicKey, upsertSubscription, deleteSubscription, isAllowedPushEndpoint } from "../lib/push";
import { upsertExpoPushToken, deleteExpoPushToken, sendExpoPushToUser } from "../lib/expo-push";
import { isApnsToken } from "../lib/expo-push";
import { sendApnsNotification, getApnsConfig } from "../lib/apns";
import { db, expoPushTokensTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Strict bounds for the encryption keys the browser supplies. The real
// values are short fixed-length base64url blobs; anything wildly outside
// these ranges is malformed and refused.
const MIN_KEY_LEN = 16;
const MAX_KEY_LEN = 256;
const KEY_CHARSET = /^[A-Za-z0-9_\-=+/]+$/;

const router: IRouter = Router();

/**
 * GET /api/push/vapid-public-key  (public)
 * Returns the application server's VAPID public key. The browser uses
 * it as `applicationServerKey` when calling subscribe().
 */
router.get("/push/vapid-public-key", async (_req, res): Promise<void> => {
  try {
    const publicKey = await getVapidPublicKey();
    res.json({ publicKey });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to load VAPID key", detail: err?.message });
  }
});

/**
 * POST /api/push/subscribe  (auth)
 * Body: { endpoint, keys: { p256dh, auth } }
 * Persists the subscription so the server can push to it later.
 */
router.post("/push/subscribe", requireAuth, async (req, res): Promise<void> => {
  const sub = req.body as any;
  const endpoint = typeof sub?.endpoint === "string" ? sub.endpoint : null;
  const p256dh = typeof sub?.keys?.p256dh === "string" ? sub.keys.p256dh : null;
  const auth = typeof sub?.keys?.auth === "string" ? sub.keys.auth : null;
  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({ error: "Invalid subscription payload" });
    return;
  }
  // Reject anything that isn't a real browser push-service endpoint.
  // This is the SSRF guard: without it, the server would later make
  // outbound POSTs to whatever URL the client supplied.
  if (!isAllowedPushEndpoint(endpoint)) {
    res.status(400).json({ error: "Endpoint is not a recognized push service" });
    return;
  }
  for (const v of [p256dh, auth]) {
    if (v.length < MIN_KEY_LEN || v.length > MAX_KEY_LEN || !KEY_CHARSET.test(v)) {
      res.status(400).json({ error: "Invalid subscription keys" });
      return;
    }
  }
  await upsertSubscription({
    userId: req.userId!,
    endpoint,
    p256dh,
    auth,
    userAgent: typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : null,
  });
  res.json({ ok: true });
});

/**
 * POST /api/push/unsubscribe  (auth)
 * Body: { endpoint }
 * Removes a subscription so the server stops pushing to it.
 */
router.post("/push/unsubscribe", requireAuth, async (req, res): Promise<void> => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }
  await deleteSubscription(req.userId!, endpoint);
  res.json({ ok: true });
});

/**
 * POST /api/push/expo-token  (auth)
 * Body: { token, platform?, deviceId? }
 * Registers an Expo push token for the authenticated user.
 */
/**
 * POST /api/push/apns-token  (auth)
 * Body: { token }  — raw hex APNs device token from native Swift app.
 * Stored with "apns:" prefix so the sending layer can distinguish it.
 */
router.post("/push/apns-token", requireAuth, async (req, res): Promise<void> => {
  const { token, deviceId } = req.body ?? {};
  if (typeof token !== "string" || !/^[0-9a-f]{32,}$/i.test(token)) {
    res.status(400).json({ error: "Invalid APNs device token" });
    return;
  }
  const stored = `apns:${token.toLowerCase()}`;
  await upsertExpoPushToken({
    userId: req.userId!,
    token: stored,
    platform: "ios",
    deviceId: typeof deviceId === "string" ? deviceId : null,
  });
  res.json({ ok: true });
});

router.post("/push/expo-token", requireAuth, async (req, res): Promise<void> => {
  const { token, platform, deviceId } = req.body ?? {};
  if (typeof token !== "string" || !token.startsWith("Expo")) {
    res.status(400).json({ error: "Invalid Expo push token" });
    return;
  }
  await upsertExpoPushToken({
    userId: req.userId!,
    token,
    platform: typeof platform === "string" ? platform : null,
    deviceId: typeof deviceId === "string" ? deviceId : null,
  });
  res.json({ ok: true });
});

/**
 * DELETE /api/push/expo-token  (auth)
 * Body: { token }
 * Unregisters an Expo push token (e.g. on logout).
 */
router.delete("/push/expo-token", requireAuth, async (req, res): Promise<void> => {
  const { token } = req.body ?? {};
  if (typeof token !== "string") {
    res.status(400).json({ error: "token required" });
    return;
  }
  await deleteExpoPushToken(req.userId!, token);
  res.json({ ok: true });
});

/**
 * POST /api/push/test-apns  (admin only)
 * Body: { token }  — raw hex APNs token to send a test notification to.
 * Useful for verifying the APNs pipeline without a real event.
 */
router.post("/push/test-apns", requireAdmin, async (req, res): Promise<void> => {
  const { token } = req.body ?? {};
  if (typeof token !== "string" || !/^[0-9a-f]{32,}$/i.test(token)) {
    res.status(400).json({ error: "Invalid APNs device token" });
    return;
  }
  const config = getApnsConfig();
  if (!config) {
    res.status(503).json({ error: "APNs not configured (APNS_KEY_ID / APNS_KEY_P8 missing)" });
    return;
  }
  const result = await sendApnsNotification(token, {
    title: "Flexa Market — Test 🔔",
    body: "Push notifications fonksyone!",
    sound: "default",
  }, config);
  res.json({ ok: result.ok, error: result.error ?? null, gone: result.gone ?? false });
});

/**
 * GET /api/push/tokens  (admin only)
 * Returns registered push token counts (for debugging).
 */
router.get("/push/tokens", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db.select().from(expoPushTokensTable);
  res.json({
    total: rows.length,
    apns: rows.filter(r => r.token.startsWith("apns:")).length,
    expo: rows.filter(r => r.token.startsWith("Expo") || r.token.startsWith("ExponentPushToken")).length,
    android: rows.filter(r => r.platform === "android").length,
    ios: rows.filter(r => r.platform === "ios").length,
    unknown: rows.filter(r => !r.platform).length,
  });
});

/**
 * GET /api/push/tokens/detail  (admin only)
 * Returns all tokens with user info — useful for diagnosing missing Android tokens.
 */
router.get("/push/tokens/detail", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      userId: expoPushTokensTable.userId,
      token: expoPushTokensTable.token,
      platform: expoPushTokensTable.platform,
      deviceId: expoPushTokensTable.deviceId,
      updatedAt: expoPushTokensTable.updatedAt,
      userName: usersTable.name,
    })
    .from(expoPushTokensTable)
    .leftJoin(usersTable, eq(usersTable.id, expoPushTokensTable.userId))
    .orderBy(expoPushTokensTable.updatedAt);

  res.json(rows.map(r => ({
    userId: r.userId,
    userName: r.userName,
    platform: r.platform,
    tokenPrefix: r.token.slice(0, 45) + "…",
    deviceId: r.deviceId,
    updatedAt: r.updatedAt,
  })));
});

/**
 * POST /api/push/test-expo  (admin only)
 * Body: { userId }
 * Sends a test Expo push directly to a specific user — shows errors in server logs.
 */
router.post("/push/test-expo", requireAdmin, async (req, res): Promise<void> => {
  const { userId } = req.body ?? {};
  if (!userId || typeof userId !== "number") {
    res.status(400).json({ error: "userId (number) required" });
    return;
  }
  await sendExpoPushToUser(userId, {
    title: "🔔 Test Flexa Push",
    body: "Si ou wè sa — Android push fonksyone!",
    sound: "default",
    channelId: "default",
    priority: "high",
    data: { url: "/" },
  });
  res.json({ ok: true, message: "Push sent — check server logs for errors" });
});

export default router;
