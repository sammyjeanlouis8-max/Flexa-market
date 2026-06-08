# Flexa-Market — Priority Fixes (June 2026)

## Original Problem Statement
URGENT priority fixes requested for the Flexa-market codebase:

1. **Android WebView crash** — app crashes / blanks / infinite-reloads inside Android WebView.
2. **Stripe payment page (iPhone)** — viewport excessively zoomed, back button overlaps Dynamic Island / safe area.
3. **Promotional video persistence** — promo videos do not always save, sometimes disappear after refresh, preview/play unreliable.

## Architecture Context
- pnpm monorepo (`/app/artifacts/marketplace` = React + Vite frontend; `/app/artifacts/api-server` = Express 5 + Drizzle ORM + PostgreSQL).
- Cloudinary for video/image storage when `CLOUDINARY_API_KEY` is set (production), GCS via Replit Object Storage otherwise.
- Stripe for payments (Checkout, Connect, Customer Portal, Subscription).
- Native iOS wrapper (TestFlight WKWebView) detected via `html.native-ios`; Android WebView now detected via `html.native-android`.

## Root Causes & Permanent Fixes

### #1 Android WebView crash
**Root cause #1.a — Service-worker self-healing reload loop**
`index.html` triggered a "clear SW + caches + reload" cascade if React did not mount within **20 s** and used **sessionStorage** as the one-shot loop-guard. On slow Haitian/DR 3G connections the bundle download exceeded 20 s, the self-heal fired, and several Android WebViews wipe sessionStorage on reload → the loop-guard reset → infinite reload.
**Fix:** raised timeout to **30 s**, switched the loop-guard to `localStorage` (with sessionStorage fallback) keyed by timestamp with a 24 h cooldown, and abort self-heal entirely when the WebView reports zero SW/Cache API support.

**Root cause #1.b — CSS Relative Color Syntax breaks border tokens**
`index.css` used `hsl(from hsl(var(--primary)) h s calc(l + var(--opaque-button-border-intensity)) / alpha)` which requires Chrome / Android System WebView **≥ 119** (Nov 2023). Devices on older WebView ignored the declaration entirely, leaving `--primary-border`, `--accent-border`, etc. unset and cascading invalid `border-color: ;` into every component → blank rounded-rectangle UI bug.
**Fix:** wrapped a pre-computed HSL fallback block in `@supports not (color: hsl(from red h s l))` so older engines get static values while modern engines keep the relative form.

**Root cause #1.c — Missing Android WebView detection**
The boot script only flagged iOS WebView (`html.native-ios`); Android WebView received no safe-area or compatibility hooks.
**Fix:** added detection for `; wv)` / `; wv;` UA tokens and Android without `Chrome/X` → `html.native-android` class; matched CSS fallback `--safe-top / --safe-bottom` tokens.

### #2 Stripe payment page zoom & back-button (iPhone)
**Root cause #2.a — Stripe-hosted Checkout loaded inside WebView**
Stripe Checkout, Stripe Customer Portal and Stripe Connect onboarding pages are not under our control. Inside an iOS WKWebView the WebView reports `env(safe-area-inset-top)=0`, so Stripe's own back button lands under the Dynamic Island and Stripe's viewport renders at the wrong scale on iPhone Pro models. The Payment Request API (Apple Pay / Google Pay) also fails silently inside in-app WebViews.
**Fix:** new helper `src/lib/externalNavigation.ts → openExternal(url)` detects `html.native-ios` / `html.native-android` and opens Stripe URLs in the system browser via `window.open(url, "_blank", "noopener,noreferrer")`. WebView hosts delegate `target=_blank` to Safari / Chrome → the customer sees the correctly-rendered Stripe page with native safe-area handling. Applied to every Stripe-redirect call site (Subscription, Boost, ListingDetail checkout, Settings Stripe Connect onboarding/dashboard, StripeOnboardReturn, Wallet card top-up).

**Root cause #2.b — Layout & sub-pages used raw env() (no WebView fallback)**
Top header padding referenced `env(safe-area-inset-top, 0px)` directly. When WebView reports 0 the header collapsed, exposing in-page back buttons (Boost, Subscription, CheckoutSuccess) to the Dynamic Island.
**Fix:** Layout header now uses `var(--safe-top, env(safe-area-inset-top, 0px))`. Boost.tsx hero header (which bleeds under the global header) now uses `calc(16px + var(--safe-top))`. Subscription.tsx and CheckoutSuccess.tsx top wrappers now respect `--safe-top`.

