import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const webSrc = readFileSync(
  join(here, "../../../marketplace/src/lib/musicAdBreak.ts"),
  "utf8",
);
const mobileSrc = readFileSync(
  join(here, "../../../mobile/lib/musicAdBreak.ts"),
  "utf8",
);
const musicStoreSrc = readFileSync(
  join(here, "../../../marketplace/src/lib/musicStore.ts"),
  "utf8",
);
const flexaMusicSrc = readFileSync(
  join(here, "../../../marketplace/src/pages/FlexaMusic.tsx"),
  "utf8",
);
const musicPlayerSrc = readFileSync(
  join(here, "../../../mobile/lib/musicPlayer.ts"),
  "utf8",
);

describe("Flexa Music sponsored ad break contract", () => {
  it("uses a 10-song natural-completion counter on web and native", () => {
    expect(webSrc).toMatch(/SONGS_PER_AD = 10/);
    expect(mobileSrc).toMatch(/SONGS_PER_AD = 10/);
    expect(webSrc).toMatch(/incrementCompletedSong/);
    expect(mobileSrc).toMatch(/recordNaturalSongCompletion/);
  });

  it("hooks natural ended handlers (not skips) into the ad break", () => {
    expect(musicStoreSrc).toMatch(/maybeStartMusicAdBreak/);
    expect(flexaMusicSrc).toMatch(/maybeStartMusicAdBreak/);
    expect(musicPlayerSrc).toMatch(/didJustFinish/);
    expect(musicPlayerSrc).toMatch(/recordNaturalSongCompletion/);
  });

  it("requires audio/video creatives for music ads", () => {
    expect(webSrc).toMatch(/requireAudio/);
    expect(mobileSrc).toMatch(/requireAudio=1/);
  });

  it("persists Recent Sponsored Ads history privately on-device", () => {
    expect(webSrc).toMatch(/MUSIC_AD_HISTORY_KEY/);
    expect(webSrc).toMatch(/clearSponsoredHistory/);
    expect(mobileSrc).toMatch(/clearSponsoredAdHistory/);
    expect(mobileSrc).toMatch(/heardInBackground/);
  });
});
