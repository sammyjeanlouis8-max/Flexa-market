/**
 * Shared web notification destination + copy helpers.
 * Keep in sync with mobile `notificationsApi.notificationNativeHref` /
 * `notificationTitle` intent (product / chat / profile / order / delivery / video).
 */

import { orderNotificationDestination } from "@/lib/order-notification-destination";

export type NotificationNavInput = {
  id: number;
  type: string;
  listingId?: number | null;
  referenceId?: number | null;
  actorId?: number | null;
  message?: string | null;
  actorName?: string | null;
  listingTitle?: string | null;
};

const LISTING_TYPES = new Set([
  "like",
  "comment",
  "comment_like",
  "offer_received",
  "offer_accepted",
  "offer_rejected",
  "offer_counter",
  "listing_approved",
  "listing_rejected",
  "moderation_approved",
  "moderation_rejected",
  "moderation_pending",
  "new_listing",
]);

const VIDEO_TYPES = new Set([
  "share",
  "boost_approved",
  "boost_activated",
  "video_like",
  "video_comment",
  "video_share",
]);

const DELIVERY_PREFIX = "delivery_";
const DRIVER_TYPES = new Set([
  "driver_assigned",
  "driver_timeout",
  "driver_approved",
  "driver_rejected",
  "driver_needs_changes",
  "driver_suspended",
  "driver_unsuspended",
  "driver_application_submitted",
]);

const WALLET_TYPES = new Set([
  "transfer_received",
  "transfer_sent",
  "wallet_recharged",
  "payment_refunded",
  "delivery_paid",
  "delivery_earnings",
  "delivery_hold_release",
]);

/** Web SPA path for a notification. Never invents IDs. */
export function getNotificationHref(n: NotificationNavInput): string {
  const orderDestination = orderNotificationDestination(n);
  if (orderDestination) return orderDestination;

  const type = String(n.type || "");

  if (type === "follow" || type === "new_follower") {
    return n.actorId ? `/profile/${n.actorId}` : "/";
  }

  if (type === "message") {
    return n.referenceId ? `/messages/${n.referenceId}` : "/messages";
  }

  if (type === "order_cancelled") {
    return n.referenceId ? `/orders/${n.referenceId}` : "/orders";
  }

  if (type.startsWith("support_")) {
    return n.referenceId ? `/support/tickets/${n.referenceId}` : "/support";
  }

  if (LISTING_TYPES.has(type)) {
    return n.listingId ? `/listings/${n.listingId}` : "/sell";
  }

  if (VIDEO_TYPES.has(type)) {
    return n.listingId ? `/listings/${n.listingId}/video` : "/videos";
  }
  if (type === "boost_expired") {
    return n.listingId ? `/boost/${n.listingId}` : "/my-drafts";
  }
  if (type === "video_ready") {
    return "/my-drafts";
  }

  if (type.startsWith(DELIVERY_PREFIX) || DRIVER_TYPES.has(type)) {
    if (type === "delivery_paid" || type === "delivery_earnings" || type === "delivery_hold_release") {
      return "/wallet";
    }
    if (DRIVER_TYPES.has(type) && type !== "driver_assigned" && type !== "driver_timeout") {
      return "/driver/status";
    }
    if (n.referenceId) return `/delivery/tracking/${n.referenceId}`;
    if (n.listingId) return `/orders`;
    return "/orders";
  }

  if (type === "card_refund") {
    return n.referenceId ? `/orders/${n.referenceId}` : "/orders";
  }

  if (WALLET_TYPES.has(type)) return "/wallet";

  if (
    type.startsWith("subscription_") ||
    type === "identity_verified" ||
    type === "password_reset"
  ) {
    if (type.startsWith("subscription_")) return "/subscription";
    if (type === "identity_verified") return "/settings";
    return "/settings";
  }

  if (type === "exchange_rate_changed") return "/admin";

  // Prefer concrete entities when present.
  if (n.listingId) return `/listings/${n.listingId}`;
  if (n.referenceId) return `/orders/${n.referenceId}`;
  if (n.actorId) return `/profile/${n.actorId}`;
  // General / unknown → notification details page.
  return `/notifications/${n.id}`;
}

/**
 * Build human-readable notification body.
 * Prefer stored `message` for unknown types (fixes "sent you a notification").
 */