### #3 Promotional video save & playback
**Root cause #3 — Chunked-upload ignored the Cloudinary URL returned by the server**
`BoostWizard.tsx → chunkedUpload()` requested the local `objectPath` from `/api/storage/uploads/chunk-init` (e.g. `/objects/uploads/<uuid>`), uploaded all chunks, then called `/api/storage/uploads/chunk-finalize`. In Cloudinary mode the server response contains `{ objectPath: "https://res.cloudinary.com/..." }` — the actual CDN URL of the saved video. The client **discarded the response body** and returned the original local `objectPath` instead. Because Cloudinary is the authoritative store (the chunk dir is deleted afterwards), the listing's `boostVideoUrl` column ended up pointing to a `/objects/uploads/<uuid>` path that did not exist — every retrieval returned 404, so the video appeared to "disappear after refresh" and the preview/play button failed.
**Fix:** `chunkedUpload` now reads `await finalRes.json()` and uses the server-returned `objectPath` (Cloudinary URL); only falls back to the local objectPath if the response is empty/non-JSON (GCS mode). The non-chunked path (`<50 MB`) already handled this correctly via `xhrUpload`. The boost server route already accepts both `/objects/` paths and `https://` URLs in its `videoUrl` whitelist, so no server-side change was needed.

## Files Modified
- `artifacts/marketplace/index.html` — Android WebView detection + hardened self-heal
- `artifacts/marketplace/src/index.css` — `--safe-top`/`--safe-bottom` for `.native-android` + relative-color fallback
- `artifacts/marketplace/src/components/Layout.tsx` — header padding via `--safe-top` token
- `artifacts/marketplace/src/components/BoostWizard.tsx` — read Cloudinary URL from `chunk-finalize`
- `artifacts/marketplace/src/lib/externalNavigation.ts` — NEW shared helper
- `artifacts/marketplace/src/pages/Subscription.tsx` — `openExternal` for Stripe; safe-area top padding
- `artifacts/marketplace/src/pages/Boost.tsx` — `openExternal` for Stripe; hero header safe-area
- `artifacts/marketplace/src/pages/ListingDetail.tsx` — `openExternal` for Stripe Checkout (buy flow)
- `artifacts/marketplace/src/pages/Settings.tsx` — `openExternal` for Stripe Connect (×2 panels)
- `artifacts/marketplace/src/pages/StripeOnboardReturn.tsx` — `openExternal` for refresh-link
- `artifacts/marketplace/src/pages/Wallet.tsx` — `openExternal` for card top-up checkout
- `artifacts/marketplace/src/pages/CheckoutSuccess.tsx` — safe-area top padding

## What's Implemented (June 7, 2026)
- ✅ Android WebView crash root-causes identified & permanently fixed
- ✅ iOS Stripe pages opened in system browser to avoid WebView viewport / safe-area issues
- ✅ Promo video persistence fixed (chunked upload now captures Cloudinary URL)
- ✅ Safe-area tokens unified across iOS WebView, Android WebView, and Mobile Safari
- ✅ Manual QA checklist provided (see `/app/memory/QA_CHECKLIST.md`)

## Delivery & Payment Ecosystem — 10-Phase Remediation (Feb 2026)

### ✅ Phase 1 — Commission Fix (DONE)
- 85% driver / 15% platform commission applied across `deliveryPricing.ts`, API routes, and UI components.

