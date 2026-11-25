import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirrors MessageThread.normalizeUploadMime — keep in sync when changing voice MIME rules. */
function normalizeUploadMime(raw: string, fallback: string): string {
  const base = String(raw || "").split(";")[0].trim().toLowerCase();
  if (base === "video/mp4" || base === "audio/x-m4a" || base === "audio/aac") {
    return "audio/mp4";
  }
  if (base === "audio/m4a") return "audio/m4a";
  if (base.startsWith("audio/") || base.startsWith("image/") || base.startsWith("video/")) {
    return base;
  }
  return fallback;
}

describe("voice upload MIME normalize", () => {
  it("maps iOS AAC / video-labelled voice to audio/mp4", () => {
    assert.equal(normalizeUploadMime("audio/mp4;codecs=mp4a.40.2", "audio/webm"), "audio/mp4");
    assert.equal(normalizeUploadMime("video/mp4", "audio/webm"), "audio/mp4");
    assert.equal(normalizeUploadMime("audio/x-m4a", "audio/webm"), "audio/mp4");
    assert.equal(normalizeUploadMime("audio/aac", "audio/webm"), "audio/mp4");
  });

  it("keeps webm and falls back when empty", () => {
    assert.equal(normalizeUploadMime("audio/webm;codecs=opus", "audio/mp4"), "audio/webm");
    assert.equal(normalizeUploadMime("", "audio/mp4"), "audio/mp4");
  });
});
