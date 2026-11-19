# Secure inputs for Flexa Control + remaining audit E2E

Values must be added in **Cursor Secrets** for this environment (never paste into chat, screenshots, or git).

## Eight inputs for Flexa Control staff verification

| # | Secret name | Purpose |
|---:|---|---|
| 1 | `FLEXA_TEST_SUPERADMIN_EMAIL` | Super Admin menu → Flexa Control → All Countries |
| 2 | `FLEXA_TEST_SUPERADMIN_PASSWORD` | Same |
| 3 | `FLEXA_TEST_ADMIN_EMAIL` | Country-scoped Admin |
| 4 | `FLEXA_TEST_ADMIN_PASSWORD` | Same |
| 5 | `FLEXA_TEST_SUPPORT_EMAIL` | Support-authorized modules |
| 6 | `FLEXA_TEST_SUPPORT_PASSWORD` | Same |
| 7 | `FLEXA_TEST_BUYER_EMAIL` | Regular-user Access denied + buyer checkout |
| 8 | `FLEXA_TEST_BUYER_PASSWORD` | Same |

These eight are email+password for **Super Admin, Admin, Support, and regular buyer** (3 staff + 1 regular).

## Also bound (sell / driver / checkout later)

| Secret name | Purpose |
|---|---|
| `FLEXA_TEST_SELLER_EMAIL` / `FLEXA_TEST_SELLER_PASSWORD` | Add Product, My Videos, boost campaigns |
| `FLEXA_TEST_DRIVER_EMAIL` / `FLEXA_TEST_DRIVER_PASSWORD` | Driver dashboard jobs |

## Setup steps

1. Open Cursor → Cloud Agent environment → Secrets (or dashboard Secrets).
2. Set each name above (personal or team).
3. Re-run the agent (or reply on the PR) so staff Flexa Control E2E and checkout/sell recordings can complete.

**Already PASS without secrets:** signed-out gate, regular-user Access denied (`support access required`) — see `artifacts/qa/flexacontrol236/` and `audit84-admin.png`.
