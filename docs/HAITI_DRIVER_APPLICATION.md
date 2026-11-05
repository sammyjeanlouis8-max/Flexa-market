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
| `GET /api/delivery/application` | Resume / gate |
| `PUT /api/delivery/application/draft` | **New** — save/resume draft (`status: draft`) |
| `POST /api/delivery/apply` | Submit for review (`pending`); updates draft/needs_changes/rejected in place |
| Admin approve/reject/request-changes | Unchanged |
| `POST /api/upload` | Private document storage |

## Statuses

`draft` → `pending` → `approved` | `rejected` | `needs_changes` (+ existing `suspended` for drivers)

Applicants never receive delivery assignment access until admin approval creates/activates a `drivers` row.

## Branding

Official `/flexa-logo-v2.png`, dark green `hsl(152,65%,18%)`. English default i18n; Creole/French supported via existing locale files (`driverApplyPro.*`).

## No deploy

Additive only; no production data changes from this PR alone.