export function formatNotificationMessage(
  n: NotificationNavInput,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const actor = (n.actorName || "").trim() || t("notifications.someone", { defaultValue: "Someone" });
  const withActor = (phrase: string) => `${actor} ${phrase}`;

  switch (n.type) {
    case "like":
      return withActor(t("notifications.liked"));
    case "comment":
      return withActor(t("notifications.commented"));
    case "share":
    case "video_share":
      return withActor(t("notifications.shared"));
    case "comment_like":
      return withActor(t("notifications.commentLiked"));
    case "message":
      return withActor(t("notifications.messageSent"));
    case "follow":
    case "new_follower":
      return withActor(t("notifications.followedYou", { defaultValue: "started following you" }));
    case "offer_received":
      return withActor(t("notifications.offerReceived"));
    case "offer_accepted":
      return withActor(t("notifications.offerAccepted"));
    case "offer_rejected":
      return withActor(t("notifications.offerRejected"));
    case "offer_counter":
      return withActor(t("notifications.offerCounter", { defaultValue: "sent a counter-offer" }));
    case "purchase":
    case "new_order":
      return withActor(t("notifications.purchased"));
    case "order_confirmed":
      return t("notifications.orderConfirmed");
    case "order_shipped":
      return t("notifications.orderShipped");
    case "order_cancelled":
      return n.message?.trim() || t("notifications.orderCancelled", { defaultValue: "Order cancelled" });
    case "shipment_created":
    case "shipment_shipped":
    case "shipment_in_transit":
    case "shipment_out_for_delivery":
    case "shipment_delivered":
    case "shipment_exception":
    case "shipment_returned":
      return n.message?.trim() || t("notifications.orderShipped");
    case "order_delivered":
      return t("notifications.orderDelivered");
    case "card_refund":
      return n.message?.trim() || t("notifications.paymentRefunded");
    case "delivery_picked_up":
      return n.message?.trim() || t("notifications.deliveryPickedUp");
    case "delivery_pin":
      return n.message?.trim() || t("notifications.confirmCode", { defaultValue: "Delivery PIN" });
    case "delivery_on_the_way":
      return n.message?.trim() || t("notifications.deliveryOnTheWay");
    case "delivery_arrived":
    case "delivery_arrived_pickup":
      return n.message?.trim() || t("notifications.deliveryArrived");
    case "delivery_delivered":
    case "delivery_completed":
      return n.message?.trim() || t("notifications.deliveryDelivered");
    case "delivery_paid":
    case "delivery_earnings":
      return n.message?.trim() || t("notifications.deliveryPaid");
    case "delivery_status_update":
    case "delivery_buyer_absent":
    case "delivery_rescheduled":
    case "delivery_returned":
    case "delivery_hold_release":
    case "delivery_confirmed":
      return n.message?.trim()
        || t("notifications.deliveryUpdate", { defaultValue: "Delivery update" });
    case "driver_assigned":
      return n.message?.trim() || t("notifications.driverAssigned");
    case "driver_timeout":
      return n.message?.trim()
        || t("notifications.driverTimeout", { defaultValue: "Driver timed out — reassigning" });
    case "driver_approved":
      return t("notifications.driverApproved", { defaultValue: "Your driver application was approved" });
    case "driver_rejected":
      return t("notifications.driverRejected", { defaultValue: "Your driver application was rejected" });
    case "driver_needs_changes":
      return t("notifications.driverNeedsChanges", { defaultValue: "Driver application needs changes" });
    case "driver_suspended":
      return t("notifications.driverSuspended", { defaultValue: "Your driver account was suspended" });
    case "driver_unsuspended":
      return t("notifications.driverUnsuspended", { defaultValue: "Your driver account was reinstated" });
    case "driver_application_submitted":
      return n.message?.trim()
        || t("notifications.driverApplicationSubmitted", { defaultValue: "Driver application submitted" });
    case "boost_approved":
    case "boost_activated":
      return t("notifications.boostActivated");
    case "boost_expired":
      return n.message?.trim() || t("myDrafts.boostExpired", { defaultValue: "Boost Expired" });
    case "video_ready":
      return n.message?.trim()
        || t("myDrafts.videoReadyMessage", { defaultValue: "Your video has finished uploading and is ready to use." });
    case "transfer_received":
      return n.message
        ? t("notifications.transferReceivedDetail", { amount: n.message })
        : t("notifications.transferReceived");
    case "transfer_sent":
      return n.message
        ? t("notifications.transferSentDetail", { detail: n.message })
        : t("notifications.transferSent");
    case "wallet_recharged":
      return t("notifications.walletRecharged");
    case "payment_refunded":
      return t("notifications.paymentRefunded");
    case "identity_verified":
      return t("notifications.identityVerified");
    case "password_reset":
      return t("notifications.passwordReset");
    case "subscription_payment_failed":
      return t("notifications.subscriptionPaymentFailed");
    case "subscription_billing_reminder":
      return t("notifications.subscriptionBillingReminder");
    case "subscription_grace_expired":
      return t("notifications.subscriptionGraceExpired");
    case "subscription_welcome":
      return t("notifications.subscriptionWelcome", { plan: n.message ?? "Premium" });
    case "exchange_rate_changed":
      return n.message?.trim() || t("notifications.defaultNotif");
    case "new_listing":
      return n.message?.trim()
        || t("notifications.newListing", {
          defaultValue: "{{name}} added a new product.",
          name: actor,
        });
    case "listing_approved":
    case "moderation_approved":
      return t("notifications.listingApproved");
    case "listing_rejected":
    case "moderation_rejected":
      return t("notifications.listingRejected");
    case "moderation_pending":
      return t("notifications.moderationPending");
    case "support_assignment":
    case "support_reply":
    case "support_closed":
      return n.message?.trim()
        || t("notifications.supportUpdate", { defaultValue: "Support update" });
    default: {
      if (n.type.startsWith(DELIVERY_PREFIX) && n.message?.trim()) return n.message.trim();
      if (n.message?.trim()) return n.message.trim();
      return withActor(t("notifications.defaultNotif"));
    }
  }
}
