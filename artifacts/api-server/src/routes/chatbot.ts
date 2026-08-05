import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth } from "../middlewares/auth";

const router = Router();

// ── AI providers (optional — chatbot works without them via smart fallbacks) ──
const GROQ_API_KEY  = process.env.GROQ_API_KEY ?? "";
const GROQ_MODEL    = "llama-3.1-8b-instant";
const GROQ_API_URL  = "https://api.groq.com/openai/v1/chat/completions";

const anthropicBaseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
const anthropicApiKey  = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
const anthropicClient  = anthropicBaseURL && anthropicApiKey
  ? new Anthropic({ baseURL: anthropicBaseURL, apiKey: anthropicApiKey, timeout: 12000 })
  : null;

const SYSTEM_PROMPT = `You are FlexaBot, the friendly AI assistant for FLEXA MARKET — a peer-to-peer marketplace for Haiti and the Caribbean.
Reply in the SAME language the user wrote in (Haitian Creole, French, English, Spanish, or Portuguese).
Be warm, concise (2-4 sentences), and helpful. Never share passwords or card numbers.`;

type ChatMessage = { role: "user" | "assistant"; content: string };
type Lang = "ht" | "fr" | "en" | "es" | "pt";

// ── Language detection ────────────────────────────────────────────────────────
function detectLang(text: string): Lang {
  const t = text.toLowerCase();
  const ht = ["mwen", "kijan", "pou mwen", "nan flexa", "eske", "kote", "konbyen", "ak peman", "ak bagay"];
  const fr = ["comment", "je suis", "puis-je", "mon compte", "comment fonctionne", "votre"];
  const es = ["¿cómo", "cómo", "mi cuenta", "cómo funciona", "cómo gestiono"];
  const pt = ["como gerenciar", "como funciona", "minha carteira", "meu cartão", "como solicito"];
  if (ht.some(k => t.includes(k))) return "ht";
  if (fr.some(k => t.includes(k))) return "fr";
  if (es.some(k => t.includes(k))) return "es";
  if (pt.some(k => t.includes(k))) return "pt";
  return "en";
}

// ── Hardcoded topic responses (covers all 15 quick-topic buttons) ─────────────
// Keyed by a topic ID detected from keyword patterns in the user message.
type LangMap = Record<Lang, string>;

interface TopicEntry { keywords: string[]; response: LangMap }

