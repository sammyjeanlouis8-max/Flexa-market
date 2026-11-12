/**
 * Automatic visual moderation for public photos and videos.
 *
 * Auto-reject ONLY with confirmed evidence of:
 *  - exposed intimate body parts (intimate_exposure)
 *  - explicit sexual acts (explicit_sexual)
 *  - real firearms (firearm)
 *
 * Underwear, swimwear, visible skin, or gun-like objects alone → human review.
 * Analysis failures → retry / stay pending — never auto-reject.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import OpenAI from "openai";
import { logger } from "./logger";
import { extractWasabiKey, getWasabiObject } from "./s3";
import { uploadToStorage } from "./storage";

const execFileAsync = promisify(execFile);

export type MediaViolationCategory =
  | "intimate_exposure"
  | "explicit_sexual"
  | "firearm";

export type MediaModerationDecision = "approved" | "pending" | "rejected";

export interface FrameFinding {
  timestampSec: number;
  decision: MediaModerationDecision;
  category: MediaViolationCategory | null;
  confidence: number;
  reason: string;
  /** Suggested context carve-out (swimwear, toy weapon, etc.). */
  contextNote?: string | null;
}

export interface MediaModerationResult {
  decision: MediaModerationDecision;
  category: MediaViolationCategory | null;
  formalReason: string;
  confidence: number;
  evidenceTimestampSec: number | null;
  evidenceImageBuffer: Buffer | null;
  findings: FrameFinding[];
  source: "ai" | "rules_fallback";
  analyzedVersionHint?: string;
}

const AUTO_REJECT_MIN_CONFIDENCE = 0.82;

function getOpenAI(): OpenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim();
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim();
  if (!apiKey || !baseURL) return null;
  return new OpenAI({ apiKey, baseURL });
}

const SYSTEM_PROMPT =
  "You are a visual safety classifier for Flexa Market marketplace media. " +
  "Auto-reject ONLY when there is clear evidence of: " +
  "(1) exposed intimate body parts (genitals, anus, female nipples in a sexual context) → intimate_exposure; " +
  "(2) an explicit sexual act → explicit_sexual; " +
  "(3) a real firearm (gun/rifle/handgun clearly identifiable as a weapon) → firearm. " +
  "Do NOT auto-reject for underwear, lingerie, swimwear, bikini, visible skin, kissing, or objects that merely look like a weapon (toys, airsoft, props). " +
  "If uncertain, decide pending. Return STRICT JSON: " +
  '{"decision":"approved|pending|rejected","category":"intimate_exposure|explicit_sexual|firearm|null","confidence":0..1,"reason":string,"contextNote":string|null}';

