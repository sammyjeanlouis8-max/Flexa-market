import assert from "node:assert/strict";
import { test } from "node:test";
import { isPersistableLanguage, PERSISTABLE_LANGUAGES } from "./persistLanguage";

test("core marketplace languages can be persisted on the user profile", () => {
  for (const code of ["en", "fr", "ht"] as const) {
    assert.equal(isPersistableLanguage(code), true);
  }
  assert.ok(PERSISTABLE_LANGUAGES.includes("en"));
  assert.ok(PERSISTABLE_LANGUAGES.includes("fr"));
  assert.ok(PERSISTABLE_LANGUAGES.includes("ht"));
});

test("rejects unknown language codes", () => {
  assert.equal(isPersistableLanguage("xx"), false);
  assert.equal(isPersistableLanguage(""), false);
});
