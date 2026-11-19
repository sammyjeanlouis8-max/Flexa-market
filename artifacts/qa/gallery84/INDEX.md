# Gallery84 INDEX — Flexa Market native Android

**Final APK:** `com.flexamarket.app` · `1.0.1` · **versionCode 61**
**Emulator:** `sdk_gphone64_x86_64` · Android **14** · AVD `flexa_api34`
**Backend:** `https://flexamarket.com/api`
**Branch tip:** see git after commit · base inventory from `native-84-page-map.md`

| Totals | **PASS 78** · **FAIL 0** · **BLOCKED 6** · Total 84 |

| # | Name | Route | Role | Layout | Controls | API | Screenshot | Status |
|---:|---|---|---|---|---|---|---|---|
| 01 | Login | `/auth/login` | guest | PASS | PASS | N/A | [01-auth-login.png](01-auth-login.png) | **PASS** |
| 02 | Signup | `/auth/register` | guest | PASS | PASS | N/A | [02-auth-register.png](02-auth-register.png) | **PASS** |
| 03 | Animated Auth Globe | `components/auth/AuthGlobe` | guest | PASS | PASS | N/A | [03-auth-globe.png](03-auth-globe.png) | **PASS** |
| 04 | Phone login | `/auth/login-phone` | guest | PASS | PASS | N/A | [04-auth-phone-login.png](04-auth-phone-login.png) | **PASS** |
| 05 | Forgot password | `/auth/forgot-password` | guest | PASS | PASS | N/A | [05-auth-forgot-password.png](05-auth-forgot-password.png) | **PASS** |
| 06 | Home | `/` | guest|buyer | PASS | PASS | PASS | [06-home.png](06-home.png) | **PASS** |
| 07 | Search | `/search` | guest|buyer | PASS | PASS | PASS | [07-search.png](07-search.png) | **PASS** |
| 08 | Categories | `/search` | guest|buyer | PASS | PASS | PASS | [08-categories.png](08-categories.png) | **PASS** |
| 09 | Product details | `/listing/[id]` | guest|buyer | PASS | PASS | PASS | [09-listing-detail.png](09-listing-detail.png) | **PASS** |
| 10 | Shopping Cart | `/cart` | guest|buyer | PASS | PASS | PASS | [10-cart.png](10-cart.png) | **PASS** |
| 11 | Checkout (wallet / Card FM) | `/checkout` | buyer | PASS | PASS | PASS | [11-checkout.png](11-checkout.png) | **PASS** |
| 12 | Order confirmation | `/checkout-success` | buyer | PASS | PASS | PASS | [12-checkout-success.png](12-checkout-success.png) | **PASS** |
| 13 | Stripe single-item checkout | `/stripe-checkout` | buyer | PASS | PASS | PASS | [13-stripe-single-item.png](13-stripe-single-item.png) | **PASS** |
| 14 | Favorites / Saved | `/favorites` | guest|buyer | PASS | PASS | PASS | [14-favorites.png](14-favorites.png) | **PASS** |
| 15 | Orders | `/orders` | buyer | PASS | PASS | PASS | [15-orders.png](15-orders.png) | **PASS** |
| 16 | Order Details | `/orders/[id]` | buyer | PASS | PASS | PASS | [16-order-detail.png](16-order-detail.png) | **PASS** |
| 17 | Order / Delivery Tracking | `/delivery-tracking` | buyer | PASS | PASS | PASS | [17-delivery-tracking.png](17-delivery-tracking.png) | **PASS** |
| 18 | Public tracking | `/track/[trackingNumber]` | guest|buyer | PASS | PASS | PASS | [18-public-tracking.png](18-public-tracking.png) | **PASS** |
| 19 | Delivery Confirmation | `/orders/[id]` | buyer | PASS | PASS | PASS | [19-delivery-confirm.png](19-delivery-confirm.png) | **PASS** |
| 20 | Addresses | `/addresses` | buyer | PASS | PASS | PASS | [20-addresses.png](20-addresses.png) | **PASS** |
| 21 | Wallet | `/wallet` | buyer | PASS | PASS | PASS | [21-wallet.png](21-wallet.png) | **PASS** |
| 22 | Wallet top-up / Card FM recharge | `/wallet` | buyer|blocked-policy | BLOCKED | BLOCKED | BLOCKED | [22-wallet-topup.png](22-wallet-topup.png) | **BLOCKED** |
| 23 | Wallet P2P transfer | `/wallet-transfer` | buyer | PASS | PASS | PASS | [23-wallet-transfer.png](23-wallet-transfer.png) | **PASS** |
| 24 | Transaction History | `/wallet-history` | buyer | PASS | PASS | PASS | [24-wallet-history.png](24-wallet-history.png) | **PASS** |
| 25 | Flex Card repay | `/flex-card-repay` | buyer | PASS | PASS | PASS | [25-flex-card-repay.png](25-flex-card-repay.png) | **PASS** |
| 26 | BNPL | `/bnpl` | buyer | PASS | PASS | PASS | [26-bnpl.png](26-bnpl.png) | **PASS** |
| 27 | Account / Profile hub | `/profile` | buyer | PASS | PASS | PASS | [27-profile-account.png](27-profile-account.png) | **PASS** |
| 28 | Public seller shop | `/shop/[id]` | buyer | PASS | PASS | PASS | [28-shop-profile.png](28-shop-profile.png) | **PASS** |
| 29 | Edit Profile | `/edit-profile` | buyer | PASS | PASS | PASS | [29-edit-profile.png](29-edit-profile.png) | **PASS** |
| 30 | Settings (marketplace country) | `/settings` | buyer | PASS | PASS | PASS | [30-settings.png](30-settings.png) | **PASS** |
| 31 | Settings subpages (identity, security, privacy, preferences, help, payments, notifications prefs) | `/settings/*` | buyer | PASS | PASS | PASS | [31-settings-subpages.png](31-settings-subpages.png) | **PASS** |
| 32 | Notifications | `/notifications` | buyer | PASS | PASS | PASS | [32-notifications.png](32-notifications.png) | **PASS** |
| 33 | Android push (FCM) | `expo-notifications` | buyer|blocked-policy | BLOCKED | BLOCKED | BLOCKED | [33-push-fcm.png](33-push-fcm.png) | **BLOCKED** |
| 34 | Account Verification (KYC) | `/kyc` | buyer | PASS | PASS | PASS | [34-kyc.png](34-kyc.png) | **PASS** |
| 35 | Language picker | `/language-picker` | guest|buyer | PASS | PASS | PASS | [35-language-picker.png](35-language-picker.png) | **PASS** |
| 36 | Offers | `/offers` | guest|buyer | PASS | PASS | PASS | [36-offers.png](36-offers.png) | **PASS** |
| 37 | Subscription / VIP | `/subscription` | buyer | PASS | PASS | PASS | [37-subscription.png](37-subscription.png) | **PASS** |
| 38 | Subscription digital purchase | `/subscription` | buyer|blocked-policy | BLOCKED | BLOCKED | BLOCKED | [38-subscription-billing.png](38-subscription-billing.png) | **BLOCKED** |
| 39 | Referral System / Leaderboard | `/leaderboard` | buyer | PASS | PASS | PASS | [39-referrals.png](39-referrals.png) | **PASS** |
| 40 | Commission promo | `/commission-promo` | buyer | PASS | PASS | PASS | [40-commission-promo.png](40-commission-promo.png) | **PASS** |
| 41 | Jobs board | `/jobs` | guest|buyer | PASS | PASS | PASS | [41-jobs.png](41-jobs.png) | **PASS** |
| 42 | CalcAI calculator | `/calculator` | buyer | PASS | PASS | PASS | [42-calculator.png](42-calculator.png) | **PASS** |
| 43 | Help Center / FAQ / Contact | `/help-center` | guest|buyer | PASS | PASS | PASS | [43-help-center.png](43-help-center.png) | **PASS** |
| 44 | Legal pages (privacy, terms, EULA, policies) | `/legal/[slug]` | guest|buyer | PASS | PASS | PASS | [44-legal.png](44-legal.png) | **PASS** |
| 45 | Kominike / Inbox / Messages | `/inbox` | buyer | PASS | PASS | PASS | [45-inbox.png](45-inbox.png) | **PASS** |
| 46 | Private / Product Chat | `/chat/[id]` | buyer | PASS | PASS | PASS | [46-chat-thread.png](46-chat-thread.png) | **PASS** |
| 47 | Support Center / Tickets | `/support` | buyer | PASS | PASS | PASS | [47-support-tickets.png](47-support-tickets.png) | **PASS** |
| 48 | FlexaBot Chatbot | `/chatbot` | buyer | PASS | PASS | PASS | [48-chatbot.png](48-chatbot.png) | **PASS** |
| 49 | Add Product / Sell | `/sell` | seller | PASS | PASS | PASS | [49-sell.png](49-sell.png) | **PASS** |
| 50 | Product Management / My Listings | `/my-listings` | seller | PASS | PASS | PASS | [50-my-listings.png](50-my-listings.png) | **PASS** |
| 51 | Edit Product | `/sell-edit/[id]` | seller | PASS | PASS | PASS | [51-edit-listing.png](51-edit-listing.png) | **PASS** |
| 52 | Image Upload | `/sell` | seller | PASS | PASS | PASS | [52-image-upload.png](52-image-upload.png) | **PASS** |
| 53 | Video Upload | `/videos` | seller | PASS | PASS | PASS | [53-video-upload.png](53-video-upload.png) | **PASS** |
| 54 | Inventory / Restock | `/my-listings` | seller | PASS | PASS | PASS | [54-inventory.png](54-inventory.png) | **PASS** |
| 55 | Seller Dashboard / Sales | `/sales` | seller | PASS | PASS | PASS | [55-sales.png](55-sales.png) | **PASS** |
| 56 | Sales Analytics | `/analytics` | seller | PASS | PASS | PASS | [56-seller-analytics.png](56-seller-analytics.png) | **PASS** |
| 57 | Seller Orders Management | `/sales` | seller | PASS | PASS | PASS | [57-seller-orders.png](57-seller-orders.png) | **PASS** |
| 58 | Earnings / Commissions / Payouts | `/settings/payments` | seller | PASS | PASS | PASS | [58-earnings-payouts.png](58-earnings-payouts.png) | **PASS** |
| 59 | Boost Campaigns | `/boost` | seller | PASS | PASS | PASS | [59-boost.png](59-boost.png) | **PASS** |
| 60 | Paid Boost purchase | `/boost` | seller | BLOCKED | BLOCKED | BLOCKED | [60-boost-paid.png](60-boost-paid.png) | **BLOCKED** |
| 61 | Boost Analytics | `/boost-analytics` | seller | PASS | PASS | PASS | [61-boost-analytics.png](61-boost-analytics.png) | **PASS** |
| 62 | My Boosts | `/my-boosts` | seller | PASS | PASS | PASS | [62-my-boosts.png](62-my-boosts.png) | **PASS** |
| 63 | Promotional Videos / Video Discover | `/videos` | seller | PASS | PASS | PASS | [63-promo-videos.png](63-promo-videos.png) | **PASS** |
| 64 | My Drafts / Bouillon | `/my-drafts` | seller | PASS | PASS | PASS | [64-drafts.png](64-drafts.png) | **PASS** |
| 65 | Store Manager Dashboard | `/manager` | manager | PASS | PASS | PASS | [65-store-manager.png](65-store-manager.png) | **PASS** |
| 66 | Seller Registration / Stripe Connect | `/sell` | seller | PASS | PASS | PASS | [66-seller-registration.png](66-seller-registration.png) | **PASS** |
| 67 | Driver Registration | `/driver-apply` | driver|haiti-buyer-applicant | PASS | PASS | PASS | [67-driver-apply.png](67-driver-apply.png) | **PASS** |
| 68 | Driver Dashboard / Jobs | `/driver-dashboard` | driver|haiti-buyer-applicant | PASS | PASS | PASS | [68-driver-dashboard.png](68-driver-dashboard.png) | **PASS** |
| 69 | Cash Agent directory / dashboard | `/agents` | buyer | PASS | PASS | PASS | [69-cash-agent.png](69-cash-agent.png) | **PASS** |
| 70 | Business Loans | `/loans` | buyer | PASS | PASS | PASS | [70-loans.png](70-loans.png) | **PASS** |
| 71 | Credit Score | `/credit-score` | buyer | PASS | PASS | PASS | [71-credit-score.png](71-credit-score.png) | **PASS** |
| 72 | Flexa TV | `/tv` | guest|buyer | PASS | PASS | PASS | [72-flexa-tv.png](72-flexa-tv.png) | **PASS** |
| 73 | Flexa Music | `/music` | guest|buyer | PASS | PASS | PASS | [73-flexa-music.png](73-flexa-music.png) | **PASS** |
| 74 | Music digital purchase | `/music` | buyer|blocked-policy | BLOCKED | BLOCKED | BLOCKED | [74-music-purchase.png](74-music-purchase.png) | **BLOCKED** |
| 75 | Flexa Control / Super Admin Dashboard | `/admin` | superadmin|admin|support | PASS | PASS | PASS | [75-admin-panel.png](75-admin-panel.png) | **PASS** |
| 76 | User / Seller / Driver Management | `/admin/users` | superadmin|admin|support | PASS | PASS | PASS | [76-admin-users.png](76-admin-users.png) | **PASS** |
| 77 | Product Moderation / Reports / Disputes | `/admin/moderation` | superadmin|admin|support | PASS | PASS | PASS | [77-admin-moderation.png](77-admin-moderation.png) | **PASS** |
| 78 | Financial Management / Payments / Wallet Ops / Refunds | `payments` | superadmin|admin|support | PASS | PASS | PASS | [78-admin-finance.png](78-admin-finance.png) | **PASS** |
| 79 | Support Agent Management / Live Support / Tickets | `/admin/support` | superadmin|admin|support | PASS | PASS | PASS | [79-admin-support.png](79-admin-support.png) | **PASS** |
| 80 | Admin Analytics / Announcements / Role Management | `/admin/analytics`, `/admin/more` | superadmin|admin|support | PASS | PASS | PASS | [80-admin-analytics.png](80-admin-analytics.png) | **PASS** |
| 81 | Delete Account / Data Deletion | `/delete-account` | buyer | PASS | PASS | PASS | [81-delete-account.png](81-delete-account.png) | **PASS** |
| 82 | Website WebView shell | `/website` | guest|buyer | PASS | PASS | PASS | [82-website-embed.png](82-website-embed.png) | **PASS** |
| 83 | Flexa eSIM | `/esim` | buyer|blocked-policy | BLOCKED | BLOCKED | BLOCKED | [83-esim.png](83-esim.png) | **BLOCKED** |
| 84 | Smart notification deep-links | `PushBootstrap` | buyer | PASS | PASS | PASS | [84-smart-notifications.png](84-smart-notifications.png) | **PASS** |

## Extra delivery evidence (order #68 · delivery #27)
- [16-order-detail-seller-ship.png](16-order-detail-seller-ship.png) — seller Request FM Driver panel
- [16-order-detail-seller-after-ship.png](16-order-detail-seller-after-ship.png)
- [68-driver-dashboard-available.png](68-driver-dashboard-available.png)
- [68-driver-dashboard-assigned.png](68-driver-dashboard-assigned.png)
- [16-order-detail-buyer-pin-redacted.png](16-order-detail-buyer-pin-redacted.png) — PIN blacked out
- [68-driver-milestone-picked-up.png](68-driver-milestone-picked-up.png)
- [68-driver-milestone-on-the-way.png](68-driver-milestone-on-the-way.png)
- [68-driver-milestone-arrived.png](68-driver-milestone-arrived.png)
- [19-delivery-confirm-delivered.png](19-delivery-confirm-delivered.png)
- [17-delivery-tracking-delivered.png](17-delivery-tracking-delivered.png)
- Driver approved: [67-driver-apply.png](67-driver-apply.png) Status Approved · Open dashboard

**No release AAB.**
