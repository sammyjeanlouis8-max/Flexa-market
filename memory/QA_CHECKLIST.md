# Manual QA Checklist — Flexa-Market June 2026 Fixes

> Automated browser tests cannot reproduce Android WebView crashes, iPhone Dynamic Island overlap, or in-app system-browser hand-offs. Run this checklist on real devices once a fresh deploy / TestFlight build is available.

## ── ISSUE #1 — Android WebView Stability ──

### Test A — Older Android WebView (Android 9 / 10, WebView < 119)
1. Open the app on an Android 9 or 10 device whose System WebView has NOT been updated (Settings → Apps → Android System WebView → version < 119).
2. **Expected:**
   - App boots within 10 s.
   - All borders/cards render with visible 1px borders (no "blank rounded-rectangles").
   - Top header sits below the status bar (no overlap).
   - No infinite reload loop (verify by leaving the home screen open for 2 min).

### Test B — Slow-network self-heal does NOT loop
1. Throttle network to 2G (Chrome DevTools → Network → "Slow 3G", or use a real 2G SIM).
2. Force-quit the app and relaunch.
3. **Expected:**
   - Skeleton shows for up to 30 s.
   - If self-heal fires (rare), it fires ONCE and then surfaces the discreet retry link — never reloads in a loop.
   - `localStorage.getItem('fm_self_heal_at')` is a timestamp; on a second launch within 24 h, no reload happens.

### Test C — Android Chrome (control)
1. Open the app in real Android Chrome (not WebView).
2. **Expected:** Identical experience to before the fix — no regressions.

---

## ── ISSUE #2 — Stripe Pages on iPhone ──

### Test D — Subscription → Stripe Checkout opens in Safari
1. Inside the iOS app (TestFlight WKWebView), navigate to **Subscription**.
2. Tap a paid plan → choose "Card".
3. **Expected:**
   - The Stripe-hosted Checkout page opens in **Safari** (or in-app SafariViewController), NOT inside the WebView.
   - Stripe's viewport is rendered at native scale (no zoom).
   - Stripe's back button sits below the iPhone status bar (no Dynamic Island overlap).
4. Complete (or cancel) the payment.
5. **Expected:** Stripe redirects back to `flexamarket.com/subscription?subscription_success=1`; the WebView resumes and shows the "Payment complete! Tap to return to app" banner.

### Test E — Boost / Listing checkout
1. Repeat Test D for:
   - Boost a listing → choose Stripe card payment.
   - Buy a listing → "Pay with card" (Stripe).
   - Wallet → "Recharge with card".
2. **Expected:** All open Stripe Checkout in the system browser.

### Test F — Stripe Connect onboarding
1. Settings → Stripe Connect → "Start onboarding".
2. **Expected:** Stripe Connect onboarding opens in Safari with proper safe-area handling.

### Test G — Our return pages
1. After Stripe Checkout completes, the user lands back on `CheckoutSuccess` / `Subscription?success=1` / `Boost/:id?boost_success=1` inside the WebView.
2. **Expected:**
   - Page content does not start at y=0 (back button is below the Dynamic Island).
   - Inspect via Safari → Develop → iPhone → `document.documentElement.classList` contains `native-ios`.
   - `getComputedStyle(document.documentElement).getPropertyValue('--safe-top')` ≥ `50px`.

### Test H — Pure Safari (control)
1. Open `flexamarket.com` in iOS Safari (not the app).
2. Repeat Test D.
3. **Expected:** Stripe Checkout opens in the same Safari tab (no `target=_blank` redirect — `html.native-ios` is NOT set in real Safari, so `openExternal` falls through to a normal top-level navigation).

---

## ── ISSUE #3 — Promotional Video Save & Playback ──

### Test I — Large video (> 50 MB, triggers chunked path)
1. From the Boost Wizard, upload a 60–100 MB promo video (e.g. 90-second 1080p clip).
2. Wait for upload progress to reach 100 %.
3. Complete the boost wizard.
4. Refresh the page (or close & reopen the app).
5. Open **My Boosts**.
6. **Expected:**
   - The boost card shows a real video thumbnail (not the generic gradient placeholder).
   - Tapping "Watch Ad" plays the video successfully — **no 404, no infinite spinner**.
   - The `listings.boost_video_url` column in the database contains a `https://res.cloudinary.com/...` URL (NOT `/objects/uploads/<uuid>`).

### Test J — Small video (< 50 MB, presigned-PUT path)
1. Repeat Test I with a 5–10 MB clip.
2. **Expected:** Same outcome — video plays after refresh.

### Test K — Replace a video on an existing boost
1. From **My Boosts**, on a boost that already has a video, tap "Add video" (or replace flow).
2. Upload a new clip.
3. **Expected:** New URL is saved (`PATCH /api/boost/:boostId/video`), preview reflects the new file.

### Test L — Cross-device playback
1. With a saved promo video, open `/listings/:id/video` on:
   - iPhone Safari
   - Android Chrome
   - Android WebView
   - Desktop Chrome / Firefox / Safari
2. **Expected:** Video plays on all four (Cloudinary `fl_faststart,vc_h264,f_mp4` transform applied).

### Test M — Server-side audit
Run in production DB shell:
```sql
SELECT id, title, boost_video_url
FROM listings
WHERE boost_video_url IS NOT NULL
ORDER BY id DESC
LIMIT 20;
```
**Expected:** every URL begins with `https://res.cloudinary.com/` (or `/objects/uploads/` for GCS-only deployments). Any `/objects/uploads/<uuid>` rows from BEFORE the fix can be safely cleared (`UPDATE listings SET boost_video_url = NULL WHERE boost_video_url LIKE '/objects/uploads/%'`) — those files were never actually saved to GCS.

---

## ── ACTIVE BOOSTS — Smoke Test ──

### Test N — Video Feed (`/videos`)
1. Open the Video Feed on iPhone, Android Chrome, Android WebView, desktop.
2. **Expected:**
   - Boosted videos auto-play when scrolled into view.
   - View count, like count, share count update in real-time.
   - Tapping "Achte" opens the listing.

---

## Sign-off

| Test | Status (✅ / ❌) | Tester | Date | Device | Notes |
|------|----------------|--------|------|--------|-------|
| A | | | | | |
| B | | | | | |
| C | | | | | |
| D | | | | | |
| E | | | | | |
| F | | | | | |
| G | | | | | |
| H | | | | | |
| I | | | | | |
| J | | | | | |
| K | | | | | |
| L | | | | | |
| M | | | | | |
| N | | | | | |
