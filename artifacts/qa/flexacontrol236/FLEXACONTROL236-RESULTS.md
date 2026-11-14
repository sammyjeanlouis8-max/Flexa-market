# Flexa Control native access — results

**Branch:** `cursor/flexa-control-native-access-9d45`  
**Package:** `com.flexamarket.app` · versionCode **56** · versionName **1.0.1**  
**API:** `https://flexamarket.com/api` (DigitalOcean)

## Exact cause of “Access denied”

Native `/admin` gated on **client-side** `AuthContext.user` flags/roles **before** calling `GET /admin/me`:

- Exact string matches only (`role === "superadmin"`), no normalization (`Super Admin` / `super_admin` failed).
- Login stored **token only** and discarded `result.data.user`, so cold start / slow `/auth/me` left `user` empty while `token` was set → denial instead of loading.
- Drawer listed Admin for any `role !== "user"` (agent/driver), then hit the same denial copy.

**Authoritative condition now:** first protected request is `GET /admin/me` (`requireRole("support")`).  
Verified with a regular account: API returns **403** `{ "error": "support access required" }` and native shows **Access denied** with that message after a loading phase.

## Emulator evidence (versionCode 56)

| Shot | Result |
|---|---|
| `signin-required-logged-out.png` | Logged out → Flexa Control → **Sign in required** (not premature Access denied) |
| `buyer-home-signed-in.png` | Regular user session restored |
| `buyer-access-denied.png` | Regular user → `/admin` → **Access denied** / `support access required` |

## Module / role matrix

| Module | Super Admin | Country Admin | Support | Regular |
|---|---|---|---|---|
| Command Center dashboard | **BLOCKED** (no staff secrets) | **BLOCKED** | **BLOCKED** | **PASS** denied |
| Orders / Payments / Analytics / More | Implemented + API-wired | Implemented + scope query | Perm-gated | **PASS** denied |
| Users / Listings / Moderation / Boosts | Wired | Wired (`country=` when scoped) | Hidden / API 403 | denied |
| Promo videos (`/admin/boosts` approve/reject) | Wired | Wired | Hidden | denied |
| Push / Team / Security / Deliveries / etc. | Routes + best-effort API | Perm-gated | Limited | denied |

Staff Super Admin / Admin / Support dashboard screenshots and write proofs remain **BLOCKED** until secrets are filled (see `STAFF-SECRETS.md`).

### Eight secure inputs (why not six)

| # | Name | Why |
|---:|---|---|
| 1–2 | `FLEXA_TEST_SUPERADMIN_EMAIL` / `_PASSWORD` | Super Admin Control + All Countries |
| 3–4 | `FLEXA_TEST_ADMIN_EMAIL` / `_PASSWORD` | Country-scoped Admin |
| 5–6 | `FLEXA_TEST_SUPPORT_EMAIL` / `_PASSWORD` | Support modules |
| 7–8 | `FLEXA_TEST_BUYER_EMAIL` / `_PASSWORD` | Regular-user Access denied baseline |

No staff session exists in this environment today. Reused only ephemeral regular buyers for denial proofs. Add the eight values in the Cursor secure form; do not paste into chat.

## Role results (latest)

| Role / check | Status | Evidence |
|---|---|---|
| Logged out → `/admin` | **PASS** | `signin-required-logged-out.png` / `gate-after-deeplink.png` |
| Regular user → `/admin` | **PASS** | `buyer-access-denied.png` · also `artifacts/qa/audit84/audit84-admin.png` |
| Super Admin → drawer Flexa Control → modules + write | **BLOCKED** | secrets missing |
| Country Admin → scoped country + out-of-scope deny | **BLOCKED** | secrets missing |
| Support → authorized modules + write | **BLOCKED** | secrets missing |

## Test APK commits

- Flexa Control gate PR (#241): `dca7b9ac11964b4594e7356c4e41e07f425d5717` · versionCode **56**
- Audit stack retest (#243): `5f23848dc3a2e9380c92d77c5e61496d0da2fecf` · versionCode **58** · package `com.flexamarket.app`

**No release build** until staff E2E is unblocked and Sammy approves.
