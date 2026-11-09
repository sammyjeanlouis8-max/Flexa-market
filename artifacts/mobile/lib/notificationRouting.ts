/**
 * Map in-app / push notification payloads to native routes.
 * Never put private message bodies into unauthorized surfaces — routing only.
 */

export type NotificationLike = {
  type?: string | null;
  listingId?: number | null;
  referenceId?: number | null;
  commentId?: number | null;
  message?: string | null;
  url?: string | null;
};

export type NativeRoute =
  | { pathname: string; params?: Record<string, string> }
  | null;

/** Normalize push `data.url` (website path) into a native route when possible. */
export function routeFromPushUrl(url: string | null | undefined): NativeRoute {
  if (!url || typeof url !== "string") return null;
  const path = url.replace(/^https?:\/\/[^/]+/i, "").split("?")[0] || "/";

  if (path === "/communications" || path.startsWith("/communications")) {
    return { pathname: "/communications" };
  }
  if (path.startsWith("/messages/") || path.startsWith("/chat/")) {
    const id = path.split("/").filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) return { pathname: "/chat/[id]", params: { id } };
  }
  if (path === "/messages" || path === "/inbox") return { pathname: "/(tabs)/inbox" };
  if (path.startsWith("/orders/")) {
    const id = path.split("/").filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) return { pathname: "/orders/[id]", params: { id } };
  }
  if (path === "/orders") return { pathname: "/orders" };
  if (path.startsWith("/listing/") || path.startsWith("/listings/")) {
    const id = path.split("/").filter(Boolean).pop();
    if (id && /^\d+$/.test(id)) return { pathname: "/listing/[id]", params: { id } };
  }
  if (path.startsWith("/support")) return { pathname: "/support" };
  if (path === "/notifications") return { pathname: "/notifications" };
  if (path === "/wallet") return { pathname: "/wallet" };
  return { pathname: "/notifications" };
}

export function routeFromNotification(n: NotificationLike): NativeRoute {
  if (n.url) {
    const fromUrl = routeFromPushUrl(n.url);
    if (fromUrl) return fromUrl;
  }

  const type = (n.type || "").toLowerCase();

  // System / admin broadcasts → Communications page (existing product rule).
  if (
    type === "admin_broadcast" ||
    type === "announcement" ||
    type === "system_announcement" ||
    type === "communications"
  ) {
    return { pathname: "/communications" };
  }

  if (type.includes("message") || type === "new_message" || type === "chat") {
    if (n.referenceId) return { pathname: "/chat/[id]", params: { id: String(n.referenceId) } };
    return { pathname: "/(tabs)/inbox" };
  }

  if (type.includes("support") || type === "support_reply") {
    if (n.referenceId) return { pathname: "/support/[id]", params: { id: String(n.referenceId) } };
    return { pathname: "/support" };
  }

  if (
    type.includes("order") ||
    type.includes("purchase") ||
    type.includes("delivery") ||
    type.includes("ship") ||
    type.includes("payment") ||
    type.includes("refund")
  ) {
    if (n.referenceId) return { pathname: "/orders/[id]", params: { id: String(n.referenceId) } };
    return { pathname: "/orders" };
  }

  if (type.includes("boost") || type.includes("video")) {
    return { pathname: "/my-boosts" };
  }

  if (type.includes("wallet") || type.includes("payout")) {
    return { pathname: "/wallet" };
  }

  if (type.includes("security") || type.includes("login") || type.includes("ban")) {
    return { pathname: "/settings" };
  }

  if (n.listingId) {
    return { pathname: "/listing/[id]", params: { id: String(n.listingId) } };
  }

  return { pathname: "/notifications" };
}

export function notificationCategory(type: string | null | undefined): string {
  const t = (type || "").toLowerCase();
  if (t.includes("message") || t.includes("chat") || t.includes("support")) return "Messages";
  if (t.includes("order") || t.includes("delivery") || t.includes("ship") || t.includes("payment")) {
    return "Orders";
  }
  if (t.includes("boost") || t.includes("video") || t.includes("promo")) return "Promotions";
  if (t.includes("wallet") || t.includes("payout")) return "Wallet";
  if (t.includes("admin_broadcast") || t.includes("announcement")) return "Announcements";
  if (t.includes("security")) return "Security";
  return "System";
}
