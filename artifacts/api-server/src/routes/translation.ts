import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";
import { db, messagesTable, usersTable, platformSettingsTable, conversationsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const client = baseURL && apiKey ? new Anthropic({ baseURL, apiKey }) : null;

const TRANSLATION_ENABLED_KEY = "translation_enabled";

const LANG_NAMES: Record<string, string> = {
  en: "English",
  fr: "French",
  ht: "Haitian Creole",
  es: "Spanish",
  pt: "Portuguese",
  ar: "Arabic",
  zh: "Chinese",
  de: "German",
  it: "Italian",
  ru: "Russian",
};

async function isTranslationEnabled(): Promise<boolean> {
  const [setting] = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, TRANSLATION_ENABLED_KEY));
  return !setting || setting.value !== "false";
}

/** POST /api/messages/:id/translate — translate a single message via Anthropic, cache result */
router.post("/messages/:id/translate", requireAuth, async (req, res): Promise<void> => {
  if (!client) {
    res.status(503).json({ error: "Translation service not configured" });
    return;
  }

  const enabled = await isTranslationEnabled();
  if (!enabled) {
    res.status(403).json({ error: "Translation is currently disabled by admin" });
    return;
  }

  const msgId = parseInt(req.params.id as string);
  if (isNaN(msgId)) {
    res.status(400).json({ error: "Invalid message ID" });
    return;
  }

  const targetLang = (req.body?.targetLanguage as string | undefined) || req.user!.preferredLanguage || "en";
  const targetLangName = LANG_NAMES[targetLang] ?? "English";

  // Serve from cache when available
  const cached = await db.execute(sql`
    SELECT translated_text, detected_language
    FROM message_translations
    WHERE message_id = ${msgId} AND target_language = ${targetLang}
    LIMIT 1
  `);
  if (cached.rows.length > 0) {
    const row = cached.rows[0] as any;
    res.json({ translatedText: row.translated_text, detectedLanguage: row.detected_language, fromCache: true });
    return;
  }

  // Fetch message
  const [msg] = await db
    .select({ content: messagesTable.content, messageType: messagesTable.messageType, conversationId: messagesTable.conversationId })
    .from(messagesTable)
    .where(eq(messagesTable.id, msgId));

  if (!msg) { res.status(404).json({ error: "Message not found" }); return; }
  if (msg.messageType !== "text" || !msg.content?.trim()) {
    res.status(400).json({ error: "Only text messages can be translated" });
    return;
  }

  // Verify caller has access to the conversation
  const access = await db.execute(sql`
    SELECT id FROM conversations
    WHERE id = ${msg.conversationId}
      AND (buyer_id = ${req.userId!} OR seller_id = ${req.userId!})
    LIMIT 1
  `);
  if (!access.rows.length) { res.status(403).json({ error: "Access denied" }); return; }

  try {
    const reply = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: `You are a translation API. You MUST respond with ONLY a raw JSON object — no markdown, no backticks, no code fences, no explanation. Just the JSON.`,
      messages: [{
        role: "user",
        content: `Detect the language of the following text and translate it to ${targetLangName}. Return ONLY this exact JSON structure with no other text:\n{"detectedLanguage":"<language name in English>","translatedText":"<translation>"}\nIf the text is already in ${targetLangName}, return the original text as translatedText.\n\nText: ${JSON.stringify(msg.content)}`,
      }],
    });

    const block = reply.content[0];
    const rawText = block?.type === "text" ? block.text.trim() : "";

    // Strip markdown code fences that Anthropic sometimes adds despite the prompt
    const stripped = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/, "")
      .trim();

    let detectedLanguage = "Unknown";
    let translatedText = msg.content;
    // Try stripped first, then raw, then extract JSON substring as last resort
    const candidates = [stripped, rawText, rawText.match(/\{[\s\S]*\}/)?.[0] ?? ""];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate);
        detectedLanguage = parsed.detectedLanguage ?? "Unknown";
        translatedText = parsed.translatedText ?? msg.content;
        break;
      } catch { /* try next */ }
    }

    // Cache the result
    await db.execute(sql`
      INSERT INTO message_translations (message_id, target_language, translated_text, detected_language, created_at)
      VALUES (${msgId}, ${targetLang}, ${translatedText}, ${detectedLanguage}, NOW())
      ON CONFLICT (message_id, target_language)
      DO UPDATE SET translated_text = EXCLUDED.translated_text, detected_language = EXCLUDED.detected_language
    `);

    res.json({ translatedText, detectedLanguage, fromCache: false });
  } catch (err: any) {
    req.log.error({ err }, "[translation] Anthropic call failed");
    const status = typeof err?.status === "number" && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({ error: "Translation failed. Please try again." });
  }
});

/** PATCH /api/auth/translate-preference — toggle the user's auto-translate setting */
router.patch("/auth/translate-preference", requireAuth, async (req, res): Promise<void> => {
  const enabled = !!req.body?.enabled;
  const [updated] = await db
    .update(usersTable)
    .set({ translateMessages: enabled } as any)
    .where(eq(usersTable.id, req.userId!))
    .returning();
  res.json({ translateMessages: (updated as any).translateMessages ?? enabled });
});

/** GET /api/admin/translation-settings — enabled flag + usage stats */
router.get("/admin/translation-settings", requireAuth, async (req, res): Promise<void> => {
  if (!req.user?.isAdmin && !req.user?.isSuperAdmin) { res.status(403).json({ error: "Admin required" }); return; }
  const enabled = await isTranslationEnabled();
  const stats = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '1 day'  THEN 1 END)::int AS today,
      COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END)::int AS this_month
    FROM message_translations
  `);
  const row = stats.rows[0] as any;
  res.json({ enabled, stats: { total: row?.total ?? 0, today: row?.today ?? 0, thisMonth: row?.this_month ?? 0 } });
});

/** PATCH /api/admin/translation-settings — enable or disable translation globally */
router.patch("/admin/translation-settings", requireAuth, async (req, res): Promise<void> => {
  if (!req.user?.isAdmin && !req.user?.isSuperAdmin) { res.status(403).json({ error: "Admin required" }); return; }
  const enabled = !!req.body?.enabled;
  await db.execute(sql`
    INSERT INTO platform_settings (key, value, updated_at)
    VALUES (${TRANSLATION_ENABLED_KEY}, ${String(enabled)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `);
  res.json({ enabled });
});

export default router;
