/**
 * Map Expo push / notification payloads to the exact native Expo Router path.
 * Never dumps all taps on Home. Destinations must exist in the native app tree.
 */

function normalizePath(urlOrPath: string): string {
  try {
    const u = urlOrPath.startsWith("http") ? new URL(urlOrPath) : null;
    return u ? u.pathname + (u.search || "") : urlOrPath;
  } catch {
    return urlOrPath;
  }
}

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

  if (screen === "messages" || screen === "chat" || screen === "kominike" || screen === "inbox") {
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
  if (screen === "earnings" || screen === "seller-earnings" || screen === "payout") {
    return "/seller-earnings";
  }
  if (screen === "notifications" || screen === "system" || screen === "admin_broadcast") {
    return "/notifications";
  }
  if (screen === "videos" || screen === "promo" || screen === "promotional") return "/videos";
  if (screen === "boost" || screen === "boosts" || screen === "my-boosts") return "/my-boosts";
  if (screen === "boost-create" || screen === "campaign") return "/boost";
  if (screen === "chatbot") return "/chatbot";
  if (screen === "tv" || screen === "flexa-tv" || screen === "flexatv") return "/tv";
  if (screen === "music" || screen === "flexa-music" || screen === "flexamusic") return "/music";
  if (screen === "music-earnings") return "/music";
  if (screen === "manager" || screen === "store-manager") return "/manager";
  if (screen === "kyc" || screen === "identity") return "/kyc";
  if (screen === "delivery" || screen === "tracking") {
    const tn = pick("trackingNumber", "tracking");
    return tn ? `/track/${encodeURIComponent(tn)}` : "/delivery-tracking";
  }

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
  if (type.includes("boost")) return "/my-boosts";
  if (type.includes("video") || type.includes("promo")) return "/videos";
  if (type.includes("tv")) return "/tv";
  if (type.includes("music")) return "/music";
  if (type.includes("earning") || type.includes("payout") || type.includes("commission")) {
    return "/seller-earnings";
  }
  if (type === "admin_broadcast" || type.includes("system") || type.includes("announcement")) {
    return "/notifications";
  }

  const url = typeof data.url === "string" ? data.url : null;
  if (url) {
    try {
      const path = normalizePath(url);
      const msg = path.match(/\/messages\/(\d+)/);
      if (msg) return `/chat/${msg[1]}`;
      const support = path.match(/\/support\/(?:tickets\/)?(\d+)/);
      if (support) return `/support/${support[1]}`;
      const order = path.match(/\/orders\/(\d+)/);
      if (order) return `/orders/${order[1]}`;
      const listing = path.match(/\/listings?\/(\d+)/);
      if (listing) return `/listing/${listing[1]}`;
      if (/\/offers/.test(path)) return "/offers";
      if (/\/wallet/.test(path)) return "/wallet";
      if (/\/sales/.test(path)) return "/sales";
      if (/\/seller-earnings|\/earnings|\/payout/.test(path)) return "/seller-earnings";
      if (/\/saved|\/favorites/.test(path)) return "/favorites";
      if (/\/notifications/.test(path)) return "/notifications";
      if (/\/chatbot/.test(path)) return "/chatbot";
      if (/\/videos/.test(path)) return "/videos";
      if (/\/boost|\/my-boosts/.test(path)) return "/my-boosts";
      if (/\/tv\b/.test(path)) return "/tv";
      if (/\/music/.test(path)) return "/music";
      if (/\/manager/.test(path)) return "/manager";
      if (/\/kyc|\/identity/.test(path)) return "/kyc";
      if (/\/track\//.test(path)) {
        const t = path.match(/\/track\/([^/?#]+)/);
        return t ? `/track/${t[1]}` : "/delivery-tracking";
      }
    } catch {
      /* ignore malformed */
    }
  }

  return null;
}

/** Extract in-app notification id from push data when present (inbox sync). */
export function notificationIdFromPushData(
  data: Record<string, unknown> | undefined | null,
): number | null {
  if (!data) return null;
  const raw =
    data.notificationId ??
    data.notification_id ??
    (data.params && typeof data.params === "object"
      ? (data.params as Record<string, unknown>).notificationId
      : null);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}
