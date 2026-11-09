/**
 * In-app notification center — same APIs as marketplace NotificationsDropdown.
 * Does not fabricate notifications; FCM push delivery is prepared separately.
 */
import { getApiBase } from "./api";

export type AppNotification = {
  id: number;
  type: string;
  isRead: boolean;
  listingId: number | null;
  referenceId?: number | null;
  commentId: number | null;
  message: string | null;
  createdAt: string;
  actorName: string;
  actorAvatar: string | null;
  listingTitle: string | null;
  listingImage: string | null;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string },
): Promise<Response> {
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchNotifications(
  opts: AuthOpts,
): Promise<AppNotification[]> {
  const res = await authed("/notifications", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Notifications failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchUnreadCount(opts: AuthOpts): Promise<number> {
  const res = await authed("/notifications/unread-count", opts);
  const data = await readJson(res);
  if (!res.ok) return 0;
  return Number(data.count ?? 0);
}

export async function markNotificationRead(
  id: number,
  opts: AuthOpts,
): Promise<void> {
  await authed(`/notifications/${id}/read`, { ...opts, method: "POST" });
}

export async function markAllNotificationsRead(opts: AuthOpts): Promise<void> {
  await authed("/notifications/read-all", { ...opts, method: "POST" });
}

export function notificationTitle(n: AppNotification): string {
  if (n.message?.trim()) return n.message.trim();
  switch (n.type) {
    case "like":
      return `${n.actorName} liked your listing`;
    case "comment":
      return `${n.actorName} commented`;
    case "message":
      return `${n.actorName} sent a message`;
    case "purchase":
    case "new_order":
      return "New order received";
    case "order_confirmed":
      return "Order confirmed";
    case "order_shipped":
    case "shipment_shipped":
    case "shipment_in_transit":
      return "Order shipped";
    case "order_delivered":
    case "shipment_delivered":
    case "delivery_delivered":
      return "Order delivered";
    case "delivery_pin":
      return "Delivery PIN";
    case "driver_assigned":
      return "Driver assigned";
    case "offer_received":
      return "New offer";
    case "video_ready":
      return "Video ready";
    case "transfer_received":
      return "Transfer received";
    case "wallet_recharged":
      return "Wallet recharged";
    default:
      return n.listingTitle ? `Update · ${n.listingTitle}` : "Notification";
  }
}

/**
 * Map notification → native Expo Router path.
 * Order notifications require transaction referenceId (never listingId alone).
 * Message types preserve Kominike by routing to inbox/chat.
 */
export function notificationNativeHref(n: AppNotification): string {
  const orderSeller = ["purchase", "new_order"].includes(n.type);
  const orderBuyer = [
    "order_confirmed",
    "order_shipped",
    "order_delivered",
    "shipment_created",
    "shipment_shipped",
    "shipment_in_transit",
    "shipment_out_for_delivery",
    "shipment_delivered",
    "shipment_exception",
    "shipment_returned",
  ].includes(n.type);
  if (orderSeller || orderBuyer) {
    const id = n.referenceId;
    if (typeof id === "number" && id > 0) return `/orders/${id}`;
    return orderSeller ? "/sales" : "/orders";
  }

  switch (n.type) {
    case "card_refund":
      return n.referenceId ? `/orders/${n.referenceId}` : "/orders";
    case "delivery_picked_up":
    case "delivery_pin":
    case "delivery_on_the_way":
    case "delivery_arrived":
    case "delivery_delivered":
    case "driver_assigned":
    case "delivery_paid":
      if (n.referenceId) {
        // referenceId may be delivery id or order id depending on emitter;
        // prefer order detail when present, else delivery tracking.
        return `/orders/${n.referenceId}`;
      }
      return "/delivery-tracking";
    case "message":
      // Kominike: conversation thread when referenceId is conversation id
      return n.referenceId ? `/chat/${n.referenceId}` : "/inbox";
    case "like":
    case "comment":
    case "comment_like":
    case "offer_received":
    case "offer_accepted":
    case "offer_rejected":
    case "listing_approved":
    case "listing_rejected":
    case "moderation_approved":
    case "moderation_rejected":
    case "moderation_pending":
    case "new_listing":
      return n.listingId ? `/listing/${n.listingId}` : "/";
    case "boost_approved":
    case "boost_activated":
    case "boost_expired":
      return n.listingId ? `/listing/${n.listingId}` : "/my-boosts";
    case "video_ready":
      return "/videos";
    case "transfer_received":
    case "transfer_sent":
    case "wallet_recharged":
    case "payment_refunded":
      return "/wallet";
    case "identity_verified":
      return "/kyc";
    case "subscription_payment_failed":
    case "subscription_billing_reminder":
    case "subscription_grace_expired":
    case "subscription_welcome":
      return "/subscription";
    default:
      if (n.listingId) return `/listing/${n.listingId}`;
      if (n.referenceId) return `/orders/${n.referenceId}`;
      return "/notifications";
  }
}
