import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, MessageSquare, Send, Plus, Lock,
  Check, CheckCheck, Bot, Loader2, CheckCircle2, Star,
  Headphones,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const OFFICIAL_LOGO = "/flexa-logo-v2.png";
const BRAND_GREEN = "hsl(152,65%,18%)";
const BRAND_GREEN_SOFT = "hsl(152,40%,94%)";

// ── Types ──────────────────────────────────────────────────────────────────────

type Thread = {
  id: number;
  ticketRef?: string;
  subject: string;
  status: "open" | "in_progress" | "waiting_customer" | "closed";
  priority?: string;
  category?: string;
  userId: number;
  userName: string;
  userAvatar: string | null;
  assignedAdminId: number | null;
  assignedAdminName: string | null;
  assignedAdminAvatar?: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadByUser: number;
  unreadByAdmin: number;
  estimatedResponseLabel?: string | null;
  rating?: number | null;
  createdAt: string;
  closedAt: string | null;
};

type Message = {
  id: number;
  content: string;
  isAdminReply: boolean;
  senderRole: string;
  senderId: number;
  senderName: string;
  senderAvatar: string | null;
  messageType?: string;
  mediaUrl?: string | null;
  mediaName?: string | null;
  isRead: boolean;
  createdAt: string;
};

type ThreadDetail = Thread & { messages: Message[] };

type BotMsg = {
  id: string;
  role: "bot" | "user";
  content: string;
  ts: string;
};

