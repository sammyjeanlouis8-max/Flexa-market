import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const musicSrc = readFileSync(join(here, "../routes/music.ts"), "utf8");
const homeSrc = readFileSync(
  join(here, "../../../marketplace/src/components/music/MusicHome.tsx"),
  "utf8",
);

describe("public Flexa Music playlists + redesign home", () => {
  it("exposes public playlist list and detail routes before :id", () => {
    expect(musicSrc).toMatch(/router\.get\("\/music\/playlists"/);
    expect(musicSrc).toMatch(/router\.get\("\/music\/playlists\/:id"/);
    expect(musicSrc).toMatch(/router\.get\("\/music\/library"/);
    const playlistsIdx = musicSrc.indexOf('router.get("/music/playlists"');
    const wildcardIdx = musicSrc.indexOf('router.get("/music/:id"');
    expect(playlistsIdx).toBeGreaterThan(-1);
    expect(wildcardIdx).toBeGreaterThan(playlistsIdx);
  });

  it("Music Home uses playlists list, featured play/favorite, and search", () => {
    expect(homeSrc).toMatch(/data-testid="music-home-redesign"/);
    expect(homeSrc).toMatch(/data-testid="music-featured-track"/);
    expect(homeSrc).toMatch(/data-testid="music-featured-play"/);
    expect(homeSrc).toMatch(/data-testid="music-featured-favorite"/);
    expect(homeSrc).toMatch(/data-testid="music-playlists-list"/);
    expect(homeSrc).toMatch(/data-testid="music-add-music"/);
    expect(homeSrc).toMatch(/Recent searches/);
    expect(homeSrc).toMatch(/normalize\("NFD"\)/);
  });
});
