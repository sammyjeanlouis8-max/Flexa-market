import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimPromoPlayback,
  getPromoPlaybackOwner,
  isPromoPlaybackOwner,
  playPromoIfOwner,
  registerPromoVideo,
  releasePromoPlayback,
  resetPromoVideoPlayerControllerForTests,
  silenceAllPromoVideos,
  silencePromoVideo,
  unregisterPromoVideo,
} from "../../../marketplace/src/lib/promoVideoPlayerController";

function mockVideo(overrides: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  const el = {
    muted: false,
    paused: false,
    pause: vi.fn(function (this: { paused: boolean; muted: boolean }) {
      this.paused = true;
    }),
    play: vi.fn(function (this: { paused: boolean }) {
      this.paused = false;
      return Promise.resolve();
    }),
    ...overrides,
  };
  return el as unknown as HTMLVideoElement;
}

afterEach(() => {
  resetPromoVideoPlayerControllerForTests();
});

describe("promoVideoPlayerController — exclusive audio", () => {
  it("silences Video A when Video B claims playback (A→B)", () => {
    const a = mockVideo();
    const b = mockVideo();
    registerPromoVideo(1, a);
    registerPromoVideo(2, b);

    expect(claimPromoPlayback(1, a, 1)).toBe(true);
    a.muted = false;
    void playPromoIfOwner(1, a, 1);

    expect(claimPromoPlayback(2, b, 1)).toBe(true);
    expect(a.pause).toHaveBeenCalled();
    expect(a.muted).toBe(true);
    expect(isPromoPlaybackOwner(1, 1)).toBe(false);
    expect(isPromoPlaybackOwner(2, 1)).toBe(true);

    void playPromoIfOwner(2, b, 1);
    expect(b.play).toHaveBeenCalled();
  });

  it("rejects stale play() after B→C ownership moves", () => {
    const b = mockVideo();
    const c = mockVideo();
    registerPromoVideo(2, b);
    registerPromoVideo(3, c);

    claimPromoPlayback(2, b, 5);
    claimPromoPlayback(3, c, 1);

    expect(playPromoIfOwner(2, b, 5)).toBeNull();
    expect(b.play).not.toHaveBeenCalled();
    expect(playPromoIfOwner(3, c, 1)).not.toBeNull();
  });

  it("rapid scroll cancels obsolete play for prior generations", () => {
    const a = mockVideo();
    registerPromoVideo(10, a);

    claimPromoPlayback(10, a, 1);
    claimPromoPlayback(10, a, 2); // same card re-activated with new generation
    expect(isPromoPlaybackOwner(10, 1)).toBe(false);
    expect(isPromoPlaybackOwner(10, 2)).toBe(true);
    expect(playPromoIfOwner(10, a, 1)).toBeNull();
  });

  it("returning to a previous video requires a fresh claim", () => {
    const a = mockVideo();
    const b = mockVideo();
    registerPromoVideo(1, a);
    registerPromoVideo(2, b);

    claimPromoPlayback(1, a, 1);
    claimPromoPlayback(2, b, 1);
    releasePromoPlayback(2, b, 1);

    expect(playPromoIfOwner(1, a, 1)).toBeNull();
    claimPromoPlayback(1, a, 2);
    expect(playPromoIfOwner(1, a, 2)).not.toBeNull();
  });

  it("release + silenceAll stop audio on exit / background", () => {
    const a = mockVideo({ muted: false });
    const b = mockVideo({ muted: false });
    registerPromoVideo(1, a);
    registerPromoVideo(2, b);
    claimPromoPlayback(1, a, 1);

    silenceAllPromoVideos();
    expect(a.pause).toHaveBeenCalled();
    expect(b.pause).toHaveBeenCalled();
    expect(a.muted).toBe(true);
    expect(b.muted).toBe(true);
    expect(getPromoPlaybackOwner()).toBeNull();
  });

  it("mute preference path still cannot play when not owner", () => {
    const a = mockVideo();
    registerPromoVideo(1, a);
    claimPromoPlayback(1, a, 3);
    releasePromoPlayback(1, a, 3);
    a.muted = false;
    expect(playPromoIfOwner(1, a, 3)).toBeNull();
    expect(a.play).not.toHaveBeenCalled();
  });

  it("failed media load silence does not revive other owners", () => {
    const a = mockVideo();
    const b = mockVideo();
    registerPromoVideo(1, a);
    registerPromoVideo(2, b);
    claimPromoPlayback(1, a, 1);
    claimPromoPlayback(2, b, 1);
    // Active owner may unmute itself for playback; silencing a failed peer
    // must not clear B's ownership.
    b.muted = false;
    silencePromoVideo(a);
    expect(isPromoPlaybackOwner(2, 1)).toBe(true);
    expect(b.muted).toBe(false);
    expect(getPromoPlaybackOwner()?.listingId).toBe(2);
  });

  it("unregister on unmount releases ownership", () => {
    const a = mockVideo();
    registerPromoVideo(9, a);
    claimPromoPlayback(9, a, 1);
    unregisterPromoVideo(9, a);
    expect(getPromoPlaybackOwner()).toBeNull();
    expect(a.pause).toHaveBeenCalled();
  });

  it("stale rejected play promise does not restart after ownership lost", async () => {
    let rejectPlay: ((err: Error) => void) | null = null;
    const a = mockVideo({
      play: vi.fn(() => new Promise<void>((_resolve, reject) => {
        rejectPlay = reject;
      })),
    } as Partial<HTMLVideoElement>);
    const b = mockVideo();
    registerPromoVideo(1, a);
    registerPromoVideo(2, b);

    claimPromoPlayback(1, a, 1);
    const pending = playPromoIfOwner(1, a, 1);
    expect(pending).not.toBeNull();

    claimPromoPlayback(2, b, 1);
    rejectPlay?.(new DOMException("interrupted", "AbortError"));
    await expect(pending!).resolves.toBeUndefined();
    // Video A must not have been re-played by a stale catch chain.
    expect(a.play).toHaveBeenCalledTimes(1);
  });
});
