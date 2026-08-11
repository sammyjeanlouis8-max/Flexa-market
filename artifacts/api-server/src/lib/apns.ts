/**
 * Apple Push Notification service (APNs) — HTTP/2 + JWT sender.
 *
 * Uses Node.js built-in `crypto` and `http2` modules — no extra packages.
 *
 * Required env vars (add to Replit Secrets + DO production):
 *   APNS_KEY_ID   — 10-char key ID from developer.apple.com → Keys (e.g. AB12CD34EF)
 *   APNS_KEY_P8   — full content of the downloaded .p8 file
 *   APNS_TEAM_ID  — Apple Team ID  (defaults to D782MM56VY)
 *   APNS_BUNDLE_ID — iOS bundle ID (defaults to com.flexamarket.mobile)
 */
import { createSign } from "crypto";
import { connect, type ClientHttp2Session } from "http2";
import { logger } from "./logger";

const APNS_PRODUCTION = "https://api.push.apple.com";
const APNS_SANDBOX    = "https://api.sandbox.push.apple.com";

// ── JWT cache (Apple allows re-use up to 1 hour; we refresh at 45 min) ───────
let _jwtCache: { token: string; createdAt: number } | null = null;

function makeJwt(keyId: string, teamId: string, p8Key: string): string {
  const now = Math.floor(Date.now() / 1000);
  if (_jwtCache && now - _jwtCache.createdAt < 2700) return _jwtCache.token;

  const hdr = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const pld = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
  const unsigned = `${hdr}.${pld}`;

  const sign = createSign("SHA256");
  sign.update(unsigned);
  // ieee-p1363 = raw r||s format that JWT expects (not DER)
  const sig = sign.sign({ key: p8Key, dsaEncoding: "ieee-p1363" }).toString("base64url");

  const token = `${unsigned}.${sig}`;
  _jwtCache = { token, createdAt: now };
  return token;
}

// ── Config ────────────────────────────────────────────────────────────────────
export function getApnsConfig() {
  const keyId    = process.env.APNS_KEY_ID;
  const p8Key    = process.env.APNS_KEY_P8;
  const teamId   = process.env.APNS_TEAM_ID   ?? "D782MM56VY";
  const bundleId = process.env.APNS_BUNDLE_ID ?? "com.flexamarket.mobile";
  const isProduction = process.env.NODE_ENV === "production";

  if (!keyId || !p8Key) return null;
  return { keyId, p8Key, teamId, bundleId, isProduction };
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ApnsPayload {
  title: string;
  body: string;
  badge?: number;
  sound?: string | null;
  data?: Record<string, unknown>;
  collapseId?: string;
}

// ── Sender ────────────────────────────────────────────────────────────────────
export async function sendApnsNotification(
  deviceToken: string,
  payload: ApnsPayload,
  config: NonNullable<ReturnType<typeof getApnsConfig>>,
): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  const host = config.isProduction ? APNS_PRODUCTION : APNS_SANDBOX;

  return new Promise((resolve) => {
    let client: ClientHttp2Session;
    try {
      client = connect(host);
    } catch (err: any) {
      return resolve({ ok: false, error: `connect: ${err.message}` });
    }

    client.on("error", (err) => resolve({ ok: false, error: err.message }));

    const aps: Record<string, unknown> = {
      alert: { title: payload.title, body: payload.body },
      sound: payload.sound ?? "default",
    };
    if (payload.badge !== undefined) aps.badge = payload.badge;

    const body = JSON.stringify({ aps, ...(payload.data ?? {}) });
    const jwt  = makeJwt(config.keyId, config.teamId, config.p8Key);

    const headers: Record<string, string | number> = {
      ":method":       "POST",
      ":path":         `/3/device/${deviceToken}`,
      "authorization": `bearer ${jwt}`,
      "apns-topic":    config.bundleId,
      "apns-priority": "10",
      "apns-push-type":"alert",
      "content-type":  "application/json",
      "content-length": Buffer.byteLength(body),
    };
    if (payload.collapseId) headers["apns-collapse-id"] = payload.collapseId;

    const req = client.request(headers);
    let status = 0;
    let raw = "";

    req.on("response", (hdrs) => { status = hdrs[":status"] as number; });
    req.on("data",     (c)     => { raw += c; });
    req.on("end", () => {
      client.close();
      if (status === 200) return resolve({ ok: true });
      // 410 = device token no longer active (DeviceNotRegistered equivalent)
      if (status === 410) return resolve({ ok: false, gone: true, error: raw });
      resolve({ ok: false, error: `${status}: ${raw}` });
    });

    req.on("error", (err) => { client.close(); resolve({ ok: false, error: err.message }); });
    req.write(body);
    req.end();
  });
}

// ── Batch sender (called from expo-push.ts) ───────────────────────────────────
export async function sendApnsToTokens(
  tokens: string[],      // raw hex APNs device tokens (no "apns:" prefix)
  payload: ApnsPayload,
): Promise<string[]> {  // returns list of gone/dead tokens to prune
  const config = getApnsConfig();
  if (!config) {
    logger.warn("[apns] Not configured — set APNS_KEY_ID + APNS_KEY_P8 in Secrets");
    return [];
  }

  const dead: string[] = [];
  await Promise.all(
    tokens.map(async (token) => {
      const result = await sendApnsNotification(token, payload, config);
      if (!result.ok) {
        logger.warn({ token: token.slice(0, 16) + "…", error: result.error }, "[apns] send failed");
        if (result.gone) dead.push(token);
      }
    }),
  );
  return dead;
}
