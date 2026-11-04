import React, { useState, useEffect, useCallback, Component, type ReactNode, lazy, Suspense } from "react";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  MessageCircle, ArrowLeft, Sun, Moon,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  useGetConversations,
  getGetMessagesQueryKey, getGetMessagesQueryOptions, getGetConversationsQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import { PageSkeleton } from "@/components/PageSkeleton";
import {
  type Conversation,
  type ChatTheme,
  THEME_KEY,
  T,
} from "./messages/chatTheme";

const MessageThread = lazy(() =>
  import("./messages/MessageThread").then((m) => ({ default: m.MessageThread }))
);

type Translate = (key: string, options?: Record<string, unknown>) => string;

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

    // Silent retry → spinner only
    if (this.state.isRetrying) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: this.props.pageBg }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid #3b82f6", borderTopColor: "transparent", animation: "eb-spin 0.8s linear infinite" }} />
        </div>
      );
    }

    // Final fail → friendly UI
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", padding: 32,
        background: this.props.pageBg, textAlign: "center", gap: 14,
      }}>
        <MessageCircle style={{ width: 44, height: 44, color: "#3b82f6", opacity: 0.7 }} />
        <p style={{ color: "#94a3b8", fontSize: 14, margin: 0, maxWidth: 240, lineHeight: 1.6 }}>
          There was a connection problem. Please try again.
        </p>
        <button
          onClick={() => this.setState({ hasError: false, retryCount: 0, isRetrying: false })}
          style={{
            background: "linear-gradient(135deg, #4f7cff, #3b82f6)",
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

  // Conversation previews were historically saved in the database as a
  // localized-looking string. Recognize the old variants so the interface
  // language controls the label without changing a user's message content.
  const voiceMatch = preview.match(/^(\S+)\s+(?:Mesaj vwa|Message vocal|Voice message)$/i);
  return voiceMatch ? `${voiceMatch[1]} ${t("messages.voiceMessage")}` : preview;
}

function ConvList({ convs, activeId, theme, onSelect }: {
  convs: Conversation[];
  activeId?: number;
  theme: (typeof T)[ChatTheme];
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
  const sortedConvs = [...convs].sort((a, b) => {
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
  if (convs.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, textAlign: "center", padding: "64px 16px", background: c.listBg }}>
      <MessageCircle style={{ width: 48, height: 48, color: c.emptyIcon, marginBottom: 12 }} />
      <p style={{ fontWeight: 600, color: c.listName, margin: 0 }}>{t("messages.noConversations")}</p>
      <p style={{ fontSize: 14, color: c.emptyText, marginTop: 4 }}>{t("messages.browseListings")}</p>
    </div>
  );
  return (
    <div
      className="conversation-list-scroll"
      style={{
        overflowY: "auto",
        overflowX: "hidden",
        flex: "1 1 0%",
        minHeight: 0,
        background: c.listBg,
        WebkitOverflowScrolling: "touch",
        touchAction: "pan-y",
        overscrollBehaviorY: "contain",
      }}
    >
      {sortedConvs.map(conv => (
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
            style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px",
            borderBottom: `1px solid ${c.listBorder}`,
            background: activeId === conv.id ? c.listItemActive : c.listBg,
            cursor: "pointer",
            transition: "background 80ms",
          }}>
            <div
              style={{ position: "relative", flexShrink: 0 }}
              onClick={e => { e.preventDefault(); e.stopPropagation(); window.location.href = `/profile/${conv.otherUserId}`; }}
            >
              <Avatar className="h-12 w-12" style={{ cursor: "pointer" }}>
                <AvatarImage src={conv.otherUserAvatar ?? undefined} className="object-cover" />
                <AvatarFallback style={{ background: "#2563EB", color: "#fff", fontWeight: 700, fontSize: 16 }}>
                  {(conv.otherUserName ?? "?")[0]?.toUpperCase() ?? "?"}
                </AvatarFallback>
              </Avatar>
              {conv.unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: -2, right: -2,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#2563EB", border: `2px solid ${c.listBg}`,
                }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginBottom: 2 }}>
                <span style={{
                  fontSize: 15, color: c.listName, fontWeight: conv.unreadCount > 0 ? 700 : 500,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {conv.otherUserName}
                </span>
                <span style={{ fontSize: 11, color: c.listTime, flexShrink: 0 }}>
                  {conv.lastMessageAt ? conversationTime(conv.lastMessageAt, i18n.language, t) : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
                <p style={{
                  fontSize: 13, color: conv.unreadCount > 0 ? c.listName : c.listSub,
                  fontWeight: conv.unreadCount > 0 ? 600 : 400,
                  margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {localizeConversationPreview(conv.lastMessage, conv.listingTitle, t)}
                </p>
                {conv.unreadCount > 0 && (
                  <Badge style={{ fontSize: 11, minWidth: 20, height: 20, padding: "0 6px", background: "#2563EB", flexShrink: 0 }}>
                    {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                  </Badge>
                )}
              </div>
            </div>
          </div>
      ))}
    </div>
  );
}

export default function Messages({ embedded = false, onClose, initialConversationId = null }: {
  embedded?: boolean;
  onClose?: () => void;
  initialConversationId?: number | null;
} = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const [, params] = useRoute("/messages/:id");
  const routeConvId = params?.id ? parseInt(params.id, 10) : null;
  const [embeddedConvId, setEmbeddedConvId] = useState<number | null>(initialConversationId);
  useEffect(() => {
    if (embedded) setEmbeddedConvId(initialConversationId);
  }, [embedded, initialConversationId]);
  const convId = embedded ? embeddedConvId : routeConvId;
  const queryClient = useQueryClient();
  const socket = useSocket();

  // Theme state — persisted to localStorage
  const [chatTheme, setChatTheme] = useState<ChatTheme>(() => {
    return (localStorage.getItem(THEME_KEY) as ChatTheme) ?? "sunlight";
  });
  const theme = T[chatTheme];

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
      // Socket invalidation is primary; HTTP poll is a safety net only.
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

  useEffect(() => { if (!authLoading && !user) setLocation("/auth/login"); }, [authLoading, user]);

  const c = theme;

  return (
    <div style={{ display: "flex", height: "100%", background: c.pageBg }} className="md:max-w-5xl md:mx-auto md:border-x md:border-border">

      {/* Conversation list */}
      <div
        style={{
          borderRight: `1px solid ${c.listBorder}`,
          flexDirection: "column", minHeight: 0, background: c.listBg,
        }}
        className={`w-full md:w-80 ${convId ? "hidden md:flex" : "flex"}`}
      >
        {/* List header */}
        <div style={{
          padding: "10px 12px 10px",
          borderBottom: `1px solid ${c.listBorder}`,
          background: c.headerBg, flexShrink: 0,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {/* Back button → home */}
          <button
            type="button"
            onClick={() => embedded ? onClose?.() : setLocation("/")}
            style={{
              width: 44, height: 44, borderRadius: "50%", background: "none",
              border: "none", display: "flex", alignItems: "center", justifyContent: "center",
              color: c.iconColor, cursor: "pointer", flexShrink: 0,
              touchAction: "manipulation", WebkitTapHighlightColor: "transparent",
              userSelect: "none",
            } as React.CSSProperties}
          >
            <ArrowLeft style={{ width: 20, height: 20 }} />
          </button>
          <h1 style={{ fontWeight: 700, color: c.nameColor, fontSize: 18, margin: 0, flex: 1 }}>
            {t("messages.title")}
          </h1>
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            style={{
              width: 34, height: 34, borderRadius: "50%",
              background: c.iconActiveBg, border: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0,
            }}
          >
            {chatTheme === "night"
              ? <Sun style={{ width: 16, height: 16, color: "#FCD34D" }} />
              : <Moon style={{ width: 16, height: 16, color: "#818CF8" }} />}
          </button>
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
              style={{ minHeight: 44, padding: "8px 20px", borderRadius: 8, color: c.nameColor, border: `1px solid ${c.listBorder}`, background: c.listBg }}
            >
              {t("messages.retry")}
            </button>
          </div>
        ) : (
          <ConvList
            convs={(convs as Conversation[]) ?? []}
            activeId={convId ?? undefined}
            theme={theme}
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
            <p style={{ fontSize: 18, fontWeight: 700, color: c.nameColor, margin: 0 }}>
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
