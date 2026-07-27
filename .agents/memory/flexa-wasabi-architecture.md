---
name: Flexa Music — Wasabi Storage Architecture
description: Permanent Wasabi S3 storage rules for all music audio and cover files. Never change this.
---

# Flexa Music — Wasabi S3 Architecture (permanent)

**Why:** User explicitly declared this the permanent production architecture. Must never be changed unless explicitly requested.

## Rules
- Audio files live ONLY in Wasabi bucket `flexa-music`, region `us-east-1`, endpoint `https://s3.us-east-1.wasabisys.com`.
- Never store audio on local filesystem, Replit Object Storage, DigitalOcean, or GitHub.
- PostgreSQL stores only metadata + URLs. Wasabi stores every audio/cover file permanently.

## Env vars (set in Secrets, not dev)
- `WASABI_ACCESS_KEY`, `WASABI_SECRET_KEY`, `WASABI_BUCKET_NAME`, `WASABI_REGION`, `WASABI_ENDPOINT`
- In dev: server warns "Wasabi storage NOT configured" — expected, non-fatal.

## Central module
`artifacts/api-server/src/lib/wasabi.ts`
- `uploadMusicAudio(buffer, mime, originalName?)` → `{ key, url }` — stores under `music/audio/uuid.ext`
- `uploadMusicCover(buffer, mime, originalName?)` → `{ key, url }` — stores under `music/covers/uuid.ext`
- `deleteMusicFile(key)` — soft-fails if key missing
- `getStreamUrl(key)` — public URL (public bucket) or signed URL (private bucket, 1-hr TTL)
- `getPublicUrl(key)` — direct URL always
- `extractKey(urlOrKey)` — strips endpoint+bucket prefix to get bare key
- `isConfigured()` — checks env vars
- Auto-detects bucket visibility once on startup (cached); override with `WASABI_PUBLIC=true|false`

## DB columns
`music_tracks` has `storage_key TEXT` (audio Wasabi key) and `cover_storage_key TEXT`.
Always populate both when uploading. Use them for deletes/updates instead of parsing `audio_url`.

## Streaming
`GET /api/music/stream/*key` — 302/307 redirect to Wasabi URL; browser handles Range natively.
`GET /api/music/stream-url/:trackId` — returns `{ url, key }` for mobile/native players.

## Supported audio formats
MP3, WAV, FLAC, AAC, M4A (and OGG/WebM). Max file size: 500 MB.

## How to apply
Any future feature touching music uploads, podcasts, albums, artists, or audio MUST import from `wasabi.ts`. Do NOT use `objectStorage` (Replit GCS) or any other storage for audio files.
