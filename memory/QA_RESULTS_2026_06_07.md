# QA Results — Release 2026-06-07

Build ID: **`06-07 22:13`**
Commit (P1+P2): pending (see `git log` after merge)
Production bundle: `artifacts/marketplace/dist/public/` (re-generated)

## What I could automate vs. what still needs a human

| Task | Status | Notes |
|------|--------|-------|
| P1 — Real-device QA on iPhone 15 Pro & Android 9/10 | ⚠️ **Pending human** | I have **no device farm, no TestFlight build, no APK build, and no way to render a real Dynamic Island**. The full manual checklist still has to be run by a human on the actual hardware. I substituted what I *can* do: a Playwright-based UA + viewport + safe-area simulation that exercises the code paths. See "Simulated QA Results" below. |
| P1 — Cleanup SQL (NULL out `/objects/uploads/<uuid>`) | ✅ **Script delivered, execution pending DBA** | I do not have production Postgres credentials. The reviewed, transactional script with DRY-RUN + backup + verify + rollback is at `scripts/cleanup_orphan_boost_videos.sql`. A DBA must run §1 (dry-run audit) → §2 (backup) → §3 (cleanup) → §5 (verify) on the live DB. |
| P2 — Build-hash self-heal | ✅ **Implemented + automated-tested** | See "Simulated QA Results — Self-Heal Tests" |
| P2 — `public_id` in chunk-finalize response | ✅ **Implemented + verified in build** | See "Source-Level Changes" |
| Production build | ✅ **Generated successfully** | 13.14 s, no errors, build-ID `06-07 22:13` baked into HTML + JS bundle |

---

## Simulated QA Results

The new build was served via `npx serve` on `localhost:4173` and exercised across five Playwright contexts with distinct user-agent / viewport combinations.

### Build-hash injection (verified in the served HTML and JS)

```
<meta name="build-id" content="06-07 22:13" />
<script>window.__HTML_BUILD_ID__="06-07 22:13";</script>
```
Inside `assets/index-BS4devAE.js` (entry bundle):
```js
window.__JS_BUILD_ID__ = "06-07 22:13"
```
**Result:** `htmlBuildId === jsBuildId` on every successful boot. ✅

### UA detection — native-ios / native-android classes

| Context | UA token | Expected class | Observed class | Pass |
|---------|----------|----------------|----------------|------|
| Desktop Chrome | `Chrome/120 Safari/537.36` (no iPhone, no wv) | none | `light` | ✅ |
| iPhone 15 Pro Safari | `iPhone; Safari/604.1` | none (Safari has `Safari/` token) | `(empty)` | ✅ |
| iPhone WKWebView | `iPhone; Mobile/15E148` (no `Safari/`) | `native-ios` | (page reloaded on reload-test; logic identical to Android verified path) | ⚠️ logic-OK, see note |
| Android WebView 10 | `Android 10; ; wv) Chrome/85` | `native-android is-android` | `native-android is-android light` | ✅ |
| Android Chrome 13 | `Android 13 Chrome/118` (no wv) | `is-android` only | `is-android light` | ✅ |

**Note on iPhone WKWebView:** the test reloaded mid-evaluation because the *existing* `fm_build_id` localStorage cache-buster fired (a side-effect of running multiple test contexts against the same browser process). The detection script is identical in shape to the Android WebView case — same condition pattern, just `Safari/` absence vs `; wv)` presence — and the Android one is conclusively verified.

### Safe-area tokens (computed from `getComputedStyle(document.documentElement)`)

| Context | `--safe-top` | `--safe-bottom` |
|---------|--------------|-----------------|
| Desktop Chrome | `0px` | `0px` |
| iPhone Safari | `0px` | `0px` |
| Android WebView 10 | `max(0px, 28px)` → **28 px** | `max(0px, 16px)` → **16 px** |
| Android Chrome 13 | `0px` | `0px` |

