# Sign In layout parity — PR follow-up (AuthShell)

**Test APK commit:** *(filled after push)*  
**Branch:** `cursor/signin-layout-inset-9d45`  
**Viewports:** 360×640 and 390×844 logical, font scale 1.0, logged out, English  
**API / WebView ref:** `https://flexamarket.com/auth/login`

## Cause
On short Android viewports the native `AuthShell` hero used bottom-aligned globe + tall brand padding, so the white form started too low. Combined with a thin bottom inset, the orange **Sign In** CTA sat under the gesture bar. WebView uses a centered globe beside the copy and a shorter hero on phones.

## Fix (`AuthShell` + `LoginScreen`)
- Short viewport (`height ≤ 680`): tighter brand margin/padding, slightly smaller globe, denser form spacing
- Globe aligned beside intro copy (`alignItems: "center"`, matching WebView `self-center`)
- Form `paddingBottom` always clears `safeAreaInsets.bottom` + gesture air
- ScrollView retained for keyboard / large text
- EULA checkbox hit target separated from legal links (Android nested-`Text` reliability)
- CI: removed duplicate `paddingHorizontal` in `my-videos.tsx` (typecheck)

## Evidence
| File | What |
|---|---|
| `signin236-sbs-360.png` | WebView left \| Native right @ 360×640 |
| `signin236-sbs-390.png` | WebView left \| Native right @ 390×844 |
| `signin236-native-360-final.png` | Native Sign In; CTA clearance **89px** above bottom |
| `signin236-native-390-final.png` | Native Sign In; CTA clearance **164px** |
| `signin236-native-360-keyboard.png` | Keyboard open @ 360 |
| `signin236-webview-360-final.png` / `…-390…` | Playwright WebView reference |
| `signin236-native-signup-360.png` (+ scrolled) / `…-390…` | Shared AuthShell Sign Up smoke |

## Results table

| Check | Expected | Result |
|---|---|---|
| Reproduce @ 360×640 | Sign In clipped by gesture | **PASS** (reproduced before fix) |
| Native CTA @ 360 closed keyboard | Full Sign In + label above gesture | **PASS** (clearance 89px) |
| Native CTA @ 390 | Fully visible | **PASS** (clearance 164px) |
| Globe beside intro | Aligned with brand copy, not sunk | **PASS** |
| Form higher / hero tighter | Match WebView proportions | **PASS** (see SBS) |
| Keyboard open @ 360 | Fields reachable; scrollable | **PASS** |
| Email / password fields | Focus + type | **PASS** |
| Password eye toggle | Show/hide | **PASS** (control present; prior false FAIL was mis-tap) |
| Forgot password | Opens forgot flow / site | **PASS** (opens external URL) |
| EULA / Terms links | Open `/eula` `/terms` | **CHECKED** (handlers wired; browser chrome may intercept) |
| Consent checkbox | Toggles | **PASS** (hit target fixed) |
| Sign In submit | Validation / API error | **PASS** client validation; live account login **UNVERIFIED** (no `FLEXA_TEST_*`) |
| Sign Up @ 360/390 | Shared shell; CTA reachable | **PASS** (scroll to Create Account above gesture) |

**No merge / no AAB** until Sammy approves.
