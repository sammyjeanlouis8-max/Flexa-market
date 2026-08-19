---
name: Flexa promo video feed playback
description: Durable sound, delivery, normalization, and freeze-recovery rules for promoted videos
---

# Promo video feed playback

## Sound and navigation

- Browsers force autoplay to start **muted**; sound can only be enabled by a real user gesture.
- **Rule:** the first tap on a muted active video must unlock sound and keep playing; only later taps toggle play/pause. Keep a visible sound hint while muted.
- **Why:** the #1 user complaint ("pa gen son") is almost always just undiscovered autoplay-mute, not missing audio tracks.
- Back should return to actual browser history when available and use home only as fallback.
- **Why:** the feed is commonly opened from several different entry points.

## Stall / freeze recovery

- **Never call `video.load()` on every `onWaiting`/`onStalled`.** load() resets the element and re-downloads from scratch; on slow networks a brief buffer wait becomes a visible freeze/reload loop.
- Recovery order: gentle `el.play()` nudge first (preserves buffer); hard `load()` only as last resort and **at most once per activation**.
- The one-time gate flag must be reset **only when a card becomes active** — NOT in `onPlay` (onPlay fires repeatedly within one activation and would reopen the loop).
- Never let a stale card's recovery callback reactivate playback after the user swipes away.

## Normalized ingestion and delivery

- A storage URL is not proof that video bytes are browser-safe. New Boost videos must finish server-side normalization to H.264/yuv420p video plus AAC audio MP4; video-only input gets silent AAC, and conversion failure must fail closed.
- Browser metadata checks are UX hints, not a trust boundary. Boost writes require a short-lived owner-bound proof from normalized ingestion.
- Large uploads must be exact, owner-bound, disk-backed, and processed outside the request to prevent heap exhaustion and gateway timeouts.
- Serve new Wasabi videos through a same-origin Range-capable endpoint. Keep persisted legacy media readable, but never let compatibility become a new-write bypass.

## Codec-capable verification

- A codec-free headless browser can report `MEDIA_ERR_SRC_NOT_SUPPORTED` for healthy H.264/AAC media.
- **Why:** network success and MP4 labels do not prove that a real frame decoded.
- **How to apply:** use a codec-capable browser and confirm nonzero video dimensions, advancing time, a visible decoded frame, and successful tap-to-unmute.
