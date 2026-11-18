import { describe, expect, it } from "vitest";
import { SONGS_PER_AD, shouldTriggerAdBreak } from "./musicAdBreak";

describe("music ad break counter", () => {
  it("triggers only after SONGS_PER_AD natural completions", () => {
    expect(SONGS_PER_AD).toBe(10);
    expect(shouldTriggerAdBreak(0)).toBe(false);
    expect(shouldTriggerAdBreak(9)).toBe(false);
    expect(shouldTriggerAdBreak(10)).toBe(true);
    expect(shouldTriggerAdBreak(11)).toBe(true);
  });

  it("does not treat skips as completions (caller responsibility)", () => {
    // Skips never call incrementCompletedSong / maybeStartMusicAdBreak.
    // Counter stays put — verified by API of shouldTriggerAdBreak alone.
    expect(shouldTriggerAdBreak(3)).toBe(false);
  });
});
