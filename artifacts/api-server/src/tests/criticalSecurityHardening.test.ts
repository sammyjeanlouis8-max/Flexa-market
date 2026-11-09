import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/routes");

describe("critical security hardening", () => {
  it("disables unauthenticated forgot-password takeover", () => {
    const src = readFileSync(join(root, "auth.ts"), "utf8");
    expect(src).toContain('status(410)');
    expect(src).toContain("USE_ACCOUNT_RECOVERY");
    expect(src).not.toMatch(/forgot-password[\s\S]{0,400}hashPassword\(password\)/);
  });

  it("rejects card paymentRef completion on listings purchase", () => {
    const src = readFileSync(join(root, "listings.ts"), "utf8");
    expect(src).toContain("USE_STRIPE_CHECKOUT");
    expect(src).toContain('purchasePaymentStatus');
    expect(src).toContain("pending_review");
    expect(src).toContain("LISTING_NOT_APPROVED");
  });

  it("whitelists public user fields without email/phone/stripe", () => {
    const src = readFileSync(join(root, "users.ts"), "utf8");
    const fn = src.slice(src.indexOf("function formatPublicUser"), src.indexOf("function formatListing"));
    expect(fn).not.toContain("...rest");
    expect(fn).not.toContain("stripeCustomerId");
    expect(fn).not.toContain("registrationIp");
    expect(fn).not.toContain("email:");
    expect(fn).not.toContain("phone:");
    expect(fn).toContain("name: user.name");
  });

  it("binds stripe checkout session reads to the buyer", () => {
    const src = readFileSync(join(root, "stripeCheckout.ts"), "utf8");
    expect(src).toContain("Session not found");
    expect(src).toContain("buyerUserId");
    expect(src).toContain("LISTING_NOT_APPROVED");
  });
});
