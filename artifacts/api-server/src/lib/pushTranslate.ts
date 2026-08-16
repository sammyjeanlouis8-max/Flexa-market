import Anthropic from "@anthropic-ai/sdk";

    const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
    const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
    const client = baseURL && apiKey ? new Anthropic({ baseURL, apiKey }) : null;

    const LANG_NAMES: Record<string, string> = {
    en: "English",
    fr: "French",
    ht: "Haitian Creole",
    };

    /**
    * Translate a short message into the recipient's preferred language for a
    * push notification. Returns null when translation is unavailable, times out,
    * or the text is already in the target language (Claude returns it unchanged,
    * which is fine to display). Never throws.
    */
    export async function translateForPush(text: string, targetLang: string): Promise<string | null> {
    if (!client) return null;
    const targetLangName = LANG_NAMES[targetLang];
    if (!targetLangName) return null;

    try {
      const reply = await Promise.race([
        client.messages.create({
          model: "claude-haiku-4-5",
          max_tokens: 512,
          system: "You are a translation API. Respond with ONLY the translated text — no quotes, no explanation, no markdown.",
          messages: [{
            role: "user",
            content: `Translate the following message to ${targetLangName}. If it is already in ${targetLangName}, return it unchanged. Reply with ONLY the translation:\n\n${text}`,
          }],
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("translate timeout")), 6000)),
      ]);
      const block = reply.content[0];
      const out = block?.type === "text" ? block.text.trim() : "";
      return out || null;
    } catch {
      return null;
    }
    }
    