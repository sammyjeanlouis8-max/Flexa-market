"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const apiRoot = path.join(root, "..", "api-server");

test("Phase 3I Flexa TV screen is native and uses verified TV APIs", () => {
  const screen = read("app/tv.tsx");
  const api = read("lib/tvApi.ts");
  assert.doesNotMatch(screen, /NativePlaceholder|WebView/);
  assert.match(screen, /NativeVideoPlayer|expo-av|fetchTvBroadcast|fetchTvPrograms/);
  assert.match(api, /\/tv\/broadcast/);
  assert.match(api, /\/tv\/schedule/);
  assert.match(api, /\/tv\/programs/);
  assert.match(api, /\/tv\/series/);
  assert.match(api, /\/tv\/movies/);
  assert.match(api, /\/tv\/broadcast\/heartbeat/);
  assert.doesNotMatch(api, /\/admin\/tv\/upload-video/);
  assert.match(screen, /tvUploadBlocked|UploadBlocked|admin/i);
});

test("Phase 3I Flexa Music browse/detail/upload are native without purchase CTAs", () => {
  assert.ok(fs.existsSync(path.join(root, "app/music.tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/music/[id].tsx")));
  assert.ok(fs.existsSync(path.join(root, "app/music/upload.tsx")));
  const browse = read("app/music.tsx");
  const detail = read("app/music/[id].tsx");
  const upload = read("app/music/upload.tsx");
  const api = read("lib/musicApi.ts");
  assert.doesNotMatch(browse, /NativePlaceholder|WebView/);
  assert.doesNotMatch(detail, /NativePlaceholder|WebView|\/music\/.*\/buy|buy\/wallet/);
  assert.doesNotMatch(upload, /artist\/subscribe|Play Billing|Google Play/);
  assert.match(api, /\/music\/stream-url\//);
  assert.match(api, /\/music\/upload-signature/);
  assert.match(api, /\/music\/register/);
  assert.match(api, /\/music\/artist\/plan/);
  assert.match(upload, /requestMusicUploadSignature|putMusicFile|registerMusicTrack|saveMusicDraft/);
  assert.match(detail, /toggleMusicLike|postMusicComment|followUser/);
});

test("Phase 3I persistent music player + mini-player wired in root layout", () => {
  const layout = read("app/_layout.tsx");
  const player = read("context/MusicPlayerContext.tsx");
  const mini = read("components/MusicMiniPlayer.tsx");
  const video = read("components/NativeVideoPlayer.tsx");
  assert.match(layout, /MusicPlayerProvider/);
  assert.match(layout, /MusicMiniPlayer/);
  assert.match(player, /staysActiveInBackground:\s*true/);
  assert.match(player, /expo-av/);
  assert.match(mini, /useMusicPlayer/);
  assert.match(video, /pauseForVideo|expo-av/);
});

test("Phase 3I Android background audio permissions configured", () => {
  const appJson = JSON.parse(read("app.json"));
  assert.ok(appJson.expo.ios.infoPlist.UIBackgroundModes.includes("audio"));
  assert.ok(
    appJson.expo.android.permissions.includes(
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
    ),
  );
  assert.equal(appJson.expo.android.package, "com.flexa.market");
});

test("Phase 3I localization keys exist for en/ht/fr/es", () => {
  const lang = read("context/LanguageContext.tsx");
  for (const key of ["tvTitle", "musicTitle", "musicUploadTitle", "tvUploadBlocked", "musicFreeNote"]) {
    assert.match(lang, new RegExp(`${key}:`));
  }
  assert.match(lang, /tvTitle:\s*"Flexa TV"/);
});

test("Phase 3I inventory marks TV + Music FULLY_NATIVE and recounts", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["flexa-tv"].status, "FULLY_NATIVE");
  assert.equal(byId["flexa-music"].status, "FULLY_NATIVE");
  assert.equal(byId["music-purchase"].status, "BLOCKED");
  assert.ok(inv.summaryCounts.FULLY_NATIVE >= 58);
  assert.ok(inv.summaryCounts.MISSING <= 12);
  assert.ok(inv.summaryCounts.BLOCKED >= 4);
  assert.ok(inv.verification?.phase3i);
});

test("Phase 3I backend still has TV admin upload and music commerce (not used by Android UI)", () => {
  const tv = fs.readFileSync(path.join(apiRoot, "src/routes/tv.ts"), "utf8");
  const music = fs.readFileSync(path.join(apiRoot, "src/routes/music.ts"), "utf8");
  assert.match(tv, /\/admin\/tv\/upload-video/);
  assert.match(music, /\/music\/:id\/buy/);
  assert.match(music, /\/music\/artist\/subscribe/);
});

test("Phase 3I deep links still resolve Flexa TV and Music", () => {
  const deep = read("lib/notificationDeepLink.ts");
  const notif = read("lib/notificationsApi.ts");
  assert.match(deep, /return "\/tv"/);
  assert.match(notif, /return "\/tv"/);
});
