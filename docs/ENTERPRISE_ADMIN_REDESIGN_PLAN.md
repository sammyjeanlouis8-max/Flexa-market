# Flexa Market — Enterprise Admin Redesign Plan

**Branch:** `cursor/enterprise-admin-console-9bdb`  
**Constraint:** No merge to `main` / no production deploy without explicit approval.  
**Live DO app / DB / auth / APIs preserved.**

## Audit summary (existing vs missing)

| Area | Exists today | Missing |
|------|----------------|---------|
| Admin routes | `/admin` + ~22 nested hubs | Persistent sidebar shell |
| Ops KPIs | Dense grid + site visits (#48) | Charts, YoY/WoW comparisons, ranges |
| Site visits | Unique/day Today/Month/Year/All | Yesterday, week, series, country/device |
| Listing views | Super-admin Vues tab | Wired into overview charts |
| RBAC | Role rank + partial `can()` | Matrix enforcement (#37 open — land later) |
| Charts | `recharts` + `chart.tsx` | Dashboard usage |
| Sidebar UI | `ui/sidebar.tsx` unused | Wire to all `/admin*` |

## Page-by-page stages

### Stage A (this PR) — Shell + Analytics overview
1. `AdminShell` — collapsible sidebar, top header, mobile sheet nav, light/dark via existing theme
2. Wrap all `/admin*` routes
3. Dashboard: real visit KPIs + Recharts time series from DB aggregates
4. Extend `GET /admin/stats` + `GET /admin/analytics/traffic` with real rollups only
5. English default strings; ht/fr/es/pt keys

### Stage B — Extract tabs → routes (incremental)
Support → Users/Moderation → Orders/Deliveries → Finance → Media

### Stage C — Merge/adapt PR #37 RBAC Phase 1
Backend `requirePermission` before exposing new role UI

### Stage D — Advanced traffic (country/device/sources)
Additive telemetry on visit ping; never fabricate

### Stage E — Role matrix UI + audit hardening
Super Admin permission editor after C

### Stage F — Button/link audit per page
Fix broken actions only after shell stable

## Non-goals this PR
- New DigitalOcean app/database
- Merge to main / production deploy
- Fabricated analytics
- Rewriting payment/refund/wallet semantics
