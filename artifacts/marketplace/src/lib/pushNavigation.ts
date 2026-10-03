/** Push destinations are untrusted input. Never navigate away from this app. */
export function normalizePushPath(value: unknown, origin: string, basePath = "/"): string | null {
  if (typeof value !== "string" || !value.trim() || value.startsWith("//")) return null;
  if (!value.startsWith("/") && !/^https?:\/\//i.test(value)) return null;
  try {
    const target = new URL(value, origin);
    if (target.origin !== origin || target.username || target.password) return null;
    const base = basePath.replace(/\/$/, "");
    if (base && target.pathname !== base && !target.pathname.startsWith(`${base}/`)) return null;
    const path = target.pathname.slice(base.length) || "/";
    if (path.startsWith("/messages/") && conversationIdFromPath(path) === null) return null;
    return `${path}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

export function conversationIdFromPath(path: string): number | null {
  const match = /^\/messages\/([1-9]\d*)\/?(?:[?#].*)?$/.exec(path);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) ? id : null;
}

export const OPEN_PUSH_CONVERSATION = "flexa-open-push-conversation";
export const PENDING_PUSH_KEY = "flexa_pending_push_destination";
export const PENDING_PUSH_TTL_MS = 24 * 60 * 60 * 1000;

export function readPendingPush(
  storage: Pick<Storage, "getItem" | "removeItem">,
  origin: string,
  basePath = "/",
  now = Date.now(),
): string | null {
  try {
    const saved = JSON.parse(storage.getItem(PENDING_PUSH_KEY) || "null");
    if (!saved || typeof saved.path !== "string" || !saved.path.startsWith("/") ||
        typeof saved.time !== "number" || !Number.isFinite(saved.time) || saved.time > now ||
        now - saved.time > PENDING_PUSH_TTL_MS) {
      storage.removeItem(PENDING_PUSH_KEY);
      return null;
    }
    const base = basePath.replace(/\/$/, "");
    const path = normalizePushPath(`${base}${saved.path}`, origin, basePath);
    if (!path) storage.removeItem(PENDING_PUSH_KEY);
    return path;
  } catch {
    return null;
  }
}