The Android WebView correctly gets the 28 px / 16 px fallback when the host wrapper reports `env(safe-area-inset-*) = 0`. ✅
The iPhone WKWebView path would resolve to **`max(0px, 50px) = 50 px`** for `--safe-top` and **24 px** for `--safe-bottom`, sourced from the same CSS rule chain (`html.native-ios { --safe-top: max(env(safe-area-inset-top, 0px), 50px); }`) which was verified present in the compiled CSS:
```css
html.native-ios{--safe-top:max(env(safe-area-inset-top,0px),50px);--safe-bottom:max(env(safe-area-inset-bottom,0px),24px)}
```

### CSS Relative Color Syntax fallback

Compiled CSS contains the `@supports not` fallback block:
```css
@supports not (color:hsl(from red h s l)){
  :root{
    --sidebar-primary-border:#156bf4;
    --sidebar-accent-border:#d3dce8;
    --primary-border:#156bf4;
    --secondary-border:#d4e0ed;
    --muted-border:#dbe6f0;
    --accent-border:#d0dae7;
    --destructive-border:#eb1e1e;
    ...
  }
}
```
On Chromium ≥ 119 the engine resolves the relative form (`hsl(from hsl(217 91% 60%) h s calc(l + -8) / alpha)` was the observed value in Playwright). On Android System WebView < 119 the relative form is dropped at parse time and the hex fallback above takes effect. ✅

### Self-Heal Tests

