import test from "node:test";
import assert from "node:assert/strict";
import { AndroidSubscriptions } from "./androidSubscriptions";
import { platformBridgeScript } from "../security/webviewPolicy";

function fixture(options: { serverId?: number; empty?: boolean; active?: string[]; cancel?: boolean; waitForPurchase?: Promise<void> } = {}) {
  let sdkUser = "";
  let purchaseArgs: unknown[] = [];
  const events: { name: string; detail: Record<string, unknown> }[] = [];
  let purchaseCount = 0;
  let restoreCount = 0;
  const sdk = {
    configure: ({ appUserID }: { appUserID: string }) => { sdkUser = appUserID; },
    logIn: async (id: string) => { sdkUser = id; },
    logOut: async () => { sdkUser = "$anonymous"; },
    getAppUserID: async () => sdkUser,
    getOfferings: async () => ({
      current: { availablePackages: options.empty ? [] : [
        { identifier: "standard_monthly", product: { identifier: "flexa_standard_monthly:monthly", priceString: "$14.99" } },
        { identifier: "premium_monthly", product: { identifier: "flexa_premium_monthly:monthly", priceString: "$29.99" } },
      ] },
    }),
    getCustomerInfo: async () => ({ activeSubscriptions: options.active ?? [] }),
    purchasePackage: async (...args: unknown[]) => {
      purchaseCount++;
      purchaseArgs = args;
      await options.waitForPurchase;
      if (options.cancel) throw Object.assign(new Error("cancelled"), { userCancelled: true });
    },
    restorePurchases: async () => { restoreCount++; },
    PRORATION_MODE: { IMMEDIATE_WITH_TIME_PRORATION: 1 },
  };
  const bridge = new AndroidSubscriptions({
    sdk: sdk as never,
    apiKey: "goog_unit_test_not_a_real_key",
    apiBaseUrl: "https://flexamarket.com",
    emit: (name, detail) => events.push({ name, detail }),
    openUrl: async () => {},
    fetcher: (async (_url, init) => {
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer unit-test-token");
      return new Response(JSON.stringify({ id: options.serverId ?? 2 }));
    }) as typeof fetch,
  });
  const identify = async () => {
    bridge.handle({ type: "AUTH_TOKEN", token: "unit-test-token" });
    bridge.handle({ type: "IAP_IDENTIFY", userId: 2 });
    await bridge.settled();
  };
  return { bridge, identify, events, sdkUser: () => sdkUser, purchaseCount: () => purchaseCount, restoreCount: () => restoreCount, purchaseArgs: () => purchaseArgs };
}

test("only authenticated, server-verified identity configures RevenueCat", async () => {
  const f = fixture();
  await f.identify();
  assert.equal(f.sdkUser(), "2");
  f.bridge.handle({ type: "IAP_GET_PRODUCTS" });
  await f.bridge.settled();
  assert.equal(f.events.find(e => e.name === "IAP_PRODUCTS")?.detail.products instanceof Array, true);
  assert.equal((f.events.find(e => e.name === "IAP_PRODUCTS")?.detail.products as any[])[0].priceString, "$14.99");
});

test("forged user identity never configures the SDK", async () => {
  const f = fixture({ serverId: 99 });
  await f.identify();
  assert.equal(f.sdkUser(), "");
  assert.equal(f.events.at(-1)?.name, "IAP_ERROR");
});

test("a purchase for another account is refused", async () => {
  const f = fixture();
  await f.identify();
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 3, plan: "standard" });
  await f.bridge.settled();
  assert.equal(f.purchaseCount(), 0);
  assert.equal(f.events.at(-1)?.detail.ok, false);
});

test("empty store catalog fails explicitly without payment fallback", async () => {
  const f = fixture({ empty: true });
  await f.identify();
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 2, plan: "standard" });
  await f.bridge.settled();
  assert.equal(f.purchaseCount(), 0);
  assert.deepEqual(f.events.find(e => e.name === "IAP_PRODUCTS")?.detail.products, []);
  assert.equal(f.events.at(-1)?.detail.ok, false);
});

test("Standard to Premium uses a Google upgrade and prorates the existing purchase", async () => {
  const f = fixture({ active: ["flexa_standard_monthly:monthly"] });
  await f.identify();
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 2, plan: "premium" });
  await f.bridge.settled();
  assert.deepEqual(f.purchaseArgs()[2], { oldProductIdentifier: "flexa_standard_monthly", prorationMode: 1 });
  assert.equal(f.events.at(-1)?.detail.ok, true);
});

test("shared Apple receipts cannot become Google upgrade parameters", async () => {
  const f = fixture({ active: ["com.flexamarket.mobile.subscription.standard.monthly"] });
  await f.identify();
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 2, plan: "premium" });
  await f.bridge.settled();
  assert.equal(f.purchaseArgs()[2], undefined);
});

test("a cancelled Play dialog is not reported as a successful purchase", async () => {
  const f = fixture({ cancel: true });
  await f.identify();
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 2, plan: "standard" });
  await f.bridge.settled();
  assert.equal(f.events.at(-1)?.detail.ok, false);
  assert.equal(f.events.at(-1)?.detail.cancelled, true);
});

test("an account change during the store dialog cannot emit success to the next account", async () => {
  let finish!: () => void;
  const waiting = new Promise<void>(resolve => { finish = resolve; });
  const f = fixture({ waitForPurchase: waiting });
  await f.identify();
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 2, plan: "standard" });
  while (!f.purchaseCount()) await new Promise(resolve => setImmediate(resolve));
  f.bridge.handle({ type: "IAP_LOGOUT" });
  finish();
  await f.bridge.settled();
  assert.equal(f.events.some(e => e.name === "IAP_PURCHASE_RESULT" && e.detail.ok), false);
  assert.equal(f.sdkUser(), "$anonymous");
});

test("restore works for the verified account and logout blocks subsequent purchases", async () => {
  const f = fixture();
  await f.identify();
  f.bridge.handle({ type: "IAP_RESTORE", userId: 2 });
  await f.bridge.settled();
  assert.equal(f.restoreCount(), 1);
  f.bridge.handle({ type: "IAP_LOGOUT" });
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 2, plan: "standard" });
  await f.bridge.settled();
  assert.equal(f.purchaseCount(), 0);
});

test("malformed messages and unsupported VIP purchases fail safely", async () => {
  const f = fixture();
  assert.equal(f.bridge.handle(null as never), false);
  assert.equal(f.bridge.handle([] as never), false);
  await f.identify();
  f.bridge.handle({ type: "IAP_PURCHASE", userId: 2, plan: "vip" });
  await f.bridge.settled();
  assert.equal(f.purchaseCount(), 0);
});

test("billing capability is opt-in for new Android builds only; iPhone injection is unchanged", () => {
  assert.equal(platformBridgeScript("android").includes("__flexaAndroidIapV1"), false);
  assert.equal(platformBridgeScript("android", false, true).includes("__flexaAndroidIapV1"), true);
  assert.equal(platformBridgeScript("ios", false, true), platformBridgeScript("ios"));
  assert.equal(platformBridgeScript("android", false, true).includes('location.protocol==="https:"'), true);
});