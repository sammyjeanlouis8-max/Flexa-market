/**
 * Centralized, backend-enforced product eligibility for Flexa Market.
 *
 * Classification is rules-first. Optional AI from moderation.ts may assist but
 * never alone decides ALLOWED for uncertain regulated goods.
 *
 * This encodes marketplace UGC / store-compliance policy aligned with common
 * Google Play & Apple App Store UGC expectations — not country criminal codes.
 * Uncertain regulated categories always REQUIRES_REVIEW (human).
 */
import { hasUsableListingImage } from "./listingImageUrls";
import { moderateListing, ruleBasedModerate, type ModerationResult } from "./moderation";
import {
  DEFAULT_PRODUCT_VERIFICATION_POLICY,
  categorySlugInList,
  getProductVerificationPolicy,
  type ProductVerificationPolicy,
} from "./productVerificationPolicy";

export type EligibilityClass = "ALLOWED" | "REQUIRES_REVIEW" | "PROHIBITED";

export type LifecycleStatus =
  | "draft"
  | "pending_review"
  | "approved"
  | "published"
  | "rejected"
  | "suspended"
  | "sold"
  | "archived";

export type RejectionCode =
  | "PROHIBITED_WEAPONS"
  | "PROHIBITED_DRUGS"
  | "PROHIBITED_ANIMALS"
  | "PROHIBITED_SEXUAL"
  | "PROHIBITED_VIOLENCE"
  | "PROHIBITED_HATE"
  | "PROHIBITED_COUNTERFEIT"
  | "PROHIBITED_STOLEN"
  | "PROHIBITED_ILLEGAL"
  | "REQUIRES_HUMAN_REVIEW"
  | "VALIDATION_FAILED"
  | "SUSPENDED"
  | null;

export interface EligibilityInput {
  title: string;
  description: string;
  price?: number | null;
  imageUrls?: string[];
  categorySlug?: string | null;
  categoryName?: string | null;
  subcategorySlug?: string | null;
  subcategoryName?: string | null;
  sellerCountry?: string | null;
  listingCountry?: string | null;
  /** When true, skip network AI and use rules + category policy only (tests). */
  rulesOnly?: boolean;
  /** Override Super Admin policy (tests). */
  verificationPolicy?: ProductVerificationPolicy;
  /** Force ANALYSIS_FAILED path (tests / AI outage). */
  forceAnalysisFailed?: boolean;
  /**
   * Seller challenged an AI category recommendation and confirmed their category.
   * Never permanently rejects solely on AI category classification.
   */
  categoryChallengeAcknowledged?: boolean;
}

export interface EligibilityResult {
  eligibilityClass: EligibilityClass;
  decision: ModerationResult["decision"];
  riskLevel: ModerationResult["riskLevel"];
  confidence: number;
  flags: string[];
  reason: string;
  rejectionCode: RejectionCode;
  source: ModerationResult["source"] | "policy";
  lifecycleOnInsert: Extract<LifecycleStatus, "published" | "pending_review" | "rejected">;
  publishStatus: "available" | "removed";
}

/** Category/name signals that must never auto-publish (human review). Platform policy only. */
const REGULATED_CATEGORY_RE =
  /\b(food|grocery|aliment|manje|cosmetic|cosmetics|beauty|makeup|skincare|pharma|pharmacy|medic(?:ine|al|ament)|drug.?store|supplement|vitamin|health.?care|vehicle|vehicles|car|cars|auto|motorcycle|motos?|truck|boats?|firearm|weapon)\b/i;

/** Explicit IP / stolen-goods language — marketplace UGC, not a legal determination of title. */
const COUNTERFEIT_RE =
  /\b(counterfeit|fake\s+(?:rolex|lv|gucci|nike|adidas)|replica\s+(?:rolex|lv|gucci)|knock[\s-]?off|super\s*fake|1:1\s*mirror)\b/i;

