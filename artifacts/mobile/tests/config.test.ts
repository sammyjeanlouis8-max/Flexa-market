import assert from "node:assert/strict";
import test from "node:test";

import {
  getApiBaseUrl,
  getApiOrigin,
  getWebsiteOrigin,
  NATIVE_APP_PHASE,
} from "../lib/config.ts";

test("native phase constant is Phase 1", () => {
  assert.equal(NATIVE_APP_PHASE, "1");
});

test("API helpers share the same HTTPS origin", () => {
  const origin = getApiOrigin();
  assert.match(origin, /^https:\/\//);
  assert.equal(getApiBaseUrl(), `${origin}/api`);
  assert.equal(getWebsiteOrigin(), origin);
  assert.doesNotMatch(origin, /\/$/);
});

test("EXPO_PUBLIC_DOMAIN shapes the production host when set", () => {
  const previous = process.env.EXPO_PUBLIC_DOMAIN;
  process.env.EXPO_PUBLIC_DOMAIN = "flexamarket.com";
  try {
    assert.equal(getApiOrigin(), "https://flexamarket.com");
    assert.equal(getApiBaseUrl(), "https://flexamarket.com/api");
  } finally {
    if (previous === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
    else process.env.EXPO_PUBLIC_DOMAIN = previous;
  }
});
