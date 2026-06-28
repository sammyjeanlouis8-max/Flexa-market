---
name: Flexa promo video feed (VideoFeed.tsx) playback gotchas
description: Sound/autoplay, back-button, and stall/freeze recovery rules for the TikTok-style promo feed
---

# Promo video feed playback (artifacts/marketplace/src/pages/VideoFeed.tsx)

Three classes of bug recur on this feed. The durable rules:

## Sound / autoplay
- Browsers force autoplay to start **muted**; sound can only be enabled by a real user gesture.
- Global unlock state lives in `lib/audioUnlocked.ts` (sessionStorage `flexaAudioUnlocked` + `flexa:audio-unlocked` CustomEvent that syncs every card's muted state).
- **Rule:** the user's FIRST single-tap on a muted/active video must UNMUTE (set unlock + el.muted=false + play), not toggle play/pause. Only after unmute does single-tap toggle play/pause. A tiny top-right speaker icon alone is not discoverable — keep a visible "tap for sound" hint while muted.
- **Why:** the #1 user complaint ("pa gen son") is almost always just undiscovered autoplay-mute, not missing audio tracks.

## Back button
- Header back should use `window.history.length > 1 ? history.back() : navigate("/")`, not bare `navigate("/")`.
- **Why:** history-back returns the user to the actual previous screen (feed is usually opened from the drawer/a link) and sidesteps wouter base-path edge cases. popstate drives wouter, so it's SPA-safe.

## Cloudinary URL transform (the REAL "no sound" + "freeze" cause)
- Promo videos are served from **Cloudinary** (`res.cloudinary.com/.../video/upload/...`), not object storage. `toStreamingVideoUrl()` exists in BOTH `api-server/src/routes/videos.ts` AND `listings.ts` — fix both together.
- **This Cloudinary account returns HTTP 400 for the `fl_faststart` flag.** Any delivery URL containing `fl_faststart` → 400 (`image/gif`, size 0) → the `<video>` never loads → user sees a frozen poster with NO sound. That presents as the "pa gen son" + "video freezes" complaints — it is NOT an audio-track or autoplay-mute problem.
- Second trap: stored `boostVideoUrl` already carries a `vc_h264,f_mp4` transform, and the old `toStreamingVideoUrl` did a naive `.replace("/video/upload/", "/video/upload/fl_faststart,vc_h264,f_mp4/")`, **stacking a duplicate** transform.
- **Rule:** the transform must be idempotent — strip any pre-existing transformation segment(s) before the `v123` version marker, then inject exactly `vc_h264,ac_aac,f_mp4` (NO `fl_faststart`). `ac_aac` keeps audio; a video-only re-encode can silently drop sound.
- **Verify with ffprobe + a browser-like GET** before/after: original + `vc_h264,ac_aac,f_mp4` → HTTP 206 `video/mp4` with an `aac,audio` stream; `fl_faststart...` → HTTP 400.

## Stall / freeze recovery
- **Never call `video.load()` on every `onWaiting`/`onStalled`.** load() resets the element and re-downloads from scratch; on slow networks a brief buffer wait becomes a visible freeze/reload loop.
- Recovery order: gentle `el.play()` nudge first (preserves buffer); hard `load()` only as last resort and **at most once per activation**.
- The one-time gate flag must be reset **only when a card becomes active** — NOT in `onPlay` (onPlay fires repeatedly within one activation and would reopen the loop).
- After a hard `load()`, restore `currentTime` only inside a one-shot `loadedmetadata` listener wrapped in try/catch — setting currentTime right after load() at readyState 0 throws `InvalidStateError`.