const TOPIC_RESPONSES: TopicEntry[] = [
  {
    keywords: ["kont mwen ak peman", "mon compte et mes paiements", "manage my account and payments", "mi cuenta y pagos", "minha conta e pagamentos"],
    response: {
      ht: "Pou jere kont ou sou FLEXA MARKET:\n• Ale nan **Profil** (ikonn moun anlè adwat)\n• Chanje imèl, modpas, oswa foto ou nan **Paramèt**\n• Wè tout metòd peman ou yo nan seksyon **Peman**\n\nSi ou gen pwoblèm ak kont ou, kontakte sipò nou an dirèkteman.",
      fr: "Pour gérer votre compte sur FLEXA MARKET :\n• Allez dans **Profil** (icône en haut à droite)\n• Modifiez votre email, mot de passe ou photo dans **Paramètres**\n• Consultez vos méthodes de paiement dans la section **Paiement**\n\nPour tout problème, contactez notre support.",
      en: "To manage your FLEXA MARKET account:\n• Go to **Profile** (top-right icon)\n• Change email, password, or photo in **Settings**\n• View your payment methods in the **Payment** section\n\nFor issues, contact our support team directly.",
      es: "Para gestionar tu cuenta en FLEXA MARKET:\n• Ve a **Perfil** (ícono arriba a la derecha)\n• Cambia email, contraseña o foto en **Configuración**\n• Consulta tus métodos de pago en la sección **Pago**\n\nPara problemas, contacta nuestro soporte.",
      pt: "Para gerenciar sua conta no FLEXA MARKET:\n• Vá para **Perfil** (ícone no canto superior direito)\n• Altere email, senha ou foto em **Configurações**\n• Veja seus métodos de pagamento na seção **Pagamento**\n\nPara problemas, entre em contato com o suporte.",
    },
  },
  {
    keywords: ["pòtfèy fm mwen", "mon portefeuille fm", "my fm wallet", "mi billetera fm", "minha carteira fm"],
    response: {
      ht: "Pòtfèy FM ou se kont lajan dijital ou sou FLEXA:\n• **Wè balans** → ale nan Pòtfèy nan meni\n• **Rechaje** → ak MonCash, kat, oswa via ajan\n• **Itilize** → pou achte, peye livrezon, oswa voye lajan\n\nLajan nan pòtfèy ou ka retire nenpòt ki lè nan Settings → Peman.",
      fr: "Votre portefeuille FM est votre compte digital FLEXA :\n• **Voir le solde** → allez dans Portefeuille dans le menu\n• **Recharger** → via MonCash, carte ou agent\n• **Utiliser** → pour acheter, payer la livraison ou envoyer de l'argent\n\nVous pouvez retirer l'argent depuis Paramètres → Paiement.",
      en: "Your FM wallet is your FLEXA digital money account:\n• **Check balance** → go to Wallet in the menu\n• **Top up** → via MonCash, card, or agent\n• **Use it** → to buy, pay delivery, or send money\n\nWithdraw funds anytime in Settings → Payment.",
      es: "Tu billetera FM es tu cuenta de dinero digital FLEXA:\n• **Ver saldo** → ve a Billetera en el menú\n• **Recargar** → via MonCash, tarjeta o agente\n• **Usar** → para comprar, pagar entrega o enviar dinero\n\nRetira fondos en Configuración → Pago.",
      pt: "Sua carteira FM é sua conta de dinheiro digital FLEXA:\n• **Ver saldo** → vá para Carteira no menu\n• **Recarregar** → via MonCash, cartão ou agente\n• **Usar** → para comprar, pagar entrega ou enviar dinheiro\n\nSaque fundos em Configurações → Pagamento.",
    },
  },
  {
    keywords: ["rechaje pòtfèy mwen via yon ajan", "recharger mon portefeuille via un agent", "recharge my wallet through a flexa agent", "recargar mi billetera a través de un agente", "recarregar minha carteira através de um agente"],
    response: {
      ht: "Pou rechaje via ajan FLEXA:\n1. Jwenn yon ajan FLEXA pre ou (mande nan chat sipò)\n2. Ba ajan an lajan kach + nimewo kont ou\n3. Ajan an ap kredite pòtfèy ou nan kèk minit\n\nFrè: 0-2% depann sou ajan an. Toujou verifye reçu ou!",
      fr: "Pour recharger via un agent FLEXA :\n1. Trouvez un agent FLEXA près de vous (demandez au support)\n2. Donnez l'argent liquide + votre numéro de compte à l'agent\n3. L'agent créditera votre portefeuille en quelques minutes\n\nFrais : 0-2% selon l'agent. Vérifiez toujours votre reçu !",
      en: "To recharge via a FLEXA agent:\n1. Find a FLEXA agent near you (ask support for the list)\n2. Give cash + your account number to the agent\n3. Agent credits your wallet within minutes\n\nFee: 0-2% depending on the agent. Always verify your receipt!",
      es: "Para recargar via agente FLEXA:\n1. Encuentra un agente FLEXA cerca (pregunta al soporte)\n2. Da efectivo + tu número de cuenta al agente\n3. El agente acreditará tu billetera en minutos\n\nComisión: 0-2% según el agente. ¡Siempre verifica tu recibo!",
      pt: "Para recarregar via agente FLEXA:\n1. Encontre um agente FLEXA perto (pergunte ao suporte)\n2. Dê dinheiro + seu número de conta ao agente\n3. O agente creditará sua carteira em minutos\n\nTaxa: 0-2% dependendo do agente. Sempre verifique seu recibo!",
    },
  },
  {
    keywords: ["voye lajan bay yon lòt moun", "envoyer de l'argent à quelqu'un", "send money to someone on flexa", "envío dinero a alguien en flexa", "envio dinheiro para alguém no flexa"],
    response: {
      ht: "Pou voye lajan sou FLEXA:\n1. Ale nan **Pòtfèy** → **Voye Lajan**\n2. Antre nimewo telefòn oswa non destinatè a\n3. Tape montan an epi konfime\n\nFrè: 1% + $3 pou premye transfè chak jou. Transfè yo imèdya!",
      fr: "Pour envoyer de l'argent sur FLEXA :\n1. Allez dans **Portefeuille** → **Envoyer**\n2. Entrez le numéro de téléphone ou le nom du destinataire\n3. Saisissez le montant et confirmez\n\nFrais : 1% + $3 pour le premier transfert du jour. Transferts instantanés !",
      en: "To send money on FLEXA:\n1. Go to **Wallet** → **Send Money**\n2. Enter recipient's phone number or name\n3. Enter amount and confirm\n\nFee: 1% + $3 for the first transfer of the day. Instant transfers!",
      es: "Para enviar dinero en FLEXA:\n1. Ve a **Billetera** → **Enviar Dinero**\n2. Ingresa el teléfono o nombre del destinatario\n3. Ingresa el monto y confirma\n\nComisión: 1% + $3 por el primer envío del día. ¡Transferencias instantáneas!",
      pt: "Para enviar dinheiro no FLEXA:\n1. Vá para **Carteira** → **Enviar Dinheiro**\n2. Insira o telefone ou nome do destinatário\n3. Insira o valor e confirme\n\nTaxa: 1% + $3 para a primeira transferência do dia. Transferências instantâneas!",
    },
  },
  {
    keywords: ["resevwa lajan ak peman", "recevoir de l'argent et des paiements", "receive money and payments on flexa", "recibo dinero y pagos en flexa", "recebo dinheiro e pagamentos no flexa"],
    response: {
      ht: "Pou resevwa lajan sou FLEXA:\n• **Achte**: lajan an ale nan pòtfèy ou otomatikman apre livrezon\n• **Vant**: 93% pri vant la (apre komisyon 7%) al nan pòtfèy ou\n• **Transfè**: moun voye lajan ba ou dirèkteman nan pòtfèy ou\n\nWè tout peman yo nan Pòtfèy → Istwa Transaksyon.",
      fr: "Pour recevoir de l'argent sur FLEXA :\n• **Achat** : l'argent va automatiquement dans votre portefeuille après livraison\n• **Vente** : 93% du prix (après commission 7%) va dans votre portefeuille\n• **Transfert** : quelqu'un vous envoie directement de l'argent\n\nConsultez Portefeuille → Historique.",
      en: "To receive money on FLEXA:\n• **Purchase**: funds auto-credit your wallet after delivery\n• **Sale**: 93% of sale price (after 7% commission) goes to your wallet\n• **Transfer**: someone sends you money directly to your wallet\n\nSee all payments in Wallet → Transaction History.",
      es: "Para recibir dinero en FLEXA:\n• **Compra**: los fondos se acreditan automáticamente tras la entrega\n• **Venta**: 93% del precio (tras 7% de comisión) va a tu billetera\n• **Transferencia**: alguien te envía dinero directamente\n\nVe todo en Billetera → Historial.",
      pt: "Para receber dinheiro no FLEXA:\n• **Compra**: fundos creditados automaticamente após entrega\n• **Venda**: 93% do preço (após 7% de comissão) vai para sua carteira\n• **Transferência**: alguém envia dinheiro diretamente para você\n\nVeja tudo em Carteira → Histórico.",
    },
  },
  {
    keywords: ["istwa tout transaksyon mwen yo", "l'historique de toutes mes transactions", "history of all my transactions", "historial de todas mis transacciones", "histórico de todas as minhas transações"],
    response: {
      ht: "Pou wè istwa transaksyon ou:\n1. Ale nan **Pòtfèy** nan meni prensipal\n2. Klike sou **Istwa** oswa **Aktivite**\n3. Filtre pa dat, kalite (achte/vann/transfè)\n\nChak transaksyon gen yon reçu ou ka telechaje. Si ou wè yon transaksyon ou pa rekonèt, kontakte sipò nou imèdyatman!",
      fr: "Pour voir l'historique de vos transactions :\n1. Allez dans **Portefeuille** dans le menu principal\n2. Cliquez sur **Historique** ou **Activité**\n3. Filtrez par date, type (achat/vente/transfert)\n\nChaque transaction a un reçu téléchargeable. Si vous voyez une transaction inconnue, contactez notre support immédiatement !",
      en: "To view your transaction history:\n1. Go to **Wallet** in the main menu\n2. Click **History** or **Activity**\n3. Filter by date, type (purchase/sale/transfer)\n\nEach transaction has a downloadable receipt. If you see an unknown transaction, contact support immediately!",
      es: "Para ver tu historial de transacciones:\n1. Ve a **Billetera** en el menú principal\n2. Haz clic en **Historial** o **Actividad**\n3. Filtra por fecha, tipo (compra/venta/transferencia)\n\nCada transacción tiene un recibo descargable. ¡Si ves algo desconocido, contacta soporte!",
      pt: "Para ver seu histórico de transações:\n1. Vá para **Carteira** no menu principal\n2. Clique em **Histórico** ou **Atividade**\n3. Filtre por data, tipo (compra/venda/transferência)\n\nCada transação tem um recibo para download. Se ver algo desconhecido, contate o suporte!",
    },
  },
  {
    keywords: ["kat fm mwen mache", "ma carte fm", "my fm card", "mi tarjeta fm", "meu cartão fm"],
    response: {
      ht: "Kat FM ou se yon kat vityèl (oswa fizik) pou peye:\n• **Kote** → nenpòt kote ki aksepte Visa/MonCash\n• **Limite** → depann sou balans pòtfèy ou\n• **Jere kat ou** → Settings → Kat Mwen\n\nPou aktivasyon oswa pwoblèm, ale nan Settings → Peman → Kat Mwen.",
      fr: "Votre carte FM est une carte virtuelle (ou physique) pour payer :\n• **Où** → partout où Visa/MonCash est accepté\n• **Limite** → dépend du solde de votre portefeuille\n• **Gérer votre carte** → Paramètres → Ma Carte\n\nPour l'activation ou les problèmes, allez dans Paramètres → Paiement → Ma Carte.",
      en: "Your FM card is a virtual (or physical) card for payments:\n• **Where** → anywhere Visa/MonCash is accepted\n• **Limit** → depends on your wallet balance\n• **Manage** → Settings → My Card\n\nFor activation or issues, go to Settings → Payment → My Card.",
      es: "Tu tarjeta FM es una tarjeta virtual (o física) para pagar:\n• **Dónde** → donde se acepte Visa/MonCash\n• **Límite** → depende del saldo de tu billetera\n• **Gestionar** → Configuración → Mi Tarjeta\n\nPara activación o problemas, ve a Configuración → Pago → Mi Tarjeta.",
      pt: "Seu cartão FM é um cartão virtual (ou físico) para pagamentos:\n• **Onde** → onde Visa/MonCash for aceito\n• **Limite** → depende do saldo da sua carteira\n• **Gerenciar** → Configurações → Meu Cartão\n\nPara ativação ou problemas, vá em Configurações → Pagamento → Meu Cartão.",
    },
  },
  {
    keywords: ["jere notifikasyon mwen yo", "gérer mes notifications", "manage my notifications on flexa", "gestiono mis notificaciones en flexa", "gerenciar minhas notificações no flexa"],
    response: {
      ht: "Pou jere notifikasyon FLEXA:\n• **Aktive/Dezaktive** → Settings → Notifikasyon\n• **Kalite**: mesaj, kòmand, ofèt, pwomosyon\n• **Push notif** → asire ou ba aplikasyon an pèmisyon sou telefòn ou\n\nSi ou pa resevwa notifikasyon, verifye pèmisyon aplikasyon an nan Settings telefòn ou.",
      fr: "Pour gérer les notifications FLEXA :\n• **Activer/Désactiver** → Paramètres → Notifications\n• **Types** : messages, commandes, offres, promotions\n• **Notifs push** → assurez-vous d'avoir accordé la permission à l'app\n\nSi vous ne recevez pas de notifications, vérifiez les permissions dans les paramètres de votre téléphone.",
      en: "To manage FLEXA notifications:\n• **Enable/Disable** → Settings → Notifications\n• **Types**: messages, orders, offers, promotions\n• **Push notifs** → make sure the app has permission on your phone\n\nNot getting notifications? Check app permissions in your phone settings.",
      es: "Para gestionar las notificaciones de FLEXA:\n• **Activar/Desactivar** → Configuración → Notificaciones\n• **Tipos**: mensajes, pedidos, ofertas, promociones\n• **Push** → asegúrate de dar permiso a la app en tu teléfono\n\n¿No recibes notificaciones? Verifica permisos en configuración del teléfono.",
      pt: "Para gerenciar notificações do FLEXA:\n• **Ativar/Desativar** → Configurações → Notificações\n• **Tipos**: mensagens, pedidos, ofertas, promoções\n• **Push** → certifique-se de dar permissão ao app no seu celular\n\nNão recebe notificações? Verifique permissões nas configurações do telefone.",
    },
  },
  {
    keywords: ["kontakte sipò flexa", "contacter le support flexa", "contact flexa support", "contacto el soporte de flexa", "contatar o suporte flexa"],
    response: {
      ht: "Pou jwenn sipò FLEXA:\n• **Chat dirèk** → klike bouton \"Talk to an agent\" anlè a\n• **Mesaj** → ale nan Sipò nan meni \"More\"\n• **Imèl** → support@flexamarket.com\n\nLè operasyon: Lendi-Vandredi 8am-8pm (Haiti). Nou reponn nan 24h.",
      fr: "Pour contacter le support FLEXA :\n• **Chat direct** → cliquez sur \"Talk to an agent\" en haut\n• **Message** → allez dans Support dans le menu \"Plus\"\n• **Email** → support@flexamarket.com\n\nHeures : Lun-Ven 8h-20h (Haïti). Réponse sous 24h.",
      en: "To contact FLEXA support:\n• **Live chat** → click \"Talk to an agent\" above\n• **Message** → go to Support in the \"More\" menu\n• **Email** → support@flexamarket.com\n\nHours: Mon-Fri 8am-8pm (Haiti time). Response within 24h.",
      es: "Para contactar el soporte de FLEXA:\n• **Chat en vivo** → haz clic en \"Talk to an agent\" arriba\n• **Mensaje** → ve a Soporte en el menú \"Más\"\n• **Email** → support@flexamarket.com\n\nHorario: Lun-Vie 8am-8pm (hora Haití). Respuesta en 24h.",
      pt: "Para contatar o suporte FLEXA:\n• **Chat ao vivo** → clique em \"Talk to an agent\" acima\n• **Mensagem** → vá em Suporte no menu \"Mais\"\n• **Email** → support@flexamarket.com\n\nHorário: Seg-Sex 8h-20h (hora Haiti). Resposta em 24h.",
    },
  },
  {
    keywords: ["sèvis livrezon flexa mache", "la livraison flexa", "flexa delivery work", "la entrega de flexa", "a entrega flexa"],
    response: {
      ht: "Sèvis livrezon FLEXA:\n• **Menm komin**: Moto $3 | Oto Compact $5 | SUV/Gwo oto $8\n• **Kwaze vil**: $2 pa km, minimòm $3\n• **Tan**: 1-4 èdtan pou menm komin, 1-3 jou pou lòt vil\n\nTwase livrezon ou an reyèl tan nan Kòmand → Istwa Kòmand.",
      fr: "Service de livraison FLEXA :\n• **Même commune** : Moto $3 | Voiture Compact $5 | SUV $8\n• **Cross-ville** : $2/km, minimum $3\n• **Délai** : 1-4h pour la même commune, 1-3 jours pour d'autres villes\n\nSuivez votre livraison en temps réel dans Commandes → Historique.",
      en: "FLEXA delivery service:\n• **Same area**: Motorcycle $3 | Compact car $5 | SUV/Large $8\n• **Cross-city**: $2/km, minimum $3\n• **Time**: 1-4 hours same area, 1-3 days other cities\n\nTrack your delivery in real time in Orders → Order History.",
      es: "Servicio de entrega FLEXA:\n• **Misma zona**: Moto $3 | Auto Compacto $5 | SUV $8\n• **Inter-ciudad**: $2/km, mínimo $3\n• **Tiempo**: 1-4h misma zona, 1-3 días otras ciudades\n\nSigue tu entrega en tiempo real en Pedidos → Historial.",
      pt: "Serviço de entrega FLEXA:\n• **Mesma zona**: Moto $3 | Carro Compacto $5 | SUV $8\n• **Entre cidades**: $2/km, mínimo $3\n• **Tempo**: 1-4h mesma zona, 1-3 dias outras cidades\n\nRastreie sua entrega em tempo real em Pedidos → Histórico.",
    },
  },
  {
    keywords: ["flexa music mache", "flexa music fonctionne", "flexa music work", "flexa music funciona", "flexa music funciona"],
    response: {
      ht: "FLEXA Music:\n• **Koute** → ale nan seksyon Mizik nan aplikasyon an, lib gratis!\n• **Achte chante** → $0.99-$2.99 pou yon chante (80% al bay atis la)\n• **Vann mizik ou** → ou dwe yon atis verifye — ale nan Profil → Atis\n• **Rechèch** → chèche pa non chante, atis, oswa jan\n\nArtis yo resevwa peman chak semenn nan pòtfèy yo.",
      fr: "FLEXA Music :\n• **Écouter** → allez dans la section Musique, gratuit !\n• **Acheter** → $0.99-$2.99/chanson (80% pour l'artiste)\n• **Vendre** → vous devez être artiste vérifié — Profil → Artiste\n• **Recherche** → par titre, artiste ou genre\n\nLes artistes sont payés chaque semaine dans leur portefeuille.",
      en: "FLEXA Music:\n• **Listen** → go to the Music section in the app, free!\n• **Buy tracks** → $0.99-$2.99 per song (80% goes to the artist)\n• **Sell music** → must be a verified artist — Profile → Artist\n• **Search** → by song name, artist, or genre\n\nArtists get paid weekly to their wallet.",
      es: "FLEXA Music:\n• **Escuchar** → ve a la sección Música en la app, ¡gratis!\n• **Comprar** → $0.99-$2.99/canción (80% para el artista)\n• **Vender** → debes ser artista verificado — Perfil → Artista\n• **Buscar** → por nombre, artista o género\n\nLos artistas cobran semanalmente en su billetera.",
      pt: "FLEXA Music:\n• **Ouvir** → vá para a seção Música no app, grátis!\n• **Comprar** → $0.99-$2.99/música (80% para o artista)\n• **Vender** → deve ser artista verificado — Perfil → Artista\n• **Buscar** → por nome, artista ou gênero\n\nArtistas recebem pagamento semanal na carteira.",
    },
  },
  {
    keywords: ["poste yon anons", "publier une annonce", "post a listing", "publico un anuncio", "publico um anúncio", "boost mache", "fonctionne le boost", "boost work", "funciona el boost", "funciona o boost"],
    response: {
      ht: "Pou poste yon anons:\n1. Klike bouton **+** orange nan meni anlè\n2. Pran foto, ajoute tit, pri, ak deskripsyon\n3. Chwazi kategori a epi piblie!\n\n**Boost** → peye $5+/jou pou anons ou parèt anlè rechèch. Pi wo boost = pi plis vit ou vann. Jere boost ou nan Anons → Boost.",
      fr: "Pour publier une annonce :\n1. Cliquez sur le bouton **+** orange dans le menu\n2. Prenez des photos, ajoutez titre, prix et description\n3. Choisissez la catégorie et publiez !\n\n**Boost** → payez $5+/jour pour apparaître en tête des résultats. Plus le boost est élevé, plus vous vendez vite. Gérez dans Annonces → Boost.",
      en: "To post a listing:\n1. Click the orange **+** button in the menu\n2. Take photos, add title, price, and description\n3. Choose a category and publish!\n\n**Boost** → pay $5+/day to appear at the top of search. Higher boost = sell faster. Manage in Listings → Boost.",
      es: "Para publicar un anuncio:\n1. Haz clic en el botón **+** naranja del menú\n2. Toma fotos, agrega título, precio y descripción\n3. Elige una categoría y ¡publica!\n\n**Boost** → paga $5+/día para aparecer arriba en búsquedas. Mayor boost = vendes más rápido. Gestiona en Anuncios → Boost.",
      pt: "Para publicar um anúncio:\n1. Clique no botão **+** laranja no menu\n2. Tire fotos, adicione título, preço e descrição\n3. Escolha uma categoria e publique!\n\n**Boost** → pague $5+/dia para aparecer no topo das buscas. Maior boost = vende mais rápido. Gerencie em Anúncios → Boost.",
    },
  },
  {
    keywords: ["aplike pou yon prè", "demande de prêt", "apply for a loan on flexa", "solicitar un préstamo en flexa", "solicitar um empréstimo no flexa"],
    response: {
      ht: "Prè FLEXA (Flex Card / BNPL):\n• **Kondisyon**: kont verifye, 3+ mwa aktivite, bon istwa peman\n• **Montan**: $50 - $500 (depann sou nivo ou)\n• **Kijan**: Ale nan **Prè** nan meni → Aplike\n• **Ranbousman**: apre 30, 60, oswa 90 jou\n\nSi depo ou aksepte, lajan an al nan pòtfèy ou imedyatman. Kontak sipò pou plis enfòmasyon.",
      fr: "Prêt FLEXA (Flex Card / BNPL) :\n• **Conditions** : compte vérifié, 3+ mois d'activité, bon historique\n• **Montant** : $50 - $500 (selon votre niveau)\n• **Comment** : allez dans **Prêt** dans le menu → Demander\n• **Remboursement** : en 30, 60 ou 90 jours\n\nSi approuvé, l'argent est crédité immédiatement. Contactez le support pour plus d'infos.",
      en: "FLEXA Loan (Flex Card / BNPL):\n• **Requirements**: verified account, 3+ months activity, good payment history\n• **Amount**: $50 - $500 (depends on your level)\n• **How**: Go to **Loans** in the menu → Apply\n• **Repayment**: after 30, 60, or 90 days\n\nIf approved, funds go to your wallet immediately. Contact support for details.",
      es: "Préstamo FLEXA (Flex Card / BNPL):\n• **Requisitos**: cuenta verificada, 3+ meses de actividad, buen historial\n• **Monto**: $50 - $500 (según tu nivel)\n• **Cómo**: Ve a **Préstamos** en el menú → Solicitar\n• **Pago**: en 30, 60 o 90 días\n\nSi aprobado, los fondos van a tu billetera inmediatamente. Contacta soporte para detalles.",
      pt: "Empréstimo FLEXA (Flex Card / BNPL):\n• **Requisitos**: conta verificada, 3+ meses de atividade, bom histórico\n• **Valor**: $50 - $500 (depende do seu nível)\n• **Como**: Vá em **Empréstimos** no menu → Solicitar\n• **Pagamento**: em 30, 60 ou 90 dias\n\nSe aprovado, os fundos vão para sua carteira imediatamente. Contate o suporte para detalhes.",
    },
  },
  {
    keywords: ["travay (jobs) mache sou flexa", "offres d'emploi sur flexa", "jobs work on flexa", "empleos en flexa", "empregos no flexa"],
    response: {
      ht: "Seksyon Travay (Jobs) FLEXA:\n• **Chèche travay** → ale nan **Travay** nan meni, filtre pa komin/kalite\n• **Aplike** → klike anons la epi voye aplikasyon ou\n• **Pibliye yon ofèt** → klike **+** → chwazi Travay kòm kategori\n\nAnpwayè yo verifye ak FLEXA. Toujou fè entèvyou anvan ou aksepte nenpòt travay!",
      fr: "Section Emplois FLEXA :\n• **Chercher** → allez dans **Emplois** dans le menu, filtrez par commune/type\n• **Postuler** → cliquez sur l'annonce et envoyez votre candidature\n• **Publier une offre** → cliquez **+** → choisissez Emploi comme catégorie\n\nLes employeurs sont vérifiés par FLEXA. Faites toujours un entretien avant d'accepter !",
      en: "FLEXA Jobs section:\n• **Find jobs** → go to **Jobs** in the menu, filter by area/type\n• **Apply** → click the listing and send your application\n• **Post a job** → click **+** → choose Job as category\n\nEmployers are verified by FLEXA. Always do an interview before accepting any job!",
      es: "Sección Empleos FLEXA:\n• **Buscar** → ve a **Empleos** en el menú, filtra por zona/tipo\n• **Aplicar** → haz clic en el anuncio y envía tu solicitud\n• **Publicar oferta** → haz clic en **+** → elige Empleo como categoría\n\nLos empleadores están verificados por FLEXA. ¡Siempre haz una entrevista antes de aceptar!",
      pt: "Seção Empregos FLEXA:\n• **Procurar** → vá em **Empregos** no menu, filtre por área/tipo\n• **Candidatar** → clique no anúncio e envie sua candidatura\n• **Publicar vaga** → clique em **+** → escolha Emprego como categoria\n\nEmpregadores são verificados pelo FLEXA. Sempre faça uma entrevista antes de aceitar!",
    },
  },
  {
    keywords: ["chanje lang aplikasyon an", "changer la langue de l'application", "change the app language on flexa", "cambio el idioma de la aplicación en flexa", "mudo o idioma do aplicativo no flexa"],
    response: {
      ht: "Pou chanje lang FLEXA:\n1. Ale nan meni **More** (anlè adwat)\n2. Klike sou **Settings** → **Lang**\n3. Chwazi: Kreyòl 🇭🇹 | Français 🇫🇷 | English 🇺🇸 | Español 🇪🇸\n\nChanjman an aktif imedyatman — pa bezwen rekomanse aplikasyon an!",
      fr: "Pour changer la langue de FLEXA :\n1. Allez dans le menu **Plus** (en haut à droite)\n2. Cliquez sur **Paramètres** → **Langue**\n3. Choisissez : Kreyòl 🇭🇹 | Français 🇫🇷 | English 🇺🇸 | Español 🇪🇸\n\nLe changement est immédiat — pas besoin de redémarrer l'app !",
      en: "To change the FLEXA language:\n1. Go to the **More** menu (top right flag icon)\n2. Click **Settings** → **Language**\n3. Choose: Kreyòl 🇭🇹 | Français 🇫🇷 | English 🇺🇸 | Español 🇪🇸\n\nChange is immediate — no need to restart the app!",
      es: "Para cambiar el idioma de FLEXA:\n1. Ve al menú **Más** (ícono de bandera arriba a la derecha)\n2. Haz clic en **Configuración** → **Idioma**\n3. Elige: Kreyòl 🇭🇹 | Français 🇫🇷 | English 🇺🇸 | Español 🇪🇸\n\n¡El cambio es inmediato, no necesitas reiniciar la app!",
      pt: "Para mudar o idioma do FLEXA:\n1. Vá ao menu **Mais** (ícone de bandeira no canto superior)\n2. Clique em **Configurações** → **Idioma**\n3. Escolha: Kreyòl 🇭🇹 | Français 🇫🇷 | English 🇺🇸 | Español 🇪🇸\n\nA mudança é imediata — não precisa reiniciar o app!",
    },
  },
];

