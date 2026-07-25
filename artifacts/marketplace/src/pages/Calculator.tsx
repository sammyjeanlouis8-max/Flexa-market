import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import {
  Calculator,
  Send,
  Trash2,
  Loader2,
  Sparkles,
  DollarSign,
  Truck,
  Percent,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

type Msg = { role: "user" | "assistant"; content: string };

const MAX_HISTORY = 20;
const STORAGE_KEY = "flexa_calc_history";

function loadHistory(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m: any) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-MAX_HISTORY);
  } catch { return []; }
}

function saveHistory(msgs: Msg[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-MAX_HISTORY))); } catch {}
}

type QuickChip = { label: string; query: string; icon: React.ReactNode };

function useQuickChips(lang: string): QuickChip[] {
  if (lang.startsWith("fr")) {
    return [
      { label: "Commission", query: "Si je vends un article à $500, combien je reçois après commission FLEXA (7%)?", icon: <Percent className="h-3.5 w-3.5" /> },
      { label: "HTG → USD", query: "Convertir 10 000 gourdes en dollars américains", icon: <DollarSign className="h-3.5 w-3.5" /> },
      { label: "Livraison", query: "Quel est le prix de livraison cross-ville pour 15 km?", icon: <Truck className="h-3.5 w-3.5" /> },
      { label: "Remise 20%", query: "Article à $1200, remise de 20%, quel est le nouveau prix?", icon: <RefreshCw className="h-3.5 w-3.5" /> },
    ];
  }
  if (lang.startsWith("en")) {
    return [
      { label: "Commission", query: "If I sell an item for $500, how much do I receive after FLEXA 7% commission?", icon: <Percent className="h-3.5 w-3.5" /> },
      { label: "HTG → USD", query: "Convert 10,000 gourdes to US dollars", icon: <DollarSign className="h-3.5 w-3.5" /> },
      { label: "Delivery", query: "What is the cross-city delivery price for 15 km?", icon: <Truck className="h-3.5 w-3.5" /> },
      { label: "20% off", query: "Item costs $1200 with 20% discount, what is the final price?", icon: <RefreshCw className="h-3.5 w-3.5" /> },
    ];
  }
  return [
    { label: "Komisyon", query: "Si m vann yon atik $500, konbyen m ap resevwa apre komisyon FLEXA 7%?", icon: <Percent className="h-3.5 w-3.5" /> },
    { label: "HTG → USD", query: "Konvèti 10 000 goud an dola ameriken", icon: <DollarSign className="h-3.5 w-3.5" /> },
    { label: "Livrezon", query: "Konbyen pou livrezon kwaze vil pou 15 km?", icon: <Truck className="h-3.5 w-3.5" /> },
    { label: "Remiz 20%", query: "Atik $1200 ak remiz 20%, ki pri final la?", icon: <RefreshCw className="h-3.5 w-3.5" /> },
  ];
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center py-1">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="h-2 w-2 rounded-full bg-primary/60 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

/** Lightweight inline markdown → React nodes.
 *  Handles: # heading, **bold**, `code`, --- divider, plain line-breaks.
 *  No external dependency needed. */
function renderMd(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let key = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];

    // --- horizontal rule
    if (/^---+$/.test(raw.trim())) {
      nodes.push(<hr key={key++} className="my-1 border-border/50" />);
      continue;
    }

    // # heading (any level) → compact bold label, not a giant h1
    const hdMatch = raw.match(/^(#{1,6})\s+(.+)/);
    if (hdMatch) {
      nodes.push(
        <p key={key++} className="font-bold text-sm mt-1.5 mb-0.5 leading-snug">
          {inlineRender(hdMatch[2])}
        </p>
      );
      continue;
    }

    // empty line → small gap
    if (raw.trim() === "") {
      nodes.push(<div key={key++} className="h-1" />);
      continue;
    }

    // normal line
    nodes.push(
      <p key={key++} className="leading-relaxed">
        {inlineRender(raw)}
      </p>
    );
  }

  return nodes;
}

/** Render inline markdown: **bold**, `code` */
function inlineRender(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`"))
      return <code key={i} className="font-mono bg-black/10 dark:bg-white/10 rounded px-0.5 text-[0.85em]">{p.slice(1, -1)}</code>;
    return p;
  });
}

function MsgBubble({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center ${
        isUser ? "bg-primary/20" : "bg-orange-500/10"
      }`}>
        {isUser
          ? <span className="text-[10px] font-bold text-primary">W</span>
          : <Calculator className="h-4 w-4 text-orange-500" />}
      </div>
      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm break-words ${
        isUser
          ? "bg-primary text-primary-foreground rounded-tr-sm"
          : "bg-muted rounded-tl-sm"
      }`}>
        {isUser ? msg.content : renderMd(msg.content)}
        {streaming && <span className="ml-1 inline-block h-3.5 w-0.5 bg-current animate-pulse rounded-full" />}
      </div>
    </div>
  );
}

export default function CalculatorPage() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Msg[]>(() => loadHistory());
  const [streamingText, setStreamingText] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chips = useQuickChips(i18n.language);

  useEffect(() => {
    saveHistory(messages);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setError(null);
    setInput("");

    const next: Msg[] = [...messages, { role: "user" as const, content: trimmed }].slice(-MAX_HISTORY);
    setMessages(next);
    setLoading(true);
    setStreamingText("");

    try {
      const apiBase = (window as any).__API_BASE__ ?? "";
      const token = localStorage.getItem("flexamarket_token") ?? "";
      const resp = await fetch(`${apiBase}/api/calculator/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
            if (parsed.content) {
              accumulated += parsed.content;
              setStreamingText(accumulated);
            }
            if (parsed.done) break;
          } catch (e: any) {
            if (e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }

      const finalText = accumulated || "…";
      setMessages(prev => [...prev, { role: "assistant" as const, content: finalText }].slice(-MAX_HISTORY));
      setStreamingText("");
    } catch (err: any) {
      setError(err?.message ?? "Erè. Eseye ankò.");
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input); }
  }

  function clearChat() {
    setMessages([]);
    setStreamingText("");
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  }

  const greeting = i18n.language.startsWith("fr")
    ? "Bonjour! Je suis CalcAI. Demandez-moi de calculer des commissions, frais de livraison, conversions HTG/USD, remises ou n'importe quelle math."
    : i18n.language.startsWith("en")
    ? "Hi! I'm CalcAI. Ask me to calculate commissions, delivery fees, HTG/USD conversions, discounts, or any math."
    : "Bonjou! Mwen se CalcAI. Mande m kalkile komisyon, frè livrezon, konvèsyon HTG/USD, remiz, oswa nenpòt matematik.";

  if (!user) {
    return (
      <div className="container max-w-xl mx-auto p-6">
        <Card className="p-8 text-center space-y-4">
          <div className="h-14 w-14 mx-auto rounded-full bg-orange-500/10 flex items-center justify-center">
            <Calculator className="h-7 w-7 text-orange-500" />
          </div>
          <h2 className="font-bold text-lg">CalcAI</h2>
          <p className="text-muted-foreground text-sm">Konekte pou itilize kalkilatè entèlijan an.</p>
          <Link href="/auth/login">
            <Button className="gap-2"><ChevronRight className="h-4 w-4" />Konekte</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto p-3 sm:p-5 flex flex-col h-[calc(100vh-9rem)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-sm">
            <Calculator className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-base leading-tight">CalcAI</h1>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-500 border border-orange-500/20 flex items-center gap-0.5">
                <Sparkles className="h-2.5 w-2.5" />AI
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {i18n.language.startsWith("fr") ? "Calculateur intelligent FLEXA"
               : i18n.language.startsWith("en") ? "Smart FLEXA Calculator"
               : "Kalkilatè entèlijan FLEXA"}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="text-muted-foreground h-8 gap-1">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="text-xs">
              {i18n.language.startsWith("fr") ? "Effacer" : i18n.language.startsWith("en") ? "Clear" : "Efase"}
            </span>
          </Button>
        )}
      </div>

      <Card className="flex-1 overflow-hidden flex flex-col">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="flex flex-col items-center text-center gap-4 pt-4 pb-2">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center shadow-md">
                <Calculator className="h-8 w-8 text-white" />
              </div>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">{greeting}</p>

              {/* Quick chips */}
              <div className="grid grid-cols-2 gap-2 w-full max-w-sm mt-1">
                {chips.map(chip => (
                  <button
                    key={chip.label}
                    onClick={() => ask(chip.query)}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border bg-card hover:bg-accent hover:border-orange-500/30 transition-all text-left"
                  >
                    <span className="text-orange-500 flex-shrink-0">{chip.icon}</span>
                    <span className="text-xs font-medium">{chip.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <MsgBubble key={i} msg={m} />
          ))}

          {loading && streamingText && (
            <MsgBubble msg={{ role: "assistant", content: streamingText }} streaming />
          )}

          {loading && !streamingText && (
            <div className="flex gap-2.5">
              <div className="h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center bg-orange-500/10">
                <Calculator className="h-4 w-4 text-orange-500" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3.5 py-3">
                <TypingDots />
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-center">
              {error}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="border-t bg-card px-3 py-2.5">
          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={
                i18n.language.startsWith("fr") ? "Ex: $800 × 7% commission, reste?"
                : i18n.language.startsWith("en") ? "Ex: $800 × 7% commission, remainder?"
                : "Egz: $800 × 7% komisyon, konbyen m resevwa?"
              }
              rows={1}
              maxLength={2000}
              disabled={loading}
              className="flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500/60 max-h-28 disabled:opacity-60"
            />
            <Button
              onClick={() => ask(input)}
              disabled={!input.trim() || loading}
              size="icon"
              className="rounded-xl bg-orange-500 hover:bg-orange-600 text-white h-10 w-10 flex-shrink-0 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-1.5">
            1 USD ≈ 130 HTG (apwoksimatif) · Komisyon FLEXA: 7%
          </p>
        </div>
      </Card>
    </div>
  );
}
