import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/Layout.tsx"),
  "utf8",
);

describe("My Boosts page chrome", () => {
  it("hides site Footer and mobile bottom nav on /my-boosts", () => {
    expect(layout).toMatch(/isMyBoostsPage\s*=\s*\/\^\\\/my-boosts/);
    expect(layout).toMatch(/noFooter\s*=\s*[\s\S]*isMyBoostsPage/);
    expect(layout).toMatch(/mobile-bottom-nav[\s\S]*isMyBoostsPage/);
    expect(layout).toMatch(/pb-safe-nav[\s\S]*isMyBoostsPage|isMyBoostsPage[\s\S]*pb-safe-nav/);
  });
});
