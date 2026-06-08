// Shared video URL helpers.
//
// Cloudinary stores videos with the moov atom at the END of the file. Browsers
// then have to download the WHOLE file before playback starts — a short ~20s
// clip finishes fast and plays, but a 1–2 minute clip never finishes buffering
// and shows a BLACK screen. Inserting `fl_faststart` re-muxes with the moov atom
// at the FRONT (progressive/streaming playback), and `vc_h264,f_mp4` guarantees
// a universally-supported codec/container. The video feed applies the same
// transform server-side; every other player that renders a Cloudinary boost or
// listing video MUST run its URL through this helper or long videos break.
//
// Both helpers are idempotent: calling them on an already-transformed URL is
// a no-op, so defensive double-wrapping (server + client) is safe.
export function toStreamingVideoUrl(url: string): string {
  if (
    url &&
    url.includes("res.cloudinary.com") &&
    url.includes("/video/upload/") &&
    !url.includes("fl_faststart")
  ) {
    return url.replace("/video/upload/", "/video/upload/fl_faststart,vc_h264,f_mp4/");
  }
  return url;
}

/**
 * Convert any stored video URL into one that an HTML `<video>` element can
 * actually fetch from the current origin.
 *
 *   • Absolute http(s) URL  → run through `toStreamingVideoUrl` (Cloudinary
 *     faststart transform if applicable, otherwise unchanged).
 *   • `/objects/...` path   → re-route to `/api/storage/objects/...` (the
 *     actual express route that streams from GCS / object storage). Without
 *     this prefix the `<video>` element 404s and iOS Safari shows the
 *     "broken play" icon — which is the exact symptom that made promo
 *     videos look like they had never been saved.
 *   • `/api/storage/...`    → returned as-is (already routable).
 *   • Anything else         → returned as-is (let the browser try and fail
 *     gracefully).
 *
 * Centralising this lets every player (BoostVideoOverlay, ListingDetail
 * gallery, ListingDetail non-boost video, VideoFeed, VideoPost) stay in
 * lockstep so a legacy DB row with a `/objects/uploads/<uuid>` path keeps
 * playing even after we switched the upload pipeline to Cloudinary.
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
 * Given a Cloudinary video URL, return a JPG poster (thumbnail) URL extracted
 * from a representative frame of the video itself.
 *
 *   - `so_auto`   asks Cloudinary to pick the most representative frame
 *                 (heuristic: avoids black-frame intros / outros).
 *   - `w_640,h_360,c_fill,g_center` produces a 16:9 thumbnail suitable for
 *                 feed cards, profile lists, and the <video poster> attribute.
 *   - `q_auto`    enables Cloudinary's per-frame quality optimisation.
 *   - `.jpg` extension forces JPEG output regardless of the source codec.
 *
 * Non-Cloudinary URLs are returned unchanged. Returning `null` would have
 * forced every caller to handle the absent case; returning the original URL
 * keeps callsites simple and lets `<img>` fall back gracefully (the browser
 * will fail to decode and use its own placeholder).
 */
export function toVideoPosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) {
    return null;
  }
  // Strip any existing transformation segment after /video/upload/ so we don't
  // stack faststart/codec params on top of the poster transformation (they
  // are video-only and produce errors when applied to a still frame).
  const m = url.match(/(.*\/video\/upload\/)([^/]+\/)?(.+)$/);
  if (!m) return null;
  const base = m[1];
  const tail = m[3];
  // Drop the source extension and replace with .jpg so Cloudinary serves the
  // poster as an image regardless of the source container.
  const tailNoExt = tail.replace(/\.(mp4|mov|webm|m4v|3gp|avi|mkv|hevc)$/i, "");
  return `${base}so_auto,w_640,h_360,c_fill,g_center,q_auto,f_jpg/${tailNoExt}.jpg`;
}
