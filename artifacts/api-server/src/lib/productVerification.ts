/**
 * Balanced, risk-based Flexa AI Product Verification.
 * Assists sellers with category tips; blocks only for mandatory safety/taxonomy issues.
 */
import {
  evaluateProductEligibility,
  type EligibilityInput,
  type EligibilityResult,
  type RejectionCode,
} from "./productEligibility";
import {
  type ModerationMode,
  type ProductVerificationPolicy,
  type VerificationDecision,
  DEFAULT_PRODUCT_VERIFICATION_POLICY,
  categorySlugInList,
  getProductVerificationPolicy,
} from "./productVerificationPolicy";

export type VerificationSuggestion = {
  type: "category" | "subcategory" | "title" | "description" | "photo" | "general";
  message: string;
  recommendedCategorySlug?: string;
  recommendedCategoryName?: string;
  optional: boolean;
};

export type ProductVerificationResult = EligibilityResult & {
  verificationDecision: VerificationDecision;
  suggestions: VerificationSuggestion[];
  blocksPublication: boolean;
  allowsPublication: boolean;
  analysisFailed: boolean;
  mode: ModerationMode;
  /** Seller may pick a different reasonable category — recommendations are never auto-applied. */
  categoryRecommendationMandatory: false;
};

export type TaxonomyCheck = {
  ok: boolean;
  error?: string;
  code?: RejectionCode | "INVALID_TAXONOMY" | "SUBCATEGORY_PARENT_MISMATCH";
};

const CATEGORY_KEYWORD_HINTS: Array<{ slug: string; name: string; re: RegExp }> = [
  { slug: "electronics", name: "Electronics", re: /\b(phone|iphone|samsung|laptop|tablet|tv|headphone|charger|camera|console|playstation|xbox)\b/i },
  { slug: "fashion", name: "Fashion", re: /\b(shirt|dress|shoes|sneakers|jeans|jacket|handbag|watch|clothing)\b/i },
  { slug: "home", name: "Home & Garden", re: /\b(sofa|chair|table|lamp|mattress|kitchen|blender|furniture)\b/i },
  { slug: "vehicles", name: "Vehicles", re: /\b(car|honda|toyota|motorcycle|scooter|truck|sedan)\b/i },
  { slug: "beauty", name: "Beauty", re: /\b(cream|lipstick|makeup|perfume|skincare|cosmetic)\b/i },
  { slug: "sports", name: "Sports", re: /\b(bike|bicycle|football|soccer|gym|dumbbell|yoga)\b/i },
  { slug: "books", name: "Books", re: /\b(book|textbook|novel|manuel|liv)\b/i },
];

/** Non-blocking tips — never used alone to reject. */
export function buildSoftSuggestions(input: {
  title: string;
  description: string;
  categorySlug?: string | null;
  categoryName?: string | null;
}): VerificationSuggestion[] {
  const tips: VerificationSuggestion[] = [];
  const title = (input.title || "").trim();
  const description = (input.description || "").trim();

  if (description.length > 0 && description.length < 40) {
    tips.push({
      type: "description",
      message: "A slightly longer description can help buyers (optional).",
      optional: true,
    });
  }

  const hint = CATEGORY_KEYWORD_HINTS.find((h) => h.re.test(`${title} ${description}`));
  if (hint && input.categorySlug && hint.slug !== String(input.categorySlug).toLowerCase()) {
    // Only suggest when keywords clearly point elsewhere — still optional unless substantial mismatch engine elevates.
    tips.push({
      type: "category",
      message: `Buyers often find similar items under “${hint.name}”. You can keep your category if it still fits.`,
      recommendedCategorySlug: hint.slug,
      recommendedCategoryName: hint.name,
      optional: true,
    });
  }

  return tips;
}

export function suggestCategoriesFromText(title: string, description: string): VerificationSuggestion[] {
  const blob = `${title}\n${description}`;
  return CATEGORY_KEYWORD_HINTS.filter((h) => h.re.test(blob)).slice(0, 3).map((h) => ({
    type: "category" as const,
    message: `Suggested category: ${h.name}`,
    recommendedCategorySlug: h.slug,
    recommendedCategoryName: h.name,
    optional: true,
  }));
}

/**
 * Detect a clear/substantial product-category mismatch (not minor differences).
 * Conservative: only when high-confidence keyword family conflicts with selected category.
 */
