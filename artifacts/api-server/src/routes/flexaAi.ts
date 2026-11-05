/**
 * Flexa AI capability endpoints — reuses FlexaBot Anthropic/Groq infrastructure.
 * Credentials never leave the server. Each capability is feature-flagged and quota-limited.
 */
import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import {
  db,
  listingsTable,
  boostsTable,
  transactionsTable,
  listingViewsTable,
} from "@workspace/db";
import { requireAuth, requireAdmin } from "../middlewares/auth";
import {
  completeChat,
  isCapabilityEnabled,
  publicAiStatus,
  type FlexaAiCapability,
  type ChatTurn,
} from "../lib/flexaAi";
import { assertWithinDailyQuota, recordAiUsage } from "../lib/flexaAiUsage";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const flexaAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many Flexa AI requests. Please wait a minute." },
});

const SUPPORT_SYSTEM = `You are Flexa AI Support for FLEXA MARKET (same product family as FlexaBot).
Reply in the user's language. Be concise and accurate.
Only state Flexa Market facts you are sure of; otherwise direct the user to in-app screens or human support.
Never ask for passwords, OTPs, full card numbers, CVV, or private keys.
Never invent fees, eligibility, or policy details.`;

const DESCRIPTION_SYSTEM = `You write marketplace product descriptions for FLEXA MARKET sellers.
Return only the description text (no title, no markdown fences).
Keep it under 900 characters. Be factual, buyer-friendly, and multilingual-aware:
match the requested language. Do not invent certifications, brands, or condition claims not provided.`;

const TRANSLATION_SYSTEM = `You are a translation engine for FLEXA MARKET.
Translate the user text into the requested target language.
Return only the translation — no quotes, no commentary.`;

const BOOST_SYSTEM = `You are a Flexa Market Booster advisor.
Given listing context and optional performance numbers, recommend practical boost actions.
Use only provided numbers; never invent impressions, CTR, or budgets.
Keep advice under 180 words. Reply in the user's language if detectable, else English.`;

const ANALYTICS_SYSTEM = `You are a Flexa Market seller analytics assistant.
Explain the provided metrics in plain language and suggest 2–4 actionable next steps.
Never invent metrics. If a metric is missing, say so. Keep under 220 words.`;

const ADMIN_SYSTEM = `You are Flexa AI Admin Assistant for Flexa Market staff.
Help with moderation guidance, ops playbooks, and platform workflows at a high level.
Never reveal API keys, secrets, or private customer credentials.
Do not claim you executed admin actions — you only advise.
If unsure, say so. Prefer Haiku-cost concise answers.`;

function rejectIfDisabled(cap: FlexaAiCapability, res: import("express").Response): boolean {
  if (!isCapabilityEnabled(cap)) {
    res.status(503).json({
      error: `Flexa AI capability "${cap}" is disabled`,
      code: "AI_CAPABILITY_DISABLED",
    });
    return true;
  }
  return false;
}

function clampText(input: unknown, max: number): string {
  return String(input ?? "").trim().slice(0, max);
}

async function runCapability(opts: {
  req: import("express").Request;
  res: import("express").Response;
  capability: FlexaAiCapability;
  system: string;
  messages: ChatTurn[];
  maxTokens?: number;
  allowOpus?: boolean;
  isAdmin?: boolean;
}): Promise<void> {
  const userId = opts.req.userId!;
  if (rejectIfDisabled(opts.capability, opts.res)) return;

  try {
    const quota = await assertWithinDailyQuota({
      userId,
      capability: opts.capability,
      isAdmin: opts.isAdmin,
    });

    const result = await completeChat({
      system: opts.system,
      messages: opts.messages,
      maxTokens: opts.maxTokens ?? 900,
      allowOpus: opts.allowOpus,
    });

    const inputChars = opts.messages.reduce((n, m) => n + m.content.length, 0);
    await recordAiUsage({
      userId,
      capability: opts.capability,
      model: result.model,
      provider: result.provider,
      inputChars,
      outputChars: result.text.length,
    });

    opts.res.json({
      content: result.text,
      model: result.model,
      provider: result.provider,
      quota: { ...quota, remaining: Math.max(0, quota.remaining - 1) },
    });
  } catch (err: any) {
    const status = err?.status ?? (err?.code === "AI_QUOTA_EXCEEDED" ? 429 : err?.code === "AI_NOT_CONFIGURED" ? 503 : 500);
    if (status >= 500) logger.warn({ err: err?.message, capability: opts.capability }, "Flexa AI request failed");
    opts.res.status(status === 500 ? 503 : status).json({
      error: err?.message ?? "Flexa AI unavailable",
      code: err?.code ?? "AI_ERROR",
    });
  }
}

router.get("/flexa-ai/status", (_req, res) => {
  res.json(publicAiStatus());
});

