import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const chatbotPage = readFileSync(
  resolve(root, "marketplace/src/pages/Chatbot.tsx"),
  "utf8",
);
const chatbotRoute = readFileSync(
  resolve(root, "api-server/src/routes/chatbot.ts"),
  "utf8",
);

describe("FlexaBot back button + knowledge fallback", () => {
  it("renders a back control on the customer FlexaBot page", () => {
    expect(chatbotPage).toContain("button-chatbot-back");
    expect(chatbotPage).toContain("ChevronLeft");
    expect(chatbotPage).toMatch(/history\.back|setLocation\("\/"\)/);
  });

  it("falls back to verified knowledge when the LLM fails", () => {
    expect(chatbotRoute).toContain("composeKnowledgeAnswer");
    expect(chatbotRoute).toContain("knowledgeFallback");
    expect(chatbotRoute).toContain("using knowledge fallback");
  });
});