// ── Fallback responses when AI is unavailable ─────────────────────────────────
const FALLBACK: LangMap = {
  ht: "Mwen pa ka reponn kounye a 😕 — AI asistan an okipe. Men ou ka:\n• Itilize bouton topik yo anlè a pou enfòmasyon rapid\n• Klike **Talk to an agent** pou yon ajan reyèl\n• Oswa eseye ankò nan kèk minit.",
  fr: "Je ne peux pas répondre maintenant 😕 — l'assistant AI est occupé. Vous pouvez :\n• Utiliser les boutons de sujets ci-dessus pour des infos rapides\n• Cliquer **Talk to an agent** pour un agent réel\n• Ou réessayer dans quelques minutes.",
  en: "I can't respond right now 😕 — the AI assistant is busy. You can:\n• Use the topic buttons above for quick info\n• Click **Talk to an agent** for a real agent\n• Or try again in a few minutes.",
  es: "No puedo responder ahora 😕 — el asistente AI está ocupado. Puedes:\n• Usar los botones de temas de arriba para info rápida\n• Hacer clic en **Talk to an agent** para un agente real\n• O intentarlo de nuevo en unos minutos.",
  pt: "Não posso responder agora 😕 — o assistente AI está ocupado. Você pode:\n• Usar os botões de tópicos acima para info rápida\n• Clicar em **Talk to an agent** para um agente real\n• Ou tentar novamente em alguns minutos.",
};

