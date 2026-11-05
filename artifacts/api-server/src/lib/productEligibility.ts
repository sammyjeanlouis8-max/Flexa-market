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
import { moderateListing, ruleBasedModerate, type ModerationResult } from "./moderation";

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
  if (description.length < 10) return "Description must be at least 10 characters.";
  if (input.price != null && (Number.isNaN(Number(input.price)) || Number(input.price) < 0)) {
    return "Price must be zero or greater.";
  }
  const images = input.imageUrls ?? [];
  if (images.length < 1) return "At least one valid product image is required.";
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

export async function evaluateProductEligibility(input: EligibilityInput): Promise<EligibilityResult> {
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

  const moderation = input.rulesOnly
    ? ruleBasedModerate(input.title, input.description, input.imageUrls?.length ?? 0)
    : await moderateListing({
        title: input.title,
        description: input.description,
        imageUrls: input.imageUrls,
      });

  const classified = classifyFromModeration(moderation, { categoryReview, counterfeit, stolen });

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
    ])),
    reason: classified.reason,
    rejectionCode: classified.rejectionCode,
    source: moderation.source,
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
