import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";

const rawCloudName = process.env["CLOUDINARY_CLOUD_NAME"] ?? "";
const KNOWN_CLOUD_NAME = "dvkbgodbk";

export const CLOUD_NAME =
  rawCloudName && !rawCloudName.includes("-") && rawCloudName.length < 32
    ? rawCloudName
    : KNOWN_CLOUD_NAME;

export const IS_CONFIGURED = !!(process.env["CLOUDINARY_API_KEY"]);

if (IS_CONFIGURED) {
  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: process.env["CLOUDINARY_API_KEY"],
    api_secret: process.env["CLOUDINARY_API_SECRET"],
  });
}

export function assertConfigured(): void {
  if (!IS_CONFIGURED) {
    throw new Error(
      "Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.",
    );
  }
}

export function toStreamingUrl(url: string): string {
  if (
    url &&
    url.includes("res.cloudinary.com") &&
    url.includes("/video/upload/") &&
    !url.includes("fl_faststart")
  ) {
    // Add fl_faststart only if not already present (idempotent)
    if (!url.includes("fl_faststart")) {
      url = url.replace("/video/upload/", "/video/upload/fl_faststart,vc_h264,f_mp4/");
    }
    // ALWAYS fix extension: .mov/.hevc/etc → .mp4 when f_mp4 is in the URL.
    // Pre-warmed URLs already have fl_faststart,vc_h264,f_mp4 but still end in .mov —
    // Cloudinary returns 400 if the URL extension conflicts with the f_mp4 transform.
    if (url.includes("f_mp4")) {
      url = url.replace(/\.(mov|hevc|m4v|3gp|avi|mkv|webm)(\?|#|$)/i, '.mp4$2');
    }
    return url;
  }
  return url;
}

export function toPosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return null;
  const m = url.match(/(.*\/video\/upload\/)([^/]+\/)?(.+)$/);
  if (!m) return null;
  const base = m[1];
  const tail = m[3].replace(/\.(mp4|mov|webm|m4v|3gp|avi|mkv|hevc)$/i, "");
  return `${base}so_auto,w_640,h_360,c_fill,g_center,q_auto,f_jpg/${tail}.jpg`;
}

export async function uploadImage(
  buffer: Buffer,
  contentType: string,
): Promise<{ url: string; publicId: string }> {
  assertConfigured();
  if (!buffer || buffer.length === 0) throw new Error("Empty file — please select a valid image.");
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "image", folder: "flexa-market", format: "jpg" },
      (err, result) => {
        if (err || !result) reject(err ?? new Error("Cloudinary upload failed"));
        else resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
}

export async function uploadVideoStream(
  stream: Readable,
  contentType: string,
): Promise<{ url: string; publicId: string }> {
  assertConfigured();
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      try { (cldStream as any)?.destroy?.(); } catch { }
      reject(err instanceof Error ? err : new Error("Cloudinary video upload failed"));
    };
    const cldStream = cloudinary.uploader.upload_chunked_stream(
      {
        resource_type: "video",
        folder: "flexa-market",
        chunk_size: 20 * 1024 * 1024,
      },
      (err, result) => {
        if (settled) return;
        if (err || !result?.secure_url) {
          fail(err ?? new Error("Cloudinary upload failed"));
        } else {
          settled = true;
          resolve({ url: result.secure_url, publicId: result.public_id });
        }
      },
    );
    stream.on("error", fail);
    cldStream.on("error", fail);
    stream.pipe(cldStream);
  });
}

export async function prewarmVideo(
  rawUrl: string,
  log?: { info: (...a: any[]) => void; warn: (...a: any[]) => void },
): Promise<string> {
  if (!rawUrl.includes("res.cloudinary.com") || !rawUrl.includes("/video/upload/")) return rawUrl;
  const streamingUrl = toStreamingUrl(rawUrl);
  try {
    await fetch(streamingUrl, { method: "HEAD", signal: AbortSignal.timeout(25_000) });
    log?.info({ streamingUrl }, "Cloudinary video pre-warmed");
  } catch (e) {
    log?.warn({ streamingUrl, err: e }, "Cloudinary pre-warm timed out — client will use streaming URL anyway");
  }
  return streamingUrl;
}

export function deleteAsset(publicId: string, resourceType: "image" | "video" = "image"): Promise<void> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
