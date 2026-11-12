"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

test("Phase 3G2 resumable chunked video has cancel/retry/session recovery", () => {
  const chunk = read("lib/chunkedVideoUpload.ts");
  assert.match(chunk, /saveVideoUploadSession|loadVideoUploadSession/);
  assert.match(chunk, /resumeUploadId/);
  assert.match(chunk, /receivedChunkIndices/);
  assert.match(chunk, /CHUNK_RETRIES|putChunkWithRetry/);
  assert.match(chunk, /Upload cancelled/);
  const sell = read("app/(tabs)/sell.tsx");
  assert.match(sell, /videoAbort|AbortController/);
  assert.match(sell, /loadVideoUploadSession/);
  const boost = read("app/boost-create.tsx");
  assert.match(boost, /uploadAbort|Cancel upload/);
  assert.match(boost, /depts/);
});

test("Phase 3G2 seller registration hub + KYC still admin-reviewed", () => {
  const reg = read("app/seller-registration.tsx");
  assert.doesNotMatch(reg, /NativePlaceholder|WebView/);
  assert.match(reg, /fetchKycStatus/);
  assert.match(reg, /never auto-approved|not auto-approved/i);
  assert.match(reg, /seller-earnings|store-manager|\/kyc/);
});

test("Phase 3G2 campaigns: filters pause/resume analytics renewal draft-only", () => {
  const my = read("app/my-boosts.tsx");
  assert.match(my, /pauseBoosterCampaign|resumeBoosterCampaign/);
  assert.match(my, /draft|active|paused|expired/);
  assert.match(my, /boost-analytics|Renew as draft/);
  assert.match(my, /Play digital goods|unavailable on Android/);
  assert.ok(fs.existsSync(path.join(root, "app/boost-analytics.tsx")));
  const api = read("lib/sellerApi.ts");
  assert.match(api, /fetchBoosterAnalytics/);
  assert.doesNotMatch(api, /mode:\s*"launch"/);
});

test("Phase 3G2 field-level listing validation + itemSize size/color UX", () => {
  const api = read("lib/sellerApi.ts");
  assert.match(api, /validateListingDraftFields/);
  const sell = read("app/(tabs)/sell.tsx");
  assert.match(sell, /fieldErrors|SIZE_PRESETS|COLOR_PRESETS/);
  assert.match(sell, /multi-SKU|itemSize/i);
});

test("Phase 3G2 drafts hub recovers interrupted video sessions", () => {
  const drafts = read("app/drafts.tsx");
  assert.match(drafts, /loadVideoUploadSession/);
  assert.match(drafts, /Interrupted video upload/);
});

test("Phase 3G2 inventory marks seller-registration fully native", () => {
  const inv = JSON.parse(read("docs/phase3-migration-inventory.json"));
  const byId = Object.fromEntries(inv.features.map((f) => [f.id, f]));
  assert.equal(byId["seller-registration"].status, "FULLY_NATIVE");
  assert.equal(byId.drafts.status, "FULLY_NATIVE");
  assert.equal(byId["video-upload"].status, "FULLY_NATIVE");
  assert.ok(
    byId.boost.status === "PARTIALLY_NATIVE" || byId.boost.status === "FULLY_NATIVE",
  );
  assert.equal(byId["boost-paid"].status, "BLOCKED");
  assert.ok(
    byId["product-variations"].status === "MISSING" ||
      byId["product-variations"].status === "PARTIALLY_NATIVE",
  );
  assert.ok(inv.verification?.phase3g2);
});
