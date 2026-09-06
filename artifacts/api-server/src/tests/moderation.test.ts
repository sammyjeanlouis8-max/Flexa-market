import { describe, expect, it } from "vitest";
import { ruleBasedModerate } from "../lib/moderation";

describe("live-animal listing moderation", () => {
  it.each([
    ["Ti chen pou vann", "Li an bon sante"],
    ["Chiot à vendre", "Disponible immédiatement"],
    ["Puppies", "Healthy puppies looking for a home"],
    ["Perro en venta", "Cachorro saludable"],
    ["Filhote à venda", "Animal saudável"],
  ])("automatically rejects a live-animal offer: %s", (title, description) => {
    const result = ruleBasedModerate(title, description, 2);
    expect(result.decision).toBe("rejected");
    expect(result.flags).toContain("animals");
  });

  it.each([
    ["Manje pou chen", "Sak manje premium pou chen"],
    ["Dog toy", "Durable chew toy for dogs"],
    ["Cat carrier", "Travel carrier for cats"],
    ["T-shirt ak foto bèt", "Chemiz ak desen yon chen"],
  ])("allows animal supplies and animal-themed goods: %s", (title, description) => {
    const result = ruleBasedModerate(title, description, 2);
    expect(result.decision).toBe("approved");
    expect(result.flags).not.toContain("animals");
  });
});