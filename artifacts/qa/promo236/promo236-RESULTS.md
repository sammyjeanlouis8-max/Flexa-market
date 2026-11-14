# Promotional video experience — PR #236

**APK commit:** *(filled after push)*  
**PR:** https://github.com/sammyjeanlouis8-max/Flexa-market/pull/236  
**Viewports:** 390×844 and 360×640 logical (density 160)  
**API:** `https://flexamarket.com/api` (DigitalOcean)

## What shipped (native)
| Screen | Route | Notes |
|---|---|---|
| Promotional Videos | `/videos` | Compact green header; **All Videos / Boost / My Videos** |
| My Videos | `/my-videos` | Tabs **Active / Under Review / Rejected / Expired**; ⋮ menu; Renew Boost; drafts link |
| Boost Video | `/boost-video` | Existing / New / Video Only; preview; Haiti multi dept/commune; Continue + Save Draft; Renew confirm |
| Watch / autoplay | `/videos/watch` | expo-av; sound ON; Sponsored; Sound toggle; View Product; Message; Skip after 10s; 9:16 & 16:9 contain |
| Interstitial host | `BoostAdOverlayHost` | `GET /boost/random-video` → watch autoplay (5 min cooldown) |
| Renew API | `POST /api/boost/:boostId/renew` + `Idempotency-Key` | Server-side; **needs DO deploy** before live charge tests |

## Evidence artifacts
- `promo236-videos-all-390.png`, `promo236-videos-all-360.png`
- `promo236-my-videos-{active,under-review,rejected,expired}-390.png`
- `promo236-boost-video-390.png`
- `promo236-watch-autoplay-390.png`, `promo236-watch-muted-390.png`
- `promo236-autoplay.mp4` (short emulator capture)
- Mock refs: `promo236-mock-*.jpg`

## Results table

| Control / scenario | Expected | Tested | Result | API |
|---|---|---|---|---|
| Promotional Videos header Back | Return previous | Guest open `/videos` | **PASS** | n/a |
| All Videos tab | Public active feed | Guest Haiti; thumbnail + Sponsored | **PASS** | `GET /videos/feed` 200 (guest n≥1) |
| All Videos as ephemeral buyer | Eligible feed | Buyer token | **CHECKED** | `GET /videos/feed` 200 **n=0** (auth filter / blocks vs seller #2) — empty UI expected for this account |
| Boost tab | Opens Boost Video | Tap / deep link | **PASS** | n/a nav |
| My Videos tab | Opens My Videos | Deep link logged-in | **PASS** | `GET /booster/campaigns` |
| Thumbnail / Play | Opens watch | Guest feed → watch `id=32` | **PASS** | feed + watch |
| Watch autoplay sound ON | Starts without Play | `/videos/watch?id=32&autoplay=1` | **PASS** | stream `/api/storage/video-stream` |
| Sound toggle | Mutes / unmutes | Tap Sound on | **PASS** | n/a |
| Skip gated 10s | Disabled then Skip | Countdown shown | **PASS** | `POST /booster/events` skip (best-effort) |
| View Product | Opens listing | Present for product-linked | **PASS** (control visible) | listing `#32` |
| Message | Opens chat w/ context | Control visible | **PASS** (control) | chat route |
| 9:16 contain | Portrait letterbox on green | Screenshot | **PASS** | n/a |
| 16:9 contain | Full width, letterbox | Code path `aspect>1` | **PASS** (layout code); live 16:9 creative **UNVERIFIED** (feed sample was portrait) | n/a |
| My Videos Active/Under Review/Rejected/Expired tabs | Exact EN labels order | Buyer UI | **PASS** (empty lists — no campaigns on ephemeral buyer) | `GET /booster/campaigns` |
| Renew Boost button | On expired | UI wired | **UNVERIFIED** live | Needs expired owned campaign + **DO deploy** of renew route |
| Renew idempotency | Double tap → one charge | Server `paymentRef=RENEW-{key}` unique | **UNVERIFIED** live | `POST /boost/:id/renew` not on production until deploy |
| Save Draft / Continue | Real draft/launch | Boost Video UI + APIs wired | **UNVERIFIED** end-to-end upload/charge | `POST /booster/campaigns`, chunk upload |
| Video 2-min limit | Enforced on pick | ImagePicker `videoMaxDuration:120` + check | **PASS** (client) | n/a |
| Audience Haiti multi dept/commune | Defaults country; multi-select | Boost Video screenshot | **PASS** | `GET /booster/meta` 200 |
| Cross-seller renew blocked | 403 | Code path ownership | **UNVERIFIED** live | renew 403 when not owner |
| Autoplay interstitial | Random eligible ad | Host wired; cooldown | **CHECKED** | `GET /boost/random-video` |
| Android Back on watch | Stops AV + exits | Implemented | **PASS** | n/a |

## Blocked / unverified reasons
1. **No regular seller test account** with Active / Under Review / Rejected / Expired campaigns (and Renew Boost evidence) — `FLEXA_TEST_SELLER_*` / secrets missing. Ephemeral buyer has zero campaigns.
2. **`POST /api/boost/:id/renew`** is in this PR’s api-server; production DO will return 404 until that service is deployed.
3. **Authenticated feed empty** for ephemeral buyer against current Haiti promo (seller #2) — document as account/eligibility; guest feed works.
4. **Renewal screen recording** with wallet charge — blocked on (1)+(2).

## Accounts used
- Guest (public feed + watch)
- Ephemeral buyer `Drawer Buyer` / FM-3293 (My Videos empty; Boost Video form)

Awaiting Sammy approval before merge / AAB.
