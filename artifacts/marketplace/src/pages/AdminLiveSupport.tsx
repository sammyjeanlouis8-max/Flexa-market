import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Bell,
  Bot,
  Check,
  CheckCheck,
  CheckCircle2,
  Download,
  Filter,
  Flag,
  Headphones,
  History,
  Info,
  Loader2,
  Lock,
  MessageCirclePlus,
  MessageSquare,
  Moon,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Shield,
  Smile,
  Star,
  Sun,
  Ticket,
  Unlock,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/components/theme-provider";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
type ModuleTab = "conversations" | "tickets" | "users";
type ChatTab = "conversation" | "details" | "history";

const OFFICIAL_LOGO = "/flexa-logo-v2.png";
const BRAND_GREEN = "hsl(152,65%,18%)";

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

function formatClock(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function newClientMsgId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Derive a category chip from the real ticket subject — never invent claims. */
function subjectCategory(subject: string): { key: string; label: string; className: string; icon: typeof Zap } {
  const s = subject.toLowerCase();
  if (/rap[oò]|report|abuse|signal/.test(s)) {
    return { key: "report", label: "Report", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300", icon: Flag };
  }
  if (/abon|subscr|vip|plan/.test(s)) {
    return { key: "sub", label: "Subscription", className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", icon: Star };
  }
  if (/account|kont|compte|login/.test(s)) {
    return { key: "account", label: "Account", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", icon: Users };
  }
  if (/invoice|bill|faktir|payment|payout/.test(s)) {
    return { key: "billing", label: "Billing", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", icon: Ticket };
  }
  if (/bot|flexabot|chatbot/.test(s)) {
    return { key: "bot", label: "FlexaBot", className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300", icon: Bot };
  }
  return { key: "support", label: "Support", className: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300", icon: Zap };
}

function BrandMark({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <img
        src={OFFICIAL_LOGO}
        alt="Flexa Market"
        className="h-8 w-auto shrink-0"
        width={32}
        height={32}
      />
      <div className="min-w-0">
        <p className="truncate text-[14px] font-bold leading-tight text-white">Flexa Control</p>
        {subtitle ? (
          <p className="truncate text-[10px] leading-tight text-white/75">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminLiveSupport() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const socket = useSocket();
  const search = useSearch();
  const initialThread = Number(new URLSearchParams(search).get("thread") || "") || null;

  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [activeId, setActiveId] = useState<number | null>(initialThread);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [inboxFilter, setInboxFilter] = useState<InboxFilter>("all");
  const [moduleTab, setModuleTab] = useState<ModuleTab>("conversations");
  const [chatTab, setChatTab] = useState<ChatTab>("conversation");
  const [q, setQ] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [reply, setReply] = useState("");
  const [internalMode, setInternalMode] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobilePane, setMobilePane] = useState<"inbox" | "chat">("inbox");
  const [typingName, setTypingName] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myTypingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickBottom = useRef(true);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

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
      setChatTab("conversation");
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

  useEffect(() => {
    socket.joinSupportAdmin();
    const unsubNew = socket.onNewSupportThread(() => {
      loadThreads();
      toast({ title: t("liveSupport.newTicket", { defaultValue: "New support request" }) });
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

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const filtered = useMemo(() => {
    let list = threads;
    if (inboxFilter === "unassigned") list = list.filter((th) => !th.assignedAdminId && th.status === "open");
    else if (inboxFilter === "mine") list = list.filter((th) => th.assignedAdminId === user?.id);
    else if (inboxFilter === "waiting") list = list.filter((th) => th.status === "open" && th.unreadByAdmin > 0);
    else if (inboxFilter === "active") list = list.filter((th) => th.status === "open" && !!th.assignedAdminId);
    else if (inboxFilter === "resolved") list = list.filter((th) => th.status === "closed");
    return list;
  }, [threads, inboxFilter, user?.id]);

  const openCount = useMemo(
    () => threads.filter((th) => th.status === "open").length,
    [threads],
  );

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

  const exportCsv = () => {
    if (!activeId) return;
    const token = localStorage.getItem("flexamarket_token");
    void (async () => {
      try {
        const res = await fetch(`/api/admin/support/threads/${activeId}/export`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Export failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `support-thread-${activeId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        toast({ title: t("liveSupport.error", { defaultValue: "Error" }), description: e.message, variant: "destructive" });
      }
    })();
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

  const insertQuick = (text: string) => {
    setInternalMode(false);
    setReply((prev) => (prev ? `${prev.trim()} ${text}` : text));
  };

  const detailsPanel = detail ? (
    <div className="space-y-4 p-4" data-testid="live-support-details">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={detail.userAvatar ?? undefined} />
          <AvatarFallback>{detail.userName?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate font-bold text-foreground">{detail.userName}</p>
          <p className="text-xs text-muted-foreground">
            {detail.country ? `${COUNTRY_FLAGS[detail.country] ?? ""} ${detail.country}` : "—"}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-3 text-sm">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("liveSupport.subject", { defaultValue: "Subject" })}
          </p>
          <p className="mt-0.5 font-medium">{detail.subject}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("liveSupport.priority", { defaultValue: "Priority" })}
          </p>
          <Select value={detail.priority ?? "normal"} onValueChange={setPriority}>
            <SelectTrigger className="mt-1 h-9 text-xs">
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
          <p className="mt-1 font-medium">
            {detail.status === "open" ? (
              <span className="text-emerald-600">{t("liveSupport.open", { defaultValue: "Open" })}</span>
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" /> {t("liveSupport.resolved", { defaultValue: "Resolved" })}
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
          <p className="text-[11px] text-muted-foreground">{new Date(detail.createdAt).toLocaleString()}</p>
        </div>
      </div>

      <Button asChild size="sm" variant="outline" className="w-full">
        <Link href={`/admin/users?search=${encodeURIComponent(detail.userName)}`}>
          {t("liveSupport.viewAccount", { defaultValue: "View account" })}
        </Link>
      </Button>
    </div>
  ) : null;

  const historyPanel = detail ? (
    <div className="space-y-3 p-4" data-testid="live-support-history">
      <div className="rounded-xl border border-border bg-card p-3 text-sm space-y-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <History className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            {t("liveSupport.history", { defaultValue: "History" })}
          </span>
        </div>
        <p className="text-sm">
          <span className="font-medium">{t("liveSupport.created", { defaultValue: "Created" })}:</span>{" "}
          {new Date(detail.createdAt).toLocaleString()}
        </p>
        <p className="text-sm">
          <span className="font-medium">{t("liveSupport.assigned", { defaultValue: "Assigned agent" })}:</span>{" "}
          {detail.assignedAdminName ?? t("liveSupport.unassigned", { defaultValue: "Unassigned" })}
        </p>
        <p className="text-sm">
          <span className="font-medium">Status:</span> {detail.status}
        </p>
        <p className="text-sm">
          <span className="font-medium">{t("liveSupport.messagesCount", { defaultValue: "Messages" })}:</span>{" "}
          {detail.messages.length}
        </p>
      </div>
      <ul className="space-y-2">
        {detail.messages
          .filter((m) => m.isInternal || m.senderRole === "bot")
          .slice(-12)
          .map((m) => (
            <li key={m.id} className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs">
              <div className="flex items-center gap-1 text-muted-foreground">
                {m.senderRole === "bot" ? <Bot className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                <span className="font-semibold">{m.isInternal ? "Note" : m.senderName}</span>
                <span>· {formatTime(m.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-foreground/90">{m.content}</p>
            </li>
          ))}
      </ul>
    </div>
  ) : null;

  const inbox = (
    <div className="relative flex h-full min-h-0 flex-col bg-background" data-testid="live-support-inbox">
      {/* Module tabs */}
      <div className="shrink-0 border-b border-border bg-muted/40 px-3 py-2">
        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              { id: "conversations" as const, label: t("liveSupport.conversations", { defaultValue: "Conversations" }), icon: MessageSquare, count: openCount },
              { id: "tickets" as const, label: t("liveSupport.tickets", { defaultValue: "Tickets" }), icon: Ticket },
              { id: "users" as const, label: t("liveSupport.usersTab", { defaultValue: "Users" }), icon: Users },
            ]
          ).map((tab) => {
            const Icon = tab.icon;
            const active = moduleTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === "tickets") {
                    window.location.href = "/admin/support";
                    return;
                  }
                  if (tab.id === "users") {
                    window.location.href = "/admin/users";
                    return;
                  }
                  setModuleTab("conversations");
                }}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold transition-colors",
                  active
                    ? "bg-white text-[hsl(152,65%,22%)] shadow-sm dark:bg-card"
                    : "text-muted-foreground hover:bg-white/60 dark:hover:bg-card/60",
                )}
                data-testid={`live-support-module-${tab.id}`}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg",
                    active ? "bg-[hsl(152,65%,18%)] text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{tab.label}</span>
                {typeof tab.count === "number" && tab.count > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[hsl(152,55%,32%)] px-1 text-[9px] font-bold text-white">
                    {tab.count > 99 ? "99+" : tab.count}
                  </span>
                )}
                {active && <span className="absolute inset-x-4 -bottom-2 h-0.5 rounded-full bg-[hsl(152,65%,28%)]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-1">
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-tight text-foreground">
            {t("liveSupport.conversations", { defaultValue: "Conversations" })}
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {t("liveSupport.inboxSubtitle", {
              defaultValue: "Manage messages, requests, and reports",
            })}
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setShowFilters((v) => !v)}
            aria-label="Filters"
          >
            <Filter className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={loadThreads} aria-label="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {showSearch && (
        <div className="px-3 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              className="h-9 rounded-xl pl-8 text-sm"
              placeholder={t("liveSupport.search", { defaultValue: "Search…" })}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="live-support-search"
            />
          </div>
        </div>
      )}

      {showFilters && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setInboxFilter(f.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
                inboxFilter === f.id
                  ? "bg-[hsl(152,65%,18%)] text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-20 pt-1 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm">{t("liveSupport.empty", { defaultValue: "No conversations" })}</p>
          </div>
        ) : (
          filtered.map((th) => {
            const cat = subjectCategory(th.subject);
            const CatIcon = cat.icon;
            const selected = activeId === th.id;
            const unread = th.unreadByAdmin > 0;
            return (
              <button
                key={th.id}
                type="button"
                onClick={() => loadDetail(th.id)}
                className={cn(
                  "w-full rounded-2xl border px-3 py-2.5 text-left transition-colors",
                  selected || unread
                    ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/30"
                    : "border-border bg-card hover:bg-muted/40",
                )}
                data-testid={`live-support-thread-${th.id}`}
              >
                <div className="flex gap-2.5">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={th.userAvatar ?? undefined} />
                    <AvatarFallback className="text-xs">{th.userName?.[0] ?? "?"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-bold text-foreground">{th.userName}</p>
                        <p className="truncate text-[12px] font-semibold text-foreground/90">{th.subject}</p>
                        <p className="truncate text-[11px] text-muted-foreground">{th.lastMessage ?? "—"}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="text-[10px] text-muted-foreground">
                          {th.lastMessageAt ? formatTime(th.lastMessageAt) : ""}
                        </span>
                        {unread && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(152,55%,32%)] px-1 text-[10px] font-bold text-white">
                            {th.unreadByAdmin > 99 ? "99+" : th.unreadByAdmin}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {th.country && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <span>{COUNTRY_FLAGS[th.country] ?? ""}</span>
                          {th.country}
                        </span>
                      )}
                      <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", cat.className)}>
                        <CatIcon className="h-3 w-3" />
                        {cat.label}
                      </span>
                      {th.priority === "urgent" && (
                        <Badge className="h-5 bg-red-600 px-1.5 text-[9px] hover:bg-red-600">URGENT</Badge>
                      )}
                      {th.priority === "high" && (
                        <Badge className="h-5 bg-orange-500 px-1.5 text-[9px] hover:bg-orange-500">HIGH</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          setInboxFilter("unassigned");
          setShowFilters(true);
        }}
        className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg"
        style={{ background: BRAND_GREEN }}
        aria-label={t("liveSupport.filterUnassigned", { defaultValue: "Unassigned" })}
        data-testid="live-support-fab"
      >
        <MessageCirclePlus className="h-5 w-5" />
      </button>
    </div>
  );

  const chatHeader = detail && (
    <div className="shrink-0 border-b border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 md:hidden"
          onClick={() => setMobilePane("inbox")}
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={detail.userAvatar ?? undefined} />
          <AvatarFallback>{detail.userName?.[0] ?? "?"}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{detail.userName}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
            {detail.country && (
              <span className="inline-flex items-center gap-0.5">
                {COUNTRY_FLAGS[detail.country] ?? ""} {detail.country}
              </span>
            )}
            {subjectCategory(detail.subject).key === "report" && (
              <span className="inline-flex items-center gap-0.5 text-red-600">
                <Flag className="h-3 w-3" /> Report
              </span>
            )}
            <span className="inline-flex items-center gap-0.5">
              <Users className="h-3 w-3" />
              {detail.assignedAdminName ?? t("liveSupport.unassigned", { defaultValue: "Unassigned" })}
            </span>
          </div>
        </div>
        <Select
          value={detail.status}
          onValueChange={(v) => {
            if (v === "closed" && detail.status === "open") void resolve();
            if (v === "open" && detail.status === "closed") void reopen();
          }}
        >
          <SelectTrigger className="h-8 w-auto gap-1 rounded-full border-emerald-500/60 px-2.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">{t("liveSupport.open", { defaultValue: "Open" })}</SelectItem>
            <SelectItem value="closed">{t("liveSupport.resolved", { defaultValue: "Resolved" })}</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="More">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {!detail.assignedAdminId && detail.status === "open" && (
              <DropdownMenuItem onClick={() => void claim()}>
                <UserPlus className="mr-2 h-4 w-4" />
                {t("liveSupport.claim", { defaultValue: "Claim" })}
              </DropdownMenuItem>
            )}
            {detail.assignedAdminId === user?.id && (
              <DropdownMenuItem onClick={() => void release()}>
                <Unlock className="mr-2 h-4 w-4" />
                {t("liveSupport.release", { defaultValue: "Release" })}
              </DropdownMenuItem>
            )}
            {detail.status === "open" ? (
              <DropdownMenuItem onClick={() => void resolve()}>
                <Lock className="mr-2 h-4 w-4" />
                {t("liveSupport.resolve", { defaultValue: "Resolve" })}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => void reopen()}>
                <Unlock className="mr-2 h-4 w-4" />
                {t("liveSupport.reopen", { defaultValue: "Reopen" })}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" />
              {t("liveSupport.exportCsv", { defaultValue: "Export CSV" })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setInternalMode((v) => !v)}>
              <Shield className="mr-2 h-4 w-4" />
              {internalMode
                ? t("liveSupport.replyMode", { defaultValue: "Reply mode" })
                : t("liveSupport.noteMode", { defaultValue: "Internal note" })}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setChatTab("details")}>
              <Info className="mr-2 h-4 w-4" />
              {t("liveSupport.details", { defaultValue: "Details" })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex gap-4 px-3">
        {(
          [
            { id: "conversation" as const, label: t("liveSupport.conversationTab", { defaultValue: "Conversation" }) },
            { id: "details" as const, label: t("liveSupport.details", { defaultValue: "Details" }) },
            { id: "history" as const, label: t("liveSupport.history", { defaultValue: "History" }) },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setChatTab(tab.id)}
            className={cn(
              "relative pb-2.5 text-[13px] font-semibold transition-colors",
              chatTab === tab.id ? "text-[hsl(152,65%,22%)] dark:text-emerald-300" : "text-muted-foreground",
            )}
            data-testid={`live-support-chat-tab-${tab.id}`}
          >
            {tab.label}
            {chatTab === tab.id && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[hsl(152,65%,28%)]" />
            )}
          </button>
        ))}
      </div>
    </div>
  );

  const chat = (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="live-support-chat">
      {!detail ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <Headphones className="h-10 w-10 opacity-30" />
          <p className="text-sm">{t("liveSupport.pick", { defaultValue: "Select a conversation" })}</p>
        </div>
      ) : (
        <>
          {chatHeader}

          {chatTab === "details" && (
            <div className="min-h-0 flex-1 overflow-y-auto xl:hidden">{detailsPanel}</div>
          )}
          {chatTab === "history" && (
            <div className="min-h-0 flex-1 overflow-y-auto">{historyPanel}</div>
          )}

          {chatTab === "conversation" && (
            <>
              <div
                className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  stickBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
              >
                {detail.messages.map((m, idx) => {
                  const isBot = m.senderRole === "bot";
                  const isMine = m.isAdminReply && !m.isInternal;
                  const isNote = !!m.isInternal;
                  const prev = detail.messages[idx - 1];
                  const showDate =
                    !prev ||
                    new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
                  return (
                    <div key={m.id}>
                      {showDate && (
                        <p className="mb-2 text-center text-[11px] font-medium text-muted-foreground">
                          {new Date(m.createdAt).toLocaleDateString(undefined, {
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      )}
                      <div
                        className={cn(
                          "flex gap-2",
                          isNote ? "justify-center" : isMine ? "justify-end" : "justify-start",
                        )}
                      >
                        {!isMine && !isNote && (
                          <Avatar className="mt-1 h-7 w-7 shrink-0">
                            <AvatarImage src={m.senderAvatar ?? undefined} />
                            <AvatarFallback className="text-[10px]">
                              {isBot ? "B" : (m.senderName?.[0] ?? "?")}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <div className="max-w-[82%]">
                          <div
                            className={cn(
                              "rounded-2xl px-3 py-2 text-sm shadow-sm",
                              isNote && "border border-dashed border-amber-400/60 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
                              !isNote && isMine && "rounded-br-md bg-[hsl(152,65%,18%)] text-white",
                              !isNote && !isMine && isBot && "rounded-bl-md border border-violet-200 bg-violet-50 dark:border-violet-900 dark:bg-violet-950/40",
                              !isNote && !isMine && !isBot && "rounded-bl-md border bg-muted/70",
                            )}
                          >
                            {(isBot || isNote) && (
                              <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold opacity-80">
                                {isBot && <Bot className="h-3 w-3" />}
                                {isNote
                                  ? t("liveSupport.internalNote", { defaultValue: "Internal note" })
                                  : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-violet-200/80 px-1.5 py-0.5 text-violet-900 dark:bg-violet-900 dark:text-violet-100">
                                      <Shield className="h-3 w-3" /> FlexaBot
                                    </span>
                                  )}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words">{m.content}</p>
                          </div>
                          <div
                            className={cn(
                              "mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted-foreground",
                              isMine && "justify-end",
                            )}
                          >
                            <span>{formatClock(m.createdAt)}</span>
                            {isMine && (
                              m.isRead
                                ? <CheckCheck className="h-3 w-3 text-emerald-500" />
                                : <Check className="h-3 w-3" />
                            )}
                          </div>
                        </div>
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
                <div className="shrink-0 border-t border-border bg-card px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                  <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <button
                      type="button"
                      onClick={() => insertQuick(t("liveSupport.quickAgent", { defaultValue: "A human agent will assist you shortly." }))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium"
                    >
                      <Users className="h-3 w-3" />
                      {t("liveSupport.quickAgentLabel", { defaultValue: "Talk to agent" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertQuick(t("liveSupport.quickReport", { defaultValue: "Please share details so we can review this report." }))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
                    >
                      <Flag className="h-3 w-3" />
                      {t("liveSupport.quickReportLabel", { defaultValue: "Make a report" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertQuick(t("liveSupport.quickHelp", { defaultValue: "Here is a quick tip to help you continue." }))}
                      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium"
                    >
                      <Zap className="h-3 w-3" />
                      {t("liveSupport.quickHelpLabel", { defaultValue: "Quick help" })}
                    </button>
                  </div>
                  <div className="flex items-end gap-1.5">
                    <button
                      type="button"
                      className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
                      aria-label="Attach"
                      title={t("liveSupport.attachSoon", { defaultValue: "Attachments coming soon" })}
                    >
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <div className="relative min-w-0 flex-1">
                      <Textarea
                        rows={1}
                        className="max-h-28 min-h-[40px] resize-none rounded-2xl border-border bg-muted/40 py-2.5 pr-10 text-sm"
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
                        data-testid="live-support-composer"
                      />
                      <Smile className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                    </div>
                    <Button
                      className="mb-0.5 h-10 w-10 shrink-0 rounded-full p-0"
                      style={{ background: BRAND_GREEN }}
                      disabled={sending || !reply.trim()}
                      onClick={() => void send()}
                      data-testid="live-support-send"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                  {internalMode && (
                    <p className="mt-1 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                      {t("liveSupport.noteModeHint", { defaultValue: "Internal note mode — customer will not see this" })}
                    </p>
                  )}
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
        </>
      )}
    </div>
  );

  return (
    <div
      className="-mx-3 -mb-3 flex h-[calc(100dvh-3.5rem-env(safe-area-inset-top,0px))] max-w-none flex-col overflow-hidden bg-background sm:-mx-4"
      data-testid="flexa-control-live-support"
    >
      {/* Compact dark-green Flexa Control header — official logo only */}
      <header
        className="shrink-0 text-white"
        style={{ background: BRAND_GREEN }}
        data-testid="live-support-brand-header"
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          {mobilePane === "chat" && detail ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9 shrink-0 text-white hover:bg-white/10 md:hidden"
                onClick={() => setMobilePane("inbox")}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <BrandMark
                subtitle={`${detail.userName} · ${user?.isSuperAdmin ? "Super Admin" : user?.name ?? "Agent"}`}
              />
              <div className="ml-auto flex items-center gap-0.5">
                <Button size="icon" variant="ghost" className="h-8 w-8 text-white hover:bg-white/10" onClick={() => setChatTab("details")}>
                  <Info className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <BrandMark
                subtitle={t("liveSupport.supportAdminSubtitle", {
                  defaultValue: "Support & Administration",
                })}
              />
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white hover:bg-white/10"
                  onClick={() => setShowSearch((v) => !v)}
                  aria-label="Search"
                >
                  <Search className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="relative h-8 w-8 text-white hover:bg-white/10" aria-label="Notifications">
                  <Bell className="h-4 w-4" />
                  {openCount > 0 && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-red-500" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-white hover:bg-white/10"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  aria-label="Theme"
                >
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Desktop / tablet layouts */}
      <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[320px_1fr] xl:grid-cols-[320px_minmax(0,1fr)_300px]">
        <div className="min-h-0 border-r border-border">{inbox}</div>
        <div className="min-h-0">{chat}</div>
        <div className="hidden min-h-0 overflow-y-auto border-l border-border bg-muted/20 xl:block">
          {detail ? detailsPanel : (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
              {t("liveSupport.pick", { defaultValue: "Select a conversation" })}
            </div>
          )}
        </div>
      </div>

      {/* Mobile: exclusive inbox OR chat screens */}
      <div className="min-h-0 flex-1 md:hidden">
        {mobilePane === "inbox" && inbox}
        {mobilePane === "chat" && chat}
      </div>
    </div>
  );
}
