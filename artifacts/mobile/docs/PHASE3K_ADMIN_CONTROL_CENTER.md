# Phase 3K — Native Super Admin Control Center

**Base:** PR #181 tip `623f638a` (`cursor/native-support-phase3j-09ff`)  
**Branch:** `cursor/native-admin-phase3k-09ff`  
**Constraint:** No WebView admin shell. No invented APIs. No merge/deploy.

## Web admin routes reviewed

Source: `artifacts/marketplace/src/components/admin/adminNav.ts` + Control Center modules.

| Web route | Native mapping | Status |
|---|---|---|
| `/admin` | `/admin` | FULLY_NATIVE |
| `/admin/users` | `/admin/users`, `/admin/users/[id]` | FULLY_NATIVE (core) |
| `/admin/team` | `/admin/team` | FULLY_NATIVE |
| `/admin/moderation` | `/admin/moderation` | FULLY_NATIVE |
| `/admin/reports` | `/admin/reports` | FULLY_NATIVE |
| `/admin?tab=orders` | `/admin/orders` | FULLY_NATIVE (overview) |
| `/admin/deliveries` | `/admin/deliveries` | FULLY_NATIVE (list/analytics) |
| `/admin?tab=boosts` | `/admin/boosts` | FULLY_NATIVE |
| Promo / All Videos | `/admin/videos` (`/videos/feed?allCountries=1`) | FULLY_NATIVE |
| `/admin?tab=wallet` + cashouts | `/admin/finance` | PARTIAL |
| `/admin/transactions` | `/admin/finance` tab | PARTIAL |
| Activity / audit | `/admin/audit` | FULLY_NATIVE |
| Traffic analytics | `/admin/traffic` | FULLY_NATIVE |
| `/admin/support`, live support | `/support-admin`, `/support-agent` | FULLY_NATIVE (3J) |
| KYC | `/admin/kyc` | FULLY_NATIVE |
| Settings / fees / broadcast / push | `/admin/settings` (gap hub) | PARTIAL / MISSING |
| `/admin/appeals` | — | MISSING |
| `/admin/operations` | — | MISSING |
| `/admin/flagged` | — | MISSING |
| `/admin/driver-applications` | — | MISSING |
| `/admin/agent-applications` | — | MISSING |
| `/admin/stripe-transactions` | — | MISSING |
| `/admin/moncash-transactions` | — | MISSING |
| `/admin/loans`, `/admin/flex-card` | — | MISSING / BLOCKED policy |
| `/admin/tv`, `/admin/music` | — | MISSING (CMS) |
| `/admin/broadcast`, push campaigns | — | MISSING |
| `/admin/security`, fraud | — | MISSING |
| `/admin/vip-subscriptions` | — | MISSING |
| `/admin?tab=revenue`, fees | — | MISSING |

## Screens → API endpoints

| Screen | Endpoints |
|---|---|
| `/admin` | `GET /admin/me`, `GET /admin/stats` |
| `/admin/users` | `GET /admin/users`, `POST /admin/users/:id/{verify,ban,restrict,...}` |
| `/admin/users/[id]` | `GET /admin/users/:id/activity`, `POST .../set-role` |
| `/admin/moderation` | `GET /admin/moderation`, `GET /admin/moderation/overview`, `POST .../{approve,reject,suspend}` |
| `/admin/reports` | `GET /admin/reports`, `POST /admin/reports/:id/decision` |
| `/admin/orders` | `GET /admin/orders-overview` |
| `/admin/deliveries` | `GET /admin/deliveries`, `GET /admin/delivery/list` |
| `/admin/boosts` | `GET /admin/boosts`, `POST /admin/boosts/:id/{approve,reject}` |
| `/admin/videos` | `GET /videos/feed?allCountries=1` |
| `/admin/finance` | `GET /wallet/admin/all`, `/wallet/admin/transactions`, `/cashout/admin/all`, `POST /cashout/admin/review`, `GET /admin/transactions` |
| `/admin/audit` | `GET /admin/audit-logs`, `/admin/audit-stats`, `/admin/logs` |
| `/admin/traffic` | `GET /admin/stats`, `/admin/analytics/traffic` |
| `/admin/team` | `GET /admin/admins` |
| `/admin/kyc` | `GET /admin/kyc`, `PATCH /admin/kyc/:id/decide` |
| `/admin/settings` | gap documentation only (links to existing `/notifications`, `/settings`) |

## RBAC

Client helpers in `lib/adminRoles.ts`; server `requireRole` / `requireAdmin` / `requireSuperAdmin` / finance gates remain authoritative. Super Admin-only: team directory, set-role, global All Videos.

## Non-goals preserved

- Package id `com.flexa.market` unchanged
- No Firebase/Expo push config changes
- No schema or live payment behavior changes
- No WebView substitution
