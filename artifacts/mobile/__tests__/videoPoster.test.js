/**
 * Smoke checks for Video Promo poster helpers (no RN runtime).
 */
const assert = require("assert");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

const home = read("app/(tabs)/index.tsx");
assert.match(home, /VideoPoster/, "home Video Promo must render VideoPoster");
assert.doesNotMatch(
  home,
  /promoThumb[\s\S]{0,80}Feather name="play"/,
  "home must not use the old black play-only thumb",
);

const poster = read("components/VideoPoster.tsx");
assert.match(poster, /thumbnailUrl/, "VideoPoster accepts thumbnailUrl");
assert.match(poster, /productPhotoUrl/, "VideoPoster accepts productPhotoUrl");
assert.match(poster, /#E8EEF5/, "light placeholder color");

const player = read("components/NativeVideoPlayer.tsx");
assert.match(player, /posterUrl/, "NativeVideoPlayer accepts posterUrl");
assert.match(player, /VideoPoster/, "NativeVideoPlayer shows VideoPoster before play");

const media = read("lib/mediaUrl.ts");
assert.match(media, /absoluteMediaUrl/, "absoluteMediaUrl helper exists");

console.log("videoPoster.test.js OK");
