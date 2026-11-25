import { describe, expect, it } from "vitest";
import {
  buildWholesaleCardPayload,
  serializeWholesaleCard,
  wholesaleCardClientMessageId,
  wholesaleCardPreview,
  WHOLESALE_CARD_MESSAGE_TYPE,
} from "../lib/wholesaleChatCard";

describe("wholesale chat card helpers", () => {
  it("builds durable card content for Market chat", () => {
    const payload = buildWholesaleCardPayload({
      productId: 1,
      title: "Rice 50lb bags",
      image: "https://cdn.example/rice.jpg",
      unitPrice: 28.5,
      currency: "USD",
      minOrderQty: 10,
      wholesaleUnitType: "bag",
      qty: 10,
    });
    expect(WHOLESALE_CARD_MESSAGE_TYPE).toBe("wholesale_card");
    expect(wholesaleCardClientMessageId(1)).toBe("wholesale-card-1");
    expect(wholesaleCardPreview(payload)).toContain("Rice 50lb bags");
    const raw = serializeWholesaleCard(payload);
    expect(JSON.parse(raw).kind).toBe("wholesale_product_card");
    expect(JSON.parse(raw).image).toContain("rice.jpg");
  });
});
