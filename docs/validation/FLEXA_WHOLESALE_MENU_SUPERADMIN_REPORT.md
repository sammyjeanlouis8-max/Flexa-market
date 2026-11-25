# Flexa Wholesale — Super Admin main-menu visibility

**Branch:** `cursor/flexa-wholesale-menu-superadmin-7b6e`  
**WHOLESALE_PUBLIC_LAUNCH:** `false` (marketplace, mobile, API)

## Changes

- Desktop sidebar (`Layout.tsx`): dedicated **Flexa Wholesale** section immediately under Home & Discover for Super Admins only; link `/wholesale`.
- Mobile/web drawer (`PremiumSideMenu.tsx`): same immediate section; `drawer-flexa-wholesale`.
- Native app drawer: dedicated FLEXA WHOLESALE section (Super Admin only).
- Frontend gate: `canAccessWholesale` requires an authenticated Super Admin (`isSuperAdmin` or `role === "superadmin"`). Regular users, sellers, moderators, and non–Super Admin admins are excluded.
- Backend: `requireWholesaleAccess` uses `isWholesaleSuperAdmin` (same rule). Unauthenticated → 401; non–Super Admin → 403.
- `/wholesale` home wrapped in `WholesalePageGate`.

## Validation

| Check | Result |
| --- | --- |
| Vitest `wholesaleMenuSuperAdmin` + `wholesaleLaunch` | Pass |
| `wholesaleAccess.test.ts` role matrix | Pass |
| API production build | Pass |
| Live `GET /api/wholesale/launch` | `publicLaunch: false` |
| Live `GET /api/wholesale/products` (no auth) | `401 Unauthorized` |
