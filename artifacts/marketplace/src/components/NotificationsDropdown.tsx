import { useState, useEffect, useCallback } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import {
  formatNotificationMessage,
  getNotificationHref,
} from "@/lib/notificationNavigation";
import { publicDisplayName } from "@/lib/publicDisplayName";
import { cn } from "@/lib/utils";

interface Notification {
  id: number;
  type: string;
  isRead: boolean;
  listingId: number | null;
  commentId: number | null;
  referenceId?: number | null;
  actorId?: number | null;
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
    } catch {}
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
    } catch {}
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
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount(prev => Math.max(0, prev - 1));
    try {
      await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* local state already optimistic */ }
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
  };

  const onSelect = async (n: Notification) => {
    setOpen(false);
    if (!n.isRead) void markOneRead(n.id);
    const href = getNotificationHref(n);
    navigate(href);
  };

  const notifEmoji = (type: string): string => {
    switch (type) {
      case "like": return "❤️";
      case "comment": return "💬";
      case "comment_like": return "❤️";
      case "share": return "🔗";
      case "message": return "✉️";
      case "follow":
      case "new_follower": return "👤";
      case "offer_received":
      case "offer_accepted":
      case "offer_rejected":
      case "offer_counter": return "🏷️";
      case "purchase":
      case "new_order": return "🛒";
      case "order_confirmed": return "🧾";
      case "order_shipped": return "🚚";
      case "order_delivered": return "📦";
      case "order_cancelled": return "⛔";
      case "delivery_picked_up": return "🔐";
      case "delivery_pin": return "🔐";
      case "delivery_on_the_way": return "🛵";
      case "delivery_arrived":
      case "delivery_arrived_pickup": return "📍";
      case "delivery_delivered":
      case "delivery_completed": return "✅";
      case "delivery_paid": return "💰";
      case "driver_assigned": return "🚗";
      case "exchange_rate_changed": return "💱";
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
      default:
        if (type.startsWith("delivery_")) return "🛵";
        if (type.startsWith("driver_")) return "🚗";
        if (type.startsWith("support_")) return "🎧";
        return "🔔";
    }
  };

  if (!user) return null;

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative", light && "text-white hover:bg-white/10 hover:text-white")}
          data-testid="button-notifications"
        >
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
                onClick={() => { void onSelect(n); }}
                className={`flex items-start gap-2.5 px-3 py-2.5 hover:bg-accent transition-colors cursor-pointer ${!n.isRead ? "bg-primary/5" : ""}`}
                data-testid={`notification-${n.id}`}
                role="link"
              >
                  <div className="relative flex-shrink-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={n.actorAvatar ?? undefined} />
                      <AvatarFallback className="text-xs bg-primary text-primary-foreground font-bold">
                        {publicDisplayName(n.actorName, "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 text-sm leading-none">
                      {notifEmoji(n.type)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-foreground leading-snug">
                      {formatNotificationMessage(n, t)}
                    </p>
                    {(n.type === "delivery_picked_up" || n.type === "delivery_pin" || n.type === "driver_assigned") && n.message && (() => {
                      const m =
                        n.message.match(/kòd\s*pin\s*livrezon\s*ou:\s*(\d{4,8})/i) ??
                        n.message.match(/kòd\s*sekrè\s*ou:\s*(\d{4,8})/i) ??
                        n.message.match(/kòd\s*konfirmasyon\s*ou:\s*(\d{4,8})/i) ??
                        n.message.match(/:\s*(\d{4,8})(?:\n|\.|\s|$)/);
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
