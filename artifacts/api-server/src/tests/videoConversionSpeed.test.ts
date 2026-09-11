import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it } from "vitest";
import { convertVideoFileToH264 } from "../lib/videoConvert";

// Requires the same ffmpeg/ffprobe binaries used by the production converter.
const dir = mkdtempSync(join(tmpdir(), "flexa-conversion-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
function ffmpeg(args: string[]) {
  execFileSync(process.env.FFMPEG_PATH ?? "ffmpeg", ["-y", "-v", "error", ...args], { timeout: 120000 });
}
function probe(path: string) {
  return JSON.parse(execFileSync(process.env.FFPROBE_PATH ?? "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], { encoding: "utf8" }));
}
function packets(path: string) {
  return execFileSync(process.env.FFPROBE_PATH ?? "ffprobe", [
    "-v", "error", "-show_packets", "-show_data_hash", "sha256",
    "-show_entries", "packet=stream_index,data_hash", "-of", "csv=p=0", path,
  ], { encoding: "utf8" }).trim().split("\n").sort();
}

describe("real ffmpeg conversion", () => {
  it("preserves packets on fast path, faststart, duration and audio; compares old transcode time", async () => {
    const source = join(dir, "source.mp4"), fast = join(dir, "fast.mp4"), normal = join(dir, "normal.mp4");
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=640x360:rate=30", "-f", "lavfi",
      "-i", "sine=frequency=440:sample_rate=48000", "-t", "12", "-c:v", "libx264",
      "-threads", "2", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", source]);
    const start = performance.now();
    await convertVideoFileToH264(source, fast);
    const fastMs = performance.now() - start;
    const startNormal = performance.now();
    await convertVideoFileToH264(source, normal, { forceTranscode: true });
    const transcodeMs = performance.now() - startNormal;
    console.info(JSON.stringify({ benchmark: "12s 640x360 H264/AAC", fastMs, transcodeMs }));
    expect(packets(fast)).toEqual(packets(source));
    expect(Number(probe(fast).format.duration)).toBeCloseTo(Number(probe(source).format.duration), 1);
    const bytes = readFileSync(fast);
    expect(bytes.indexOf(Buffer.from("moov"))).toBeLessThan(bytes.indexOf(Buffer.from("mdat")));
    ffmpeg(["-i", fast, "-f", "null", "-"]);
  }, 120000);

  it("still transcodes silent non-H264 input and creates AAC audio", async () => {
    const source = join(dir, "silent.webm"), output = join(dir, "silent.mp4");
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=160x120:rate=15", "-t", "2", "-c:v", "libvpx-vp9", source]);
    await convertVideoFileToH264(source, output);
    const streams = probe(output).streams;
    expect(streams.find((s: any) => s.codec_type === "video").codec_name).toBe("h264");
    expect(streams.find((s: any) => s.codec_type === "audio").codec_name).toBe("aac");
    ffmpeg(["-i", output, "-f", "null", "-"]);
  }, 120000);

  it("does not ignore cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(convertVideoFileToH264(join(dir, "absent.mp4"), join(dir, "aborted.mp4"),
      { signal: controller.signal })).rejects.toThrow();
  });

  it("normalizes interlaced H264 rather than copying it", async () => {
    const source = join(dir, "interlaced.mp4"), output = join(dir, "progressive.mp4");
    ffmpeg(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=30", "-f", "lavfi",
      "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:v", "libx264",
      "-threads", "2", "-flags", "+ilme+ildct", "-x264-params", "tff=1",
      "-c:a", "aac", source]);
    expect(probe(source).streams[0].field_order).not.toBe("progressive");
    await convertVideoFileToH264(source, output);
    expect(probe(output).streams[0].field_order).toBe("progressive");
    expect(packets(output)).not.toEqual(packets(source));
    ffmpeg(["-i", output, "-f", "null", "-"]);
  }, 120000);
});