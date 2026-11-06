import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_INTENT_KEY,
  authPathWithNext,
  clearAuthIntent,
  consumeAuthIntent,
  peekAuthIntent,
  saveAuthIntent,
} from "./authIntent";

afterEach(() => {
  sessionStorage.removeItem(AUTH_INTENT_KEY);
});

describe("authIntent", () => {
  it("saves and consumes a one-shot add-to-cart intent", () => {
    saveAuthIntent({
      action: "addToCart",
      next: "/listings/42",
      listingId: 42,
      sellerId: 7,
      title: "Bike",
      price: 100,
      quantity: 1,
    });
    expect(peekAuthIntent()?.listingId).toBe(42);
    const consumed = consumeAuthIntent();
    expect(consumed?.action).toBe("addToCart");
    expect(peekAuthIntent()).toBeNull();
  });

  it("rejects open-redirect next paths", () => {
    saveAuthIntent({ action: "generic", next: "//evil.example" });
    expect(peekAuthIntent()).toBeNull();
  });

  it("builds safe login URLs", () => {
    expect(authPathWithNext("/auth/login", "/listings/9")).toBe("/auth/login?next=%2Flistings%2F9");
  });

  it("expires stale intents", () => {
    sessionStorage.setItem(
      AUTH_INTENT_KEY,
      JSON.stringify({
        action: "checkout",
        next: "/cart",
        createdAt: Date.now() - 60 * 60 * 1000,
      }),
    );
    expect(peekAuthIntent()).toBeNull();
    clearAuthIntent();
  });
});
