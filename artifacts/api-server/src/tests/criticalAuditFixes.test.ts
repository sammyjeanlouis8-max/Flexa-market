import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src/routes");

describe("critical audit fixes", () => {
  it("debits tipper wallet and forbids self-tips", () => {
    const src = readFileSync(join(root, "tips.ts"), "utf8");
    expect(src).toContain("deductWalletHybrid");
    expect(src).toContain("SELF_TIP_FORBIDDEN");
    expect(src).toContain("INSUFFICIENT_BALANCE");
    // Credit still happens after debit
    expect(src).toContain("tip_credit");
  });

  it("rejects forged paymentRef boost activation", () => {
    const src = readFileSync(join(root, "listings.ts"), "utf8");
    const boostFn = src.slice(src.indexOf('router.post("/listings/:id/boost"'));
    expect(boostFn).toContain("USE_BOOST_CHECKOUT");
    expect(boostFn).toContain("deductWalletHybrid");
    expect(boostFn).not.toMatch(/paymentStatus:\s*paymentRef\s*\?\s*"paid"/);
  });

  it("requires approved listings on cart checkout", () => {
    const src = readFileSync(join(root, "transactions.ts"), "utf8");
    const cart = src.slice(src.indexOf('router.post("/cart/checkout"'));
    expect(cart).toContain("LISTING_NOT_APPROVED");
    expect(cart).toContain("moderationStatus");
  });

  it("guards BNPL admin routes with requireAdmin", () => {
    const src = readFileSync(join(root, "bnpl.ts"), "utf8");
    expect(src).toMatch(/admin\/bnpl\/settings[\s\S]{0,80}requireAdmin/);
    expect(src).toMatch(/admin\/bnpl\/analytics[\s\S]{0,80}requireAdmin/);
  });

  it("does not let stripeConnect shadow /stripe/config capabilities", () => {
    const connect = readFileSync(join(root, "stripeConnect.ts"), "utf8");
    const checkout = readFileSync(join(root, "stripeCheckout.ts"), "utf8");
    expect(connect).not.toMatch(/router\.get\(\s*["']\/stripe\/config["']/);
    expect(checkout).toContain("resolveWalletCapabilities");
  });
});
