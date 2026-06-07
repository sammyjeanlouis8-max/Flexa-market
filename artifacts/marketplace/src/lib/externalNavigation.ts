/**
 * External navigation helper for Stripe-hosted Checkout, Stripe Customer
 * Portal, Stripe Connect onboarding and any other URL that should escape
 * the in-app WebView wrapper.
 *
 * Why this exists:
 *   - On iOS WKWebView (TestFlight build) Stripe's hosted Checkout renders
 *     with the wrong viewport scale ("excessively zoomed") and Stripe's
 *     back button lands under the Dynamic Island when the wrapper reports
 *     env(safe-area-inset-top)=0.
 *   - On Android WebView Stripe's `apple-pay` / `google-pay` / 3DS
 *     redirect_target_url flows often fail silently because the WebView
 *     does not implement the Payment Request API.
 *
 * The fix is to open Stripe URLs in the SYSTEM browser (`target=_blank`),
 * which every WebView host (WKWebView, Custom Tabs, Capacitor, Cordova,
 * TWA) delegates to Safari / Chrome — so the customer sees the real,
 * correctly-rendered Stripe page and the back button respects the OS
 * chrome.
 *
 * In a normal desktop / mobile browser this falls through to a regular
 * top-level navigation, so behaviour is unchanged outside the WebView.
 */
export function isInAppWebView(): boolean {
  try {
    const html = document.documentElement;
    return (
      html.classList.contains("native-ios") ||
      html.classList.contains("native-android")
    );
  } catch {
    return false;
  }
}

export function openExternal(url: string): void {
  if (!url) return;

  // In-app WebView → open in system browser
  if (isInAppWebView()) {
    try {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (win) return;
      // popup blocked — fall through to top-level navigation
    } catch {
      // window.open threw — fall through
    }
  }

  // Standard browser path — escape any parent iframe (Replit dev-preview)
  // so Stripe's X-Frame-Options: DENY does not produce a blank page.
  try {
    if (window.top && window.top !== window) {
      window.top.location.href = url;
      return;
    }
  } catch {
    // Cross-origin iframe — can't access top, fall through
  }
  window.location.href = url;
}
