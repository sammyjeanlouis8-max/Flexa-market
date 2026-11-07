/**
 * Curated, verified Flexa Market knowledge for FlexaBot RAG.
 * Sources: FAQ.tsx / Help Center / Wallet / Flex Card — not live web scrape.
 * Do not invent policies here; keep statements high-level and link to in-app pages.
 */

export type KnowledgeSnippet = {
  id: string;
  topics: string[];
  title: string;
  body: string;
  /** Short ready-to-send replies when the LLM is offline (ht/fr/en/es/pt). */
  answers?: Partial<Record<"ht" | "fr" | "en" | "es" | "pt", string>>;
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
  walletTransfer: "/wallet/transfer",
  settings: "/settings",
  notifications: "/settings/notifications",
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
  flexCard: "/flex-card",
} as const;

export const KNOWLEDGE_CORPUS: KnowledgeSnippet[] = [
  {
    id: "help-greeting",
    topics: [
      "help", "ede", "edem", "aide", "ayuda", "ajuda", "hello", "hi", "bonjou", "bonjour", "hola",
      "ou ka ede", "can you help", "help me", "assiste",
    ],
    title: "How FlexaBot can help",
    body: "FlexaBot helps with Flexa Market topics: orders, wallet, sending money, FM card, notifications, selling, boosts, and human support. Ask a specific question for a precise answer.",
    answers: {
      ht: "Wi, mwen ka ede w! Mwen se FlexaBot, asistan FLEXA MARKET.\nMwen ka ede w ak: lòd, pòtfèy, voye lajan, kat FM, notifikasyon, vann, boost, ak sipò.\nDi m kisa ou bezwen — mwen reponn an kreyòl. Pou yon ajan moun: /support.",
      fr: "Oui, je peux vous aider ! Je suis FlexaBot, l’assistant FLEXA MARKET.\nJe peux vous aider pour: commandes, portefeuille, envoi d’argent, carte FM, notifications, vente, boost et support.\nDites-moi ce dont vous avez besoin. Agent humain: /support.",
      en: "Yes — I can help! I’m FlexaBot, your FLEXA MARKET assistant.\nI can help with: orders, wallet, sending money, FM card, notifications, selling, boosts, and support.\nTell me what you need. Human agent: /support.",
      es: "¡Sí, puedo ayudarte! Soy FlexaBot, el asistente de FLEXA MARKET.\nPuedo ayudar con: pedidos, billetera, envío de dinero, tarjeta FM, notificaciones, venta, boost y soporte.\nDime qué necesitas. Agente humano: /support.",
      pt: "Sim, posso ajudar! Sou o FlexaBot, assistente da FLEXA MARKET.\nPosso ajudar com: pedidos, carteira, envio de dinheiro, cartão FM, notificações, venda, boost e suporte.\nDiga o que precisa. Agente humano: /support.",
    },
    deepLink: FLEXA_DEEP_LINKS.faq,
  },
  {
    id: "speak-creole",
    topics: [
      "kreyol", "kreyòl", "creole", "ou pale", "parles", "hablas", "speak creole", "pale kreyol",
      "en français", "en kreyol", "an kreyol", "speak french", "speak spanish",
    ],
    title: "Language support",
    body: "FlexaBot replies in the user’s language: Haitian Creole, French, English, Spanish, or Portuguese.",
    answers: {
      ht: "Wi — mwen pale kreyòl! Ou ka ekri m nan kreyòl, franse, angle, panyòl oswa pòtigè; mwen reponn nan menm lang lan.\nKisa ou bezwen sou FLEXA MARKET?",
      fr: "Oui — je parle aussi créole haïtien, français, anglais, espagnol et portugais. Écrivez dans votre langue et je répondrai dans la même.\nQue puis-je faire pour vous sur FLEXA MARKET ?",
      en: "Yes — I speak Haitian Creole, French, English, Spanish, and Portuguese. Write in your language and I’ll reply in the same one.\nWhat do you need on FLEXA MARKET?",
      es: "Sí — hablo criollo haitiano, francés, inglés, español y portugués. Escribe en tu idioma y responderé en el mismo.\n¿Qué necesitas en FLEXA MARKET?",
      pt: "Sim — falo crioulo haitiano, francês, inglês, espanhol e português. Escreva no seu idioma e eu respondo no mesmo.\nO que você precisa na FLEXA MARKET?",
    },
    deepLink: FLEXA_DEEP_LINKS.support,
  },
  {
    id: "what-is-flexa",
    topics: ["general", "about", "flexa", "flexa market", "kisa", "what is"],
    title: "What is Flexa Market",
    body: "Flexa Market is a buy/sell marketplace for Haiti and the Haitian diaspora. Users can list products, buy with escrow, message sellers, find jobs, and use wallet/boost tools. Registration is free; paid seller plans unlock extra features. Exact fees depend on the in-app checkout screens.",
    answers: {
      ht: "FLEXA MARKET se yon mache achte-vann pou Ayiti ak dyaspora a. Ou ka pibliye pwodwi, achte ak escrow, pale ak vandè, jwenn travay, epi itilize pòtfèy / boost. Enskripsyon gratis. Pou detay, louvri /faq.",
      fr: "FLEXA MARKET est une marketplace d’achat-vente pour Haïti et la diaspora. Vous pouvez publier, acheter avec escrow, messager les vendeurs, et utiliser le portefeuille / boost. L’inscription est gratuite. Voir /faq.",
      en: "FLEXA MARKET is a buy/sell marketplace for Haiti and the Haitian diaspora. List products, buy with escrow, message sellers, and use wallet/boost tools. Sign-up is free. See /faq for more.",
      es: "FLEXA MARKET es un marketplace de compra-venta para Haití y la diáspora. Puedes publicar, comprar con escrow y usar billetera/boost. El registro es gratis. Ver /faq.",
      pt: "FLEXA MARKET é um marketplace de compra e venda para o Haiti e a diáspora. Você pode anunciar, comprar com escrow e usar carteira/boost. Cadastro gratuito. Veja /faq.",
    },
    deepLink: FLEXA_DEEP_LINKS.faq,
  },
  {
    id: "orders-escrow",
    topics: ["order", "orders", "escrow", "buy", "purchase", "komann", "commande", "achte"],
    title: "Orders and escrow",
    body: "When a buyer purchases, funds are held in escrow until delivery confirmation or the configured auto-release rules. Buyers track orders under Orders. Sellers see sales under their sales/orders views. Never invent a specific order status — use live order tools when the user asks about their order.",
    answers: {
      ht: "Lè ou achte, lajan an rete nan escrow jiskaske ou konfime livrezon an (oswa règ oto-lage platfòm nan). Swiv nan /orders. Si gen pwoblèm, ouvri yon diskisyon nan lòd la oswa /support.",
      fr: "À l’achat, l’argent est bloqué en escrow jusqu’à confirmation de livraison. Suivez vos commandes dans /orders. En cas de problème, ouvrez un litige ou /support.",
      en: "When you buy, funds stay in escrow until you confirm delivery (or auto-release rules apply). Track everything in /orders. If something is wrong, open a dispute or /support.",
      es: "Al comprar, el dinero queda en escrow hasta confirmar la entrega. Sigue tus pedidos en /orders. Si hay un problema, abre una disputa o /support.",
      pt: "Ao comprar, o valor fica em escrow até a confirmação da entrega. Acompanhe em /orders. Se houver problema, abra uma disputa ou /support.",
    },
    deepLink: FLEXA_DEEP_LINKS.orders,
  },
  {
    id: "refunds",
    topics: ["refund", "return", "dispute", "ranbousman", "remboursement", "diskisyon"],
    title: "Refunds and disputes",
    body: "Buyers can open a dispute from an order when eligible. Reviews typically occur within a few business days. Approved refunds follow the original payment method timelines (often 1–7 days). Exact eligibility is order-specific — do not invent refund amounts.",
    answers: {
      ht: "Pou mande ranbousman: ale nan /orders → chwazi lòd la → Ouvri yon diskisyon, mete prèv. Ekip la revize (souvan nan ~48è). Ranbousman apwouve yo swiv metòd peman orijinal la (1–7 jou).",
      fr: "Pour un remboursement: /orders → commande → Ouvrir un litige avec preuves. Revue souvent sous ~48h. Les remboursements approuvés suivent le délai du moyen de paiement (1–7 jours).",
      en: "To request a refund: /orders → select the order → Open a dispute with proof. Reviews often within ~48h. Approved refunds follow your original payment method (1–7 days).",
      es: "Para un reembolso: /orders → pedido → Abrir disputa con pruebas. Revisión ~48h. Los aprobados siguen el método original (1–7 días).",
      pt: "Para reembolso: /orders → pedido → Abrir disputa com provas. Análise ~48h. Aprovados seguem o método original (1–7 dias).",
    },
    deepLink: FLEXA_DEEP_LINKS.refund,
  },
  {
    id: "tracking",
    topics: ["tracking", "delivery", "livrezon", "shipping", "carrier", "livraison", "chofè"],
    title: "Delivery tracking",
    body: "International/carrier shipments may show carrier tracking when the seller provided a tracking number. Domestic Haiti local deliveries use Flexa Market’s local delivery workflow (driver assignment / PIN confirmation), not external carrier POD photos. Users can open Orders or Delivery tracking screens.",
    answers: {
      ht: "Pou swiv livrezon: ale nan /orders epi chwazi lòd la. Si vandè a mete yon nimewo tracking, ou ap wè li la. Livrezon lokal Ayiti sèvi ak workflow Flexa (chofè / PIN). Ou ka tou louvri /delivery-tracking.",
      fr: "Suivi: /orders → votre commande. Un numéro transporteur s’affiche s’il a été ajouté. Livraisons locales Haïti: workflow Flexa (chauffeur / PIN). Aussi /delivery-tracking.",
      en: "Track in /orders → your order. Carrier tracking appears when the seller added a number. Haiti local deliveries use Flexa’s driver/PIN flow. Also see /delivery-tracking.",
      es: "Sigue en /orders. El tracking del transportista aparece si el vendedor lo añadió. Entregas locales en Haití: flujo Flexa (conductor/PIN). También /delivery-tracking.",
      pt: "Acompanhe em /orders. Tracking do transportador aparece se o vendedor adicionou. Entregas locais no Haiti: fluxo Flexa (motorista/PIN). Também /delivery-tracking.",
    },
    deepLink: FLEXA_DEEP_LINKS.orders,
  },
  {
    id: "wallet",
    topics: ["wallet", "pòtfèy", "portefeuille", "balance", "topup", "recharge", "top-up", "solde"],
    title: "Wallet",
    body: "Users can view balance and history in Wallet. Top-up methods depend on country (e.g. MonCash in Haiti, card/Stripe where available, USDT). Promo balances may have spend restrictions (e.g. boosts). Never invent balances — use the wallet tool. Minimum top-up is typically $5 USD.",
    answers: {
      ht: "Pòtfèy FM: ale nan /wallet pou wè balans ak istwa. Pou rechaje: Wallet → Top up (MonCash, kat/Stripe, oswa USDT selon peyi). Minimòm tipik: $5 USD. Balans promo ka sèvi pou boost sèlman.",
      fr: "Portefeuille FM: /wallet pour le solde et l’historique. Recharge: Wallet → Top up (MonCash, carte/Stripe, ou USDT selon le pays). Minimum typique: 5 USD.",
      en: "FM Wallet: open /wallet for balance and history. Top up via Wallet → Top up (MonCash, card/Stripe, or USDT by country). Typical minimum: $5 USD. Promo balance is often boost-only.",
      es: "Billetera FM: /wallet para saldo e historial. Recarga en Wallet → Top up (MonCash, tarjeta/Stripe o USDT). Mínimo típico: $5 USD.",
      pt: "Carteira FM: /wallet para saldo e histórico. Recarregue em Wallet → Top up (MonCash, cartão/Stripe ou USDT). Mínimo típico: US$ 5.",
    },
    deepLink: FLEXA_DEEP_LINKS.wallet,
  },
  {
    id: "send-money",
    topics: [
      "send money", "transfer", "transfert", "voye", "voye lajan", "pataje", "pataje kob",
      "share money", "envoyer", "enviar dinero", "p2p", "account number", "nimewo kont",
    ],
    title: "Send / share money",
    body: "To send money to another Flexa Market user, open Wallet → Transfer (or /wallet/transfer). Search the recipient by name or enter their Flexa Market account number. Confirm the amount and fee preview before sending. Transfers are typically immediate and irreversible — double-check the account number. To receive money, share your FM account number from Wallet.",
    answers: {
      ht: "Pou voye / pataje kob ak yon lòt moun sou FLEXA:\n1. Ale nan /wallet (oswa /wallet/transfer)\n2. Chwazi Transfer / Voye\n3. Chèche moun nan oswa antre nimewo kont FM li\n4. Mete montan an, verifye frè a, konfime\n\nPou resevwa: nan Wallet, pataje nimewo kont FM ou. Transfè yo anjeneral imedyat epi yo pa ka anile — verifye nimewo a byen.",
      fr: "Pour envoyer / partager de l’argent:\n1. Ouvrez /wallet (ou /wallet/transfer)\n2. Choisissez Transfer / Envoyer\n3. Cherchez la personne ou saisissez son numéro de compte FM\n4. Montant → vérifiez les frais → confirmez\n\nPour recevoir: partagez votre numéro de compte FM depuis Wallet. Les transferts sont généralement immédiats et irréversibles.",
      en: "To send / share money with another Flexa user:\n1. Open /wallet (or /wallet/transfer)\n2. Choose Transfer / Send\n3. Search the person or enter their FM account number\n4. Enter amount, review the fee, confirm\n\nTo receive: share your FM account number from Wallet. Transfers are usually immediate and irreversible — double-check the number.",
      es: "Para enviar / compartir dinero:\n1. Abre /wallet (o /wallet/transfer)\n2. Elige Transfer / Enviar\n3. Busca a la persona o ingresa su número de cuenta FM\n4. Monto → revisa la comisión → confirma\n\nPara recibir: comparte tu número de cuenta FM. Las transferencias suelen ser inmediatas e irreversibles.",
      pt: "Para enviar / compartilhar dinheiro:\n1. Abra /wallet (ou /wallet/transfer)\n2. Escolha Transfer / Enviar\n3. Busque a pessoa ou digite o número da conta FM\n4. Valor → revise a taxa → confirme\n\nPara receber: compartilhe seu número de conta FM. Transferências costumam ser imediatas e irreversíveis.",
    },
    deepLink: FLEXA_DEEP_LINKS.walletTransfer,
  },
  {
    id: "fm-card",
    topics: ["fm card", "kat fm", "flex card", "flexcard", "carte fm", "tarjeta fm", "kat", "card debt"],
    title: "FM / Flex Card",
    body: "The FM / Flex Card is Flexa Market’s in-app card/balance experience for eligible users (notably Haiti and Dominican Republic contexts). It is managed in-app; balances and spending rules are shown on Wallet / Flex Card screens. If an admin blocks the card for debt, repay from the Flex Card repayment screen to restore spending, transfers, and withdrawals. Never invent card numbers or debts — direct users to Wallet / Flex Card or support.",
    answers: {
      ht: "Kat FM / Flex Card se eksperyans kat / balans nan app Flexa (sitou Ayiti ak Dominikani). Jere li nan /wallet oswa ekran Flex Card. Ou pa ka 'pataje' kat la tankou yon kat bank fizik — pou bay yon lòt moun kob, sèvi ak Transfer pòtfèy (/wallet/transfer) ak nimewo kont FM yo. Si kat la bloke poutèt dèt, ale nan /flex-card pou remèt.",
      fr: "La carte FM / Flex Card est gérée dans l’app (Wallet / Flex Card). Vous ne partagez pas la carte comme une carte bancaire physique — pour donner de l’argent à quelqu’un, utilisez Transfer (/wallet/transfer) avec le numéro de compte FM. Si la carte est bloquée pour dette, remboursez via /flex-card.",
      en: "The FM / Flex Card is managed in-app under Wallet / Flex Card. You don’t share the card like a physical bank card — to give money to someone, use Wallet Transfer (/wallet/transfer) with their FM account number. If the card is blocked for debt, repay via /flex-card.",
      es: "La tarjeta FM / Flex Card se gestiona en la app (Wallet / Flex Card). No se comparte como una tarjeta bancaria física: para enviar dinero usa Transfer (/wallet/transfer) con el número de cuenta FM. Si está bloqueada por deuda, paga en /flex-card.",
      pt: "O cartão FM / Flex Card é gerenciado no app (Wallet / Flex Card). Você não compartilha o cartão como um cartão físico — para enviar dinheiro use Transfer (/wallet/transfer) com o número da conta FM. Se estiver bloqueado por dívida, pague em /flex-card.",
    },
    deepLink: FLEXA_DEEP_LINKS.wallet,
  },
  {
    id: "notifications",
    topics: ["notification", "notifications", "notifikasyon", "notif", "push", "bell", "alèt", "alert"],
    title: "Notifications",
    body: "Manage push, email, and SMS preferences under Settings → Notifications (/settings/notifications). Enable browser/app push when prompted. Order, message, and promo alerts follow those toggles.",
    answers: {
      ht: "Pou jere notifikasyon: ale nan /settings/notifications. Ou ka aktive/dezaktive push, imèl, ak SMS. Asire w app/navigatè a gen pèmisyon notifikasyon.",
      fr: "Gérez les notifications dans /settings/notifications (push, e-mail, SMS). Autorisez aussi les notifications du navigateur/app.",
      en: "Manage notifications in /settings/notifications — push, email, and SMS toggles. Also allow browser/app notification permission.",
      es: "Gestiona notificaciones en /settings/notifications (push, email, SMS). Concede también permiso del navegador/app.",
      pt: "Gerencie notificações em /settings/notifications (push, e-mail, SMS). Permita também as notificações do navegador/app.",
    },
    deepLink: FLEXA_DEEP_LINKS.notifications,
  },
  {
    id: "recharge-agent",
    topics: ["agent recharge", "ajan", "recharge via agent", "authorized agent", "ajan otorize"],
    title: "Recharge via agent",
    body: "In supported regions, users can top up through an authorized Flexa agent from Wallet top-up flows (agent transfer option). Follow the on-screen instructions and keep your payment screenshot until the agent confirms.",
    answers: {
      ht: "Pou rechaje via ajan otorize: ale nan /wallet → Top up → chwazi opsyon ajan an, swiv enstriksyon yo epi kenbe screenshot peman an jiskaske ajan an konfime.",
      fr: "Recharge via agent: /wallet → Top up → option agent autorisé, suivez les étapes et gardez la capture jusqu’à confirmation.",
      en: "To recharge via an authorized agent: /wallet → Top up → choose the agent option, follow the steps, and keep your payment screenshot until confirmation.",
      es: "Recarga vía agente: /wallet → Top up → opción de agente autorizado; sigue los pasos y guarda el comprobante.",
      pt: "Recarga via agente: /wallet → Top up → opção de agente autorizado; siga os passos e guarde o comprovante.",
    },
    deepLink: FLEXA_DEEP_LINKS.wallet,
  },
  {
    id: "boost",
    topics: ["boost", "advertise", "ads", "promotion", "video", "publicit"],
    title: "Boost / advertising",
    body: "Sellers can boost approved published listings from the listing or Boost screens. Payment is confirmed before activation. Audience targeting and expiry are configured at boost time. Unapproved listings cannot be boosted.",
    answers: {
      ht: "Pou boost yon pwodwi: louvri anons ou → Boost, chwazi plan an, peye ak pòtfèy oswa kat. Boost aktive apre peman konfime. Ale nan /boost.",
      fr: "Pour booster: ouvrez votre annonce → Boost, choisissez le plan, payez. Activation après confirmation. Voir /boost.",
      en: "To boost a listing: open your product → Boost, pick a plan, pay via wallet or card. It activates after payment confirms. See /boost.",
      es: "Para impulsar: abre tu anuncio → Boost, elige plan y paga. Se activa tras confirmar el pago. Ver /boost.",
      pt: "Para impulsionar: abra seu anúncio → Boost, escolha o plano e pague. Ativa após confirmação. Veja /boost.",
    },
    deepLink: FLEXA_DEEP_LINKS.boost,
  },
  {
    id: "sell",
    topics: ["sell", "listing", "vann", "anons", "product", "pwodwi", "publier"],
    title: "Create a listing",
    body: "Use Sell to add photos (minimum required by the app), title, description, price, category, and location. Listings may be auto-approved, held for review, or rejected under marketplace compliance rules. See Prohibited Items for banned goods.",
    answers: {
      ht: "Pou vann: tap Sell / + → ajoute foto, tit, deskripsyon, pri, kategori, kote → Pibliye. Gade /prohibited-items pou sa ki entèdi. Kòmanse nan /sell.",
      fr: "Pour vendre: Sell / + → photos, titre, description, prix, catégorie, lieu → Publier. Voir /prohibited-items. Démarrez sur /sell.",
      en: "To sell: tap Sell / + → add photos, title, description, price, category, location → Publish. See /prohibited-items for bans. Start at /sell.",
      es: "Para vender: Sell / + → fotos, título, descripción, precio, categoría, ubicación → Publicar. Ver /prohibited-items. Empieza en /sell.",
      pt: "Para vender: Sell / + → fotos, título, descrição, preço, categoria, local → Publicar. Veja /prohibited-items. Comece em /sell.",
    },
    deepLink: FLEXA_DEEP_LINKS.sell,
  },
  {
    id: "prohibited",
    topics: ["prohibited", "banned", "illegal", "entèdi", "weapons", "drugs"],
    title: "Prohibited items",
    body: "Illegal drugs, real weapons/ammo, live animals for sale, explicit sexual products, stolen/counterfeit goods, and other prohibited categories are not allowed. Uncertain regulated goods may require human review. See /prohibited-items.",
    answers: {
      ht: "Atik entèdi yo gen dwòg ilegal, zam reyèl, bèt vivan pou vann, pwodwi seksyèl eksplisit, machandiz vòlè/kontrefason, elatriye. Lis konplè: /prohibited-items.",
      fr: "Interdits: drogues illégales, armes réelles, animaux vivants à la vente, produits sexuels explicites, contrefaçons, etc. Liste: /prohibited-items.",
      en: "Banned: illegal drugs, real weapons, live animals for sale, explicit sexual products, stolen/counterfeit goods, and more. Full list: /prohibited-items.",
      es: "Prohibido: drogas ilegales, armas reales, animales vivos, productos sexuales explícitos, falsificaciones, etc. Lista: /prohibited-items.",
      pt: "Proibido: drogas ilegais, armas reais, animais vivos, produtos sexuais explícitos, falsificações, etc. Lista: /prohibited-items.",
    },
    deepLink: FLEXA_DEEP_LINKS.prohibited,
  },
  {
    id: "subscription",
    topics: ["subscription", "plan", "vip", "premium", "abonman", "abonnement"],
    title: "Subscription plans",
    body: "Basic sellers have listing limits. Paid plans (Standard/Premium/VIP) unlock more listings and features such as listing video. Current plan details are shown on the Subscription screen — do not invent prices.",
    answers: {
      ht: "Plan Basic gen limit anons. Plan peye (Standard/Premium/VIP) bay plis anons ak opsyon (videyo, elatriye). Pri ak detay aktyèl: /subscription.",
      fr: "Le plan Basic a des limites. Les plans payants débloquent plus d’annonces et d’options. Détails: /subscription.",
      en: "Basic has listing limits. Paid plans unlock more listings and features. See current details on /subscription — prices shown in-app.",
      es: "Basic tiene límites. Los planes de pago desbloquean más anuncios y funciones. Detalles en /subscription.",
      pt: "Basic tem limites. Planos pagos liberam mais anúncios e recursos. Detalhes em /subscription.",
    },
    deepLink: FLEXA_DEEP_LINKS.subscription,
  },
  {
    id: "payments",
    topics: ["payout", "withdrawal", "moncash", "stripe", "retire", "withdraw", "retrait"],
    title: "Seller payouts",
    body: "Seller payout methods depend on country. Haiti-registered sellers may use MonCash where enabled; Stripe-only countries use Stripe Connect. Configure payouts under Settings → Payments. Do not invent payout timelines beyond what the user sees in-app.",
    answers: {
      ht: "Pou retire lajan: /wallet → Withdraw. Konfigire kont peman nan /settings/payments (MonCash oswa Stripe selon peyi). Trete anjeneral 1–7 jou ouvrab.",
      fr: "Retrait: /wallet → Withdraw. Configurez le compte dans /settings/payments (MonCash ou Stripe selon le pays). Délai typique 1–7 jours ouvrés.",
      en: "Withdraw via /wallet → Withdraw. Set up payouts in /settings/payments (MonCash or Stripe by country). Typical processing: 1–7 business days.",
      es: "Retiro: /wallet → Withdraw. Configura pagos en /settings/payments (MonCash o Stripe). Plazo típico: 1–7 días hábiles.",
      pt: "Saque: /wallet → Withdraw. Configure em /settings/payments (MonCash ou Stripe). Prazo típico: 1–7 dias úteis.",
    },
    deepLink: FLEXA_DEEP_LINKS.payments,
  },
  {
    id: "account",
    topics: ["password", "otp", "login", "account", "delete", "kont", "modpas", "paramèt"],
    title: "Account help",
    body: "Password reset and OTP flows are on Login / Forgot password. Account deletion is under Settings → Security or /delete-account (typically a delayed permanent deletion window). Never ask for passwords or OTP codes.",
    answers: {
      ht: "Modpas / OTP: Login → Forgot password. Efase kont: Settings → Security oswa /delete-account (efasman pèmanan apre yon delè). Pa janm pataje modpas oswa kòd OTP ak okenn moun oswa bot.",
      fr: "Mot de passe / OTP: Login → Forgot password. Suppression: Settings → Security ou /delete-account. Ne partagez jamais mot de passe ou OTP.",
      en: "Password / OTP: Sign in → Forgot password. Delete account: Settings → Security or /delete-account. Never share passwords or OTP codes.",
      es: "Contraseña / OTP: Login → Forgot password. Borrar cuenta: Settings → Security o /delete-account. Nunca compartas contraseñas ni OTP.",
      pt: "Senha / OTP: Login → Forgot password. Excluir conta: Settings → Security ou /delete-account. Nunca compartilhe senhas ou OTP.",
    },
    deepLink: FLEXA_DEEP_LINKS.settings,
  },
  {
    id: "support",
    topics: ["support", "agent", "human", "sipò", "aide", "help", "ajan"],
    title: "Human support",
    body: "Users can escalate from FlexaBot to a live support thread at /support. Provide clear problem details. FlexaBot cannot process payments, refunds, or account deletions itself.",
    answers: {
      ht: "Pou pale ak yon ajan reyèl, louvri /support epi dekri pwoblèm ou a klèman. FlexaBot pa ka fè peman, ranbousman, ni efase kont pou ou.",
      fr: "Pour un agent humain, ouvrez /support et décrivez clairement le problème. FlexaBot ne peut pas exécuter paiements, remboursements ou suppressions de compte.",
      en: "To talk to a real agent, open /support and describe your issue clearly. FlexaBot cannot process payments, refunds, or account deletions for you.",
      es: "Para un agente real, abre /support y describe el problema. FlexaBot no puede procesar pagos, reembolsos ni borrar cuentas.",
      pt: "Para um agente real, abra /support e descreva o problema. FlexaBot não processa pagamentos, reembolsos nem exclusão de conta.",
    },
    deepLink: FLEXA_DEEP_LINKS.support,
  },
];

