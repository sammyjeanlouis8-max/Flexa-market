import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// ── AI providers ─────────────────────────────────────────────────────────────
// Priority: Groq (free, fast, reliable) → Anthropic (Replit-managed proxy)
// Groq: get a free key at https://console.groq.com  (no credit card needed)
const GROQ_API_KEY      = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL        = "llama-3.1-8b-instant";   // free, ~300 tok/s
const GROQ_API_URL      = "https://api.groq.com/openai/v1/chat/completions";

const anthropicBaseURL  = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicApiKey   = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const anthropicClient   = anthropicBaseURL && anthropicApiKey
  ? new Anthropic({ baseURL: anthropicBaseURL, apiKey: anthropicApiKey, timeout: 25000 })
  : null;

const hasAI = !!(GROQ_API_KEY || anthropicClient);

const SYSTEM_PROMPT = `You are FlexaBot, the friendly AI assistant for FLEXA MARKET — a peer-to-peer marketplace serving primarily Haitian users (with Haitian Creole, French, English, Spanish, and Portuguese speakers).

Your job:
- Help users buy and sell items, post listings, find jobs, send/accept offers, leave reviews, manage orders, and use boosted ads.
- Answer questions about MonCash payments (Haiti's mobile money), shipping inside and outside Haiti, account safety, and avoiding scams.
- Reply in the SAME language the user wrote in. If they write in Haitian Creole (Kreyòl), reply in Creole. If in French, reply in French. Same for English, Spanish, Portuguese.
- Be warm, concise (2-4 sentences when possible), and use plain words. Avoid jargon.
- If the user asks something outside FLEXA MARKET's scope, gently redirect them. Never make up policies you don't know — say "I'm not sure, please contact support" instead.

Never share or ask for: passwords, full payment card numbers, or government ID numbers.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

function parseBody(body: any): { ok: true; messages: ChatMessage[] } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) return { ok: false, error: "messages required" };
  if (messages.length > 40) return { ok: false, error: "Too many messages — start a new chat" };
  const cleaned: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return { ok: false, error: "Invalid message" };
    const role = m.role === "user" || m.role === "assistant" ? m.role : null;
    const content = typeof m.content === "string" ? m.content.trim() : "";
    if (!role) return { ok: false, error: "Invalid role" };
    if (!content) return { ok: false, error: "Empty message" };
    if (content.length > 4000) return { ok: false, error: "Message too long (max 4000 chars)" };
    cleaned.push({ role, content });
  }
  if (cleaned[cleaned.length - 1].role !== "user") return { ok: false, error: "Last message must be from user" };
  return { ok: true, messages: cleaned };
}

// ── Call Groq (OpenAI-compatible) ────────────────────────────────────────────
async function callGroq(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(20000), // 20 s hard limit
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw Object.assign(new Error(err?.error?.message ?? `Groq HTTP ${res.status}`), { status: res.status });
  }

  const json = await res.json() as any;
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

// ── Call Anthropic ───────────────────────────────────────────────────────────
async function callAnthropic(messages: ChatMessage[]): Promise<string> {
  if (!anthropicClient) throw new Error("Anthropic not configured");
  const response = await anthropicClient.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages,
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
    .trim();
}

router.post("/chatbot/message", requireAuth, async (req, res) => {
  if (!hasAI) {
    res.status(503).json({ error: "Chatbot is not configured" });
    return;
  }

  const parsed = parseBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    let text: string;

    if (GROQ_API_KEY) {
      // Groq primary — free and very fast
      text = await callGroq(parsed.messages);
    } else {
      // Anthropic fallback
      text = await callAnthropic(parsed.messages);
    }

    res.json({ content: text });
  } catch (err: any) {
    req.log.error({ err }, "[chatbot] AI request failed");
    const status = typeof err?.status === "number" ? err.status : 500;
    if (status === 429) {
      res.status(429).json({ error: "Twòp demann — tann yon moman epi eseye ankò." });
    } else if (status === 401 || status === 403) {
      res.status(503).json({ error: "Chatbot pa disponib kounye a." });
    } else {
      res.status(500).json({ error: "Chatbot pa reponn. Eseye ankò." });
    }
  }
});

export default router;
