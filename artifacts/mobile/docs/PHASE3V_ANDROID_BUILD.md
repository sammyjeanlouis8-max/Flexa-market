# Phase 3V — Android build + final verification (evidence)

**Branch:** `cursor/native-phase3v-android-build-09ff`  
**Base:** Phase 3U / PR #199  
**Agent run:** `bc-01a1c1f1-36e2-771f-9409-dafe93d909ff`  
**Cursor environment:** [70ee1718-d7ea-11f1-ba91-f63b1661ac50](https://cursor.com/dashboard/cloud-agents/environments/e/70ee1718-d7ea-11f1-ba91-f63b1661ac50) (Personal)

## 1) EXPO_TOKEN verification (no value disclosed)

| Check | Result |
|-------|--------|
| `EXPO_TOKEN` present in process env | **false** (length 0) |
| `EAS_TOKEN` present | **false** |
| `npx eas-cli whoami` | **Not logged in** |
| Build started | **No** |

**Required owner action:** Save secret `EXPO_TOKEN` on environment `70ee1718-d7ea-11f1-ba91-f63b1661ac50`, then start a **fresh agent session** on this branch so the secret is injected. Do not paste the token in chat.

## 2) Config verified (no auth required)

| Item | Evidence |
|------|----------|
| Android package | `com.flexa.market` |
| versionName / versionCode | `1.0.1` / `39` |
| Expo owner / slug | `muelsa89` / `mobile` |
| EAS projectId | `45ba4fe9-5e46-42cc-aea4-7a15d9b45f7e` |
| `eas.json` preview | `android.buildType: apk` |
| Firebase `google-services.json` package | `com.flexa.market` (**match**) |
| Signing credentials | **Not verified** — requires EAS login |

## 3) EAS build attempt (evidence)

Command:

```bash
npx eas-cli build --platform android --profile preview --non-interactive
```

Stdout (tail):

```
An Expo user account is required to proceed.
Either log in with eas login or set the EXPO_TOKEN environment variable…
Error: build command failed.
```

| Field | Value |
|-------|--------|
| Build ID | **none** |
| Status | **not started** |
| APK download URL | **none** |
| Logs | `/tmp/eas-build-3v.txt` on agent VM (auth failure only) |

**Success not claimed.**

## 4) Google Play enforcement warning

`com.flexa.market` was previously **suspended** on Google Play.  
A preview APK is for **internal sideload testing only**. Do **not** submit to Play / assume republish is possible until Play Console enforcement is resolved by the account owner.

## 5) listing_variants SQL audit (not applied)

File: `artifacts/api-server/sql/2026-11-10_listing_variants.sql`

| Concern | Assessment |
|---------|------------|
| Additive? | **Yes** — `CREATE TABLE IF NOT EXISTS` only |
| Mutates listings/transactions? | **No** |
| Existing product data | Unaffected; variants start empty |
| FK | `listing_id → listings(id) ON DELETE CASCADE` |
| Indexes | listing_id btree + partial unique `(listing_id, sku) WHERE sku IS NOT NULL` |
| Drizzle parity | Schema unique index updated to match partial SQL |
| Rollback | `DROP TABLE IF EXISTS listing_variants;` (safe if empty / unused) |
| Backup before apply | Take DigitalOcean managed Postgres backup / snapshot **before** any apply |
| Production apply | **Forbidden without explicit approval** |

API behavior without table: `GET` returns `schemaReady:false`; `PUT`/checkout with `variantId` → `503 VARIANTS_SCHEMA_PENDING`.

## 6) Physical test coverage

Full 84-screen matrix: `PHASE3V_PHYSICAL_TEST_MATRIX.md`  
Status: **not executed** (no APK).

## 7) Remaining blockers + remediation

| Blocker | Exact remediation |
|---------|-------------------|
| `EXPO_TOKEN` not in agent VM | Bind secret to env `70ee1718-…` → **new agent session** → re-run `eas whoami` + preview build |
| Android signing unknown until EAS auth | After login, let EAS manage credentials or confirm existing keystore for `com.flexa.market` |
| Play suspension | Resolve Play Console enforcement before any store submit |
| `listing_variants` not in prod DB | Owner approval → backup → apply SQL → smoke variants API |
| FCM physical unverified | Install preview APK → permission → push receipt evidence |
| Digital goods (top-up/sub/boost/music) | Play Billing / policy path — not fakeable |
| eSIM | Provider contract + APIs |

## 8) Inventory (unchanged counts this phase)

77 FULLY / 2 PARTIAL / 0 PLACEHOLDER / 0 MISSING / 5 BLOCKED of **84**  
(See inventory JSON; Phase 3V is build/verification focused.)
