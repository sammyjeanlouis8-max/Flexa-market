import webpush from "web-push";
import { db, pushSubscriptionsTable, platformSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
/**
 * Web Push helpers.
 *
 * VAPID keys are generated lazily on first use and persisted in
 * platform_settings so they survive restarts. They identify our server
 * to the push services (Mozilla, Google, Apple, etc.). Re-generating
 * them invalidates every existing subscription, so we never overwrite
 * existing keys.
 *
 * Public API exposed to the rest of the codebase:
 *   getVapidPublicKey()       — returns the public key string for the
 *                               browser to subscribe with.
 *   sendPushToUser(uid, p)    — sends a payload to every device that
 *                               user has subscribed. Best-effort: logs
 *                               failures, prunes dead subscriptions
 *                               (HTTP 404 / 410), and never throws.
 *   isAllowedPushEndpoint(u)  — guard against SSRF; only the known
 *                               push-service hostnames are allowed.
 */

const VAPID_PUB_KEY = "vapid_public_key";
const VAPID_PRV_KEY = "vapid_private_key";
const VAPID_SUBJECT = process.env["VAPID_SUBJECT"] || "mailto:admin@flexamarket.local";

let configured: { publicKey: string; privateKey: string } | null = null;
let initPromise: Promise<{ publicKey: string; privateKey: string }> | null = null;

async function loadOrCreateVapid(): Promise<{ publicKey: string; privateKey: string }> {
  if (configured) return configured;
  if (initPromise) return initPromise;
  const promise = (async () => {
    // First try to load existing keys.
    const readBoth = async () => {
      const rows = await db.select().from(platformSettingsTable);
      const map: Record<string, string> = {};
      for (const r of rows) map[r.key] = r.value;
      return { publicKey: map[VAPID_PUB_KEY], privateKey: map[VAPID_PRV_KEY] };
    };

    let { publicKey, privateKey } = await readBoth();

    if (!publicKey || !privateKey) {
      // Generate locally and try to persist. Use onConflictDoNothing so a
      // concurrent peer that wrote first wins, then re-read from DB so we
      // always end up with a consistent (matching) pair.
      const keys = webpush.generateVAPIDKeys();
      await db.insert(platformSettingsTable).values({ key: VAPID_PUB_KEY, value: keys.publicKey }).onConflictDoNothing();
      await db.insert(platformSettingsTable).values({ key: VAPID_PRV_KEY, value: keys.privateKey }).onConflictDoNothing();
      ({ publicKey, privateKey } = await readBoth());
      if (!publicKey || !privateKey) {
        // Should never happen unless DB is misbehaving.
        throw new Error("[push] VAPID keys missing after insert");
      }
      logger.info("[push] VAPID key pair ready (generated or claimed by peer)");
    }

    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
    configured = { publicKey, privateKey };
    return configured;
  })();
  // Reset the cache on failure so the next caller can retry; without this
  // a transient DB error would permanently break push for the process.
  promise.catch(() => { initPromise = null; });
  initPromise = promise;
  return promise;
}

/**
 * SSRF guard: only allow endpoints belonging to known browser push
 * services. This prevents an authed attacker from registering an
 * arbitrary internal URL and tricking the server into making outbound
 * requests to it.
 */
const ALLOWED_PUSH_HOSTS = [
  // Google / FCM (Chrome, Edge, Brave, Opera)
  "fcm.googleapis.com",
  "android.googleapis.com",
  // Mozilla (Firefox)
  "updates.push.services.mozilla.com",
  "autopush.stage.mozaws.net",
  // Apple (Safari)
  "web.push.apple.com",
  "api.push.apple.com",
  // Microsoft (legacy Edge / Windows)
  "wns2-am3p.notify.windows.com",
];
const ALLOWED_PUSH_HOST_SUFFIXES = [
  ".push.apple.com",
  ".notify.windows.com",
  ".push.services.mozilla.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 1024) return false;
  let url: URL;
  try { url = new URL(endpoint); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_PUSH_HOSTS.includes(host)) return true;
  if (ALLOWED_PUSH_HOST_SUFFIXES.some(s => host.endsWith(s))) return true;
  return false;
}

export async function getVapidPublicKey(): Promise<string> {
  const k = await loadOrCreateVapid();
  return k.publicKey;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  icon?: string;
};

/**
 * Send a push notification to every device a user is subscribed on.
 * Errors are logged but never thrown — pushing must never block the
 * request that triggered the underlying notification.
 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  try {
    await loadOrCreateVapid();
    const subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (err: any) {
        const status = err?.statusCode;
        // 404 Not Found / 410 Gone → subscription is dead, drop it.
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint)).catch(() => {});
          logger.info({ userId, endpoint: sub.endpoint.slice(0, 60) }, "[push] Pruned dead subscription");
        } else {
          logger.warn({ err: err?.message || String(err), userId, status }, "[push] Send failed");
        }
      }
    }));
  } catch (err) {
    logger.error({ err }, "[push] sendPushToUser unexpected failure");
  }
}

/**
 * Insert (or update) a subscription for a user. Endpoint is unique
 * globally; if it already exists for someone else (rare), we update it
 * to the new owner.
 */
export async function upsertSubscription(opts: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
}): Promise<void> {
  const existing = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, opts.endpoint));
  if (existing.length > 0) {
    await db.update(pushSubscriptionsTable)
      .set({ userId: opts.userId, p256dh: opts.p256dh, auth: opts.auth, userAgent: opts.userAgent ?? null })
      .where(eq(pushSubscriptionsTable.endpoint, opts.endpoint));
    return;
  }
  await db.insert(pushSubscriptionsTable).values({
    userId: opts.userId,
    endpoint: opts.endpoint,
    p256dh: opts.p256dh,
    auth: opts.auth,
    userAgent: opts.userAgent ?? null,
  });
}

export async function deleteSubscription(userId: number, endpoint: string): Promise<void> {
  await db.delete(pushSubscriptionsTable).where(and(
    eq(pushSubscriptionsTable.userId, userId),
    eq(pushSubscriptionsTable.endpoint, endpoint),
  ));
}
