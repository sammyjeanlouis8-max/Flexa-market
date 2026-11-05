import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  Headphones,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Star,
  Unlock,
  UserPlus,
  Users,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/useSocket";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_FLAGS } from "@/lib/countries";

type SupportThread = {
  id: number;
  subject: string;
  status: "open" | "closed";
  priority?: "normal" | "high" | "urgent";
  userId: number;
  userName: string;
  userAvatar: string | null;
  country: string | null;
  assignedAdminId: number | null;
  assignedAdminName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadByAdmin: number;
  rating?: number | null;
  createdAt: string;
};

type SupportMessage = {
  id: number;
  threadId?: number;
  content: string;
  isAdminReply: boolean;
  isInternal?: boolean;
  senderRole: string;
  senderId: number;
  senderName: string;
  senderAvatar: string | null;
  isRead: boolean;
  createdAt: string;
  clientMessageId?: string | null;
};

type ThreadDetail = SupportThread & { messages: SupportMessage[] };

type InboxFilter = "all" | "unassigned" | "mine" | "waiting" | "active" | "resolved";

function authFetch(path: string, method = "GET", body?: object) {
  const token = localStorage.getItem("flexamarket_token");
  return fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as any).error ?? "Request failed");
    }
    return res.json();
  });
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function newClientMsgId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function AdminLiveSupport() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const socket = useSocket();
  const search = useSearch();
  const initialThread = Number(new URLSearchParams(search).get("thread") || "") || null;

  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<number | null>(initialThread);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [q, setQ] = useState("");
  const [reply, setReply] = useState("");
  const [internalMode, setInternalMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobilePane, setMobilePane] = useState<"inbox" | "chat" | "profile">("inbox");
  const [typingName, setTypingName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickBottom = useRef(true);

  const loadThreads = useCallback(async () => {
    try {
      const params = new URLSearchParams({ all: "1", status: inboxFilter === "resolved" ? "closed" : "open" });
      if (inboxFilter === "all") params.set("status", "all");
      if (q.trim()) params.set("q", q.trim());
      const data: SupportThread[] = await authFetch(`/api/support/threads?${params}`);
      setThreads(data ?? []);
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [inboxFilter, q, toast, t]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const data: ThreadDetail = await authFetch(`/api/support/threads/${id}`);
      setDetail(data);
      setActiveId(id);
      setThreads((prev) => prev.map((th) => (th.id === id ? { ...th, unreadByAdmin: 0 } : th)));
      setMobilePane("chat");
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    }
  }, [toast, t]);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (initialThread) loadDetail(initialThread);
  }, [initialThread, loadDetail]);

  // Admin inbox realtime fan-out
  useEffect(() => {
    socket.joinSupportAdmin();
    const unsubNew = socket.onNewSupportThread(() => {
      loadThreads();
      toast({
        title: t("liveSupport.newTicket", { defaultValue: "New support request" }),
      });
    });
    const unsubMsg = socket.onSupportMessage((msg: SupportMessage) => {
      setThreads((prev) =>
        prev.map((th) =>
          th.id === msg.threadId
            ? {
                ...th,
                lastMessage: msg.isInternal ? th.lastMessage : msg.content,
                lastMessageAt: msg.createdAt,
                unreadByAdmin:
                  !msg.isAdminReply && msg.threadId !== activeId
                    ? th.unreadByAdmin + 1
                    : th.unreadByAdmin,
              }
            : th,
        ),
      );
      if (msg.threadId === activeId) {
        setDetail((prev) => {
          if (!prev) return prev;
          if (prev.messages.some((m) => m.id === msg.id)) return prev;
          return { ...prev, messages: [...prev.messages, msg] };
        });
      }
    });
    const unsubUpd = socket.onSupportUpdate((data: any) => {
      loadThreads();
      if (data?.threadId === activeId) {
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                status: data.status ?? prev.status,
                priority: data.priority ?? prev.priority,
                assignedAdminId:
                  data.assignedAdminId !== undefined ? data.assignedAdminId : prev.assignedAdminId,
                assignedAdminName:
                  data.assignedAdminName !== undefined
                    ? data.assignedAdminName
                    : prev.assignedAdminName,
                rating: data.rating ?? prev.rating,
              }
            : prev,
        );
      }
    });
    return () => {
      socket.leaveSupportAdmin();
      unsubNew?.();
      unsubMsg?.();
      unsubUpd?.();
    };
  }, [socket, loadThreads, activeId, toast, t]);

  useEffect(() => {
    if (!activeId) return;
    socket.joinSupport(activeId);
    const unsubTyping = socket.onSupportTyping(({ threadId, userId, userName }) => {
      if (threadId !== activeId || userId === user?.id) return;
      setTypingName(userName);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTypingName(null), 3000);
    });
    const unsubStop = socket.onSupportStopTyping(({ threadId, userId }) => {
      if (threadId !== activeId || userId === user?.id) return;
      setTypingName(null);
    });
    return () => {
      socket.leaveSupport(activeId);
      unsubTyping?.();
      unsubStop?.();
    };
  }, [activeId, socket, user?.id]);

  useEffect(() => {
    if (stickBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [detail?.messages.length, typingName]);

  const filtered = useMemo(() => {
    let list = threads;
    if (inboxFilter === "unassigned") list = list.filter((th) => !th.assignedAdminId && th.status === "open");
    else if (inboxFilter === "mine") list = list.filter((th) => th.assignedAdminId === user?.id);
    else if (inboxFilter === "waiting") list = list.filter((th) => th.status === "open" && th.unreadByAdmin > 0);
    else if (inboxFilter === "active") list = list.filter((th) => th.status === "open" && !!th.assignedAdminId);
    else if (inboxFilter === "resolved") list = list.filter((th) => th.status === "closed");
    return list;
  }, [threads, inboxFilter, user?.id]);

  const claim = async () => {
    if (!activeId) return;
    try {
      await authFetch(`/api/support/threads/${activeId}/claim`, "POST");
      await loadDetail(activeId);
      loadThreads();
      toast({ title: t("liveSupport.claimed", { defaultValue: "Conversation claimed" }) });
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    }
  };

  const release = async () => {
    if (!activeId) return;
    try {
      await authFetch(`/api/support/threads/${activeId}/release`, "POST");
      await loadDetail(activeId);
      loadThreads();
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    }
  };

  const resolve = async () => {
    if (!activeId) return;
    try {
      await authFetch(`/api/support/threads/${activeId}/close`, "POST");
      await loadDetail(activeId);
      loadThreads();
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    }
  };

  const reopen = async () => {
    if (!activeId) return;
    try {
      await authFetch(`/api/support/threads/${activeId}/reopen`, "POST");
      await loadDetail(activeId);
      loadThreads();
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    }
  };

  const setPriority = async (priority: string) => {
    if (!activeId) return;
    try {
      await authFetch(`/api/support/threads/${activeId}/priority`, "POST", { priority });
      setDetail((prev) => (prev ? { ...prev, priority: priority as any } : prev));
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    }
  };

  const send = async () => {
    if (!activeId || !reply.trim() || sending) return;
    setSending(true);
    if (myTypingTimer.current) clearTimeout(myTypingTimer.current);
    socket.emitSupportStopTyping(activeId, user!.id);
    const clientMessageId = newClientMsgId();
    try {
      const msg: SupportMessage = await authFetch(`/api/support/threads/${activeId}/messages`, "POST", {
        content: reply.trim(),
        isInternal: internalMode,
        clientMessageId,
      });
      setReply("");
      setDetail((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      stickBottom.current = true;
    } catch (e: any) {
      toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const onComposerChange = (value: string) => {
    setReply(value);
    if (!activeId || !user) return;
    socket.emitSupportTyping(activeId, user.id, user.name ?? "Agent");
    if (myTypingTimer.current) clearTimeout(myTypingTimer.current);
    myTypingTimer.current = setTimeout(() => socket.emitSupportStopTyping(activeId, user.id), 2000);
  };

  const filters: { id: InboxFilter; label: string }[] = [
    { id: "all", label: t("liveSupport.filterAll", { defaultValue: "All" }) },
    { id: "unassigned", label: t("liveSupport.filterUnassigned", { defaultValue: "Unassigned" }) },
    { id: "mine", label: t("liveSupport.filterMine", { defaultValue: "Mine" }) },
    { id: "waiting", label: t("liveSupport.filterWaiting", { defaultValue: "Waiting" }) },
    { id: "active", label: t("liveSupport.filterActive", { defaultValue: "Active" }) },
    { id: "resolved", label: t("liveSupport.filterResolved", { defaultValue: "Resolved" }) },
  ];

  const inbox = (
    <div className="flex h-full min-h-0 flex-col border-r bg-card">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold tracking-tight">
            {t("liveSupport.inbox", { defaultValue: "Live inbox" })}
          </h2>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={loadThreads} aria-label="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder={t("liveSupport.search", { defaultValue: "Search…" })}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setInboxFilter(f.id)}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-wide",
                inboxFilter === f.id
                  ? "bg-[var(--flexa-green)] text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t("liveSupport.empty", { defaultValue: "No conversations" })}</p>
          </div>
        ) : (
          filtered.map((th) => (
            <button
              key={th.id}
              type="button"
              onClick={() => loadDetail(th.id)}
              className={cn(
                "flex w-full gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                activeId === th.id && "bg-[var(--flexa-green-soft)]",
              )}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={th.userAvatar ?? undefined} />
                <AvatarFallback className="text-xs">{th.userName?.[0] ?? "?"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="truncate text-xs font-semibold">{th.userName}</span>
                  {th.country && <span className="text-[10px]">{COUNTRY_FLAGS[th.country] ?? ""}</span>}
                  {th.priority === "urgent" && (
                    <Badge className="h-4 bg-red-600 px-1 text-[9px] hover:bg-red-600">URGENT</Badge>
                  )}
                  {th.priority === "high" && (
                    <Badge className="h-4 bg-orange-500 px-1 text-[9px] hover:bg-orange-500">HIGH</Badge>
                  )}
                  {th.unreadByAdmin > 0 && (
                    <Badge className="ml-auto h-4 bg-red-600 px-1 text-[9px] hover:bg-red-600">
                      {th.unreadByAdmin}
                    </Badge>
                  )}
                </div>
                <p className="truncate text-sm font-medium">{th.subject}</p>
                <div className="flex items-center justify-between gap-1">
                  <p className="truncate text-[11px] text-muted-foreground">{th.lastMessage ?? "—"}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {th.lastMessageAt ? formatTime(th.lastMessageAt) : ""}
                  </span>
                </div>
                {!th.assignedAdminId && th.status === "open" && (
                  <span className="text-[10px] font-medium text-amber-600">
                    {t("liveSupport.waitingAgent", { defaultValue: "Waiting for agent" })}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );

  const chat = (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {!detail ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Headphones className="h-10 w-10 opacity-30" />
          <p className="text-sm">{t("liveSupport.pick", { defaultValue: "Select a conversation" })}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 lg:hidden"
              onClick={() => setMobilePane("inbox")}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{detail.subject}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {detail.userName}
                {detail.assignedAdminName
                  ? ` · ${t("liveSupport.assignedTo", { defaultValue: "Assigned" })}: ${detail.assignedAdminName}`
                  : ` · ${t("liveSupport.unassigned", { defaultValue: "Unassigned" })}`}
                {detail.status === "closed" ? " · Resolved" : ""}
              </p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs lg:hidden" onClick={() => setMobilePane("profile")}>
              <Users className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div
            className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3"
            onScroll={(e) => {
              const el = e.currentTarget;
              stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
          >
            {detail.messages.map((m) => {
              const isBot = m.senderRole === "bot";
              const isMine = m.isAdminReply && !m.isInternal;
              const isNote = !!m.isInternal;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex",
                    isNote ? "justify-center" : isMine ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      isNote && "border border-dashed border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                      !isNote && isMine && "rounded-br-md bg-[var(--flexa-green)] text-white",
                      !isNote && !isMine && isBot && "rounded-bl-md border bg-muted/60",
                      !isNote && !isMine && !isBot && "rounded-bl-md border bg-card",
                    )}
                  >
                    <div className="mb-0.5 flex items-center gap-1 text-[10px] opacity-70">
                      {isBot && <Bot className="h-3 w-3" />}
                      {isNote
                        ? t("liveSupport.internalNote", { defaultValue: "Internal note" })
                        : m.senderName}
                      <span>· {formatTime(m.createdAt)}</span>
                    </div>
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  </div>
                </div>
              );
            })}
            {typingName && (
              <p className="px-1 text-xs text-muted-foreground animate-pulse">
                {typingName} {t("liveSupport.typing", { defaultValue: "is typing…" })}
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          {detail.status === "open" ? (
            <div className="border-t bg-card p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <div className="mb-1.5 flex flex-wrap gap-1">
                {!detail.assignedAdminId && (
                  <Button size="sm" className="h-7 gap-1 text-xs" onClick={claim}>
                    <UserPlus className="h-3.5 w-3.5" />
                    {t("liveSupport.claim", { defaultValue: "Claim" })}
                  </Button>
                )}
                {detail.assignedAdminId === user?.id && (
                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={release}>
                    <Unlock className="h-3.5 w-3.5" />
                    {t("liveSupport.release", { defaultValue: "Release" })}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={resolve}>
                  <Lock className="h-3.5 w-3.5" />
                  {t("liveSupport.resolve", { defaultValue: "Resolve" })}
                </Button>
                <Button
                  size="sm"
                  variant={internalMode ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setInternalMode((v) => !v)}
                >
                  {t("liveSupport.noteMode", { defaultValue: "Note" })}
                </Button>
              </div>
              <div className="flex gap-2">
                <Textarea
                  rows={2}
                  className="min-h-[44px] resize-none text-sm"
                  placeholder={
                    internalMode
                      ? t("liveSupport.notePlaceholder", { defaultValue: "Internal note (agents only)…" })
                      : t("liveSupport.replyPlaceholder", { defaultValue: "Reply to customer…" })
                  }
                  value={reply}
                  onChange={(e) => onComposerChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button
                  className="h-auto shrink-0 bg-[var(--flexa-orange)] hover:bg-[var(--flexa-orange-deep)]"
                  disabled={sending || !reply.trim()}
                  onClick={() => void send()}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 border-t p-3">
              <p className="text-xs text-muted-foreground">
                {t("liveSupport.resolved", { defaultValue: "Conversation resolved" })}
                {detail.rating ? ` · ★ ${detail.rating}/5` : ""}
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reopen}>
                {t("liveSupport.reopen", { defaultValue: "Reopen" })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const profile = detail ? (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto border-l bg-card p-3">
      <Button
        size="sm"
        variant="ghost"
        className="mb-2 h-8 justify-start gap-1 lg:hidden"
        onClick={() => setMobilePane("chat")}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("liveSupport.backChat", { defaultValue: "Back to chat" })}
      </Button>
      <div className="flex flex-col items-center gap-2 pb-4 text-center">
        <Avatar className="h-16 w-16">
          <AvatarImage src={detail.userAvatar ?? undefined} />
          <AvatarFallback>{detail.userName?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-bold">{detail.userName}</p>
          <p className="text-xs text-muted-foreground">
            {detail.country ? `${COUNTRY_FLAGS[detail.country] ?? ""} ${detail.country}` : "—"}
          </p>
        </div>
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <Link href={`/admin/users?search=${encodeURIComponent(detail.userName)}`}>
            {t("liveSupport.viewAccount", { defaultValue: "View account" })}
          </Link>
        </Button>
      </div>
      <div className="space-y-3 text-sm">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("liveSupport.priority", { defaultValue: "Priority" })}
          </p>
          <Select value={detail.priority ?? "normal"} onValueChange={setPriority}>
            <SelectTrigger className="mt-1 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
          <p className="mt-1 flex items-center gap-1 font-medium">
            {detail.status === "open" ? (
              <span className="text-emerald-600">Open</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
              </span>
            )}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("liveSupport.assigned", { defaultValue: "Assigned agent" })}
          </p>
          <p className="mt-1 font-medium">{detail.assignedAdminName ?? "—"}</p>
        </div>
        {detail.rating != null && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">CSAT</p>
            <p className="mt-1 flex items-center gap-1 font-medium">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              {detail.rating}/5
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ticket</p>
          <p className="mt-1 font-mono text-xs">#{detail.id}</p>
          <p className="text-[11px] text-muted-foreground">
            {new Date(detail.createdAt).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  ) : (
    <div className="hidden h-full border-l bg-card lg:block" />
  );

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] max-w-[1600px] flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Headphones className="h-4 w-4 text-[var(--flexa-green)]" />
        <h1 className="text-sm font-bold tracking-tight sm:text-base">
          {t("liveSupport.title", { defaultValue: "Live Support" })}
        </h1>
        <Badge variant="outline" className="text-[10px]">
          {t("liveSupport.realtime", { defaultValue: "Realtime" })}
        </Badge>
      </div>

      {/* Desktop 3-pane */}
      <div className="hidden min-h-0 flex-1 grid-cols-[300px_1fr_260px] lg:grid">
        {inbox}
        {chat}
        {profile}
      </div>

      {/* Mobile panes */}
      <div className="min-h-0 flex-1 lg:hidden">
        {mobilePane === "inbox" && inbox}
        {mobilePane === "chat" && chat}
        {mobilePane === "profile" && profile}
      </div>
    </div>
  );
}
