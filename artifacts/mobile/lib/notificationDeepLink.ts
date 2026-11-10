/**
 * Map Expo push / notification payloads to the exact native Expo Router path.
 * Never dumps all taps on Home.
 */
export function pathFromNotificationData(
  data: Record<string, unknown> | undefined | null,
): string | null {
  if (!data) return null;

  const screen = typeof data.screen === "string" ? data.screen.toLowerCase() : null;
  const params =
    data.params && typeof data.params === "object"
      ? (data.params as Record<string, unknown>)
      : null;

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = params?.[k] ?? data[k];
      if (v != null && String(v).length) return String(v);
    }
    return null;
  };

  if (screen === "messages" || screen === "chat" || screen === "kominike") {
    const convId = pick("conversationId", "referenceId", "id");
    return convId ? `/chat/${convId}` : "/inbox";
  }
  if (screen === "support" || screen === "ticket") {
    const ticketId = pick("threadId", "ticketId", "referenceId", "id");
    return ticketId ? `/support/${ticketId}` : "/support";
  }
  if (screen === "orders" || screen === "order") {
    const orderId = pick("orderId", "referenceId", "id");
    return orderId ? `/orders/${orderId}` : "/orders";
  }
  if (screen === "offers" || screen === "offer") {
    return "/offers";
  }
  if (screen === "listing" || screen === "product") {
    const listingId = pick("listingId", "id");
    return listingId ? `/listing/${listingId}` : "/";
  }
  if (screen === "wallet" || screen === "transaction") return "/wallet";
  if (screen === "sales" || screen === "seller") return "/sales";
  if (screen === "notifications") return "/notifications";
  if (screen === "videos" || screen === "promo") {
    const profileId = pick("userId", "creatorId", "profileId", "id");
    if (profileId && (screen === "videos" || data.videoProfile)) {
      return `/videos`; // native videos surface is placeholder; SPA owns /videos/profile/:id
    }
    return "/videos";
  }
  if (screen === "video_profile" || screen === "videoprofile") {
    // Deep-link identity matches marketplace SPA; Expo videos UI remains placeholder.
    return "/videos";
  }
  if (screen === "chatbot") return "/chatbot";

  const type = typeof data.type === "string" ? data.type.toLowerCase() : "";
  if (type === "message") {
    const convId = pick("conversationId", "referenceId");
    return convId ? `/chat/${convId}` : "/inbox";
  }
  if (type.includes("support")) {
    const ticketId = pick("threadId", "referenceId");
    return ticketId ? `/support/${ticketId}` : "/support";
  }
  if (type.includes("offer")) return "/offers";
  if (type.includes("order") || type.includes("purchase") || type.includes("sale")) {
    const orderId = pick("orderId", "referenceId");
    return orderId ? `/orders/${orderId}` : "/orders";
  }
  if (type.includes("wallet") || type.includes("transfer") || type.includes("payment")) {
    return "/wallet";
  }

  const url = typeof data.url === "string" ? data.url : null;
  if (url) {
    try {
      const u = url.startsWith("http") ? new URL(url) : null;
      const path = u ? u.pathname : url;
      const msg = path.match(/\/messages\/(\d+)/);
      if (msg) return `/chat/${msg[1]}`;
      const support = path.match(/\/support\/(?:tickets\/)?(\d+)/);
      if (support) return `/support/${support[1]}`;
      const order = path.match(/\/orders\/(\d+)/);
      if (order) return `/orders/${order[1]}`;
      const listing = path.match(/\/listings\/(\d+)/);
      if (listing) return `/listing/${listing[1]}`;
      if (/\/offers/.test(path)) return "/offers";
      if (/\/wallet/.test(path)) return "/wallet";
      if (/\/sales/.test(path)) return "/sales";
      if (/\/saved|\/favorites/.test(path)) return "/favorites";
      if (/\/notifications/.test(path)) return "/notifications";
      if (/\/chatbot/.test(path)) return "/chatbot";
      // Same /videos/profile/:id identity as marketplace SPA (Expo videos is placeholder).
      if (/\/videos\/profile\/\d+/.test(path)) return "/videos";
      if (/\/videos/.test(path)) return "/videos";
    } catch {
      /* ignore malformed */
    }
  }

  return null;
}
