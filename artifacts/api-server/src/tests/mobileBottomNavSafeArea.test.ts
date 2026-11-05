/**
 * Guards against regressing the iPhone bottom-nav double safe-area gap.
 * Content row must stay ~56px; safe-area padding belongs on the nav shell once.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const layout = readFileSync(
  resolve(__dirname, "../../../marketplace/src/components/Layout.tsx"),
  "utf8",
);
const css = readFileSync(
  resolve(__dirname, "../../../marketplace/src/index.css"),
  "utf8",
);

describe("mobile bottom nav safe-area", () => {
  it("does not bake safe-area into the nav row height inline", () => {
    expect(layout).not.toMatch(
      /height:\s*["']calc\(64px \+ max\(env\(safe-area-inset-bottom/,
    );
    // The mobile-bottom-nav-row must be a plain className (no inline height/paddingBottom).
    expect(layout).toMatch(
      /className="mobile-bottom-nav-row w-full grid grid-cols-5"\s*>/,
    );
  });

  it("applies a single bottom inset on .mobile-bottom-nav", () => {
    expect(css).toMatch(
      /\.mobile-bottom-nav\s*\{[\s\S]*?padding-bottom:\s*max\(env\(safe-area-inset-bottom/,
    );
  });

  it("keeps the content row compact (~56px) without nested bottom padding", () => {
    expect(css).toMatch(/\.mobile-bottom-nav-row\s*\{[\s\S]*?height:\s*56px/);
    expect(css).toMatch(/\.mobile-bottom-nav-row\s*\{[\s\S]*?padding:\s*0\s*!important/);
  });

  it("clears main content with matching 56px + one inset", () => {
    expect(css).toMatch(
      /\.pb-safe-nav\s*\{[\s\S]*?padding-bottom:\s*calc\(56px \+ max\(env\(safe-area-inset-bottom/,
    );
    expect(css).not.toMatch(
      /\.pb-safe-nav\s*\{[\s\S]*?var\(--flexa-vv-bottom/,
    );
  });
});
