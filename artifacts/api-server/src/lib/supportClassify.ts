/**
 * Rule-based ticket classification + priority for Smart Support routing.
 * Never invents facts — only labels from customer text.
 */

export type SupportCategory =
  | "orders"
  | "delivery"
  | "payments"
  | "account"
  | "listings"
  | "subscription"
  | "abuse"
  | "other";

export type SupportPriority = "normal" | "high" | "urgent";

const CATEGORY_RULES: Array<{ category: SupportCategory; re: RegExp }> = [
  { category: "abuse", re: /\b(abuse|harass|scam|fraud|threat|report|signal|rap[oò]|abuso)\b/i },
  { category: "payments", re: /\b(payment|peman|paiement|pago|refund|ranbousman|remboursement|moncash|stripe|wallet|p[oò]tf[eè]y|card|kart)\b/i },
  { category: "delivery", re: /\b(deliver|livrezon|livraison|shipping|tracking|driver|chof[eè]|carrier|aftership)\b/i },
  { category: "orders", re: /\b(order|komann|commande|pedido|#fm-?\d|purchase|achat)\b/i },
  { category: "subscription", re: /\b(subscri|abonman|abonnement|vip|plan|premium|promax)\b/i },
  { category: "listings", re: /\b(listing|annonce|pwodwi|product|boost|publish|approve)\b/i },
  { category: "account", re: /\b(account|kont|compte|login|password|otp|verify|verifikasyon|ban|restrict)\b/i },
];

const URGENT_RE = /\b(urgent|asap|immediately|fraud|stolen|hack|unauthorized|urgence|ijans|estafa)\b/i;
const HIGH_RE = /\b(refund|ranbousman|not received|pa resevwa|payment failed|peman echwe|blocked|bloque)\b/i;

export function classifySupportTicket(input: {
  subject: string;
  message: string;
}): { category: SupportCategory; priority: SupportPriority; relatedOrderHint: number | null } {
  const text = `${input.subject}\n${input.message}`.trim();
  let category: SupportCategory = "other";
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(text)) {
      category = rule.category;
      break;
    }
  }

  let priority: SupportPriority = "normal";
  if (URGENT_RE.test(text) || category === "abuse") priority = "urgent";
  else if (HIGH_RE.test(text)) priority = "high";

  const orderMatch = text.match(/#?\s*FM-?\s*(\d{4,})/i) || text.match(/\border\s*#?\s*(\d{3,})/i);
  const relatedOrderHint = orderMatch ? Number(orderMatch[1]) : null;

  return {
    category,
    priority,
    relatedOrderHint: Number.isFinite(relatedOrderHint) ? relatedOrderHint : null,
  };
}

/** Specialization tags used for intelligent routing. */
export const AGENT_SPECIALIZATIONS: Record<SupportCategory, string[]> = {
  orders: ["orders", "general"],
  delivery: ["delivery", "orders"],
  payments: ["payments", "wallet"],
  account: ["account", "general"],
  listings: ["listings", "general"],
  subscription: ["subscription", "general"],
  abuse: ["moderation", "abuse"],
  other: ["general"],
};
