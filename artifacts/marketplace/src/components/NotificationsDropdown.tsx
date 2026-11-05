import { useState, useEffect, useCallback } from "react";
import {
  Bell, Megaphone, Calendar, Package, Shield, Tag, MessageSquare, Wallet,
  Heart, ShoppingBag, Truck, Zap, ChevronRight, CheckCircle2, KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { resolveNotificationDestination } from "@/lib/notificationDestination";
import { cn } from "@/lib/utils";

interface Notification {
  id: number;
  type: string;
  isRead: boolean;
  listingId: number | null;
  referenceId: number | null;
  commentId: number | null;
  title: string | null;
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

type IconTone = "emerald" | "blue" | "amber" | "violet" | "rose" | "slate" | "orange";

function notifVisual(type: string): { Icon: typeof Bell; tone: IconTone } {
  switch (type) {
    case "official_communication":
      return { Icon: Megaphone, tone: "emerald" };
    case "admin_broadcast":
      return { Icon: Megaphone, tone: "emerald" };
    case "subscription_billing_reminder":
    case "subscription_welcome":
    case "subscription_payment_failed":
    case "subscription_grace_expired":
      return { Icon: Calendar, tone: "blue" };
    case "purchase":
    case "new_order":
    case "order_confirmed":
    case "order_shipped":
    case "order_delivered":
    case "shipment_created":
    case "shipment_shipped":
    case "shipment_in_transit":
    case "shipment_out_for_delivery":
    case "shipment_delivered":
    case "shipment_exception":
    case "shipment_returned":
    case "card_refund":
      return { Icon: Package, tone: "amber" };
    case "identity_verified":
    case "password_reset":
      return { Icon: Shield, tone: "blue" };
    case "offer_received":
    case "offer_accepted":
    case "offer_rejected":
    case "new_listing":
      return { Icon: Tag, tone: "violet" };
    case "message":
    case "support_reply":
    case "support_message":
    case "comment":
      return { Icon: MessageSquare, tone: "blue" };
    case "transfer_received":
    case "transfer_sent":
    case "wallet_recharged":
    case "payment_refunded":
    case "delivery_paid":
      return { Icon: Wallet, tone: "emerald" };
    case "like":
    case "comment_like":
      return { Icon: Heart, tone: "rose" };
    case "delivery_picked_up":
    case "delivery_on_the_way":
    case "delivery_arrived":
    case "delivery_delivered":
    case "driver_assigned":
      return { Icon: Truck, tone: "orange" };
    case "boost_approved":
    case "boost_activated":
      return { Icon: Zap, tone: "amber" };
    case "listing_approved":
    case "moderation_approved":
      return { Icon: CheckCircle2, tone: "emerald" };
    case "listing_rejected":
    case "moderation_rejected":
      return { Icon: KeyRound, tone: "rose" };
    default:
      return { Icon: Bell, tone: "slate" };
  }
}

const TONE_CLASS: Record<IconTone, string> = {
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
};

const UNREAD_BG: Record<IconTone, string> = {
  emerald: "bg-emerald-50/80 dark:bg-emerald-950/20",
  blue: "bg-blue-50/80 dark:bg-blue-950/20",
  amber: "bg-amber-50/70 dark:bg-amber-950/20",
  violet: "bg-violet-50/70 dark:bg-violet-950/20",
  rose: "bg-rose-50/70 dark:bg-rose-950/20",
  slate: "bg-muted/50",
  orange: "bg-orange-50/70 dark:bg-orange-950/20",
};

export default function NotificationsDropdown({ light = false }: { light?: boolean }) {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const fetchCount = useCallback(async (signal?: AbortSignal) => {
    if (!user || !token) return;
    try {
      const res = await fetch("/api/notifications/unread-count", { signal, headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); if (!signal?.aborted) setUnreadCount(d.count); }
    } catch { /* ignore */ }
  }, [user?.id, token]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCount(controller.signal);
    const interval = setInterval(() => { void fetchCount(controller.signal); }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchCount();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchCount]);

  const fetchNotifications = useCallback(async (signal?: AbortSignal) => {
    if (!user || !token) return;
    try {
      const res = await fetch("/api/notifications", { signal, headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const d = await res.json(); if (!signal?.aborted) { setNotifications(d); setLoaded(true); } }
    } catch { /* ignore */ }
  }, [user?.id, token]);

  useEffect(() => {
    setNotifications([]); setLoaded(false); setUnreadCount(0); setOpen(false);
  }, [user?.id, token]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetchNotifications(controller.signal);
    const interval = setInterval(() => { void fetchNotifications(controller.signal); }, 45_000);
    return () => { controller.abort(); clearInterval(interval); };
  }, [open, fetchNotifications]);

  const markAllRead = async () => {
    await fetch("/api/notifications/read-all", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const markOneRead = async (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    await fetch(`/api/notifications/${id}/read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
  };

  const notifTitle = (n: Notification): string => {
    if (n.title?.trim()) {
      if (n.type === "official_communication") {
        return t("notifications.communiquePrefix", { title: n.title.trim() });
      }
      return n.title.trim();
    }
    switch (n.type) {
      case "official_communication":
        return t("notifications.officialCommunication");
      case "admin_broadcast":
        return t("notifications.adminBroadcast");
      case "subscription_billing_reminder":
        return t("notifications.subscriptionBillingReminder");
      case "subscription_payment_failed":
        return t("notifications.subscriptionPaymentFailed");
      case "subscription_grace_expired":
        return t("notifications.subscriptionGraceExpired");
      case "subscription_welcome":
        return t("notifications.subscriptionWelcome", { plan: n.message ?? "Premium" });
      case "purchase":
      case "new_order":
        return t("notifications.orderUpdateTitle");
      case "order_confirmed":
      case "order_shipped":
      case "order_delivered":
      case "shipment_created":
      case "shipment_shipped":
      case "shipment_in_transit":
      case "shipment_out_for_delivery":
      case "shipment_delivered":
      case "shipment_exception":
      case "shipment_returned":
        return t("notifications.orderUpdateTitle");
      case "identity_verified":
      case "password_reset":
        return t("notifications.securityTitle");
      case "message":
        return t("notifications.messageTitle", { name: n.actorName });
      case "wallet_recharged":
      case "transfer_received":
      case "transfer_sent":
      case "payment_refunded":
        return t("notifications.walletTitle");
      default:
        return n.actorName || t("notifications.notifications");
    }
  };

  const notifPreview = (n: Notification): string => {
    if (n.type === "official_communication" || n.type === "admin_broadcast") {
      return n.message?.trim() || t("notifications.defaultNotif");
    }
    if (n.message?.trim() && [
      "shipment_created", "shipment_shipped", "shipment_in_transit", "shipment_out_for_delivery",
      "shipment_delivered", "shipment_exception", "shipment_returned", "card_refund",
      "transfer_received", "transfer_sent", "exchange_rate_changed", "new_listing",
    ].includes(n.type)) {
      if (n.type === "transfer_received") return t("notifications.transferReceivedDetail", { amount: n.message });
      if (n.type === "transfer_sent") return t("notifications.transferSentDetail", { detail: n.message });
      return n.message;
    }
    switch (n.type) {
      case "like": return t("notifications.liked");
      case "comment": return t("notifications.commented");
      case "share": return t("notifications.shared");
      case "comment_like": return t("notifications.commentLiked");
      case "message": return t("notifications.messageSent");
      case "offer_received": return t("notifications.offerReceived");
      case "offer_accepted": return t("notifications.offerAccepted");
      case "offer_rejected": return t("notifications.offerRejected");
      case "purchase":
      case "new_order": return t("notifications.purchased");
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
      case "wallet_recharged": return t("notifications.walletRecharged");
      case "payment_refunded": return t("notifications.paymentRefunded");
      case "identity_verified": return t("notifications.identityVerified");
      case "password_reset": return t("notifications.passwordReset");
      case "listing_approved":
      case "moderation_approved": return t("notifications.listingApproved");
      case "listing_rejected":
      case "moderation_rejected": return t("notifications.listingRejected");
      case "moderation_pending": return t("notifications.moderationPending");
      default: return n.listingTitle || t("notifications.defaultNotif");
    }
  };

  const openNotification = async (n: Notification) => {
    setOpen(false);
    if (!n.isRead) void markOneRead(n.id);
    navigate(resolveNotificationDestination(n));
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative h-11 w-11", light && "text-white hover:bg-white/10 hover:text-white")}
          data-testid="button-notifications"
          aria-label={t("notifications.notifications")}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(100vw-1.5rem,22rem)] p-0 overflow-hidden rounded-2xl shadow-xl border-border"
        sideOffset={8}
      >
        <div className="px-3.5 py-3 border-b border-border flex items-center justify-between gap-2">
          <h3 className="font-semibold text-sm text-foreground">{t("notifications.notifications")}</h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setOpen(false); navigate("/communications"); }}
              className="text-xs text-muted-foreground hover:text-foreground font-medium"
            >
              {t("notifications.historyLink")}
            </button>
            {notifications.some(n => !n.isRead) && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                {t("notifications.markAllRead")}
              </button>
            )}
          </div>
        </div>
        <div className="max-h-[min(70vh,24rem)] overflow-y-auto">
          {!loaded ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t("profile.loading")}</p>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t("notifications.noNotifications")}</p>
            </div>
          ) : (
            notifications.map(n => {
              const { Icon, tone } = notifVisual(n.type);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => void openNotification(n)}
                  className={cn(
                    "w-full flex items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-accent/60 min-h-[56px]",
                    !n.isRead && UNREAD_BG[tone],
                  )}
                  data-testid={`notification-${n.id}`}
                >
                  <span className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", TONE_CLASS[tone])}>
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
                      {notifTitle(n)}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {notifPreview(n)}
                    </span>
                    {n.type === "delivery_picked_up" && n.message && (() => {
                      const m = n.message.match(/kòd konfirmasyon ou:\s*(\d{4,8})/i) ?? n.message.match(/:\s*(\d{4,8})\./);
                      const code = m?.[1];
                      return code ? (
                        <span className="mt-1.5 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between gap-2">
                          <span className="text-[10px] text-muted-foreground">{t("notifications.confirmCode")}</span>
                          <span className="text-base font-black tracking-widest text-primary">{code}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(code).catch(() => {}); }}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(code).catch(() => {}); } }}
                            className="text-[10px] text-primary font-bold hover:underline shrink-0"
                          >{t("notifications.copy")}</span>
                        </span>
                      ) : null;
                    })()}
                    <span className="block text-[11px] text-muted-foreground mt-1">
                      {timeAgo(n.createdAt, t("notifications.justNow"))}
                    </span>
                  </span>
                  {!n.isRead ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 mt-2" aria-label={t("notifications.unread")} />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0 mt-1" aria-hidden />
                  )}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
