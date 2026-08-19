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

const execFileAsync = promisify(execFile);

const PASSTHROUGH_VIDEO_MIMES = new Set(["video/mp4", "video/x-m4v"]);

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

async function inputHasAudio(inputPath: string, signal?: AbortSignal): Promise<boolean> {
  const ffprobe = process.env["FFPROBE_PATH"] ?? "ffprobe";
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "error",
    "-select_streams", "a:0",
    "-show_entries", "stream=index",
    "-of", "csv=p=0",
    inputPath,
  ], { maxBuffer: 1024 * 1024, timeout: 60_000, signal });
  return stdout.trim().length > 0;
}

/**
 * File-backed conversion used by Boost ingestion. The output always contains
 * H.264 video and AAC audio; silent source videos receive a silent AAC track.
 */
export async function convertVideoFileToH264(
  inputPath: string,
  outputPath: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
  const hasAudio = await inputHasAudio(inputPath, options.signal);
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
      ...inputs,
      ...maps,
      "-sn", "-dn",
      "-c:v", "libx264", "-crf", "23", "-preset", "fast",
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
