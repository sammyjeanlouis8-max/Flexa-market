/**
 * Video conversion helper — uses system ffmpeg to transcode any video to H.264/MP4.
 * Activated for MOV/HEVC (iPhone), WebM, AVI, WMV and other non-H264 formats so
 * videos play on Chrome and Android without extra processing by the uploader.
 * Conversion failures are explicit: callers must not upload the incompatible original
 * while claiming that it is a browser-compatible MP4.
 */
import { execFile } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomUUID } from "crypto";
import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { promisify } from "util";
import { canCopyVideo, type VideoProbeStream } from "./videoCopyPolicy";

const execFileAsync = promisify(execFile);

const PASSTHROUGH_VIDEO_MIMES = new Set(["video/mp4", "video/x-m4v"]);
// Keep a single normalization job from consuming every shared API CPU. The
// upload scheduler also limits concurrent jobs; this is the per-ffmpeg limit.
const FFMPEG_THREADS = Math.max(1, Math.min(2, Number(process.env["VIDEO_FFMPEG_THREADS"] ?? 2) || 2));
const MAX_OUTPUT_EDGE_PX = 1280;

export class VideoDurationExceededError extends Error {
  constructor(
    public readonly durationSeconds: number,
    public readonly maxSeconds: number,
  ) {
    super(`Video duration ${durationSeconds.toFixed(2)}s exceeds the ${maxSeconds}s limit`);
    this.name = "VideoDurationExceededError";
  }
}

export function needsVideoConversion(mime: string): boolean {
  const base = mime.split(";")[0].trim().toLowerCase();
  return base.startsWith("video/") && !PASSTHROUGH_VIDEO_MIMES.has(base);
}

function extFromVideoMime(mime: string): string {
  const map: Record<string, string> = {
    "video/quicktime":  "mov",  "video/x-msvideo": "avi",
    "video/webm":       "webm", "video/x-ms-wmv":  "wmv",
    "video/x-matroska":"mkv",   "video/3gpp":       "3gp",
    "video/mpeg":       "mpeg", "video/x-flv":      "flv",
    "video/hevc":       "mov",  "video/x-hevc":     "hevc",
  };
  return map[mime.split(";")[0].trim().toLowerCase()] ?? "bin";
}

async function probeStreams(inputPath: string, signal?: AbortSignal): Promise<VideoProbeStream[]> {
  const ffprobe = process.env["FFPROBE_PATH"] ?? "ffprobe";
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-show_streams",
    "-of", "json",
    inputPath,
  ], { maxBuffer: 1024 * 1024, timeout: 60_000, signal });
  const result = JSON.parse(stdout) as { streams?: VideoProbeStream[] };
  if (!Array.isArray(result.streams)) throw new Error("Video streams could not be read");
  return result.streams;
}

export async function assertVideoDurationAtMost(
  inputPath: string,
  maxSeconds: number,
  signal?: AbortSignal,
): Promise<number> {
  const ffprobe = process.env["FFPROBE_PATH"] ?? "ffprobe";
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ], { maxBuffer: 1024 * 1024, timeout: 60_000, signal });
  const durationSeconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Video duration could not be read");
  }
  if (durationSeconds > maxSeconds + 0.5) {
    throw new VideoDurationExceededError(durationSeconds, maxSeconds);
  }
  return durationSeconds;
}

/**
 * File-backed conversion used by durable marketplace-video ingestion. The
 * output always contains H.264 video and AAC audio; silent source videos
 * receive a silent AAC track. It caps the long edge without stretching,
 * allowing ffmpeg's default autorotation to turn phone videos into their
 * display orientation before the normalized MP4 is written.
 */
export async function convertVideoFileToH264(
  inputPath: string,
  outputPath: string,
  options: { signal?: AbortSignal; forceTranscode?: boolean } = {},
): Promise<void> {
  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
  const streams = await probeStreams(inputPath, options.signal);
  const hasAudio = streams.some(s => s.codec_type === "audio");
  if (!options.forceTranscode && canCopyVideo(streams)) {
    try {
      // Repackage only: preserve encoded image/audio quality and move the
      // MP4 index to the start so playback need not download the entire file.
      await execFileAsync(ffmpeg, [
        "-y", "-hide_banner", "-loglevel", "error", "-i", inputPath,
        "-map", "0:v:0", "-map", "0:a:0", "-sn", "-dn",
        "-c", "copy", "-movflags", "+faststart", outputPath,
      ], { maxBuffer: 20 * 1024 * 1024, timeout: 60_000, signal: options.signal });
      return;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      // Some containers cannot be remuxed. Overwrite any partial output using
      // the original, bounded transcode path; never serve the partial file.
    }
  }
  const inputs = hasAudio
    ? ["-i", inputPath]
    : [
        "-i", inputPath,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
      ];
  const maps = hasAudio
    ? ["-map", "0:v:0", "-map", "0:a:0"]
    : ["-map", "0:v:0", "-map", "1:a:0", "-shortest"];

  try {
    await execFileAsync(ffmpeg, [
      "-y",
      "-hide_banner", "-loglevel", "error",
      "-threads", String(FFMPEG_THREADS),
      "-filter_threads", "1",
      ...inputs,
      ...maps,
      "-sn", "-dn",
      "-vf",
      `scale=w='min(${MAX_OUTPUT_EDGE_PX},iw)':h='min(${MAX_OUTPUT_EDGE_PX},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`,
      "-c:v", "libx264", "-profile:v", "high", "-level:v", "4.1",
      "-threads", String(FFMPEG_THREADS), "-fpsmax", "30",
      "-crf", "23", "-maxrate", "4M", "-bufsize", "8M", "-preset", "fast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-max_muxing_queue_size", "9999",
      outputPath,
    ], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 15 * 60_000,
      signal: options.signal,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Video conversion to H.264/AAC MP4 failed: ${detail}`);
  }
}

export async function convertVideoToH264(
  buffer: Buffer,
  inputMime: string,
): Promise<{ buffer: Buffer; mime: "video/mp4"; ext: "mp4" }> {
  const id     = randomUUID();
  const ext    = extFromVideoMime(inputMime);
  const inPath  = join(tmpdir(), `flexa_vin_${id}.${ext}`);
  const outPath = join(tmpdir(), `flexa_vout_${id}.mp4`);
  try {
    writeFileSync(inPath, buffer);
    await convertVideoFileToH264(inPath, outPath);
    const result = readFileSync(outPath);
    return { buffer: result, mime: "video/mp4", ext: "mp4" };
  } finally {
    if (existsSync(inPath))  unlinkSync(inPath);
    if (existsSync(outPath)) unlinkSync(outPath);
  }
}
