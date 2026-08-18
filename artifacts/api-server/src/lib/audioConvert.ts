/**
    * Audio conversion helper — uses system ffmpeg to convert any audio format to MP3.
    * Activated for lossless (WAV, FLAC, AIFF) and uncommon formats (WMA, APE, etc.)
    * so artists can upload any DJ-mix format up to 3 h without pre-processing.
    *
    * Returns null if ffmpeg is unavailable or conversion fails — caller falls back
    * to uploading the original file in that case.
    */
    import { execFile } from "child_process";
    import { tmpdir } from "os";
    import { join } from "path";
    import { randomUUID } from "crypto";
    import { writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
    import { promisify } from "util";

    const execFileAsync = promisify(execFile);

    // MIME types that are already web-compatible compressed audio — skip conversion
    const PASSTHROUGH_MIMES = new Set([
    "audio/mpeg", "audio/mp3",
    "audio/aac", "audio/x-aac",
    "audio/mp4", "audio/x-m4a", "audio/m4a",
    ]);

    /** Returns true if the MIME type should be converted to MP3 before upload. */
    export function needsConversion(mime: string): boolean {
    const base = mime.split(";")[0].trim().toLowerCase();
    return base.startsWith("audio/") && !PASSTHROUGH_MIMES.has(base);
    }

    function extFromMime(mime: string, fallbackName: string): string {
    const map: Record<string, string> = {
      "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
      "audio/flac": "flac", "audio/x-flac": "flac",
      "audio/ogg": "ogg", "audio/webm": "webm",
      "audio/aiff": "aiff", "audio/x-aiff": "aiff", "audio/aif": "aif",
      "audio/x-ms-wma": "wma", "audio/wma": "wma",
      "audio/ape": "ape", "audio/x-ape": "ape",
      "audio/opus": "opus",
      "audio/x-caf": "caf",
    };
    const base = mime.split(";")[0].trim().toLowerCase();
    return map[base] ?? (fallbackName.includes(".") ? fallbackName.split(".").pop() : "bin");
    }

    /**
    * Convert audio buffer to MP3 (VBR ~190 kbps) using system ffmpeg.
    * Timeout is 10 min — enough for a 3-hour lossless source file.
    * Returns null on any failure so the caller can upload the original.
    */
    export async function convertAudioToMp3(
    buffer: Buffer,
    inputMime: string,
    originalName: string,
    ): Promise<{ buffer: Buffer; mime: "audio/mpeg"; ext: "mp3" } | null> {
    const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
    const id  = randomUUID();
    const ext = extFromMime(inputMime, originalName);
    const inPath  = join(tmpdir(), "flexa_in_" + id + "." + ext);
    const outPath = join(tmpdir(), "flexa_out_" + id + ".mp3");

    try {
      writeFileSync(inPath, buffer);

      await execFileAsync(ffmpeg, [
        "-y",                     // overwrite without asking
        "-i",  inPath,            // input
        "-vn",                    // strip video/cover-art tracks
        "-acodec", "libmp3lame",  // LAME MP3 encoder
        "-q:a", "2",              // VBR quality 2 ~ 190 kbps (transparent for music)
        "-ar",  "44100",          // normalise sample rate
        "-ac",  "2",              // stereo
        outPath,
      ], { maxBuffer: 10 * 1024 * 1024, timeout: 600000 }); // 10 min

      const result = readFileSync(outPath);
      return { buffer: result, mime: "audio/mpeg", ext: "mp3" };
    } catch {
      return null;
    } finally {
      if (existsSync(inPath))  unlinkSync(inPath);
      if (existsSync(outPath)) unlinkSync(outPath);
    }
    }
    