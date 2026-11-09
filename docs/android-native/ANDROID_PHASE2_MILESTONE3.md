# Phase 2 — Milestone 3 Report

**Branch:** `cursor/native-android-migration-audit-b867`  
**PR:** #171  
**Updated:** 2026-11-09 (America/New_York)  
**Package:** `com.flexamarket.app` (config only; not published)  
**App name:** Flexa Market  

---

## 1. Completed functionality

### Sell Product (native)
- Seller auth gate on Sell tab
- Country eligibility gate (profile country required)
- Create listing form: title, description, price, currency, condition, category/subcategory, location/city, inventory, shipping/delivery (Haiti / DR / international rules)
- Image attach via Android Photo Picker + camera
- Client validation mirroring server basics
- Submit via `POST /api/listings` with idempotency key
- Edit via `PUT /api/listings/:id` (`/sell/edit/[id]`)
- My Listings via `GET /api/users/:id/listings`
- AsyncStorage draft (`flexa_sell_draft_native_v1`, 7-day TTL)
- Moderation outcome messaging (approved / pending / rejected)

### Android Photo Picker
- `expo-image-picker` `launchImageLibraryAsync` (system picker; no media-library permission request)
- Multi-select up to 5 images; single/camera capture
- Previews, remove, compression (`expo-image-manipulator` JPEG ≤2048px)
- Upload progress + retry
- Wasabi flow: `POST /storage/uploads/request-url` → `PUT put-proxy` → fallback `image-fallback`
- `READ_MEDIA_*` remain blocked in `app.json`

### Preserved
- Website, DigitalOcean, Postgres, Wasabi, iOS, accounts, orders, payments untouched
- Digital goods / boost purchase still disabled pending Play Billing
- No WebView primary UI

---

## 2. Files created / modified (high level)

**Created:** `components/SellForm.tsx`, `hooks/usePhotoPicker.ts`, `lib/imageUpload.ts`, `lib/sellDraft.ts`, `lib/sellValidation.ts`, `lib/cities.ts`, `app/sell/edit/[id].tsx`, `tests/sellValidation.test.ts`, this doc.

**Modified:** `(tabs)/sell.tsx`, `my-listings.tsx`, `_layout.tsx`, `nativePolicy.test.js`, `package.json` (+ `expo-image-manipulator`), progress/test docs, lockfile.

---

## 3. APIs integrated

| API | Use |
|---|---|
| `GET /categories` | Category / subcategory pickers |
| `POST /storage/uploads/request-url` | Wasabi upload session |
| `PUT /storage/uploads/put-proxy/:token` | Binary upload |
| `POST /storage/uploads/image-fallback` | ≤10MB multipart fallback |
| `POST /listings` | Create (+ Idempotency-Key) |
| `PUT /listings/:id` | Edit |
| `GET /listings/:id` | Prefill edit |
| `GET /users/:id/listings` | My listings |

---

## 4. Automated test results (executed)

| Suite | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `listingsQuery` + `sellValidation` unit tests | **PASS** (10/10) |
| `nativePolicy.test.js` (blocked perms + Photo Picker / no WebView sell) | **PASS** (3/3) |
| Live API: categories 200; listings/upload without auth **401**; fake token **401** | **PASS** |
| Authenticated create/upload end-to-end | **NOT RUN** (no test seller credentials in agent) |
| Android emulator UI | **NOT RUN** (emulator not available in this environment) |
| Device UI | **NOT RUN** (owner has no Android device; not required this milestone) |
| Release AAB / Play publish | **NOT RUN** (forbidden) |

---

## 5. Remaining blockers

- Authenticated sell E2E on emulator when available
- Firebase/`google-services.json` for `com.flexamarket.app`
- Phone-verified change-country; Register; Chat; Cart/Checkout; Orders; Wallet; KYC; Boost; Music; Notifications; Admin
- Listing video attach (paid plans) deferred
- Device proof before any Play closed testing

---

## 6. Google Play compliance risks

| Risk | Notes |
|---|---|
| Feature parity still incomplete | Do not submit yet |
| Media permissions | Still blocked; picker-only path implemented |
| Digital payments | Remain disabled |
| New package ≠ approval | Native remediation ongoing |
| Emulator/device evidence missing | Required before closed testing request |

**Submission stance:** **NO-GO** for Play / AAB.

---

## 7. Recommended next milestone (await approval)

**Milestone 4 — Cart, Checkout (physical goods), and Orders**  
Keep digital goods blocked; Stripe/MonCash for physical only; still no AAB/publish.
