# ANDROID_UX_BEHAVIOR_AUDIT.md

**Status:** Phase 1 extension — behavior contracts for genuine native Android  
**Implementation:** NOT STARTED  

Global UX rules apply to **every** screen unless overridden in the matrix.

---

## Global native UX contracts

### Navigation
- Primary UI = React Native screens (expo-router). **No WebView as home shell.**
- Hardware Back / gesture Back: pop stack; on root tab → move task to background (do not force-quit).
- Predictive Back: enable where Android version supports; avoid hijacking without `OnBackPressedCallback` equivalent.
- Deep links resolve to native routes.

### System chrome
- Edge-to-edge compatible; content padded with safe-area insets.
- Bottom navigation / CTAs **never** under gesture/nav bar or cutout.
- Status bar icons readable on splash and home.
- Keyboard: avoid covering focused fields; dismiss on scroll/tap outside where appropriate.

### Feedback
- Loading: native spinners/skeletons — not blank WebView.
- Empty: title + one CTA.
- Errors: actionable retry; map API codes.
- Offline: banner + queue mutations when safe.

### State
- Preserve scroll position and form drafts on Back and process recreation.
- Auth session via SecureStore; restore on cold start.

### Accessibility / targets
- Min ~48dp touch targets; label icon buttons; respect font scale where feasible.
- Portrait default (current app orientation); landscape only where video fullscreen needs it.

### Official UX/platform refs
- Core app quality: https://developer.android.com/docs/quality-guidelines/core-app-quality  
- Edge-to-edge: https://developer.android.com/develop/ui/views/layout/edge-to-edge  
- Predictive back: https://developer.android.com/guide/navigation/custom-back/predictive-back-gesture  

---

## Cross-cutting feature behaviors

### Startup / splash
- Show branded splash → hydrate token → land Home (guest) or last tab.  
- No location permission dialog on cold start.  
- No notification permission until contextual opt-in.

### Guest browsing
- Browse Home/Search/Listing without account.  
- Country via Smart Location priority.  
- Auth wall only on gated actions (buy, message, sell, boost).

### Auth
- Login / register / forgot-password / set-new-password as native forms calling existing `/api` auth.  
- Suspended account screen mirrors web.  
- Biometrics optional later — not required for Phase 2.

### Marketplace commerce
- Home infinite feed, categories, search filters, listing detail, cart, physical checkout.  
- Stripe/MonCash for **physical** goods via Custom Tabs / trusted browser — not full-site WebView shell.  
- Flexa Card / wallet: respect Android digital purchase guard for digital top-ups.

### Orders / delivery
- Orders list/detail, tracking (extend existing native tracking), confirmation flows.  
- Driver flows: location only when on active job or explicit enable.

### Seller Center
- Create/edit listing with Photo Picker + optional camera.  
- Media compress/validate; upload progress; draft persistence.  
- Sales/orders seller views.

### Promotional Videos / Boost
- Discover + vertical player native.  
- Create campaign: video picker/record, targeting UI, analytics.  
- Digital boost purchase: Play Billing **or** unavailable messaging (no Stripe CTA for digital boost on Android).  
- Drafts + duration ≤ 120s for Booster Pro.

### Flexa TV / Music
- TV: native video, fullscreen, aspect-correct.  
- Music: queue, mini player, background + media session/lock screen when FGS mediaPlayback declared; audio focus; Bluetooth.  
- Never request mic to play music.

### Messaging
- Threads + media + **voice notes** with RECORD_AUDIO on record only.  
- Support module: **no voice** (preserve exclusion).

### Profile / settings / deletion
- Profile, preferences, language, addresses, security.  
- Account deletion in-app → existing anonymization API.  
- Privacy policy link.

### Admin / Super Admin
- Prefer web staff tools; if native subset ships, enforce server RBAC.  
- Country scope (All Countries / Haiti / DR) for promo/admin views.

### Notifications
- System tray via FCM; in-app list via API.  
- Taps deep-link to native screens.
