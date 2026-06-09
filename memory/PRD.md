# FlexaMarket — Video Black-Screen Fix

## Original Problem Statement (Kreyòl)
"mwen gen yon app ki gen yon problem grav video pa sove video paka play lw fè anpil tantativ ak anpil lot zouti ai li paka rezoud"

## Project
- **Repo:** https://github.com/sammyjeanlouis8-max/Flexa-market
- **Type:** pnpm monorepo (React/Vite frontend + Express/TS backend + PostgreSQL)
- **Affected area:** Promo / boost video upload + playback (Cloudinary path)

## Symptom Reported by User
- A 20-second video takes a long time to "save".
- After saving, in **My Boost / My Video Boost** the video shows up **completely black with no image inside**.

## Root Cause (verified by reading the repo)
1. `artifacts/api-server/src/lib/cloudinary.ts → uploadVideoStream()` uploaded the original file to Cloudinary **without** an `eager` transformation. The DB ended up pointing at the raw upload — often an iPhone **HEVC / .mov** file that most browsers cannot decode → black playback.
2. `prewarmVideo()` only fired a `HEAD` against the streaming URL. On Cloudinary, a HEAD does **not** wait for the on-the-fly derivation to finish; for HEVC sources it usually returns 423 / processing, so the first viewer still hit a black frame.
3. `IS_CONFIGURED` only checked `CLOUDINARY_API_KEY`, masking misconfigurations where the secret is missing (upload would silently fail authentication on some operations).

## Fix Implemented (in branch `fix/video-black-screen`)
**File:** `artifacts/api-server/src/lib/cloudinary.ts`
- `uploadVideoStream` now passes `eager: [{ format: "mp4", video_codec: "h264", audio_codec: "aac", flags: "faststart", quality: "auto" }]` with `eager_async: false` so Cloudinary finishes the H.264 + faststart MP4 derivation **before** the upload call returns. The function returns `result.eager[0].secure_url` whenever present — a URL that is guaranteed playable on iPhone Safari, Android Chrome, and desktop.
- `prewarmVideo` switched from `HEAD` to a ranged `GET` (`bytes=0-65535`) with a 60 s timeout, and drains the response body, so the transformation cache is actually warmed.
- `IS_CONFIGURED` now requires **both** `CLOUDINARY_API_KEY` *and* `CLOUDINARY_API_SECRET`.

Patch file generated at: `/app/video-black-screen-fix.patch`

## How to Apply
```bash
cd /path/to/Flexa-market
git checkout main
git pull origin main
git checkout -b fix/video-black-screen
git apply /app/video-black-screen-fix.patch
git add -A
git commit -m "fix(video): eager H.264+faststart transform to eliminate black-screen bug"
git push origin fix/video-black-screen
```
Then open a PR to `main` and redeploy the api-server.

## Required Environment Variables (api-server)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

If any of these is missing the new code returns HTTP 503 with a clear message, so misconfiguration is no longer silent.

## Important Note About Existing Videos
Videos uploaded BEFORE this fix still point at the original (HEVC/.mov) blob in Cloudinary. They will continue to show black on iOS browsers until they are either:
- Deleted and re-uploaded, **or**
- Re-derived: `cloudinary.uploader.explicit(publicId, { resource_type: "video", type: "upload", eager: [{format:"mp4",video_codec:"h264",audio_codec:"aac",flags:"faststart"}], eager_async: false })` then update the DB row to point at the new eager URL. (A one-shot script per `boost_video_url` row will fix them all.)

## Backlog
- P1: Migration script to re-derive all existing `boostVideoUrl` / `listingVideoUrl` rows that still point at the raw (non-eager) Cloudinary URL.
- P2: Replace `BoostWizard.tsx`'s in-component upload code with the shared `useVideoUpload` hook for consistency.
- P3: Switch `MyBoosts.tsx` "Add Video" button from `useUpload` (`@workspace/object-storage-web`) to the dedicated `useVideoUpload` so behavior matches the Sell page.

## Next Action Items
1. User applies the patch and pushes to GitHub.
2. Redeploy the api-server.
3. Test a fresh upload on iPhone Safari, Android Chrome, and Desktop Chrome.
4. (Optional) Run the re-derivation script for old videos in DB.
