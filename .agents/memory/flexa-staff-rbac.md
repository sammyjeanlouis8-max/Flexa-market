---
name: Flexa staff RBAC
description: Durable authorization and geographic-scope rules for moderator, admin, and superadmin access.
---

Treat the canonical staff role as the source of truth. A legacy `isAdmin` flag must never promote a moderator or support user into admin, finance, or superadmin capabilities. Finance operations use the finance-admin guard; rates, subscription/VIP mutations, and other top-level configuration use the superadmin guard.

**Why:** Legacy moderator records may still carry `isAdmin=true`, so raw boolean checks silently restore broad privileges even when the UI hides those tools.

**How to apply:** Use canonical role helpers on every backend route, including mixed owner/staff routes. Suspension-aware checks are required for staff branches. Geographic authorization must enforce multi-country/country plus city/department and fail closed when a department has no configured city mapping or target geography is missing.