export function detectSubstantialCategoryMismatch(input: {
  title: string;
  description: string;
  categorySlug?: string | null;
  categoryName?: string | null;
  confidenceThreshold: number;
}): { mismatch: boolean; confidence: number; suggested?: VerificationSuggestion } {
  const slug = String(input.categorySlug || "").toLowerCase();
  const name = String(input.categoryName || "").toLowerCase();
  const blob = `${input.title}\n${input.description}`;
  const hits = CATEGORY_KEYWORD_HINTS.map((h) => ({
    ...h,
    score: h.re.test(blob) ? 0.75 : 0,
  })).filter((h) => h.score > 0);

  if (!hits.length || !slug) return { mismatch: false, confidence: 0 };

  const best = hits.sort((a, b) => b.score - a.score)[0];
  const selectedIsBest =
    slug.includes(best.slug) || best.slug.includes(slug) || name.includes(best.name.toLowerCase().slice(0, 5));

  // Vehicles vs clothing etc. — only flag when best family is unrelated to selection.
  const vehicleish = /\b(vehicle|car|auto|moto)/i.test(slug + name);
  const fashionish = /\b(fashion|clothing|apparel|mode)/i.test(slug + name);
  const electronicsish = /\b(electronic|phone|computer)/i.test(slug + name);

  const bestIsVehicle = best.slug === "vehicles";
  const bestIsFashion = best.slug === "fashion";
  const bestIsElectronics = best.slug === "electronics";

  const crossFamily =
    (bestIsVehicle && (fashionish || electronicsish))
    || (bestIsFashion && (vehicleish || electronicsish) && /\b(dress|shoes|jeans)\b/i.test(blob))
    || (bestIsElectronics && vehicleish && /\b(iphone|laptop|playstation)\b/i.test(blob) && !/\b(car|honda|toyota)\b/i.test(blob));

  if (!selectedIsBest && crossFamily && best.score >= input.confidenceThreshold - 0.1) {
    return {
      mismatch: true,
      confidence: Math.min(0.95, best.score + 0.1),
      suggested: {
        type: "category",
        message: `This listing looks like a ${best.name} item. Please choose a matching category or clarify the title.`,
        recommendedCategorySlug: best.slug,
        recommendedCategoryName: best.name,
        optional: false,
      },
    };
  }

  return { mismatch: false, confidence: best.score };
}

/**
 * Map eligibility + policy → seller-facing verification decision.
 * Recommendations are never auto-applied.
 */
