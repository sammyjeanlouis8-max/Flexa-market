import { describe, expect, it } from "vitest";
import { MUSIC_PLAYBACK_KEY, musicRecordPlay } from "./musicStore";

describe("musicStore playback helpers", () => {
  it("exports the persistence key constant", () => {
    expect(MUSIC_PLAYBACK_KEY).toBe("flexa_music_playback_v1");
  });

  it("exports musicRecordPlay as a function", () => {
    expect(typeof musicRecordPlay).toBe("function");
  });
});
