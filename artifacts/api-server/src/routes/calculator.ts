import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";
import rateLimit from "express-rate-limit";

const router = Router();

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

const client = baseURL && apiKey
  ? new Anthropic({ baseURL, apiKey, timeout: 25000 })
  : null;

const calcLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: "Too many calculator requests. Please wait a moment." },
  standardHeaders: true,
  legacyHeaders: false,
});

const SYSTEM_PROMPT = `You are CalcAI, the smart calculator assistant built into FLEXA MARKET — a peer-to-peer marketplace for Haiti and the Caribbean.

YOUR SPECIALTIES:
1. General math: percentages, multiplications, additions, subtractions, divisions, currency math
2. Marketplace commission: FLEXA MARKET takes 7% of the sale price (seller receives 93%)
3. Delivery prices:
   - Same commune (Menm komin): Moto $3, Compact car $5, Large car/SUV $8
   - Cross-city (Lòt vil): $2 per km, minimum $3
4. Currency conversions: 1 USD ≈ 130 HTG (Goud ayisyen). Always clarify this is approximate.
5. Boost costs: starts at $5/day. Budget × days = total cost.
6. Transfer fees: 1% of transfer amount + $3 daily access fee (first transfer per day)
7. Wallet math: balance after commission, after delivery fee, after fees
8. Discounts, promo codes, price reductions
9. Loan / BNPL calculations (simple interest)

FLEXA MARKET QUICK REFERENCE:
- Commission: 7% (platform), 93% (seller)
- Delivery same commune: Moto=$3 | Compact=$5 | Large/SUV=$8
- Delivery cross-city: $2/km, min $3
- MonCash rate: varies, use 1 USD = 130 HTG as default
- Boost: $5/day minimum
- Transfer: 1% fee + $3/day access

RULES:
- ALWAYS reply in the SAME language the user wrote in. If they write in Haitian Creole (Kreyòl), reply in Kreyòl. French → French. English → English. Spanish → Spanish.
- Show step-by-step work for clarity. Use clear formatting with line breaks.
- Keep answers concise — don't pad with unnecessary words.
- Use "$" for USD amounts and "G" or "HTG" for Gourdes.
- If the question is ambiguous, make a reasonable assumption and state it, then answer.
- Never make up exchange rates — always say "apwoksimatif" / "approximate" / "approximatif".
- You are ONLY a calculator. If asked about something unrelated to math or FLEXA MARKET finances, politely redirect.`;

type ChatMessage = { role: "user" | "assistant"; content: string };

router.post("/calculator/ask", requireAuth, calcLimiter, async (req, res) => {
  if (!client) {
    res.status(503).json({ error: "Calculator AI is not configured" });
    return;
  }

  const { messages } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages required" });
    return;
  }
  if (messages.length > 20) {
    res.status(400).json({ error: "Too many messages — start a new calculation" });
    return;
  }

  const cleaned: ChatMessage[] = [];
  for (const m of messages) {
    const role = m?.role === "user" || m?.role === "assistant" ? m.role : null;
    const content = typeof m?.content === "string" ? m.content.trim() : "";
    if (!role || !content) {
      res.status(400).json({ error: "Invalid message format" });
      return;
    }
    if (content.length > 2000) {
      res.status(400).json({ error: "Message too long (max 2000 chars)" });
      return;
    }
    cleaned.push({ role, content });
  }
  if (cleaned[cleaned.length - 1].role !== "user") {
    res.status(400).json({ error: "Last message must be from user" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Heartbeat comment every 5 s to keep the proxy connection alive
  const heartbeat = setInterval(() => {
    try { res.write(": keep-alive\n\n"); } catch { /* ignore */ }
  }, 5000);

  try {
    const stream = client.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: cleaned,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    clearInterval(heartbeat);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err: any) {
    clearInterval(heartbeat);
    req.log.error({ err }, "[calculator] Anthropic stream failed");
    const status = typeof err?.status === "number" ? err.status : 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    const errPayload =
      safeStatus === 429
        ? { error: "Twòp demann — tann yon moman epi eseye ankò." }
        : { error: "Kalkilatè a pa reponn. Eseye ankò." };
    try {
      res.write(`data: ${JSON.stringify({ ...errPayload, done: true })}\n\n`);
      res.end();
    } catch {
      res.end();
    }
  }
});

export default router;
