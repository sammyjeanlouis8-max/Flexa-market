import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const musicRoute = readFileSync(new URL("../routes/music.ts", import.meta.url), "utf8");
const migrations = readFileSync(new URL("../lib/migrations.ts", import.meta.url), "utf8");

describe("music phase 2–5 route surface", () => {
  it("registers named music routes before the /music/:id wildcard", () => {
    const wildcardIdx = musicRoute.lastIndexOf('router.get("/music/:id"');
    expect(wildcardIdx).toBeGreaterThan(0);

    const named = [
      'router.post("/music/impression"',
      'router.get("/music/trending"',
      'router.get("/music/history"',
      'router.get("/music/playlists"',
      'router.post("/music/playlists"',
      'router.get("/music/artist/stats"',
      'router.get("/music/artist/earnings"',
      'router.post("/music/artist/withdraw"',
      'router.get("/music/artist/:userId"',
    ];
    for (const route of named) {
      const idx = musicRoute.indexOf(route);
      expect(idx, route).toBeGreaterThan(0);
      expect(idx, `${route} before /music/:id`).toBeLessThan(wildcardIdx);
    }
  });

  it("exposes play, repost, report, and playlist track mutations", () => {
    expect(musicRoute).toContain('router.post("/music/:id/play"');
    expect(musicRoute).toContain('router.post("/music/:id/repost"');
    expect(musicRoute).toContain('router.get("/music/:id/reposts"');
    expect(musicRoute).toContain('router.post("/music/:id/report"');
    expect(musicRoute).toContain('router.put("/music/playlists/:id"');
    expect(musicRoute).toContain('router.delete("/music/playlists/:id"');
    expect(musicRoute).toContain('router.post("/music/playlists/:id/tracks"');
    expect(musicRoute).toContain('router.delete("/music/playlists/:id/tracks/:trackId"');
  });

  it("enforces copyright declaration and soft-duplicate checks on upload paths", () => {
    expect(musicRoute).toContain("COPYRIGHT_DECLARATION_REQUIRED");
    expect(musicRoute).toContain("POSSIBLE_DUPLICATE");
    expect(musicRoute).toContain("copyright_declared");
    expect(musicRoute).toContain("forceDuplicate");
  });

  it("applies visibility filtering helpers on list/detail/stream", () => {
    expect(musicRoute).toContain("function visibilitySql");
    expect(musicRoute).toContain("visibilitySql(req)");
    expect(musicRoute).toContain("optionalAuth");
  });

  it("accepts timestamp_seconds on comments", () => {
    expect(musicRoute).toContain("timestamp_seconds");
    expect(musicRoute).toContain("INSERT INTO music_comments (track_id, user_id, content, timestamp_seconds)");
  });
});

describe("music phase 2–5 migrations", () => {
  it("adds visibility, history, reposts, and retires auto-activate", () => {
    expect(migrations).toContain("music_comments.timestamp_seconds");
    expect(migrations).toContain("music_tracks.visibility");
    expect(migrations).toContain("music_tracks.content_hash");
    expect(migrations).toContain("music_tracks.copyright_declared");
    expect(migrations).toContain("music_playlists.is_public");
    expect(migrations).toContain("music_listening_history.create");
    expect(migrations).toContain("music_reposts.create");
    expect(migrations).toContain("music_tracks.auto_activate_retired_v1");
    expect(migrations).not.toContain(
      'UPDATE music_tracks SET is_active = TRUE WHERE is_active = FALSE',
    );
  });
});
