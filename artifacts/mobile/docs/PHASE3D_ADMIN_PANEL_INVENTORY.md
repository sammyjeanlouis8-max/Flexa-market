# Admin Panel — Native Migration Inventory (Phase 3D audit)

**Date:** 2026-11-09 (America/New_York)  
**Scope:** Inspect only — **do not implement Admin native UI in Phase 3D** unless separately authorized.  
**Source of truth:** website admin routes + `artifacts/api-server/src/routes` (`admin*.ts`, `support.ts` admin sections).

## Status legend

| Status | Meaning |
|---|---|
| MISSING | Exists on web/API; no native Android screen |
| BLOCKED | Requires privileged roles / policy / later phase |
| DEFERRED | Intentionally later (e.g. after seller tools harden) |

## Inventory (high level)

| Area | Web / API | Native | Status | Notes |
|---|---|---|---|---|
| Admin home / ops dashboard | `/admin` | `/admin` placeholder | MISSING | Keep web-first |
| User management | `/admin/users*` | — | MISSING | Superadmin/admin |
| Listing moderation | `/admin/listings*` | — | MISSING | Appeals, approve/reject |
| Orders / finance admin | `/admin/orders`, Stripe ledger | — | MISSING / BLOCKED | Sensitive money ops |
| Support agent desk | `/admin/support*` | Partial via customer `/support` | MISSING | Agent tools stay web |
| Admin internal chat | `/api/admin/chat/*` | — | MISSING | Staff-only |
| Promo / videos | admin promo tools | — | MISSING | |
| Fraud / KYC review | admin KYC routes | — | MISSING | |
| Recharge cards / wallet admin | admin wallet routes | — | BLOCKED | Digital goods policy |
| Platform settings | admin settings | — | MISSING | |
| Driver / delivery admin | admin delivery | — | DEFERRED | |

## Recommendation

- Keep Admin on website for Phase 3D–3E.
- Native priority remains buyer + seller + support customer surfaces.
- When Admin migrates, reuse auth role gates (`isAdmin` / `isSuperAdmin` / `support`) already on JWT — never weaken server checks.

## Explicit non-goals this wave

- No WebView admin shell
- No fake admin stats
- No merge/deploy of privileged tools without authorization
