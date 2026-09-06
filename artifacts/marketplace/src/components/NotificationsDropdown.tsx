import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";

interface Notification {
  id: number;
  type: string;
  isRead: boolean;
  listingId: number | null;
  commentId: number | null;
  message: string | null;
  createdAt: string;
  actorName: string;
  actorAvatar: string | null;
  listingTitle: string | null;
  listingImage: string | null;
}

function timeAgo(dateStr: string, justNow: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return justNow;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function NotificationsDropdown() {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const fetchCount = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/notifications/unread-count", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setUnreadCount(d.count); }
    } catch {}
  }, [user, token]);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  const fetchNotifications = async () => {
    if (loaded) return;
    try {
      const res = await fetch("/api/notifications", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); setNotifications(d); setLoaded(true); }
    } catch {}
  };

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (v) {
      fetchNotifications();
      if (unreadCount > 0) markAllRead();
    }
  };

  const notifMessage = (n: Notification): string => {
    switch (n.type) {
      case "like": return t("notifications.liked");
      case "comment": return t("notifications.commented");
      case "share": return t("notifications.shared");
      case "comment_like": return t("notifications.commentLiked");
      case "message": return t("notifications.messageSent");
      case "offer_received": return t("notifications.offerReceived");
      case "offer_accepted": return t("notifications.offerAccepted");
      case "offer_rejected": return t("notifications.offerRejected");
      case "purchase": return t("notifications.purchased");
      case "order_confirmed": return t("notifications.orderConfirmed");
      case "order_shipped": return t("notifications.orderShipped");
      case "order_delivered": return t("notifications.orderDelivered");
      case "delivery_picked_up": return t("notifications.deliveryPickedUp");
      case "delivery_on_the_way": return t("notifications.deliveryOnTheWay");
      case "delivery_arrived": return t("notifications.deliveryArrived");
      case "delivery_delivered": return t("notifications.deliveryDelivered");
      case "delivery_paid": return t("notifications.deliveryPaid");
      case "driver_assigned": return t("notifications.driverAssigned");
      case "boost_approved":
      case "boost_activated": return t("notifications.boostActivated");
      case "transfer_received": return n.message
        ? t("notifications.transferReceivedDetail", { amount: n.message })
        : t("notifications.transferReceived");
      case "transfer_sent": return n.message
        ? t("notifications.transferSentDetail", { detail: n.message })
        : t("notifications.transferSent");
      case "wallet_recharged": return t("notifications.walletRecharged");
      case "payment_refunded": return t("notifications.paymentRefunded");
      case "identity_verified": return t("notifications.identityVerified");
      case "password_reset": return t("notifications.passwordReset");
      case "subscription_payment_failed": return t("notifications.subscriptionPaymentFailed");
      case "subscription_billing_reminder": return t("notifications.subscriptionBillingReminder");
      case "subscription_grace_expired": return t("notifications.subscriptionGraceExpired");
      case "subscription_welcome": return t("notifications.subscriptionWelcome", { plan: n.message ?? "Premium" });
      case "new_listing": return n.message ?? `${n.actorName} ajoute yon nouvo pwodwi.`;
      case "listing_approved":
      case "moderation_approved": return t("notifications.listingApproved");
      case "listing_rejected":
      case "moderation_rejected": return t("notifications.listingRejected");
      case "moderation_pending": return t("notifications.moderationPending");
      default: return t("notifications.defaultNotif");
    }
  };

  const getNotifHref = (n: Notification): string => {
    switch (n.type) {
      // Listing-specific
      case "like":
      case "comment":
      case "comment_like":
      case "offer_received":
      case "offer_accepted":
      case "offer_rejected":
      case "purchase":
      case "listing_approved":
      case "listing_rejected":
      case "moderation_approved":
      case "moderation_rejected":
      case "moderation_pending":
      case "new_listing":
        return n.listingId ? `/listings/${n.listingId}` : "/sell";

      // Video/boost
      case "share":
      case "boost_approved":
      case "boost_activated":
        return n.listingId ? `/listings/${n.listingId}/video` : "/sell";

      // Orders/purchases
      case "order_confirmed":
      case "order_shipped":
      case "order_delivered":
        return n.listingId ? `/listings/${n.listingId}` : "/orders";

      // Delivery tracking
      case "delivery_picked_up":
      case "delivery_on_the_way":
      case "delivery_arrived":
      case "delivery_delivered":
      case "driver_assigned":
        return "/orders";

      // Driver payment credited
      case "delivery_paid":
        return "/wallet";

      // Messages
      case "message":
        return "/messages";

      // Wallet & transfers
      case "transfer_received":
      case "transfer_sent":
      case "wallet_recharged":
      case "payment_refunded":
        return "/wallet";

      // Subscription
      case "subscription_payment_failed":
      case "subscription_billing_reminder":
      case "subscription_grace_expired":
      case "subscription_welcome":
        return "/subscription";

      // Account/security
      case "identity_verified":
      case "password_reset":
        return "/settings";

      default:
        return n.listingId ? `/listings/${n.listingId}` : "/";
    }
  };

  const notifEmoji = (type: string): string => {
    switch (type) {
      case "like": return "❤️";
      case "comment": return "💬";
      case "comment_like": return "❤️";
      case "share": return "🔗";
      case "message": return "✉️";
      case "offer_received":
      case "offer_accepted":
      case "offer_rejected": return "🏷️";
      case "purchase": return "🛒";
      case "order_confirmed": return "🧾";
      case "order_shipped": return "🚚";
      case "order_delivered": return "📦";
      case "delivery_picked_up": return "🔐";
      case "delivery_on_the_way": return "🛵";
      case "delivery_arrived": return "📍";
      case "delivery_delivered": return "✅";
      case "delivery_paid": return "💰";
      case "driver_assigned": return "🚗";
      case "boost_approved":
      case "boost_activated": return "⚡";
      case "transfer_received": return "💸";
      case "transfer_sent": return "📤";
      case "wallet_recharged": return "💰";
      case "payment_refunded": return "💸";
      case "identity_verified": return "✅";
      case "password_reset": return "🔑";
      case "subscription_payment_failed": return "⚠️";
      case "subscription_billing_reminder": return "📅";
      case "subscription_grace_expired": return "🔒";
      case "subscription_welcome": return "🎉";
      case "listing_approved":
      case "moderation_approved": return "✅";
      case "listing_rejected":
      case "moderation_rejected": return "⛔";
      case "moderation_pending": return "⏳";
      case "new_listing": return "📦";
      default: return "🔔";
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 overflow-hidden" sideOffset={8}>
        <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">{t("notifications.notifications")}</h3>
          {notifications.some(n => !n.isRead) && (
            <button onClick={markAllRead} className="text-xs text-primary hover:underline font-medium">
              {t("notifications.markAllRead")}
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!loaded ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("profile.loading")}</p>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("notifications.noNotifications")}</p>
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                onClick={() => { setOpen(false); navigate(getNotifHref(n)); }}
                className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer ${!n.isRead ? "bg-primary/5" : ""}`}
                data-testid={`notification-${n.id}`}
              >
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={n.actorAvatar ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">{n.actorName[0]}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 text-sm leading-none">
                      {notifEmoji(n.type)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-snug">
                      {notifMessage(n)}
                    </p>
                    {n.type === "delivery_picked_up" && n.message && (() => {
                      const m = n.message.match(/kòd konfirmasyon ou:\s*(\d{4,8})/i) ?? n.message.match(/:\s*(\d{4,8})\./);
                      const code = m?.[1];
                      return code ? (
                        <div className="mt-1 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">🔐 {t("notifications.confirmCode")}</span>
                          <span className="text-base font-black tracking-widest text-primary">{code}</span>
                          <button
                            onClick={e => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(code).catch(() => {}); }}
                            className="text-[10px] text-primary font-bold hover:underline shrink-0"
                          >{t("notifications.copy")}</button>
                        </div>
                      ) : null;
                    })()}
                    {n.listingTitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{n.listingTitle}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.createdAt, t("notifications.justNow"))}</p>
                  </div>
                  {n.listingImage && <img src={n.listingImage} className="h-8 w-8 rounded object-cover flex-shrink-0" alt="" />}
                  {!n.isRead && <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
