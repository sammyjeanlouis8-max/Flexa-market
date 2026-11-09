import { describe, expect, it } from "vitest";
import {
  buildPromoChatDraft,
  buildPromoWhatsAppMessage,
  FLEXA_PUBLIC_ORIGIN,
  getPublicPromoVideoUrl,
} from "./promoVideoContact";

describe("promoVideoContact", () => {
  it("builds a stable production watch URL", () => {
    expect(getPublicPromoVideoUrl(42)).toBe(`${FLEXA_PUBLIC_ORIGIN}/videos/watch?video=42`);
    expect(getPublicPromoVideoUrl(42, "https://flexamarket.com/")).toBe(
      `${FLEXA_PUBLIC_ORIGIN}/videos/watch?video=42`,
    );
  });

  it("maps localhost origins to the production domain for outbound shares", () => {
    expect(getPublicPromoVideoUrl(7, "http://127.0.0.1:5175")).toBe(
      `${FLEXA_PUBLIC_ORIGIN}/videos/watch?video=7`,
    );
  });

  it("prefills WhatsApp / chat copy with title + link", () => {
    const wa = buildPromoWhatsAppMessage({ videoId: 9, title: "tshot for man" });
    expect(wa).toContain("Hello, I am interested in this advertisement on Flexa Market.");
    expect(wa).toContain("Video: tshot for man");
    expect(wa).toContain(`${FLEXA_PUBLIC_ORIGIN}/videos/watch?video=9`);

    const chat = buildPromoChatDraft({ videoId: 9, title: "tshot for man" });
    expect(chat).toContain("Link: https://flexamarket.com/videos/watch?video=9");
  });
});
