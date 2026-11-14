# FM Wallet native parity — results

**Branch:** `cursor/fm-wallet-native-parity-9d45`  
**Package:** `com.flexamarket.app` · versionCode **57** · versionName **1.0.1**  
**API:** `https://flexamarket.com/api`  
**Test account:** empty-wallet buyer (`FM-321406`, Haiti, `$0.00` / `G 0 HTG`)

## Comparison table

| Screen / action | Status | Notes |
|---|---|---|
| Wallet Overview (green card, HTG, hide/show, QR, Copy/Share) | **Fixed** | Matches reference layout; rates from `GET /wallet/balance` |
| Available / Promo / Unlocked cards | **Fixed** | From same balance payload (`availableUsd`, `promoBalance`, `unlockedBalance`) |
| Overview / Promo / Transactions tabs | **Fixed** | Emulator screenshots attached |
| Deposit | **Verified** | Remains blocked on Android (Play policy + server guard); shows reason |
| Send | **Fixed** | → `/wallet-transfer` |
| Contacts | **Blocked** | No native agents directory; explains limitation |
| Bonus (redeem card) | **Fixed** | Modal → `POST /wallet/redeem-card` |
| Receive / Cash out | **Fixed** | → `/wallet-cashout` → `POST /cashout/request` |
| History | **Fixed** | → `/wallet-history` + in-tab All/In/Out |
| FM Card destination | **Fixed** | `/wallet-card` virtual card (separate from Flex Card debt) |
| Official FM-FLEXA-MARKET platform card | **Verified** | Super Admin only; buyer `GET /admin/platform-revenue` → **403** `Super Admin access required` |
| Monthly Statement | **Fixed** | Super Admin → `/admin/platform-revenue/monthly` |
| Referral section | **Fixed** | `GET /wallet/referral` |
| Promo unlock / convert | **Fixed** | Wired when balances allow |
| Agent / Driver entries | **Fixed** | Haiti driver apply; agent panel/apply links |
| Haiti cart FM Wallet checkout | **Verified** | Unchanged eligible path (not regresssed) |
| Account with real transactions / funded balances | **Blocked** | Need staff/funded `FLEXA_TEST_*` secrets for non-zero SBS |

## Remaining differences (specific causes)

1. **Contacts** — web opens `/wallet/agents`; native has no agents directory route yet (alert explains).
2. **History shortcut on web** goes to `/sales`; native uses `/wallet-history` (correct ledger history).
3. **Non-zero / Super Admin platform UI** — blocked without funded or Super Admin test secrets in this environment.
4. **QR** uses `api.qrserver.com` image (display-only); web uses in-app QR component — same account payload.

## Evidence

- `wallet-overview.png`
- `wallet-promo.png`
- `wallet-transactions.png`
- `wallet-fm-card.png`

## Test APK commit

*(filled after push)*
