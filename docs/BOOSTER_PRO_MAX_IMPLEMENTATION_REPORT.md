# Flexa Market Booster Pro Max — Technical Report

## Summary

Production upgrade of the Flexa Market Booster into a Meta Ads–inspired **Booster Pro Max** advertising platform: seven redesigned pages, saved audiences, playback-accurate 10s skip player, real ad-event analytics, pause/resume lifecycle, and geographic radius matching that respects privacy rules.

Existing authentication, wallet/Stripe/USDT payment rails, chunked video upload/normalization, and listing boost activation paths are preserved.

---

## Modified files

### Database / schema
- `lib/db/src/schema/listings.ts` — boost lifecycle counters + `lifecycleStatus`, `pausedAt`, `mediaType`
- `lib/db/src/schema/boost_video_uploads.ts` — `purpose` (`boost` | `listing`)
- `lib/db/src/schema/saved_audiences.ts` — **new**
- `lib/db/src/schema/boost_ad_events.ts` — **new**
- `lib/db/src/schema/index.ts` — exports

### API server
- `artifacts/api-server/src/lib/migrations.ts` — startup migrations for new tables/columns
- `artifacts/api-server/src/lib/boostTargeting.ts` — continuous radius 5–100 km; Advantage+ skips Haiti department requirement
- `artifacts/api-server/src/lib/haitiGeo.ts` — **new** commune centroids + Haversine radius helpers
- `artifacts/api-server/src/lib/boostVideoUploadStore.ts` — purpose on upload session
- `artifacts/api-server/src/routes/boosterPro.ts` — **new** audiences CRUD, campaigns, pause/resume, analytics, idempotent events
- `artifacts/api-server/src/routes/boost.ts` — multi-city matching, paused exclusion, radius filter, video-only accepts Pro audience/plan
- `artifacts/api-server/src/routes/storage.ts` — 120s cap for boost purpose uploads; 300s for listing
- `artifacts/api-server/src/routes/index.ts` — mount `boosterProRouter`
- `artifacts/api-server/src/tests/haitiGeo.test.ts` — **new**

### Marketplace UI
- `artifacts/marketplace/src/booster/**` — Pro layout, draft store, 7 pages, event tracker, CSS design system
- `artifacts/marketplace/src/components/BoostVideoOverlay.tsx` — Pro player, playback-time skip, unmute, image ads, event tracking, error recovery
- `artifacts/marketplace/src/pages/Boost.tsx` — Booster Pro handoff + 120s video validation
- `artifacts/marketplace/src/components/BoostWizard.tsx` — 120s video validation
- `artifacts/marketplace/src/lib/videoUploadQueue.ts` — passes `purpose` to chunk-init
- `artifacts/marketplace/src/App.tsx` — `/booster/*` routes; `/my-boosts` → Pro campaigns

---

## New components / pages

| Route | Page |
|---|---|
| `/booster`, `/booster/create` | Create Boost (image/video, listing media reuse, upload) |
| `/booster/audience` | Audience Targeting (Advantage+ / Manual, multi-city, radius slider, saved audiences) |
| `/booster/budget` | Budget & Duration (min $2, presets, estimate disclaimer) |
| `/booster/review` | Review & Confirmation → payment handoff / video-only launch |
| `/booster/campaigns`, `/my-boosts` | My Boosts (Active / Paused / Completed / Drafts, pause/resume) |
| `/booster/analytics` | Boost Analytics (real counters + daily trend + geo) |
| `/booster/audiences` | Saved Audiences CRUD + activate/deactivate |

Shared: `BoosterLayout`, `booster.css`, `draft.ts`, `trackEvent.ts`.

---

## API changes

| Method | Path | Notes |
|---|---|---|
| GET | `/api/booster/geo/haiti` | Departments + radius bounds |
| GET/POST | `/api/booster/audiences` | List / create (owner-scoped) |
| PATCH/DELETE | `/api/booster/audiences/:id` | Update / delete / activate |
| GET | `/api/booster/campaigns` | Owner campaign list + spend pacing |
| POST | `/api/booster/campaigns/:boostId/pause` | Pause + stop delivery |
| POST | `/api/booster/campaigns/:boostId/resume` | Resume eligible paid campaigns |
| GET | `/api/booster/campaigns/:boostId/analytics` | Totals, daily impressions, geo, real unique reach |
| POST | `/api/booster/events/track` | Idempotent ad events (optionalAuth + rate limit) |