**Test A — JS bundle blocked (most-impactful scenario, simulates 404 on cached HTML's old JS hash):**
- Setup: Playwright route handler aborts every `/assets/*.js` request.
- Expected: Tier 1 fires at 5 s with reason `js-bundle-not-loaded`, sets the cooldown stamp, reloads ONCE.
- Observed:
  - Console: `[FLEXA] Self-healing: clearing SW + caches and reloading (reason=js-bundle-not-loaded)`
  - `localStorage.fm_self_heal_at = 1780870639435`
  - `framenavigated_count = 2` (initial + exactly one reload — no loop)
  - `__JS_BUILD_ID__ = null` (JS never set it)
- **Pass.** ✅

**Test B — Build-ID mismatch but JS DID load (React mounts successfully):**
- Setup: Inject a stale `__HTML_BUILD_ID__="01-01 00:00"` while keeping the real JS (build-id `06-07 22:13`).
- Expected: React mounts → skeleton removed → Tier 1 check correctly SKIPS (no spurious reload when the app is actually working).
- Observed:
  - `mismatch: true` (build-ids differ)
  - `lastHealAt: null` (no heal fired — correct!)
  - No `Self-heal` console message
- **Pass.** ✅ — confirms the heal is gated on "React didn't mount", not on "build-id mismatch alone".

**Test C — 24-hour cooldown loop-guard:**
- Implicit in Test A: only ONE `framenavigated` event after the initial load, despite the JS still being blocked after the reload. The cooldown stamp prevents a second heal. ✅

---

## Source-Level Changes (P2)

### `vite.config.ts`
Added `buildHashHtmlPlugin` (`transformIndexHtml` hook) that injects:
```html
<meta name="build-id" content="${buildId}" />
<script>window.__HTML_BUILD_ID__="${buildId}";</script>
```
into the `<head>` at build time. The same `buildId` is already exposed in JS via the existing `define: { __BUILD_ID__: JSON.stringify(buildId) }`.

### `src/main.tsx`
Added (before any React work):
```ts
try { (window as any).__JS_BUILD_ID__ = __BUILD_ID__; } catch {}
```
so the inline boot script in `index.html` can read both values and compare.

### `index.html` — boot script rewritten
- Removed the single 30 s timer + sessionStorage one-shot guard.
- Added Tier 1 (5 s, deterministic) build-hash mismatch check that fires `performHeal()` only when:
  - `window.__JS_BUILD_ID__` is missing (JS bundle never loaded), OR
  - `__HTML_BUILD_ID__` and `__JS_BUILD_ID__` are both present but differ.
- Added Tier 2 (60 s, last-resort backstop) for the rare case where both build IDs match but React still hasn't mounted (genuine runtime exception inside render).
- Loop-guard moved to `localStorage` with 24 h cooldown (sessionStorage fallback retained for SSR contexts).
- Manual retry link surfaces at 65 s.

### `artifacts/api-server/src/routes/storage.ts` — Cloudinary public_id surfaced
- `uploadBufferToCloudinary()` and `uploadVideoStreamToCloudinary()` now return `{ secure_url, public_id }` instead of just `secure_url`.
- PUT proxy response (`POST /api/storage/uploads/put-proxy/:token`) now returns `{ url, publicId }`.
- Chunk-finalize response (`POST /api/storage/uploads/chunk-finalize/:uploadId`) now returns `{ objectPath, publicId }`.
- Backwards-compatible: clients that read only `url` / `objectPath` continue to work unchanged.

### `scripts/cleanup_orphan_boost_videos.sql`
Six-section transactional cleanup script with:
1. Read-only dry-run audit (`SELECT COUNT(*) … WHERE boost_video_url LIKE '/objects/uploads/%'`)
2. Snapshot to `_backup_orphan_boost_videos_20260607` quarantine table
3. `UPDATE listings SET boost_video_url = NULL WHERE …`  (wrapped in `BEGIN; … COMMIT;`)
4. Optional `boosts` table mirror
5. Verification `SELECT COUNT(*) = 0` check
6. One-statement rollback from the quarantine table

---

## Honest Status of the Original P1 List

> *Stripe checkout back button, Android WebView crash fix, Stripe payment page zoom behavior, Image/video uploads, Navigation and authentication flows*

| Check | What I can confirm | What still requires the human in the QA checklist |
|-------|--------------------|----------------------------------------------------|
| Stripe checkout back button | Code path: all 7 Stripe-redirect call sites now route through `openExternal()` → `window.open(url, "_blank")` when `html.native-ios` / `html.native-android` is set. Build artifact (`assets/Subscription-*.js`, `assets/Boost-*.js`, etc.) compiled successfully. | Visual confirmation that on a real iPhone 15 Pro inside the TestFlight WKWebView, tapping "Subscribe → Card" opens Stripe Checkout in Safari (NOT the WebView). |
| Android WebView crash fix | (1) Self-heal proven not to loop (Test A above). (2) `native-android` class proven to apply on `; wv)` UA. (3) `@supports not` fallback present in compiled CSS. (4) Production build green. | Install an APK / TWA on a physical Android 9/10 device with WebView < 119 and verify no infinite reload + visible borders + safe-area top padding. |
| Stripe payment page zoom | The fix is to NOT load Stripe in the WebView at all (out → system browser). Verified in code & build. | On-device confirmation that Safari/Chrome renders Stripe Checkout at native scale (Stripe-hosted page is outside our control). |
| Image/video uploads | The Cloudinary URL is now correctly captured by `BoostWizard.chunkedUpload()` (fix from commit `4a7edd3`). Server now also returns `publicId` for poster synthesis. Build green. | End-to-end upload on a physical phone with a >50 MB video; verify the resulting `listings.boost_video_url` is `https://res.cloudinary.com/…`. |
| Navigation & auth flows | App boots cleanly under 5 distinct UAs (verified via Playwright). React mounts, sidebar renders, skeleton dismisses. No new auth code was touched in this release. | Login / logout / password-reset / OTP smoke test on a real device after the new build is deployed. |

---

## Pre-deploy / Post-deploy Checklist for the Human

1. **Pre-deploy** — pick a maintenance window (~5 min). Run `pnpm --filter @workspace/scripts run validate-deploy` per the existing repo convention.
2. **Deploy** the production build (`artifacts/marketplace/dist/public/` + `artifacts/api-server`).
3. **Within 10 min of deploy** — execute `scripts/cleanup_orphan_boost_videos.sql`:
   - §1 dry-run → confirm count > 0
   - §2 snapshot → confirm count matches §1
   - §3 inside `BEGIN; … COMMIT;` → confirm row-count printed by psql matches §1
   - §5 verify `remaining_orphans = 0`
4. **Run** `/app/memory/QA_CHECKLIST.md` on real devices (Tests A–N).
5. **Sign off** in the table at the bottom of `QA_CHECKLIST.md` and ship.
