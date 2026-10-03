import { createAppleIapController, type AppleIapState } from "./appleIapController";

export function validAndroidProduct(plan: unknown, identifier: unknown): boolean {
  return (plan === "standard" && ["flexa_standard_monthly", "flexa_standard_monthly:monthly"].includes(String(identifier)))
    || (plan === "premium" && ["flexa_premium_monthly", "flexa_premium_monthly:monthly"].includes(String(identifier)));
}

/** Adapt the Android bridge without changing the existing Apple protocol. */
export function createAndroidIapController(options: {
  target: EventTarget;
  userId: number | null;
  token: string | null;
  post: (message: Record<string, unknown>) => void;
  onState: (state: AppleIapState) => void;
  timeoutMs?: number;
}) {
  const isolated = new EventTarget();
  const listeners: [string, EventListener][] = [];
  for (const name of ["IAP_IDENTIFIED", "IAP_PRODUCTS", "IAP_ERROR", "IAP_LOGGED_OUT"]) {
    const listener: EventListener = (event) => {
      let detail = (event as CustomEvent).detail;
      if (name !== "IAP_LOGGED_OUT" && (!detail || Number(detail.userId) !== options.userId)) return;
      if (name === "IAP_IDENTIFIED" && detail.platform !== "android") return;
      if (name === "IAP_PRODUCTS") {
        if (!Array.isArray(detail.products)) return;
        const products = detail.products.filter((p: any) => validAndroidProduct(p?.plan, p?.identifier));
        const complete = products.some((p: any) => p.plan === "standard") && products.some((p: any) => p.plan === "premium");
        detail = { ...detail, products: complete ? products : [] };
      }
      isolated.dispatchEvent(new CustomEvent(name, {
        detail: name === "IAP_IDENTIFIED" ? { ...detail, ok: true } : detail,
      }));
    };
    options.target.addEventListener(name, listener);
    listeners.push([name, listener]);
  }
  const controller = createAppleIapController({
    ...options, target: isolated,
    userId: options.token ? options.userId : null,
    post: (message) => {
      if (message.type === "IAP_IDENTIFY") options.post({ type: "AUTH_TOKEN", token: options.token });
      options.post(message);
    },
  });
  return {
    retry: controller.retry,
    cleanup() {
      controller.cleanup();
      for (const [name, listener] of listeners) options.target.removeEventListener(name, listener);
    },
  };
}