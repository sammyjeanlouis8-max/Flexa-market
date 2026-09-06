import OpenAI from "openai";
import { logger } from "./logger";

export type RiskLevel = "low" | "medium" | "high";
export type ModerationDecision = "approved" | "pending" | "rejected";
export type ModerationCategory =
  | "weapons"
  | "drugs"
  | "animals"
  | "sexual"
  | "suggestive"
  | "toy_weapons"
  | "unclear"
  | "violence"
  | "hate";

export interface ModerationResult {
  decision: ModerationDecision;
  riskLevel: RiskLevel;
  confidence: number;
  flags: ModerationCategory[];
  reason: string;
  source: "ai" | "rules";
}

const HIGH_RISK_PATTERNS: Record<Exclude<ModerationCategory, "suggestive" | "toy_weapons" | "unclear">, RegExp[]> = {
  weapons: [
    /\b(gun|guns|pistol|pistols|rifle|rifles|firearm|firearms|handgun|handguns|shotgun|shotguns|revolver|revolvers|ammo|ammunition|bullet|bullets|magazine clip|silencer|suppressor|ar[-\s]?15|ak[-\s]?47|glock|beretta)\b/i,
    /\b(arme|armes|fusil|fusils|pistolet|pistolets|munition|munitions|balle|balles|carabine)\b/i,
    /\b(zam|zanm|fizi|pistol)\b/i,
    /\b(arma|armas|pistola|pistolas|escopeta|fusil|munición|balas|rifle)\b/i,
    /\b(arma|armas|pistola|espingarda|fuzil|munição|balas)\b/i,
  ],
  drugs: [
    /\b(cocaine|coke|crack|heroin|meth|methamphetamine|fentanyl|lsd|ecstasy|mdma|molly|opioid|opium|weed for sale|cannabis for sale|marijuana for sale|kush|hash|hashish|psilocybin|shrooms|ketamine|adderall|xanax|oxycodone|oxycontin|percocet|vicodin)\b/i,
    /\b(cocaïne|héroïne|méthamphétamine|fentanyl|cannabis à vendre|marijuana à vendre|haschich|opiacé)\b/i,
    /\b(kokayin|ewoyin|wid)\b/i,
    /\b(cocaína|heroína|metanfetamina|marihuana en venta|cannabis en venta|hachís)\b/i,
    /\b(cocaína|heroína|metanfetamina|maconha à venda|cannabis à venda|haxixe)\b/i,
  ],
  animals: [
    /\b(live animal|live animals|animal for sale|animals for sale|pet for sale|pets for sale|dog for sale|dogs for sale|cat for sale|cats for sale|puppy|puppies|kitten|kittens|livestock for sale)\b/i,
    /\b(animal vivant|animaux vivants|animal à vendre|animaux à vendre|chien à vendre|chiens à vendre|chat à vendre|chats à vendre|chiot|chiots|chaton|chatons)\b/i,
    /\b(bèt vivan|bèt pou vann|chen pou vann|chat pou vann|ti chen|ti chat|kabrit pou vann|bèf pou vann|kochon pou vann|poul vivan|kanna vivan)\b/i,
    /\b(animal vivo|animales vivos|animal en venta|animales en venta|perro en venta|perros en venta|gato en venta|gatos en venta|cachorro|cachorros|gatito|gatitos)\b/i,
    /\b(animal vivo|animais vivos|animal à venda|animais à venda|cão à venda|cães à venda|gato à venda|gatos à venda|filhote|filhotes)\b/i,
  ],
  sexual: [
    /\b(porn|pornographic|nude|nudes|naked photos|escort|prostitute|prostitution|sex toy|sex toys|dildo|vibrator|fleshlight|adult film|xxx|onlyfans|sugar baby|sugar daddy)\b/i,
    /\b(porno|pornographique|nu|nue|prostitué|prostituée|jouet sexuel|film adulte)\b/i,
    /\b(pornografía|desnudo|desnuda|prostituta|escort|juguete sexual|película para adultos)\b/i,
    /\b(pornografia|nu|nua|prostituta|brinquedo sexual|filme adulto)\b/i,
  ],
  violence: [
    /\b(beat someone up|hire hitman|murder for|kill for hire|torture device)\b/i,
  ],
  hate: [
    /\b(nazi memorabilia|kkk|white supremac|ethnic cleansing)\b/i,
  ],
};