async function classifyImageBuffer(
  imageBuffer: Buffer,
  mime = "image/jpeg",
  timestampSec = 0,
): Promise<FrameFinding> {
  const client = getOpenAI();
  if (!client) {
    return {
      timestampSec,
      decision: "pending",
      category: null,
      confidence: 0,
      reason: "Media analysis service unavailable — queued for human review",
      contextNote: "service_unavailable",
    };
  }

  const dataUrl = `data:${mime};base64,${imageBuffer.toString("base64")}`;
  try {
    const completion = await client.chat.completions.create({
      model: process.env.MEDIA_MODERATION_MODEL?.trim() || "gpt-5-nano",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Classify this marketplace ${timestampSec > 0 ? `video frame at ${timestampSec.toFixed(1)}s` : "photo"}. Be context-aware.`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
    const raw = completion.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      decision?: string;
      category?: string | null;
      confidence?: number;
      reason?: string;
      contextNote?: string | null;
    };

    let decision = (["approved", "pending", "rejected"].includes(String(parsed.decision))
      ? parsed.decision
      : "pending") as MediaModerationDecision;
    const category = (["intimate_exposure", "explicit_sexual", "firearm"].includes(String(parsed.category))
      ? parsed.category
      : null) as MediaViolationCategory | null;
    const confidence = typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

    // Never auto-reject without a confirmed category + high confidence.
    if (decision === "rejected") {
      if (!category || confidence < AUTO_REJECT_MIN_CONFIDENCE) {
        decision = "pending";
      }
    }
    // Rejected without category is invalid.
    if (decision === "rejected" && !category) decision = "pending";

    return {
      timestampSec,
      decision,
      category: decision === "rejected" ? category : (decision === "pending" ? category : null),
      confidence,
      reason: parsed.reason?.trim() || "AI visual classification",
      contextNote: parsed.contextNote ?? null,
    };
  } catch (err) {
    logger.warn({ err }, "[mediaModeration] vision classify failed");
    return {
      timestampSec,
      decision: "pending",
      category: null,
      confidence: 0,
      reason: "Media analysis failed — queued for retry / human review",
      contextNote: "analysis_error",
    };
  }
}

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

async function bodyToBuffer(body: any): Promise<Buffer> {
  if (!body) throw new Error("Empty media body");
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const key = extractWasabiKey(url);
  if (key) {
    try {
      const object = await getWasabiObject(key);
      return await bodyToBuffer(object.Body);
    } catch (err) {
      logger.warn({ err, key }, "[mediaModeration] Wasabi download failed — falling back to HTTP");
    }
  }

  let absolute = url;
  if (url.startsWith("/")) {
    const base = (
      process.env.PUBLIC_API_BASE_URL ||
      process.env.APP_URL ||
      process.env.BASE_URL ||
      "http://127.0.0.1:5000"
    ).replace(/\/$/, "");
    absolute = `${base}${url}`;
  }
  const res = await fetch(absolute);
  if (!res.ok) throw new Error(`Failed to download media (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Extract frames across the full video (start → end) at ~1 fps.
 * One confirmed violating frame is enough to reject the whole video.
 */
export async function extractVideoFrames(
  videoBuffer: Buffer,
  opts: { fps?: number; maxFrames?: number } = {},
): Promise<Array<{ timestampSec: number; jpeg: Buffer }>> {
  const fps = Math.max(0.5, Math.min(2, opts.fps ?? 1));
  const maxFrames = Math.max(8, Math.min(240, opts.maxFrames ?? 120));
  const dir = join(tmpdir(), `fm-mod-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  const input = join(dir, "input.bin");
  const pattern = join(dir, "frame-%05d.jpg");
  try {
    await fs.writeFile(input, videoBuffer);
    const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
    await execFileAsync(ffmpeg, [
      "-y",
      "-i", input,
      "-vf", `fps=${fps}`,
      "-frames:v", String(maxFrames),
      "-q:v", "4",
      pattern,
    ], { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });

    const files = (await fs.readdir(dir))
      .filter((f) => /^frame-\d+\.jpg$/.test(f))
      .sort();
    const frames: Array<{ timestampSec: number; jpeg: Buffer }> = [];
    for (let i = 0; i < files.length; i++) {
      const jpeg = await fs.readFile(join(dir, files[i]));
      frames.push({ timestampSec: i / fps, jpeg });
    }
    return frames;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function formalReasonFor(
  category: MediaViolationCategory | null,
  decision: MediaModerationDecision,
  detail: string,
  timestampSec: number | null,
): string {
  if (decision !== "rejected" || !category) {
    return detail || "Requires human review";
  }
  const labels: Record<MediaViolationCategory, string> = {
    intimate_exposure: "Exposed intimate body parts",
    explicit_sexual: "Explicit sexual act",
    firearm: "Real firearm",
  };
  const when = timestampSec != null && timestampSec > 0
    ? ` Detected at ${formatTimestamp(timestampSec)}.`
    : "";
  return `${labels[category]} detected in this media.${when} ${detail}`.trim();
}

export function formatTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export async function moderateImageBuffer(imageBuffer: Buffer, mime = "image/jpeg"): Promise<MediaModerationResult> {
  const finding = await classifyImageBuffer(imageBuffer, mime, 0);
  const decision = finding.decision;
  return {
    decision,
    category: finding.category,
    formalReason: formalReasonFor(finding.category, decision, finding.reason, null),
    confidence: finding.confidence,
    evidenceTimestampSec: decision === "rejected" ? 0 : null,
    evidenceImageBuffer: decision === "rejected" ? imageBuffer : null,
    findings: [finding],
    source: finding.contextNote === "service_unavailable" || finding.contextNote === "analysis_error"
      ? "rules_fallback"
      : "ai",
  };
}

export async function moderateVideoBuffer(videoBuffer: Buffer): Promise<MediaModerationResult> {
  let frames: Array<{ timestampSec: number; jpeg: Buffer }>;
  try {
    frames = await extractVideoFrames(videoBuffer);
  } catch (err) {
    logger.warn({ err }, "[mediaModeration] frame extraction failed");
    return {
      decision: "pending",
      category: null,
      formalReason: "Video analysis could not extract frames — queued for retry / human review",
      confidence: 0,
      evidenceTimestampSec: null,
      evidenceImageBuffer: null,
      findings: [],
      source: "rules_fallback",
    };
  }

  if (frames.length === 0) {
    return {
      decision: "pending",
      category: null,
      formalReason: "No frames available for analysis — queued for human review",
      confidence: 0,
      evidenceTimestampSec: null,
      evidenceImageBuffer: null,
      findings: [],
      source: "rules_fallback",
    };
  }

  const findings: FrameFinding[] = [];
  for (const frame of frames) {
    const finding = await classifyImageBuffer(frame.jpeg, "image/jpeg", frame.timestampSec);
    findings.push(finding);
    // One clear violating frame rejects the whole video.
    if (finding.decision === "rejected" && finding.category && finding.confidence >= AUTO_REJECT_MIN_CONFIDENCE) {
      return {
        decision: "rejected",
        category: finding.category,
        formalReason: formalReasonFor(finding.category, "rejected", finding.reason, frame.timestampSec),
        confidence: finding.confidence,
        evidenceTimestampSec: frame.timestampSec,
        evidenceImageBuffer: frame.jpeg,
        findings,
        source: "ai",
      };
    }
  }

  const anyPending = findings.some((f) => f.decision === "pending" || (f.category && f.confidence >= 0.4));
  const serviceIssue = findings.every((f) => f.contextNote === "service_unavailable" || f.contextNote === "analysis_error");
  if (serviceIssue) {
    return {
      decision: "pending",
      category: null,
      formalReason: "Media analysis service failed — video kept private for retry / human review",
      confidence: 0,
      evidenceTimestampSec: null,
      evidenceImageBuffer: null,
      findings,
      source: "rules_fallback",
    };
  }
  if (anyPending) {
    const best = findings
      .filter((f) => f.decision === "pending" || f.category)
      .sort((a, b) => b.confidence - a.confidence)[0];
    return {
      decision: "pending",
      category: best?.category ?? null,
      formalReason: best?.reason || "Uncertain visual content — queued for human review",
      confidence: best?.confidence ?? 0.3,
      evidenceTimestampSec: best?.timestampSec ?? null,
      evidenceImageBuffer: best
        ? frames.find((f) => f.timestampSec === best.timestampSec)?.jpeg ?? null
        : null,
      findings,
      source: "ai",
    };
  }

  return {
    decision: "approved",
    category: null,
    formalReason: "No confirmed intimate exposure, explicit sexual content, or firearm detected",
    confidence: Math.max(...findings.map((f) => f.confidence), 0.5),
    evidenceTimestampSec: null,
    evidenceImageBuffer: null,
    findings,
    source: "ai",
  };
}

export async function moderateMediaFromUrl(
  url: string,
  mediaType: "image" | "video",
): Promise<MediaModerationResult> {
  const buf = await downloadToBuffer(url);
  if (mediaType === "video") return moderateVideoBuffer(buf);
  const mime = url.toLowerCase().includes(".png") ? "image/png" : "image/jpeg";
  return moderateImageBuffer(buf, mime);
}

/** Upload a private evidence JPEG (optionally caller will blur client-side; we store as evidence). */
export async function storeEvidenceImage(jpeg: Buffer): Promise<string> {
  const uploaded = await uploadToStorage(jpeg, "image/jpeg", "media-evidence");
  return uploaded.url;
}

export async function blurEvidenceApprox(jpeg: Buffer): Promise<Buffer> {
  // Soft privacy blur via ffmpeg scale-down/scale-up (no sharp dependency).
  const dir = join(tmpdir(), `fm-blur-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  const input = join(dir, "in.jpg");
  const output = join(dir, "out.jpg");
  try {
    await fs.writeFile(input, jpeg);
    const ffmpeg = process.env["FFMPEG_PATH"] ?? "ffmpeg";
    await execFileAsync(ffmpeg, [
      "-y", "-i", input,
      "-vf", "gblur=sigma=18,scale=iw/12:ih/12,scale=640:360:flags=neighbor",
      "-q:v", "6",
      output,
    ], { timeout: 30_000 });
    return await fs.readFile(output);
  } catch {
    return jpeg;
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