Existing `/api/boost/*` payment and delivery endpoints remain the source of truth for checkout.

---

## Database migrations (startup)

Applied idempotently via `runStartupMigrations()`:

- `boosts.lifecycle_status`, `paused_at`, `media_type`
- `boosts.video_starts`, `video_completions`, `ten_sec_views`, `skips`, `messages`
- `boosts_user_lifecycle_idx`
- `saved_audiences` table + indexes
- `boost_ad_events` table + idempotency unique index
- `boost_video_uploads.purpose`

No destructive changes. Payment tables untouched.

---

## Implemented features (by phase)

1. **Page redesign** — seven Pro pages, navy sidebar, white cards, compact controls, mobile chips, safe-area padding, no horizontal scroll intent.
2. **Ad creation** — existing listing media + new image/video upload; 120s boost video validation client + server (`purpose=boost`).
3. **Audience targeting** — country/department/cities/radius, Advantage+/Manual, saved audiences activate/deactivate; radius uses authorized lat/lng only (never invents location from registration city alone).
4–6. **Ad player** — sponsored chrome, CTA, playback-time skip countdown, unmute, loading/error recovery, image interruptive 10s countdown; feed cards unchanged.
7. **Budget** — min $2, custom budgets, daily allocation via existing estimate API; estimates labeled non-guaranteed; backend still enforces spend/impression pacing.
8. **Boost management** — list, pause, resume, analytics link, details.
9. **Analytics** — impressions, unique reach (distinct viewer ids), video starts/completions, 10s views, skips, clicks, messages, spend, geo from `boost_ad_events`.
10. **Security** — auth on owner routes, ownership checks, media URL verification reused, event rate limit, idempotent event keys.
11. **Performance** — lazy routes, event keepalive, limited candidate fetch for radius filter, indexes on new tables.

---

## Tests performed

| Test | Result |
|---|---|
| `vitest run haitiGeo.test.ts` (radius, privacy, validation) | Passed (7) |
| `vitest run boostVideoAsset.test.ts` | Passed (4) |
| `vite build` marketplace | Passed |
| Manual static review of skip countdown / pause filter / handoff | Implemented as specified |

### Not fully exercised in this environment
- Live Stripe/wallet payment end-to-end (preserved existing paths; no DB/payment credentials exercised here)
- Real device autoplay policy matrix (iOS/Android browser)
- Production DB migration apply (migrations run on api-server boot)

---

## Unresolved / follow-ups

1. **Image-only interruptive overlay delivery** — create/review supports image ads; random overlay selection still prefers listings with `boostVideoUrl`. Image interruptive placement can be extended by widening `/api/boost/random-video` to include image-boosted inventory.
2. **OpenAPI / generated clients** — booster Pro endpoints are Express routes; OpenAPI regen not updated.
3. **Mobile native** — Android/iOS still WebView into `/my-boosts` / `/boost`; they inherit Pro UI via web.
4. **Legacy `MyBoosts.tsx` / `BoostWizard`** — still in repo for wizard entry points (VideoFeed etc.); campaigns page is Pro.

---

## Required configuration

- No new env vars.
- Ensure api-server startup migrations run (existing `runStartupMigrations`).
- Wasabi / video normalization stack unchanged.
- Advertisers need profile `country` set (existing rule).
- Optional: user `latitude`/`longitude` for radius enforcement; without them, radius does not exclude (privacy-safe).

---

## Branding / payments preservation

- Flexa Market brand retained in Booster sidebar.
- Wallet, Stripe checkout, USDT/SEPA/Apple pending review, admin free/paid boosts unchanged.
- Create Review handoff for listing-backed ads uses `/boost/:listingId?boosterPro=1` with session prefill into the existing pay step.