const MEDIUM_RISK_PATTERNS: Partial<Record<ModerationCategory, RegExp[]>> = {
  toy_weapons: [
    /\b(toy gun|toy guns|airsoft|bb gun|bb guns|pellet gun|nerf|cap gun|water gun|paintball gun|replica gun|prop gun|cosplay weapon)\b/i,
    /\b(pistolet jouet|fusil jouet|nerf|airsoft|réplique)\b/i,
    /\b(pistola de juguete|airsoft|réplica|nerf)\b/i,
    /\b(arma de brinquedo|airsoft|réplica|nerf)\b/i,
  ],
  suggestive: [
    /\b(lingerie|bikini photoshoot|swimsuit model|bedroom photoshoot|sensual|seductive)\b/i,
    /\b(lingerie sexy|maillot sensuel)\b/i,
  ],
  unclear: [
    /^(.{0,15})$/,
  ],
};

function patternConfidence(text: string, patterns: RegExp[]): number {
  let hits = 0;
  for (const p of patterns) {
    if (p.test(text)) hits++;
  }
  if (hits === 0) return 0;
  return Math.min(1, 0.6 + 0.15 * (hits - 1));
}

export function ruleBasedModerate(title: string, description: string, imageCount = 0): ModerationResult {
  const text = `${title}\n${description}`.trim();
  const mediumFlags: ModerationCategory[] = [];
  const highFlags: ModerationCategory[] = [];
  let medConfidence = 0;
  let medReason = "";
  let highConfidence = 0;
  let highReason = "";

  // Check medium-risk carve-outs first (toy/replica/suggestive) so they can suppress
  // the broader high-risk categories.
  for (const [cat, patterns] of Object.entries(MEDIUM_RISK_PATTERNS)) {
    if (cat === "unclear" && (text.length > 15 || imageCount > 0)) continue;
    const conf = patternConfidence(text, patterns!);
    if (conf > 0) {
      mediumFlags.push(cat as ModerationCategory);
      if (conf > medConfidence) {
        medConfidence = conf;
        medReason = `Requires review: ${cat.replace(/_/g, " ")}`;
      }
    }
  }

  const isToyContext = mediumFlags.includes("toy_weapons");
  const isSuggestiveContext = mediumFlags.includes("suggestive");

  for (const [cat, patterns] of Object.entries(HIGH_RISK_PATTERNS)) {
    // Toy/airsoft/nerf items naturally contain "gun"/"pistol" — don't classify as real weapons.
    if (cat === "weapons" && isToyContext) continue;
    // Lingerie/swimsuit/etc. naturally contain mild sexual terms — don't auto-reject as explicit.
    if (cat === "sexual" && isSuggestiveContext) continue;
    const conf = patternConfidence(text, patterns);
    if (conf > 0) {
      highFlags.push(cat as ModerationCategory);
      if (conf > highConfidence) {
        highConfidence = conf;
        highReason = `Detected high-risk content: ${cat}`;
      }
    }
  }

  if (highConfidence > 0) {
    return {
      decision: highConfidence >= 0.6 ? "rejected" : "pending",
      riskLevel: highConfidence >= 0.6 ? "high" : "medium",
      confidence: highConfidence,
      flags: [...highFlags, ...mediumFlags],
      reason: highReason,
      source: "rules",
    };
  }

  if (medConfidence > 0) {
    return {
      decision: "pending",
      riskLevel: "medium",
      confidence: medConfidence,
      flags: mediumFlags,
      reason: medReason,
      source: "rules",
    };
  }

  return {
    decision: "approved",
    riskLevel: "low",
    confidence: 0.05,
    flags: [],
    reason: "No issues detected",
    source: "rules",
  };
}

let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (openaiClient) return openaiClient;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (!apiKey || !baseURL) return null;
  openaiClient = new OpenAI({ apiKey, baseURL });
  return openaiClient;
}

const CATEGORY_MAP: Record<string, ModerationCategory> = {
  weapons: "weapons",
  "weapons/firearms": "weapons",
  "violence/firearms": "weapons",
  drugs: "drugs",
  "illicit/drugs": "drugs",
  illicit: "drugs",
  animals: "animals",
  "animals/live": "animals",
  "regulated/animals": "animals",
  sexual: "sexual",
  "sexual/explicit": "sexual",
  "sexual/minors": "sexual",
  suggestive: "suggestive",
  "sexual/suggestive": "suggestive",
  violence: "violence",
  "violence/graphic": "violence",
  hate: "hate",
  "hate/threatening": "hate",
};