// ── Topic matcher: check if last user message matches a predefined topic ──────
function matchTopic(text: string): TopicEntry | null {
  const t = text.toLowerCase().trim();
  for (const entry of TOPIC_RESPONSES) {
    if (entry.keywords.some(kw => t.includes(kw.toLowerCase()))) return entry;
  }
  return null;
}

// ── Body parser ───────────────────────────────────────────────────────────────
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
    if (content.length > 4000) return { ok: false, error: "Message too long" };
    cleaned.push({ role, content });
  }
  if (cleaned[cleaned.length - 1].role !== "user") return { ok: false, error: "Last message must be from user" };
  return { ok: true, messages: cleaned };
}

// ── AI callers with strict timeouts ──────────────────────────────────────────
async function callGroq(messages: ChatMessage[]): Promise<string> {
  const res = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 512,
      temperature: 0.6,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw Object.assign(new Error(err?.error?.message ?? `Groq ${res.status}`), { status: res.status });
  }
  const json = await res.json() as any;
  return (json.choices?.[0]?.message?.content ?? "").trim();
}

async function callAnthropic(messages: ChatMessage[]): Promise<string> {
  if (!anthropicClient) throw new Error("Anthropic not configured");
  const response = await anthropicClient.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages,
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text).join("").trim();
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.post("/chatbot/message", requireAuth, async (req, res) => {
  const parsed = parseBody(req.body);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }

  const lastMsg = parsed.messages[parsed.messages.length - 1].content;
  const lang    = detectLang(lastMsg);

  // 1. Try hardcoded topic match first (instant, zero latency)
  const topic = matchTopic(lastMsg);
  if (topic) {
    res.json({ content: topic.response[lang] });
    return;
  }

  // 2. Try AI (Groq → Anthropic) with strict timeout
  if (GROQ_API_KEY || anthropicClient) {
    try {
      const text = GROQ_API_KEY
        ? await callGroq(parsed.messages)
        : await callAnthropic(parsed.messages);
      res.json({ content: text });
      return;
    } catch (err: any) {
      console.warn("[chatbot] AI failed, using fallback:", err?.message);
      // Fall through to fallback below
    }
  }

  // 3. Graceful fallback — never returns 5xx to the client
  res.json({ content: FALLBACK[lang] });
});

export default router;
