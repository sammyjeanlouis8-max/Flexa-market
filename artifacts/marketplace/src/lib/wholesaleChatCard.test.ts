import { describe, expect, it } from "vitest";
import {
  buildWholesaleCardPayload,
  parseWholesaleCard,
  serializeWholesaleCard,
  wholesaleCardClientMessageId,
  wholesaleCardPreview,
} from "./wholesaleChatCard";

describe("wholesaleChatCard", () => {
  it("round-trips a product card payload", () => {
    const payload = buildWholesaleCardPayload({
      productId: 7,
      title: "Rice 50lb bags",
      image: "https://example.com/rice.jpg",
      unitPrice: 28.5,
      currency: "USD",
      minOrderQty: 10,
      wholesaleUnitType: "bag",
      qty: 12,
    });
    const parsed = parseWholesaleCard(serializeWholesaleCard(payload));
    expect(parsed).toEqual(payload);
    expect(wholesaleCardClientMessageId(7)).toBe("wholesale-card-7");
    expect(wholesaleCardPreview(payload)).toBe("📦 Rice 50lb bags");
  });

  it("parses legacy From Flexa Wholesale openers", () => {
    const legacy = "From Flexa Wholesale · Cooking oil · qty 5 [wholesale:42]";
    const parsed = parseWholesaleCard(legacy);
    expect(parsed?.productId).toBe(42);
    expect(parsed?.title).toBe("Cooking oil");
  });

  it("rejects unrelated text", () => {
    expect(parseWholesaleCard("hello seller")).toBeNull();
  });
});
