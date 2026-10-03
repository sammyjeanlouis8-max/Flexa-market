import type Purchases from "react-native-purchases";
import type { PurchasesPackage } from "react-native-purchases";

type Plan = "standard" | "premium";
type Message = Record<string, unknown>;
type Options = {
  sdk: typeof Purchases;
  apiKey: string;
  apiBaseUrl: string;
  emit: (name: string, detail: Message) => void;
  openUrl: (url: string) => Promise<unknown>;
  fetcher?: typeof fetch;
};

/** Serializes identity changes and purchases; only the server verifies access. */
export class AndroidSubscriptions {
  private queue: Promise<void> = Promise.resolve();
  private configured = false;
  private token: string | null = null;
  private userId: number | null = null;
  private generation = 0;
  private packages: Partial<Record<Plan, PurchasesPackage>> = {};
  private fetcher: typeof fetch;

  constructor(private options: Options) {
    this.fetcher = options.fetcher ?? fetch;
    if (!options.apiKey.startsWith("goog_")) throw new Error("Invalid Google Play SDK configuration");
  }

  handle(message: Message): boolean {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const type = message.type;
    if (typeof type !== "string" || !["AUTH_TOKEN", "IAP_IDENTIFY", "IAP_LOGOUT", "IAP_GET_PRODUCTS", "IAP_PURCHASE", "IAP_RESTORE", "IAP_MANAGE"].includes(type)) return false;
    if (type === "AUTH_TOKEN") {
      if (typeof message.token !== "string" || message.token.length > 8192) return true;
      if (message.token !== this.token) {
        this.token = message.token;
        this.userId = null;
        this.packages = {};
        this.generation++;
      }
      return true;
    }
    if (type === "IAP_LOGOUT") {
      this.token = null;
      this.userId = null;
      this.packages = {};
      this.generation++;
    }
    const generation = this.generation;
    this.queue = this.queue.then(async () => {
      if (generation !== this.generation) return;
      try {
        await this.perform(type, message, generation);
      } catch (error: unknown) {
        if (generation !== this.generation) return;
        const cancelled = !!(error && typeof error === "object" && "userCancelled" in error && error.userCancelled);
        const text = cancelled ? undefined : error instanceof Error ? error.message.slice(0, 500) : "Google Play purchase failed";
        const name = type === "IAP_PURCHASE" ? "IAP_PURCHASE_RESULT" : type === "IAP_RESTORE" ? "IAP_RESTORE_RESULT" : "IAP_ERROR";
        this.options.emit(name, { ok: false, cancelled, message: text, userId: this.userId });
      }
    });
    return true;
  }

  /** Used by deterministic unit tests; never substitutes for a store purchase. */
  settled(): Promise<void> { return this.queue; }

  private assertSession(generation: number, expected?: unknown): number {
    if (generation !== this.generation || !this.token || !this.userId) throw new Error("Sign in again before purchasing");
    if (expected !== undefined && Number(expected) !== this.userId) throw new Error("Purchase account does not match signed-in account");
    return this.userId;
  }

  private async identify(expected: unknown, generation: number): Promise<void> {
    const id = Number(expected);
    if (!Number.isSafeInteger(id) || id <= 0 || !this.token) throw new Error("Sign in before using Google Play subscriptions");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    let response: Response;
    try {
      response = await this.fetcher(`${this.options.apiBaseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) throw new Error("Could not verify the signed-in account");
    const user = await response.json();
    if (generation !== this.generation) return;
    if (Number(user.id) !== id) throw new Error("Purchase account does not match signed-in account");
    if (!this.configured) {
      this.options.sdk.configure({ apiKey: this.options.apiKey, appUserID: String(id) });
      this.configured = true;
    } else if (await this.options.sdk.getAppUserID() !== String(id)) {
      await this.options.sdk.logIn(String(id));
    }
    if (generation !== this.generation) return;
    this.userId = id;
    this.packages = {};
    this.options.emit("IAP_IDENTIFIED", { userId: id, platform: "android" });
  }

  private async products(generation: number): Promise<void> {
    this.assertSession(generation);
    const offerings = await this.options.sdk.getOfferings();
    this.assertSession(generation);
    this.packages = {};
    for (const p of offerings.current?.availablePackages ?? []) {
      const plan = p.identifier === "standard_monthly" ? "standard" : p.identifier === "premium_monthly" ? "premium" : null;
      if (plan && p.product.priceString && p.product.identifier) {
        this.packages[plan] = p;
      }
    }
    this.options.emit("IAP_PRODUCTS", {
      userId: this.userId,
      products: Object.entries(this.packages).map(([plan, p]) => ({
        plan, identifier: p!.product.identifier, priceString: p!.product.priceString,
      })),
    });
    if (!this.packages.standard || !this.packages.premium) {
      throw new Error("Standard and Premium must be activated in Google Play and connected to RevenueCat before purchasing");
    }
  }

  private async perform(type: string, message: Message, generation: number): Promise<void> {
    if (type === "IAP_LOGOUT") {
      if (this.configured) await this.options.sdk.logOut();
      this.options.emit("IAP_LOGGED_OUT", {});
      return;
    }
    if (type === "IAP_IDENTIFY") {
      await this.identify(message.userId, generation);
      return;
    }
    if (type === "IAP_MANAGE") {
      this.assertSession(generation);
      await this.options.openUrl("https://play.google.com/store/account/subscriptions?package=com.flexa.market");
      return;
    }
    const id = this.assertSession(generation, message.userId);
    if (await this.options.sdk.getAppUserID() !== String(id)) throw new Error("Google Play purchase identity is not ready");
    if (type === "IAP_GET_PRODUCTS") {
      await this.products(generation);
      return;
    }
    if (type === "IAP_RESTORE") {
      await this.options.sdk.restorePurchases();
      this.assertSession(generation, id);
      this.options.emit("IAP_RESTORE_RESULT", { ok: true, userId: id });
      return;
    }
    const plan = message.plan;
    if (plan !== "standard" && plan !== "premium") throw new Error("Unsupported Google Play plan");
    await this.products(generation);
    const selected = this.packages[plan];
    if (!selected) throw new Error("This Google Play product is not available");
    const info = await this.options.sdk.getCustomerInfo();
    this.assertSession(generation, id);
    const selectedSku = selected.product.identifier.split(":")[0];
    const knownSkus = Object.values(this.packages).map(p => p!.product.identifier.split(":")[0]);
    // Never use an Apple receipt from the shared customer as a Play upgrade.
    const oldSku = info.activeSubscriptions.map(s => s.split(":")[0]).find(s => knownSkus.includes(s) && s !== selectedSku);
    const change = oldSku ? {
      oldProductIdentifier: oldSku,
      prorationMode: this.options.sdk.PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION,
    } : undefined;
    await this.options.sdk.purchasePackage(selected, undefined, change);
    this.assertSession(generation, id);
    this.options.emit("IAP_PURCHASE_RESULT", { ok: true, plan, userId: id });
  }
}