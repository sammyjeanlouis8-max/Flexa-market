/**
 * Map Expo push / notification payloads to native Expo Router paths.
 * Prefers server `data.screen` + `params`, then URL path mapping.
 */
export function pathFromNotificationData(data: Record<string, unknown> | undefined | null): string | null {
  if (!data) return null;

  const screen = typeof data.screen === "string" ? data.screen : null;
  const params = (data.params && typeof data.params === "object"
    ? (data.params as Record<string, unknown>)
    : null) as Record<string, unknown> | null;

  if (screen === "messages" || screen === "chat") {
    const convId =
      params?.conversationId ??
      data.conversationId ??
      data.referenceId;
    if (convId != null && String(convId).length) return `/chat/${convId}`;
    return "/inbox";
  }
  if (screen === "orders" || screen === "order") {
    const orderId = params?.orderId ?? data.orderId ?? data.referenceId;
    if (orderId != null) return `/orders/${orderId}`;
    return "/orders";
  }
  if (screen === "wallet") return "/wallet";
  if (screen === "notifications") return "/notifications";

  const url = typeof data.url === "string" ? data.url : null;
  if (url) {
    try {
      const u = url.startsWith("http") ? new URL(url) : null;
      const path = u ? u.pathname : url;
      const msg = path.match(/\/messages\/(\d+)/);
      if (msg) return `/chat/${msg[1]}`;
      const order = path.match(/\/orders\/(\d+)/);
      if (order) return `/orders/${order[1]}`;
      if (/\/wallet/.test(path)) return "/wallet";
      if (/\/saved|\/favorites/.test(path)) return "/favorites";
      if (/\/notifications/.test(path)) return "/notifications";
    } catch {
      /* ignore malformed */
    }
  }

  return null;
}
