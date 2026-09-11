import { describe, expect, it, vi } from "vitest";
import express from "express";
import { createServer } from "node:http";
import type { NextFunction, Request, Response } from "express";
import {
  ANDROID_DIGITAL_PURCHASE_UNAVAILABLE,
  androidDigitalPurchaseGuard,
  isAndroidNativeApp,
  isDigitalPurchaseInitiation,
} from "../middlewares/androidDigitalPurchaseGuard";

const NEW_APP_UA = "FlexaMarketAndroid/1.0";
const LEGACY_WEBVIEW_UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 Version/4.0 Chrome/117.0 Mobile Safari/537.36";
const ANDROID_CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122.0 Mobile Safari/537.36";
const IOS_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

const protectedRoutes: Array<[string, string]> = [
  ["POST", "/api/subscription/checkout"],
  ["POST", "/api/subscription/wallet-pay"],
  ["POST", "/api/subscription/wallet-retry"],
  ["POST", "/api/subscription/uncancel"],
  ["POST", "/api/subscription/portal"],
  ["POST", "/api/listings/42/boost"],
  ["POST", "/api/listings/42/boost/initiate"],
  ["POST", "/api/listings/42/boost/confirm"],
  ["POST", "/api/listings/42/boost/stripe-checkout"],
  ["POST", "/api/boost/video-only"],
  ["POST", "/api/moncash/pay"],
  ["POST", "/api/admin/listings/42/boost"],
  ["POST", "/api/admin/listings/42/boost/extend"],
  ["POST", "/api/music/artist/subscribe"],
  ["POST", "/api/music/artist/subscribe/wallet"],
  ["POST", "/api/music/42/buy"],
  ["POST", "/api/music/42/buy/wallet"],
  ["POST", "/api/wallet/topup/initiate"],
  ["POST", "/api/wallet/topup/submit-proof"],
  ["POST", "/api/wallet/topup/card/session"],
  ["POST", "/api/admin/recharge-cards/generate"],
];

const allowedRoutes: Array<[string, string]> = [
  ["GET", "/api/subscription/my"],
  ["POST", "/api/subscription/cancel"],
  ["POST", "/api/subscription/checkout/verify"],
  ["POST", "/api/boost/verify-stripe-payment"],
  ["POST", "/api/boost/99/cancel"],
  ["GET", "/api/stripe/checkout/session"],
  ["GET", "/api/stripe/checkout/complete-redirect"],
  ["POST", "/api/stripe/webhook"],
  ["POST", "/api/stripe/checkout"],
  ["POST", "/api/cart/checkout"],
  ["POST", "/api/listings/42/purchase"],
  ["GET", "/api/wallet/balance"],
  ["GET", "/api/wallet/history"],
  ["POST", "/api/wallet/transfer"],
  ["GET", "/api/wallet/stripe/auto-retry"],
  ["POST", "/api/wallet/admin/stripe-retry"],
  ["POST", "/api/wallet/topup/confirm"],
  // Redeeming a prepaid code settles an already-paid purchase; it must not
  // strand value merely because redemption happens in the Android app.
  ["POST", "/api/wallet/redeem-card"],
  ["POST", "/api/delivery/42/tip"],
  ["POST", "/api/transactions/42/cancel"],
  ["POST", "/api/cashout"],
  ["POST", "/api/returns/42/refund"],
];

function invokeGuard(userAgent: string, method: string, originalUrl: string) {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  const next = vi.fn();
  const req = {
    method,
    originalUrl,
    url: originalUrl.replace(/^\/api/, ""),
    path: originalUrl.replace(/^\/api/, ""),
    get: (name: string) => name.toLowerCase() === "user-agent" ? userAgent : undefined,
  } as unknown as Request;
  const res = { status } as unknown as Response;

  androidDigitalPurchaseGuard(req, res, next as unknown as NextFunction);
  return { status, json, next };
}

describe("Android native detection contract", () => {
  it.each([
    NEW_APP_UA,
    LEGACY_WEBVIEW_UA,
    "Mozilla/5.0 (Linux; Android 12) FlexaMarket/4.2",
    "ReactNative Android",
  ])("detects native Android UA %s", (ua) => {
    expect(isAndroidNativeApp(ua)).toBe(true);
  });

  it.each([ANDROID_CHROME_UA, IOS_UA, "ReactNative iPhone", undefined])(
    "does not classify normal web/iOS UA %s",
    (ua) => {
      expect(isAndroidNativeApp(ua)).toBe(false);
    },
  );
});

describe("digital purchase route matrix", () => {
  it.each(protectedRoutes)("classifies %s %s as protected", (method, path) => {
    expect(isDigitalPurchaseInitiation(method, path)).toBe(true);
  });

  it.each(allowedRoutes)("keeps %s %s available", (method, path) => {
    expect(isDigitalPurchaseInitiation(method, path)).toBe(false);
  });

  it("matches exact methods and path boundaries", () => {
    expect(isDigitalPurchaseInitiation("GET", "/api/subscription/checkout")).toBe(false);
    expect(isDigitalPurchaseInitiation("POST", "/api/music/1/buying")).toBe(false);
    expect(isDigitalPurchaseInitiation("POST", "/api/wallet/topup/initiate-extra")).toBe(false);
  });

  it("matches Express-style mixed-case API paths and trailing slashes", () => {
    expect(isDigitalPurchaseInitiation("post", "/API/SUBSCRIPTION/CHECKOUT/")).toBe(true);
    expect(isDigitalPurchaseInitiation("POST", "/Api/MuSiC/42/BuY/WaLlEt/")).toBe(true);
  });
});

describe("guard execution before charging handlers", () => {
  it.each(protectedRoutes)("blocks Android %s %s without calling next", (method, path) => {
    const result = invokeGuard(LEGACY_WEBVIEW_UA, method, `${path}?source=app`);
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({
      error: "Digital purchases are unavailable in the Android app.",
      code: ANDROID_DIGITAL_PURCHASE_UNAVAILABLE,
    });
    expect(result.next).not.toHaveBeenCalled();
  });

  it.each([ANDROID_CHROME_UA, IOS_UA])(
    "leaves protected routes unchanged for %s",
    (ua) => {
      const result = invokeGuard(ua, "POST", "/api/subscription/checkout");
      expect(result.status).not.toHaveBeenCalled();
      expect(result.next).toHaveBeenCalledOnce();
    },
  );

  it.each(allowedRoutes)("allows Android %s %s", (method, path) => {
    const result = invokeGuard(NEW_APP_UA, method, path);
    expect(result.status).not.toHaveBeenCalled();
    expect(result.next).toHaveBeenCalledOnce();
  });

  it("is mounted before an Express charging route and blocks mixed-case requests", async () => {
    const testApp = express();
    const charged = vi.fn();
    testApp.use("/api", androidDigitalPurchaseGuard);
    testApp.post("/api/subscription/checkout", (_req, res) => {
      charged();
      res.json({ charged: true });
    });

    const server = createServer(testApp);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Test server did not bind");
      const response = await fetch(
        `http://127.0.0.1:${address.port}/API/SUBSCRIPTION/CHECKOUT/`,
        { method: "POST", headers: { "user-agent": LEGACY_WEBVIEW_UA } },
      );

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        error: "Digital purchases are unavailable in the Android app.",
        code: ANDROID_DIGITAL_PURCHASE_UNAVAILABLE,
      });
      expect(charged).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()),
      );
    }
  });
});