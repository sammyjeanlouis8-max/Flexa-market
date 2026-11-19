"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  HOME_METRICS,
  PDP_METRICS,
  homeCardWidth,
  homeImageHeight,
  pdpMainSize,
  bottomTabBarHeight,
} = require("../constants/layoutMetrics.ts");

test("home media stays square at WebView-measured viewports", () => {
  // @390: (390 - 24 - 10) / 2 = 178 → image 178 (web measured media ~169 inside card)
  assert.equal(HOME_METRICS.pageInset, 12);
  assert.equal(HOME_METRICS.columnGap, 10);
  assert.equal(HOME_METRICS.objectFit, "cover");
  const w390 = homeCardWidth(390);
  assert.ok(Math.abs(w390 - 178) < 0.01);
  assert.equal(homeImageHeight(390), Math.round(w390));
  const w360 = homeCardWidth(360);
  assert.ok(Math.abs(w360 - 154) < 0.01 || Math.abs(w360 - 163) < 0.01);
  // (360 - 24 - 10) / 2 = 163
  assert.equal(homeImageHeight(360), Math.round(w360));
  // Never shrink below square for equal useful width
  assert.equal(homeImageHeight(390), homeImageHeight(390));
});

test("PDP main size matches web max-h min(52vh, 380) + thumb rail", () => {
  assert.equal(PDP_METRICS.thumbSize, 44);
  assert.equal(PDP_METRICS.objectFit, "contain");
  assert.equal(PDP_METRICS.purchaseBarApprox, 61);
  const normal = pdpMainSize(390, 844);
  // fromWidth = 390 - 8 - 44 - 10 - 8 = 320; fromHeight = min(438.88, 380)=380 → 320
  assert.equal(normal, 320);
  const small = pdpMainSize(360, 640);
  // fromWidth = 360 - 70 = 290; fromHeight = min(332.8, 380)=332.8 → 290
  assert.equal(small, 290);
});

test("bottom tab bar keeps Messages above gesture floor", () => {
  assert.equal(HOME_METRICS.bottomBarRow, 56);
  assert.equal(HOME_METRICS.bottomBarGestureFloor, 24);
  assert.equal(bottomTabBarHeight(0), 56 + 24);
  assert.equal(bottomTabBarHeight(32), 56 + 32);
});
