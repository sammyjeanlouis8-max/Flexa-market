import assert from "node:assert/strict";
import test from "node:test";
import { isChunkError } from "../src/lib/chunkError.ts";

test("only dynamic module failures call for a full document reload", () => {
  for (const message of [
    "Failed to fetch dynamically imported module: https://flexamarket.com/assets/VideoFeed-123.js",
    "Importing a module script failed.",
    "Loading chunk 42 failed.",
    "Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of text/html",
  ]) {
    assert.equal(isChunkError(new Error(message)), true, message);
  }
  assert.equal(isChunkError({ name: "ChunkLoadError", message: "missing" }), true);
});

test("ordinary loading errors cannot restart the WebView", () => {
  for (const message of [
    "Load failed",
    "Failed to load",
    "Failed to load video",
    "MIME type of image/png is unsupported",
    "Failed to load wallet balance",
  ]) {
    assert.equal(isChunkError(new Error(message)), false, message);
  }
  assert.equal(isChunkError(null), false);
});