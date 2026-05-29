import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import {
  Shield, Send, Lock, Unlock, Search, Download, RefreshCw, Check, MessageSquare, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/hooks/useSocket";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS } from "@/lib/countries";

// ── Types ──────────────────────────────────────────────────────────────────────

type SupportThread = {
  id: number;
  subject: string;
  status: "open" | "closed";
  userId: number;
  userName: string;
  userAvatar: string | null;
  country: string | null;
  assignedAdminId: number | null;
  assignedAdminName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadByUser: number;
  unreadByAdmin: number;
  createdAt: string;
  closedAt: string | null;
};

type SupportMessage = {
  id: number;
  threadId?: number;
  content: string;
  isAdminReply: boolean;
  senderRole: string;
  senderId: number;
  senderName: string;
  senderAvatar: string | null;
  isRead: boolean;
  createdAt: string;
};

type ThreadDetail = SupportThread & { messages: SupportMessage[] };

type Analytics = {
  total: number;
  open: number;
  closed: number;
  closedToday: number;
  avgResponseMin: number | null;
};

type AdminUser = {
  id: number;
  name: string;
  avatar: string | null;
  isSuperAdmin: boolean;
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface SupportAdminPanelProps {
  initialThreadId?: number | null;
  onUnreadChange?: (count: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "kounye a";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString("fr-HT", { month: "short", day: "numeric" });
}

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

// ── Component ──────────────────────────────────────────────────────────────────

export default function SupportAdminPanel({ initialThreadId, onUnreadChange }: SupportAdminPanelProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const socket = useSocket();
  const isSuperAdmin = !!(user as any)?.isSuperAdmin;

  // ── State ────────────────────────────────────────────────────────────────────
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<number | null>(initialThreadId ?? null);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"open" | "closed" | "all">("open");
  const [countryFilter, setCountryFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [typingUsers, setTypingUsers] = useState<Map<number, string>>(new Map());
  const typingTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const myTypingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ── Data loaders ─────────────────────────────────────────────────────────────

  const loadThreads = useCallback(async () => {
    try {
      const params = new URLSearchParams({ all: "1" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (countryFilter !== "all") params.set("country", countryFilter);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const data: SupportThread[] = await authFetch(`/api/support/threads?${params}`);
      setThreads(data ?? []);
      const unread = (data ?? []).reduce((s, t) => s + t.unreadByAdmin, 0);
      onUnreadChange?.(unread);
    } catch {}
  }, [statusFilter, countryFilter, searchQuery, onUnreadChange]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const data: ThreadDetail = await authFetch(`/api/support/threads/${id}`);
      setDetail(data);
      setActiveId(id);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unreadByAdmin: 0 } : t)));
      onUnreadChange?.((threads.reduce((s, t) => s + t.unreadByAdmin, 0) - (threads.find((t) => t.id === id)?.unreadByAdmin ?? 0)));
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  }, [threads, onUnreadChange, toast]);

  const loadAnalytics = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const data: Analytics = await authFetch("/api/admin/support/analytics");
      setAnalytics(data);
    } catch {}
  }, [isSuperAdmin]);

  // ── Effects ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadThreads();
    if (isSuperAdmin) {
      loadAnalytics();
      authFetch("/api/admin/chat/admins").then((data: AdminUser[]) => {
        setAdminUsers(data ?? []);
      }).catch(() => {});
    }
    if (initialThreadId) {
      loadDetail(initialThreadId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadThreads(); }, [statusFilter, countryFilter, searchQuery]);

  // WebSocket: admin support room (new thread notifications)
  useEffect(() => {
    socket.joinSupportAdmin();

    const unsubNew = socket.onNewSupportThread((data) => {
      loadThreads();
      if (statusFilter === "open" || statusFilter === "all") {
        toast({
          title: "Nouvo demand sipò",
          description: `${data?.userName ?? "Itilizatè"}: ${data?.subject ?? ""}`,
        });
      }
    });

    return () => {
      socket.leaveSupportAdmin();
      if (typeof unsubNew === "function") unsubNew();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  // WebSocket: join/leave active thread room
  useEffect(() => {
    if (!activeId) return;
    socket.joinSupport(activeId);
    setTypingUsers(new Map());

    const unsubMsg = socket.onSupportMessage((msg: SupportMessage) => {
      if (msg.threadId !== activeId) {
        loadThreads();
        return;
      }
      setDetail((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? { ...t, lastMessage: msg.content, lastMessageAt: msg.createdAt, unreadByAdmin: 0 }
            : t,
        ),
      );
    });

    const unsubTyping = socket.onSupportTyping(({ threadId, userId, userName }) => {
      if (threadId !== activeId || userId === user?.id) return;
      setTypingUsers((prev) => new Map(prev).set(userId, userName));
      const existing = typingTimeoutsRef.current.get(userId);
      if (existing) clearTimeout(existing);
      typingTimeoutsRef.current.set(
        userId,
        setTimeout(() => {
          setTypingUsers((prev) => { const m = new Map(prev); m.delete(userId); return m; });
        }, 3000),
      );
    });

    const unsubStop = socket.onSupportStopTyping(({ threadId, userId }) => {
      if (threadId !== activeId) return;
      setTypingUsers((prev) => { const m = new Map(prev); m.delete(userId); return m; });
      const t = typingTimeoutsRef.current.get(userId);
      if (t) { clearTimeout(t); typingTimeoutsRef.current.delete(userId); }
    });

    const unsubUpdate = socket.onSupportUpdate((data) => {
      if (data?.threadId !== activeId) return;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              status: data.status ?? prev.status,
              assignedAdminId: data.assignedAdminId !== undefined ? data.assignedAdminId : prev.assignedAdminId,
              assignedAdminName: data.assignedAdminName !== undefined ? data.assignedAdminName : prev.assignedAdminName,
            }
          : prev,
      );
      loadThreads();
    });

    return () => {
      socket.leaveSupport(activeId);
      if (typeof unsubMsg === "function") unsubMsg();
      if (typeof unsubTyping === "function") unsubTyping();
      if (typeof unsubStop === "function") unsubStop();
      if (typeof unsubUpdate === "function") unsubUpdate();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, user?.id]);

  // Auto-scroll on new messages or typing
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length, typingUsers.size]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  const sendReply = async () => {
    if (!activeId || !reply.trim() || sending) return;
    setSending(true);
    if (myTypingTimeout.current) clearTimeout(myTypingTimeout.current);
    socket.emitSupportStopTyping(activeId, user!.id);
    try {
      const msg: SupportMessage = await authFetch(
        `/api/support/threads/${activeId}/messages`,
        "POST",
        { content: reply.trim() },
      );
      setReply("");
      setDetail((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      if (isSuperAdmin) loadAnalytics();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleTypingChange = (value: string) => {
    setReply(value);
    if (!activeId || !user) return;
    socket.emitSupportTyping(activeId, user.id, user.name ?? "Admin");
    if (myTypingTimeout.current) clearTimeout(myTypingTimeout.current);
    myTypingTimeout.current = setTimeout(() => {
      socket.emitSupportStopTyping(activeId, user.id);
    }, 2000);
  };

  const closeThread = async (id: number) => {
    try {
      await authFetch(`/api/support/threads/${id}/close`, "POST");
      if (activeId === id) await loadDetail(id);
      loadThreads();
      if (isSuperAdmin) loadAnalytics();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  const reopenThread = async (id: number) => {
    try {
      await authFetch(`/api/support/threads/${id}/reopen`, "POST");
      if (activeId === id) await loadDetail(id);
      loadThreads();
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    }
  };

  const assignThread = async (adminIdStr: string) => {
    if (!activeId) return;
    setAssigning(true);
    try {
      const adminId = adminIdStr === "none" ? null : Number(adminIdStr);
      await authFetch(`/api/support/threads/${activeId}/assign`, "POST", { adminId });
      await loadDetail(activeId);
    } catch (e: any) {
      toast({ title: "Erè", description: e.message, variant: "destructive" });
    } finally {
      setAssigning(false);
    }
  };

  const exportThread = async (id: number) => {
    setExporting(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const res = await fetch(`/api/admin/support/threads/${id}/export`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Export echwe");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sipò-thread-${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "Export echwe", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const typingList = Array.from(typingUsers.values());

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Analytics bar — Super Admin only */}
      {isSuperAdmin && analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: analytics.total, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
            { label: "Ouvè", value: analytics.open, cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
            { label: "Fèmen jodi a", value: analytics.closedToday, cls: "bg-green-500/10 text-green-600 dark:text-green-400" },
            {
              label: "Moy. repons",
              value: analytics.avgResponseMin != null ? `${Math.round(analytics.avgResponseMin)}min` : "—",
              cls: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
            },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-3 border border-border ${s.cls}`}>
              <p className="text-xl font-black">{s.value}</p>
              <p className="text-xs opacity-70 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["open", "closed", "all"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setStatusFilter(f)}
              data-testid={`support-filter-${f}`}
            >
              {f === "open" ? "Ouvè" : f === "closed" ? "Fèmen" : "Tout"}
            </Button>
          ))}
        </div>

        {isSuperAdmin && (
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="h-7 text-xs w-36">
              <SelectValue placeholder="Peyi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tout peyi</SelectItem>
              {SUPPORTED_COUNTRIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {COUNTRY_FLAGS[c]} {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-7 pl-7 text-xs"
            placeholder="Chèche..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="support-search"
          />
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={loadThreads}
          data-testid="button-refresh-support"
        >
          <RefreshCw className="h-3 w-3 mr-1" />Refresh
        </Button>
      </div>

      <div className="grid md:grid-cols-[300px_1fr] gap-3">
        {/* Thread list */}
        <div className="bg-card border border-border rounded-xl overflow-hidden h-[60vh] flex flex-col">
          <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">Demand sipò</span>
            <Badge variant="secondary" className="text-[9px] h-4 px-1">{threads.length}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto">
            {threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-6">
                <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Pa gen demand sipò</p>
              </div>
            ) : (
              threads.map((th) => (
                <button
                  key={th.id}
                  onClick={() => loadDetail(th.id)}
                  className={`w-full text-left p-3 border-b border-border hover:bg-accent transition-colors ${
                    activeId === th.id ? "bg-accent" : ""
                  }`}
                  data-testid={`support-thread-${th.id}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Avatar className="h-6 w-6 flex-shrink-0">
                      <AvatarImage src={th.userAvatar ?? undefined} />
                      <AvatarFallback className="text-[10px]">{th.userName?.[0] ?? "?"}</AvatarFallback>
                    </Avatar>
                    <span className="text-xs font-medium truncate flex-1">{th.userName}</span>
                    {th.country && (
                      <span className="text-[10px] flex-shrink-0">{COUNTRY_FLAGS[th.country] ?? ""}</span>
                    )}
                    {th.unreadByAdmin > 0 && (
                      <Badge className="text-[9px] h-4 px-1 bg-red-600 hover:bg-red-600 flex-shrink-0">
                        {th.unreadByAdmin}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-semibold truncate">{th.subject}</p>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate flex-1">{th.lastMessage ?? "—"}</p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {th.status === "closed" && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">Fèmen</Badge>
                      )}
                      {th.lastMessageAt && (
                        <span className="text-[9px] text-muted-foreground">{formatTimeAgo(th.lastMessageAt)}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div className="bg-card border border-border rounded-xl overflow-hidden h-[60vh] flex flex-col">
          {!detail ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6">
              <MessageSquare className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Chwazi yon demand pou wè konvèsasyon an.</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="p-3 border-b border-border flex items-start gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/profile/${detail.userId}`} className="text-sm font-semibold hover:underline">
                      {detail.userName}
                    </Link>
                    {detail.country && (
                      <span className="text-xs text-muted-foreground">
                        {COUNTRY_FLAGS[detail.country] ?? ""} {detail.country}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{detail.subject}</p>
                  {detail.assignedAdminName && (
                    <p className="text-[10px] text-muted-foreground">
                      Asiyé: {detail.assignedAdminName}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap">
                  {/* Assign dropdown — Super Admin only */}
                  {isSuperAdmin && adminUsers.length > 0 && (
                    <Select
                      value={detail.assignedAdminId?.toString() ?? "none"}
                      onValueChange={assignThread}
                      disabled={assigning}
                    >
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue placeholder="Asiye admin" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Pa asiyé</SelectItem>
                        {adminUsers.map((a) => (
                          <SelectItem key={a.id} value={a.id.toString()}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Export CSV — Super Admin only */}
                  {isSuperAdmin && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => exportThread(detail.id)}
                      disabled={exporting}
                      data-testid="button-export-thread"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {exporting ? "..." : "CSV"}
                    </Button>
                  )}

                  {detail.status === "open" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => closeThread(detail.id)}
                      data-testid="button-close-thread"
                    >
                      <Lock className="h-3 w-3 mr-1" />Fèmen
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => reopenThread(detail.id)}
                      data-testid="button-reopen-thread"
                    >
                      <Unlock className="h-3 w-3 mr-1" />Ouvri
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {detail.messages.map((m) => {
                  const isBot = m.senderRole === "bot";
                  const mine = m.senderId === user?.id && !isBot;
                  return (
                    <div key={m.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                      <Avatar className="h-7 w-7 flex-shrink-0">
                        {isBot ? (
                          <AvatarFallback className="bg-slate-200 dark:bg-slate-700 text-[10px]">
                            <Bot className="h-3 w-3 text-slate-600 dark:text-slate-300" />
                          </AvatarFallback>
                        ) : (
                          <>
                            <AvatarImage src={m.senderAvatar ?? undefined} />
                            <AvatarFallback
                              className={m.isAdminReply ? "bg-purple-600 text-white text-[10px]" : "text-[10px]"}
                            >
                              {m.isAdminReply ? <Shield className="h-3 w-3" /> : (m.senderName?.[0] ?? "?")}
                            </AvatarFallback>
                          </>
                        )}
                      </Avatar>
                      <div className={`max-w-[75%] flex flex-col ${mine ? "items-end" : ""}`}>
                        <div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-muted-foreground">
                          <span className="font-medium">{isBot ? "Bot" : m.senderName}</span>
                          {isBot && (
                            <Badge className="text-[8px] h-3.5 px-1 bg-slate-500 hover:bg-slate-500">IA</Badge>
                          )}
                          {!isBot && m.isAdminReply && (
                            <Badge className="text-[8px] h-3.5 px-1 bg-purple-600 hover:bg-purple-600">Sipò</Badge>
                          )}
                          <span>{formatTimeAgo(m.createdAt)}</span>
                          {mine && m.isRead && <Check className="h-3 w-3 text-blue-500" />}
                        </div>
                        <div
                          className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                            isBot
                              ? "bg-slate-100 dark:bg-slate-800 rounded-bl-sm"
                              : mine
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : m.isAdminReply
                              ? "bg-purple-100 dark:bg-purple-950 rounded-bl-sm"
                              : "bg-muted rounded-bl-sm"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Typing indicator */}
                {typingList.length > 0 && (
                  <div className="flex items-center gap-2 pl-9">
                    <div className="flex gap-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
                    </div>
                    <span className="text-xs text-muted-foreground italic">{typingList[0]} ap ekri...</span>
                  </div>
                )}

                <div ref={bottomRef} />
              </div>

              {/* Reply input */}
              {detail.status === "open" ? (
                <div className="border-t border-border p-3 flex gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => handleTypingChange(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendReply())
                    }
                    onBlur={() => {
                      if (activeId && user) socket.emitSupportStopTyping(activeId, user.id);
                    }}
                    placeholder="Reponn itilizatè a..."
                    disabled={sending}
                    data-testid="input-support-reply"
                  />
                  <Button
                    onClick={sendReply}
                    disabled={!reply.trim() || sending}
                    data-testid="button-send-support"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="border-t border-border p-3 text-center text-xs text-muted-foreground">
                  Konvèsasyon sa a fèmen.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
