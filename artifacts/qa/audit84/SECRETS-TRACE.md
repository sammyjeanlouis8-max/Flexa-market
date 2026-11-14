# Secrets / env blocker trace (PR #243)

Checked: 2026-11-14 (America/New_York). Commit under test: see `AUDIT84-RESULTS.md`.

## What is configured today

| Source | Result |
|---|---|
| VM env `CLOUD_AGENT_ALL_SECRET_NAMES` | Only `EXPO_TOKEN` |
| VM env `CLOUD_AGENT_INJECTED_SECRET_NAMES` | Only `EXPO_TOKEN` |
| VM env keys matching `FLEXA_TEST_*` | **None present** |
| `cursor-cloud` `list-available-secrets` for `artifacts/mobile` | Bindings declared; **`secrets: []`** (no values) |
| App runtime config | `EXPO_PUBLIC_DOMAIN=flexamarket.com` (`eas.json`) — production DigitalOcean API; **no** test-account env vars in app code |

**Important:** `bind-app-secrets` registers names for **published app** bindings. Staff/QA logins must also exist as **Cloud Agent / Environment secrets** so they inject into this VM (`CLOUD_AGENT_*`). Today they do not.

## Blocked checks → exact requirement

| Audit # / flow | Why blocked | Exact secret / data | Config / step cited |
|---|---|---|---|
| #75–#80 Flexa Control staff modules + writes | Need staff JWT; buyer gets `GET /admin/me` → 403 `support access required` | `FLEXA_TEST_SUPERADMIN_EMAIL`+`_PASSWORD`, `FLEXA_TEST_ADMIN_EMAIL`+`_PASSWORD`, `FLEXA_TEST_SUPPORT_EMAIL`+`_PASSWORD` | `artifacts/qa/flexacontrol236/STAFF-SECRETS.md`; gate in `AdminControlContext` / `GET /admin/me` |
| #21 funded wallet SBS + #24 populated In/Out | Empty wallet `$0` is valid; non-zero history needs funded account | Funded `FLEXA_TEST_BUYER_EMAIL`+`_PASSWORD` (or seller with ledger) | `GET /wallet/balance` + `/wallet/history` against DO |
| Official FM-FLEXA-MARKET + Monthly Statement | Super Admin only | `FLEXA_TEST_SUPERADMIN_*` | `GET /admin/platform-revenue` → 403 for buyers (verified) |
| #11–#13 checkout pay success/fail | Cart checkout needs funded buyer + payment sandbox path | Funded buyer secrets; Stripe/MonCash sandbox already on DO backend (no agent-side Stripe secret required for wallet checkout) | `POST /api/cart/checkout` (`checkoutApi.ts`); cart is local AsyncStorage until checkout |
| #49 photo/draft recording | Interactive camera/gallery | Prefer `FLEXA_TEST_SELLER_*`; ephemeral seller/buyer can sell but UI recording needs device interaction | `sell.tsx` / `ListingEditor` |
| #60 / #38 / #74 / #22 Play Billing | Policy block on Android | N/A — not a Cursor secret | Deposit alert copy; Play digital goods |
| #68 Driver dashboard | Approved driver | `FLEXA_TEST_DRIVER_EMAIL`+`_PASSWORD` | Drawer Haiti delivery |
| #65 Store Manager | Manager role | No dedicated secret name in repo beyond admin family; needs manager-capable account | `pr233` listed `FLEXA_TEST_AGENT_*` optionally |
| #83 eSIM | Provider | Not secret-gated in QA docs | product integration |
| Boost renew | API missing | Deploy `POST /api/boost/:id/renew` (404 HTML on DO) | Live curl 404 |

## Who acts / where (phone-friendly)

1. Open **Cursor** → this Cloud Agent / Environment → **Secrets** (or [cursor.com](https://cursor.com) → Cloud Agents → your environment → Secrets).  
2. Add each name above (email + password pairs). Do **not** paste values into chat or GitHub.  
3. Prefer **Environment / Cloud Agent secrets** so the next agent run sees them in the VM.  
4. Reply on this thread after saving so the agent can re-run staff / funded / checkout tests.  
5. Obtain credentials from your Flexa Market / DigitalOcean test-account owner (same accounts used on flexamarket.com WebView QA).

If you only fill the **publish-app** secure form from `bind-app-secrets`, the published web app may bind names, but **this Android QA VM still will not** receive them until they are environment secrets.
