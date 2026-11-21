# Batch 5 — inventory pages 21–40 side-by-side

**Account:** Flexa superadmin (Fanfan) · token `flexamarket_token`  
**Locale target:** EN (APP EN; some WEB wallet history strings remain HT)  
**Market:** Haiti · **Viewport:** 390×844 @2x  
**Captured:** 2026-11-21 (America/New_York)

## Selection (inventory order 21–40)

| # | Inv | Name | Web route | Android route | Assignment |
|---|-----|------|-----------|---------------|------------|
| 01 | 21 | Wallet | `/wallet` | `/wallet` | native |
| 02 | 22 | Wallet top-up / Card FM recharge | `/wallet` | `/wallet` | BLOCKED |
| 03 | 23 | Wallet P2P transfer | `/wallet/transfer` | — | MISSING |
| 04 | 24 | Transaction History | `/wallet/history` | `/wallet` | native |
| 05 | 25 | Flex Card repay | `/flex-card/repay` | — | MISSING |
| 06 | 26 | BNPL | `/bnpl` | — | MISSING |
| 07 | 27 | Account / Profile hub | `/profile/1` | `/profile` | native (partial) |
| 08 | 28 | Edit Profile | `/profile/edit` | `/edit-profile` | native |
| 09 | 29 | Settings (marketplace country) | `/settings` | `/settings` | native |
| 10 | 30 | Settings subpages (help) | `/settings/help` | — | MISSING |
| 11 | 31 | Notifications | `/settings/notifications` | `/notifications` | native |
| 12 | 32 | Android push (FCM) | N/A | N/A | not a screen |
| 13 | 33 | Account Verification (KYC) | `/kyc` | `/kyc` | placeholder |
| 14 | 34 | Language picker | (header modal) | `/language-picker` | native |
| 15 | 35 | Offers | `/offers` | `/offers` | native |
| 16 | 36 | Subscription / VIP | `/subscription` | `/subscription` | placeholder |
| 17 | 37 | Subscription digital purchase | `/subscription` | `/subscription` | BLOCKED |
| 18 | 38 | Referral / Leaderboard | `/leaderboard` | — | MISSING |
| 19 | 39 | Commission promo | `/commission-promo` | — | MISSING |
| 20 | 40 | Jobs board | `/jobs` | — | MISSING |

## Method
- **WEB (left):** `https://flexamarket.com` with the same bearer token (init script). Auth-gate captures rejected.
- **APP (right):** Expo Router React Native UI via Metro `:8081` (same token). Device APK under software emulation remains unreliable (System UI ANR); Expo RN is the reviewable Android surface.
- Same viewport, account, and Haiti market. Bottom controls checked above the system inset (safe-area padding on native stacks / tab bar).

## Fixes / retests this batch
1. **Wallet top-up** — APP `Top up` opens the Android digital-goods policy alert (`onUnsupportedFunding`); confirmed; no Play Billing path (expected BLOCKED).
2. **Language** — account `preferredLanguage` forced to `en` via `PATCH /api/auth/language` before captures; APP language picker shows English selected.
3. **Back** — stack screens use header back / `router.back()`; retested after main actions.
4. **No new native screens** for MISSING inventory rows (transfer, repay, BNPL, settings help, leaderboard, commission, jobs) — left UNVERIFIED per assignment.

## Results — 20 / 20 pairs

| # | Page | Result | Main action | Fix | Pair |
|---|------|--------|-------------|-----|------|
| 01 | Wallet | **PASS** | Balance + history visible | — | [pair](./01_wallet_side_by_side.png) |
| 02 | Wallet top-up | **UNVERIFIED** | Top up → policy alert | Blocker: Play Billing / `ANDROID_DIGITAL_PURCHASE_UNAVAILABLE` | [pair](./02_wallet_topup_side_by_side.png) |
| 03 | Wallet P2P transfer | **UNVERIFIED** | — | Blocker: no native `/wallet/transfer` | [pair](./03_wallet_transfer_side_by_side.png) |
| 04 | Transaction History | **PASS** | All / In / Out filters on APP | WEB history empty-state quirk (API still returns 28 txs); APP list OK | [pair](./04_tx_history_side_by_side.png) |
| 05 | Flex Card repay | **UNVERIFIED** | — | Blocker: no native `/flex-card/repay` | [pair](./05_flex_card_repay_side_by_side.png) |
| 06 | BNPL | **UNVERIFIED** | — | Blocker: no native `/bnpl` | [pair](./06_bnpl_side_by_side.png) |
| 07 | Account / Profile hub | **PASS** | Open Edit profile | WEB `/profile/1` = public shop; APP = account hub | [pair](./07_profile_side_by_side.png) |
| 08 | Edit Profile | **PASS** | Fields visible (Fanfan) | — | [pair](./08_edit_profile_side_by_side.png) |
| 09 | Settings | **PASS** | Open Language row | — | [pair](./09_settings_side_by_side.png) |
| 10 | Settings help | **UNVERIFIED** | — | Blocker: no native settings subpages | [pair](./10_settings_help_side_by_side.png) |
| 11 | Notifications | **PASS** | List loads | — | [pair](./11_notifications_side_by_side.png) |
| 12 | Android push (FCM) | **UNVERIFIED** | — | Blocker: not a navigable UI page; device FCM E2E unverified | [pair](./12_android_push_side_by_side.png) |
| 13 | KYC | **CAPTURED** | Placeholder visible | Document upload still queued | [pair](./13_kyc_side_by_side.png) |
| 14 | Language picker | **PASS** | English selected | WEB is header modal (`/language` 404) | [pair](./14_language_side_by_side.png) |
| 15 | Offers | **PASS** | Received / Sent tabs | — | [pair](./15_offers_side_by_side.png) |
| 16 | Subscription / VIP | **CAPTURED** | Placeholder visible | Plans UI still queued | [pair](./16_subscription_side_by_side.png) |
| 17 | Subscription purchase | **UNVERIFIED** | — | Blocker: Play Billing required | [pair](./17_subscription_pay_side_by_side.png) |
| 18 | Leaderboard | **UNVERIFIED** | — | Blocker: no native `/leaderboard` | [pair](./18_leaderboard_side_by_side.png) |
| 19 | Commission promo | **UNVERIFIED** | — | Blocker: no native `/commission-promo` | [pair](./19_commission_side_by_side.png) |
| 20 | Jobs board | **UNVERIFIED** | — | Blocker: no native `/jobs` | [pair](./20_jobs_side_by_side.png) |

**Summary:** PASS 8 · CAPTURED 2 · UNVERIFIED 10 · FAIL 0 · pairs 20/20

## Notable visual diffs (review, not regressions)
- Wallet WEB is denser (Deposit/Send/Contacts/…) vs APP read-only funding + policy note (intentional Android digital-goods guard).
- Profile WEB public shop vs APP account hub (inventory `PARTIALLY_NATIVE`).
- WEB wallet history may show HT copy / empty-state under rate-limit; APP EN history list matches API.
- Native stack chrome (back + title) vs website header + bottom nav — expected.

## Handoff for next agent
- **Branch:** `cursor/android-parity-batch5-21-40-2cb2`
- **Report:** `artifacts/mobile/releases/batch5-pairs/BATCH5_REPORT.md`
- **Next inventory slice:** pages **41–60** in `artifacts/mobile/docs/phase3-migration-inventory.json` order
- Prior: Batch 4 on `cursor/android-parity-batch4-20pairs-2cb2` (shopping/account pairs)