const STOLEN_RE =
  /\b(stolen\s+(?:goods?|phone|car|bike)|hot\s+goods|fell\s+off\s+(?:a\s+)?truck|no\s+questions?\s+asked\s+cash)\b/i;

const FLAG_TO_REJECTION: Record<string, RejectionCode> = {
  weapons: "PROHIBITED_WEAPONS",
  drugs: "PROHIBITED_DRUGS",
  animals: "PROHIBITED_ANIMALS",
  sexual: "PROHIBITED_SEXUAL",
  violence: "PROHIBITED_VIOLENCE",
  hate: "PROHIBITED_HATE",
};

function categoryNeedsReview(input: EligibilityInput): boolean {
  const blob = [
    input.categorySlug,
    input.categoryName,
    input.subcategorySlug,
    input.subcategoryName,
  ]
    .filter(Boolean)
    .join(" ");
  return blob.length > 0 && REGULATED_CATEGORY_RE.test(blob);
}

function validateBasics(input: EligibilityInput): string | null {
  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  if (title.length < 3) return "Title must be at least 3 characters.";
  // Presence only — no arbitrary minimum length; short copy is a soft tip, not a block.
  if (description.length < 1) return "Please add a short product description.";
  if (input.price != null && (Number.isNaN(Number(input.price)) || Number(input.price) < 0)) {
    return "Price must be zero or greater.";
  }
  if (!hasUsableListingImage(input.imageUrls)) {
    return "At least one valid product image is required.";
  }
  return null;
}

/**
 * Map moderation + category policy → durable eligibility class.
 * High-risk flags → PROHIBITED when decision rejected; otherwise elevated review.
 */
export function classifyFromModeration(
  moderation: ModerationResult,
  opts: { categoryReview: boolean; counterfeit: boolean; stolen: boolean },
): Pick<EligibilityResult, "eligibilityClass" | "rejectionCode" | "lifecycleOnInsert" | "publishStatus" | "decision" | "reason"> {
  if (opts.stolen) {
    return {
      eligibilityClass: "PROHIBITED",
      decision: "rejected",
      rejectionCode: "PROHIBITED_STOLEN",
      lifecycleOnInsert: "rejected",
      publishStatus: "removed",
      reason: "Listings that indicate stolen goods are not allowed.",
    };
  }
  if (opts.counterfeit) {
    return {
      eligibilityClass: "PROHIBITED",
      decision: "rejected",
      rejectionCode: "PROHIBITED_COUNTERFEIT",
      lifecycleOnInsert: "rejected",
      publishStatus: "removed",
      reason: "Listings that advertise counterfeit or unauthorized replica branded goods are not allowed.",
    };
  }

  if (moderation.decision === "rejected") {
    const primary = moderation.flags.find((f) => FLAG_TO_REJECTION[f]) ?? moderation.flags[0];
    return {
      eligibilityClass: "PROHIBITED",
      decision: "rejected",
      rejectionCode: (primary && FLAG_TO_REJECTION[primary]) || "PROHIBITED_ILLEGAL",
      lifecycleOnInsert: "rejected",
      publishStatus: "removed",
      reason: moderation.reason,
    };
  }

  // Uncertain regulated categories: never auto-ALLOW.
  if (opts.categoryReview || moderation.decision === "pending") {
    return {
      eligibilityClass: "REQUIRES_REVIEW",
      decision: "pending",
      rejectionCode: "REQUIRES_HUMAN_REVIEW",
      lifecycleOnInsert: "pending_review",
      publishStatus: "available", // owner-visible; public feeds still require approved
      reason: opts.categoryReview && moderation.decision === "approved"
        ? "Category may be regulated or jurisdiction-sensitive — held for human review."
        : moderation.reason,
    };
  }

  return {
    eligibilityClass: "ALLOWED",
    decision: "approved",
    rejectionCode: null,
    lifecycleOnInsert: "published",
    publishStatus: "available",
    reason: moderation.reason || "Eligible for publication",
  };
}

