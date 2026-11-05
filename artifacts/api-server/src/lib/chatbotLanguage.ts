export type ChatbotLang = "ht" | "fr" | "en" | "es" | "pt";

/** Lightweight language hint for FlexaBot replies (not a full NLP detector). */
export function detectLang(text: string): ChatbotLang {
  const t = text.toLowerCase();
  if (/\b(mwen|kijan|poukisa|èske|eske|kote|konbyen|tanpri|ede m|avèk|bonjou|mesi)\b/.test(t)) return "ht";
  if (/\b(comment|pourquoi|bonjour|merci|compte|paiement|pouvez|avec|s'il|sil vous)\b/.test(t)) return "fr";
  if (/\b(cómo|como|porque|hola|gracias|cuenta|pago|puedes|con|por favor)\b/.test(t)) return "es";
  if (/\b(olá|obrigado|conta|pagamento|pode|com|por favor|ajuda)\b/.test(t) && !/\b(how|what|please)\b/.test(t)) return "pt";
  return "en";
}
