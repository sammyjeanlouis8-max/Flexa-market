# 84-screen reconciliation (PR #243)

**PR head confirmed:** `a39a69103220bd6765f7d9ec9f37b1f4e51858fb` on `cursor/native-84-screen-audit-9d45`  
**Canonical checklist:** `artifacts/mobile/docs/native-84-page-map.md` → **84** features  
**Machine inventory:** `inventory84.json` (generated from the map)

## Count reconciliation

| Layer | Count | Notes |
|---:|---:|---|
| Product checklist (this audit) | **84** | Numbered 01–84 below |
| Expo route modules (excl. layouts) | **~90+** | Extra = admin modules, redirects, aliases |
| Difference | checklist ≠ file count | Extra routes map into #75–80 or are aliases |

### Missing vs checklist
None — every checklist ID has a native route or intentional BLOCKED stub (`esim`, Play Billing items).

### Extra native routes (not separate checklist rows)
| Route | Maps to |
|---|---|
| `/admin/[module]`, `/admin/more`, `/admin/orders`, `/admin/payments`, `/admin/analytics` | #75–#80 |
| `/delivery/apply` → `/driver-apply` | #67 |
| `/driver/dashboard`, `/delivery/deliveries` → `/driver-dashboard` | #68 |
| `/saved` → `/favorites` | #14 |
| `/booster` / `/boost-video` | #59–#63 |
| `/wallet-card`, `/wallet-cashout` | #21 wallet family |
| `/my-videos`, `/videos/watch` | #53 / #63 |

---

## Numbered inventory (01–84)

