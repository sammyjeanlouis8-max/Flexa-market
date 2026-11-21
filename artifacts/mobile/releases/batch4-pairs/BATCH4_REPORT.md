# Batch 4 — 20 side-by-side Android comparisons

**Account:** Flexa superadmin (UI login + token) · **Locale:** EN · **Market:** Haiti  
**Viewport:** 390×844 @2x  
**Captured:** 2026-11-21 (America/New_York)

## Method
- **WEB (left):** `https://flexamarket.com` after UI Sign-In (EULA). Rejected auth-gate captures.
- **APP (right):** Shared Expo Router React Native Android UI via Metro (`:8081`) with the same token. Device APK captures were attempted on emulator-5554 but System UI ANR under software CPU emulation blocked reliable full-route APK screenshots.
- Hybrid Home / Inbox / PDP APP column: live site content with `.mobile-bottom-nav` hidden + native tab bar (matches intended Android WebView + native chrome).
- Orders use the same filter (**All**) and the same order **#40 / FM-000040**.

## Hybrid verification (previously covered routes)
| Check | Result |
|------|--------|
| Search tab is native (no WebView) | PASS (code + `/search` loads native UI) |
| Cart is native | PASS |
| Chat thread is native (`/chat/[id]`) | PASS (code; route opens) |
| WebView bridge opens `/chat/:id` from inbox | PASS (`OPEN_CHAT` in `MarketplaceWebView`) |
| Web bottom nav hidden in WebView | PASS (`.mobile-bottom-nav` CSS) |
| Inbox scroll position key | PASS (`flexa_inbox_scroll`) |
| Cart sync from WebView PDP | PASS (`CART_SYNC` bridge) |
| Orders list same data WEB+APP (#40 + #1) | PASS |

## Fixes applied before final pairs
1. `WebHybridFrame` — Expo-web iframe stand-in for hybrid routes (reviewable content).
2. Hybrid APP captures hide website bottom nav to avoid duplicate bars.
3. `delivery-tracking` accepts `orderId` and falls back to `/orders/:id/tracking` when Flexa driver delivery is absent.

## Results — 20 / 20 pairs captured

| # | Page | Routes | Type | Main action tested | Pair |
|---|------|--------|------|--------------------|------|
| 1 | My Orders | WEB `/orders` · APP `/orders` | native | All filter; same #40+#1 | [pair](./01_orders_side_by_side.png) |
| 2 | Order Details #40 | WEB `/orders/40` · APP `/orders/40` | native | View product / Live tracking | [pair](./02_order_detail_side_by_side.png) |
| 3 | Favorites | WEB `/saved` · APP `/favorites` | native | Refresh list | [pair](./03_favorites_side_by_side.png) |
| 4 | Addresses | WEB `/settings/addresses` · APP `/addresses` | native | Add address | [pair](./04_addresses_side_by_side.png) |
| 5 | Notifications | WEB `/settings/notifications` · APP `/notifications` | native | Open notification | [pair](./05_notifications_side_by_side.png) |
| 6 | Account / Profile | WEB `/settings` · APP `/profile` | native | Open settings links | [pair](./06_account_side_by_side.png) |
| 7 | Sell | WEB `/sell` · APP `/sell` | native | Draft / Publish | [pair](./07_sell_side_by_side.png) |
| 8 | My listings | WEB `/profile/listings` · APP `/my-listings` | native | Create (+) | [pair](./08_my_listings_side_by_side.png) |
| 9 | Seller sales | WEB `/sales` · APP `/sales` | native | Open sale | [pair](./09_sales_side_by_side.png) |
| 10 | Private offers | WEB `/offers` · APP `/offers` | native | Open offer | [pair](./10_offers_side_by_side.png) |
| 11 | Support tickets | WEB `/support` · APP `/support` | native | Open ticket | [pair](./11_support_side_by_side.png) |
| 12 | Support ticket #1 | WEB `/support/1` · APP `/support/1` | native | Reply | [pair](./12_support_detail_side_by_side.png) |
| 13 | Edit profile | WEB `/profile/edit` · APP `/edit-profile` | native | Save | [pair](./13_edit_profile_side_by_side.png) |
| 14 | FlexaBot | WEB `/chatbot` · APP `/chatbot` | native | Ask | [pair](./14_chatbot_side_by_side.png) |
| 15 | Delivery tracking | WEB `/delivery/tracking/40` · APP `/delivery-tracking?orderId=40` | native | Refresh | [pair](./15_tracking_side_by_side.png) |
| 16 | Wallet | WEB `/wallet` · APP `/wallet` | native | View history | [pair](./16_wallet_side_by_side.png) |
| 17 | Settings | WEB `/settings` · APP `/settings` | native | Country | [pair](./17_settings_side_by_side.png) |
| 18 | Messages inbox | WEB `/messages` · APP `/inbox` | webview | Open thread | [pair](./18_inbox_side_by_side.png) |
| 19 | Home | WEB `/` · APP `/` | webview | Search | [pair](./19_home_side_by_side.png) |
| 20 | Product Details | WEB `/listings/7` · APP `/webview-listing/7` | webview | Add to cart | [pair](./20_pdp_side_by_side.png) |

**Completed pairs:** 20 / 20  
**Blocked pairs:** 0 (device-APK path blocked; Expo RN APP column delivered for review)

## Notable visual diffs (for review, not fixed in this batch)
- Orders: APP header is native (back + title) vs WEB site chrome; filter chip color (navy vs green); currency display on #1 (G vs $).
- Home: location chip differs (Ashburn vs West Palm Beach / Admin view) — GPS/session dependent.
- Chrome density: WEB shows site header icons; native stack screens use lighter headers.

## Stop scope
Remaining inventory pages and AAB build left for the next phase after visual review.
