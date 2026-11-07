import React, { useState, useEffect, useCallback, useMemo, Component, type ReactNode, lazy, Suspense } from "react";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  MessageCircle, ArrowLeft, Sun, Moon, Search, SlidersHorizontal,
  PenSquare, Mic, ShoppingBag,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  useGetConversations,
  getGetMessagesQueryKey, getGetMessagesQueryOptions, getGetConversationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import { useToast } from "@/hooks/use-toast";
import { PageSkeleton } from "@/components/PageSkeleton";
import {
  type Conversation,
  type ChatTheme,
  THEME_KEY,
  T,
  FLEXA,
} from "./messages/chatTheme";
import { publicDisplayName } from "@/lib/publicDisplayName";

const MessageThread = lazy(() =>
  import("./messages/MessageThread").then((m) => ({ default: m.MessageThread }))
);

type Translate = (key: string, options?: Record<string, unknown>) => string;
type InboxTab = "all" | "buyers" | "sellers" | "unread";
type SortMode = "latest" | "unread";

function dateParts(iso: string): { date: Date; dayDiff: number; ageMs: number } | null {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const messageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return {
    date,
    dayDiff: Math.max(0, Math.round((today - messageDay) / 86_400_000)),
    ageMs: Math.max(0, now.getTime() - date.getTime()),
  };
}

function localeFor(language: string): string {
  return language.toLowerCase().startsWith("ht") ? "fr-FR" : language;
}

function conversationTime(iso: string | null | undefined, language: string, t: Translate): string {
  if (!iso) return "";
  try {
    const parts = dateParts(iso);
    if (!parts) return "";
    const minutes = Math.floor(parts.ageMs / 60_000);
    if (minutes < 1) return t("messages.timeNow");
    if (parts.dayDiff === 0 && minutes < 60) return t("messages.timeMinutes", { n: minutes });
    if (parts.dayDiff === 0) return t("messages.timeHours", { n: Math.max(1, Math.floor(minutes / 60)) });
    if (parts.dayDiff === 1) return t("messages.timeYesterday");
    if (parts.dayDiff < 7) return t("messages.timeDays", { n: parts.dayDiff });
    return new Intl.DateTimeFormat(localeFor(language), { day: "2-digit", month: "short" }).format(parts.date);
  } catch { return ""; }
}

class ThreadBoundary extends Component<
  { children: ReactNode; convId: number; pageBg: string },
  { hasError: boolean; isRetrying: boolean; retryCount: number }
> {
  private _timer: ReturnType<typeof setTimeout> | null = null;
  constructor(props: { children: ReactNode; convId: number; pageBg: string }) {
    super(props);
    this.state = { hasError: false, isRetrying: false, retryCount: 0 };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() {
    const { retryCount } = this.state;
    if (retryCount < 3) {
      this.setState({ isRetrying: true });
      this._timer = setTimeout(() => {
        this.setState({ hasError: false, isRetrying: false, retryCount: retryCount + 1 });
      }, 1200);
    } else {
      this.setState({ isRetrying: false });
    }
  }
  componentDidUpdate(prev: { convId: number }) {
    if (prev.convId !== this.props.convId && this.state.hasError) {
      this.setState({ hasError: false, retryCount: 0, isRetrying: false });
    }
  }
  componentWillUnmount() { if (this._timer) clearTimeout(this._timer); }
  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.state.isRetrying) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: this.props.pageBg }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: `3px solid ${FLEXA.green}`, borderTopColor: "transparent", animation: "eb-spin 0.8s linear infinite" }} />
        </div>
      );
    }

    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", padding: 32,
        background: this.props.pageBg, textAlign: "center", gap: 14,
      }}>
        <MessageCircle style={{ width: 44, height: 44, color: FLEXA.green, opacity: 0.7 }} />
        <p style={{ color: "#64748B", fontSize: 14, margin: 0, maxWidth: 240, lineHeight: 1.6 }}>
          There was a connection problem. Please try again.
        </p>
        <button
          onClick={() => this.setState({ hasError: false, retryCount: 0, isRetrying: false })}
          style={{
            background: FLEXA.green,
            color: "#fff", border: "none", borderRadius: 10,
            padding: "10px 26px", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}

function localizeConversationPreview(
  preview: string | null | undefined,
  fallback: string,
  t: (key: string, options?: any) => string,
): string {
  if (!preview) return fallback;
  const voiceMatch = preview.match(/^(\S+)\s+(?:Mesaj vwa|Message vocal|Voice message)$/i);
  return voiceMatch ? `${voiceMatch[1]} ${t("messages.voiceMessage")}` : preview;
}

function isVoicePreview(preview: string | null | undefined): boolean {
  if (!preview) return false;
  return /Mesaj vwa|Message vocal|Voice message|🎤/i.test(preview);
}

function avatarHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hues = [152, 200, 24, 280, 340, 40];
  return `hsl(${hues[h % hues.length]} 48% 38%)`;
}

