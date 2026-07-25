import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useRoute, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft, MessageSquare, Send, Shield, Plus, Lock,
  Check, CheckCheck, Bot, Loader2, CheckCircle2,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useSocket } from "@/hooks/useSocket";

// ── Types ──────────────────────────────────────────────────────────────────────

type Thread = {
  id: number;
  subject: string;
  status: "open" | "closed";
  userId: number;
  userName: string;
  userAvatar: string | null;
  assignedAdminId: number | null;
  assignedAdminName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  unreadByUser: number;
  unreadByAdmin: number;
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
    addBotMsg("Yon ajan pral reponn ou byento. Tanpri rete konekte. ⏳");
    await new Promise<void>((r) => setTimeout(r, 700));
    try {
      const botHistory = currentMsgs.map((m) => ({ role: m.role, content: m.content }));
      const lastUserMsg =
        [...currentMsgs].reverse().find((m) => m.role === "user")?.content ?? "Eskalasyon bot";
      const r = await apiFetch<{ id: number }>("/api/support/threads", {
        method: "POST",
        body: JSON.stringify({
          subject: topic.length > 3 ? topic : "Sipò jeneral",
          message: lastUserMsg,
          botHistory,
        }),
      });
      setEscalated(true);
      setTimeout(() => onEscalate(r.id), 1000);
    } catch {
      addBotMsg("Oops, yon erè pase. Tanpri eseye ankò nan kèk segonn.");
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
    <div className="flex flex-col h-full">
      {/* Bot header */}
      <div className="p-3 border-b border-border bg-gradient-to-r from-primary/5 to-primary/10 flex items-center gap-2 flex-shrink-0">
        <div className="h-8 w-8 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">FLEXA Bot</p>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" />
            En liy · Repons imedya
          </p>
        </div>
        {escalated && (
          <Badge className="bg-green-600 hover:bg-green-600 text-white text-[10px]">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Transfere
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col">
        <div className="flex-1" />
        <div className="space-y-2">
        {msgs.map((m) => (
          <div key={m.id} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {m.role === "bot" ? (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            ) : (
              <Avatar className="h-7 w-7 flex-shrink-0 mt-0.5">
                <AvatarFallback>{(user.name?.[0] ?? "U").toUpperCase()}</AvatarFallback>
              </Avatar>
            )}
            <div className={`max-w-[78%] flex flex-col ${m.role === "user" ? "items-end" : ""}`}>
              <div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-muted-foreground">
                <span className="font-medium">{m.role === "bot" ? "Bot" : (user.name ?? "Ou")}</span>
                {m.role === "bot" && (
                  <Badge className="text-[8px] h-3.5 px-1 bg-primary/70 hover:bg-primary/70">IA</Badge>
                )}
                <span>{formatTimeAgo(m.ts)}</span>
              </div>
              <div
                className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-slate-100 dark:bg-slate-800 rounded-bl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          </div>
        ))}

        {/* Bot typing indicator */}
        {botTyping && (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="px-3 py-2 rounded-2xl rounded-bl-sm bg-slate-100 dark:bg-slate-800 flex gap-0.5 items-center h-9">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        {escalating && !escalated && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pl-9">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Koneksyon ak ajan...
          </div>
        )}

        <div ref={bottomRef} />
        </div>
      </div>

      {/* Quick replies */}
      {quickReplies && quickReplies.length > 0 && !escalating && !escalated && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
          {quickReplies.map((qr) => (
            <button
              key={qr.id}
              onClick={() => handleQuickReply(qr)}
              className="px-3 py-1.5 rounded-full border border-primary/30 text-xs font-medium text-primary bg-primary/5 hover:bg-primary/15 transition-colors"
              data-testid={`bot-quick-${qr.id}`}
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {/* Input bar */}
      <div className="border-t border-border p-3 flex gap-2 flex-shrink-0">
        <Input
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), handleSend())}
          placeholder={escalated ? "Transfere bay ajan..." : "Ekri yon mesaj..."}
          disabled={botTyping || escalating || escalated}
          data-testid="bot-input"
        />
        <Button
          onClick={handleSend}
          disabled={!inputText.trim() || botTyping || escalating || escalated}
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
      setDetail((prev) => (prev ? { ...prev, status: data.status ?? prev.status } : prev));
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
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-6 py-16">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <MessageSquare className="h-8 w-8 text-primary" />
      </div>
      <div className="text-center max-w-sm">
        <h1 className="text-2xl font-bold text-foreground mb-2">Sipò FLEXA MARKET</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Bezwen èd? Ekip sipò nou disponib 7 jou sou 7. Konekte pou ouvri yon tikè oswa chatte ak yon ajan.
        </p>
      </div>
      <div className="w-full max-w-sm space-y-3">
        <Link href="/auth/login">
          <button className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors">
            Konekte pou kontakte sipò
          </button>
        </Link>
        <Link href="/contact">
          <button className="w-full py-3 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-accent transition-colors">
            Wè enfòmasyon kontakt
          </button>
        </Link>
        <Link href="/faq">
          <button className="w-full py-3 rounded-xl border border-border text-foreground font-semibold text-sm hover:bg-accent transition-colors">
            Wè FAQ
          </button>
        </Link>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Email: support@flexamarket.com · Disponib 8h–20h (EST)
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
      <div className="px-4 py-3 border-b border-border flex items-center gap-3 flex-shrink-0 bg-muted/20">
        <button
          className="md:hidden w-8 h-8 rounded-full flex items-center justify-center hover:bg-accent transition-colors"
          onClick={() => { setActiveId(null); setShowBot(false); }}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{detail.subject}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${detail.status === "open" ? "bg-green-500" : "bg-muted-foreground"}`} />
            {detail.status === "closed"
              ? t("support.closed", { defaultValue: "Fèmen" })
              : t("support.open", { defaultValue: "Ouvè" })}
            {detail.assignedAdminName && ` · ${detail.assignedAdminName}`}
          </p>
        </div>
        {detail.status === "closed" && (
          <Badge variant="secondary" className="text-xs gap-0.5 flex-shrink-0">
            <Lock className="h-2.5 w-2.5" />
            {t("support.closed", { defaultValue: "Fèmen" })}
          </Badge>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {detail.messages.map((m) => {
          const isBot = m.senderRole === "bot";
          const mine = m.senderId === user.id && !isBot;
          return (
            <div
              key={m.id}
              className={`flex gap-2.5 ${mine ? "flex-row-reverse" : ""}`}
              data-testid={`msg-${m.id}`}
            >
              <Avatar className="h-8 w-8 flex-shrink-0 mt-0.5">
                {isBot ? (
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="h-3.5 w-3.5" />
                  </AvatarFallback>
                ) : (
                  <>
                    <AvatarImage src={m.senderAvatar ?? undefined} />
                    <AvatarFallback className={m.isAdminReply ? "bg-purple-600 text-white" : "bg-muted"}>
                      {m.isAdminReply ? <Shield className="h-3.5 w-3.5" /> : m.senderName[0]}
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
              <div className={`max-w-[75%] flex flex-col gap-0.5 ${mine ? "items-end" : ""}`}>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground px-1">
                  <span className="font-semibold">{isBot ? "Bot" : m.senderName}</span>
                  {isBot && <Badge className="text-[8px] h-3.5 px-1 bg-primary/70 hover:bg-primary/70">IA</Badge>}
                  {!isBot && m.isAdminReply && <Badge className="text-[8px] h-3.5 px-1 bg-purple-600 hover:bg-purple-600">{t("support.staff", { defaultValue: "Sipò" })}</Badge>}
                  <span>{formatTimeAgo(m.createdAt)}</span>
                  {mine && (m.isRead
                    ? <CheckCheck className="h-3 w-3 text-blue-500" />
                    : <Check className="h-3 w-3 text-muted-foreground" />)}
                </div>
                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
                  isBot ? "bg-muted rounded-tl-sm"
                  : mine ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : m.isAdminReply ? "bg-purple-100 dark:bg-purple-950/60 rounded-tl-sm"
                  : "bg-muted rounded-tl-sm"
                }`}>
                  {m.content}
                </div>
              </div>
            </div>
          );
        })}
        {typingAdmin && (
          <div className="flex items-center gap-2.5 pl-10">
            <div className="flex gap-1 items-center px-3 py-2 rounded-2xl bg-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-xs text-muted-foreground italic">{t("support.typing")}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {detail.status === "open" ? (
        <div className="border-t border-border px-4 py-3 flex gap-2 flex-shrink-0 bg-background">
          <Input
            value={text}
            onChange={(e) => { setText(e.target.value); handleTyping(); }}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())}
            onBlur={() => { if (activeId && user) socket.emitSupportStopTyping(activeId, user.id); }}
            placeholder={t("support.typeMessage", { defaultValue: "Ekri yon repons..." })}
            disabled={sending}
            className="rounded-full bg-muted border-0 focus-visible:ring-1"
            data-testid="input-reply"
          />
          <Button onClick={send} disabled={!text.trim() || sending} size="icon" className="rounded-full shrink-0" data-testid="button-send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="border-t border-border px-4 py-3 text-center text-xs text-muted-foreground flex-shrink-0">
          {t("support.closedNotice", { defaultValue: "Konvèsasyon sa a fèmen. Ouvri yon nouvo demand si w bezwen plis èd." })}
        </div>
      )}
    </>
  ) : activeId && !detail ? (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ) : (
    /* Desktop welcome splash — only shown when no thread selected */
    <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-4">
      <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
        <MessageSquare className="h-8 w-8 text-primary" />
      </div>
      <div>
        <p className="font-semibold text-base mb-1">{t("support.welcomeTitle")}</p>
        <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{t("support.welcomeText")}</p>
      </div>
      <Button onClick={openBot} data-testid="button-start-bot-empty" className="rounded-full px-6">
        <Bot className="h-4 w-4 mr-2" />
        {t("support.startBot")}
      </Button>
    </div>
  );

  // ── Thread list sidebar ─────────────────────────────────────────────────────
  const threadList = (
    <div className="flex flex-col h-full">
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between flex-shrink-0">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          {t("support.yourThreads", { defaultValue: "Demand ou yo" })}
        </p>
        <button
          onClick={openBot}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
          data-testid="button-new-thread-inline"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("support.newThread", { defaultValue: "Nouvo" })}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Bot entry — always at top */}
        <button
          onClick={openBot}
          className={`w-full text-left px-4 py-3.5 border-b border-border/60 hover:bg-accent transition-colors flex items-center gap-3 ${showBot ? "bg-accent" : ""}`}
          data-testid="button-new-bot-session"
        >
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 relative">
            <Bot className="h-5 w-5 text-primary" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t("support.newRequest")}</p>
            <p className="text-xs text-muted-foreground truncate">{t("support.talkToBot")}</p>
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
            onClick={() => setActiveId(th.id)}
            className={`w-full text-left px-4 py-3.5 border-b border-border/60 hover:bg-accent transition-colors flex items-start gap-3 ${activeId === th.id && !showBot ? "bg-accent" : ""}`}
            data-testid={`thread-item-${th.id}`}
          >
            {/* Status indicator avatar */}
            <div className={`h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${th.status === "open" ? "bg-primary/10" : "bg-muted"}`}>
              <MessageSquare className={`h-4.5 w-4.5 ${th.status === "open" ? "text-primary" : "text-muted-foreground"}`} style={{ width: "18px", height: "18px" }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="font-semibold text-sm truncate">{th.subject}</span>
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
    <div className="max-w-5xl mx-auto pb-24">

      {/* ── Page header — only visible when showing list on mobile ── */}
      <div className={`px-4 pt-4 pb-3 flex items-center gap-3 ${mobileShowChat ? "md:flex hidden" : "flex"}`}>
        <button
          onClick={() => setLocation("/settings")}
          className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground"
          data-testid="button-back-settings"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            {t("support.title", { defaultValue: "Sipò" })}
          </h1>
        </div>
        <Button size="sm" onClick={openBot} className="rounded-full text-xs h-8 px-3" data-testid="button-new-thread">
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t("support.newThread", { defaultValue: "Nouvo" })}
        </Button>
      </div>

      {/* ── Mobile back header — only when chat is open on mobile ── */}
      {mobileShowChat && (
        <div className="md:hidden px-4 pt-4 pb-2 flex items-center gap-3">
          <button
            onClick={() => { setActiveId(null); setShowBot(false); }}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="font-semibold text-sm">
            {showBot ? t("support.newRequest") : detail?.subject ?? "..."}
          </span>
        </div>
      )}

      {error && (
        <div className="mx-4 mb-3 p-3 bg-destructive/10 text-destructive rounded-xl text-sm" data-testid="support-error">
          {error}
          <button className="ml-2 underline text-xs" onClick={() => setError(null)}>{t("support.close")}</button>
        </div>
      )}

      {/* ── Two-column layout ─────────────────────────────────────────── */}
      <div className="md:grid md:grid-cols-[300px_1fr] md:gap-4 md:px-4">

        {/* Thread list — hidden on mobile when chat open */}
        <Card className={`overflow-hidden flex flex-col rounded-none md:rounded-xl border-x-0 md:border-x md:h-[calc(100vh-180px)] ${mobileShowChat ? "hidden md:flex" : "flex"}`}>
          {threadList}
        </Card>

        {/* Right chat panel — hidden on mobile when list shown */}
        <Card className={`overflow-hidden flex flex-col rounded-none md:rounded-xl border-x-0 md:border-x md:h-[calc(100vh-180px)] ${mobileShowChat ? "flex h-[calc(100vh-130px)]" : "hidden md:flex"}`}>
          {rightPanel}
        </Card>

      </div>

    </div>
  );
}