/** AI customer support — same grounding rules as FlexaBot; separate quota bucket. */
router.post("/flexa-ai/support", requireAuth, flexaAiLimiter, async (req, res): Promise<void> => {
  const messagesRaw = Array.isArray(req.body?.messages) ? req.body.messages : null;
  if (!messagesRaw?.length) {
    const message = clampText(req.body?.message, 4000);
    if (!message) {
      res.status(400).json({ error: "message or messages required" });
      return;
    }
    await runCapability({
      req, res, capability: "support", system: SUPPORT_SYSTEM,
      messages: [{ role: "user", content: message }],
    });
    return;
  }
  if (messagesRaw.length > 40) {
    res.status(400).json({ error: "Too many messages" });
    return;
  }
  const messages: ChatTurn[] = [];
  for (const m of messagesRaw) {
    const role = m?.role === "assistant" ? "assistant" : m?.role === "user" ? "user" : null;
    const content = clampText(m?.content, 4000);
    if (!role || !content) {
      res.status(400).json({ error: "Invalid message" });
      return;
    }
    messages.push({ role, content });
  }
  await runCapability({ req, res, capability: "support", system: SUPPORT_SYSTEM, messages });
});

/** AI product descriptions for sellers. */
router.post("/flexa-ai/product-description", requireAuth, flexaAiLimiter, async (req, res): Promise<void> => {
  const title = clampText(req.body?.title, 200);
  if (!title) {
    res.status(400).json({ error: "title required" });
    return;
  }
  const category = clampText(req.body?.category, 120);
  const condition = clampText(req.body?.condition, 80);
  const language = clampText(req.body?.language || "en", 16) || "en";
  const extras = clampText(req.body?.details, 1200);
  const price = req.body?.price != null ? String(req.body.price).slice(0, 32) : "";

  const userPrompt = [
    `Language: ${language}`,
    `Title: ${title}`,
    category ? `Category: ${category}` : "",
    condition ? `Condition: ${condition}` : "",
    price ? `Price hint: ${price}` : "",
    extras ? `Seller notes: ${extras}` : "",
  ].filter(Boolean).join("\n");

  await runCapability({
    req, res, capability: "descriptions", system: DESCRIPTION_SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 700,
  });
});

/** General text translation (complements message-thread translation). */
router.post("/flexa-ai/translate", requireAuth, flexaAiLimiter, async (req, res): Promise<void> => {
  const text = clampText(req.body?.text, 4000);
  const targetLanguage = clampText(req.body?.targetLanguage || req.body?.target || "en", 32);
  if (!text || !targetLanguage) {
    res.status(400).json({ error: "text and targetLanguage required" });
    return;
  }
  const sourceLanguage = clampText(req.body?.sourceLanguage || "auto", 32);
  await runCapability({
    req, res, capability: "translation", system: TRANSLATION_SYSTEM,
    messages: [{
      role: "user",
      content: `Source language: ${sourceLanguage}\nTarget language: ${targetLanguage}\n\nText:\n${text}`,
    }],
    maxTokens: 1200,
  });
});

/** Booster recommendations for a listing the user owns (or freeform context). */
router.post("/flexa-ai/boost-recommend", requireAuth, flexaAiLimiter, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const listingId = Number(req.body?.listingId);
  let context = clampText(req.body?.context, 1500);

  if (Number.isInteger(listingId) && listingId > 0) {
    const [listing] = await db
      .select({
        id: listingsTable.id,
        title: listingsTable.title,
        price: listingsTable.price,
        status: listingsTable.status,
        viewCount: listingsTable.viewCount,
        isBoosted: listingsTable.isBoosted,
        categoryId: listingsTable.categoryId,
      })
      .from(listingsTable)
      .where(and(eq(listingsTable.id, listingId), eq(listingsTable.sellerId, userId)))
      .limit(1);

    if (!listing) {
      res.status(404).json({ error: "Listing not found" });
      return;
    }

    const [boost] = await db
      .select({
        impressions: boostsTable.impressions,
        clicks: boostsTable.clicks,
        budget: boostsTable.budget,
        plan: boostsTable.plan,
        expiresAt: boostsTable.expiresAt,
      })
      .from(boostsTable)
      .where(and(eq(boostsTable.listingId, listingId), eq(boostsTable.userId, userId)))
      .orderBy(desc(boostsTable.createdAt))
      .limit(1);

    context = [
      `Listing #${listing.id}: ${listing.title}`,
      `Status: ${listing.status}; price: ${listing.price}; categoryId: ${listing.categoryId}`,
      `Organic viewCount field: ${listing.viewCount ?? 0}; currently boosted flag: ${listing.isBoosted ? "yes" : "no"}`,
      boost
        ? `Latest paid boost: plan=${boost.plan}, budget=${boost.budget}, impressions=${boost.impressions ?? 0}, clicks=${boost.clicks ?? 0}, expires=${boost.expiresAt?.toISOString?.() ?? "n/a"}`
        : "No paid boost row found for this listing.",
      context ? `Seller question: ${context}` : "",
    ].filter(Boolean).join("\n");
  }

  if (!context) {
    res.status(400).json({ error: "listingId or context required" });
    return;
  }

  await runCapability({
    req, res, capability: "boost", system: BOOST_SYSTEM,
    messages: [{ role: "user", content: context }],
    maxTokens: 700,
  });
});

