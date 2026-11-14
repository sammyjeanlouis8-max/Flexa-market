# Flexa Control — eight secure inputs

Staff Super Admin / Admin / Support emulator E2E is **BLOCKED** until these values exist in Cursor Secrets for this environment. Do not paste them into chat, git, screenshots, or logs.

## Why eight (not six)

Three staff roles need email + password (**6**). The other **2** are the **regular buyer** account used to prove Access denied and as the baseline signed-in user for drawer/menu checks.

| # | Secret name | Role | Used for |
|---:|---|---|---|
| 1 | `FLEXA_TEST_SUPERADMIN_EMAIL` | Super Admin | Drawer → Flexa Control → All Countries; platform modules; out-of-scope control |
| 2 | `FLEXA_TEST_SUPERADMIN_PASSWORD` | Super Admin | Sign-in |
| 3 | `FLEXA_TEST_ADMIN_EMAIL` | Country-scoped Admin | Control within assigned countries only |
| 4 | `FLEXA_TEST_ADMIN_PASSWORD` | Country-scoped Admin | Sign-in |
| 5 | `FLEXA_TEST_SUPPORT_EMAIL` | Support | Authorized support modules only |
| 6 | `FLEXA_TEST_SUPPORT_PASSWORD` | Support | Sign-in |
| 7 | `FLEXA_TEST_BUYER_EMAIL` | Regular user | Access denied + non-staff regression |
| 8 | `FLEXA_TEST_BUYER_PASSWORD` | Regular user | Sign-in |

Seller / driver secrets (`FLEXA_TEST_SELLER_*`, `FLEXA_TEST_DRIVER_*`) are **not** part of these eight; they are for Add Product / delivery flows in the 84-screen audit.

## Setup

1. Cursor → Environment / Secrets (or cursor.com dashboard Secrets).
2. Add the eight names above (personal or team).
3. Reply on this thread or re-run the agent so staff sign-in can proceed.

## Current status (no values in environment)

| Role / check | Result |
|---|---|
| Logged out → `/admin` | **PASS** — Sign in required |
| Regular user → `/admin` | **PASS** — Access denied (`support access required`) |
| Super Admin dashboard + writes | **BLOCKED** — secrets missing |
| Country-scoped Admin | **BLOCKED** — secrets missing |
| Support modules + writes | **BLOCKED** — secrets missing |

Authoritative gate: `GET /admin/me` (`requireRole("support")`) against `https://flexamarket.com/api`.
