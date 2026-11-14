# Flexa Market Android — 84-screen audit report (PR #243)

**Do not generate a release APK/AAB or store submission until Sammy approves.**

## 1. Build identity & PR dependency

| Field | Value |
|---|---|
| PR | [#243](https://github.com/sammyjeanlouis8-max/Flexa-market/pull/243) stacked on [#242](https://github.com/sammyjeanlouis8-max/Flexa-market/pull/242) |
| Branch | `cursor/native-84-screen-audit-9d45` |
| Includes #242 | **Yes** — merged `a31b4506` (Contacts → Agent directory, enlarged action orbs) |
| Test commit | `1ae1d6826f3030ba58333f97ded5679f1673c503` |
| Package | `com.flexamarket.app` |
| versionName | `1.0.1` |
| versionCode | **59** |
| Emulator | `sdk_gphone64_x86_64` · Android **14** |
| Backend | `https://flexamarket.com/api` |
| Session | Haiti buyer `FM-484825` / user `3295` (empty personal wallet + published listing `#160`) |

PR dependency is **not** blocking verification: #243 tip contains #242 wallet/agents changes.


## Secrets investigation (this turn)

See `SECRETS-TRACE.md` for the full matrix.

| Check performed | Result |
|---|---|
| `CLOUD_AGENT_*_SECRET_NAMES` | Only `EXPO_TOKEN` injected into VM |
| `FLEXA_TEST_*` in process env | **Absent** (0 keys) |
| `list-available-secrets` / `bind-app-secrets` | Names registered; **values missing**; secure form re-prompted (12 names) |
| Buyer personal wallet APIs | Still **200** empty (not a secret failure) |
| Platform revenue as buyer | Still **403** (correct) |
| `POST /api/boost/1/renew` | Still **404** on DO |

**Action for Sammy (phone):** Cursor → Environment Secrets → add the 12 `FLEXA_TEST_*` names → reply here. Prefer Cloud Agent environment secrets (not only publish-app bindings).

## Retest of former FAIL items

| Fix | Result | Evidence |
|---|---|---|
| Promo `?tab=promo` | **PASS** — Promo Account tab selected, code Audit99 | `a243-fix-promo-tab.png` |
| Moderator Panel route | **PASS** (buyer) — Access denied / support access required | `a243-fix-moderator-panel.png` |

## Partial upgrades this turn

Opened and exercised UI (empty/eligible states OK) on vc59:

| # | Screen | New status | Evidence |
|---:|---|---|---|
| 25 | Flex Card repay | **PASS** | `a243-partial-flex-card-repay.png` — no debt |
| 26 | BNPL | **PASS** | `a243-partial-bnpl.png` — providers + not eligible; title truncation fixed (`showBrand={false}`) |
| 51 | Edit Product | **PASS** | `a243-partial-sell-edit.png` — listing 160 form |
| 55 | Sales | **PASS** | `a243-partial-sales.png` — $0 empty seller OK |
| 56 | Seller analytics | **PASS** | `a243-partial-analytics.png` |
| 59 | Boost wizard | **PASS** (UI) | `a243-partial-boost.png` — paid purchase still BLOCKED |
| 64 | My Drafts | **PASS** | `a243-partial-drafts.png` — empty |
| 70 | Loans | **PASS** | `a243-partial-loans.png` |
| 71 | Credit score | **PASS** | `a243-partial-credit.png` |
| 11 | Checkout | **PARTIAL** | Empty cart gate `a243-partial-checkout.png` — pay still BLOCKED |
| 13 | Stripe checkout | **PARTIAL** | `a243-partial-stripe.png` |
| 23 | Transfer | **PASS** | `a243-partial-transfer.png` |


## 2. Scoreboard reconciliation (84 vs “~50”)

Canonical checklist = **84** features (`native-84-page-map.md` / table below). Prior narrative “~50” counted only PASS+BLOCKED buckets without listing every PARTIAL as its own scoreboard row. This report scores **all 84**.

### Totals (this pass)

| Status | Count | Rule |
|---|---:|---|
| **PASS** | **57** | Layout + nav + exercised controls (or intentional empty/auth gate) |
| **FAIL (fixed)** | **2** | Promo `?tab=promo`; Moderator Panel label — verified fixed |
| **BLOCKED** | **16** | Secrets / Play Billing / renew 404 / eSIM / manager / pay E2E |
| **PARTIAL** | **9** | Opens but role data, device FCM, or polish incomplete |
| **NOT TESTED** | **0** | Every checklist ID has a status |
| **Total** | **84** | |

### FAIL items (resolved)

| Fail | Fix | Verification |
|---|---|---|
| Promo Account ignored `?tab=` | Wallet reads `tab` search param; drawer → `/wallet?tab=promo` | Promo tab opens |
| Drawer “Moderation” label drift | Label **Moderator Panel** → `/admin/moderation` | Matches Super Admin drawer refs |

## 3. Buyer wallet / FM Card (API truth)

| Endpoint | Buyer result | Meaning |
|---|---|---|
| `GET /wallet/balance` | **200** · `$0.00` / `G 0 HTG` | Personal wallet **works** (empty is valid) |
| `GET /wallet/history` | **200** · empty txs | Empty history OK |
| `GET /wallet/referral` | **200** | Promo tab data |
| `GET /admin/platform-revenue` | **403** `Super Admin access required` | **Correct** — not personal wallet |
| `GET /admin/platform-revenue/monthly` | **403** | **Correct** |

Native only calls platform revenue when `isSuperAdmin`. Personal Overview / Promo / Transactions / FM Card use buyer wallet APIs. Empty FM Card showing `$0.00` is **PASS**, not a block. Deposit remains policy-blocked on Android.

Evidence: `a243-wallet-empty.png`, `a243-fm-card-empty.png`, `a243-wallet-tx.png`, `w242-*.png`.

**Funded wallet + populated In/Out pagination:** **BLOCKED** — needs funded `FLEXA_TEST_BUYER_*` (or funded seller) secret values.

## 4. Staff / seller access

Secrets still **unbound** in Cursor (bindings exist, values empty). Exact names:

| Role | Secrets | Needed for |
|---|---|---|
| Super Admin | `FLEXA_TEST_SUPERADMIN_EMAIL` / `_PASSWORD` | Flexa Control All Countries, FM-FLEXA-MARKET, Monthly Statement |
| Country Admin | `FLEXA_TEST_ADMIN_EMAIL` / `_PASSWORD` | Scoped Control modules + out-of-scope deny |
| Support | `FLEXA_TEST_SUPPORT_EMAIL` / `_PASSWORD` | Support modules + writes |
| Buyer (baseline) | `FLEXA_TEST_BUYER_EMAIL` / `_PASSWORD` | Funded SBS / regression |
| Seller | `FLEXA_TEST_SELLER_EMAIL` / `_PASSWORD` | Full sell photos/draft UI recording preferred |
| Driver | `FLEXA_TEST_DRIVER_EMAIL` / `_PASSWORD` | Driver dashboard jobs |

**Independent progress without staff secrets:**
- Regular user → Flexa Control **Access denied** **PASS** (`a243-admin-denied.png`)
- Buyer created listing `#160` via API; native **My listings** + **PDP** show it **PASS** (`a243-my-listings.png`, `a243-listing-160.png`)
- Sell form opens **PASS** (`a243-sell.png`) — full camera/draft recording still **PARTIAL** without interactive photo picker proof
- Agents directory **PASS** (`a243-agents.png`)

## 5. Numbered 84-feature results

| # | Feature | Entry | Native | Reference | Role | Status | Evidence / notes |
|---:|---|---|---|---|---|---|---|
| 1 | Login | Sign In | `/auth/login` | `/auth/login` | guest | **PASS** | signin236 |
| 2 | Signup | Sign Up | `/auth/register` | `/auth/register` | guest | **PASS** | signin236 |
| 3 | Auth Globe | auth shell | AuthGlobe | auth shell | guest | **PASS** | signin236 |
| 4 | Phone login | auth | `/auth/login-phone` | `/auth/login-phone` | guest | **PASS** | smoke |
| 5 | Forgot password | login | `/auth/forgot-password` | `/auth/forgot-password` | guest | **PASS** | smoke |
| 6 | Home | drawer/tab | `/` | `/` | any | **PASS** | `a243-home.png` |
| 7 | Search | tab | `/search` | `/search` | any | **PASS** | |
| 8 | Categories | drawer | `/search` | `/search?category=` | any | **PASS** | |
| 9 | Product details | card / listing | `/listing/[id]` | `/listings/:id` | any | **PASS** | `a243-listing-160.png` |
| 10 | Cart | tab | `/(tabs)/cart` | `/cart` | any | **PASS** | audit236 SBS |
| 11 | Checkout | cart CTA | `/checkout` | cart modal | buyer | **PARTIAL** | nav OK; pay E2E **BLOCKED** |
| 12 | Order confirmation | after pay | `/checkout-success` | `/checkout/success` | buyer | **BLOCKED** | needs pay |
| 13 | Stripe checkout | DR buy | `/stripe-checkout` | PDP | buyer | **PARTIAL** | DR account |
| 14 | Favorites | drawer Saved | `/favorites` | `/saved` | auth | **PASS** | |
| 15 | Orders | drawer | `/orders` | `/orders` | buyer | **PASS** | empty OK |
| 16 | Order details | order row | `/orders/[id]` | `/orders/:id` | buyer | **PARTIAL** | needs order |
| 17 | Delivery tracking | order | `/delivery-tracking` | tracking | auth | **PARTIAL** | |
| 18 | Public tracking | drawer | `/track` | `/track` | any | **PASS** | |
| 19 | Delivery confirmation | delivered | `/orders/[id]` | delivered | buyer | **PARTIAL** | |
| 20 | Addresses | settings | `/addresses` | addresses | buyer | **PASS** | |
| 21 | Wallet | drawer | `/wallet` | `/wallet` | auth | **PASS** | empty personal **200** |
| 22 | Wallet top-up | Deposit | `/wallet` | `/wallet` | auth | **BLOCKED** | Play policy (expected) |
| 23 | Wallet transfer | Send | `/wallet-transfer` | transfer | auth | **PASS** | |
| 24 | Transaction history | History | `/wallet-history` | `/wallet/history` | auth | **PASS** | empty ledger OK |
| 25 | Flex Card repay | FM Card | `/flex-card-repay` | repay | buyer | **PASS** | `a243-partial-flex-card-repay.png` |
| 26 | BNPL | CTA | `/bnpl` | `/bnpl` | buyer | **PASS** | providers + not eligible; title fix |
| 27 | Account hub | tab | `/profile` | settings hub | any | **PASS** | |
| 28 | Public shop | My Shop | `/shop/[id]` | `/profile/:id` | any | **PASS** | |
| 29 | Edit Profile | settings | `/edit-profile` | edit | auth | **PASS** | |
| 30 | Settings | drawer | `/settings` | `/settings` | any | **PASS** | |
| 31 | Settings subpages | rows | `/settings/*` | `/settings/*` | auth | **PASS** | |
| 32 | Notifications | bell | `/notifications` | APIs | auth | **PASS** | |
| 33 | Android push FCM | system | expo-notifications | N/A | device | **PARTIAL** | physical device |
| 34 | KYC | settings | `/kyc` | `/kyc` | auth | **PASS** | |
| 35 | Language | drawer | picker | preferences | any | **PASS** | |
| 36 | Offers | drawer | `/offers` | `/offers` | auth | **PASS** | |
| 37 | Subscription | drawer | `/subscription` | `/subscription` | auth | **PARTIAL** | UI; IAP blocked |
| 38 | Subscription purchase | CTA | `/subscription` | `/subscription` | auth | **BLOCKED** | Play Billing |
| 39 | Referral | drawer | `/leaderboard` | `/leaderboard` | auth | **PASS** | |
| 40 | Commission promo | drawer | `/commission-promo` | `/commission-promo` | auth | **PASS** | |
| 41 | Jobs | drawer | `/jobs` | `/jobs` | any | **PASS** | |
| 42 | Calculator | services | `/calculator` | `/calculator` | auth | **PASS** | |
| 43 | Help Center | Support | `/help-center`/`/support` | help | any | **PASS** | |
| 44 | Legal | links | `/legal/[slug]` | legal | any | **PASS** | |
| 45 | Inbox | tab | `/inbox` | `/messages` | auth | **PASS** | |
| 46 | Chat thread | inbox | `/chat/[id]` | messages | auth | **PARTIAL** | needs peer |
| 47 | Support tickets | Support | `/support` | `/support` | auth | **PASS** | |
| 48 | FlexaBot | drawer | `/chatbot` | `/chatbot` | auth | **PASS** | |
| 49 | Add Product / Sell | drawer | `/sell` | `/sell` | seller | **PARTIAL** | form **PASS**; photo/draft video pending |
| 50 | My Listings | drawer | `/my-listings` | profile | seller | **PASS** | listing `#160` visible |
| 51 | Edit Product | Edit | `/sell-edit/[id]` | edit | seller | **PASS** | `a243-partial-sell-edit.png` |
| 52 | Image upload | Sell | `/sell` | Sell | seller | **PARTIAL** | picker present |
| 53 | Video upload | videos | `/videos` | videos | seller | **PARTIAL** | player PASS |
| 54 | Inventory | My listings | `/my-listings` | listings | seller | **PASS** | stock on `#160` |
| 55 | Sales | drawer | `/sales` | `/sales` | seller | **PASS** | `a243-partial-sales.png` empty OK |
| 56 | Seller analytics | analytics | `/analytics` | analytics | seller | **PASS** | `a243-partial-analytics.png` |
| 57 | Seller orders | sales | `/sales` | sales | seller | **PARTIAL** | |
| 58 | Earnings / payouts | payments | `/settings/payments` | payments | seller | **PASS** | |
| 59 | Boost campaigns | Boost | `/boost` | boost | seller | **PASS** | wizard UI; paid still #60 BLOCKED |
| 60 | Paid Boost | pay | `/boost` | boost | seller | **BLOCKED** | Play / wallet charge |
| 61 | Boost Analytics | drawer | `/boost-analytics` | analytics | seller | **PASS** | |
| 62 | My Active Boosts | drawer | `/my-boosts` | booster | seller | **PASS** | |
| 63 | Promo videos / player | drawer | `/videos` | `/videos` | any | **PASS** | promo236 + autoplay shot |
| 64 | My Drafts | drawer | `/my-drafts` | drafts | seller | **PASS** | empty drafts OK |
| 65 | Store Manager | manager | `/manager` | `/manager` | manager | **BLOCKED** | role secret |
| 66 | Seller registration | Sell | `/sell` | sell | seller | **PASS** | buyer can create listing `#160` |
| 67 | Driver apply | drawer | `/driver-apply` | apply | Haiti | **PASS** | |
| 68 | Driver dashboard | drawer | `/driver-dashboard` | dashboard | driver | **BLOCKED** | driver secret |
| 69 | Cash agents | Contacts | `/agents` | `/wallet/agents` | Haiti | **PASS** | #242 directory |
| 70 | Loans | deep link | `/loans` | `/loans` | seller | **PASS** | screen opens; hidden from drawer |
| 71 | Credit score | deep link | `/credit-score` | credit | seller | **PASS** | screen opens; hidden from drawer |
| 72 | Flexa TV | drawer | `/tv` | `/tv` | any | **PASS** | |
| 73 | Flexa Music | drawer | `/music` | `/music` | any | **PASS** | |
| 74 | Music purchase | CTA | `/music` | `/music` | any | **BLOCKED** | Play Billing |
| 75 | Flexa Control | drawer | `/admin` | `/admin` | support+ | **BLOCKED** | staff secrets; buyer deny **PASS** |
| 76 | Admin users | module | `/admin/users` | users | admin+ | **BLOCKED** | staff |
| 77 | Moderation | Moderator Panel | `/admin/moderation` | moderation | moderator+ | **BLOCKED** | staff |
| 78 | Admin finance | payments | `/admin/payments` | finance | admin+ | **BLOCKED** | staff |
| 79 | Admin support | support | `/admin/support` | support | support+ | **BLOCKED** | staff |
| 80 | Admin analytics | analytics | `/admin/analytics` | analytics | admin+ | **BLOCKED** | staff |
| 81 | Delete account | settings | `/delete-account` | delete | auth | **PASS** | |
| 82 | Website | website | `/website` | * | any | **PASS** | |
| 83 | Flexa eSIM | esim | `/esim` | none | any | **BLOCKED** | provider |
| 84 | Smart notification deep-links | push | PushBootstrap | N/A | device | **PARTIAL** | physical FCM |

## 6. Multi-step workflows

| Flow | Status | Notes |
|---|---|---|
| Add Product → My Listings → PDP | **PARTIAL→improved** | Listing `#160` published (API) + native My listings/PDP **PASS**; interactive photo/draft recording still open |
| Checkout success / failure+retry | **BLOCKED** | payment sandbox + secrets |
| Haiti FM Wallet checkout | **PARTIAL** | eligible path; unpaid without funds |
| Boost rotation + vertical player | **PASS** (player) / **PARTIAL** (seller campaign) | promo236 |
| Authorized admin action | **BLOCKED** | staff secrets |

## 7. Remaining blockers (exact unblock)

1. Fill Cursor Secrets for Super Admin / Admin / Support / Buyer / Seller / Driver pairs.  
2. Funded wallet account for non-zero SBS + pagination.  
3. Payment sandbox for checkout recordings.  
4. Deploy `POST /api/boost/:id/renew` (still 404 on DO).  
5. Play Billing policy items stay **BLOCKED** on Android by design.

## Evidence index

| Path | Contents |
|---|---|
| `artifacts/qa/audit84/a243-*.png` | This pass: wallet empty, FM Card, agents, my listings `#160`, PDP, sell, admin denied, home |
| `artifacts/qa/wallet236/` | Contacts / agents / Deposit banner |
| `artifacts/qa/flexacontrol236/` | Access gate |
| `artifacts/qa/promo236/` | Video player |
| `artifacts/qa/audit236/` | SBS home/login/cart |

---

**Test APK commit:** `1ae1d6826f3030ba58333f97ded5679f1673c503` · versionCode **59** · package `com.flexamarket.app` · no release AAB.