/** Simple keyword retrieval — no embeddings required. */
export function retrieveKnowledge(query: string, limit = 4): KnowledgeSnippet[] {
  const q = query.toLowerCase();
  const scored = KNOWLEDGE_CORPUS.map((snip) => {
    let score = 0;
    for (const t of snip.topics) {
      const topic = t.toLowerCase();
      if (q.includes(topic)) score += topic.includes(" ") ? 4 : 3;
    }
    const titleWords = snip.title.toLowerCase().split(/\W+/);
    for (const w of titleWords) {
      if (w.length > 3 && q.includes(w)) score += 1;
    }
    const bodyHits = snip.body
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 4 && q.includes(w)).length;
    score += Math.min(bodyHits, 3) * 0.5;
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

export type ChatbotLang = "ht" | "fr" | "en" | "es" | "pt";

const GENERIC_HELP: Record<ChatbotLang, string> = {
  ht: "Mwen ka ede w ak kesyon sou FLEXA MARKET: lòd, pòtfèy, voye lajan, kat FM, notifikasyon, vann, boost, ak sipò.\nEksplike sa ou bezwen, oswa louvri /faq. Pou yon ajan moun: /support.",
  fr: "Je peux vous aider sur FLEXA MARKET: commandes, portefeuille, envoi d’argent, carte FM, notifications, vente, boost et support.\nPrécisez votre besoin, ou ouvrez /faq. Agent humain: /support.",
  en: "I can help with FLEXA MARKET topics: orders, wallet, sending money, FM card, notifications, selling, boosts, and support.\nTell me what you need, or open /faq. For a human agent: /support.",
  es: "Puedo ayudarte con FLEXA MARKET: pedidos, billetera, envío de dinero, tarjeta FM, notificaciones, venta, boost y soporte.\nDime qué necesitas, o abre /faq. Agente humano: /support.",
  pt: "Posso ajudar com FLEXA MARKET: pedidos, carteira, envio de dinheiro, cartão FM, notificações, venda, boost e suporte.\nDiga o que precisa, ou abra /faq. Agente humano: /support.",
};

/**
 * Deterministic answer from verified knowledge when the LLM provider is down.
 * Prefer curated `answers[lang]`, else English answer, else body + deep link.
 */
export function composeKnowledgeAnswer(opts: {
  lang: ChatbotLang;
  snippets: KnowledgeSnippet[];
  deepLinks?: string[];
}): { content: string; deepLinks: string[]; fromKnowledge: boolean } {
  const { lang, snippets } = opts;
  const links = new Set<string>(opts.deepLinks ?? []);

  if (!snippets.length) {
    links.add(FLEXA_DEEP_LINKS.faq);
    links.add(FLEXA_DEEP_LINKS.support);
    return { content: GENERIC_HELP[lang], deepLinks: [...links], fromKnowledge: true };
  }

  const primary = snippets[0];
  const localized =
    primary.answers?.[lang] ||
    primary.answers?.en ||
    `${primary.title}\n${primary.body}\n\n→ ${primary.deepLink}`;

  for (const s of snippets) links.add(s.deepLink);

  const extras = snippets.slice(1, 3).map((s) => `• ${s.title}: ${s.deepLink}`);
  const content =
    extras.length > 0
      ? `${localized}\n\n${lang === "ht" ? "Lòt lyen itil" : lang === "fr" ? "Autres liens utiles" : "Related links"}:\n${extras.join("\n")}`
      : localized;

  return { content, deepLinks: [...links], fromKnowledge: true };
}
