import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd());

test("mobile safety API covers hide, block, unblock, and report endpoints", () => {
  const src = readFileSync(join(root, "lib/safetyApi.ts"), "utf8");
  assert.match(src, /\/listings\/\$\{listingId\}\/hide/);
  assert.match(src, /\/users\/\$\{sellerId\}\/hide-listings/);
  assert.match(src, /\/users\/me\/hides/);
  assert.match(src, /\/users\/me\/blocks/);
  assert.match(src, /\/users\/\$\{userId\}\/block/);
  assert.match(src, /\/reports/);
  assert.match(src, /report:\s*opts\.report === true/);
});

test("native chat exposes Block and Block and report without requiring a report on plain block", () => {
  const src = readFileSync(join(root, "app/chat/[id].tsx"), "utf8");
  assert.match(src, /Block and report/);
  assert.match(src, /runBlock\(false\)/);
  assert.match(src, /runBlock\(true\)/);
  assert.match(src, /report:\s*false/);
  assert.match(src, /messagingBlocked/);
});

test("settings can restore hidden products and unblock accounts", () => {
  const src = readFileSync(join(root, "app/settings.tsx"), "utf8");
  assert.match(src, /fetchMyBlocks/);
  assert.match(src, /fetchMyHides/);
  assert.match(src, /unhideListing/);
  assert.match(src, /unhideSellerListings/);
  assert.match(src, /unblockUser/);
});
