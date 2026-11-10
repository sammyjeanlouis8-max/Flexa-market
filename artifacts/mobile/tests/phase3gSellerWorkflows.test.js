"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Phase 3G KYC is native multipart submit (no auto-approve)", () => {
  const screen = read("app/kyc.tsx");
  const api = read("lib/kycApi.ts");
  assert.doesNotMatch(screen, /NativePlaceholder|WebView|react-native-webview/);
  assert.match(api, /\/kyc\/status/);
  assert.match(api, /\/kyc\/submit/);
  assert.match(api, /FormData/);
  assert.match(screen, /pending admin review|admin review/i);
});

test("Phase 3G store manager + manager dashboard native", () => {
  const store = read("app/store-manager.tsx");
  const manager = read("app/manager.tsx");
  const api = read("lib/storeManagerApi.ts");
  assert.doesNotMatch(store, /NativePlaceholder/);
  assert.doesNotMatch(manager, /NativePlaceholder/);
  assert.match(api, /\/seller\/manager\/invite/);
  assert.match(api, /\/manager\/orders/);
  assert.match(api, /\/ready/);
});

test("Phase 3G sell drafts + chunked video upload", () => {
  const drafts = read("lib/sellDrafts.ts");
  const sell = read("app/(tabs)/sell.tsx");
  const chunk = read("lib/chunkedVideoUpload.ts");
  assert.match(drafts, /flexa_sell_draft_v2/);
  assert.match(sell, /saveSellDraft|loadSellDraft/);
  assert.match(sell, /uploadChunkedVideo/);
  assert.match(chunk, /chunk-init/);
  assert.match(chunk, /VIDEO_CHUNK_SIZE_BYTES/);
  assert.match(chunk, /8 \* 1024 \* 1024/);
});

test("Phase 3G boost draft builder does not launch paid campaigns", () => {
  const create = read("app/boost-create.tsx");
  const api = read("lib/boosterApi.ts");
  assert.match(create, /createBoosterDraft/);
  assert.match(create, /Draft only|no charge|draft/i);
  assert.match(api, /mode: "draft"/);
  assert.doesNotMatch(api, /mode: "launch"/);
  assert.doesNotMatch(create, /NativePlaceholder/);
});

test("Phase 3G variations blocker documented via itemSize only", () => {
  const sell = read("app/(tabs)/sell.tsx");
  const api = read("lib/sellerApi.ts");
  assert.match(sell, /itemSize|Size \/ variant/);
  assert.match(api, /itemSize/);
  assert.doesNotMatch(api, /\/variants/);
});

test("Phase 3G inventory statuses", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId.kyc.status, "FULLY_NATIVE");
  assert.equal(byId["seller-registration"].status, "FULLY_NATIVE");
  assert.equal(byId["store-manager"].status, "FULLY_NATIVE");
  assert.equal(byId.drafts.status, "FULLY_NATIVE");
  assert.equal(byId["video-upload"].status, "FULLY_NATIVE");
  assert.equal(byId.boost.status, "PARTIALLY_NATIVE");
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.ok(inv.verification?.phase3g);
});
