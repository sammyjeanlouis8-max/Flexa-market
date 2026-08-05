import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Bot, Send, Sparkles, Trash2, User as UserIcon, MessageSquare, Loader2,
  CreditCard, Wallet, Users, ArrowUpRight, ArrowDownToLine, Clock,
  Bell, HelpCircle, Truck, Music, Zap, Building2, Briefcase, Globe,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

// ── Quick-topic definitions ────────────────────────────────────────────────
type Lang = "ht" | "fr" | "en" | "es" | "pt";
type L<T> = Record<Lang, T>;

interface Topic {
  id: string;
  Icon: React.ElementType;
  iconColor: string;
  isNew?: boolean;
  label: L<string>;
  query: L<string>;
}

const TOPICS: Topic[] = [
  {
    id: "account",
    Icon: CreditCard,
    iconColor: "text-blue-500",
    label: { ht: "Kont & Peman", fr: "Compte & Paiement", en: "Account & Payment", es: "Cuenta & Pago", pt: "Conta & Pagamento" },
    query: {
      ht: "Kijan pou mwen jere kont mwen ak peman nan FLEXA MARKET?",
      fr: "Comment gérer mon compte et mes paiements sur FLEXA MARKET ?",
      en: "How do I manage my account and payments on FLEXA MARKET?",
      es: "¿Cómo gestiono mi cuenta y pagos en FLEXA MARKET?",
      pt: "Como gerenciar minha conta e pagamentos no FLEXA MARKET?",
    },
  },
  {
    id: "wallet",
    Icon: Wallet,
    iconColor: "text-green-500",
    label: { ht: "Bous (Wallet)", fr: "Portefeuille", en: "Wallet", es: "Billetera", pt: "Carteira" },
    query: {
      ht: "Kijan pòtfèy FM mwen mache epi kijan pou mwen itilize li?",
      fr: "Comment fonctionne mon portefeuille FM et comment l'utiliser ?",
      en: "How does my FM wallet work and how do I use it?",
      es: "¿Cómo funciona mi billetera FM y cómo la uso?",
      pt: "Como funciona minha carteira FM e como usá-la?",
    },
  },
  {
    id: "recharge",
    Icon: Users,
    iconColor: "text-purple-500",
    label: { ht: "Rechaj via Ajan", fr: "Recharge via Agent", en: "Recharge via Agent", es: "Recarga via Agente", pt: "Recarga via Agente" },
    query: {
      ht: "Kijan pou mwen rechaje pòtfèy mwen via yon ajan FLEXA?",
      fr: "Comment recharger mon portefeuille via un agent FLEXA ?",
      en: "How do I recharge my wallet through a FLEXA agent?",
      es: "¿Cómo recargar mi billetera a través de un agente FLEXA?",
      pt: "Como recarregar minha carteira através de um agente FLEXA?",
    },
  },
  {
    id: "send",
    Icon: ArrowUpRight,
    iconColor: "text-orange-500",
    label: { ht: "Voye Lajan", fr: "Envoyer de l'argent", en: "Send Money", es: "Enviar Dinero", pt: "Enviar Dinheiro" },
    query: {
      ht: "Kijan pou mwen voye lajan bay yon lòt moun sou FLEXA?",
      fr: "Comment envoyer de l'argent à quelqu'un sur FLEXA ?",
      en: "How do I send money to someone on FLEXA?",
      es: "¿Cómo envío dinero a alguien en FLEXA?",
      pt: "Como envio dinheiro para alguém no FLEXA?",
    },
  },
  {
    id: "receive",
    Icon: ArrowDownToLine,
    iconColor: "text-teal-500",
    label: { ht: "Resevwa Lajan", fr: "Recevoir de l'argent", en: "Receive Money", es: "Recibir Dinero", pt: "Receber Dinheiro" },
    query: {
      ht: "Kijan pou mwen resevwa lajan ak peman sou FLEXA?",
      fr: "Comment recevoir de l'argent et des paiements sur FLEXA ?",
      en: "How do I receive money and payments on FLEXA?",
      es: "¿Cómo recibo dinero y pagos en FLEXA?",
      pt: "Como recebo dinheiro e pagamentos no FLEXA?",
    },
  },
  {
    id: "history",
    Icon: Clock,
    iconColor: "text-slate-500",
    label: { ht: "Istwa Transaksyon", fr: "Historique", en: "Transaction History", es: "Historial", pt: "Histórico" },
    query: {
      ht: "Kote mwen ka wè istwa tout transaksyon mwen yo?",
      fr: "Où puis-je voir l'historique de toutes mes transactions ?",
      en: "Where can I see the history of all my transactions?",
      es: "¿Dónde puedo ver el historial de todas mis transacciones?",
      pt: "Onde posso ver o histórico de todas as minhas transações?",
    },
  },
  {
    id: "card",
    Icon: CreditCard,
    iconColor: "text-red-500",
    label: { ht: "Kat Mwen", fr: "Ma Carte", en: "My Card", es: "Mi Tarjeta", pt: "Meu Cartão" },
    query: {
      ht: "Kijan kat FM mwen mache epi kijan pou mwen itilize li pou achte?",
      fr: "Comment fonctionne ma carte FM et comment l'utiliser pour payer ?",
      en: "How does my FM card work and how do I use it to pay?",
      es: "¿Cómo funciona mi tarjeta FM y cómo la uso para pagar?",
      pt: "Como funciona meu cartão FM e como usá-lo para pagar?",
    },
  },
  {
    id: "notif",
    Icon: Bell,
    iconColor: "text-yellow-500",
    label: { ht: "Notifikasyon", fr: "Notifications", en: "Notifications", es: "Notificaciones", pt: "Notificações" },
    query: {
      ht: "Kijan pou mwen jere notifikasyon mwen yo sou FLEXA?",
      fr: "Comment gérer mes notifications sur FLEXA ?",
      en: "How do I manage my notifications on FLEXA?",
      es: "¿Cómo gestiono mis notificaciones en FLEXA?",
      pt: "Como gerenciar minhas notificações no FLEXA?",
    },
  },
  {
    id: "support",
    Icon: HelpCircle,
    iconColor: "text-indigo-500",
    label: { ht: "Sipò / Èd", fr: "Support / Aide", en: "Support / Help", es: "Soporte / Ayuda", pt: "Suporte / Ajuda" },
    query: {
      ht: "Kijan pou mwen kontakte sipò FLEXA oswa jwenn èd?",
      fr: "Comment contacter le support FLEXA ou obtenir de l'aide ?",
      en: "How do I contact FLEXA support or get help?",
      es: "¿Cómo contacto el soporte de FLEXA o consigo ayuda?",
      pt: "Como contatar o suporte FLEXA ou obter ajuda?",
    },
  },
  {
    id: "delivery",
    Icon: Truck,
    iconColor: "text-orange-600",
    label: { ht: "Livrezon", fr: "Livraison", en: "Delivery", es: "Entrega", pt: "Entrega" },
    query: {
      ht: "Kijan sèvis livrezon FLEXA mache epi konbyen li koute?",
      fr: "Comment fonctionne la livraison FLEXA et combien ça coûte ?",
      en: "How does FLEXA delivery work and how much does it cost?",
      es: "¿Cómo funciona la entrega de FLEXA y cuánto cuesta?",
      pt: "Como funciona a entrega FLEXA e quanto custa?",
    },
  },
  {
    id: "music",
    Icon: Music,
    iconColor: "text-pink-500",
    label: { ht: "Mizik", fr: "Musique", en: "Music", es: "Música", pt: "Música" },
    query: {
      ht: "Kijan FLEXA Music mache? Kijan pou mwen koute oswa vann mizik?",
      fr: "Comment fonctionne FLEXA Music ? Comment écouter ou vendre de la musique ?",
      en: "How does FLEXA Music work? How do I listen or sell music?",
      es: "¿Cómo funciona FLEXA Music? ¿Cómo escucho o vendo música?",
      pt: "Como funciona o FLEXA Music? Como ouço ou vendo músicas?",
    },
  },
  {
    id: "boost",
    Icon: Zap,
    iconColor: "text-amber-500",
    label: { ht: "Anons / Boost", fr: "Annonces / Boost", en: "Listings / Boost", es: "Anuncios / Boost", pt: "Anúncios / Boost" },
    query: {
      ht: "Kijan pou mwen poste yon anons epi kijan boost mache pou vann pi vit?",
      fr: "Comment publier une annonce et comment fonctionne le boost pour vendre plus vite ?",
      en: "How do I post a listing and how does the boost work to sell faster?",
      es: "¿Cómo publico un anuncio y cómo funciona el boost para vender más rápido?",
      pt: "Como publico um anúncio e como funciona o boost para vender mais rápido?",
    },
  },
  {
    id: "loan",
    Icon: Building2,
    iconColor: "text-cyan-600",
    isNew: true,
    label: { ht: "Aplike pou Prè", fr: "Demande de Prêt", en: "Apply for Loan", es: "Solicitar Préstamo", pt: "Solicitar Empréstimo" },
    query: {
      ht: "Kijan pou mwen aplike pou yon prè sou FLEXA? Ki kondisyon yo?",
      fr: "Comment faire une demande de prêt sur FLEXA ? Quelles sont les conditions ?",
      en: "How do I apply for a loan on FLEXA? What are the requirements?",
      es: "¿Cómo solicito un préstamo en FLEXA? ¿Cuáles son los requisitos?",
      pt: "Como solicito um empréstimo no FLEXA? Quais são os requisitos?",
    },
  },
  {
    id: "jobs",
    Icon: Briefcase,
    iconColor: "text-violet-500",
    label: { ht: "Travay (Jobs)", fr: "Emplois", en: "Jobs", es: "Empleos", pt: "Empregos" },
    query: {
      ht: "Kijan travay (jobs) mache sou FLEXA? Kijan pou mwen chèche travay oswa pibliye yon ofèt?",
      fr: "Comment fonctionnent les offres d'emploi sur FLEXA ? Comment chercher ou publier une offre ?",
      en: "How do jobs work on FLEXA? How do I search or post a job offer?",
      es: "¿Cómo funcionan los empleos en FLEXA? ¿Cómo busco o publico una oferta?",
      pt: "Como funcionam os empregos no FLEXA? Como pesquiso ou publico uma vaga?",
    },
  },
  {
    id: "language",
    Icon: Globe,
    iconColor: "text-sky-500",
    label: { ht: "Lang (Language)", fr: "Langue", en: "Language", es: "Idioma", pt: "Idioma" },
    query: {
      ht: "Kijan pou mwen chanje lang aplikasyon an sou FLEXA?",
      fr: "Comment changer la langue de l'application sur FLEXA ?",
      en: "How do I change the app language on FLEXA?",
      es: "¿Cómo cambio el idioma de la aplicación en FLEXA?",
      pt: "Como mudo o idioma do aplicativo no FLEXA?",
    },
  },
];

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

  const lang: Lang = i18n.language.startsWith("ht") ? "ht"
    : i18n.language.startsWith("fr") ? "fr"
    : i18n.language.startsWith("es") ? "es"
    : i18n.language.startsWith("pt") ? "pt"
    : "en";

  const greeting: Record<Lang, string> = {
    ht: "Bonjou! 👋\nMwen se FlexaBot, asistan entèlijan pou w la.\nMwen ka ede w ak bagay sa yo ak plis ankò.\nKisa ou bezwen jodi a?",
    fr: "Bonjour ! 👋\nJe suis FlexaBot, votre assistant intelligent.\nJe peux vous aider avec tout ce qui suit.\nQue puis-je faire pour vous aujourd'hui ?",
    en: "Hi! 👋\nI'm FlexaBot, your smart assistant.\nI can help you with all of the below and more.\nWhat do you need today?",
    es: "¡Hola! 👋\nSoy FlexaBot, tu asistente inteligente.\nPuedo ayudarte con todo lo siguiente.\n¿Qué necesitas hoy?",
    pt: "Olá! 👋\nSou o FlexaBot, seu assistente inteligente.\nPosso ajudá-lo com tudo abaixo.\nO que você precisa hoje?",
  };

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

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data?.error ?? `HTTP ${resp.status}`);
      if (data?.error) throw new Error(data.error);

      setMessages(curr => [
        ...curr,
        { role: "assistant" as const, content: data?.content || "…" },
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
          {messages.length === 0 && (
            <div className="flex flex-col gap-3 py-2">
              {/* Greeting */}
              <div className="flex gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm whitespace-pre-wrap max-w-[85%]">
                  {greeting[lang]}
                </div>
              </div>

              {/* Topic grid */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                {TOPICS.map(topic => (
                  <button
                    key={topic.id}
                    onClick={() => send(topic.query[lang])}
                    disabled={sending}
                    className="relative flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/30 transition-all text-center active:scale-95 disabled:opacity-50"
                    data-testid={`topic-${topic.id}`}
                  >
                    {topic.isNew && (
                      <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground leading-none">
                        NEW
                      </span>
                    )}
                    <topic.Icon className={`h-5 w-5 ${topic.iconColor}`} />
                    <span className="text-[11px] font-medium leading-tight text-foreground/80">
                      {topic.label[lang]}
                    </span>
                  </button>
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
