/**
 * CLEAN VIDEO URL HELPERS (Rebuilt)
 *
 * Single source of truth for all video URL transformations.
 * All three helpers are idempotent — safe to call multiple times.
 */

/**
 * Apply fl_faststart,vc_h264,f_mp4 to a Cloudinary video URL.
 * This moves the moov atom to the front of the file so browsers can
 * start playback without downloading the entire video first.
 * Without this, long videos show a BLACK SCREEN on mobile.
 */
export function toStreamingVideoUrl(url: string): string {
  if (
    url &&
    url.includes("res.cloudinary.com") &&
    url.includes("/video/upload/") &&
    !url.includes("fl_faststart")
  ) {
    let transformed = url.replace("/video/upload/", "/video/upload/fl_faststart,vc_h264,f_mp4/");
    // Force .mp4 extension — Cloudinary returns 400 if .mov/.hevc/etc conflicts with f_mp4 output
    transformed = transformed.replace(/\.(mov|hevc|m4v|3gp|avi|mkv|webm)(\?|#|$)/i, '.mp4$2');
    return transformed;
  }
  return url;
}

/**
 * Normalize ANY stored video URL to one that a <video> element can fetch:
 *   • Cloudinary https:// URL  → apply fl_faststart streaming transform
 *   • /objects/...  path       → rewrite to /api/storage/objects/... (GCS proxy)
 *   • /api/storage/...         → return as-is (already routable)
 *   • anything else            → return as-is
 *
 * This handles BOTH new Cloudinary-stored videos AND legacy GCS rows in the DB.
 */
export function toFetchableVideoUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return toStreamingVideoUrl(url);
  if (url.startsWith("/api/storage/")) return url;
  const trimmed = url.startsWith("/objects/")
    ? url.slice("/objects/".length)
    : url.replace(/^\/+/, "");
  return `/api/storage/objects/${trimmed}`;
}

/**
 * Generate a Cloudinary auto-poster thumbnail URL from a video URL.
 * Returns a 16:9 JPEG still frame extracted from the most representative
 * moment of the video (so_auto picks a non-black frame).
 * Returns null for non-Cloudinary URLs (GCS/legacy).
 */
export function toVideoPosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) return null;
  const m = url.match(/(.*\/video\/upload\/)([^/]+\/)?(.+)$/);
  if (!m) return null;
  const base = m[1];
  const tail = m[3].replace(/\.(mp4|mov|webm|m4v|3gp|avi|mkv|hevc)$/i, "");
  return `${base}so_auto,w_640,h_360,c_fill,g_center,q_auto,f_jpg/${tail}.jpg`;
}
