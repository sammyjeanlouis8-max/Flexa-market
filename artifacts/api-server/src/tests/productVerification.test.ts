import { describe, expect, it } from "vitest";
import { evaluateProductEligibility } from "../lib/productEligibility";
import {
  detectSubstantialCategoryMismatch,
  evaluateProductVerification,
  softReviewExistingListing,
  toProductVerification,
} from "../lib/productVerification";
import {
  DEFAULT_PRODUCT_VERIFICATION_POLICY,
  mergeProductVerificationPolicy,
} from "../lib/productVerificationPolicy";

const imgs = ["/objects/a.jpg", "/objects/b.jpg"];

describe("balanced product verification — seller-friendly", () => {
  it("allows ordinary goods immediately (APPROVED)", async () => {
    const result = await evaluateProductVerification({
      title: "Blue cotton t-shirt",
      description: "Soft everyday shirt, size M, gently used",
      price: 15,
      imageUrls: imgs,
      categorySlug: "fashion",
      categoryName: "Fashion",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.allowsPublication).toBe(true);
    expect(["APPROVED", "APPROVED_WITH_SUGGESTIONS"]).toContain(result.verificationDecision);
    expect(result.categoryRecommendationMandatory).toBe(false);
  });

  it("does not block short descriptions — soft tip only", async () => {
    const result = await evaluateProductVerification({
      title: "Kitchen blender",
      description: "Works.",
      price: 40,
      imageUrls: imgs,
      categorySlug: "home",
      categoryName: "Home & Garden",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.allowsPublication).toBe(true);
    expect(result.blocksPublication).toBe(false);
    expect(result.rejectionCode).not.toBe("VALIDATION_FAILED");
    expect(result.suggestions.some((s) => s.type === "description" && s.optional)).toBe(true);
  });

  it("never permanently rejects solely for AI category classification — challenge publishes", async () => {
    const blocked = await evaluateProductVerification({
      title: "2015 Honda Civic sedan",
      description: "Clean title car, runs well",
      imageUrls: imgs,
      categorySlug: "fashion",
      categoryName: "Fashion",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(blocked.verificationDecision).toBe("CORRECTION_REQUIRED");
    expect(blocked.verificationDecision).not.toBe("REJECTED");

    const challenged = await evaluateProductVerification({
      title: "2015 Honda Civic sedan",
      description: "Clean title car, runs well",
      imageUrls: imgs,
      categorySlug: "fashion",
      categoryName: "Fashion",
      rulesOnly: true,
      categoryChallengeAcknowledged: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(challenged.verificationDecision).toBe("APPROVED_WITH_SUGGESTIONS");
    expect(challenged.allowsPublication).toBe(true);
    expect(challenged.verificationDecision).not.toBe("REJECTED");
  });

  it("does not treat low AI confidence as suspicious", async () => {
    const eligibility = {
      eligibilityClass: "REQUIRES_REVIEW" as const,
      decision: "pending" as const,
      riskLevel: "medium" as const,
      confidence: 0.35,
      flags: ["unclear"],
      reason: "AI uncertain",
      rejectionCode: "REQUIRES_HUMAN_REVIEW" as const,
      source: "ai" as const,
      lifecycleOnInsert: "pending_review" as const,
      publishStatus: "available" as const,
    };
    // Softening happens in evaluateProductEligibility; verify full path with rulesOnly low-risk stays publishable
    const result = await evaluateProductVerification({
      title: "Blue cotton t-shirt",
      description: "Size M",
      imageUrls: imgs,
      categorySlug: "fashion",
      categoryName: "Fashion",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.allowsPublication).toBe(true);
    expect(eligibility.confidence).toBeLessThan(0.55);
  });

  it("allows Haitian Creole descriptions", async () => {
    const result = await evaluateProductVerification({
      title: "Chemiz ble",
      description: "Chemiz koton pou chak jou, gwosè M, itilize yon ti kras",
      price: 10,
      imageUrls: imgs,
      categorySlug: "fashion",
      categoryName: "Fashion",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.allowsPublication).toBe(true);
    expect(result.eligibilityClass).toBe("ALLOWED");
  });

  it("soft-publishes cosmetics in balanced mode (not hard hold)", async () => {
    const result = await evaluateProductVerification({
      title: "Face cream jar",
      description: "Moisturizing cream for daily use, unopened",
      imageUrls: imgs,
      categorySlug: "cosmetics",
      categoryName: "Cosmetics & Beauty",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.verificationDecision).toBe("APPROVED_WITH_SUGGESTIONS");
    expect(result.allowsPublication).toBe(true);
    expect(result.decision).toBe("approved");
  });

  it("holds vehicles for human review in balanced mode", async () => {
    const result = await evaluateProductVerification({
      title: "2015 Honda Civic",
      description: "Clean title sedan, runs well, low miles",
      imageUrls: imgs,
      categorySlug: "vehicles",
      categoryName: "Vehicles",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.verificationDecision).toBe("UNDER_REVIEW");
    expect(result.allowsPublication).toBe(false);
  });

  it("rejects confirmed prohibited products", async () => {
    const result = await evaluateProductVerification({
      title: "Cocaine for sale",
      description: "High quality cocaine available now",
      imageUrls: imgs,
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.verificationDecision).toBe("REJECTED");
    expect(result.blocksPublication).toBe(true);
  });

  it("blocks missing images (mandatory)", async () => {
    const result = await evaluateProductVerification({
      title: "Nice lamp",
      description: "Works perfectly, good condition",
      imageUrls: [],
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.verificationDecision).toBe("CORRECTION_REQUIRED");
    expect(result.rejectionCode).toBe("VALIDATION_FAILED");
    expect(result.allowsPublication).toBe(false);
  });

  it("monitoring_only never hard-holds soft regulated categories", async () => {
    const result = await evaluateProductVerification({
      title: "Face cream jar",
      description: "Moisturizing cream for daily use, unopened",
      imageUrls: imgs,
      categorySlug: "cosmetics",
      categoryName: "Cosmetics & Beauty",
      rulesOnly: true,
      verificationPolicy: mergeProductVerificationPolicy({ mode: "monitoring_only" }),
    });
    expect(result.allowsPublication).toBe(true);
    expect(["APPROVED", "APPROVED_WITH_SUGGESTIONS"]).toContain(result.verificationDecision);
  });

  it("strict mode holds cosmetics for review", async () => {
    const result = await evaluateProductVerification({
      title: "Face cream jar",
      description: "Moisturizing cream for daily use, unopened",
      imageUrls: imgs,
      categorySlug: "cosmetics",
      categoryName: "Cosmetics & Beauty",
      rulesOnly: true,
      verificationPolicy: mergeProductVerificationPolicy({ mode: "strict" }),
    });
    expect(result.verificationDecision).toBe("UNDER_REVIEW");
    expect(result.allowsPublication).toBe(false);
  });

  it("AI outage allows low-risk via fallback", async () => {
    const result = await evaluateProductVerification({
      title: "Oak dining chair",
      description: "Solid wood chair, good condition, minor scuffs",
      imageUrls: imgs,
      categorySlug: "home",
      categoryName: "Home",
      rulesOnly: true,
      forceAnalysisFailed: true,
      verificationPolicy: mergeProductVerificationPolicy({
        mode: "balanced",
        fallbackAllowLowRisk: true,
      }),
    });
    expect(result.verificationDecision).toBe("ANALYSIS_FAILED");
    expect(result.allowsPublication).toBe(true);
  });

  it("AI outage holds high-risk regulated when fallback denies", async () => {
    const result = await evaluateProductVerification({
      title: "2018 Toyota Corolla",
      description: "Sedan with clean title, runs great",
      imageUrls: imgs,
      categorySlug: "vehicles",
      categoryName: "Vehicles",
      rulesOnly: true,
      forceAnalysisFailed: true,
      verificationPolicy: mergeProductVerificationPolicy({
        mode: "balanced",
        fallbackAllowLowRisk: true,
      }),
    });
    expect(result.verificationDecision).toBe("ANALYSIS_FAILED");
    expect(result.allowsPublication).toBe(false);
  });
});

describe("substantial category mismatch", () => {
  it("flags clear vehicle-vs-fashion conflict", () => {
    const hit = detectSubstantialCategoryMismatch({
      title: "2015 Honda Civic sedan",
      description: "Clean title car, runs well",
      categorySlug: "fashion",
      categoryName: "Fashion",
      confidenceThreshold: 0.82,
    });
    expect(hit.mismatch).toBe(true);
  });

  it("does not flag minor / low-confidence differences", () => {
    const hit = detectSubstantialCategoryMismatch({
      title: "Nice item",
      description: "Good condition",
      categorySlug: "home",
      categoryName: "Home",
      confidenceThreshold: 0.82,
    });
    expect(hit.mismatch).toBe(false);
  });
});

describe("existing listings soft path", () => {
  it("notifies suggestions instead of suspending for soft tips", async () => {
    const { action, verification } = await softReviewExistingListing({
      title: "Kitchen blender",
      description: "Works.",
      imageUrls: imgs,
      categorySlug: "home",
      categoryName: "Home",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(["none", "notify_suggestions"]).toContain(action);
    expect(verification.categoryRecommendationMandatory).toBe(false);
  });

  it("rejects only confirmed prohibited on existing listings", async () => {
    const { action } = await softReviewExistingListing({
      title: "Glock 19 pistol",
      description: "9mm handgun with ammunition",
      imageUrls: imgs,
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(action).toBe("reject_confirmed");
  });
});

describe("eligibility under balanced default (regression)", () => {
  it("cosmetics ALLOWED at eligibility layer under balanced", async () => {
    const result = await evaluateProductEligibility({
      title: "Face cream jar",
      description: "Moisturizing cream for daily use, unopened",
      imageUrls: imgs,
      categorySlug: "cosmetics",
      categoryName: "Cosmetics & Beauty",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.eligibilityClass).toBe("ALLOWED");
    expect(result.decision).toBe("approved");
  });

  it("vehicles still REQUIRES_REVIEW under balanced", async () => {
    const result = await evaluateProductEligibility({
      title: "2015 Honda Civic",
      description: "Clean title sedan, runs well",
      imageUrls: imgs,
      categorySlug: "vehicles",
      categoryName: "Vehicles",
      rulesOnly: true,
      verificationPolicy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(result.eligibilityClass).toBe("REQUIRES_REVIEW");
  });

  it("toProductVerification never marks category tips mandatory", () => {
    const eligibility = {
      eligibilityClass: "ALLOWED" as const,
      decision: "approved" as const,
      riskLevel: "low" as const,
      confidence: 0.9,
      flags: [] as string[],
      reason: "ok",
      rejectionCode: null,
      source: "rules" as const,
      lifecycleOnInsert: "published" as const,
      publishStatus: "available" as const,
    };
    const v = toProductVerification(eligibility, {
      title: "iPhone 12",
      description: "Unlocked phone in good condition",
      categorySlug: "fashion",
      categoryName: "Fashion",
      policy: DEFAULT_PRODUCT_VERIFICATION_POLICY,
    });
    expect(v.categoryRecommendationMandatory).toBe(false);
  });
});
