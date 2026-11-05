# Haiti Driver Delivery Dashboard

Redesign of the authorized Flexa Market driver experience for **domestic Haiti** motorcycle/car deliveries. International carrier workflows are unchanged.

## Screens

| Screen | Route | Notes |
|--------|-------|--------|
| Driver home | `/driver/dashboard` | Availability, today stats (HTG), multi-commune work zone, menu |
| Available deliveries | `/delivery/deliveries` | Existing browse/accept pool; accept opens job detail |
| Delivery details | `/delivery/job/:id` | Route, fee HTG, contact, status advances, PIN confirm |

## Reused systems

- `drivers` / `deliveries` / `driver_applications` tables
- `POST /api/delivery/:id/accept` (atomic claim + PIN generation)
- `PATCH /api/delivery/:id/status` (guarded transitions)
- `POST /api/delivery/:id/verify-code` (Haiti hand-to-hand PIN — never returned to drivers)
- Existing notifications / SMS / push
- Official logo `/flexa-logo-v2.png` and brand green `hsl(152,65%,18%)`

## Work zones

- Source of truth: `artifacts/api-server/src/lib/haitiGeography.ts` (all 10 departments + communes)
- Drivers may select a department and **one or more communes**
- Stored on `drivers.work_zones` (JSON array) + `department` / `commune`
- Matching uses destination pickup city tokens — **not** GPS/IP/account country alone
- Offline (`isOnline=false`) drivers keep active jobs but receive **no new pool offers** and cannot accept

## Earnings

- Display in HTG using `feeLocal` / live exchange rate
- Payout path remains existing USD promo-wallet credit on PIN verify

## Backend changes

- Additive migration: `drivers.work_zones`
- Enhanced `GET /delivery/driver/stats`, `PATCH /delivery/driver/location`, zones payload
- `GET /delivery/:id/driver-view` (assigned driver only; **no PIN**)
- Available/browse filters respect multi-commune zones + online gate

## No deploy

This change set does not deploy or modify production data by itself.
