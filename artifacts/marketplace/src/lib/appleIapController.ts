export const APPLE_IAP_TIMEOUT_MS = 20_000;

export type ApplePlanId = "standard" | "premium" | "vip";

export type AppleProduct = {
  priceString: string;
  identifier: string;
};

export type AppleIapFailureReason =
  | "timeout"
  | "native"
  | "empty-products"
  | "malformed-products"
  | "logged-out"
  | "unauthenticated";

export type AppleIapState = {
  status: "identifying" | "loading-products" | "ready" | "error";
  userId: number | null;
  identified: boolean;
  products: Partial<Record<ApplePlanId, AppleProduct>>;
  error: {
    reason: AppleIapFailureReason;
    nativeMessage?: string;
  } | null;
};

type TimerScheduler = {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
};

type AppleIapControllerOptions = {
  target: EventTarget;
  userId: number | null;
  post: (message: Record<string, unknown>) => void;
  onState: (state: AppleIapState) => void;
  timeoutMs?: number;
  scheduler?: TimerScheduler;
};

export type AppleIapController = {
  retry(): void;
  cleanup(): void;
};

const DEFAULT_SCHEDULER: TimerScheduler = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const APPLE_PLAN_IDS = new Set<ApplePlanId>(["standard", "premium", "vip"]);

function makeState(
  userId: number | null,
  status: AppleIapState["status"],
  identified: boolean,
  products: Partial<Record<ApplePlanId, AppleProduct>> = {},
  error: AppleIapState["error"] = null,
): AppleIapState {
  return { userId, status, identified, products, error };
}

function readDetail(event: Event): Record<string, unknown> | null {
  const detail = (event as CustomEvent<unknown>).detail;
  return detail && typeof detail === "object" && !Array.isArray(detail)
    ? detail as Record<string, unknown>
    : null;
}

function positiveUserId(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function nativeMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value.trim();
  return message ? message.slice(0, 500) : undefined;
}

function parseProducts(detail: Record<string, unknown> | null): {
  products?: Partial<Record<ApplePlanId, AppleProduct>>;
  reason?: "empty-products" | "malformed-products";
} {
  if (!detail || !Array.isArray(detail.products)) return { reason: "malformed-products" };
  if (detail.products.length === 0) return { reason: "empty-products" };

  const products: Partial<Record<ApplePlanId, AppleProduct>> = {};
  for (const value of detail.products) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const product = value as Record<string, unknown>;
    const plan = product.plan;
    const identifier = product.identifier;
    const priceString = product.priceString;
    if (
      typeof plan !== "string"
      || !APPLE_PLAN_IDS.has(plan as ApplePlanId)
      || typeof identifier !== "string"
      || !identifier.trim()
      || typeof priceString !== "string"
      || !priceString.trim()
    ) continue;
    products[plan as ApplePlanId] = {
      identifier: identifier.trim(),
      priceString: priceString.trim(),
    };
  }

  return Object.keys(products).length > 0
    ? { products }
    : { reason: "malformed-products" };
}

export function hasMatchingAppleIapIdentity(state: AppleIapState, authenticatedUserId: number | null | undefined): boolean {
  return Number.isSafeInteger(authenticatedUserId)
    && Number(authenticatedUserId) > 0
    && state.identified
    && state.userId === Number(authenticatedUserId);
}

export function canPurchaseApplePlan(
  state: AppleIapState,
  authenticatedUserId: number | null | undefined,
  planId: string,
): boolean {
  if (!hasMatchingAppleIapIdentity(state, authenticatedUserId)) return false;
  if (!APPLE_PLAN_IDS.has(planId as ApplePlanId)) return false;
  const product = state.products[planId as ApplePlanId];
  return Boolean(product?.identifier.trim() && product.priceString.trim());
}

export function createAppleIapController(options: AppleIapControllerOptions): AppleIapController {
  const { target, userId, post, onState } = options;
  const timeoutMs = options.timeoutMs ?? APPLE_IAP_TIMEOUT_MS;
  const scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
  const validUserId = userId !== null && Number.isSafeInteger(userId) && userId > 0 ? userId : null;
  let phase: "identifying" | "loading-products" | null = null;
  let timer: unknown = null;
  let isCleanedUp = false;
  let state = makeState(validUserId, "identifying", false);

  const publish = (nextState: AppleIapState) => {
    state = nextState;
    onState(nextState);
  };
  const clearTimer = () => {
    if (timer === null) return;
    scheduler.cancel(timer);
    timer = null;
  };
  const fail = (reason: AppleIapFailureReason, message?: unknown) => {
    if (isCleanedUp) return;
    clearTimer();
    phase = null;
    publish(makeState(validUserId, "error", state.identified, {}, {
      reason,
      ...(nativeMessage(message) ? { nativeMessage: nativeMessage(message) } : {}),
    }));
  };
  const beginIdentification = () => {
    if (isCleanedUp) return;
    clearTimer();
    if (validUserId === null) {
      phase = null;
      publish(makeState(null, "error", false, {}, { reason: "unauthenticated" }));
      return;
    }
    phase = "identifying";
    publish(makeState(validUserId, "identifying", false));
    timer = scheduler.schedule(() => fail("timeout"), timeoutMs);
    try {
      post({ type: "IAP_IDENTIFY", userId: validUserId });
    } catch (error) {
      fail("native", error instanceof Error ? error.message : undefined);
    }
  };

  const onIdentified: EventListener = (event) => {
    if (isCleanedUp || phase !== "identifying") return;
    const detail = readDetail(event);
    if (!detail || positiveUserId(detail.userId) !== validUserId) return;
    if (detail.ok !== true) {
      fail("native", detail.message);
      return;
    }
    clearTimer();
    phase = "loading-products";
    publish(makeState(validUserId, "loading-products", true));
    timer = scheduler.schedule(() => fail("timeout"), timeoutMs);
    try {
      post({ type: "IAP_GET_PRODUCTS" });
    } catch (error) {
      fail("native", error instanceof Error ? error.message : undefined);
    }
  };

  const onProducts: EventListener = (event) => {
    if (isCleanedUp || phase !== "loading-products") return;
    const result = parseProducts(readDetail(event));
    clearTimer();
    phase = null;
    if (result.reason) {
      publish(makeState(validUserId, "error", true, {}, { reason: result.reason }));
      return;
    }
    publish(makeState(validUserId, "ready", true, result.products));
  };

  const onError: EventListener = (event) => {
    if (isCleanedUp || phase === null) return;
    fail("native", readDetail(event)?.message);
  };

  const onLoggedOut: EventListener = () => {
    if (isCleanedUp) return;
    clearTimer();
    phase = null;
    publish(makeState(validUserId, "error", false, {}, { reason: "logged-out" }));
  };

  target.addEventListener("IAP_IDENTIFIED", onIdentified);
  target.addEventListener("IAP_PRODUCTS", onProducts);
  target.addEventListener("IAP_ERROR", onError);
  target.addEventListener("IAP_LOGGED_OUT", onLoggedOut);
  beginIdentification();

  return {
    retry: beginIdentification,
    cleanup() {
      if (isCleanedUp) return;
      isCleanedUp = true;
      clearTimer();
      phase = null;
      target.removeEventListener("IAP_IDENTIFIED", onIdentified);
      target.removeEventListener("IAP_PRODUCTS", onProducts);
      target.removeEventListener("IAP_ERROR", onError);
      target.removeEventListener("IAP_LOGGED_OUT", onLoggedOut);
    },
  };
}

export function emptyAppleIapState(userId: number | null): AppleIapState {
  return makeState(userId, "identifying", false);
}