type QuickReply = { id: string; label: string };

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatTimeAgo(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return "kounye a";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString("fr-HT", { month: "short", day: "numeric" });
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// ── Bot Knowledge Base ─────────────────────────────────────────────────────────

const MAIN_OPTIONS: QuickReply[] = [
  { id: "commande",  label: "📦 Kòmand mwen" },
  { id: "peman",     label: "💳 Peman" },
  { id: "livrezon",  label: "🚚 Livrezon" },
  { id: "pwoblem",   label: "⚠️ Pwoblèm" },
  { id: "ajan",      label: "📞 Pale ak yon ajan" },
];

const CONFIRM_OPTIONS: QuickReply[] = [
  { id: "confirm_yes", label: "✅ Wi, mèsi!" },
  { id: "confirm_no",  label: "❌ Non, mwen bezwen ajan" },
];

interface FaqEntry {
  keywords: string[];
  subject: string;
  answer: string;
}

const FAQS: Record<string, FaqEntry> = {
  commande: {
    keywords: ["komand", "command", "order", "achte", "kote komand", "pa resevwa komand", "kòmand"],
    subject: "📦 Kòmand mwen",
    answer:
      "Pou wè kòmand ou yo:\n1. Ale nan «Profil» → «Kòmand mwen»\n2. Klike sou kòmand la pou wè detay yo\n\nSi ou gen pwoblèm ak yon kòmand espesifik (pa resevwa, echwe, elatriye), ban mwen nimewo kòmand lan oswa chwazi «Pale ak yon ajan» pou èd dirèk.",
  },
  peman: {
    keywords: ["peman", "peye", "paye", "payment", "moncash", "card", "kat", "lajan", "ranbouman", "ranbousman", "refund", "charge"],
    subject: "💳 Pwoblèm peman",
    answer:
      "Enfòmasyon peman:\n• MonCash: Nou aksepte peman MonCash\n• Visa / Mastercard: Aksepte sou sit la\n• Ranbousman: 3-5 jou travay apre apwobasyon\n\nSi peman ou pa trete oswa ou bezwen ranbousman, ban nou referans tranzaksyon an.",
  },
  livrezon: {
    keywords: ["livrezon", "livray", "livrer", "delivery", "shipping", "kote komand mwen", "pa rive", "jwenn", "transpò"],
    subject: "🚚 Pwoblèm livrezon",
    answer:
      "Delè livrezon moto lokal (Ayiti & RD):\n• Estanda — Menm Jou (3 – 6h)\n• Rapid — 2 – 4h\n• Express — ~1h / Imedya\n\nPou swiv kòmand ou:\n«Profil» → «Kòmand mwen» → «Swiv livrezon»\n\nSi ou gen pwoblèm ak livrezon ou, kontakte nou imedyatman.",
  },
  pwoblem: {
    keywords: ["pwoblem", "problem", "issue", "pa mache", "ere", "bug", "echwe", "planyen", "depo", "pwoblèm"],
    subject: "⚠️ Rapò pwoblèm",
    answer:
      "Mwen regrèt ou ap fè fas ak yon pwoblèm!\n\nPou ede w pi vit, eksplike:\n• Ki pwoblèm ou wè egzakteman?\n• Ki aparèy ou itilize (telefòn, òdinatè)?\n\nOswa klike «Pale ak yon ajan» pou èd imedya.",
  },
  compte: {
    keywords: ["kont", "compte", "profil", "pwofil", "modpas", "password", "konekte", "login", "bloke", "verifikasyon", "dekonekte"],
    subject: "🔐 Pwoblèm kont",
    answer:
      "Pou pwoblèm ak kont ou:\n1. Modpas bliye → Klike «Bliye modpas» nan paj koneksyon\n2. Kont bloke → Kontakte nou ak imel ou\n3. Verifikasyon → Tcheke «Profil» → «Verifikasyon»\n\nSi ou pa ka aksede kont ou, yon ajan ka ede w imedyatman.",
  },
  vann: {
    keywords: ["vann", "vendre", "sell", "anonse", "annonce", "listing", "boutik", "pibliye", "pwodwi", "mete anlas"],
    subject: "🛍️ Vann sou FLEXA",
    answer:
      "Pou komanse vann sou FLEXA MARKET:\n1. Klike bouton «Vann»\n2. Pran foto pwodwi ou (5 foto maks)\n3. Mete pri, deskripsyon, kategori\n4. Pibliye!\n\nNòt: Ou bezwen kont verifye pou vann. Verifikasyon ka pran 24h.",
  },
};

const ESCALATION_KEYWORDS = [
  "ajan", "agent", "human", "rele", "pale ak yon ajan",
  "mwen bezwen moun", "bezwen ajan", "transfere", "moun reyel",
];

type BotResult = {
  answer: string;
  quickReplies?: QuickReply[];
  escalate?: boolean;
  topic?: string;
  confirmed?: boolean;
};

function getBotResponse(input: string, failCount: number): BotResult {
  const norm = stripAccents(input.toLowerCase().trim());

  // Confirm YES patterns
  if (["wi", "wi mesi", "oui", "ok", "mesi", "oke"].some((p) => norm === p || norm.startsWith(p + " "))) {
    return {
      answer: "Kontan sa te ede w! 😊 Ou gen lòt kesyon? Mwen la pou ou.",
      quickReplies: MAIN_OPTIONS,
      confirmed: true,
    };
  }

  // Escalation or confirm NO
  if (
    ESCALATION_KEYWORDS.some((kw) => norm.includes(stripAccents(kw))) ||
    norm.startsWith("non") ||
    norm.includes("pa ede") ||
    norm.includes("pa regle")
  ) {
    return { answer: "", escalate: true };
  }

  // FAQ keyword matching
  for (const [, faq] of Object.entries(FAQS)) {
    const normalizedKws = faq.keywords.map(stripAccents);
    if (normalizedKws.some((kw) => norm.includes(kw))) {
      return {
        answer: faq.answer,
        topic: faq.subject,
        quickReplies: CONFIRM_OPTIONS,
      };
    }
  }

  // No match — check fail count
  if (failCount >= 1) {
    return { answer: "", escalate: true };
  }
  return {
    answer:
      "Mwen pa fin konprann kesyon ou a. Kapab ou esplike pi klèman oswa chwazi yon seksyon anba a?",
    quickReplies: MAIN_OPTIONS,
  };
}

// ── BotChatView ────────────────────────────────────────────────────────────────

interface BotChatViewProps {
  user: { id: number; name?: string | null };
  onEscalate: (threadId: number) => void;
}

function BotChatView({ user, onEscalate }: BotChatViewProps) {
  const [msgs, setMsgs] = useState<BotMsg[]>([]);
  const [quickReplies, setQuickReplies] = useState<QuickReply[] | null>(null);
  const [inputText, setInputText] = useState("");
  const [botTyping, setBotTyping] = useState(false);
  const [failCount, setFailCount] = useState(0);
  const [escalating, setEscalating] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [topic, setTopic] = useState("Sipò jeneral");
  const bottomRef = useRef<HTMLDivElement>(null);

  const addBotMsg = useCallback((content: string, qr?: QuickReply[]) => {
    const id = `bot-${Date.now()}-${Math.random()}`;
    setMsgs((prev) => [...prev, { id, role: "bot", content, ts: new Date().toISOString() }]);
    setQuickReplies(qr ?? null);
  }, []);

  const addUserMsg = useCallback((content: string) => {
    const id = `user-${Date.now()}-${Math.random()}`;
    setMsgs((prev) => [...prev, { id, role: "user", content, ts: new Date().toISOString() }]);
  }, []);

  // Greeting on mount
  useEffect(() => {
    const t1 = setTimeout(() => setBotTyping(true), 300);
    const t2 = setTimeout(() => {
      setBotTyping(false);
      addBotMsg("Bonjou 👋 Kijan nou ka ede w jodi a?", MAIN_OPTIONS);
    }, 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [addBotMsg]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, botTyping, quickReplies]);

  const doEscalate = useCallback(async (currentMsgs: BotMsg[]) => {
    setEscalating(true);
    setQuickReplies(null);
    setBotTyping(true);
    await new Promise<void>((r) => setTimeout(r, 800));
    setBotTyping(false);
    try {
      const botHistory = currentMsgs.map((m) => ({ role: m.role, content: m.content }));
      const lastUserMsg =
        [...currentMsgs].reverse().find((m) => m.role === "user")?.content ?? "Eskalasyon bot";
      const r = await apiFetch<{
        id: number;
        ticketRef?: string;
        estimatedResponseLabel?: string;
        agentsOnline?: number;
      }>("/api/support/threads", {
        method: "POST",
        body: JSON.stringify({
          subject: topic.length > 3 ? topic : "Sipò jeneral",
          message: lastUserMsg,
          botHistory,
        }),
      });
      const ref = r.ticketRef ? `#${r.ticketRef}` : `#${r.id}`;
      const eta = r.estimatedResponseLabel || "Approximately 3–7 hours";
      addBotMsg(
        `Your support request has been received.\n\nTicket: ${ref}\nStatus: Pending Review\nEstimated Response: ${eta}` +
          (typeof r.agentsOnline === "number" ? `\nAgents available: ${r.agentsOnline}` : "") +
          `\n\nOur support team will review your request. Opening your FlexaBot ticket…`,
      );
      setEscalated(true);
      setTimeout(() => onEscalate(r.id), 1000);
    } catch {
      addBotMsg("Something went wrong. Please try again in a few seconds.");
      setEscalating(false);
    }
  }, [topic, addBotMsg, onEscalate]);

  const handleQuickReply = (qr: QuickReply) => {
    if (escalating || escalated) return;
    setQuickReplies(null);
    addUserMsg(qr.label);

    if (qr.id === "ajan" || qr.id === "confirm_no") {
      setMsgs((prev) => { doEscalate(prev); return prev; });
      return;
    }

    if (qr.id === "confirm_yes") {
      setBotTyping(true);
      setTimeout(() => {
        setBotTyping(false);
        addBotMsg("Kontan sa te ede w! 😊 Ou gen lòt kesyon?", MAIN_OPTIONS);
      }, 600);
      return;
    }

    // Main option chips — direct FAQ lookup
    const faq = FAQS[qr.id];
    if (faq) {
      setTopic(faq.subject);
      setBotTyping(true);
      setTimeout(() => {
        setBotTyping(false);
        addBotMsg(faq.answer, CONFIRM_OPTIONS);
      }, 700);
    }
  };

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || botTyping || escalating || escalated) return;
    setInputText("");
    addUserMsg(text);

    // Detect topic from user input for escalation subject
    const norm = stripAccents(text.toLowerCase());
    for (const [, faq] of Object.entries(FAQS)) {
      if (faq.keywords.map(stripAccents).some((kw) => norm.includes(kw))) {
        setTopic(faq.subject);
        break;
      }
    }

    setBotTyping(true);
    // Use timeout so we can capture latest msgs state inside callback
    setTimeout(() => {
      setMsgs((currentMsgs) => {
        const result = getBotResponse(text, failCount);
        setBotTyping(false);

        if (result.escalate) {
          doEscalate(currentMsgs);
          return currentMsgs;
        }

        if (result.topic) setTopic(result.topic);

        const isMatch = !!result.quickReplies?.some((q) => q.id.startsWith("confirm"));
        if (!isMatch && !result.confirmed) {
          setFailCount((c) => c + 1);
        }

        setTimeout(() => addBotMsg(result.answer, result.quickReplies), 0);
        return currentMsgs;
      });
    }, 750);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F4F7F5]" data-testid="flexabot-chat">
      {/* FlexaBot header */}
      <div
        className="flex shrink-0 items-center gap-2.5 border-b px-3 py-2.5 text-white"
        style={{ background: BRAND_GREEN }}
      >
        <img src={OFFICIAL_LOGO} alt="Flexa Market" className="h-8 w-8 rounded-full bg-white/10 p-0.5" width={32} height={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold leading-tight">FlexaBot</p>
          <p className="flex items-center gap-1 text-[10px] text-white/80">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
            AI · Online · Instant answers
          </p>
        </div>
        {escalated && (
          <Badge className="bg-white/20 text-[10px] text-white hover:bg-white/20">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Transferred
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
        <div className="flex-1" />
        <div className="space-y-2.5">
          {msgs.map((m) => (
            <div key={m.id} className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}>
              {m.role === "bot" ? (
                <div
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                  style={{ background: BRAND_GREEN_SOFT }}
                >
                  <Bot className="h-4 w-4" style={{ color: BRAND_GREEN }} />
                </div>
              ) : (
                <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                  <AvatarFallback className="text-xs font-semibold" style={{ background: BRAND_GREEN, color: "#fff" }}>
                    {(user.name?.[0] ?? "U").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className={cn("flex max-w-[80%] flex-col", m.role === "user" && "items-end")}>
                <div className="mb-0.5 flex items-center gap-1.5 px-0.5 text-[10px] text-slate-500">
                  <span className="font-semibold">{m.role === "bot" ? "FlexaBot" : (user.name ?? "You")}</span>
                  {m.role === "bot" && (
                    <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: BRAND_GREEN }}>
                      AI
                    </span>
                  )}
                  <span>{formatTimeAgo(m.ts)}</span>
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm",
                    m.role === "user"
                      ? "rounded-br-md text-white"
                      : "rounded-bl-md border border-slate-200/80 bg-white text-slate-800",
                  )}
                  style={m.role === "user" ? { background: BRAND_GREEN } : undefined}
                >
                  {m.content}
                </div>
              </div>
            </div>
          ))}

          {botTyping && (
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: BRAND_GREEN_SOFT }}>
                <Bot className="h-4 w-4" style={{ color: BRAND_GREEN }} />
              </div>
              <div className="flex h-9 items-center gap-1 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {escalating && !escalated && (
            <div className="flex items-center gap-2 pl-10 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Connecting you to a support agent…
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {quickReplies && quickReplies.length > 0 && !escalating && !escalated && (
        <div className="flex shrink-0 flex-wrap gap-1.5 px-3 pb-2">
          {quickReplies.map((qr) => (
            <button
              key={qr.id}
              type="button"
              onClick={() => handleQuickReply(qr)}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ borderColor: "hsla(152,65%,18%,0.25)", color: BRAND_GREEN, background: BRAND_GREEN_SOFT }}
              data-testid={`bot-quick-${qr.id}`}
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-3 py-2.5 pb-[max(0.65rem,env(safe-area-inset-bottom))]">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder={escalated ? "Transferred to agent…" : "Write a message…"}
          disabled={botTyping || escalating || escalated}
          className="rounded-full border-slate-200 bg-slate-50"
          data-testid="bot-input"
        />
        <Button
          onClick={handleSend}
          disabled={!inputText.trim() || botTyping || escalating || escalated}
          size="icon"
          className="shrink-0 rounded-full text-white"
          style={{ background: BRAND_GREEN }}
          data-testid="bot-send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Support Main Page ──────────────────────────────────────────────────────────

export default function Support() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const socket = useSocket();
  const { toast } = useToast();

  const [matchDetail, paramsDetail] = useRoute<{ id: string }>("/support/:id");
  const routeId = matchDetail ? Number(paramsDetail?.id) : null;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveIdState] = useState<number | null>(
    routeId && Number.isFinite(routeId) ? routeId : null,
  );
  const [showBot, setShowBot] = useState(false);
  const [detail, setDetail] = useState<ThreadDetail | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingAdmin, setTypingAdmin] = useState(false);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const myTypingTimeout = useRef<NodeJS.Timeout | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const setActiveId = useCallback((id: number | null) => {
    setActiveIdState(id);
    setShowBot(false);
    setLocation(id == null ? "/support" : `/support/${id}`);
  }, [setLocation]);

  useEffect(() => {
    if (routeId && Number.isFinite(routeId)) {
      setActiveIdState(routeId);
      setShowBot(false);
    } else if (!matchDetail) {
      setActiveIdState(null);
    }
  }, [matchDetail, routeId]);

  // No redirect — support page is publicly accessible (required by Apple App Store)

  const loadThreads = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiFetch<Thread[]>("/api/support/threads");
      setThreads(data);
    } catch (e: any) {
      setError(e.message);
    }
  }, [user]);

  useEffect(() => {
    loadThreads();
    const interval = setInterval(loadThreads, 30000);
    return () => clearInterval(interval);
  }, [loadThreads]);

  const loadDetail = useCallback(async (id: number) => {
    try {
      const data = await apiFetch<ThreadDetail>(`/api/support/threads/${id}`);
      setDetail(data);
      setThreads((prev) =>
        prev.map((t) => (t.id === id ? { ...t, unreadByUser: 0 } : t)),
      );
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (!activeId) { setDetail(null); return; }
    loadDetail(activeId);
  }, [activeId, loadDetail]);

  // WebSocket: join/leave thread room when activeId changes
  useEffect(() => {
    if (!activeId) return;
    socket.joinSupport(activeId);

    const unsubMsg = socket.onSupportMessage((msg) => {
      if (msg.threadId !== activeId) { loadThreads(); return; }
      setDetail((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
      setThreads((prev) =>
        prev.map((t) =>
          t.id === activeId
            ? { ...t, lastMessage: msg.content, lastMessageAt: msg.createdAt }
            : t,
        ),
      );
    });

    const unsubTyping = socket.onSupportTyping(({ threadId, userId }) => {
      if (threadId !== activeId || userId === user?.id) return;
      setTypingAdmin(true);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => setTypingAdmin(false), 3000);
    });

    const unsubStop = socket.onSupportStopTyping(({ threadId, userId }) => {
      if (threadId !== activeId || userId === user?.id) return;
      setTypingAdmin(false);
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
    });

    const unsubUpdate = socket.onSupportUpdate((data) => {
      if (data?.threadId !== activeId) return;
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              status: data.status ?? prev.status,
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
      if (data?.event === "agent_joined" && data.assignedAdminName) {
        toast({
          title: t("support.agentJoined", { defaultValue: "A human agent joined" }),
          description: data.assignedAdminName,
        });
      }
      loadThreads();
    });

    return () => {
      socket.leaveSupport(activeId);
      if (typeof unsubMsg === "function") unsubMsg();
      if (typeof unsubTyping === "function") unsubTyping();
      if (typeof unsubStop === "function") unsubStop();
      if (typeof unsubUpdate === "function") unsubUpdate();
    };
  }, [activeId, user?.id, loadThreads]);

  // Listen for messages on other threads (badge updates)
  useEffect(() => {
    const unsub = socket.onSupportMessage((msg) => {
      if (msg.threadId === activeId) return;
      setThreads((prev) =>
        prev.map((t) =>
          t.id === msg.threadId
            ? {
                ...t,
                lastMessage: msg.content,
                lastMessageAt: msg.createdAt,
                unreadByUser: msg.isAdminReply ? t.unreadByUser + 1 : t.unreadByUser,
              }
            : t,
        ),
      );
    });
    return () => { if (typeof unsub === "function") unsub(); };
  }, [activeId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length, typingAdmin]);

  const handleTyping = () => {
    if (!activeId || !user) return;
    socket.emitSupportTyping(activeId, user.id, user.name ?? "User");
    if (myTypingTimeout.current) clearTimeout(myTypingTimeout.current);
    myTypingTimeout.current = setTimeout(() => {
      socket.emitSupportStopTyping(activeId, user.id);
    }, 2000);
  };

  const send = async () => {
    if (!activeId || !text.trim() || sending) return;
    setSending(true);
    if (myTypingTimeout.current) clearTimeout(myTypingTimeout.current);
    socket.emitSupportStopTyping(activeId, user!.id);
    try {
      const msg = await apiFetch<Message>(`/api/support/threads/${activeId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: text.trim() }),
      });
      setText("");
      setDetail((prev) => {
        if (!prev) return prev;
        if (prev.messages.some((m) => m.id === msg.id)) return prev;
        return { ...prev, messages: [...prev.messages, msg] };
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const handleBotEscalate = useCallback(async (threadId: number) => {
    await loadThreads();
    setActiveId(threadId);
  }, [loadThreads, setActiveId]);

  const openBot = () => {
    setActiveIdState(null);
    setShowBot(true);
    setLocation("/support");
  };

  if (!user) return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-[#F4F7F5] px-6 py-16">
      <img src={OFFICIAL_LOGO} alt="Flexa Market" className="h-14 w-14" width={56} height={56} />
      <div className="max-w-sm text-center">
        <h1 className="mb-2 text-2xl font-bold text-slate-900">{t("support.guestTitle", { defaultValue: "Flexa Market Support" })}</h1>
        <p className="text-sm leading-relaxed text-slate-600">
          {t("support.guestDesc", { defaultValue: "Need help? Our support team is available 7 days a week. Sign in to open a ticket or chat with an agent." })}
        </p>
      </div>
      <div className="w-full max-w-sm space-y-3">
        <Link href="/auth/login">
          <button
            type="button"
            className="w-full rounded-xl py-3 text-sm font-semibold text-white transition-colors"
            style={{ background: BRAND_GREEN }}
          >
            {t("support.guestLogin", { defaultValue: "Sign in to contact support" })}
          </button>
        </Link>
        <Link href="/contact">
          <button className="w-full py-3 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-accent transition-colors">
            {t("support.guestContact", { defaultValue: "Wè enfòmasyon kontakt" })}
          </button>
        </Link>
        <Link href="/faq">
          <button className="w-full py-3 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-accent transition-colors">
            {t("support.guestFaq", { defaultValue: "Wè FAQ" })}
          </button>
        </Link>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        {t("support.guestEmail", { defaultValue: "Email: support@flexamarket.com · Disponib 8h–20h (EST)" })}
      </p>
    </div>
  );

  // On mobile: show chat panel when a thread or bot is active
  const mobileShowChat = showBot || !!activeId;

  // ── Shared right-panel content ──────────────────────────────────────────────
  const rightPanel = showBot ? (
    <BotChatView user={user} onEscalate={handleBotEscalate} />
  ) : activeId && detail ? (
    <>
      {/* Thread detail header */}
      <div
        className="flex shrink-0 items-center gap-3 border-b px-3 py-2.5 text-white"
        style={{ background: BRAND_GREEN }}
      >
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 md:hidden"
          onClick={() => { setActiveId(null); setShowBot(false); }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <img src={OFFICIAL_LOGO} alt="" className="hidden h-8 w-8 rounded-full bg-white/10 p-0.5 md:block" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{detail.subject}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-white/80">
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", detail.status === "closed" ? "bg-white/50" : "bg-emerald-300")} />
            {detail.ticketRef ? `#${detail.ticketRef}` : `#${detail.id}`}
            {" · "}
            {detail.status === "closed"
              ? t("support.closed", { defaultValue: "Closed" })
              : t("support.open", { defaultValue: "Open" })}
            {detail.assignedAdminName ? ` · ${detail.assignedAdminName}` : ""}
          </p>
        </div>
        {detail.status === "closed" && (
          <Badge className="shrink-0 gap-0.5 bg-white/15 text-xs text-white hover:bg-white/15">
            <Lock className="h-2.5 w-2.5" />
            Closed
          </Badge>
        )}
      </div>

      {detail.estimatedResponseLabel && detail.status !== "closed" ? (
        <div
          className="mx-3 mt-3 rounded-xl border px-3 py-2 text-xs"
          style={{ borderColor: "hsla(152,65%,18%,0.2)", background: BRAND_GREEN_SOFT, color: BRAND_GREEN }}
        >
          <p className="font-bold">Estimated response time</p>
          <p className="opacity-90">{detail.estimatedResponseLabel}</p>
          {detail.assignedAdminName ? <p className="mt-0.5 opacity-90">Agent: {detail.assignedAdminName}</p> : null}
        </div>
      ) : null}

      {/* Messages */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3">
        <div className="flex-1" />
        <div className="space-y-3">
          {detail.messages.map((m) => {
            const isBot = m.senderRole === "bot";
            const mine = m.senderId === user.id && !isBot;
            const isAgent = !mine && (m.isAdminReply || isBot);
            return (
              <div
                key={m.id}
                className={cn("flex gap-2.5", mine && "flex-row-reverse")}
                data-testid={`msg-${m.id}`}
              >
                <Avatar className="mt-0.5 h-8 w-8 shrink-0">
                  {isBot ? (
                    <AvatarFallback style={{ background: BRAND_GREEN_SOFT, color: BRAND_GREEN }}>
                      <Bot className="h-3.5 w-3.5" />
                    </AvatarFallback>
                  ) : (
                    <>
                      <AvatarImage src={m.senderAvatar ?? undefined} />
                      <AvatarFallback
                        className="text-xs font-semibold text-white"
                        style={{ background: m.isAdminReply ? BRAND_GREEN : "#64748b" }}
                      >
                        {m.isAdminReply ? <Headphones className="h-3.5 w-3.5" /> : m.senderName[0]}
                      </AvatarFallback>
                    </>
                  )}
                </Avatar>
                <div className={cn("flex max-w-[78%] flex-col gap-0.5", mine && "items-end")}>
                  <div className="flex items-center gap-1.5 px-1 text-[10px] text-slate-500">
                    <span className="font-semibold">{isBot ? "FlexaBot" : m.senderName}</span>
                    {isBot && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white" style={{ background: BRAND_GREEN }}>
                        AI
                      </span>
                    )}
                    {!isBot && m.isAdminReply && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">
                        Support Agent
                      </span>
                    )}
                    <span>{formatTimeAgo(m.createdAt)}</span>
                    {mine && (m.isRead
                      ? <CheckCheck className="h-3 w-3 text-emerald-600" />
                      : <Check className="h-3 w-3 text-slate-400" />)}
                  </div>
                  <div
                    className={cn(
                      "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm",
                      mine && "rounded-br-md text-white",
                      isBot && "rounded-bl-md border border-slate-200 bg-white text-slate-800",
                      !mine && m.isAdminReply && "rounded-bl-md text-white",
                      !mine && !isAgent && "rounded-bl-md bg-slate-100 text-slate-800",
                    )}
                    style={
                      mine || (!mine && m.isAdminReply)
                        ? { background: BRAND_GREEN }
                        : undefined
                    }
                  >
                    {m.mediaUrl && (m.messageType === "image") ? (
                      <a href={m.mediaUrl} target="_blank" rel="noreferrer" className="mb-1 block overflow-hidden rounded-lg">
                        <img src={m.mediaUrl} alt={m.mediaName || "attachment"} className="max-h-48 max-w-full object-cover" />
                      </a>
                    ) : null}
                    {m.content}
                  </div>
                </div>
              </div>
            );
          })}
          {typingAdmin && (
            <div className="flex items-center gap-2.5 pl-10">
              <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-white px-3 py-2">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
              </div>
              <span className="text-xs italic text-slate-500">{t("support.typing")}</span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      {detail.status !== "closed" ? (
        <div className="flex shrink-0 gap-2 border-t border-slate-200 bg-white px-3 py-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Input
            value={text}
            onChange={(e) => { setText(e.target.value); handleTyping(); }}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            onBlur={() => { if (activeId && user) socket.emitSupportStopTyping(activeId, user.id); }}
            placeholder={t("support.typeMessage", { defaultValue: "Write a reply…" })}
            disabled={sending}
            className="rounded-full border-slate-200 bg-slate-50 focus-visible:ring-1"
            data-testid="input-reply"
          />
          <Button
            onClick={send}
            disabled={!text.trim() || sending}
            size="icon"
            className="shrink-0 rounded-full text-white"
            style={{ background: BRAND_GREEN }}
            data-testid="button-send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="shrink-0 space-y-2 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-xs text-slate-500">
            {t("support.closedNotice", { defaultValue: "This conversation is closed. Open a new request if you need more help." })}
          </p>
          {detail.rating == null ? (
            <div className="flex flex-col items-center gap-1.5">
              <p className="text-xs font-medium">
                {t("support.ratePrompt", { defaultValue: "How was your support experience?" })}
              </p>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={ratingBusy}
                    className="rounded-full p-1.5 hover:bg-amber-100 disabled:opacity-50"
                    aria-label={`Rate ${n}`}
                    onClick={async () => {
                      if (!activeId || ratingBusy) return;
                      setRatingBusy(true);
                      try {
                        await apiFetch(`/api/support/threads/${activeId}/rate`, {
                          method: "POST",
                          body: JSON.stringify({ rating: n }),
                        });
                        setDetail((prev) => (prev ? { ...prev, rating: n } : prev));
                        toast({ title: t("support.rateThanks", { defaultValue: "Thank you for your feedback" }) });
                      } catch (e: any) {
                        toast({ title: e.message ?? "Error", variant: "destructive" });
                      } finally {
                        setRatingBusy(false);
                      }
                    }}
                  >
                    <Star className="h-5 w-5 text-amber-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-center text-xs font-medium text-amber-600">
              {t("support.rated", { defaultValue: "You rated this conversation" })}: {detail.rating}/5
            </p>
          )}
        </div>
      )}
    </>
  ) : activeId && !detail ? (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <img src={OFFICIAL_LOGO} alt="Flexa Market" className="h-14 w-14" width={56} height={56} />
      <div>
        <p className="mb-1 text-base font-bold text-slate-900">{t("support.welcomeTitle", { defaultValue: "Flexa Market Support" })}</p>
        <p className="max-w-xs text-sm leading-relaxed text-slate-500">
          {t("support.welcomeText", { defaultValue: "Chat with FlexaBot or open a ticket for a human agent." })}
        </p>
      </div>
      <Button
        onClick={openBot}
        data-testid="button-start-bot-empty"
        className="rounded-full px-6 text-white"
        style={{ background: BRAND_GREEN }}
      >
        <Bot className="mr-2 h-4 w-4" />
        {t("support.startBot", { defaultValue: "Chat with FlexaBot" })}
      </Button>
    </div>
  );

  // ── Thread list sidebar ─────────────────────────────────────────────────────
  const threadList = (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {t("support.yourThreads", { defaultValue: "Your tickets" })}
        </p>
        <button
          type="button"
          onClick={openBot}
          className="flex items-center gap-1.5 text-xs font-bold transition-colors"
          style={{ color: BRAND_GREEN }}
          data-testid="button-new-thread-inline"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("support.newThread", { defaultValue: "New" })}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <button
          type="button"
          onClick={openBot}
          className={cn(
            "flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition-colors hover:bg-slate-50",
            showBot && "bg-emerald-50/80",
          )}
          data-testid="button-new-bot-session"
        >
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: BRAND_GREEN_SOFT }}>
            <Bot className="h-5 w-5" style={{ color: BRAND_GREEN }} />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900">FlexaBot AI</p>
            <p className="truncate text-xs text-slate-500">{t("support.talkToBot", { defaultValue: "Get instant help or talk to an agent" })}</p>
          </div>
        </button>

        {threads.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center px-6 gap-2">
            <p className="text-sm text-muted-foreground">{t("support.botCta")}</p>
          </div>
        )}

        {threads.map((th) => (
          <button
            key={th.id}
            type="button"
            onClick={() => setActiveId(th.id)}
            className={cn(
              "flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3.5 text-left transition-colors hover:bg-slate-50",
              activeId === th.id && !showBot && "bg-emerald-50/80",
            )}
            data-testid={`thread-item-${th.id}`}
          >
            <div
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
              style={{ background: th.status !== "closed" ? BRAND_GREEN_SOFT : "#F1F5F9" }}
            >
              <MessageSquare
                className="h-[18px] w-[18px]"
                style={{ color: th.status !== "closed" ? BRAND_GREEN : "#94A3B8" }}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] text-slate-500">#{th.ticketRef || th.id}</p>
              <div className="mb-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">{th.subject}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {th.unreadByUser > 0 && (
                    <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {th.unreadByUser}
                    </span>
                  )}
                  {th.lastMessageAt && (
                    <span className="text-[10px] text-muted-foreground">{formatTimeAgo(th.lastMessageAt)}</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {th.status === "closed" ? `🔒 ${t("support.closed", { defaultValue: "Fèmen" })} · ` : ""}{th.lastMessage ?? "—"}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh max-h-dvh w-full flex-col overflow-hidden bg-[#F4F7F5]" data-testid="smart-support-customer">
      {/* Brand header — replaces marketplace chrome */}
      <header className="shrink-0 text-white" style={{ background: BRAND_GREEN }} data-testid="support-brand-header">
        <div className="flex items-center gap-2 px-3 py-2.5">
          {mobileShowChat ? (
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 md:hidden"
              onClick={() => { setActiveId(null); setShowBot(false); }}
              aria-label="Back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLocation("/settings")}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-white/10"
              data-testid="button-back-settings"
              aria-label="Back"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <img src={OFFICIAL_LOGO} alt="Flexa Market" className="h-8 w-8 rounded-full bg-white/10 p-0.5" width={32} height={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold leading-tight">
              {mobileShowChat
                ? (showBot ? "FlexaBot" : (detail?.subject ?? "Support"))
                : "Flexa Market Support"}
            </p>
            <p className="truncate text-[10px] text-white/75">
              {mobileShowChat && detail?.ticketRef
                ? `#${detail.ticketRef}`
                : "Help & live assistance"}
            </p>
          </div>
          {!mobileShowChat && (
            <Button
              size="sm"
              onClick={openBot}
              className="h-8 rounded-full bg-white/15 px-3 text-xs text-white hover:bg-white/25"
              data-testid="button-new-thread"
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              New
            </Button>
          )}
        </div>
      </header>

      {error && (
        <div className="mx-3 mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700" data-testid="support-error">
          {error}
          <button type="button" className="ml-2 text-xs underline" onClick={() => setError(null)}>
            {t("support.close", { defaultValue: "Close" })}
          </button>
        </div>
      )}

      {/* Two-column: inbox | conversation */}
      <div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]">
        <div className={cn("min-h-0 border-r border-slate-200", mobileShowChat ? "hidden md:flex md:flex-col" : "flex flex-col")}>
          {threadList}
        </div>
        <div className={cn("min-h-0", mobileShowChat ? "flex flex-col" : "hidden md:flex md:flex-col")}>
          {rightPanel}
        </div>
      </div>
    </div>
  );
}
