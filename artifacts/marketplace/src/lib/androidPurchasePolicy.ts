declare global {
  interface Window {
    ReactNativeWebView?: unknown;
    __flexaPlatform?: string;
  }
}

export type AndroidPurchaseRuntime = {
  reactNativeWebView?: boolean;
  flexaPlatform?: string;
};

/** Pure detector used by isAndroidApp and unit tests. */
export function detectAndroidApp(userAgent: string, runtime: AndroidPurchaseRuntime = {}): boolean {
  const ua = userAgent || "";
  if (/FlexaMarketAndroid/i.test(ua)) return true;
  if (runtime.flexaPlatform?.toLowerCase() === "android") return true;
  if (!/Android/i.test(ua)) return false;

  if (runtime.reactNativeWebView) return true;
  if (/(?:;\s*wv\b|FlexaMarket|ReactNative)/i.test(ua)) return true;

  // Android's pre-Chromium stock WebView did not add the modern "; wv"
  // token. Version/4.0 + Mobile Safari without Chrome is its stable marker.
  return /Version\/4\.0/i.test(ua) && /Mobile\s+Safari/i.test(ua) && !/(?:Chrome|CriOS)\//i.test(ua);
}

/** True only inside the Android native app/WebView, never normal Android Chrome. */
export function isAndroidApp(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return detectAndroidApp(navigator.userAgent, {
    reactNativeWebView: Boolean(window.ReactNativeWebView),
    flexaPlatform: window.__flexaPlatform,
  });
}