/** Low AI confidence alone must never treat a listing as suspicious. */
function softenUncertainAi(
  classified: ReturnType<typeof classifyFromModeration>,
  moderation: ModerationResult,
  policy: ProductVerificationPolicy,
  categorySlug?: string | null,
): ReturnType<typeof classifyFromModeration> {
  if (classified.eligibilityClass !== "REQUIRES_REVIEW") return classified;
  if (classified.decision === "rejected") return classified;
  const always = categorySlugInList(categorySlug, policy.alwaysReviewCategorySlugs);
  if (always || moderation.riskLevel === "high") return classified;
  // Uncertain AI → allow; tips may still be shown upstream. Never treat low confidence as suspicious.
  if (moderation.confidence < 0.55) {
    return {
      eligibilityClass: "ALLOWED",
      decision: "approved",
      rejectionCode: null,
      lifecycleOnInsert: "published",
      publishStatus: "available",
      reason: "AI confidence was low — published after deterministic checks (not treated as suspicious).",
    };
  }
  return classified;
}

function softenReviewForPolicy(
  classified: ReturnType<typeof classifyFromModeration>,
  moderation: ModerationResult,
  policy: ProductVerificationPolicy,
  categorySlug?: string | null,
): ReturnType<typeof classifyFromModeration> {
  if (classified.eligibilityClass !== "REQUIRES_REVIEW") return classified;
  if (policy.mode === "monitoring_only") {
    return {
      eligibilityClass: "ALLOWED",
      decision: "approved",
      rejectionCode: null,
      lifecycleOnInsert: "published",
      publishStatus: "available",
      reason: classified.reason,
    };
  }

  // Strict: keep REQUIRES_REVIEW as-is (no uncertain-AI soft-publish).
  if (policy.mode === "strict") return classified;

  // Balanced: low AI confidence is not suspicious; soft-review categories may publish.
  const afterUncertainty = softenUncertainAi(classified, moderation, policy, categorySlug);
  if (afterUncertainty.eligibilityClass === "ALLOWED") return afterUncertainty;

  const always = categorySlugInList(categorySlug, policy.alwaysReviewCategorySlugs);
  const soft = categorySlugInList(categorySlug, policy.softReviewCategorySlugs);
  if (!always && (soft || moderation.riskLevel === "medium" || moderation.riskLevel === "low")) {
    return {
      eligibilityClass: "ALLOWED",
      decision: "approved",
      rejectionCode: null,
      lifecycleOnInsert: "published",
      publishStatus: "available",
      reason: soft
        ? "Eligible for publication with optional category compliance tips."
        : classified.reason,
    };
  }
  return classified;
}

