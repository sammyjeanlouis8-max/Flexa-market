import type { NextFunction, Request, Response } from "express";

/** Kept for native clients that already key off this code (Android + iOS). */
export const ANDROID_DIGITAL_PURCHASE_UNAVAILABLE =
  "ANDROID_DIGITAL_PURCHASE_UNAVAILABLE";

/**
 * Contract shared with the native clients. The standalone marker supports the
 * current/new app UA, while the Android + WebView/app-marker branch preserves
 * detection of the legacy stock Android WebView UA.
 */
export function isAndroidNativeApp(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return /FlexaMarketAndroid/i.test(userAgent) ||
    (/Android/i.test(userAgent) &&
      (/; wv\b/i.test(userAgent) ||
        /FlexaMarket/i.test(userAgent) ||
        /ReactNative/i.test(userAgent)));
}

/** Installed iOS app (Expo / WebView shell), not Safari. */
export function isIosNativeApp(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  if (/FlexaMarketiOS/i.test(userAgent)) return true;
  if (/__flexaPlatform=ios/i.test(userAgent)) return true;
  // React Native default UA often includes "iPhone" / "iPad" with ReactNative.
  if (/ReactNative/i.test(userAgent) && /(iPhone|iPad|iPod)/i.test(userAgent)) return true;
  return false;
}

/** Native store binary where digital goods must use IAP / Play Billing (or stay blocked). */
export function isStoreNativeApp(userAgent: string | undefined): boolean {
  return isAndroidNativeApp(userAgent) || isIosNativeApp(userAgent);
}

type ProtectedRoute = {
  method: string;
  path: RegExp;
};

/**
 * Only endpoints which initiate or restore access to digital goods/currency
 * belong here. Paid-payment settlement/webhooks and physical-commerce routes
 * are deliberately excluded.
 */
const PROTECTED_ROUTES: readonly ProtectedRoute[] = [
  // Vendor subscriptions (cancel and read/status routes remain available).
  { method: "POST", path: /^\/subscription\/checkout\/?$/ },
  { method: "POST", path: /^\/subscription\/wallet-pay\/?$/ },
  { method: "POST", path: /^\/subscription\/wallet-retry\/?$/ },
  { method: "POST", path: /^\/subscription\/uncancel\/?$/ },
  { method: "POST", path: /^\/subscription\/portal\/?$/ },

  // Listing promotion, including legacy and staff-granted free activation.
  { method: "POST", path: /^\/listings\/[^/]+\/boost\/?$/ },
  { method: "POST", path: /^\/listings\/[^/]+\/boost\/initiate\/?$/ },
  { method: "POST", path: /^\/listings\/[^/]+\/boost\/confirm\/?$/ },
  { method: "POST", path: /^\/listings\/[^/]+\/boost\/stripe-checkout\/?$/ },
  { method: "POST", path: /^\/boost\/video-only\/?$/ },
  { method: "POST", path: /^\/moncash\/pay\/?$/ },
  { method: "POST", path: /^\/admin\/listings\/[^/]+\/boost\/?$/ },
  { method: "POST", path: /^\/admin\/listings\/[^/]+\/boost\/extend\/?$/ },

  // Music purchases and artist digital plans.
  { method: "POST", path: /^\/music\/artist\/subscribe\/?$/ },
  { method: "POST", path: /^\/music\/artist\/subscribe\/wallet\/?$/ },
  { method: "POST", path: /^\/music\/[^/]+\/buy\/?$/ },
  { method: "POST", path: /^\/music\/[^/]+\/buy\/wallet\/?$/ },

  // FM Wallet funding creates currency spendable on the digital goods above.
  { method: "POST", path: /^\/wallet\/topup\/initiate\/?$/ },
  { method: "POST", path: /^\/wallet\/topup\/submit-proof\/?$/ },
  { method: "POST", path: /^\/wallet\/topup\/card\/session\/?$/ },
  { method: "POST", path: /^\/admin\/recharge-cards\/generate\/?$/ },
];

function normalizedApiPath(req: Request): string {
  const rawPath = (req.originalUrl || req.url || req.path).split("?")[0] || "/";
  return (rawPath.replace(/^\/api(?=\/|$)/i, "") || "/").toLowerCase();
}

export function isDigitalPurchaseInitiation(method: string, path: string): boolean {
  const normalizedPath =
    ((path.split("?")[0] || "/").replace(/^\/api(?=\/|$)/i, "") || "/").toLowerCase();
  const normalizedMethod = method.toUpperCase();
  return PROTECTED_ROUTES.some(
    (route) => route.method === normalizedMethod && route.path.test(normalizedPath),
  );
}

export function androidDigitalPurchaseGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const ua = req.get("user-agent");
  if (
    isStoreNativeApp(ua) &&
    isDigitalPurchaseInitiation(req.method, normalizedApiPath(req))
  ) {
    const platform = isIosNativeApp(ua) ? "iOS" : "Android";
    res.status(403).json({
      error: `Digital purchases are unavailable in the ${platform} app.`,
      code: ANDROID_DIGITAL_PURCHASE_UNAVAILABLE,
    });
    return;
  }
  next();
}
