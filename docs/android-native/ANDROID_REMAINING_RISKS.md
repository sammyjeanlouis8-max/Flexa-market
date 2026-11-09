# Remaining Compliance Risks & Technical Blockers

**Updated:** 2026-11-09 12:30 (America/New_York)  
**Submission stance:** **NO-GO** for Google Play until items below are cleared or explicitly accepted.

Related: `ANDROID_SUSPENSION_AND_CORRECTIVE_ACTIONS.md`, `ANDROID_PHASE2_MILESTONE5.md`

---

## Compliance risks

| Risk | Severity | Mitigation path |
|---|---|---|
| Incomplete native feature parity (remaining account/wallet/boosts UX) | **Medium** | M2–M5 core commerce + chat/push landed; continue only with approval |
| Reviewer may still find residual WebView if reintroduced | **High** | Keep `LegacyWebViewShell` / `SafeWebView` out of routed entry paths |
| New package alone does not equal approval | **High** | Documented; Console must show genuine native remediation |
| Digital goods without Play Billing | **Medium** | Keep `androidDigitalPurchaseGuard`; block native initiation UX |
| Photo / video permission declarations | **Medium** | Keep READ_MEDIA_* blocked; use Android Photo Picker for sell wave |
| Data safety / listing accuracy for new package | **Medium** | Operator must complete Console forms for `com.flexamarket.app` |

---

## Technical blockers

| Blocker | Severity | Notes |
|---|---|---|
| Firebase / FCM for `com.flexamarket.app` | **High** | Console registration + matching `google-services.json` still required; see `google-services.README.md` |
| Emulator / device proof not run | **High** | Cold-start native Home + push cold/warm must be demonstrated before submit |
| Push notification device delivery | **High** | Client lifecycle coded; physical FCM blocked until Firebase JSON cutover |
| Release signing / EAS credentials for new package | **Medium** | Configure only when Sammy authorizes a build |
| Remaining placeholder screens (wallet, settings shell, etc.) | **Medium** | Core chat/notifications native; placeholders intentional for later milestones |
| Merge to main / production deploy | **Gate** | Forbidden without explicit approval |
| Release AAB / Play upload | **Gate** | Forbidden without explicit approval |

---

## What already addresses the prior suspension

1. App entry is no longer a full-screen website WebView.
2. Home, Search, Categories, Product Details, and Login are React Native screens calling `/api`.
3. Guest country uses canonical names (`Haiti`) matching server gates.
4. App name remains Flexa Market; iOS bundle unchanged.
5. Backend, Postgres, DigitalOcean, Wasabi, and accounts preserved.
6. Suspension + corrective actions documented under `docs/android-native/`.

---

## Required before any Google Play submission

See checklist in `ANDROID_SUSPENSION_AND_CORRECTIVE_ACTIONS.md` §7. All boxes must be verified; Sammy must explicitly approve AAB generation and publish.
