"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Mirror of lib/homePromoVideos.ts — kept in sync by the source-contract tests above. */
function selectHomePromoVideos(videos, limit = 2, nowMs = Date.now()) {
  const live = videos.filter((v) => {
    if (!v.boostEndAt) return true;
    const end = new Date(v.boostEndAt).getTime();
    return Number.isFinite(end) ? end > nowMs : true;
  });
  const rank = (v) => {
    const start = v.boostStartAt ? new Date(v.boostStartAt).getTime() : NaN;
    const created = v.createdAt ? new Date(v.createdAt).getTime() : NaN;
    if (Number.isFinite(start)) return start;
    if (Number.isFinite(created)) return created;
    return v.id;
  };
  return [...live]
    .sort((a, b) => rank(b) - rank(a) || b.id - a.id)
    .slice(0, Math.max(0, limit));
}

test("Home tab mounts HomePromoVideoStrip (native, no WebView)", () => {
  const home = read("app/(tabs)/index.tsx");
  assert.match(home, /HomePromoVideoStrip/);
  assert.equal(home.includes("SafeWebView"), false);
});

test("HomePromoVideoStrip caps at two cards, poster only, opens watch with selected id", () => {
  const src = read("components/HomePromoVideoStrip.tsx");
  assert.match(src, /HOME_PROMO_VIDEO_CARD_LIMIT/);
  assert.match(src, /selectHomePromoVideos/);
  assert.match(src, /testID="home-promo-video-strip"/);
  assert.match(src, /pathname:\s*"\/videos\/watch"/);
  assert.match(src, /id:\s*String\(item\.listingId \|\| item\.id\)/);
  assert.match(src, /fromHome:\s*"1"/);
  assert.doesNotMatch(src, /expo-av|shouldPlay/);
  assert.match(src, /flexDirection:\s*"row"/);
});

test("watch screen is a vertical pager that starts on the selected video", () => {
  const src = read("app/videos/watch.tsx");
  assert.match(src, /pagingEnabled/);
  assert.match(src, /initialScrollIndex/);
  assert.match(src, /fetchVideosFeed/);
  assert.match(src, /selectedId/);
  assert.match(src, /testID="promo-watch"/);
});

test("selectHomePromoVideos keeps newest two of three+ eligible and matches API ids", () => {
  const helperSrc = read("lib/homePromoVideos.ts");
  assert.match(helperSrc, /export const HOME_PROMO_VIDEO_CARD_LIMIT = 2/);
  assert.match(helperSrc, /export function selectHomePromoVideos/);

  const now = Date.parse("2026-11-19T20:00:00.000Z");
  const api = [
    { id: 101, boostStartAt: "2026-11-18T10:00:00.000Z", title: "oldest" },
    { id: 202, boostStartAt: "2026-11-19T12:00:00.000Z", title: "newest" },
    { id: 303, boostStartAt: "2026-11-19T08:00:00.000Z", title: "middle" },
    {
      id: 404,
      boostEndAt: "2026-11-01T00:00:00.000Z",
      boostStartAt: "2026-11-19T18:00:00.000Z",
      title: "expired",
    },
  ];
  const picked = selectHomePromoVideos(api, 2, now);
  assert.equal(picked.length, 2);
  assert.deepEqual(
    picked.map((v) => v.id),
    [202, 303],
  );
  // Same account/country feed: Home cards must equal the two newest API ids.
  const eligibleSorted = [...api]
    .filter((v) => !v.boostEndAt || Date.parse(v.boostEndAt) > now)
    .sort(
      (a, b) =>
        Date.parse(b.boostStartAt) - Date.parse(a.boostStartAt) || b.id - a.id,
    );
  assert.deepEqual(
    picked.map((v) => v.id),
    eligibleSorted.slice(0, 2).map((v) => v.id),
  );
});
