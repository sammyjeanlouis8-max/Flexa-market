import assert from "node:assert/strict";
import test from "node:test";

/**
 * Mirrors appPath / shouldHardNavigate decision rules without importing
 * Vite/wouter browser modules under node:test.
 */

function appPath(baseUrl: string, path: string): string {
  const base = (baseUrl ?? "/").replace(/\/$/, "");
  if (!path.startsWith("/")) return `${base}/${path}`;
  return `${base}${path}`;
}

function shouldHardNavigate(isNative: boolean, forceHard = false): boolean {
  return forceHard || isNative;
}

test("appPath joins BASE_URL without double slashes", () => {
  assert.equal(appPath("/", "/auth/login"), "/auth/login");
  assert.equal(appPath("", "/auth/login"), "/auth/login");
  assert.equal(appPath("/app/", "/auth/login"), "/app/auth/login");
  assert.equal(appPath("/app", "auth/login"), "/app/auth/login");
});

test("shouldHardNavigate is native/forced only", () => {
  assert.equal(shouldHardNavigate(false, false), false);
  assert.equal(shouldHardNavigate(true, false), true);
  assert.equal(shouldHardNavigate(false, true), true);
  assert.equal(shouldHardNavigate(true, true), true);
});
