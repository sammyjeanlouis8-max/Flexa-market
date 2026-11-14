# FM Wallet gaps — PR #242 follow-up

**Branch:** `cursor/fm-wallet-native-parity-9d45`  
**Package:** `com.flexamarket.app` · versionName `1.0.1` · **versionCode 58** (baseline was 57)  
**API:** `https://flexamarket.com/api`  
**Test account:** Haiti buyer (empty wallet) · Super Admin / funded **BLOCKED** (secrets unbound)

## Item status

| # | Item | Status | Notes / evidence |
|---:|---|---|---|
| 1 | Native Agents Directory (Wallet → Contacts) | **PASS** | Contacts → `/agents`. Screen matches web `/wallet/agents`: search, All/Online, trust banner, rates, monthly limit, WhatsApp, Message (`POST /agents/:id/start-chat`), empty + Retry, Back. `w242-agents.png`, `w242-wallet-overview.png` (Contacts orb). |
| 2 | Funded wallet Android ↔ web SBS + populated history | **BLOCKED** | No funded test secret in environment. Empty wallet Overview/Promo/Transactions/FM Card verified (`w242-wallet-*.png`). |
| 2b | History shortcut destination | **PASS** (native intentional) | Web Overview History action routes to `/sales` (seller sales). Native History → `/wallet-history` (ledger). Web also has `/wallet/history` for ledger. **Keep native on `/wallet-history`** for wallet ledger; sales remain under Sales. Evidence: `w242-wallet-history.png`. |
| 3 | Super Admin FM-FLEXA-MARKET + Monthly Statement | **BLOCKED** | Needs `FLEXA_TEST_SUPERADMIN_EMAIL` / `_PASSWORD`. Buyer platform API **403** still holds from prior evidence. |
| 4 | Visible controls + Deposit message + compact layout | **PASS** (enabled paths) | Deposit alert: Play digital-goods block (copy unchanged). Send → transfer · Contacts → agents · Bonus redeem · Receive/Cash out · History · FM Card. Money-movement with sandbox **BLOCKED** without funded account. |

## History routing decision

| Surface | Shortcut | Destination | Verdict |
|---|---|---|---|
| Web Wallet action row “History” | → | `/sales` | Seller stats (web product choice) |
| Web “View all” / tx history link | → | `/wallet/history` | Ledger |
| Native Wallet “History” | → | `/wallet-history` | **Correct** for FM Wallet ledger |

## Secrets still needed

- Funded buyer or seller wallet for non-zero SBS + pagination with real In/Out  
- `FLEXA_TEST_SUPERADMIN_*` for official FM-FLEXA-MARKET + Monthly Statement  

## Test APK commit

_(pinned after push)_

**No release AAB** until Sammy approves.
