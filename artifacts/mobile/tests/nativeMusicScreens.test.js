"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const MUSIC_SCREENS = [
  "app/(tabs)/music.tsx",
  "app/music/search.tsx",
  "app/music/library.tsx",
  "app/music/playlists.tsx",
  "app/music/playlist/[id].tsx",
  "app/music/now-playing.tsx",
  "app/music/upload.tsx",
  "components/music/MusicMiniPlayer.tsx",
];

test("Flexa Music screens are native (no WebView)", () => {
  for (const rel of MUSIC_SCREENS) {
    const source = read(rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
    assert.equal(source.includes("react-native-webview"), false, rel);
    assert.equal(source.includes("<WebView"), false, rel);
  }
});

test("music theme uses redesign accents", () => {
  const theme = read("lib/musicTheme.ts");
  assert.match(theme, /#0B3022/);
  assert.match(theme, /#FF6B00/);
  assert.match(theme, /#121212/);
});

test("music API helpers target /music endpoints", () => {
  const api = read("lib/musicApi.ts");
  assert.match(api, /\/music/);
  assert.match(api, /getApiBase/);
});

test("Music tab is in bottom nav and mini-player clears the tab bar", () => {
  const tabs = read("app/(tabs)/_layout.tsx");
  assert.match(tabs, /name="music"/);
  assert.match(tabs, /t\("tabMusic"\)/);
  assert.match(tabs, /Feather name="music"/);
  assert.match(tabs, /name="cart"[\s\S]*href:\s*null/);
  const musicTab = read("app/(tabs)/music.tsx");
  assert.match(musicTab, /showNav=\{false\}/);
  const mini = read("components/music/MusicMiniPlayer.tsx");
  assert.match(mini, /useTabBarHeight/);
  assert.match(mini, /bottom:\s*tabBarHeight\s*\+\s*8/);
});