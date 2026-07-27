---
name: Flexa music storage architecture
description: How music audio and cover files are stored and served; direct Cloudinary upload pattern
---

## Storage backends
- **Cloudinary** — all new music audio + covers use direct browser→Cloudinary upload (`cld:` key prefix)
- **Wasabi** — legacy only; new uploads no longer go through it (S3 SDK v3 signature mismatch with DO environment)
- `wasabi.ts` still handles `deleteMusicFile`, `getStreamUrl`, `extractKey` for legacy tracks

## Key prefix convention
- `cld:<public_id>` — Cloudinary asset; `toClientTrack` returns `audio_url` directly (no proxy)
- Wasabi keys (no prefix) — routed through `/api/music/stream/{key}` signing proxy

## Direct upload flow (browser → Cloudinary, no DO server timeout)
1. `GET /api/music/upload-signature` — server returns Cloudinary signed params
2. Browser `XHR POST` audio directly to `https://api.cloudinary.com/v1_1/{cloud}/video/upload`
3. Browser `fetch POST` cover directly to `https://api.cloudinary.com/v1_1/{cloud}/image/upload`
4. `POST /api/music/register` — server does DB insert only (< 1s, no timeout risk)

**Why:** DigitalOcean App Platform kills TCP connections at ~30s. A 10 MB audio file takes 40–60s to proxy through the server to Cloudinary.

## Critical: route ordering in music.ts
`GET /music/upload-signature` MUST be registered BEFORE `GET /music/:id`.
If placed after, Express matches the wildcard first → `Number("upload-signature")` = NaN → DB query crashes.

**Rule:** Any named GET route under `/music/` must come before the `router.get("/music/:id", ...)` wildcard.
Same applies to `/admin/music/` — specific routes like `/admin/music/storage-stats` must precede `/admin/music/:id`.

## Admin uploads auto-approved
Tracks inserted by admin users get `is_active = TRUE` immediately.
Non-admin artist uploads get `is_active = FALSE` (pending review queue).
