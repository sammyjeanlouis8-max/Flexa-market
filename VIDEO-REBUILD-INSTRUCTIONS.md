# Video System Rebuild — Apply Instructions

## Overview of Changes

This rebuild fixes 3 root causes of all video failures:

1. **`s3-upload.ts` DELETE** — this old route uploaded videos straight to GCS,
   bypassing Cloudinary entirely. Every video from this path had no streaming
   transform and caused black screens on mobile.

2. **`storage.ts` REPLACE** — the new version uses Cloudinary exclusively,
   has cleaner error messages, and uses `lib/cloudinary.ts` for all Cloudinary
   logic.

3. **New `VideoPlayer.tsx`** — single reusable component with stall recovery,
   error retry, loading skeleton, and correct iOS Safari attributes.

---

## Step 1 — Create the branch

```bash
cd /path/to/Flexa-market
git checkout main
git pull origin main
git checkout -b video-system-rebuild
```

---

## Step 2 — Delete the legacy upload route

```bash
rm artifacts/api-server/src/routes/s3-upload.ts
```

Then in `artifacts/api-server/src/routes/index.ts` (or wherever routes are
registered), **remove** the line that imports and mounts `s3-upload`:

```ts
// DELETE this line:
import s3Upload from "./s3-upload";
// DELETE this line:
app.use("/api", s3Upload);
```

---

## Step 3 — Add the new Cloudinary lib

Copy `video-rebuild/api-server/lib/cloudinary.ts`
→ `artifacts/api-server/src/lib/cloudinary.ts`

---

## Step 4 — Replace the storage route

Copy `video-rebuild/api-server/routes/storage.ts`
→ `artifacts/api-server/src/routes/storage.ts`

---

## Step 5 — Replace the video URL helpers

Copy `video-rebuild/marketplace/lib/videoUrl.ts`
→ `artifacts/marketplace/src/lib/videoUrl.ts`

---

## Step 6 — Add the new upload hook

Copy `video-rebuild/marketplace/hooks/use-video-upload.ts`
→ `artifacts/marketplace/src/hooks/use-video-upload.ts`

---

## Step 7 — Add the VideoPlayer component

Copy `video-rebuild/marketplace/components/VideoPlayer.tsx`
→ `artifacts/marketplace/src/components/VideoPlayer.tsx`

---

## Step 8 — Add the VideoUploadField component

Copy `video-rebuild/marketplace/components/VideoUploadField.tsx`
→ `artifacts/marketplace/src/components/VideoUploadField.tsx`

---

## Step 9 — Update Sell page & Boost Wizard

In `artifacts/marketplace/src/pages/Sell.tsx` and
`artifacts/marketplace/src/components/BoostWizard.tsx`,
replace ANY video upload code with `VideoUploadField`:

```tsx
import VideoUploadField from "@/components/VideoUploadField";
import { useAuth } from "@/contexts/auth";

// In your form:
const { token } = useAuth();

<VideoUploadField
  value={form.watch("listingVideoUrl")}     // or boostVideoUrl
  onChange={(url) => form.setValue("listingVideoUrl", url)}
  authToken={token}
  label="Listing Video (optional)"
  hint="MP4 or MOV · Max 350 MB"
/>
```

---

## Step 10 — Update ListingDetail, VideoPost, BoostVideoOverlay

Any place that renders a `<video>` element, replace it with `<VideoPlayer>`:

```tsx
import VideoPlayer from "@/components/VideoPlayer";

// Before:
<video src={toFetchableVideoUrl(listing.listingVideoUrl)} playsInline ... />

// After:
<VideoPlayer
  src={listing.listingVideoUrl}
  controls
  className="w-full aspect-video rounded-xl overflow-hidden"
/>
```

---

## Step 11 — Verify environment variables

Make sure these are set in your deployment environment:

```
CLOUDINARY_CLOUD_NAME=dvkbgodbk
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

Without these, ALL uploads will return HTTP 503.

---

## Step 12 — Build, commit, push

```bash
cd artifacts/api-server && pnpm build
cd ../../artifacts/marketplace && pnpm build

git add -A
git commit -m "rebuild: clean production-grade video system

- Remove s3-upload.ts (GCS-bypass route causing silent Cloudinary skip)
- Extract cloudinary.ts lib with uploadImage, uploadVideoStream, prewarmVideo
- Rebuild storage.ts: Cloudinary-only, chunked stream upload, GCS legacy fallback
- Add VideoPlayer component: iOS Safari-safe, stall recovery, error retry
- Add VideoUploadField: drag-drop upload with real progress bar
- Add use-video-upload hook: typed, with validation and error handling
- Keep videoUrl.ts helpers: toFetchableVideoUrl, toStreamingVideoUrl, toVideoPosterUrl"

git push origin video-system-rebuild
```

---

## Testing Checklist

After deployment:

- [ ] Upload a video on Sell page → save listing → refresh → video still shows
- [ ] Upload a boost video → save boost → refresh → video shows in VideoFeed
- [ ] Open on iPhone Safari → video plays inline (no black screen)
- [ ] Open on Android Chrome → video plays inline
- [ ] Check Cloudinary dashboard → new uploads appear in `flexa-market/` folder
- [ ] Old GCS videos (/objects/uploads/...) still serve via /api/storage/objects/
- [ ] VideoFeed scroll → each video loads with poster thumbnail
- [ ] Video stall → auto-recovers within 3 seconds
- [ ] Video error → retry button appears

---

## File Summary

| File | Action | Reason |
|------|--------|--------|
| `artifacts/api-server/src/routes/s3-upload.ts` | **DELETE** | Bypasses Cloudinary, GCS-only |
| `artifacts/api-server/src/lib/cloudinary.ts` | **ADD** | Centralized Cloudinary config + helpers |
| `artifacts/api-server/src/routes/storage.ts` | **REPLACE** | Cloudinary-only, no dual-path confusion |
| `artifacts/marketplace/src/lib/videoUrl.ts` | **REPLACE** | Cleaned up, same API |
| `artifacts/marketplace/src/hooks/use-video-upload.ts` | **ADD** | Typed video upload hook |
| `artifacts/marketplace/src/components/VideoPlayer.tsx` | **ADD** | Production-grade player |
| `artifacts/marketplace/src/components/VideoUploadField.tsx` | **ADD** | Clean upload UI |
