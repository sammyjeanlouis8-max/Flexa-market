import { isAndroidApp } from "@/lib/androidPurchasePolicy";

/** True inside the installed iOS or Android app, not the mobile browser. */
export function isNativeMobileApp(): boolean {
  if (typeof window === "undefined") return false;
  const nativeWindow = window as Window & { __flexaPlatform?: string; __iosWebView?: boolean };
  return isAndroidApp() || nativeWindow.__flexaPlatform === "ios" || nativeWindow.__iosWebView === true;
}