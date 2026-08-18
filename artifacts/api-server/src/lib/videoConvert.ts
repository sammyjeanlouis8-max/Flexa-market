/**
 * Video conversion helper — uses system ffmpeg to transcode any video to H.264/MP4.
 * Activated for MOV/HEVC (iPhone), WebM, AVI, WMV and other non-H264 formats so
 * videos play on Chrome and Android without extra processing by the uploader.
 * Returns null if ffmpeg is unavailable or conversion fails — caller uploads original.
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

export async function convertVideoToH264(
  buffer: Buffer,
  inputMime: string,
): Promise<{ buffer: Buffer; mime: "video/mp4"; ext: "mp4" } | null> {
  const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
  const id     = randomUUID();
  const ext    = extFromVideoMime(inputMime);
  const inPath  = join(tmpdir(), `flexa_vin_${id}.${ext}`);
  const outPath = join(tmpdir(), `flexa_vout_${id}.mp4`);
  try {
    writeFileSync(inPath, buffer);
    await execFileAsync(ffmpeg, [
      "-y", "-i", inPath,
      "-c:v", "libx264", "-crf", "23", "-preset", "fast",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      "-max_muxing_queue_size", "9999",
      outPath,
    ], { maxBuffer: 10 * 1024 * 1024, timeout: 300_000 });
    const result = readFileSync(outPath);
    return { buffer: result, mime: "video/mp4", ext: "mp4" };
  } catch { return null; }
  finally {
    if (existsSync(inPath))  unlinkSync(inPath);
    if (existsSync(outPath)) unlinkSync(outPath);
  }
}
