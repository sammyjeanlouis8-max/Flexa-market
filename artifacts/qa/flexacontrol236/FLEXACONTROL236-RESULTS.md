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

Staff Super Admin / Admin / Support dashboard screenshots and write proofs remain **BLOCKED** until `FLEXA_TEST_{SUPERADMIN,ADMIN,SUPPORT}_*` secrets are available in the environment.

## Test APK commit

*(filled after push)*
