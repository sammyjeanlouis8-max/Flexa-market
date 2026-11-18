"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

test("music ad break uses SONGS_PER_AD = 10 and AsyncStorage counter", () => {
  const src = read("lib/musicAdBreak.ts");
  assert.match(src, /SONGS_PER_AD\s*=\s*10/);
  assert.match(src, /MUSIC_AD_COUNTER_KEY/);
  assert.match(src, /AsyncStorage/);
  assert.match(src, /recordNaturalSongCompletion/);
});

test("music ad break fetches boost random video with requireAudio", () => {
  const src = read("lib/musicAdBreak.ts");
  assert.match(src, /\/boost\/random-video\?requireAudio=1/);
  assert.match(src, /\/music\/sponsored-ad/);
});

test("sponsored break UI is native (no WebView)", () => {
  for (const rel of [
    "components/music/MusicSponsoredBreak.tsx",
    "app/music/sponsored-ads.tsx",
  ]) {
    const source = read(rel);
    assert.equal(source.includes("react-native-webview"), false, rel);
    assert.equal(source.includes("<WebView"), false, rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
  }
});

test("music player wires natural finish to ad break helper", () => {
  const src = read("lib/musicPlayer.ts");
  assert.match(src, /didJustFinish/);
  assert.match(src, /recordNaturalSongCompletion/);
  assert.match(src, /setMusicAdBreakHandler/);
  assert.doesNotMatch(src, /recordNaturalSongCompletion[\s\S]*await next\(\)/);
});

test("history helpers exposed for library screen", () => {
  const src = read("lib/musicAdBreak.ts");
  assert.match(src, /loadSponsoredAdHistory/);
  assert.match(src, /clearSponsoredAdHistory/);
  assert.match(src, /readUnseenSponsoredAdCount/);
  assert.match(src, /MUSIC_AD_HISTORY_KEY/);
});