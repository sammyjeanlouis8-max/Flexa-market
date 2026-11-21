# Batch 6 — Settings + Help + inventory pages 41–58

**Account:** Flexa superadmin (Fanfan) · token `flexamarket_token`  
**Locale:** EN · **Market:** Haiti · **Viewport:** 390×844 @2x  
**Captured:** 2026-11-21 (America/New_York)

## Selection
Starts with the two pages just shipped (**inv 29–30**), then the next **18** untested inventory features (**41–58**). Each route counted once.

| # | Inv | Name | Web route | Android route | Assignment |
|---|-----|------|-----------|---------------|------------|
| 01 | 29 | Settings | `/settings` | `/settings` | native |
| 02 | 30 | Help & Support | `/settings/help` | `/settings/help` | native |
| 03 | 41 | CalcAI calculator | `/calculator` | — | MISSING |
| 04 | 42 | Help Center / FAQ / Contact | `/help-center` | `/settings/help` | partial |
| 05 | 43 | Legal (privacy) | `/privacy-policy` | — | MISSING |
| 06 | 44 | Inbox / Messages | `/messages` | `/inbox` (WebView hybrid) | native |
| 07 | 45 | Chat thread | `/messages/74` | `/chat/74` | native |
| 08 | 46 | Support tickets | `/support` | `/support` | native |
| 09 | 47 | FlexaBot | `/chatbot` | `/chatbot` | native |
| 10 | 48 | Sell | `/sell` | `/sell` | native |
| 11 | 49 | My Listings | `/profile/1` | `/my-listings` | native |
| 12 | 50 | Edit listing | `/sell?edit=` | `/edit-listing/[id]` | native |
| 13 | 51 | Image upload | (Sell photos) | — | MISSING |
| 14 | 52 | Video upload | `/videos` | `/videos` | placeholder |
| 15 | 53 | Inventory / Restock | (listing mgmt) | — | MISSING |
| 16 | 54 | Sales dashboard | `/sales` | `/sales` | native |
| 17 | 55 | Seller analytics | `/settings/analytics` | — | MISSING |
| 18 | 56 | Orders | `/orders` | `/orders` | native |
| 19 | 57 | Earnings / Payouts | `/settings/payments` | — | MISSING |
| 20 | 58 | Boost | `/boost` | `/boost` | placeholder |

## Method
- **WEB (left):** `https://flexamarket.com` after UI Sign-In (EULA). Auth-gate captures rejected / recaptured.
- **APP (right):** Expo Router React Native UI via Metro `:8081` (same token). Device APK under software emulation remains unreliable; Expo RN is the reviewable Android surface.
- Same account, language, Haiti market, 390×844@2x.
- Settings opened via **My Account → Settings**. Help opened from Settings. Edit listing used Fanfan-owned listing `#163`.

## Fixes / notes this batch
1. **Help & Support (inv 30)** — already native on this branch; retested Open chat → `/support/1`, FAQ expand, Email us, Back.
2. **Settings (inv 29)** — retested profile card, 2×2 shortcuts, Help & Support row, bottom tabs; extra scrolled pair for Help entry.
3. **Edit listing (inv 50)** — inventory said MISSING but `/edit-listing/[id]` exists; loaded Fanfan listing `#163` (listing `#102` belongs to another seller → correctly rejected).
4. **No new native screens** for MISSING rows (calculator, legal, image-upload route, inventory/restock, analytics, payouts).

## Results — 20 / 20 pairs

| # | Page | Result | Main action | Fix / blocker | Pair |
|---|------|--------|-------------|---------------|------|
| 01 | Settings | **PASS** | Profile + shortcuts + Help entry; scroll | — | [pair](./01_settings_side_by_side.png) · [scroll](./01_settings_scroll_side_by_side.png) |
| 02 | Help & Support | **PASS** | Open chat → `/support/1`; FAQ; Back | — | [pair](./02_help_side_by_side.png) · [faq](./02_help_faq_side_by_side.png) |
| 03 | Calculator | **UNVERIFIED** | — | Blocker: no native `/calculator` | [pair](./03_calculator_side_by_side.png) |
| 04 | Help Center | **PASS** | FAQ / contact | APP maps to `/settings/help` | [pair](./04_help_center_side_by_side.png) |
| 05 | Legal | **UNVERIFIED** | — | Blocker: no native legal screens | [pair](./05_legal_side_by_side.png) |
| 06 | Inbox | **PASS** | Open conversation | Hybrid WebView + native `/chat/[id]` | [pair](./06_inbox_side_by_side.png) |
| 07 | Chat thread | **PASS** | View messages | Thread `#74` (Chris) | [pair](./07_chat_side_by_side.png) |
| 08 | Support | **PASS** | Open ticket | Thread `/support/1` | [pair](./08_support_side_by_side.png) |
| 09 | FlexaBot | **PASS** | Bot UI visible | — | [pair](./09_chatbot_side_by_side.png) |
| 10 | Sell | **PASS** | Listing form | — | [pair](./10_sell_side_by_side.png) |
| 11 | My Listings | **PASS** | List loads | WEB public shop vs APP seller list | [pair](./11_my_listings_side_by_side.png) |
| 12 | Edit listing | **PASS** | Load own listing `#163` | Native form (WEB multi-step) | [pair](./12_edit_listing_side_by_side.png) |
| 13 | Image upload | **UNVERIFIED** | — | Blocker: no dedicated route (photos live on Sell) | [pair](./13_image_upload_side_by_side.png) |
| 14 | Videos | **CAPTURED** | Placeholder visible | Native video feed queued | [pair](./14_videos_side_by_side.png) |
| 15 | Inventory | **UNVERIFIED** | — | Blocker: no native inventory/restock | [pair](./15_inventory_side_by_side.png) |
| 16 | Sales | **PASS** | Dashboard visible | — | [pair](./16_sales_side_by_side.png) |
| 17 | Analytics | **UNVERIFIED** | — | Blocker: no native `/settings/analytics` | [pair](./17_analytics_side_by_side.png) |
| 18 | Orders | **PASS** | Orders list | — | [pair](./18_orders_side_by_side.png) |
| 19 | Payouts | **UNVERIFIED** | — | Blocker: no native payouts; Play digital-goods | [pair](./19_payouts_side_by_side.png) |
| 20 | Boost | **CAPTURED** | Placeholder visible | Play Billing rules apply | [pair](./20_boost_side_by_side.png) |

**Summary:** PASS 12 · CAPTURED 2 · UNVERIFIED 6 · FAIL 0 · pairs 20/20

## Notable visual diffs (review, not regressions)
- Settings / Help: My Account tab tint is Flexa green on APP vs blue on WEB (brand).
- Inbox APP on Expo-web uses `WebHybridFrame` (may show duplicate bottom chrome in desktop Chromium); device Android uses `MarketplaceWebView`.
- Edit listing: WEB multi-step accordion vs APP single scroll form — same fields/data.
- My Listings: WEB `/profile/1` public shop vs APP `/my-listings` seller management.

## Gallery
All 20 comparisons: [INDEX.html](./INDEX.html)

## Handoff
- **Branch:** `cursor/android-parity-batch5-21-40-2cb2`
- **Report:** `artifacts/mobile/releases/batch6-pairs/BATCH6_REPORT.md`
- **Next inventory slice:** pages **59–78** (or remaining through 82)
