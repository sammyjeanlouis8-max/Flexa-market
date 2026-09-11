import { describe, expect, it } from "vitest";
import { canCopyVideo, type VideoProbeStream } from "../lib/videoCopyPolicy";

const video: VideoProbeStream = {
  codec_type: "video", codec_name: "h264", profile: "High", pix_fmt: "yuv420p",
  field_order: "progressive",
  width: 640, height: 360, level: 31, avg_frame_rate: "30/1", r_frame_rate: "30/1",
  sample_aspect_ratio: "1:1", bit_rate: "1000000",
};
const audio: VideoProbeStream = {
  codec_type: "audio", codec_name: "aac", profile: "LC", channels: 2, sample_rate: "48000",
};

describe("conservative video stream-copy selection", () => {
  it("accepts known compatible H.264/AAC", () => expect(canCopyVideo([video, audio])).toBe(true));
  it.each([
    { codec_name: "hevc" }, { pix_fmt: "yuv420p10le" }, { width: 1920 },
    { field_order: "tt" }, { field_order: "unknown" }, { field_order: undefined },
    { width: 639 }, { avg_frame_rate: "60/1" }, { r_frame_rate: "60/1" },
    { avg_frame_rate: "0/0" }, { sample_aspect_ratio: "4:3" },
    { bit_rate: undefined }, { bit_rate: "8000000" }, { level: 51 },
    { color_transfer: "smpte2084" }, { color_primaries: "bt2020" },
    { tags: { rotate: "90" } }, { side_data_list: [{ rotation: -90 }] },
    { side_data_list: [{ side_data_type: "Display Matrix" }] },
  ])("transcodes incompatible/uncertain video %j", patch => {
    expect(canCopyVideo([{ ...video, ...patch }, audio])).toBe(false);
  });
  it.each([{ codec_name: "opus" }, { channels: 6 }, { sample_rate: "8000" }, { profile: "HE-AAC" }])(
    "transcodes incompatible audio %j", patch => expect(canCopyVideo([video, { ...audio, ...patch }])).toBe(false),
  );
  it("normalizes silent and multitrack sources", () => {
    expect(canCopyVideo([video])).toBe(false);
    expect(canCopyVideo([video, audio, audio])).toBe(false);
    expect(canCopyVideo([])).toBe(false);
  });
});