export async function evaluateProductEligibility(input: EligibilityInput): Promise<EligibilityResult> {
  const policy = input.verificationPolicy || (input.rulesOnly
    ? DEFAULT_PRODUCT_VERIFICATION_POLICY
    : await getProductVerificationPolicy());

  const basicError = validateBasics(input);
  if (basicError) {
    return {
      eligibilityClass: "PROHIBITED",
      decision: "rejected",
      riskLevel: "high",
      confidence: 1,
      flags: ["validation"],
      reason: basicError,
      rejectionCode: "VALIDATION_FAILED",
      source: "policy",
      lifecycleOnInsert: "rejected",
      publishStatus: "removed",
    };
  }

  const text = `${input.title}\n${input.description}`;
  const counterfeit = COUNTERFEIT_RE.test(text);
  const stolen = STOLEN_RE.test(text);
  const categoryReview = categoryNeedsReview(input);

  let moderation: ModerationResult;
  let analysisFailed = !!input.forceAnalysisFailed;
  if (input.rulesOnly) {
    moderation = ruleBasedModerate(input.title, input.description, input.imageUrls?.length ?? 0);
  } else {
    try {
      moderation = await moderateListing({
        title: input.title,
        description: input.description,
        imageUrls: input.imageUrls,
      });
    } catch {
      analysisFailed = true;
      moderation = ruleBasedModerate(input.title, input.description, input.imageUrls?.length ?? 0);
    }
  }

  let classified = classifyFromModeration(moderation, { categoryReview, counterfeit, stolen });
  classified = softenReviewForPolicy(classified, moderation, policy, input.categorySlug);

  if (analysisFailed) {
    if (policy.fallbackAllowLowRisk && moderation.riskLevel === "low" && classified.eligibilityClass === "ALLOWED") {
      return {
        eligibilityClass: "ALLOWED",
        decision: "approved",
        riskLevel: moderation.riskLevel,
        confidence: moderation.confidence,
        flags: [...moderation.flags, "analysis_failed"],
        reason: "AI unavailable — published after deterministic safety checks (low risk).",
        rejectionCode: null,
        source: "rules",
        lifecycleOnInsert: "published",
        publishStatus: "available",
      };
    }
    if (classified.eligibilityClass !== "PROHIBITED") {
      return {
        eligibilityClass: "REQUIRES_REVIEW",
        decision: "pending",
        riskLevel: moderation.riskLevel === "low" ? "medium" : moderation.riskLevel,
        confidence: moderation.confidence,
        flags: [...moderation.flags, "analysis_failed"],
        reason: "AI analysis unavailable — held for manual review under fallback policy.",
        rejectionCode: "REQUIRES_HUMAN_REVIEW",
        source: "rules",
        lifecycleOnInsert: "pending_review",
        publishStatus: "available",
      };
    }
  }

  return {
    eligibilityClass: classified.eligibilityClass,
    decision: classified.decision,
    riskLevel: moderation.riskLevel,
    confidence: moderation.confidence,
    flags: Array.from(new Set([
      ...moderation.flags,
      ...(counterfeit ? ["counterfeit"] : []),
      ...(stolen ? ["stolen"] : []),
      ...(categoryReview ? ["regulated_category"] : []),
      ...(analysisFailed ? ["analysis_failed"] : []),
    ])),
    reason: classified.reason,
    rejectionCode: classified.rejectionCode,
    source: analysisFailed ? "rules" : moderation.source,
    lifecycleOnInsert: classified.lifecycleOnInsert,
    publishStatus: classified.publishStatus,
  };
}

/** Derive lifecycle from persisted listing columns (backward compatible). */
export function deriveLifecycleStatus(row: {
  status: string;
  moderationStatus: string;
  lifecycleStatus?: string | null;
}): LifecycleStatus {
  if (row.lifecycleStatus === "suspended") return "suspended";
  if (row.lifecycleStatus === "archived") return "archived";
  if (row.status === "sold") return "sold";
  if (row.moderationStatus === "rejected") return "rejected";
  if (row.moderationStatus === "pending") return "pending_review";
  if (row.status === "available" && row.moderationStatus === "approved") return "published";
  if (row.moderationStatus === "approved") return "approved";
  if (row.status === "removed") return "archived";
  return (row.lifecycleStatus as LifecycleStatus) || "pending_review";
}

/** Public discovery / boost / ads require published listings only. */
export function isPubliclyDiscoverable(row: {
  status: string;
  moderationStatus: string;
  lifecycleStatus?: string | null;
}): boolean {
  if (row.lifecycleStatus === "suspended" || row.lifecycleStatus === "archived") return false;
  return row.status === "available" && row.moderationStatus === "approved";
}

export function eligibilityFieldsForDb(result: EligibilityResult) {
  return {
    moderationStatus: result.decision,
    moderationRiskLevel: result.riskLevel,
    moderationReason: result.reason,
    moderationConfidence: result.confidence,
    moderationFlags: result.flags,
    moderationSource: result.source === "policy" ? "rules" : result.source,
    moderatedAt: new Date(),
    status: result.publishStatus,
    eligibilityClass: result.eligibilityClass.toLowerCase(),
    lifecycleStatus: result.lifecycleOnInsert,
    rejectionCode: result.rejectionCode,
  };
}
