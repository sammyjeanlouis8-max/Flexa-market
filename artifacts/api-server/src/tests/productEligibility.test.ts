import { describe, expect, it } from "vitest";
import {
  evaluateProductEligibility,
  classifyFromModeration,
  isPubliclyDiscoverable,
  deriveLifecycleStatus,
} from "../lib/productEligibility";
import { ruleBasedModerate } from "../lib/moderation";

describe("product eligibility — ALLOWED goods", () => {
  it.each([
    ["Blue cotton t-shirt", "Soft everyday shirt, size M, gently used"],
    ["Samsung phone case", "Clear protective case for Galaxy S21"],
    ["Oak dining chair", "Solid wood chair, good condition"],
    ["Used textbook Algebra", "College algebra book, highlights ok"],
    ["Kitchen blender", "Working blender, includes pitcher"],
  ])("allows ordinary marketplace goods: %s", async (title, description) => {
    const result = await evaluateProductEligibility({
      title,
      description,
      price: 20,
      imageUrls: ["/objects/a.jpg", "/objects/b.jpg"],
      categorySlug: "electronics",
      categoryName: "Electronics",
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("ALLOWED");
    expect(result.decision).toBe("approved");
    expect(result.lifecycleOnInsert).toBe("published");
  });
});

describe("product eligibility — PROHIBITED", () => {
  it("rejects illicit drugs", async () => {
    const result = await evaluateProductEligibility({
      title: "Cocaine for sale",
      description: "High quality cocaine available now",
      imageUrls: ["/objects/a.jpg"],
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("PROHIBITED");
    expect(result.decision).toBe("rejected");
    expect(result.rejectionCode).toBe("PROHIBITED_DRUGS");
  });

  it("rejects real firearms", async () => {
    const result = await evaluateProductEligibility({
      title: "Glock 19 pistol",
      description: "9mm handgun with ammunition",
      imageUrls: ["/objects/a.jpg"],
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("PROHIBITED");
    expect(result.flags).toContain("weapons");
  });

  it("rejects live animals", async () => {
    const result = await evaluateProductEligibility({
      title: "Puppies",
      description: "Healthy puppies looking for a home",
      imageUrls: ["/objects/a.jpg"],
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("PROHIBITED");
    expect(result.flags).toContain("animals");
  });

  it("rejects counterfeit brand language", async () => {
    const result = await evaluateProductEligibility({
      title: "Fake Rolex watch",
      description: "1:1 mirror replica Rolex, super fake quality",
      imageUrls: ["/objects/a.jpg"],
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("PROHIBITED");
    expect(result.rejectionCode).toBe("PROHIBITED_COUNTERFEIT");
  });

  it("rejects stolen-goods language", async () => {
    const result = await evaluateProductEligibility({
      title: "Phone cheap",
      description: "Stolen phone no questions asked cash",
      imageUrls: ["/objects/a.jpg"],
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("PROHIBITED");
    expect(result.rejectionCode).toBe("PROHIBITED_STOLEN");
  });
});

describe("product eligibility — REQUIRES_REVIEW", () => {
  it("holds regulated category goods for human review (never auto-ALLOW)", async () => {
    const result = await evaluateProductEligibility({
      title: "Face cream jar",
      description: "Moisturizing cream for daily use, unopened",
      imageUrls: ["/objects/a.jpg", "/objects/b.jpg"],
      categorySlug: "cosmetics",
      categoryName: "Cosmetics & Beauty",
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("REQUIRES_REVIEW");
    expect(result.decision).toBe("pending");
    expect(result.lifecycleOnInsert).toBe("pending_review");
  });

  it("holds vehicles category for review", async () => {
    const result = await evaluateProductEligibility({
      title: "2015 Honda Civic",
      description: "Clean title sedan, runs well",
      imageUrls: ["/objects/a.jpg"],
      categorySlug: "vehicles",
      categoryName: "Vehicles",
      rulesOnly: true,
    });
    expect(result.eligibilityClass).toBe("REQUIRES_REVIEW");
    expect(result.decision).toBe("pending");
  });

  it("maps medium-risk moderation to REQUIRES_REVIEW", () => {
    const moderation = ruleBasedModerate("Nerf blaster toy gun", "Kids foam dart toy", 2);
    const classified = classifyFromModeration(moderation, {
      categoryReview: false,
      counterfeit: false,
      stolen: false,
    });
    expect(["REQUIRES_REVIEW", "ALLOWED"]).toContain(classified.eligibilityClass);
    if (moderation.flags.includes("toy_weapons")) {
      expect(classified.eligibilityClass).toBe("REQUIRES_REVIEW");
    }
  });
});

describe("discovery gates", () => {
  it("only published approved listings are publicly discoverable", () => {
    expect(isPubliclyDiscoverable({ status: "available", moderationStatus: "approved" })).toBe(true);
    expect(isPubliclyDiscoverable({ status: "available", moderationStatus: "pending" })).toBe(false);
    expect(isPubliclyDiscoverable({ status: "removed", moderationStatus: "rejected" })).toBe(false);
    expect(isPubliclyDiscoverable({
      status: "available",
      moderationStatus: "approved",
      lifecycleStatus: "suspended",
    })).toBe(false);
  });

  it("derives lifecycle from legacy columns", () => {
    expect(deriveLifecycleStatus({ status: "available", moderationStatus: "pending" })).toBe("pending_review");
    expect(deriveLifecycleStatus({ status: "sold", moderationStatus: "approved" })).toBe("sold");
    expect(deriveLifecycleStatus({ status: "removed", moderationStatus: "rejected" })).toBe("rejected");
    expect(deriveLifecycleStatus({
      status: "available",
      moderationStatus: "approved",
      lifecycleStatus: "suspended",
    })).toBe("suspended");
  });
});

describe("validation", () => {
  it("rejects missing images", async () => {
    const result = await evaluateProductEligibility({
      title: "Nice lamp",
      description: "Works perfectly, good condition",
      imageUrls: [],
      rulesOnly: true,
    });
    expect(result.rejectionCode).toBe("VALIDATION_FAILED");
    expect(result.decision).toBe("rejected");
  });
});
