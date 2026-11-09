import { beforeEach, describe, expect, it } from "vitest";
import {
  isAudioUnlocked,
  isUserMutedPreference,
  preferUnmutedAutoplay,
  setAudioUnlocked,
  setUserMutedPreference,
} from "./audioUnlocked";

describe("audioUnlocked preferences", () => {
  beforeEach(() => {
    setAudioUnlocked(false);
    setUserMutedPreference(false);
    try {
      sessionStorage.removeItem("flexaAudioUnlocked");
      sessionStorage.removeItem("flexaUserMuted");
    } catch { /* ignore */ }
  });

  it("prefers unmuted autoplay until the viewer mutes", () => {
    expect(preferUnmutedAutoplay(false)).toBe(true);
    setAudioUnlocked(true);
    expect(preferUnmutedAutoplay(false)).toBe(true);
  });

  it("honors explicit user mute across unlock", () => {
    setAudioUnlocked(true);
    setUserMutedPreference(true);
    expect(isUserMutedPreference()).toBe(true);
    expect(isAudioUnlocked()).toBe(true);
    expect(preferUnmutedAutoplay(true)).toBe(false);
  });
});
