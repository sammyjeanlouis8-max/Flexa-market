import { describe, expect, it } from "vitest";
import { walletChoiceMethodLines } from "./walletChoiceMethods";

const labels = {
  monCash: "MonCash",
  card: "Card",
  agent: "Agent",
  crypto: "Crypto",
  transfer: "Transfer",
};

describe("walletChoiceMethodLines", () => {
  it("includes MonCash for Haiti accounts on both cards", () => {
    const lines = walletChoiceMethodLines(true, labels);
    expect(lines.recharge).toBe("MonCash · Card · Agent · Crypto");
    expect(lines.withdraw).toBe("MonCash · Agent · Transfer");
  });

  it("omits MonCash for non-Haiti accounts", () => {
    const lines = walletChoiceMethodLines(false, labels);
    expect(lines.recharge).toBe("Card · Agent · Crypto");
    expect(lines.withdraw).toBe("Agent · Transfer");
    expect(lines.recharge).not.toContain("MonCash");
    expect(lines.withdraw).not.toContain("MonCash");
  });
});
