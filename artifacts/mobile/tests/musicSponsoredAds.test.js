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
  assert.match(src, /MUSIC_AD_FETCH_TIMEOUT_MS\s*=\s*2500/);
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
  assert.match(src, /resetAdCounter/);
  // Count always; only skip playing an ad into silence.
  assert.match(src, /Queue ending into silence/);
  const countIdx = src.indexOf("recordNaturalSongCompletion");
  const silenceIdx = src.indexOf("if (!hasNext) return");
  assert.ok(countIdx > 0 && silenceIdx > countIdx, "count before silence gate");
  assert.doesNotMatch(src, /export async function next\(\)[\s\S]*recordNaturalSongCompletion/);
});

test("natural completion increments without resetting; reset is caller-owned", () => {
  const src = read("lib/musicAdBreak.ts");
  const fn = src.slice(src.indexOf("export async function recordNaturalSongCompletion"));
  const body = fn.slice(0, fn.indexOf("export async function resetAdCounter"));
  assert.match(body, /writeCompletedSongCounter\(next\)/);
  assert.doesNotMatch(body, /writeCompletedSongCounter\(0\)/);
});

test("Watch replay pauses music and does not touch ad counter", () => {
  const src = read("app/music/sponsored-ads.tsx");
  assert.match(src, /resumeRef/);
  assert.match(src, /pause\(\)/);
  assert.match(src, /seek\(resume\.ms\)/);
  assert.match(src, /Manual replays do not affect/);
  assert.doesNotMatch(src, /recordNaturalSongCompletion/);
  assert.doesNotMatch(src, /appendSponsoredAdHistory/);
});

test("foreground break shows Sponsored badge, View product CTA, Music paused", () => {
  const src = read("components/music/MusicSponsoredBreak.tsx");
  assert.match(src, /Sponsored/);
  assert.match(src, /View product/);
  assert.match(src, /Music paused/);
  assert.match(src, /music-sponsored-break/);
});

test("history helpers exposed for library screen", () => {
  const src = read("lib/musicAdBreak.ts");
  assert.match(src, /loadSponsoredAdHistory/);
  assert.match(src, /clearSponsoredAdHistory/);
  assert.match(src, /readUnseenSponsoredAdCount/);
  assert.match(src, /MUSIC_AD_HISTORY_KEY/);
});