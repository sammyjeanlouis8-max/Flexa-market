import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bot, Send, Sparkles, Trash2, User as UserIcon, MessageSquare, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_HISTORY = 40;
const STORAGE_PREFIX = "flexamarket_chatbot_history_";

const ESCALATE_KEYWORDS = [
  "human", "agent", "ajan", "live", "person", "persone",
  "ede m", "mwen bezwen yon moun", "real person", "pa konprann",
  "pa ka rezoud", "sipò", "support", "cannot help", "pa ka ede",
];

function needsEscalation(text: string): boolean {
  const lower = text.toLowerCase();
  return ESCALATE_KEYWORDS.some(kw => lower.includes(kw));
}

function storageKeyFor(userId: number | string | undefined): string | null {
  if (userId === undefined || userId === null) return null;
  return `${STORAGE_PREFIX}${userId}`;
}

function loadHistory(key: string | null): ChatMessage[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(key: string | null, messages: ChatMessage[]) {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-MAX_HISTORY)));
  } catch { /* ignore quota errors */ }
}

export default function Chatbot() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const storageKey = storageKeyFor(user?.id);
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(storageKey));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadHistory(storageKey));
  }, [storageKey]);

  useEffect(() => {
    saveHistory(storageKey, messages);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // Show escalate banner after 3+ bot replies or if bot mentions contacting support
    const botReplies = messages.filter(m => m.role === "assistant");
    if (botReplies.length >= 3) setShowEscalate(true);
    if (botReplies.length > 0) {
      const lastBot = botReplies[botReplies.length - 1].content.toLowerCase();
      if (needsEscalation(lastBot)) setShowEscalate(true);
    }
  }, [messages, storageKey]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const greeting = (() => {
    const lang = i18n.language;
    if (lang.startsWith("ht")) return "Bonjou! Mwen se FlexaBot. Kòman m ka ede w jodi a?";
    if (lang.startsWith("fr")) return "Bonjour ! Je suis FlexaBot. Comment puis-je vous aider aujourd'hui ?";
    if (lang.startsWith("es")) return "¡Hola! Soy FlexaBot. ¿En qué puedo ayudarte hoy?";
    if (lang.startsWith("pt")) return "Olá! Eu sou o FlexaBot. Como posso ajudar você hoje?";
    return "Hi! I'm FlexaBot. How can I help you today?";
  })();

  const suggestions = (() => {
    const lang = i18n.language;
    if (lang.startsWith("ht")) {
      return [
        "Kijan pou mwen poste yon anons?",
        "Kòman MonCash mache?",
        "Kijan pou mwen evite eskwo?",
      ];
    }
    if (lang.startsWith("fr")) {
      return [
        "Comment publier une annonce ?",
        "Comment fonctionne MonCash ?",
        "Comment éviter les arnaques ?",
      ];
    }
    if (lang.startsWith("es")) {
      return [
        "¿Cómo publico un anuncio?",
        "¿Cómo funciona MonCash?",
        "¿Cómo evito las estafas?",
      ];
    }
    if (lang.startsWith("pt")) {
      return [
        "Como publicar um anúncio?",
        "Como funciona o MonCash?",
        "Como evitar golpes?",
      ];
    }
    return [
      "How do I post a listing?",
      "How does MonCash work?",
      "How do I avoid scams?",
    ];
  })();

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setError(null);

    if (needsEscalation(trimmed)) {
      setShowEscalate(true);
    }

    const next: ChatMessage[] = [...messages, { role: "user" as const, content: trimmed }].slice(-MAX_HISTORY);
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const apiBase = (window as any).__API_BASE__ ?? "";
      const token = localStorage.getItem("flexamarket_token") ?? "";
      const resp = await fetch(`${apiBase}/api/chatbot/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ messages: next }),
      });

      if (!resp.ok || !resp.body) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody?.error ?? `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimLine = line.trim();
          if (!trimLine.startsWith("data:")) continue;
          try {
            const parsed = JSON.parse(trimLine.slice(5).trim());
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.content) accumulated += parsed.content;
            if (parsed.done) break;
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }

      setMessages(curr => [
        ...curr,
        { role: "assistant" as const, content: accumulated || "…" },
      ].slice(-MAX_HISTORY));
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setSending(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  async function escalateToAgent() {
    if (escalating) return;
    setEscalating(true);
    try {
      const contextLines = messages
        .slice(-10)
        .map(m => `${m.role === "user" ? "Itilizatè" : "FlexaBot"}: ${m.content}`)
        .join("\n");
      const subject = "Demann sipò ki soti nan FlexaBot";
      const message = contextLines.length > 0
        ? `Itilizatè a t ap pale ak FlexaBot epi li bezwen yon ajan reyèl.\n\nKonvèsasyon an:\n${contextLines}`
        : "Itilizatè a bezwen sipò yon ajan reyèl.";
      const r = await apiFetch<{ id: number }>("/api/support/threads", {
        method: "POST",
        body: JSON.stringify({ subject, message }),
      });
      setLocation(`/support/${r.id}`);
    } catch (err: any) {
      setError(err?.message ?? "Erè pandan koneksyon");
      setEscalating(false);
    }
  }

  function clearChat() {
    setMessages([]);
    setShowEscalate(false);
    if (storageKey) localStorage.removeItem(storageKey);
    setError(null);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  if (!user) {
    return (
      <div className="container max-w-2xl mx-auto p-6">
        <Card className="p-8 text-center">
          <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">
            {t("chatbot.signInRequired", { defaultValue: "Please sign in to chat with FlexaBot." })}
          </p>
          <Link href="/auth/login"><Button>Konekte</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto p-4 md:p-6 flex flex-col h-[calc(100vh-9rem)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-tight">FlexaBot</h1>
            <p className="text-xs text-muted-foreground">
              {t("chatbot.subtitle", { defaultValue: "Your FLEXA MARKET assistant" })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation("/support")}
            className="hidden sm:flex items-center gap-1.5 text-xs h-8"
            data-testid="button-live-support"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {t("chatbot.liveSupport")}
          </Button>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearChat}
              className="text-muted-foreground"
              data-testid="button-clear-chat"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("chatbot.clear", { defaultValue: "Clear" })}
            </Button>
          )}
        </div>
      </div>

      {/* Escalation banner */}
      {showEscalate && (
        <div className="mb-3 flex items-center justify-between gap-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl px-4 py-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <MessageSquare className="h-4 w-4 text-purple-600 flex-shrink-0" />
            <p className="text-sm text-purple-800 dark:text-purple-200">
              {t("chatbot.botCantResolve")}
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white flex-shrink-0"
            onClick={escalateToAgent}
            disabled={escalating}
            data-testid="button-escalate-agent"
          >
            {escalating ? (
              <><Loader2 className="h-3 w-3 mr-1.5 animate-spin" />{t("chatbot.connecting")}</>
            ) : (
              t("chatbot.talkToAgent")
            )}
          </Button>
        </div>
      )}

      <Card className="flex-1 overflow-hidden flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4" data-testid="chat-messages">
          <div className={`flex flex-col gap-4 min-h-full ${messages.length > 0 ? "justify-end" : ""}`}>
          {messages.length === 0 && (
            <div className="flex flex-col items-center text-center gap-4 py-8">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground max-w-md">{greeting}</p>
              <div className="flex flex-col gap-2 w-full max-w-sm">
                {suggestions.map(s => (
                  <Button
                    key={s}
                    variant="outline"
                    size="sm"
                    className="justify-start text-left h-auto py-2 whitespace-normal"
                    onClick={() => send(s)}
                    data-testid="suggestion-button"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}
              data-testid={`message-${m.role}`}
            >
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className={m.role === "user" ? "bg-primary/15" : "bg-muted"}>
                  {m.role === "user" ? <UserIcon className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
                </AvatarFallback>
              </Avatar>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted rounded-tl-sm"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex gap-2" data-testid="typing-indicator">
              <Avatar className="h-7 w-7 flex-shrink-0">
                <AvatarFallback className="bg-muted">
                  <Bot className="h-4 w-4 text-primary" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 rounded-md p-2 text-center">{error}</div>
          )}
          </div>
        </div>

        <div className="border-t p-3 bg-background">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("chatbot.placeholder", { defaultValue: "Ask FlexaBot anything…" })}
              rows={1}
              maxLength={4000}
              className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-h-32"
              data-testid="input-chat-message"
            />
            <Button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              size="icon"
              data-testid="button-send-chat"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground mt-2">
            FlexaBot pa toujou egzak —{" "}
            <button
              className="underline hover:text-foreground"
              onClick={() => setLocation("/support")}
              data-testid="link-live-support"
            >
              klike la pou sipò dirèk
            </button>
          </p>
        </div>
      </Card>
    </div>
  );
}
