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

## Stall / freeze recovery
- **Never call `video.load()` on every `onWaiting`/`onStalled`.** load() resets the element and re-downloads from scratch; on slow networks a brief buffer wait becomes a visible freeze/reload loop.
- Recovery order: gentle `el.play()` nudge first (preserves buffer); hard `load()` only as last resort and **at most once per activation**.
- The one-time gate flag must be reset **only when a card becomes active** — NOT in `onPlay` (onPlay fires repeatedly within one activation and would reopen the loop).
- After a hard `load()`, restore `currentTime` only inside a one-shot `loadedmetadata` listener wrapped in try/catch — setting currentTime right after load() at readyState 0 throws `InvalidStateError`.