export function toProductVerification(
  eligibility: EligibilityResult,
  opts: {
    policy?: ProductVerificationPolicy;
    title?: string;
    description?: string;
    categorySlug?: string | null;
    categoryName?: string | null;
    analysisFailed?: boolean;
    /** Seller confirmed their category after challenging an AI tip. */
    categoryChallengeAcknowledged?: boolean;
  } = {},
): ProductVerificationResult {
  const policy = opts.policy || DEFAULT_PRODUCT_VERIFICATION_POLICY;
  const suggestions = buildSoftSuggestions({
    title: opts.title || "",
    description: opts.description || "",
    categorySlug: opts.categorySlug,
    categoryName: opts.categoryName,
  });

  const base: ProductVerificationResult = {
    ...eligibility,
    verificationDecision: "APPROVED",
    suggestions,
    blocksPublication: false,
    allowsPublication: true,
    analysisFailed: !!opts.analysisFailed,
    mode: policy.mode,
    categoryRecommendationMandatory: false,
  };

  // Mandatory: validation / prohibited
  if (eligibility.rejectionCode === "VALIDATION_FAILED") {
    return {
      ...base,
      verificationDecision: "CORRECTION_REQUIRED",
      blocksPublication: true,
      allowsPublication: false,
      suggestions: [
        {
          type: "general",
          message: eligibility.reason,
          optional: false,
        },
      ],
    };
  }

  if (eligibility.eligibilityClass === "PROHIBITED" || eligibility.decision === "rejected") {
    return {
      ...base,
      verificationDecision: "REJECTED",
      blocksPublication: true,
      allowsPublication: false,
      suggestions: [
        {
          type: "general",
          message: eligibility.reason || "This listing violates Flexa Market policies.",
          optional: false,
        },
        {
          type: "general",
          message: "You may edit and resubmit, or appeal from My Listings if you believe this was a mistake.",
          optional: true,
        },
      ],
    };
  }

  if (opts.analysisFailed) {
    const alwaysReviewOnOutage = categorySlugInList(opts.categorySlug, policy.alwaysReviewCategorySlugs);
    const canFallbackPublish =
      policy.fallbackAllowLowRisk
      && eligibility.riskLevel === "low"
      && eligibility.eligibilityClass === "ALLOWED"
      && !alwaysReviewOnOutage;

    if (canFallbackPublish) {
      return {
        ...base,
        verificationDecision: "ANALYSIS_FAILED",
        allowsPublication: true,
        blocksPublication: false,
        suggestions: [
          ...suggestions,
          {
            type: "general",
            message: "AI analysis was temporarily unavailable. Deterministic safety checks passed — you can publish. We may re-check later.",
            optional: true,
          },
        ],
      };
    }
    return {
      ...base,
      verificationDecision: "ANALYSIS_FAILED",
      eligibilityClass: "REQUIRES_REVIEW",
      decision: "pending",
      lifecycleOnInsert: "pending_review",
      publishStatus: "available",
      rejectionCode: "REQUIRES_HUMAN_REVIEW",
      allowsPublication: false,
      blocksPublication: true,
      reason: "AI analysis unavailable — held for manual review under current fallback policy.",
      suggestions: [
        {
          type: "general",
          message: "AI is temporarily unavailable. High-risk or regulated listings are held for manual review. Your information is preserved.",
          optional: false,
        },
      ],
    };
  }

  const substantial = detectSubstantialCategoryMismatch({
    title: opts.title || "",
    description: opts.description || "",
    categorySlug: opts.categorySlug,
    categoryName: opts.categoryName,
    confidenceThreshold: policy.substantialMismatchConfidence,
  });

  if (substantial.mismatch && substantial.confidence >= policy.substantialMismatchConfidence) {
    // Never permanently REJECT solely because of AI category classification.
    const sellerChallenged = !!opts.categoryChallengeAcknowledged;

    if (policy.mode === "monitoring_only" || sellerChallenged) {
      return {
        ...base,
        verificationDecision: "APPROVED_WITH_SUGGESTIONS",
        allowsPublication: true,
        blocksPublication: false,
        suggestions: [
          ...(substantial.suggested
            ? [{
                ...substantial.suggested,
                optional: true,
                message: sellerChallenged
                  ? `${substantial.suggested.message} (You confirmed your category — thanks.)`
                  : substantial.suggested.message,
              }]
            : []),
          ...suggestions,
          ...(sellerChallenged
            ? []
            : [{
                type: "general" as const,
                message: "You can keep your category if it is correct — AI tips are optional.",
                optional: true,
              }]),
        ],
      };
    }
    return {
      ...base,
      verificationDecision: "CORRECTION_REQUIRED",
      eligibilityClass: "REQUIRES_REVIEW",
      decision: "pending",
      lifecycleOnInsert: "pending_review",
      publishStatus: "available",
      rejectionCode: "REQUIRES_HUMAN_REVIEW",
      blocksPublication: true,
      allowsPublication: false,
      reason: substantial.suggested?.message || "Clear product–category mismatch — please correct or confirm your category.",
      suggestions: [
        ...(substantial.suggested ? [{ ...substantial.suggested, optional: false }] : []),
        {
          type: "general",
          message: "If the AI tip is wrong, confirm your category to publish — we never permanently reject for category classification alone.",
          optional: true,
        },
        ...suggestions,
      ],
    };
  }

  // Monitoring only: never hold for review from soft signals
  if (policy.mode === "monitoring_only") {
    if (eligibility.eligibilityClass === "ALLOWED" && suggestions.length === 0) {
      return { ...base, verificationDecision: "APPROVED" };
    }
    return {
      ...base,
      verificationDecision: suggestions.length ? "APPROVED_WITH_SUGGESTIONS" : "APPROVED",
      // Force publish path even if eligibility said review
      eligibilityClass: "ALLOWED",
      decision: "approved",
      lifecycleOnInsert: "published",
      publishStatus: "available",
      rejectionCode: null,
      allowsPublication: true,
      blocksPublication: false,
    };
  }

  const alwaysReview = categorySlugInList(opts.categorySlug, policy.alwaysReviewCategorySlugs);
  const softReview = categorySlugInList(opts.categorySlug, policy.softReviewCategorySlugs);

  if (policy.mode === "balanced") {
    // Soft regulated (cosmetics/food): publish with suggestions — do not hard-block.
    if (softReview && eligibility.eligibilityClass === "REQUIRES_REVIEW" && eligibility.riskLevel !== "high") {
      return {
        ...base,
        verificationDecision: "APPROVED_WITH_SUGGESTIONS",
        eligibilityClass: "ALLOWED",
        decision: "approved",
        lifecycleOnInsert: "published",
        publishStatus: "available",
        rejectionCode: null,
        allowsPublication: true,
        blocksPublication: false,
        reason: "Published with optional compliance tips for this category.",
        suggestions: [
          {
            type: "general",
            message: "This category can have extra compliance expectations. Ensure your listing is accurate and lawful in your country.",
            optional: true,
          },
          ...suggestions,
        ],
      };
    }

    // Medium-risk toy weapons etc.: suggest, allow publish unless high risk
    if (
      eligibility.eligibilityClass === "REQUIRES_REVIEW"
      && eligibility.riskLevel === "medium"
      && !alwaysReview
    ) {
      return {
        ...base,
        verificationDecision: "APPROVED_WITH_SUGGESTIONS",
        eligibilityClass: "ALLOWED",
        decision: "approved",
        lifecycleOnInsert: "published",
        publishStatus: "available",
        rejectionCode: null,
        allowsPublication: true,
        blocksPublication: false,
        suggestions: [
          {
            type: "general",
            message: eligibility.reason || "Please ensure product type is clearly described for buyers.",
            optional: true,
          },
          ...suggestions,
        ],
      };
    }

    if (alwaysReview || (eligibility.eligibilityClass === "REQUIRES_REVIEW" && eligibility.riskLevel === "high")) {
      return {
        ...base,
        verificationDecision: "UNDER_REVIEW",
        allowsPublication: false,
        blocksPublication: true,
        suggestions: [
          {
            type: "general",
            message: "This listing needs a quick human safety review before it appears in search. Your information is saved.",
            optional: false,
          },
          ...suggestions,
        ],
      };
    }

    if (suggestions.length) {
      return { ...base, verificationDecision: "APPROVED_WITH_SUGGESTIONS" };
    }
    return { ...base, verificationDecision: "APPROVED" };
  }

  // Strict: keep REQUIRES_REVIEW as UNDER_REVIEW
  if (eligibility.eligibilityClass === "REQUIRES_REVIEW") {
    return {
      ...base,
      verificationDecision: "UNDER_REVIEW",
      allowsPublication: false,
      blocksPublication: true,
      suggestions: [
        {
          type: "general",
          message: "Strict mode: this listing is held for human review.",
          optional: false,
        },
        ...suggestions,
      ],
    };
  }

  if (suggestions.length) {
    return { ...base, verificationDecision: "APPROVED_WITH_SUGGESTIONS" };
  }
  return { ...base, verificationDecision: "APPROVED" };
}