function ConvList({
  convs,
  activeId,
  theme,
  onlineMap,
  onSelect,
}: {
  convs: Conversation[];
  activeId?: number;
  theme: (typeof T)[ChatTheme];
  onlineMap: Record<number, boolean>;
  onSelect?: (conversationId: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const c = theme;
  const prefetchMessages = (conversationId: number) => {
    void queryClient.prefetchQuery(getGetMessagesQueryOptions(conversationId, {
      query: { queryKey: getGetMessagesQueryKey(conversationId), staleTime: 15_000 },
      request: { timeoutMs: 6_000 },
    }));
  };

  if (convs.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "64px 16px", background: c.listBg }}>
        <MessageCircle style={{ width: 48, height: 48, color: c.emptyIcon, marginBottom: 12 }} />
        <p style={{ fontWeight: 600, color: c.listName, margin: 0 }}>{t("messages.noConversations")}</p>
        <p style={{ fontSize: 14, color: c.emptyText, marginTop: 4 }}>{t("messages.browseListings")}</p>
        <button
          type="button"
          onClick={() => setLocation("/search")}
          style={{
            marginTop: 16, minHeight: 44, padding: "10px 20px", borderRadius: 12,
            background: FLEXA.green, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer",
          }}
        >
          {t("messages.browseListingsCta", { defaultValue: "Browse listings" })}
        </button>
      </div>
    );
  }

  return (
    <div
      className="conversation-list-scroll messages-inbox-list"
      style={{
        overflowY: "auto",
        overflowX: "hidden",
        flex: "1 1 0%",
        minHeight: 0,
        background: c.listBg,
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        overscrollBehaviorY: "contain",
        /* Clear fixed mobile bottom nav without wasting space on desktop */
        paddingBottom: "max(8px, calc(56px + env(safe-area-inset-bottom, 0px)))",
      }}
    >
      {convs.map(conv => {
        const unread = conv.unreadCount > 0;
        const isSystem = conv.conversationType === "system_notifications";
        const online = !isSystem && !!onlineMap[conv.otherUserId];
        const preview = localizeConversationPreview(conv.lastMessage, conv.listingTitle, t);
        const voice = isVoicePreview(conv.lastMessage);
        const hasProduct = !isSystem && !!conv.listingId && !!conv.listingTitle;
        return (
          <div
            key={conv.id}
            role="link"
            tabIndex={0}
            onClick={() => onSelect ? onSelect(conv.id) : setLocation(`/messages/${conv.id}`)}
            onKeyDown={event => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect ? onSelect(conv.id) : setLocation(`/messages/${conv.id}`);
              }
            }}
            onPointerDown={() => prefetchMessages(conv.id)}
            onMouseEnter={() => prefetchMessages(conv.id)}
            className="messages-inbox-row"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              /* Compact row: ~76px without product, ~92px with product */
              minHeight: hasProduct ? 88 : 76,
              maxHeight: hasProduct ? 100 : 88,
              padding: "8px 12px",
              borderBottom: `1px solid ${c.listBorder}`,
              background: activeId === conv.id
                ? c.listItemActive
                : isSystem
                  ? "rgba(4, 77, 44, 0.08)"
                  : unread
                    ? "rgba(4, 77, 44, 0.04)"
                    : c.listBg,
              cursor: "pointer",
              transition: "background 80ms",
            }}
          >
            <div
              style={{ position: "relative", flexShrink: 0 }}
              onClick={e => {
                if (isSystem) return;
                e.preventDefault();
                e.stopPropagation();
                setLocation(`/profile/${conv.otherUserId}`);
              }}
            >
              <Avatar className="h-10 w-10" style={{ cursor: isSystem ? "default" : "pointer" }}>
                <AvatarImage src={conv.otherUserAvatar ?? undefined} className="object-cover" />
                <AvatarFallback style={{
                  background: isSystem ? FLEXA.green : avatarHue(publicDisplayName(conv.otherUserName, "?")),
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 14,
                }}>
                  {isSystem ? "F" : (publicDisplayName(conv.otherUserName, "?").charAt(0).toUpperCase() || "?")}
                </AvatarFallback>
              </Avatar>
              {online && (
                <span style={{
                  position: "absolute", right: -1, bottom: -1,
                  width: 10, height: 10, borderRadius: "50%",
                  background: "#22C55E",
                  border: `2px solid ${c.listBg}`,
                }} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{
                  fontSize: 14, color: c.listName, fontWeight: unread || isSystem ? 700 : 600,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0,
                }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {isSystem
                      ? "System Notifications"
                      : publicDisplayName(conv.otherUserName, t("common.user", { defaultValue: "User" }))}
                  </span>
                  {(isSystem || conv.otherUserIsVerified) && (
                    <span
                      title={isSystem
                        ? "Official Flexa Market"
                        : t("messages.certifiedSeller", { defaultValue: "Verified seller" })}
                      style={{
                        width: 13, height: 13, borderRadius: "50%",
                        background: "#16A34A", color: "#fff",
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        fontSize: 8, fontWeight: 800, flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: c.listTime, flexShrink: 0, lineHeight: 1.2 }}>
                  {conv.lastMessageAt ? conversationTime(conv.lastMessageAt, i18n.language, t) : ""}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <p style={{
                  fontSize: 13,
                  lineHeight: 1.25,
                  color: unread ? c.listName : c.listSub,
                  fontWeight: unread ? 600 : 400,
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  minWidth: 0,
                }}>
                  {voice && <Mic style={{ width: 12, height: 12, flexShrink: 0, color: FLEXA.orange }} />}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{preview}</span>
                </p>
                {unread && (
                  <span style={{
                    width: isSystem ? 10 : undefined,
                    minWidth: isSystem ? 10 : 18,
                    height: isSystem ? 10 : 18,
                    padding: isSystem ? 0 : "0 5px",
                    borderRadius: 999,
                    background: isSystem ? "#16A34A" : "#EF4444",
                    color: "#fff",
                    fontSize: 10, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {isSystem ? null : (conv.unreadCount > 99 ? "99+" : conv.unreadCount)}
                  </span>
                )}
              </div>

              {hasProduct && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  maxWidth: "100%", fontSize: 11, lineHeight: 1.2,
                  color: FLEXA.greenMid, fontWeight: 600,
                }}>
                  <ShoppingBag style={{ width: 10, height: 10, flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {conv.listingTitle}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Messages({ embedded = false, onClose, initialConversationId = null }: {
  embedded?: boolean;
  onClose?: () => void;
  initialConversationId?: number | null;
} = {}) {
  const { user, token, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, params] = useRoute("/messages/:id");
  const routeConvId = params?.id ? parseInt(params.id, 10) : null;
  const [embeddedConvId, setEmbeddedConvId] = useState<number | null>(initialConversationId);
  useEffect(() => {
    if (embedded) setEmbeddedConvId(initialConversationId);
  }, [embedded, initialConversationId]);
  const convId = embedded ? embeddedConvId : routeConvId;
  const queryClient = useQueryClient();
  const socket = useSocket();

  const [chatTheme, setChatTheme] = useState<ChatTheme>(() => {
    return (localStorage.getItem(THEME_KEY) as ChatTheme) ?? "sunlight";
  });
  const theme = T[chatTheme];

  const [searchQuery, setSearchQuery] = useState("");
  const [inboxTab, setInboxTab] = useState<InboxTab>("all");
  const [sortMode, setSortMode] = useState<SortMode>("latest");
  const [showFilter, setShowFilter] = useState(false);
  const [onlineMap, setOnlineMap] = useState<Record<number, boolean>>({});

  const toggleTheme = useCallback(() => {
    setChatTheme(prev => {
      const next: ChatTheme = prev === "sunlight" ? "night" : "sunlight";
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  const {
    data: convs,
    isPending: conversationsPending,
    isError: conversationsError,
    refetch: refetchConversations,
  } = useGetConversations({
    query: {
      enabled: !!user && !authLoading,
      queryKey: getGetConversationsQueryKey(),
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnMount: true,
      refetchOnWindowFocus: true,
      retry: 0,
    },
    request: { timeoutMs: 6_000 },
  });

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
        if (convId) queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(convId) });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient, convId]);

  useEffect(() => {
    return socket.onNewMessage(() => {
      queryClient.invalidateQueries({ queryKey: getGetConversationsQueryKey() });
    });
  }, [socket, queryClient]);

  useEffect(() => {
    if (authLoading || user) return;
    // Soft-gate: keep next so login returns to inbox / deep-linked thread
    const next = window.location.pathname + window.location.search;
    setLocation(`/auth/login?next=${encodeURIComponent(next.startsWith("/") ? next : "/messages")}`);
  }, [authLoading, user, setLocation]);

  const allConvs = (convs as Conversation[] | undefined) ?? [];

  // Real presence dots for inbox — only when the presence API responds.
  useEffect(() => {
    if (!token || allConvs.length === 0) return;
    let cancelled = false;
    const ids = Array.from(new Set(allConvs.map(c => c.otherUserId))).slice(0, 40);
    (async () => {
      const entries = await Promise.all(ids.map(async (id) => {
        try {
          const res = await fetch(`/api/users/${id}/presence`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return [id, false] as const;
          const data = await res.json() as { isOnline?: boolean };
          return [id, !!data.isOnline] as const;
        } catch {
          return [id, false] as const;
        }
      }));
      if (cancelled) return;
      const next: Record<number, boolean> = {};
      for (const [id, online] of entries) next[id] = online;
      setOnlineMap(next);
    })();
    return () => { cancelled = true; };
  }, [token, allConvs.map(c => c.otherUserId).join(",")]);

  const tabCounts = useMemo(() => {
    const buyers = allConvs.filter(c => c.myRole === "seller").length;
    const sellers = allConvs.filter(c => c.myRole === "buyer").length;
    const unread = allConvs.filter(c => c.unreadCount > 0).length;
    return { all: allConvs.length, buyers, sellers, unread };
  }, [allConvs]);

  const filteredConvs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = allConvs.filter(conv => {
      if (inboxTab === "buyers" && conv.myRole !== "seller") return false;
      if (inboxTab === "sellers" && conv.myRole !== "buyer") return false;
      if (inboxTab === "unread" && !(conv.unreadCount > 0)) return false;
      if (!q) return true;
      const hay = [
        conv.otherUserName,
        conv.listingTitle,
        conv.lastMessage ?? "",
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });

    list = [...list].sort((a, b) => {
      if (sortMode === "unread") {
        if ((b.unreadCount > 0) !== (a.unreadCount > 0)) {
          return (b.unreadCount > 0 ? 1 : 0) - (a.unreadCount > 0 ? 1 : 0);
        }
      }
      const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return bTime - aTime;
    });
    return list;
  }, [allConvs, searchQuery, inboxTab, sortMode]);

  const c = theme;

  const startNewMessage = () => {
    toast({
      title: t("messages.newMessageHintTitle", { defaultValue: "Start a conversation" }),
      description: t("messages.newMessageHintBody", {
        defaultValue: "Open a listing and tap Message seller to start chatting.",
      }),
    });
    setLocation("/search");
  };

  const tabs: { id: InboxTab; label: string; count: number; badge?: boolean }[] = [
    { id: "all", label: t("messages.tabAll", { defaultValue: "All" }), count: tabCounts.all },
    { id: "buyers", label: t("messages.tabBuyers", { defaultValue: "Buyers" }), count: tabCounts.buyers },
    { id: "sellers", label: t("messages.tabSellers", { defaultValue: "Sellers" }), count: tabCounts.sellers },
    { id: "unread", label: t("messages.tabUnread", { defaultValue: "Unread" }), count: tabCounts.unread, badge: tabCounts.unread > 0 },
  ];

  return (
    <div
      style={{ display: "flex", height: "100%", minHeight: 0, background: c.pageBg }}
      className="messages-inbox-root md:max-w-5xl md:mx-auto md:border-x md:border-border"
    >

      {/* Conversation list */}
      <div
        style={{
          borderRight: `1px solid ${c.listBorder}`,
          flexDirection: "column", minHeight: 0, background: c.listBg,
          flex: "1 1 auto",
        }}
        className={`w-full md:w-[360px] lg:w-[380px] ${convId ? "hidden md:flex" : "flex"}`}
      >
        {/* Compact toolbar — single 48px row, no subtitle */}
        <div
          className="messages-inbox-toolbar"
          style={{
            height: 48,
            padding: "0 10px",
            background: c.listBg,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: `1px solid ${c.listBorder}`,
          }}
        >
          <button
            type="button"
            onClick={() => embedded ? onClose?.() : setLocation("/")}
            aria-label={t("messages.back")}
            style={{
              width: 36, height: 36, borderRadius: 10, background: "none",
              border: `1px solid ${c.listBorder}`, display: "flex", alignItems: "center", justifyContent: "center",
              color: FLEXA.green, cursor: "pointer", flexShrink: 0,
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
            } as React.CSSProperties}
          >
            <ArrowLeft style={{ width: 17, height: 17 }} />
          </button>

          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
            <MessageCircle style={{ width: 18, height: 18, color: FLEXA.green, flexShrink: 0 }} />
            <h1 style={{
              fontWeight: 800, color: c.listName, fontSize: 17, margin: 0,
              letterSpacing: "-0.02em", lineHeight: 1.2,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {t("messages.title")}
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={chatTheme === "night" ? t("messages.sunlightMode") : t("messages.nightMode")}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: c.listBg, border: `1px solid ${c.listBorder}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {chatTheme === "night"
                ? <Sun style={{ width: 15, height: 15, color: "#FCD34D" }} />
                : <Moon style={{ width: 15, height: 15, color: FLEXA.green }} />}
            </button>
            <button
              type="button"
              onClick={startNewMessage}
              aria-label={t("messages.newMessage", { defaultValue: "New message" })}
              style={{
                width: 36, height: 36, borderRadius: 10,
                background: FLEXA.green, border: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#fff",
              }}
            >
              <PenSquare style={{ width: 15, height: 15 }} />
            </button>
          </div>
        </div>

        {/* Compact search + sort */}
        <div style={{ padding: "6px 10px 4px", flexShrink: 0, position: "relative" }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{
              flex: 1, display: "flex", alignItems: "center", gap: 6,
              height: 36, padding: "0 10px",
              borderRadius: 10, border: `1px solid ${c.listBorder}`,
              background: c.pageBg,
            }}>
              <Search style={{ width: 14, height: 14, color: c.listTime, flexShrink: 0 }} />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("messages.searchPlaceholder", { defaultValue: "Search a conversation..." })}
                style={{
                  flex: 1, minWidth: 0, border: "none", outline: "none",
                  background: "transparent", fontSize: 13, color: c.listName,
                  height: 34,
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowFilter(v => !v)}
              aria-expanded={showFilter}
              aria-label={t("messages.filter", { defaultValue: "Filter" })}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                border: `1px solid ${showFilter ? FLEXA.green : c.listBorder}`,
                background: showFilter ? "rgba(4,77,44,0.08)" : c.listBg,
                color: FLEXA.green, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <SlidersHorizontal style={{ width: 15, height: 15 }} />
            </button>
          </div>

          {showFilter && (
            <div
              role="menu"
              style={{
                position: "absolute", right: 10, top: 44, zIndex: 20,
                width: 220, borderRadius: 12,
                border: `1px solid ${c.listBorder}`, background: c.listBg,
                boxShadow: "0 10px 30px rgba(15,23,42,0.12)",
                padding: 6,
              }}
            >
              {([
                ["latest", t("messages.sortLatest", { defaultValue: "Latest activity" })],
                ["unread", t("messages.sortUnreadFirst", { defaultValue: "Unread first" })],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitem"
                  onClick={() => { setSortMode(mode); setShowFilter(false); }}
                  style={{
                    width: "100%", textAlign: "left", padding: "9px 11px",
                    borderRadius: 8, border: "none", cursor: "pointer",
                    background: sortMode === mode ? "rgba(4,77,44,0.08)" : "transparent",
                    color: c.listName, fontWeight: sortMode === mode ? 700 : 500, fontSize: 13,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters — single non-wrapping horizontal scroll row */}
        <div
          className="messages-inbox-tabs"
          style={{
            display: "flex",
            flexWrap: "nowrap",
            gap: 6,
            padding: "4px 10px 8px",
            overflowX: "auto",
            overflowY: "hidden",
            flexShrink: 0,
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {tabs.map(tab => {
            const active = inboxTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setInboxTab(tab.id)}
                style={{
                  flexShrink: 0,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  height: 30,
                  padding: "0 11px",
                  borderRadius: 999,
                  border: active ? "none" : `1px solid ${c.listBorder}`,
                  background: active ? FLEXA.green : c.listBg,
                  color: active ? "#fff" : c.listName,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                <span>{tab.label}</span>
                {tab.id !== "unread" && (
                  <span style={{ opacity: active ? 0.85 : 0.55, fontWeight: 600 }}>
                    ({tab.count})
                  </span>
                )}
                {tab.id === "unread" && tab.badge && (
                  <span style={{
                    minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
                    background: "#EF4444", color: "#fff",
                    fontSize: 10, fontWeight: 800,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {tab.count > 99 ? "99+" : tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {(!user || authLoading || (conversationsPending && !convs)) ? (
          <div role="status" style={{ padding: "64px 16px", textAlign: "center", color: c.emptyText }}>
            {t("messages.loading")}
          </div>
        ) : conversationsError && !convs ? (
          <div role="alert" style={{ padding: "64px 16px", textAlign: "center", color: c.emptyText }}>
            <p>{t("messages.connectionProblem")}</p>
            <button
              type="button"
              onClick={() => void refetchConversations()}
              style={{ minHeight: 44, padding: "8px 20px", borderRadius: 8, color: c.listName, border: `1px solid ${c.listBorder}`, background: c.listBg }}
            >
              {t("messages.retry")}
            </button>
          </div>
        ) : (
          <ConvList
            convs={filteredConvs}
            activeId={convId ?? undefined}
            theme={theme}
            onlineMap={onlineMap}
            onSelect={embedded ? setEmbeddedConvId : undefined}
          />
        )}
      </div>

      {/* Thread pane */}
      <div
        style={{ flex: 1, flexDirection: "column", minHeight: 0 }}
        className={convId ? "flex" : "hidden md:flex"}
      >
        {convId ? (
          <ThreadBoundary convId={convId} pageBg={theme.pageBg}>
            <Suspense fallback={<PageSkeleton />}>
              <MessageThread
                convId={convId}
                theme={theme}
                onToggleTheme={toggleTheme}
                onBack={embedded ? () => setEmbeddedConvId(null) : undefined}
              />
            </Suspense>
          </ThreadBoundary>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "100%", textAlign: "center",
            padding: "0 32px", background: c.pageBg,
          }}>
            <MessageCircle style={{ width: 64, height: 64, color: c.emptyIcon, marginBottom: 16 }} />
            <p style={{ fontSize: 18, fontWeight: 700, color: c.listName, margin: 0 }}>
              {t("messages.selectConversation")}
            </p>
            <p style={{ fontSize: 14, color: c.emptyText, marginTop: 6 }}>
              {t("messages.chooseConversation")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
