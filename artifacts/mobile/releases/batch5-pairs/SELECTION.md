# Batch 5 selection — inventory pages 21–40

Prior batches covered inventory-aligned shopping/account screens and Batch 4’s 20 pairs.
This batch uses **inventory features 21–40** in file order from `phase3-migration-inventory.json`.

| # | Inv | Name | Web route | Android route | Expected render |
|---|-----|------|-----------|---------------|-----------------|
| 01 | 21 | Wallet | `/wallet` | `/wallet` | native |
| 02 | 22 | Wallet top-up / Card FM recharge | `/wallet` (top-up) | `/wallet` | BLOCKED (Play Billing) |
| 03 | 23 | Wallet P2P transfer | `/wallet/transfer` | — | MISSING native |
| 04 | 24 | Transaction History | `/wallet/history` | `/wallet` (history) | native |
| 05 | 25 | Flex Card repay | `/flex-card/repay` | — | MISSING native |
| 06 | 26 | BNPL | `/bnpl` | — | MISSING native |
| 07 | 27 | Account / Profile hub | `/profile/1` | `/profile` | native |
| 08 | 28 | Edit Profile | `/profile/edit` | `/edit-profile` | native |
| 09 | 29 | Settings (marketplace country) | `/settings` | `/settings` | native |
| 10 | 30 | Settings subpages (help) | `/settings/help` | `/settings/help` | native PASS |
| 11 | 31 | Notifications | `/settings/notifications` | `/notifications` | native |
| 12 | 32 | Android push (FCM) | N/A | N/A | not a screen — UNVERIFIED |
| 13 | 33 | Account Verification (KYC) | `/kyc` | `/kyc` | placeholder |
| 14 | 34 | Language picker | `/language` | `/language-picker` | native |
| 15 | 35 | Offers | `/offers` | `/offers` | native |
| 16 | 36 | Subscription / VIP | `/subscription` | `/subscription` | placeholder |
| 17 | 37 | Subscription digital purchase | `/subscription` (pay) | `/subscription` | BLOCKED (Play Billing) |
| 18 | 38 | Referral / Leaderboard | `/leaderboard` | — | MISSING native |
| 19 | 39 | Commission promo | `/commission-promo` | — | MISSING native |
| 20 | 40 | Jobs board | `/jobs` | — | MISSING native |
