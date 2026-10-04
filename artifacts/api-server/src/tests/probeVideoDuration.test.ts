import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeVideoDuration } from "../../../marketplace/src/lib/probeVideoDuration";

let video: {
  duration: number;
  onloadedmetadata: null | (() => void);
  onerror: null | (() => void);
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
};
const file = new Blob(["video"], { type: "video/quicktime" }) as File;
let revoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  video = { duration: 45, onloadedmetadata: null, onerror: null,
    load: vi.fn(), removeAttribute: vi.fn() };
  revoke = vi.fn();
  vi.stubGlobal("document", { createElement: vi.fn(() => video) });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:phone-video"), revokeObjectURL: revoke });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("bounded phone-video metadata probe", () => {
  it("explicitly loads metadata and returns a readable duration", async () => {
    const result = probeVideoDuration(file);
    expect(video.load).toHaveBeenCalledOnce();
    video.onloadedmetadata!();
    expect(await result).toBe(45);
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:phone-video");
    expect(video.removeAttribute).toHaveBeenCalledWith("src");
    expect(video.onloadedmetadata).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows server probing when Safari never fires metadata or error", async () => {
    const result = probeVideoDuration(file);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toBeNaN();
    expect(revoke).toHaveBeenCalledOnce();
    expect(video.onerror).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows a server-convertible MOV when the browser cannot decode it", async () => {
    const result = probeVideoDuration(file);
    video.onerror!();
    expect(await result).toBeNaN();
    expect(revoke).toHaveBeenCalledOnce();
  });

  it.each([Infinity, NaN, 0, -1])("defers invalid duration %s to the authoritative server", async duration => {
    video.duration = duration;
    const result = probeVideoDuration(file);
    video.onloadedmetadata!();
    expect(await result).toBeNaN();
  });

  it("retains a readable over-limit duration for client rejection", async () => {
    video.duration = 301;
    const result = probeVideoDuration(file);
    video.onloadedmetadata!();
    expect(await result).toBe(301);
  });

  it("settles once and releases the decoder even after a late event", async () => {
    const result = probeVideoDuration(file);
    const lateEvent = video.onloadedmetadata!;
    await vi.advanceTimersByTimeAsync(10_000);
    lateEvent();
    expect(await result).toBeNaN();
    expect(revoke).toHaveBeenCalledOnce();
    expect(video.load).toHaveBeenCalledTimes(2);
  });

  it("does not leave the form waiting if the local media API throws", async () => {
    video.load.mockImplementation(() => { throw new Error("Decoder unavailable"); });
    expect(await probeVideoDuration(file)).toBeNaN();
    expect(revoke).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});