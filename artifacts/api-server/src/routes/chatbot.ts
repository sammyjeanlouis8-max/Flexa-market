import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

const client = baseURL && apiKey
  ? new Anthropic({ baseURL, apiKey, timeout: 25000 })
  : null;

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

router.post("/chatbot/message", requireAuth, async (req, res) => {
  if (!client) {
    res.status(503).json({ error: "Chatbot is not configured" });
    return;
  }

  const parsed = parseBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  try {
    let fullText = "";
    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: parsed.messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullText += event.delta.text;
      }
    }

    res.json({ reply: fullText || "…" });
  } catch (err: any) {
    req.log.error({ err }, "[chatbot] Anthropic call failed");
    const status = typeof err?.status === "number" ? err.status : 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    const message =
      safeStatus === 429
        ? "Too many requests — please wait a moment and try again."
        : safeStatus === 401 || safeStatus === 403
          ? "Chatbot is temporarily unavailable."
          : "Chatbot failed to respond. Please try again.";
    res.status(safeStatus).json({ error: message });
  }
});

export default router;
