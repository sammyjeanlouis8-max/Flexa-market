# 🎯 REPLIT MANUAL FIX — Video Nwa + Profile Ghost Listings

## ⚠️ Why Emergent changes never reached production
Your Replit codebase is what deploys to `flexamarket.com`, not the Emergent
`/app` directory. Until you copy these changes into Replit and push from
Replit's git, none of the fixes shipped here will appear on the live site.

Your recent Replit modification to allow 300 MB / 3-minute videos broke
playback because **Cloudinary serves long video files with the moov atom at
the end of the file**. Browsers must download the whole file before any
frame plays → black screen. The fix is `fl_faststart` (moov atom at front
= progressive playback).

---

## ✅ Fix #1 — `artifacts/marketplace/src/lib/videoUrl.ts`

**REPLACE the entire file** with the content below.

```ts
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
 * Cloudinary poster (thumbnail) URL extracted from a representative frame.
 */
export function toVideoPosterUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.includes("res.cloudinary.com") || !url.includes("/video/upload/")) {
    return null;
  }
  const m = url.match(/(.*\/video\/upload\/)([^/]+\/)?(.+)$/);
  if (!m) return null;
  const base = m[1];
  const tail = m[3];
  const tailNoExt = tail.replace(/\.(mp4|mov|webm|m4v|3gp|avi|mkv|hevc)$/i, "");
  return `${base}so_auto,w_640,h_360,c_fill,g_center,q_auto,f_jpg/${tailNoExt}.jpg`;
}
```

---

## ✅ Fix #2 — `artifacts/marketplace/src/pages/ListingDetail.tsx`

**Find** (around line 25):
```ts
import { toStreamingVideoUrl } from "@/lib/videoUrl";
```
**Replace with:**
```ts
import { toFetchableVideoUrl } from "@/lib/videoUrl";
```

**Find** (around line 516):
```ts
...(boostVideoUrl ? [{ type: "video" as const, url: toStreamingVideoUrl(boostVideoUrl), isPromo: isBoostActive }] : []),
```
**Replace with:**
```ts
...(boostVideoUrl ? [{ type: "video" as const, url: toFetchableVideoUrl(boostVideoUrl), isPromo: isBoostActive }] : []),
```

**Find** (around line 1179):
```ts
<video src={toStreamingVideoUrl(listingVideoUrl)} controls playsInline className="w-full max-h-56 object-contain" preload="metadata" />
```
**Replace with:**
```ts
<video src={toFetchableVideoUrl(listingVideoUrl)} controls playsInline className="w-full max-h-56 object-contain" preload="metadata" />
```

---

## ✅ Fix #3 — `artifacts/marketplace/src/components/BoostVideoOverlay.tsx`

**Find:**
```ts
import { toStreamingVideoUrl } from "@/lib/videoUrl";
```
**Replace with:**
```ts
import { toFetchableVideoUrl } from "@/lib/videoUrl";
```

**Find the local `toFetchableUrl` function** (around lines 38-44):
```ts
function toFetchableUrl(stored: string): string {
  if (/^https?:\/\//i.test(stored)) return toStreamingVideoUrl(stored);
  const trimmed = stored.startsWith("/objects/")
    ? stored.slice("/objects/".length)
    : stored;
  return `/api/storage/objects/${trimmed}`;
}
```
**DELETE this entire function.**

**Find** (around line 209):
```ts
src={toFetchableUrl(listing.boostVideoUrl)}
```
**Replace with:**
```ts
src={toFetchableVideoUrl(listing.boostVideoUrl)}
```

---

## ✅ Fix #4 — `artifacts/marketplace/src/pages/VideoFeed.tsx`

**Find** (around line 26):
```ts
import { toStreamingVideoUrl } from "@/lib/videoUrl";
```
**Replace with:**
```ts
import { toFetchableVideoUrl } from "@/lib/videoUrl";
```

**Find** (around line 1061):
```ts
src={video.videoUrl ? toStreamingVideoUrl(video.videoUrl) : undefined}
```
**Replace with:**
```ts
src={video.videoUrl ? toFetchableVideoUrl(video.videoUrl) : undefined}
```

---

## ✅ Fix #5 — `artifacts/marketplace/src/pages/VideoPost.tsx`

**Find:**
```ts
import { toStreamingVideoUrl } from "@/lib/videoUrl";
```
**Replace with:**
```ts
import { toFetchableVideoUrl } from "@/lib/videoUrl";
```

**Find:**
```ts
const videoUrl: string | null = rawVideoUrl ? toStreamingVideoUrl(rawVideoUrl) : null;
```
**Replace with:**
```ts
const videoUrl: string | null = rawVideoUrl ? toFetchableVideoUrl(rawVideoUrl) : null;
```

---

## ✅ Fix #6 — `artifacts/api-server/src/routes/users.ts` (Profile ghost listings)

**Find** (around line 220-223):
```ts
  const isOwner = req.userId === id;
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  const conditions = [eq(listingsTable.sellerId, id)];
  if (!isOwner && !isAdmin) {
```

**Replace with:**
```ts
  const isOwner = req.userId === id;
  const isAdmin = req.user?.isAdmin || req.user?.isSuperAdmin;
  const conditions = [eq(listingsTable.sellerId, id)];
  // Exclude ghost listings (status='hidden') from the public profile grid.
  // These rows are scaffolding for the Video Promo boost feature
  // (routes/boost.ts → POST /boost/video-only) — they exist only to carry
  // boostVideoUrl + targeting metadata. They have price=0, no images, and
  // were never meant to appear as for-sale items. Without this filter,
  // owners see one orange "Video Prom" tile per promotion they've ever run.
  conditions.push(sql`${listingsTable.status} <> 'hidden'`);
  if (!isOwner && !isAdmin) {
```

(The `sql` import is already at the top of the file — no other change needed.)

---

## 🚀 After making all 6 changes on Replit

1. `pnpm build` (or your Replit build command) — should compile clean
2. Commit + push from Replit's terminal
3. Wait for DigitalOcean redeploy (~5 min)
4. Test on flexamarket.com:
   - Upload a fresh short video (~20 s) → should play
   - Upload a long video (2–3 min) → should ALSO play (this is the fix)
   - Visit your Profile → ghost "Video Prom" tiles should disappear
   - Listings count drops accordingly

If after all 6 fixes the long video is STILL black, the issue is on the
**upload side** of your Replit code — likely your 300 MB / 3-min change
disabled the Cloudinary chunked-upload helper or sent the wrong content-
type. Send me the diff of the upload route you modified and I'll trace it.
