---
name: Flexa Market deploy & debug
description: How the Flexa Market marketplace is edited, deployed, and reliably inspected
---

# Flexa Market (Haitian marketplace)

- GitHub repo `sammyjeanlouis8-max/Flexa-market`, hosted on Digital Ocean with **auto-deploy from `main`**.
- The marketplace is **NOT a local artifact** in this workspace (only `api-server` + `mockup-sandbox` are local). Edit marketplace files via the **GitHub Contents API** using `GITHUB_TOKEN` (never print its value). For large files: write `{message,content(base64),sha,branch:'main'}` to a temp JSON and `curl -X PUT --data @file` (inline base64 hits "Argument list too long").
- The user communicates **only in Haitian Creole** — always respond in Haitian Creole.

## Verifying a deploy / reading the real browser state
- **Why:** the Replit `external_url` screenshot tool shows a false centered orange spinner for this app (it captures before the SPA finishes; the app holds long-lived connections so network never goes idle). That spinner is a **tooling artifact, not a real bug**.
- **How to apply:** install Nix `chromium` via `installSystemDependencies(["chromium"])`, then run puppeteer with `executablePath` pointing at the Nix chromium binary (puppeteer's bundled chrome fails: missing `libglib-2.0.so.0`). Load the live URL with `waitUntil:'networkidle2'` + a few seconds, then read `document.body.innerText` and listen for `pageerror`/`console.error`. This gives ground truth without deploy waits.
- Deploy lag on DO is real but variable: ~3–12 min per push (not permanently stuck). Confirm a deploy landed by polling `https://flexamarket.com/` for the `assets/index-<hash>.js` filename changing.

## Build characteristics
- Build is `vite build` with **no typecheck**, so broken TS still builds and ships. Validate edits compile locally first with the repo's esbuild binary (pass the `.tsx` directly + `--jsx=automatic`).
- `__BUILD_ID__` cache-buster + chunk-error auto-reload live in `main.tsx`. **Never call `window.location.reload()` during React render** — it caused an infinite reload loop; do reloads inside `useEffect`/event handlers instead.

## Video feed (TikTok-style player)
- `/api/videos/feed` returns `{videos:[]}` when called **without a logged-in user token** (geo "Haiti" from server IP). **You cannot reproduce the feed via curl/puppeteer without a real user token** — the carousel on Home and the fullscreen `/videos` both use this same endpoint. Don't waste time probing it anonymously.
- **Why:** wasted a session assuming the feed was broken when it was just auth/geo-gated.
- Black-screen-on-play root cause is the **video file failing to render frames** (load failure / likely iPhone HEVC, no server-side transcoding exists — backend has `sharp` for images only, no ffmpeg). The player's autoplay logic (muted-first `play()` on `isActive`) is sound; don't rewrite it.
- **How to apply:** mitigated in `VideoFeed.tsx` VideoCard with a persistent thumbnail `<img>` fallback behind `<video>` + a capped retry (`errorCountRef`, stop after 3 errors → `loadFailed` → tap-to-retry overlay) instead of the old infinite 1.5s silent reload loop. A real fix for HEVC requires server-side transcoding.

## Autoplay audio unlock (shared session flag)
- Browsers block unmuted autoplay until the first user gesture. Both VideoFeed.tsx and BoostVideoOverlay.tsx (sponsored ad) must share the SAME unlock state via `@/lib/audioUnlocked` (sessionStorage key `flexaAudioUnlocked`, dispatches `flexa:audio-unlocked` event).
- Pattern: on mount try `play()` unmuted; on success call `setAudioUnlocked(true)`. On muted fallback, only show the "Tape pou son" hint if `!isAudioUnlocked()`, and arm a one-shot window gesture listener (touchstart/pointerdown/click, capture) that unmutes + `setAudioUnlocked(true)`. Also listen for `flexa:audio-unlocked` to unmute if unlocked elsewhere.
- Why: once unlocked once per session, every later ad/video must come up with sound and NEVER re-show the tap-for-sound prompt. The "Tape pou son" string lives in BoostVideoOverlay.tsx (hardcoded) — NOT VideoFeed.tsx.

## i18n (FR/HT toggle)
- Locale files: `artifacts/marketplace/src/i18n/locales/ht.ts` (first key `nav`) and `fr.ts` (first key `footer`). New shared keys for our feature work live under a `tr:` namespace inserted right after `export default {`. Both files MUST stay key-parity (every `t("tr.*")` must exist in both) or the toggle silently shows the key.
- Interpolation uses i18next `{{count}}`/`{{amount}}` → call `t("tr.key", { count })`. A page can ship with hardcoded strings still present; vite build has no typecheck so missing localization never errors — only a manual sweep catches stragglers.
- **VideoFeed.tsx t-scope trap:** the file has several sub-components. `CommentRow` receives `t` as a PROP (and its prop type must allow options: `t: (key, opts?) => string`, not `(key)=>string`, or interpolation breaks typecheck). But `ExpandableCaption`, `CommentActionMenu`, `ReplyActionBtn` have NO `t` — add `const { t } = useTranslation();` inside each before using it. Also `useTranslation()` must be declared BEFORE any `useSEO({...t()})` call in the same component (const TDZ).
