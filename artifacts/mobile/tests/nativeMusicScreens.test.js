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
  "app/music/profile.tsx",
  "components/music/MusicMiniPlayer.tsx",
  "components/music/MusicShell.tsx",
];

test("Flexa Music screens are native (no WebView)", () => {
  for (const rel of MUSIC_SCREENS) {
    const source = read(rel);
    assert.equal(source.includes("SafeWebView"), false, rel);
    assert.equal(source.includes("react-native-webview"), false, rel);
    assert.equal(source.includes("<WebView"), false, rel);
  }
});

test("music theme uses premium charcoal emerald orange tokens", () => {
  const theme = read("lib/musicTheme.ts");
  assert.match(theme, /#101714/);
  assert.match(theme, /#159A68/);
  assert.match(theme, /#0B3D2B/);
  assert.match(theme, /#FF7900/);
  assert.match(theme, /#F5F7F6/);
  assert.match(theme, /#9CAEA4/);
  assert.match(theme, /#293B32/);
});

test("music API helpers target /music endpoints including library", () => {
  const api = read("lib/musicApi.ts");
  assert.match(api, /\/music/);
  assert.match(api, /getApiBase/);
  assert.match(api, /fetchMusicLibrary/);
  assert.match(api, /\/music\/library/);
});

test("MusicShell has Back, logo, Search, and four Music tabs", () => {
  const shell = read("components/music/MusicShell.tsx");
  assert.match(shell, /testID="music-back"/);
  assert.match(shell, /arrow-left/);
  assert.match(shell, /testID="music-search"/);
  assert.match(shell, /music_tabHome/);
  assert.match(shell, /music_tabExplore/);
  assert.match(shell, /music_tabLibrary/);
  assert.match(shell, /music_tabProfile/);
  assert.match(shell, /BackHandler/);
  assert.match(shell, /replace\("\/\(tabs\)\/"/);
  assert.doesNotMatch(shell, /plus-circle/);
});

test("Market tab bar hides while Music is focused; Music owns nav", () => {
  const tabs = read("app/(tabs)/_layout.tsx");
  assert.match(tabs, /name="music"/);
  assert.match(tabs, /tabBarStyle:\s*\{\s*display:\s*"none"\s*\}/);
  const musicTab = read("app/(tabs)/music.tsx");
  assert.match(musicTab, /<MusicShell\s+showNav/);
  assert.match(musicTab, /Featured|music_featured/);
  assert.match(musicTab, /fetchMusicCatalog/);
  const mini = read("components/music/MusicMiniPlayer.tsx");
  assert.match(mini, /MUSIC_TAB_BAR_CONTENT/);
  assert.match(mini, /useTabBarHeight/);
  assert.match(mini, /music-mini-player/);
});

test("Now Playing wires shuffle, repeat, favorite, share, queue", () => {
  const np = read("app/music/now-playing.tsx");
  assert.match(np, /setShuffle/);
  assert.match(np, /setRepeat/);
  assert.match(np, /toggleTrackLike/);
  assert.match(np, /Share\.share/);
  assert.match(np, /music_queue/);
});

test("Upload supports cover plus, album, progress, draft", () => {
  const up = read("app/music/upload.tsx");
  assert.match(up, /music_addPhoto/);
  assert.match(up, /album/);
  assert.match(up, /progress/);
  assert.match(up, /DRAFT_KEY|flexa_music_upload_draft/);
});

test("root layout registers music profile route", () => {
  const root = read("app/_layout.tsx");
  assert.match(root, /name="music\/profile"/);
  assert.match(root, /MusicMiniPlayer/);
});
