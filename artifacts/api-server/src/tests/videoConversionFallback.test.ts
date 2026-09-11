import { beforeEach, describe, expect, it, vi } from "vitest";

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("child_process", () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: run }),
}));
import { convertVideoFileToH264 } from "../lib/videoConvert";

const streams = [
  { codec_type: "video", codec_name: "h264", profile: "High", pix_fmt: "yuv420p",
    field_order: "progressive", width: 640, height: 360, level: 31,
    avg_frame_rate: "30/1", r_frame_rate: "30/1", sample_aspect_ratio: "1:1", bit_rate: "1000000" },
  { codec_type: "audio", codec_name: "aac", profile: "LC", channels: 2, sample_rate: "48000" },
];
beforeEach(() => run.mockReset());

describe("video remux failure and cancellation", () => {
  it("overwrites a failed remux through the existing transcode path", async () => {
    run.mockResolvedValueOnce({ stdout: JSON.stringify({ streams }) })
      .mockRejectedValueOnce(new Error("remux failed"))
      .mockResolvedValueOnce({ stdout: "" });
    await convertVideoFileToH264("source", "output.mp4");
    expect(run).toHaveBeenCalledTimes(3);
    expect(run.mock.calls[1][1]).toContain("copy");
    expect(run.mock.calls[2][1]).toContain("libx264");
    expect(run.mock.calls[2][1]).toContain("-y");
  });
  it("does not start fallback when cancelled during remux", async () => {
    const controller = new AbortController();
    run.mockResolvedValueOnce({ stdout: JSON.stringify({ streams }) })
      .mockImplementationOnce(async (_binary, _args, options) => {
        expect(options.signal).toBe(controller.signal);
        controller.abort();
        throw new Error("aborted while remuxing");
      });
    await expect(convertVideoFileToH264("source", "output.mp4", { signal: controller.signal }))
      .rejects.toThrow("aborted while remuxing");
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("reports failure if both paths fail", async () => {
    run.mockResolvedValueOnce({ stdout: JSON.stringify({ streams }) })
      .mockRejectedValueOnce(new Error("remux failed"))
      .mockRejectedValueOnce(new Error("transcode failed"));
    await expect(convertVideoFileToH264("source", "output.mp4")).rejects.toThrow("transcode failed");
  });
});