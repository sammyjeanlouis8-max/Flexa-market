# Flexa Market WebView Reference Screenshots

## Screenshot Inventory

### 01-home.png
- **URL:** https://flexamarket.com
- **Page:** Home/Landing page
- **Language:** English
- **User Role:** Guest (not logged in)
- **Timestamp:** 2026-11-19 17:16 UTC
- **Description:** Mobile-width homepage showing search bar, location selector (Ashburn), category navigation, featured FlexaHeat Pro™ product banner, Shop by Category section, and bottom navigation bar.

### 02-login.png
- **URL:** https://flexamarket.com/auth/login
- **Page:** Authentication/Login page
- **Language:** English
- **User Role:** Guest (pre-login state)
- **Timestamp:** 2026-11-19 17:21 UTC
- **Description:** Login form with email/password fields, EULA checkbox, "Sign In" button, and alternative sign-in options. Dark blue hero section with globe graphic and marketing copy.

### 03-search.png
- **URL:** https://flexamarket.com/search?q=laptop
- **Page:** Search results
- **Language:** English
- **User Role:** Guest
- **Timestamp:** 2026-11-19 17:29 UTC
- **Description:** Search results page for query "laptop". Shows "0 listings found in USA" with empty state (magnifying glass icon). Includes search bar with filters button (1 active filter) and bottom navigation.

### 04-listing-detail.png
- **URL:** https://flexamarket.com/listings/7
- **Page:** Product listing detail
- **Language:** English/French (product name)
- **User Role:** Guest
- **Timestamp:** 2026-11-19 17:32 UTC
- **Description:** Detail page for "FlexaHeat Pro™ – Senti Massage Chauffant Intelligente" ($110.00). Shows product gallery (1/5 images), seller info (Chelot goat, verified), breadcrumbs, quantity selector, and "Add to Cart"/"Buy Now" buttons.

## Notes

### Login Attempt
- **Status:** FAILED
- **Credentials Used:** Environment variables FLEXA_TEST_SUPERADMIN_EMAIL / FLEXA_TEST_SUPERADMIN_PASSWORD
- **Issue:** Login form interaction was problematic. Could not successfully submit credentials despite multiple attempts.
- **Result:** Screenshots captured in guest-only mode. Wallet page (06-wallet.png) could not be captured.

### Videos/Promotional Content
- **Status:** NOT FOUND
- **Note:** No dedicated videos page or promotional videos section was discovered during navigation. The site appears to focus on static product listings and category browsing.

### Viewport
- **Target:** ~390x844 (mobile width)
- **Actual:** Browser window sized to mobile-responsive dimensions
- **Method:** Chrome launched with --window-size=390,844 flag

### Technical Details
- **Browser:** Google Chrome (Chromium-based)
- **OS:** Linux
- **Capture Method:** computer tool screenshots saved as PNG
- **Site:** Production instance at https://flexamarket.com

### Missing Screenshots
- **05-videos.png:** Not captured (videos section not found)
- **06-wallet.png:** Not captured (login required, authentication failed)

## Recommendations

For future captures requiring authenticated access:
1. Verify credentials are valid for production environment
2. Consider manual login or alternative authentication flow
3. Check if CAPTCHA or additional verification steps are required
4. Investigate if videos/wallet features require specific user permissions or roles
