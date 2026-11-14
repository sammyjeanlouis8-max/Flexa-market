# Promotional video experience — PR #236

**Test APK commit:** `99dbcf79fd45db67cc81816ecbeb1adf8214b9a1`  
**PR:** https://github.com/sammyjeanlouis8-max/Flexa-market/pull/236  
**Viewports:** 390×844 and 360×640 logical  
**API:** `https://flexamarket.com/api` (DigitalOcean)  
**APK:** `artifacts/mobile/android/app/build/outputs/apk/release/app-release.apk` (rebuilt from that commit)

## Screens shipped
| Screen | Route | Notes |
|---|---|---|
| Promotional Videos | `/videos` | Compact green header; **All Videos / Boost / My Videos** |
| My Videos | `/my-videos` | **Active / Under Review / Rejected / Expired**; ⋮ menu; Renew Boost; drafts |
| Boost Video | `/boost-video` | Existing / New / Video Only; Haiti multi-select; Continue + Save Draft; Renew confirm |
| Watch / autoplay | `/videos/watch` | expo-av; sound ON; Sponsored; mute; View Product; Message; Skip @10s; 9:16/16:9 contain |
| Interstitial | `BoostAdOverlayHost` | `GET /boost/random-video` → watch |
| Renew API | `POST /api/boost/:boostId/renew` + `Idempotency-Key` | In PR; **not on DO yet** (404) |

## Evidence (key files under `artifacts/qa/promo236/`)
| File | What |
|---|---|
| `promo236-videos-all-390-final.png` / `…-360-final.png` | All Videos + Sponsored thumbnail |
| `promo236-my-videos-*-tap-390.png` | All four tabs selected (empty buyer) |
| `promo236-boost-video-final-390.png` / `…-actions-…` / `…-360-…` | Boost form + Continue/Save Draft |
| `promo236-watch-390-final.png` / `…-360-final.png` | Autoplay 9:16 playing, Sound on |
| `promo236-watch-skip-ready-390.png` | Skip enabled |
| `promo236-watch-muted-390.png` | Sound off |
| `promo236-autoplay-audio.mp4` | Mute/unmute + Skip recording (~18s) |
| `promo236-view-product-dest-390.png` | View Product → listing “tshot for man” |
| `promo236-message-dest-390.png` | Message → Chat (API Forbidden for this buyer) |

## Results table

| Control / scenario | Expected | Result | API |
|---|---|---|---|
| Header Back (videos) | Previous screen | **PASS** | n/a |
| Android Back (watch) | Stop AV + exit | **PASS** | n/a |
| All Videos | Public active feed | **PASS** | `GET /videos/feed` 200 (guest n=1; buyer falls back to guest when auth n=0) |
| Boost tab | Boost Video | **PASS** | n/a |
| My Videos tab | Seller videos | **PASS** (empty — ephemeral buyer) | `GET /booster/campaigns` |
| Thumbnail / Play | Open watch | **PASS** | feed + stream |
| Autoplay sound ON | Starts without Play | **PASS** | `GET /api/storage/video-stream` 206 |
| Sound toggle | Mute / unmute | **PASS** | n/a |
| Skip after 10s | Enable then leave | **PASS** | `POST /booster/events` skip (best-effort) |
| View Product | Correct listing | **PASS** → PDP “tshot for man” / Chelot goat | listing `#32` |
| Message | Seller chat + context | **CHECKED** → Chat screen; body **Forbidden** for this buyer | chat API 403 |
| 9:16 contain | Portrait, no stretch | **PASS** | n/a |
| 16:9 contain | Full width letterbox | **UNVERIFIED** live (only portrait creative in feed); code path present | n/a |
| My Videos tabs EN order | Active→Under Review→Rejected→Expired | **PASS** | client filter + `endsAt` |
| Renew Boost UI | On expired | **UNVERIFIED** live | needs owned expired campaign |
| Renew idempotency | One charge on retry | **UNVERIFIED** live | `POST /boost/:id/renew` **404 on DO** until deploy |
| Save Draft / Continue | Real draft/launch | **UNVERIFIED** E2E upload/charge | wired to booster APIs |
| 2-min video limit | Client enforce | **PASS** (picker max 120s) | n/a |
| Audience Haiti multi | Default country + multi dept/commune | **PASS** UI | `GET /booster/meta` 200 |
| Cross-seller renew | 403 | **UNVERIFIED** live | server ownership check in PR |
| 360×640 / 390×844 | Readable tabs, no overlap | **PASS** | n/a |

## Blocked / unverified
1. No regular seller account with Active / Under Review / Rejected / Expired campaigns (`FLEXA_TEST_SELLER_*` missing) → Renew Boost confirmation recording, ⋮ menu with live rows, draft reopen E2E **UNVERIFIED**.
2. `POST /api/boost/:id/renew` returns **404** on production until this PR’s api-server is deployed.
3. Live **16:9** creative not in current Haiti public feed (id 32 is portrait).
4. Message chat returned **Forbidden** for ephemeral buyer — destination correct; messaging permission separate.

## Accounts
- Guest / buyer with guest-feed fallback for All Videos + watch
- Ephemeral buyer for My Videos (empty) + Boost Video form

**No merge / no AAB** until Sammy approves.
