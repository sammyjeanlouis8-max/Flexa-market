import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveNativeStreamUrl } from "./musicNativeBridge";

describe("resolveNativeStreamUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns absolute audio_url as-is", () => {
    expect(
      resolveNativeStreamUrl({
        id: 1,
        title: "A",
        artist: "B",
        cover_url: null,
        audio_url: "https://cdn.example/a.mp3",
      }),
    ).toBe("https://cdn.example/a.mp3");
  });

  it("prefixes relative audio_url with origin", () => {
    vi.stubGlobal("window", { location: { origin: "https://flexa.test" } });
    expect(
      resolveNativeStreamUrl({
        id: 2,
        title: "A",
        artist: "B",
        cover_url: null,
        audio_url: "/api/storage/wasabi-image?key=x",
      }),
    ).toBe("https://flexa.test/api/storage/wasabi-image?key=x");
  });

  it("falls back to stream-url helper when only id is known", () => {
    vi.stubGlobal("window", { location: { origin: "https://flexa.test" } });
    expect(
      resolveNativeStreamUrl({
        id: 42,
        title: "A",
        artist: "B",
        cover_url: null,
        audio_url: null,
      }),
    ).toBe("https://flexa.test/api/music/stream-url?id=42");
  });

  it("returns null when neither url nor id is available", () => {
    expect(
      resolveNativeStreamUrl({
        title: "A",
        artist: "B",
        cover_url: null,
        audio_url: null,
      }),
    ).toBeNull();
  });
});