| # | ID | Native route | Normal navigation | Role |
|---:|---|---|---|---|
| 01 | auth-login | `/auth/login` | Guest → Sign in | guest |
| 02 | auth-register | `/auth/register` | Guest → Sign up | guest |
| 03 | auth-globe | Auth shell globe | Login/Register chrome | guest |
| 04 | auth-phone-login | `/auth/login-phone` | Login → Phone | guest |
| 05 | auth-forgot-password | `/auth/forgot-password` | Login → Forgot | guest |
| 06 | home | `/` | Tab Home / drawer Home | guest\|buyer |
| 07 | search | `/search` | Tab Search | guest\|buyer |
| 08 | categories | `/search` | Drawer Categories | guest\|buyer |
| 09 | listing-detail | `/listing/[id]` | Home/search thumbnail | guest\|buyer |
| 10 | cart | `/cart` | Tab Cart / header cart | buyer |
| 11 | checkout | `/checkout` | Cart → Checkout | buyer |
| 12 | checkout-success | `/checkout-success` | After paid checkout | buyer |
| 13 | stripe-single-item | `/stripe-checkout` | PDP Buy (Stripe path) | buyer |
| 14 | favorites | `/favorites` | Drawer Saved | buyer |
| 15 | orders | `/orders` | Drawer My Orders | buyer |
| 16 | order-detail | `/orders/[id]` | Orders list row | buyer\|seller |
| 17 | delivery-tracking | `/delivery-tracking` | Order → Live tracking | buyer\|seller |
| 18 | public-tracking | `/track/[trackingNumber]` | Drawer Order tracking | guest\|buyer |
| 19 | delivery-confirm | `/orders/[id]` | Order delivered state | buyer |
| 20 | addresses | `/addresses` | Settings → Addresses | buyer |
| 21 | wallet | `/wallet` | Drawer Wallet | buyer |
| 22 | wallet-topup | `/wallet` | Wallet Deposit | buyer (Play Billing **BLOCKED**) |
| 23 | wallet-transfer | `/wallet-transfer` | Wallet → Transfer | buyer |
| 24 | wallet-history | `/wallet-history` | Wallet → History | buyer |
| 25 | flex-card-repay | `/flex-card-repay` | Wallet / Flex Card | buyer |
| 26 | bnpl | `/bnpl` | Wallet / finance | buyer |
| 27 | profile-account | `/profile` | Tab Profile | buyer |
| 28 | shop-profile | `/shop/[id]` | Drawer My Shop / seller link | buyer\|seller |
| 29 | edit-profile | `/edit-profile` | Profile → Edit | buyer |
| 30 | settings | `/settings` | Drawer Settings | buyer |
| 31 | settings-subpages | `/settings/*` | Settings rows | buyer |
| 32 | notifications | `/notifications` | Header bell | buyer |
| 33 | push-fcm | (system) | OS notification | buyer (device) |
| 34 | kyc | `/kyc` | Settings / verification | buyer |
| 35 | language-picker | `/language-picker` | Drawer Language | guest\|buyer |
| 36 | offers | `/offers` | Drawer Offers | buyer |
| 37 | subscription | `/subscription` | Drawer Subscription | buyer |
| 38 | subscription-billing | `/subscription` | Subscribe CTA | buyer (**BLOCKED** Play) |
| 39 | referrals | `/leaderboard` | Drawer Referral | buyer |
| 40 | commission-promo | `/commission-promo` | Drawer Commission | buyer |
| 41 | jobs | `/jobs` | Drawer Jobs | guest\|buyer |
| 42 | calculator | `/calculator` | Services / deep link | buyer |
| 43 | help-center | `/help-center` | Support / Help | guest\|buyer |
| 44 | legal | `/legal/[slug]` | Footer / settings legal | guest |
| 45 | inbox | `/inbox` | Tab Inbox | buyer |
| 46 | chat-thread | `/chat/[id]` | Inbox thread | buyer |
| 47 | support-tickets | `/support` | Drawer Support | buyer |
| 48 | chatbot | `/chatbot` | Drawer FlexaBot | buyer |
| 49 | sell | `/sell` | Drawer Add a product | seller |
| 50 | my-listings | `/my-listings` | Drawer My listings | seller |
| 51 | edit-listing | `/sell-edit/[id]` | My listings → Edit | seller |
| 52 | image-upload | `/sell` | Sell → Add photos | seller |
| 53 | video-upload | `/videos` | My videos / upload | seller |
| 54 | inventory | `/my-listings` | My listings stock | seller |
| 55 | sales | `/sales` | Drawer My Sales | seller |
| 56 | seller-analytics | `/analytics` | Sales / analytics | seller |
| 57 | seller-orders | `/sales` → `/orders/[id]` | Sales → order | seller |
| 58 | earnings-payouts | `/settings/payments` | Settings Payments | seller |
| 59 | boost | `/boost` | Listing → Boost | seller |
| 60 | boost-paid | `/boost` | Paid boost CTA | seller (**BLOCKED** Play) |
| 61 | boost-analytics | `/boost-analytics` | Drawer Boost Analytics | seller |
| 62 | my-boosts | `/my-boosts` | Drawer My Active Boosts | seller |
| 63 | promo-videos | `/videos` | Drawer Promotional Videos | guest\|seller |
| 64 | drafts | `/my-drafts` | Drawer My Drafts | seller |
| 65 | store-manager | `/manager` | Manager entry | manager |
| 66 | seller-registration | `/sell` | First sell / Stripe | seller |
| 67 | driver-apply | `/driver-apply` | Drawer Apply as Driver | Haiti user |
| 68 | driver-dashboard | `/driver-dashboard` | Drawer Available Deliveries | approved driver |
| 69 | cash-agent | `/agents` | Wallet → Contacts / Agents | buyer |
| 70 | loans | `/loans` | Deep link (hidden drawer) | buyer |
| 71 | credit-score | `/credit-score` | Deep link | buyer |
| 72 | flexa-tv | `/tv` | Drawer Flexa TV | guest\|buyer |
| 73 | flexa-music | `/music` | Drawer Flexa Music | guest\|buyer |
| 74 | music-purchase | `/music` | Music buy CTA | buyer (**BLOCKED** Play) |
| 75 | admin-panel | `/admin` | Drawer Flexa Control | support+ |
| 76 | admin-users | `/admin/users` | Control → Users | admin+ |
| 77 | admin-moderation | `/admin/moderation` | Moderator Panel | moderator+ |
| 78 | admin-finance | `/admin/payments` | Control → Payments | admin+ |
| 79 | admin-support | `/admin/support` | Control → Support | support+ |
| 80 | admin-analytics | `/admin/analytics` | Control → Analytics / More | admin+ |
| 81 | delete-account | `/delete-account` | Settings → Delete | buyer |
| 82 | website-embed | `/website` | Embedded web shell | guest\|buyer |
| 83 | esim | `/esim` | Deep link | buyer (**BLOCKED** provider) |
| 84 | smart-notifications | PushBootstrap | Push deep-link | buyer |

## QA accounts required

| Role | Secret / account | Screens |
|---|---|---|
| Guest | signed out | 01–05, 06–09 public, 18, 44, 72–73 |
| Buyer (Haiti) | funded buyer / 3297 | cart, checkout, orders, wallet, PIN |
| Seller | 3295 (Audit84) | 49–64, seller ship |
| Driver (approved) | 3295 after DRV approve | 67–68, delivery milestones |
| Super Admin | `FLEXA_TEST_SUPERADMIN_*` | 75–80 |
| Admin / Support | still often missing secrets | scoped Control |

## Android runner status

This Cloud Agent workspace currently **lacks `adb` / Android SDK**. A dedicated Android QA VM was launched from environment build `bld-20261117-be95b6ca-cd6c-4dbc-b93e-66369340279c` on branch `cursor/native-84-gallery-9d45` to build the APK and capture `01`–`84` screenshots into `artifacts/qa/gallery84/`.
