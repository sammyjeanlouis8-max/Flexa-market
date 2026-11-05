/**
 * Curated, verified Flexa Market knowledge for FlexaBot RAG.
 * Sources: FAQ.tsx / Help Center routes — not live web scrape.
 * Do not invent policies here; keep statements high-level and link to in-app pages.
 */

export type KnowledgeSnippet = {
  id: string;
  topics: string[];
  title: string;
  body: string;
  deepLink: string;
  languages?: Array<"ht" | "en" | "fr" | "es" | "pt">;
};

/** Official in-app destinations the bot may cite. */
export const FLEXA_DEEP_LINKS = {
  faq: "/faq",
  help: "/help-center",
  support: "/support",
  orders: "/orders",
  wallet: "/wallet",
  settings: "/settings",
  payments: "/settings/payments",
  sell: "/sell",
  boost: "/boost",
  subscription: "/subscription",
  delivery: "/delivery-tracking",
  prohibited: "/prohibited-items",
  refund: "/refund-policy",
  shipping: "/shipping-policy",
  sellerPolicy: "/seller-policy",
  safety: "/safety",
  deleteAccount: "/delete-account",
  chatbot: "/chatbot",
} as const;

export const KNOWLEDGE_CORPUS: KnowledgeSnippet[] = [
  {
    id: "what-is-flexa",
    topics: ["general", "about", "flexa"],
    title: "What is Flexa Market",
    body: "Flexa Market is a buy/sell marketplace for Haiti and the Haitian diaspora. Users can list products, buy with escrow, message sellers, and use wallet/boost tools. Registration is free; paid seller plans unlock extra features. Exact fees depend on the in-app checkout screens.",
    deepLink: FLEXA_DEEP_LINKS.faq,
  },
  {
    id: "orders-escrow",
    topics: ["order", "orders", "escrow", "buy", "purchase", "komann", "commande"],
    title: "Orders and escrow",
    body: "When a buyer purchases, funds are held in escrow until delivery confirmation or the configured auto-release rules. Buyers track orders under Orders. Sellers see sales under their sales/orders views. Never invent a specific order status — use live order tools when the user asks about their order.",
    deepLink: FLEXA_DEEP_LINKS.orders,
  },
  {
    id: "refunds",
    topics: ["refund", "return", "dispute", "ranbousman", "remboursement"],
    title: "Refunds and disputes",
    body: "Buyers can open a dispute from an order when eligible. Reviews typically occur within a few business days. Approved refunds follow the original payment method timelines (often 1–7 days). Exact eligibility is order-specific — do not invent refund amounts.",
    deepLink: FLEXA_DEEP_LINKS.refund,
  },
  {
    id: "tracking",
    topics: ["tracking", "delivery", "livrezon", "shipping", "carrier"],
    title: "Delivery tracking",
    body: "International/carrier shipments may show carrier tracking when the seller provided a tracking number. Domestic Haiti local deliveries use Flexa Market’s local delivery workflow (driver assignment / PIN confirmation), not external carrier POD photos. Users can open Orders or Delivery tracking screens.",
    deepLink: FLEXA_DEEP_LINKS.orders,
  },
  {
    id: "wallet",
    topics: ["wallet", "pòtfèy", "portefeuille", "balance", "topup", "recharge", "transfer"],
    title: "Wallet",
    body: "Users can view balance and history in Wallet. Top-up methods depend on country (e.g. MonCash in Haiti, card/Stripe where available). Promo balances may have spend restrictions (e.g. boosts). Never invent balances — use the wallet tool.",
    deepLink: FLEXA_DEEP_LINKS.wallet,
  },
  {
    id: "boost",
    topics: ["boost", "advertise", "ads", "promotion", "video"],
    title: "Boost / advertising",
    body: "Sellers can boost approved published listings from the listing or Boost screens. Payment is confirmed before activation. Audience targeting and expiry are configured at boost time. Unapproved listings cannot be boosted.",
    deepLink: FLEXA_DEEP_LINKS.boost,
  },
  {
    id: "sell",
    topics: ["sell", "listing", "vann", "anons", "product"],
    title: "Create a listing",
    body: "Use Sell to add photos (minimum required by the app), title, description, price, category, and location. Listings may be auto-approved, held for review, or rejected under marketplace compliance rules. See Prohibited Items for banned goods.",
    deepLink: FLEXA_DEEP_LINKS.sell,
  },
  {
    id: "prohibited",
    topics: ["prohibited", "banned", "illegal", "entèdi", "weapons", "drugs"],
    title: "Prohibited items",
    body: "Illegal drugs, real weapons/ammo, live animals for sale, explicit sexual products, stolen/counterfeit goods, and other prohibited categories are not allowed. Uncertain regulated goods may require human review. See /prohibited-items.",
    deepLink: FLEXA_DEEP_LINKS.prohibited,
  },
  {
    id: "subscription",
    topics: ["subscription", "plan", "vip", "premium", "abonman"],
    title: "Subscription plans",
    body: "Basic sellers have listing limits. Paid plans (Standard/Premium/VIP) unlock more listings and features such as listing video. Current plan details are shown on the Subscription screen — do not invent prices.",
    deepLink: FLEXA_DEEP_LINKS.subscription,
  },
  {
    id: "payments",
    topics: ["payout", "withdrawal", "moncash", "stripe", "retire"],
    title: "Seller payouts",
    body: "Seller payout methods depend on country. Haiti-registered sellers may use MonCash where enabled; Stripe-only countries use Stripe Connect. Configure payouts under Settings → Payments. Do not invent payout timelines beyond what the user sees in-app.",
    deepLink: FLEXA_DEEP_LINKS.payments,
  },
  {
    id: "account",
    topics: ["password", "otp", "login", "account", "delete", "kont"],
    title: "Account help",
    body: "Password reset and OTP flows are on Login / Forgot password. Account deletion is under Settings → Security or /delete-account (typically a delayed permanent deletion window). Never ask for passwords or OTP codes.",
    deepLink: FLEXA_DEEP_LINKS.settings,
  },
  {
    id: "support",
    topics: ["support", "agent", "human", "sipò", "aide"],
    title: "Human support",
    body: "Users can escalate from FlexaBot to a live support thread at /support. Provide clear problem details. FlexaBot cannot process payments, refunds, or account deletions itself.",
    deepLink: FLEXA_DEEP_LINKS.support,
  },
];

