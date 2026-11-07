import assert from "node:assert/strict";
import test from "node:test";
import { parseFlexaMusicMessage } from "../native/musicBridgeProtocol.ts";

test("accepts flexa-music play/pause/seek/load/queue/stop envelopes", () => {
  for (const action of ["play", "pause", "seek", "load", "queue", "stop"] as const) {
    const parsed = parseFlexaMusicMessage(JSON.stringify({
      type: "flexa-music",
      action,
      position: action === "seek" ? 12.5 : undefined,
      track: { id: 7, title: "Ayiti", artist: "Flexa", audio_url: "https://flexamarket.com/a.mp3" },
      queue: action === "queue"
        ? [{ id: 1, title: "A", artist: "B", url: "https://flexamarket.com/a.mp3" }]
        : undefined,
    }));
    assert.equal(parsed?.type, "flexa-music");
    assert.equal(parsed?.action, action);
  }
});

test("parses seek position and track url fields", () => {
  const parsed = parseFlexaMusicMessage(JSON.stringify({
    type: "flexa-music",
    action: "seek",
    position: 42,
    url: "https://flexamarket.com/api/music/stream-url?id=9",
    track: { id: 9, title: "T", artist: "A" },
  }));
  assert.equal(parsed?.position, 42);
  assert.equal(parsed?.url, "https://flexamarket.com/api/music/stream-url?id=9");
  assert.equal(parsed?.track?.id, 9);
});

test("rejects non-bridge and malformed music messages", () => {
  assert.equal(parseFlexaMusicMessage("{"), null);
  assert.equal(parseFlexaMusicMessage(JSON.stringify({ type: "AUTH_TOKEN", token: "x" })), null);
  assert.equal(parseFlexaMusicMessage(JSON.stringify({
    type: "flexa-upload", requestId: "r", action: "status", jobId: "j",
  })), null);
  assert.equal(parseFlexaMusicMessage(JSON.stringify({
    type: "flexa-music", action: "explode",
  })), null);
  assert.equal(parseFlexaMusicMessage(JSON.stringify({
    type: "flexa-music",
  })), null);
});
