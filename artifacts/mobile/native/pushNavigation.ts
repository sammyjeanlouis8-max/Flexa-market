import { isTrustedFlexaUrl } from "../security/webviewPolicy.ts";

export function getNotificationUrl(data: unknown, website: string): string | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as { url?: unknown; screen?: unknown; params?: { conversationId?: unknown } };
  let value = payload.url;
  if (value === undefined && payload.screen === "messages") {
    const id = String(payload.params?.conversationId ?? "");
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
    value = `/messages/${id}`;
  }
  if (typeof value !== "string" || value.startsWith("//")) return null;
  try {
    const url = new URL(value, website);
    if (url.username || url.password || !isTrustedFlexaUrl(url.href)) return null;
    return url.href;
  } catch { return null; }
}

/** The website consumes this intent when its router and authentication are ready. */
export function pushNavigationScript(url: string): string {
  return `(function(){window.__pendingPushUrl=${JSON.stringify(url)};` +
    `if(typeof window.__handlePushUrl==='function')window.__handlePushUrl(window.__pendingPushUrl);` +
    `})();true;`;
}