/** Full seller-facing verification (suggestions + decision). */
export async function evaluateProductVerification(
  input: EligibilityInput,
): Promise<ProductVerificationResult> {
  const policy = input.verificationPolicy || (input.rulesOnly
    ? DEFAULT_PRODUCT_VERIFICATION_POLICY
    : await getProductVerificationPolicy());
  const eligibility = await evaluateProductEligibility(input);
  return toProductVerification(eligibility, {
    policy,
    title: input.title,
    description: input.description,
    categorySlug: input.categorySlug,
    categoryName: input.categoryName,
    analysisFailed: input.forceAnalysisFailed || eligibility.flags.includes("analysis_failed"),
    categoryChallengeAcknowledged: input.categoryChallengeAcknowledged,
  });
}

/**
 * Soft path for already-published listings: never auto-delete/suspend for minor
 * classification differences. Only escalate confirmed prohibited / high-risk.
 */
export async function softReviewExistingListing(input: EligibilityInput): Promise<{
  action: "none" | "notify_suggestions" | "hold_for_review" | "reject_confirmed";
  verification: ProductVerificationResult;
}> {
  const verification = await evaluateProductVerification({
    ...input,
    // Existing listings: prefer monitoring-friendly soft outcomes unless prohibited.
    verificationPolicy: input.verificationPolicy,
  });

  if (verification.verificationDecision === "REJECTED") {
    return { action: "reject_confirmed", verification };
  }
  if (
    verification.verificationDecision === "UNDER_REVIEW"
    && verification.riskLevel === "high"
  ) {
    return { action: "hold_for_review", verification };
  }
  if (
    verification.verificationDecision === "CORRECTION_REQUIRED"
    || verification.verificationDecision === "APPROVED_WITH_SUGGESTIONS"
  ) {
    return { action: "notify_suggestions", verification };
  }
  return { action: "none", verification };
}
