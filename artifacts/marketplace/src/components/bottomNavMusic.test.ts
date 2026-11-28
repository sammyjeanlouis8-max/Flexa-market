import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("global bottom nav Music tab", () => {
  it("replaces Cart with Music while keeping header cart", () => {
    const layout = read("components/Layout.tsx");
    assert.match(layout, /href:\s*"\/music"/);
    assert.match(layout, /key:\s*"music"/);
    assert.match(layout, /Music2/);
    assert.match(layout, /t\("nav\.music"/);
    assert.doesNotMatch(layout, /href:\s*"\/cart"[\s\S]{0,80}key:\s*"cart"/);
    assert.match(layout, /data-testid="cart-icon-button"/);
    assert.match(layout, /href="\/cart"/);
  });

  it("keeps cart route and cart page", () => {
    const app = read("App.tsx");
    assert.match(app, /path="\/cart"/);
    const cart = read("pages/Cart.tsx");
    assert.ok(cart.length > 100);
  });
});
