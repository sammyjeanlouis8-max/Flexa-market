/**
 * Assert Flexa Music marketplace surface without marketplace vitest.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const musicStore = readFileSync(new URL("../../../marketplace/src/lib/musicStore.ts", import.meta.url), "utf8");
const musicBridge = readFileSync(new URL("../../../marketplace/src/lib/musicNativeBridge.ts", import.meta.url), "utf8");
const flexaMusic = readFileSync(new URL("../../../marketplace/src/pages/FlexaMusic.tsx", import.meta.url), "utf8");
const library = readFileSync(new URL("../../../marketplace/src/components/music/MusicLibraryPanel.tsx", import.meta.url), "utf8");
const artistPage = readFileSync(new URL("../../../marketplace/src/pages/MusicArtist.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../../../marketplace/src/App.tsx", import.meta.url), "utf8");
const musicRoute = readFileSync(new URL("../routes/music.ts", import.meta.url), "utf8");

describe("music marketplace surface", () => {
  it("persists playback queue/position and records plays", () => {
    expect(musicStore).toContain('export const MUSIC_PLAYBACK_KEY = "flexa_music_playback_v1"');
    expect(musicStore).toContain("function restorePlayback");
    expect(musicStore).toContain("export function musicRecordPlay");
    expect(musicStore).toContain("/api/music/${trackId}/play");
  });

  it("uses the stream-url path shape expected by the API", () => {
    expect(musicBridge).toContain("/api/music/stream-url/${encodeURIComponent(String(track.id))}");
    expect(musicBridge).not.toContain("/api/music/stream-url?id=");
  });

  it("ships library, artist route, genre chips, report, and repost UI", () => {
    expect(flexaMusic).toContain("genreFilter");
    expect(flexaMusic).toContain("MusicLibraryPanel");
    expect(flexaMusic).toContain("/api/music/${track.id}/report");
    expect(flexaMusic).toContain("/api/music/${track.id}/repost");
    expect(flexaMusic).toContain("MUSIC_COMMERCE_ENABLED &&");
    expect(library).toContain("/api/music/playlists");
    expect(library).toContain("/api/music/history");
    expect(artistPage).toContain("/api/music/artist/");
    expect(app).toContain('path="/music/artist/:userId"');
  });

  it("rate-limits comment, play, and upload mutations", () => {
    expect(musicRoute).toContain("allowWithinWindow(musicCommentLog");
    expect(musicRoute).toContain("allowWithinWindow(musicPlayLog");
    expect(musicRoute).toContain("allowWithinWindow(musicUploadLog");
    expect(musicRoute).toContain('error: "RATE_LIMIT"');
  });
});
