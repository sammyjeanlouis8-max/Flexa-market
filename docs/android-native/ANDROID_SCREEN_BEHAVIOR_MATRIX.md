# ANDROID_SCREEN_BEHAVIOR_MATRIX.md

**Legend — Native status today:** WV = WebView wrapper · N = partial native · WEB = website-only · **Target** = required native behavior  

**Back:** S = pop stack · T = stay on tab / background app at root · M = modal dismiss  

| Screen | Today | Target native behavior | Back | Permissions | Offline | Notes |
|---|---|---|---|---|---|---|
| Splash / startup | Expo splash | Brand splash → session hydrate → Home | — | none | cached session | No GPS/notif prompt |
| Guest Home | WV | Native listing feed + country chip | T | none | cache last page | Smart Location |
| Country selection | WV/web | Native picker; manual sticky | S | none | local persist | Never overwrite manual |
| Language selection | WV | Native language list → i18n | S | none | local | |
| Login | WV | Native form → JWT SecureStore | S | none | error | |
| Registration | WV | Native multi-step | S | none | draft fields | |
| Password recovery | WV | Native email/OTP flow | S | none | | |
| Marketplace home | WV | Feed, cats, boosts cards | T | none | skeleton+cache | |
| Search | WV | Native search + filters | T/S | none | | |
| Categories | WV | Native category browse | S | none | | |
| Product details | WV | Gallery, buy, chat, share | S | none | | |
| Shopping cart | WV | Line items, totals | S | none | persist cart | |
| Checkout (physical) | WV/Stripe WV | Native summary + Custom Tabs Stripe/MonCash | S/M | none | block submit | Not digital Billing |
| Flexa Card pay (physical path) | WV | Native; server rules | S | none | | Digital top-up gated |
| Orders list | WV | Native list | S | none | | |
| Order detail / tracking | WV / N track | Native detail + map/timeline | S | loc optional | poll | Extend delivery-tracking |
| Delivery confirmation | WV | Native confirm UI | S | none | | |
| Seller Center hub | WV | Native seller home | S | none | | |
| Product create/edit | WV | Native form + Photo Picker/camera | S | camera optional | **draft persist** | |
| Product media uploads | WV | Progress %, retry, compress | — | picker/camera | queue | Wasabi existing |
| Promotional Videos Discover | WV | Native grid/feed | T/S | none | | SA country scope |
| Promo watch (vertical) | WV | Native vertical player | S | none | | Engagement APIs |
| Video Boost create | WV | Native wizard | S | camera/mic if record | draft | ≤120s; Billing/block |
| Campaign targeting | WV | Native audience UI | S | none | | Preserve geo rules |
| Video drafts | WV | Local+server drafts | S | none | | |
| Video analytics | WV | Native charts/list | S | none | | |
| Flexa TV | WV | Native player + catalog | S | none | | |
| Flexa Music home | WV | Native lists + mini player | T/S | none | | No mic |
| Music upload | WV | Picker + metadata | S | picker | | |
| Background audio | Media Session web | Native media notification/FGS | — | FGS media later | | Audio focus |
| Persistent mini player | web | Native overlay above tabs | — | none | | |
| Messaging inbox | WV | Native threads | T | notif opt-in | | |
| Chat thread | WV | Text/image/video/voice | S | mic on record | queue send | |
| Voice message UX | web | Record indicator, preview, send, play | — | RECORD_AUDIO | | Not in support |
| Customer support | WV | Text/image only | S | none | | Server bans voice |
| Notifications | WV | Native list + FCM | S | POST_NOTIFICATIONS | | |
| User profile | WV | Native profile | T/S | none | | |
| Account settings | WV | Native settings hub | S | none | | |
| Account deletion | WV | Native confirm → API anonymize | S | none | | Play requirement |
| Admin Dashboard | WV | DEFER web or limited native | S | none | | Server RBAC |
| Super Admin Control Center | WV | DEFER / limited native | S | none | | Country scope |

---

## Media playback specifics

| Capability | Required native behavior |
|---|---|
| Vertical promo video | Full-bleed, correct ratio, mute toggle, load/error states |
| Horizontal / TV | Letterbox only when source requires; fullscreen |
| Music BG | Continues screen-off when FGS+session configured |
| Lock screen / headset | Play pause skip via MediaStyle / MediaSession |
| Interruptions | Pause on call; resume policy documented |
| Bluetooth | Standard media routing |

## Payment classification (per screen)

| Flow | Play Billing required? | Android approach |
|---|---|---|
| Physical product checkout | No (physical goods) | Stripe/MonCash hosted allowed |
| Vendor subscription | Yes if sold as digital in Play app | Billing or keep blocked |
| Listing/video boost | Digital advertising feature | Billing or keep blocked |
| Music purchase / artist plan | Digital | Billing or keep blocked (commerce may already be off) |
| Wallet top-up funding digital spend | Treated as digital-related today | Keep guard until Billing design |

Sources: https://support.google.com/googleplay/android-developer/answer/9858738  

---

## Empty / error / loading (all consumer screens)

- Loading: skeleton or spinner centered above bottom nav.  
- Empty: one sentence + primary CTA.  
- Error: retry button; auth errors → login.  
- Network recovery: auto-refetch on reconnect for GET; POST confirm before replay.