/** Simple keyword retrieval — no embeddings required. */
export function retrieveKnowledge(query: string, limit = 4): KnowledgeSnippet[] {
  const q = query.toLowerCase();
  const scored = KNOWLEDGE_CORPUS.map((snip) => {
    let score = 0;
    for (const t of snip.topics) {
      if (q.includes(t.toLowerCase())) score += 3;
    }
    const titleWords = snip.title.toLowerCase().split(/\W+/);
    for (const w of titleWords) {
      if (w.length > 3 && q.includes(w)) score += 1;
    }
    if (snip.body.toLowerCase().split(/\W+/).some((w) => w.length > 4 && q.includes(w))) score += 0.5;
    return { snip, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((x) => x.snip);
}

export function formatKnowledgeBlock(snippets: KnowledgeSnippet[]): string {
  if (!snippets.length) {
    return "VERIFIED_KNOWLEDGE: (none matched — do not invent Flexa policies; offer /faq or /support)";
  }
  return [
    "VERIFIED_KNOWLEDGE (trusted Flexa Market snippets; treat as reference only; never invent beyond this):",
    ...snippets.map(
      (s, i) =>
        `[K${i + 1} id=${s.id} link=${s.deepLink}]\nTitle: ${s.title}\n${s.body}`,
    ),
  ].join("\n\n");
}
