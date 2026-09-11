import type { NextFunction, Request, Response } from "express";

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
  if (
    isAndroidNativeApp(req.get("user-agent")) &&
    isDigitalPurchaseInitiation(req.method, normalizedApiPath(req))
  ) {
    res.status(403).json({
      error: "Digital purchases are unavailable in the Android app.",
      code: ANDROID_DIGITAL_PURCHASE_UNAVAILABLE,
    });
    return;
  }
  next();
}