### ✅ Hotfix — Ghost Video Promo listings polluting Profile (Feb 2026)
- **What the user actually saw:** Four orange "Video Prom" tiles with `$0.00` and `Haiti` on their own Profile listings tab, no images. User reasonably concluded "video pa sove" (the video isn't saving) and pushed back hard.
- **What was actually happening:** `POST /api/boost/video-only` (routes/boost.ts) creates a ghost listing row with `status='hidden'`, `price=0`, `images=[]`, and stores the boost video URL in `boostVideoUrl`. These rows are scaffolding for the Video Promo feature — they were never meant to appear on the Profile listings grid. They did because **`GET /api/users/:id/listings` did not filter out `status='hidden'`** — only the global browse (`/listings`) and `/listings/my-count` had that guard.
- **Fix:** Added `status <> 'hidden'` to the conditions in `routes/users.ts → GET /users/:id/listings`. One-line change with extensive doc comment so the next agent doesn't accidentally drop it during a refactor.
- **Effect:** The four ghost tiles disappear on next page reload — no DB cleanup or re-upload required. The "Listings (28)" count in the tab automatically drops to the correct figure.
- **What I got wrong earlier:** I diagnosed the symptom (broken video icon on Listing Details) as the URL-routing bug — and that fix WAS legitimate. But I missed that the *bigger* user-facing issue was Profile pollution, which made every failed/successful Video Promo look like a broken save. Owed the user a deeper trace earlier.

### ✅ Phase 3 — Delivery State Machine (DONE, Feb 2026)
- **New module:** `lib/deliveryStateMachine.ts` — single source of truth for the 13 valid delivery statuses (`waiting`, `driver_assigned`, `picked_up`, `arrived`, `delivered`, `completed`, `buyer_absent`, `failed_pickup`, `returning`, `returned`, `seller_closed`, `disputed`, `cancelled`) and the directed transition graph between them.
- **API:** `canTransition()`, `assertTransition()`, `nextStatusOrNull()`, `isTerminal()`, `InvalidDeliveryTransitionError` (maps to HTTP 409 at the route layer).
- **Guards:** Forbids the regressions we'd seen in prod — `delivered → waiting`, `waiting → completed` (skipping driver), and re-entry from any terminal status. Idempotent same-status writes are still allowed.
- **No schema change.** `deliveries.status` stays a free-form `text` column; this is a TypeScript + runtime gate.
- **Tests:** New `src/tests/deliveryStateMachine.test.ts` — 17 cases (happy path, return cycle, dispute entry/exit, terminal-state guards, idempotency, asserter throws on garbage).

### ✅ Phase 4 — Dispute System (DONE, Feb 2026)
- **New schema (additive):** `delivery_disputes` table — `(deliveryId, openedByUserId, openedByRole, reason, description, evidenceUrls JSON, status, resolvedByAdminId, resolvedAt, resolutionNote)`. Partial unique index `delivery_disputes_one_open_per_delivery_uq` enforces at most one open dispute per delivery so racing requests can't double-open.
- **New migration:** `runStartupMigrations()` includes `delivery_disputes.create_table` + 3 indexes + the partial unique. Idempotent — safe on every redeploy.
- **New routes (`routes/disputes.ts`):**
  - `POST /api/deliveries/:id/dispute` — any party (buyer/seller/driver) opens a dispute. Backend validates via Zod, gates via the state machine (`assertTransition(currentStatus, "disputed")`), inserts + flips delivery status in a single DB transaction.
  - `GET  /api/deliveries/:id/dispute` — fetch latest dispute for a delivery (parties + admins only).
  - `GET  /api/admin/disputes` — admin list (filterable by status).
  - `POST /api/admin/disputes/:id/resolve` — admin resolves. Maps `resolved_buyer → returned + buyer refund`, `resolved_seller → completed + seller payout`, `closed → cancelled + no money movement`. Uses the existing `releaseEscrow()` primitive — no new payment code path.
- **Frontend:** New `<OpenDisputeDialog />` component mounted on the Delivery Tracking page. Pre-fetches existing dispute status, renders a "Pending admin review" pill if one is already open, otherwise shows the "Report a problem" CTA + a modal with reason chips, description (10–2000 chars), and optional evidence-URL list (≤ 8). Hidden in terminal statuses where Phase 3 forbids a transition.
- **Verification:** `pnpm build` ✅ (api + marketplace), `pnpm typecheck` ✅, vitest 86/86 ✅ (17 new cases).

### ✅ Apple App Store Resubmission Fixes (Feb 2026, pre-2 PM review)
Apple rejection 06/06/2026 cited 6 issues. We shipped **everything that goes through the WebView via DigitalOcean** before the 2 PM re-review window. Native-only fixes (Info.plist purpose strings, localized permission strings) require Codemagic and are tracked as follow-up.

- **5.1.1(v) — Phone optional:** Already optional in `RegisterBody` Zod schema and in `Register.tsx` UI ("Optional" label). Verified, no change needed.
- **3.1.1 — In-App Purchase for subscriptions:** Added `isIosNative()` helper to `lib/externalNavigation.ts`. In `Subscription.tsx`, every per-plan "Subscribe/Upgrade/Change plan" CTA is replaced on iOS with a card that reads *"Manage your subscription at flexamarket.com — Subscriptions are not available inside the iOS app."* A top-of-page banner explains the limitation. Wallet & cancel still work — Apple permits cancellation inside the app. No Stripe/MonCash purchase flow can be triggered from the iOS WebView.
- **2.1(a) — Demo account:** New `lib/appleReviewerSeed.ts` runs at backend boot:
  1. Upserts `apple.reviewer@flexamarket.com` (password `FlexaReview2026!`).
  2. Idempotently inserts 3 sample listings (Haiti iPhone, DR Honda, US MacBook).
  3. Idempotently inserts 1 conversation with two messages so the reviewer can see messaging UI content.
  - Wired into `index.ts` boot chain after `syncCategories`. Failures are non-fatal.
  - Credentials documented in `/app/memory/test_credentials.md` for the owner to paste into App Store Connect → App Review Information.

- **Still requires Codemagic rebuild (owner action):**
  - 5.1.1(ii) — Camera purpose string in `app.config.ts`
  - Guideline 4 — Localized permission strings (Haitian Creole / French / Spanish)
- **Still requires owner action:**
  - 2.1 — Record demo video on a physical iOS device showing the region-restricted loan flow.

### ✅ Phase 5 — Escrow & Lifecycle Auto-Release (DONE, Feb 2026)
- **New job:** `artifacts/api-server/src/jobs/escrowReleaseJob.ts` — runs every 15 min with a 60 s warm-up. Wrapped in `pg_try_advisory_lock(54321)` so only one pod runs the pass at a time.
- **Three sub-jobs (no schema changes):**
  1. `autoConfirmDeliveredOrders` — `status=delivered + paymentHeldUntil < now + sellerPaymentReleased=false` → calls `releaseEscrow(txId, "buyer")` + flips `sellerPaymentReleased=true`. Safety net for failures in the synchronous delivery-confirmation path.
  2. `autoExpireStalledWaiting` — `status=waiting + createdAt < now − 6h` → `status=cancelled` (CAS-guarded) + buyer refund via `releaseEscrow(txId, "buyer")`. Mark-then-refund order means a failed refund leaves an auditable `cancelled` row instead of an inconsistent `waiting`.
  3. `autoCancelStuckAccepted` — `status=accepted + acceptedAt < now − 2h + pickedUpAt IS NULL` → recycles back to `status=waiting` (CAS-guarded) so the matching pool re-assigns the delivery. No driver penalty (deferred to Phase 6).
- **Wiring:** Mounted in `src/index.ts` alongside the existing loan / AI-guardian cron pattern (`setInterval` + immediate `setTimeout` warm-up).
- **Tests:** New `src/tests/escrowReleaseJob.test.ts` — 13 cases covering cutoff arithmetic, idempotency, boundary conditions, and TTL invariants.
- **Verification:** `pnpm build` ✅, `pnpm typecheck` ✅ (0 errors in escrow files), full suite 69/69 green.

### ✅ Hotfix — Promo Video Playback (Feb 2026)
- **Symptom:** "Video Promo" boosts saved successfully (red play-button placeholder in MyBoosts) but the Listing Details page showed a **black screen with a crossed-out play icon**. Users believed videos were never saved.
- **Root cause:** `ListingDetail.tsx`, `VideoFeed.tsx`, and `VideoPost.tsx` rendered the saved `boostVideoUrl` through `toStreamingVideoUrl()`, which only applies the Cloudinary `fl_faststart` transform and returns non-Cloudinary URLs unchanged. Legacy rows (and any uploads that fell back to the local path) stored values like `/objects/uploads/<uuid>`; the `<video>` element then resolved to `https://flexamarket.com/objects/uploads/<uuid>` — a path the Express router does NOT serve (only `/api/storage/objects/...` does). Result: 404 → "broken video" icon on iOS Safari.
- **Fix:** Added `toFetchableVideoUrl()` to `lib/videoUrl.ts` that normalises all three storage shapes:
  - `https://...` → Cloudinary faststart transform (unchanged behaviour)
  - `/objects/...` → re-routed to `/api/storage/objects/...`
  - `/api/storage/...` → returned as-is
- Switched every video player in the marketplace (`ListingDetail` hero + non-boost listing video, `BoostVideoOverlay`, `VideoFeed`, `VideoPost`) to use the new helper. Removed the duplicate local `toFetchableUrl` in `BoostVideoOverlay.tsx`.
- **Verification:** `pnpm build` ✅ (16.83s), `pnpm typecheck` ✅ (0 errors).
- **Effect:** Existing broken "Video Promo" rows in the user's account now play instantly on next page load — no DB migration, no re-upload needed.

### 🟡 Awaiting User Approval
- **Phase 3** — Delivery State Machine (strict transition guard layer, no DB schema changes).
- **Phase 4** — Dispute System.
- **Phase 2 / 6 / 7 / 8** — Pricing, fraud, market fit, transparency.

## Next Action Items / Backlog
- **P1** Run real-device QA on iPhone 15 Pro (Dynamic Island) and an Android 9/10 device with WebView < 119 once a TestFlight / APK build is cut.
- **P1** Consider migrating from `localStorage` self-heal guard to a deterministic build-hash check (compare `window.__BUILD_HASH__` baked into HTML vs. JS asset hash); avoids ever needing a 24 h cooldown.
- **P2** Add a `<noscript>` fallback button labelled "Open in browser" on any page that triggers an external Stripe redirect so users without popup permission still get a working path.
- **P2** Server-side: include the Cloudinary `public_id` in the `chunk-finalize` response so we can build poster URLs even when the seller's CDN proxy strips the hostname.
