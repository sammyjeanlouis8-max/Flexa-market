# Phase 3V — Physical Android test matrix (84 screens)

**APK prerequisite:** installable preview build for `com.flexa.market` (EAS preview).
**Play note:** package was previously suspended — this matrix is for **sideload / internal testing only**, not Play submission.
**Rule:** mark Pass only with device evidence (screenshot / log / message ID). Emulator-only FCM/OTP is insufficient.

| # | ID | Route | Status | Domain | Role | Pass? | Evidence |
|---|----|-------|--------|--------|------|-------|----------|
| 1 | `auth-login` | `/auth/login` | FULLY_NATIVE | auth | guest | | |
| 2 | `auth-register` | `/auth/register` | FULLY_NATIVE | auth | guest | | |
| 3 | `auth-globe` | `components/auth/AuthGlobe` | FULLY_NATIVE | auth | guest | | |
| 4 | `auth-phone-login` | `/auth/login-phone` | FULLY_NATIVE | auth | guest | | |
| 5 | `auth-forgot-password` | `/auth/forgot-password` | FULLY_NATIVE | auth | guest | | |
| 6 | `home` | `/` | FULLY_NATIVE | customer | guest+ | | |
| 7 | `search` | `/search` | FULLY_NATIVE | customer | guest+ | | |
| 8 | `categories` | `/search` | FULLY_NATIVE | customer | guest+ | | |
| 9 | `listing-detail` | `/listing/[id]` | FULLY_NATIVE | customer | guest+ | | |
| 10 | `cart` | `/cart` | FULLY_NATIVE | customer | guest+ | | |
| 11 | `checkout` | `/checkout` | FULLY_NATIVE | customer | buyer | | |
| 12 | `checkout-success` | `/checkout-success` | FULLY_NATIVE | customer | buyer | | |
| 13 | `stripe-single-item` | `/stripe-checkout` | FULLY_NATIVE | customer | buyer | | |
| 14 | `favorites` | `/favorites` | FULLY_NATIVE | customer | buyer | | |
| 15 | `orders` | `/orders` | FULLY_NATIVE | customer | buyer | | |
| 16 | `order-detail` | `/orders/[id]` | FULLY_NATIVE | customer | buyer/seller | | |
| 17 | `delivery-tracking` | `/delivery-tracking` | FULLY_NATIVE | customer | buyer | | |
| 18 | `public-tracking` | `/track/[trackingNumber]` | FULLY_NATIVE | customer | guest+ | | |
| 19 | `delivery-confirm` | `/orders/[id]` | FULLY_NATIVE | customer | buyer | | |
| 20 | `addresses` | `/addresses` | FULLY_NATIVE | customer | buyer | | |
| 21 | `wallet` | `/wallet` | FULLY_NATIVE | customer | buyer | | |
| 22 | `wallet-topup` | `/wallet` | BLOCKED | customer | buyer | | |
| 23 | `wallet-transfer` | `/wallet-transfer` | FULLY_NATIVE | customer | buyer | | |
| 24 | `wallet-history` | `/wallet` | FULLY_NATIVE | customer | buyer | | |
| 25 | `flex-card-repay` | `/flex-card` | FULLY_NATIVE | customer | buyer | | |
| 26 | `bnpl` | `/bnpl,/stripe-checkout` | FULLY_NATIVE | customer | buyer | | |
| 27 | `profile-account` | `/profile/[id]` | FULLY_NATIVE | customer | guest/buyer | | |
| 28 | `edit-profile` | `/edit-profile` | FULLY_NATIVE | customer | buyer | | |
| 29 | `settings` | `/settings` | FULLY_NATIVE | customer | guest+ | | |
| 30 | `settings-subpages` | `/settings,/settings-notifications,/settings-privacy,/security,/help,/legal/[doc]` | FULLY_NATIVE | customer | buyer | | |
| 31 | `notifications` | `/notifications` | FULLY_NATIVE | customer | buyer | | |
| 32 | `push-fcm` | `expo-notifications + PushBootstrap` | PARTIALLY_NATIVE | customer | buyer | | |
| 33 | `kyc` | `/kyc` | FULLY_NATIVE | customer | buyer | | |
| 34 | `language-picker` | `/language-picker` | FULLY_NATIVE | customer | guest+ | | |
| 35 | `offers` | `/offers` | FULLY_NATIVE | customer | buyer | | |
| 36 | `subscription` | `/subscription` | FULLY_NATIVE | customer | buyer | | |
| 37 | `subscription-billing` | `/subscription` | BLOCKED | customer | buyer | | |
| 38 | `referrals` | `/referrals` | FULLY_NATIVE | customer | buyer | | |
| 39 | `commission-promo` | `/commission-promo` | FULLY_NATIVE | customer | buyer | | |
| 40 | `jobs` | `/jobs,/jobs/[id],/jobs/post` | FULLY_NATIVE | customer | buyer | | |
| 41 | `calculator` | `/calculator` | FULLY_NATIVE | customer | buyer | | |
| 42 | `help-center` | `/help` | FULLY_NATIVE | support | guest+ | | |
| 43 | `legal` | `/legal/[doc]` | FULLY_NATIVE | support | guest+ | | |
| 44 | `inbox` | `/inbox` | FULLY_NATIVE | communication | buyer | | |
| 45 | `chat-thread` | `/chat/[id]` | FULLY_NATIVE | communication | buyer | | |
| 46 | `support-tickets` | `/support,/support/[id]` | FULLY_NATIVE | communication | buyer | | |
| 47 | `chatbot` | `/chatbot` | FULLY_NATIVE | communication | buyer | | |
| 48 | `sell` | `/sell` | FULLY_NATIVE | seller | buyer+ | | |
| 49 | `my-listings` | `/my-listings` | FULLY_NATIVE | seller | seller | | |
| 50 | `edit-listing` | `/edit-listing/[id]` | FULLY_NATIVE | seller | seller | | |
| 51 | `image-upload` | `/(tabs)/sell` | FULLY_NATIVE | seller | seller | | |
| 52 | `video-upload` | `/(tabs)/sell,/boost-create,/drafts` | FULLY_NATIVE | seller | seller | | |
| 53 | `inventory` | `/my-listings` | FULLY_NATIVE | seller | seller | | |
| 54 | `sales-dashboard` | `/sales` | FULLY_NATIVE | seller | seller | | |
| 55 | `seller-analytics` | `/seller-analytics` | FULLY_NATIVE | seller | seller | | |
| 56 | `seller-orders` | `/sales` | FULLY_NATIVE | seller | seller | | |
| 57 | `earnings-payouts` | `/seller-earnings` | FULLY_NATIVE | seller | seller | | |
| 58 | `boost` | `/boost,/boost-create,/my-boosts,/boost-analytics` | FULLY_NATIVE | seller | seller | | |
| 59 | `boost-paid` | `/boost` | BLOCKED | seller | seller | | |
| 60 | `boost-analytics` | `/my-boosts` | FULLY_NATIVE | seller | seller | | |
| 61 | `promo-videos` | `/videos,/promo-feed` | FULLY_NATIVE | seller | guest+ | | |
| 62 | `drafts` | `/drafts` | FULLY_NATIVE | seller | seller | | |
| 63 | `store-manager` | `/store-manager,/manager` | FULLY_NATIVE | seller | store_manager | | |
| 64 | `seller-registration` | `/seller-registration,/kyc,/seller-earnings,/store-manager` | FULLY_NATIVE | seller | seller | | |
| 65 | `driver-apply` | `/driver-apply` | FULLY_NATIVE | driver | buyer→driver | | |
| 66 | `driver-dashboard` | `/driver-dashboard` | FULLY_NATIVE | driver | driver | | |
| 67 | `cash-agent` | `/cash-agents` | FULLY_NATIVE | agent | agent/buyer | | |
| 68 | `loans` | `/loans` | FULLY_NATIVE | fintech | buyer (HT/DR) | | |
| 69 | `credit-score` | `/credit-score` | FULLY_NATIVE | fintech | buyer (HT/DR) | | |
| 70 | `flexa-tv` | `/tv` | FULLY_NATIVE | media | guest+ | | |
| 71 | `flexa-music` | `/music,/music/[id],/music/upload` | FULLY_NATIVE | media | guest+/artist | | |
| 72 | `music-purchase` | `/music` | BLOCKED | media | buyer | | |
| 73 | `admin-panel` | `/admin,/admin/*` | FULLY_NATIVE | admin | admin/superadmin/moderator | | |
| 74 | `admin-users` | `/admin/users,/admin/users/[id],/admin/team,/admin/kyc,/admin/drivers,/admin/agents,/admin/flagged` | FULLY_NATIVE | admin | admin+ | | |
| 75 | `admin-moderation` | `/admin/moderation,/admin/reports,/admin/boosts,/admin/appeals,/admin/operations` | FULLY_NATIVE | admin | moderator+ | | |
| 76 | `admin-finance` | `/admin/finance,/admin/stripe,/admin/returns,/admin/flex-cards,/admin/loans-admin,/admin/commissions,/admin/haiti-ledger` | FULLY_NATIVE | admin | financeAdmin/superadmin | | |
| 77 | `admin-support` | `/support-agent,/support-admin` | FULLY_NATIVE | admin | support+ | | |
| 78 | `admin-analytics` | `/admin/traffic,/admin/audit,/admin/fraud,/admin/fees,/admin/subscriptions,/admin/settings,/admin/broadcast,/admin/push-campaigns,/admin/tv-cms,/admin/music-cms,/admin/security` | FULLY_NATIVE | admin | admin/superadmin | | |
| 79 | `delete-account` | `/delete-account` | FULLY_NATIVE | customer | buyer/guest | | |
| 80 | `website-embed` | `/website` | FULLY_NATIVE | legacy | any | | |
| 81 | `esim` | `/esim` | BLOCKED | customer | buyer | | |
| 82 | `smart-notifications` | `PushBootstrap` | FULLY_NATIVE | communication | buyer | | |
| 83 | `product-variations` | `/product-variations` | PARTIALLY_NATIVE | seller | seller | | |
| 84 | `wallet-redeem` | `/wallet-redeem` | FULLY_NATIVE | customer | buyer | | |

## Critical workflows (cross-screen)
- [ ] **CW1** Cold start → native Home (no marketplace WebView)
- [ ] **CW2** Signup → Login email → Login phone OTP
- [ ] **CW3** Password recovery
- [ ] **CW4** FCM permission → token register → push received → deep link
- [ ] **CW5** Browse → listing → variant select (if schema) → cart → wallet checkout
- [ ] **CW6** Stripe physical single-item checkout (WebBrowser)
- [ ] **CW7** Seller create listing + photo/video upload
- [ ] **CW8** Boost unpaid/admin path; Home promo ≤2; scroll audio hard-stop
- [ ] **CW9** Order detail buyer PIN/confirm; seller ship+label
- [ ] **CW10** Support chat/ticket; admin gate
- [ ] **CW11** Wallet redeem prepaid card; wallet transfer
- [ ] **CW12** Flexa Music background audio; Flexa TV playback
- [ ] **CW13** Website opens system browser only
- [ ] **CW14** Android back button on nested stacks

## Device under test
| Field | Value |
|-------|-------|
| Device model | |
| Android version | |
| APK build ID | **none until EAS succeeds** |
| Tester | |
| Date (America/New_York) | |
