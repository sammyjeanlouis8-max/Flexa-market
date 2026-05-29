import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { getVapidPublicKey, upsertSubscription, deleteSubscription, isAllowedPushEndpoint } from "../lib/push";

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

export default router;
