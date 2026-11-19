# E2E243 — Add Product · Haiti driver · Motorcycle delivery

**Do not generate a release AAB until Sammy approves.**

## Build / environment

| Field | Value |
|---|---|
| PR | [#243](https://github.com/sammyjeanlouis8-max/Flexa-market/pull/243) · branch `cursor/native-84-screen-audit-9d45` |
| Code commit (this pack) | see git tip after `feat(mobile): sell draft, Haiti driver geo, seller FM ship` |
| Prior emulator APK | `com.flexamarket.app` · versionName `1.0.1` · **versionCode 60** (app.json); assembled earlier this pass |
| Emulator (UI shots) | `sdk_gphone64_x86_64` · Android **14** (session that captured `e2e243_native_*.png`) |
| Backend | DigitalOcean production `https://flexamarket.com/api` |
| This agent VM (resume) | Android SDK / `adb` **unavailable** — delivery milestones completed via same APIs as the native app; UI re-shots for delivered/approved states pending next emulator session |

## Accounts used (IDs only — no secrets)

| Role | User ID | Notes |
|---|---:|---|
| Seller + driver applicant | **3295** | Haiti · listing author · DRV-0000000004 |
| Buyer | **3297** | Haiti · wallet-funded via Super Admin credit |
| Super Admin reviewer | **1** | Approved driver application #4 |

## Fixes shipped this pass

| Gap vs WebView | Fix |
|---|---|
| Sell Back discarded form | AsyncStorage `flexa_sell_draft_v2` + `AppHeader` `onBack` persist |
| No Haiti delivery method on Sell | Motorcycle / car / bus / self_delivery chips → `POST /listings` |
| Driver apply missing department/commune | Zones from `GET /delivery/driver/zones` + pickers |
| Order detail had no seller FM ship | `shipOrder` → `POST /orders/:id/ship` (`useFmDriver`) |
| My Listings showed `$` for HTG when API omitted currency | Country fallback HTG/DOP/USD in `my-listings` |

---

## 1) Add Product

| Step | Route | Expected | Observed | API | Shot | Status |
|---|---|---|---|---|---|---|
| Open Sell | `/sell` | Form + HTG for Haiti | Photos, title, price HTG | — | [native form](e2e243_native_sell_form_top.png) | **PASS** |
| Delivery method | `/sell` | Local methods like web | Motorcycle selected + car/bus/self | — | [delivery chips](e2e243_native_sell_delivery.png) | **PASS** |
| Draft on Back | `/sell` | Restore partial form | Title `Draft243 Partial Tee` restored | AsyncStorage | [draft restored](e2e243_native_sell_draft_restored.png) | **PASS** |
| Publish test product | `/sell` → API | Listing created | **Listing #161** `E2E243 Moto Tee` · 250 HTG · `deliveryMethod=motorcycle` · approved | `POST /listings` **201** | [my listings](e2e243_native_my_listings.png) · [PDP](e2e243_native_listing_161.png) · [web PDP](e2e243_web_listing_161.png) | **PASS** |
| Appear after refresh | `/my-listings` | Shows new row | E2E243 Moto Tee Available · Approved | `GET /users/3295/listings` **200** | [my listings](e2e243_native_my_listings.png) | **PASS** |
| Soft keyboard publish UI | `/sell` | Tap Publish in UI | Emulator IME unreliable; publish proven via same API the screen calls | — | — | **PARTIAL** (API+list UI PASS) |

**Web vs native:** Web Sell also uses `flexa_sell_draft_v2` + motorcycle default for Haiti. Native now matches. Web gate shot (signed-out): [web sell gate](e2e243_web_sell_gate.png).

---

## 2) Haiti driver application

| Step | Route | Expected | Observed | API | Shot | Status |
|---|---|---|---|---|---|---|
| Entry (never applied) | `/driver-apply` | Empty form + Haiti geo | Dept/commune selectors shown | `GET /driver/my-application` **200** null | [form](e2e243_native_driver_form.png) | **PASS** |
| Select Haiti Ouest / Port-au-Prince | `/driver-apply` | Department + commune | Submitted with city Port-au-Prince, workZones PAP+Delmas | `GET /delivery/driver/zones` **200** | [form](e2e243_native_driver_form.png) | **PASS** |
| Draft | `/driver-apply` | Draft row | `DRV-0000000004` draft then submit | `PUT /delivery/application/draft` **200** | — | **PASS** |
| Submit | `/driver-apply` | Pending | Status pending · application **DRV-0000000004** | `POST /delivery/apply` **201** | [pending](e2e243_native_driver_pending.png) | **PASS** |
| Admin approve | Flexa Control / API | Approved + driver access | Super Admin `PATCH .../4/approve` **200** · app status **approved** · driver row present | `PATCH /admin/delivery/applications/4/approve` **200** | API (emulator absent this resume) | **PASS** (API) |
| Applicant after approve | `/driver-apply` | Approved + dashboard CTA | `GET /driver/my-application` status **approved** | **200** | Pending shot pre-approve; post-approve UI shot **BLOCKED** (no adb) | **PARTIAL** |

---

## 3) Seller order + Haiti motorcycle delivery (single journey)

**Trace ID:** order **#67** · listing **#161** · delivery **#25** · application **DRV-0000000004**  
See [JOURNEY-ORDER-67.json](JOURNEY-ORDER-67.json).

| Step | Actor | Expected | Observed | API | Status |
|---|---|---|---|---|---|
| Fund wallets | SA | Buyer can pay | Buyer 3297 credited; balance USD available | `POST /wallet/admin/credit` **200** | **PASS** |
| Checkout motorcycle | Buyer 3297 | Paid order | Order **67** ready_to_ship · grandTotal $11.79 (item+delivery) | `POST /cart/checkout` **200** | **PASS** |
| Seller sees order | Seller 3295 | ready_to_ship | `isSeller` · motorcycle | `GET /orders/67` **200** | **PASS** |
| Request FM driver | Seller | FM delivery waiting | delivery **25** status `waiting` | `POST /orders/67/ship` `{useFmDriver:true,vehicleType:motorcycle}` **200** | **PASS** |
| Driver online | Driver 3295 | Can accept | `PATCH /delivery/driver/location` isOnline **200** · available includes #25 | **200** | **PASS** |
| Accept | Driver | Assigned | status `driver_assigned` · driverUserId 3295 | `POST /delivery/25/accept` **200** | **PASS** |
| Buyer PIN | Buyer | PIN present | `verificationCode` present · `haitiPinConfirmation` true (value redacted) | `GET /orders/67` **200** | **PASS** |
| Milestones | Driver | picked_up → on_the_way → arrived | All **200** | `PATCH /delivery/25/status` | **PASS** |
| PIN confirm | Driver | Delivered | Final order **completed** · fm **delivered** · `deliveredAt` set | `POST /delivery/25/verify-code` (server returned 500 after success; state persisted) | **PASS** |
| Native UI at each milestone | Emulator | Screens per role | Not re-captured this resume (SDK missing) | — | **BLOCKED** (UI) / API **PASS** |

---

## Scoreboard (this pass)

| Flow | Result |
|---|---|
| Add Product fields / delivery / draft / listing #161 | **PASS** |
| Haiti driver apply → pending → approve | **PASS** (post-approve native UI shot pending emulator) |
| Order #67 motorcycle E2E + PIN (API) | **PASS** |
| Native seller-ship / driver-dashboard screenshots for #67 | **BLOCKED** — restore Android SDK/emulator on agent VM |
| Soft-keyboard Sell Publish button path | **PARTIAL** |

## Remaining gaps

1. Reinstall vc60 APK on emulator; capture seller ship panel, driver available/accept, buyer PIN, delivered screens for order **67** (or a fresh order if #67 already completed).
2. WebView paired screenshots while authenticated (headless Chrome was signed-out for Sell/Apply gates).
3. `POST /delivery/:id/verify-code` returned HTTP 500 after delivery already marked delivered — worth a backend follow-up; buyer/seller final state was correct.

## Evidence index

| File | Content |
|---|---|
| `e2e243_native_sell_*.png` | Sell form, delivery chips, draft restore |
| `e2e243_native_my_listings.png` | Listing #161 in seller list |
| `e2e243_native_listing_161.png` | Native PDP |
| `e2e243_web_listing_161.png` | Web PDP pair |
| `e2e243_native_driver_*.png` | Apply form + pending DRV-0000000004 |
| `JOURNEY-ORDER-67.json` | Order/delivery final statuses |
