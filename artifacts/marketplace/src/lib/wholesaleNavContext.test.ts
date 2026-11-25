import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeWholesaleChatReturn,
  peekWholesaleChatReturn,
  saveWholesaleNavContext,
} from "./wholesaleNavContext";

describe("wholesaleNavContext", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("only marks chat return when opening Market chat", () => {
    saveWholesaleNavContext({
      path: "/wholesale/products/1",
      productId: 1,
      q: "rice",
      country: "Haiti",
      scrollY: 220,
    });
    expect(peekWholesaleChatReturn()).toBeNull();

    saveWholesaleNavContext(
      {
        path: "/wholesale/products/1",
        productId: 1,
      },
      { markChatReturn: true },
    );
    expect(peekWholesaleChatReturn()).toBe("/wholesale/products/1");
    expect(consumeWholesaleChatReturn()).toBe("/wholesale/products/1");
    expect(peekWholesaleChatReturn()).toBeNull();
  });

  it("ignores non-wholesale paths", () => {
    saveWholesaleNavContext({ path: "/messages/9" }, { markChatReturn: true });
    expect(peekWholesaleChatReturn()).toBeNull();
  });
});
