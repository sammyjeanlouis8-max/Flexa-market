import { isAndroidApp, isIosApp } from "@/lib/androidPurchasePolicy";

/** True inside the installed iOS or Android app, not the mobile browser. */
export function isNativeMobileApp(): boolean {
  if (typeof window === "undefined") return false;
  return isAndroidApp() || isIosApp();
}