/** Narrative insights over the authenticated seller's real metrics (no invented stats). */
router.post("/flexa-ai/seller-insights", requireAuth, flexaAiLimiter, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const days = Math.min(90, Math.max(1, Number(req.body?.days) || 7));
  const from = new Date();
  from.setDate(from.getDate() - days);

  const myListings = await db
    .select({
      id: listingsTable.id,
      title: listingsTable.title,
      viewCount: listingsTable.viewCount,
      status: listingsTable.status,
      isBoosted: listingsTable.isBoosted,
    })
    .from(listingsTable)
    .where(and(
      eq(listingsTable.sellerId, userId),
      notInArray(listingsTable.status, ["deleted"]),
    ))
    .orderBy(desc(listingsTable.viewCount))
    .limit(50);

  const listingIds = myListings.map((l) => l.id);
  let organicViews = 0;
  if (listingIds.length) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(listingViewsTable)
      .where(and(
        inArray(listingViewsTable.listingId, listingIds),
        gte(listingViewsTable.viewedAt, from),
      ));
    organicViews = Number(row?.count ?? 0);
  }

  const [salesAgg] = await db
    .select({
      orderCount: sql<number>`count(*)::int`,
      totalSales: sql<number>`coalesce(sum(${transactionsTable.amount}),0)::float`,
    })
    .from(transactionsTable)
    .innerJoin(listingsTable, eq(transactionsTable.listingId, listingsTable.id))
    .where(and(
      eq(listingsTable.sellerId, userId),
      eq(transactionsTable.type, "purchase"),
      eq(transactionsTable.paymentStatus, "completed"),
      gte(transactionsTable.createdAt, from),
    ));

  const boostRows = await db
    .select({
      impressions: boostsTable.impressions,
      clicks: boostsTable.clicks,
      budget: boostsTable.budget,
    })
    .from(boostsTable)
    .where(and(eq(boostsTable.userId, userId), eq(boostsTable.paymentStatus, "paid")))
    .limit(50);

  const boostImpressions = boostRows.reduce((s, b) => s + Number(b.impressions ?? 0), 0);
  const boostClicks = boostRows.reduce((s, b) => s + Number(b.clicks ?? 0), 0);

  const metricsBlock = [
    `Window: last ${days} days`,
    `Listings counted: ${myListings.length}`,
    `Organic listing page views (deduped listing_views in window): ${organicViews}`,
    `Completed sales count: ${salesAgg?.orderCount ?? 0}`,
    `Completed sales amount sum: ${salesAgg?.totalSales ?? 0}`,
    `Lifetime paid-boost impressions: ${boostImpressions}`,
    `Lifetime paid-boost clicks: ${boostClicks}`,
    `Top listings by viewCount field: ${myListings.slice(0, 5).map((l) => `${l.title} (${l.viewCount ?? 0})`).join("; ") || "none"}`,
    clampText(req.body?.question, 500) ? `Seller question: ${clampText(req.body?.question, 500)}` : "",
  ].filter(Boolean).join("\n");

  await runCapability({
    req, res, capability: "analytics", system: ANALYTICS_SYSTEM,
    messages: [{ role: "user", content: metricsBlock }],
    maxTokens: 800,
  });
});

/** Admin assistance — staff only. Opus disabled unless FLEXA_AI_ALLOW_OPUS=1. */
router.post("/flexa-ai/admin-assist", requireAdmin, flexaAiLimiter, async (req, res): Promise<void> => {
  const message = clampText(req.body?.message, 4000);
  if (!message) {
    res.status(400).json({ error: "message required" });
    return;
  }
  const history: ChatTurn[] = Array.isArray(req.body?.messages)
    ? req.body.messages
        .slice(-20)
        .map((m: any) => ({
          role: m?.role === "assistant" ? "assistant" as const : "user" as const,
          content: clampText(m?.content, 4000),
        }))
        .filter((m: ChatTurn) => m.content)
    : [{ role: "user", content: message }];

  await runCapability({
    req, res, capability: "admin", system: ADMIN_SYSTEM,
    messages: history.length ? history : [{ role: "user", content: message }],
    maxTokens: 1000,
    allowOpus: Boolean(req.body?.preferOpus),
    isAdmin: true,
  });
});

export default router;
