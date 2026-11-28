import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string) {
  return readFileSync(join(root, rel), "utf8");
}

describe("Flexa Music premium redesign (web)", () => {
  it("MusicHome exposes Back to Market and Search", () => {
    const home = read("components/music/MusicHome.tsx");
    assert.match(home, /data-testid="music-back"/);
    assert.match(home, /ArrowLeft/);
    assert.match(home, /setLocation\("\/"\)/);
    assert.match(home, /data-testid="music-open-search"/);
  });

  it("music theme tokens match charcoal emerald palette", () => {
    const theme = read("lib/musicTheme.ts");
    assert.match(theme, /#101714/);
    assert.match(theme, /#159A68/);
    assert.match(theme, /#FF7900/);
    assert.match(theme, /#1C2C24/);
  });

  it("CSS shell uses premium tokens", () => {
    const css = read("index.css");
    assert.match(css, /--music-charcoal:\s*#101714/);
    assert.match(css, /--music-emerald:\s*#159A68/);
    assert.match(css, /--music-orange:\s*#FF7900/);
  });
});
