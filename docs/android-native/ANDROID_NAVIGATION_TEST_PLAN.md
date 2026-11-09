# ANDROID_NAVIGATION_TEST_PLAN.md

**Status:** Planned — **NOT EXECUTED** (no Phase 2 build yet)  
**Devices:** Emulator API 24, 29, 33, 35/36 + ≥1 physical device  
**Nav modes:** 3-button + gesture navigation  

---

## A. Global Back / Predictive Back

| ID | Case | Expected | Status |
|---|---|---|---|
| NAV-01 | Root Home + Back | App backgrounds; no exit toast loop | NOT RUN |
| NAV-02 | Stack depth 3 + Back ×3 | Returns to tab root | NOT RUN |
| NAV-03 | Modal sheet + Back | Dismisses modal only | NOT RUN |
| NAV-04 | Gesture Back mid-flow form | Confirm discard if dirty draft | NOT RUN |
| NAV-05 | Predictive Back animation | Enabled; no crash | NOT RUN |
| NAV-06 | Video fullscreen + Back | Exit fullscreen first | NOT RUN |
| NAV-07 | Music player full + Back | Collapse to mini player | NOT RUN |

## B. Tabs & system bars

| ID | Case | Expected | Status |
|---|---|---|---|
| NAV-10 | Bottom tabs visible | 5 tabs; not covered by nav bar | NOT RUN |
| NAV-11 | Edge-to-edge Home | Content inset; no clipped CTA | NOT RUN |
| NAV-12 | Keyboard on Search | Field visible; tabs may hide | NOT RUN |
| NAV-13 | Landscape video | Unlock; restore portrait on exit | NOT RUN |
| NAV-14 | Font scale large | Layout usable; no overlap | NOT RUN |

## C. Deep links & push

| ID | Case | Expected | Status |
|---|---|---|---|
| NAV-20 | `flexamarket://orders/ID` | Native order detail | NOT RUN |
| NAV-21 | HTTPS app link listing | Native detail after assetlinks | NOT RUN |
| NAV-22 | Push cold start | Opens target native route once | NOT RUN |
| NAV-23 | Push warm start | Navigates without duplicate stack junk | NOT RUN |

## D. Permission-gated navigation

| ID | Case | Expected | Status |
|---|---|---|---|
| NAV-30 | Sell → camera deny | Picker still works | NOT RUN |
| NAV-31 | Chat → mic deny | Text send works; record disabled w/ copy | NOT RUN |
| NAV-32 | Support chat voice attempt | Blocked / unsupported | NOT RUN |
| NAV-33 | Location deny | Manual country still works | NOT RUN |

## E. Offline / recovery

| ID | Case | Expected | Status |
|---|---|---|---|
| NAV-40 | Airplane on Home | Banner; cached content if any | NOT RUN |
| NAV-41 | Fail mid-upload | Progress error + retry; draft kept | NOT RUN |
| NAV-42 | Token expired mid-stack | Re-auth then return | NOT RUN |

## Execution rule
Mark **PASS/FAIL** only after a real run with build ID, device, and timestamp recorded in `ANDROID_TEST_RESULTS.md`.
