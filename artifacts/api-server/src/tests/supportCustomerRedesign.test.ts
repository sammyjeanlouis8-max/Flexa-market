import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const support = readFileSync(
  resolve(__dirname, "../../../marketplace/src/pages/Support.tsx"),
  "utf8",
);
const layout = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/Layout.tsx"),
  "utf8",
);

describe("customer Smart Support redesign", () => {
  it("uses immersive shell without marketplace chrome", () => {
    expect(layout).toContain("support-immersive-shell");
    expect(layout).toMatch(/isSupportImmersive/);
    expect(support).toContain("smart-support-customer");
    expect(support).toContain("support-brand-header");
  });

  it("keeps official logo and forest-green brand", () => {
    expect(support).toContain('OFFICIAL_LOGO = "/flexa-logo-v2.png"');
    expect(support).toContain('BRAND_GREEN = "hsl(152,65%,18%)"');
    expect(support).toContain("FlexaBot");
    expect(support).not.toMatch(/bg-purple-600/);
  });

  it("labels AI vs human agent clearly", () => {
    expect(support).toContain("Support Agent");
    expect(support).toMatch(/AI/);
    expect(support).toContain("FlexaBot");
  });
});
