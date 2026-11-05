import { orderNotificationDestination } from "@/lib/order-notification-destination";

export interface NotificationLike {
  type: string;
  listingId?: number | null;
  referenceId?: number | null;
  commentId?: number | null;
  message?: string | null;
  title?: string | null;
}

/**
 * Centralized, secure destination resolution for in-app + push notification clicks.
 * Never invents admin URLs; only returns known app paths.
 */
export function resolveNotificationDestination(n: NotificationLike): string {
  const orderDestination = orderNotificationDestination(n);
  if (orderDestination) return orderDestination;

  switch (n.type) {
    case "official_communication":
      return n.referenceId ? `/communications/${n.referenceId}` : "/communications";

    case "admin_broadcast":
      // Legacy admin pushes may carry destination only in push payload;
      // in-app rows without reference fall back to home.
      return n.referenceId ? `/communications/${n.referenceId}` : "/";

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
      return n.listingId ? `/listings/${n.listingId}` : "/sell";

    case "share":
    case "boost_approved":
    case "boost_activated":
      return n.listingId ? `/listings/${n.listingId}/video` : "/sell";

    case "card_refund":
      return n.referenceId ? `/orders/${n.referenceId}` : "/orders";

    case "delivery_picked_up":
    case "delivery_on_the_way":
    case "delivery_arrived":
    case "delivery_delivered":
    case "driver_assigned":
      return n.referenceId ? `/orders/${n.referenceId}` : "/orders";

    case "delivery_paid":
    case "transfer_received":
    case "transfer_sent":
    case "wallet_recharged":
    case "payment_refunded":
      return n.referenceId ? `/wallet/history` : "/wallet";

    case "message":
      return n.referenceId ? `/messages/${n.referenceId}` : "/messages";

    case "support_reply":
    case "support_message":
      return n.referenceId ? `/support/${n.referenceId}` : "/support";

    case "subscription_payment_failed":
    case "subscription_billing_reminder":
    case "subscription_grace_expired":
    case "subscription_welcome":
      return "/subscription";

    case "identity_verified":
    case "password_reset":
      return "/settings/security";

    case "exchange_rate_changed":
      return "/admin";

    default:
      return n.listingId ? `/listings/${n.listingId}` : "/";
  }
}