interface AiAnalysis {
  flags: ModerationCategory[];
  confidence: number;
  reason: string;
}

async function analyzeWithAI(title: string, description: string, imageUrls: string[]): Promise<AiAnalysis | null> {
  const client = getOpenAI();
  if (!client) return null;
  try {
    const text = `Title: ${title}\nDescription: ${description}`;
    const visionImages = imageUrls.slice(0, 3).filter((u) => /^https?:\/\//.test(u));
    const userContent: any[] = [
      {
        type: "text",
        text:
          `Classify this marketplace listing. Return STRICT JSON: {"flags": string[], "confidence": number 0..1, "explanation": string}. ` +
          `Allowed flags: weapons, drugs, animals, sexual, suggestive, toy_weapons, unclear, violence, hate. ` +
          `Use "weapons" only for real firearms/ammo (not toys/airsoft/nerf — use toy_weapons). ` +
          `Use "drugs" only for illicit drugs being sold. ` +
          `Use "animals" only when a live animal is being offered or sold; do not flag pet food, toys, supplies, clothing, or animal-themed products. ` +
          `confidence reflects how dangerous/policy-violating this content is.\n\n${text}`,
      },
      ...visionImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
    ];

    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a content moderation classifier for an online marketplace. Be balanced: allow normal goods, flag policy violations.",
        },
        { role: "user", content: userContent },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as { flags?: string[]; confidence?: number; explanation?: string };
    const rawFlags = Array.isArray(parsed.flags) ? parsed.flags : [];
    const flags = Array.from(
      new Set(rawFlags.map((f) => CATEGORY_MAP[String(f).toLowerCase()] ?? null).filter((f): f is ModerationCategory => !!f)),
    );
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(1, parsed.confidence)) : 0;
    return { flags, confidence, reason: parsed.explanation ?? "AI classification" };
  } catch (err) {
    logger.warn({ err }, "[moderation] AI analysis failed, falling back to rules");
    return null;
  }
}

const HIGH_RISK_FLAGS: ReadonlySet<ModerationCategory> = new Set(["weapons", "drugs", "animals", "sexual", "violence", "hate"]);
const MEDIUM_RISK_FLAGS: ReadonlySet<ModerationCategory> = new Set(["suggestive", "toy_weapons", "unclear"]);

export async function moderateListing(input: {
  title: string;
  description: string;
  imageUrls?: string[];
}): Promise<ModerationResult> {
  const ruleResult = ruleBasedModerate(input.title, input.description, input.imageUrls?.length ?? 0);
  const ai = await analyzeWithAI(input.title, input.description, input.imageUrls ?? []);

  if (!ai) return ruleResult;

  let allFlags = Array.from(new Set([...ruleResult.flags, ...ai.flags]));
  // Carve-outs: if either source explicitly identifies the item as a toy/replica
  // or as merely suggestive (lingerie/swimwear/etc.), suppress the conflicting
  // high-risk category so we don't auto-reject benign items.
  const isToy = ruleResult.flags.includes("toy_weapons") || ai.flags.includes("toy_weapons");
  const isSuggestive = ruleResult.flags.includes("suggestive") || ai.flags.includes("suggestive");
  if (isToy) allFlags = allFlags.filter((f) => f !== "weapons");
  if (isSuggestive) allFlags = allFlags.filter((f) => f !== "sexual");
  const hasHigh = allFlags.some((f) => HIGH_RISK_FLAGS.has(f));
  const hasMed = allFlags.some((f) => MEDIUM_RISK_FLAGS.has(f));

  let confidence = Math.max(ruleResult.confidence, ai.confidence);
  if (hasHigh && ruleResult.flags.some((f) => HIGH_RISK_FLAGS.has(f)) && ai.flags.some((f) => HIGH_RISK_FLAGS.has(f))) {
    confidence = Math.min(1, confidence + 0.15);
  }

  let decision: ModerationDecision;
  let riskLevel: RiskLevel;
  if (hasHigh && confidence >= 0.7) {
    decision = "rejected";
    riskLevel = "high";
  } else if (hasHigh || hasMed || (confidence >= 0.4 && allFlags.length > 0)) {
    decision = "pending";
    riskLevel = hasHigh ? "high" : "medium";
  } else {
    decision = "approved";
    riskLevel = "low";
  }

  return {
    decision,
    riskLevel,
    confidence,
    flags: allFlags,
    reason: ai.reason || ruleResult.reason,
    source: "ai",
  };
}
