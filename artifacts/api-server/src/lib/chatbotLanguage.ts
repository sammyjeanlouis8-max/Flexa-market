export type ChatbotLang = "ht" | "fr" | "en" | "es" | "pt";

const HT_STRONG =
  /\b(mwen|mw|mwenmenm|kijan|koman|kouman|poukisa|èske|eske|kote|konbyen|tanpri|silvouple|avèk|avek|bonjou|bonswa|mesi|mèsi|edem|ede\s*m|ede\s*mwen|krey[oò]l|kreyol|mop|map|wap|nap|yap|sak\b|kisa|sa\s+k|genyen|genyen|pa\s+kapab|m\s*ap|w\s*ap|n\s*ap|ou\s+ka|ou\s+pale|ou\s+konn|ban\s*m|banm|di\s*m|dim|wi\s+non|non\s+wi|lajan|kob|pòtfèy|potfey|komann|anons|livrezon|sipò|ajan|kat\s*fm)\b/i;

const FR_STRONG =
  /\b(comment|pourquoi|bonjour|bonsoir|merci|s['’]il\s+vous\s+pla[iî]t|pouvez[- ]vous|puis[- ]je|je\s+voudrais|mon\s+compte|paiement|portefeuille|commande|livraison|parlez[- ]vous|français|francais)\b/i;

const ES_STRONG =
  /\b(cómo|como\s+puedo|por\s+qué|porque|hola|gracias|por\s+favor|puedes|mi\s+cuenta|pago|billetera|pedido|entrega|hablas|español|espanol)\b/i;

const PT_STRONG =
  /\b(olá|ola|obrigad[oa]|por\s+favor|pode\s+me|minha\s+conta|pagamento|carteira|pedido|entrega|fala\s+portugu[eê]s|ajuda[- ]me)\b/i;

const EN_STRONG =
  /\b(how\s+do\s+i|how\s+can\s+i|what\s+is|please|thanks|thank\s+you|help\s+me|my\s+order|my\s+wallet|do\s+you\s+speak|english)\b/i;

function scoreLang(text: string): Record<ChatbotLang, number> {
  const t = text.toLowerCase().normalize("NFC");
  const scores: Record<ChatbotLang, number> = { ht: 0, fr: 0, en: 0, es: 0, pt: 0 };

  if (HT_STRONG.test(t)) scores.ht += 4;
  if (FR_STRONG.test(t)) scores.fr += 3;
  if (ES_STRONG.test(t)) scores.es += 3;
  if (PT_STRONG.test(t)) scores.pt += 3;
  if (EN_STRONG.test(t)) scores.en += 3;

  // Compact Creole orthography / clitics that word-boundary regex can miss
  if (/\b(edem|banm|dim|komanm|kijanm|mwen|kreyol|kreyòl)\b/i.test(t)) scores.ht += 3;
  if (/ou\s+(ka|pale|konn|gen|bezwen|vle)\b/i.test(t)) scores.ht += 3;
  if (/\b(mwen|ou|li|nou|yo)\s+(pa\s+)?(ka|konn|bezwen|vle|gen)\b/i.test(t)) scores.ht += 2;

  // Accent / orthography hints
  if (/[àèìòùáéíóúâêîôûäëïöüçœ]/.test(t) && scores.fr === 0 && scores.es === 0 && scores.pt === 0) {
    // Creole often uses è / ò without being French
    if (/[èò]/.test(t)) scores.ht += 1;
  }

  return scores;
}

function pickWinner(scores: Record<ChatbotLang, number>, fallback: ChatbotLang = "en"): ChatbotLang {
  let best: ChatbotLang = fallback;
  let bestScore = -1;
  for (const lang of ["ht", "fr", "es", "pt", "en"] as ChatbotLang[]) {
    if (scores[lang] > bestScore) {
      bestScore = scores[lang];
      best = lang;
    }
  }
  return bestScore > 0 ? best : fallback;
}

/** Lightweight language hint for FlexaBot replies (not a full NLP detector). */
export function detectLang(text: string, preferred?: string | null): ChatbotLang {
  const preferredNorm = normalizePreferred(preferred);
  const scores = scoreLang(text);
  const fromText = pickWinner(scores, preferredNorm ?? "en");
  if (Object.values(scores).some((s) => s > 0)) return fromText;
  return preferredNorm ?? "en";
}

function normalizePreferred(preferred?: string | null): ChatbotLang | null {
  if (!preferred) return null;
  const p = preferred.toLowerCase().slice(0, 2);
  if (p === "ht" || p === "fr" || p === "en" || p === "es" || p === "pt") return p;
  if (preferred.toLowerCase().startsWith("creole") || preferred.toLowerCase().startsWith("haitian")) return "ht";
  return null;
}

/**
 * Prefer the latest user message language; if unclear, use earlier user turns,
 * then an optional UI preferred language.
 */
export function detectLangFromMessages(
  messages: Array<{ role: string; content: string }>,
  preferred?: string | null,
): ChatbotLang {
  const preferredNorm = normalizePreferred(preferred);
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);
  if (userTexts.length === 0) return preferredNorm ?? "en";

  // Latest message first
  for (let i = userTexts.length - 1; i >= 0; i--) {
    const scores = scoreLang(userTexts[i]);
    if (Object.values(scores).some((s) => s > 0)) {
      return pickWinner(scores, preferredNorm ?? "en");
    }
  }

  // Aggregate conversation if each message was too short/ambiguous alone
  const combined = scoreLang(userTexts.join("\n"));
  if (Object.values(combined).some((s) => s > 0)) {
    return pickWinner(combined, preferredNorm ?? "en");
  }

  return preferredNorm ?? "en";
}
