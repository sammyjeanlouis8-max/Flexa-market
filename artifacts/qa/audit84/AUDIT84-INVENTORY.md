# Flexa Market — 84-screen inventory (native Android audit)

**Branch:** `cursor/native-84-screen-audit-9d45`  
**Canonical checklist:** `artifacts/mobile/docs/native-84-page-map.md` (84 feature IDs)  
**Drawer reference:** attached Super Admin drawer screenshots (Home → Preferences)  
**Web/WebView reference:** `https://flexamarket.com` · API `https://flexamarket.com/api`

## Count reconciliation

| Layer | Count | Notes |
|---:|---:|---|
| Canonical feature checklist | **84** | `native-84-page-map.md` feature IDs |
| `app/**/*.tsx` after Flexa Control merge | **92** | Includes `admin/*` modules + layouts |
| User-facing route modules (excl. `_layout`, `+not-found`) | **~85** | Admin split into index + module routes |
| Drawer destination checks (auth user, Haiti) | **~40** | Separate entry points counted even when they land on the same screen |

**Difference from “84”:** The product checklist is **84 features**. Expo file count grew after Flexa Control (`/admin`, `/admin/[module]`, `/admin/orders`, …). Extra native routes are admin module deep-links, not extra product features. Redirect aliases (`/booster`→`/boost-video`, `/saved`→`/favorites`, etc.) are **duplicate entry checks**, not extra screens.

### Missing / extra / duplicate vs checklist

| Kind | Items |
|---|---|
| **Duplicate entry points** (same screen) | Profile + Settings → `/settings`; Wallet + Promo shortcut → `/wallet` (+`?tab=promo`); My Active Boosts in Shop **and** Flexa Services → `/my-boosts`; Available Deliveries + My Deliveries → `/driver-dashboard`; Reviews & Ratings → `/shop/{me}` (also My Shop) |
| **Intentional hidden** (parity with web native shell) | Loans, Credit Score (not in drawer; routes `/loans`, `/credit-score` still exist) |
| **Label drift (fixed this pass)** | Drawer “Moderation” → **Moderator Panel**; Promo Account header + row → `/wallet?tab=promo` |
| **Native-only** | `/esim` (BLOCKED provider), `/website`, `/language-picker`, `/notifications` inbox |
| **Web-only (no dedicated native)** | `/auth/suspended`, `/auth/set-new-password`, `/music/upload`, `/music/earnings`, `/booster/audiences`, `/dev/*`, many fine-grained `/admin/*` panels beyond Flexa Control modules |
| **Extra after merge** | `/admin/[module]`, `/admin/analytics`, `/admin/orders`, `/admin/payments`, `/admin/more` (map into checklist #75–#80) |

## Drawer → route map (entry checks)

| # | Drawer item | Native route | Reference (web) | Role |
|---:|---|---|---|---|
| D01 | Promo Account (header card) | `/wallet?tab=promo` | `/wallet` promo | auth |
| D02 | Home | `/` | `/` | any |
| D03 | Categories | `/search` | `/search?category=` | any |
| D04 | Offers & Promotions | `/offers` | `/offers` | auth |
| D05 | Flexa Picks | `/` (picks section) | `/` | any |
| D06 | Promotional Videos | `/videos` | `/videos` | any |
| D07 | My Shop | `/shop/{id}` | `/profile/:id` | seller |
| D08 | My listings | `/my-listings` | profile listings | seller |
| D09 | Add a product | `/sell` | `/sell` | seller |
| D10 | My videos | `/my-videos` | `/settings/videos` | seller |
| D11 | My Active Boosts (Shop) | `/my-boosts` | `/booster` | seller |
| D12 | Boost Analytics | `/boost-analytics` | `/boost-analytics` | seller |
| D13 | Shop settings | `/settings` | `/settings` | auth |
| D14 | My Orders | `/orders` | `/orders` | buyer |
| D15 | My Sales & Statistics | `/sales` | `/sales` | seller |
| D16 | Returns & Refunds | `/support` | `/support` | auth |
| D17 | Reviews & Ratings | `/shop/{id}` | shop reviews | seller |
| D18 | Available Deliveries | `/driver-dashboard` | `/driver/dashboard` | Haiti / driver |
| D19 | Apply as Driver | `/driver-apply` | `/delivery/apply` | Haiti |
| D20 | Order tracking | `/track` | `/track` | any |
| D21 | Profile | `/settings` | `/settings` | auth |
| D22 | Saved | `/favorites` | `/saved` | auth |
| D23 | My Drafts | `/my-drafts` | `/my-drafts` | seller |
| D24 | Wallet | `/wallet` | `/wallet` | auth |
| D25 | Promo Account (row) | `/wallet?tab=promo` | `/wallet` | auth |
| D26 | Subscription | `/subscription` | `/subscription` | auth |
| D27 | Settings | `/settings` | `/settings` | auth |
| D28 | Security & Login | `/settings/security` | `/settings/security` | auth |
| D29 | Notifications | `/settings/notifications` | `/settings/notifications` | auth |
| D30 | Flexa TV | `/tv` | `/tv` | any |
| D31 | Flexa Music | `/music` | `/music` | any |
| D32 | My Active Boosts (Services) | `/my-boosts` | `/booster` | auth |
| D33 | Commission Promo | `/commission-promo` | `/commission-promo` | auth |
| D34 | Jobs & Opportunities | `/jobs` | `/jobs` | any |
| D35 | Referral Program | `/leaderboard` | `/leaderboard` | auth |
| D36 | FlexaBot AI | `/chatbot` | `/chatbot` | auth |
| D37 | Support & Help | `/support` | `/support` | any |
| D38 | Flexa Control | `/admin` | `/admin` | support+ |
| D39 | Moderator Panel | `/admin/moderation` | `/admin/moderation` | moderator+ |
| D40 | Language | in-drawer picker | preferences | any |
| D41 | Dark Mode | in-drawer toggle | preferences | any |
| D42 | Sign out | logout → guest home | logout | auth |

## Canonical 84 features → native routes

See `AUDIT84-RESULTS.md` for PASS / FAIL / BLOCKED per feature. IDs 1–84 match `native-84-page-map.md`.
