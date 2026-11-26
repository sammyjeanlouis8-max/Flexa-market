# Haiti Driver Application (5-step wizard)

Recruitment + application flow for new Flexa Market drivers in Haiti. Extends existing `driver_applications` / admin approval — does **not** create a parallel auth, driver table, or delivery system.

## Screens

1. Welcome — `/delivery/apply` step 0  
2. Personal information — department/commune residence  
3. Transport + delivery work zones (multi-commune)  
4. Documents + terms (existing `/api/upload`)  
5. Submit success + status tracking (`/driver/status`)

## APIs reused / extended

| Endpoint | Role |
|----------|------|
| `GET /api/delivery/application` | Resume / gate (auth user only) |
| `PUT /api/delivery/application/draft` | Save incomplete draft (`status: draft`); no doc gate |
| `POST /api/delivery/apply` | Submit for review (`pending`) after Haiti doc validation; keeps draft if docs missing |
| `POST /api/delivery/application/upload` | Private driver-doc upload (`driver-docs/{userId}/…`) |
| `GET /api/delivery/application/document?key=` | Owner or authorized admin opens a private doc |
| Admin approve/reject/request-changes | Unchanged |

## Documents (Haiti)

| Field | Label | Required |
|-------|-------|----------|
| `photoNationalId` | National ID | Always |
| `facePhotoHoldingId` | Selfie holding ID | Always |
| `photoLicenseFront` | Driver’s license | Cars |
| `photoVehicleRegistration` | Vehicle registration | Moto & car |

Legacy rows that dual-wrote the same URL into selfie slots are kept and flagged `docs_need_review` for admin verification.

## Statuses

`draft` → `pending` (An revizyon) → `approved` | `rejected` | `needs_changes` (+ existing `suspended` for drivers)

Applicants never receive delivery assignment access until admin approval creates/activates a `drivers` row.

## Mobile

`artifacts/mobile/app/driver-apply.tsx` opens the same web wizard (`/delivery/apply`) in a WebView — no parallel native form.

## Branding

Official `/flexa-logo-v2.png`, dark green `hsl(152,65%,18%)`. English default i18n; Creole/French supported via existing locale files (`driverApplyPro.*`).

## No deploy

Additive only; no production data changes from this PR alone.
