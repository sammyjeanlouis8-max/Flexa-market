/** Preserve Flexa Wholesale browse context across Market chat round-trips. */

const KEY = "flexa_wholesale_nav_ctx_v1";
const CHAT_RETURN_KEY = "flexa_wholesale_chat_return_v1";

export type WholesaleNavContext = {
  /** Full path (+ search) to restore, e.g. /wholesale/products/1 */
  path: string;
  scrollY?: number;
  productId?: number;
  /** Catalog filters when leaving from /wholesale */
  q?: string;
  country?: string;
  category?: string;
  tab?: string;
  savedAt: number;
};

function isWholesalePath(path: string): boolean {
  return path === "/wholesale" || path.startsWith("/wholesale/");
}

export function saveWholesaleNavContext(
  partial: Omit<WholesaleNavContext, "savedAt"> & { savedAt?: number },
  opts?: { markChatReturn?: boolean },
): void {
  if (typeof window === "undefined") return;
  const path = partial.path.startsWith("/") ? partial.path : `/${partial.path}`;
  if (!isWholesalePath(path.split("?")[0] || path)) return;
  const ctx: WholesaleNavContext = {
    ...partial,
    path,
    savedAt: partial.savedAt ?? Date.now(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ctx));
    if (opts?.markChatReturn) {
      sessionStorage.setItem(CHAT_RETURN_KEY, path);
    }
  } catch {
    /* ignore quota */
  }
}

export function readWholesaleNavContext(): WholesaleNavContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const ctx = JSON.parse(raw) as WholesaleNavContext;
    if (!ctx?.path || !isWholesalePath(String(ctx.path).split("?")[0] || "")) return null;
    return ctx;
  } catch {
    return null;
  }
}

/** Path used when leaving chat back into Wholesale (in-app + hardware back). */
export function peekWholesaleChatReturn(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const path = sessionStorage.getItem(CHAT_RETURN_KEY);
    if (path && isWholesalePath(path.split("?")[0] || "")) return path;
    return null;
  } catch {
    return null;
  }
}

export function consumeWholesaleChatReturn(): string | null {
  const path = peekWholesaleChatReturn();
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(CHAT_RETURN_KEY);
    } catch {
      /* ignore */
    }
  }
  return path;
}

export function clearWholesaleChatReturn(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CHAT_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

/** Capture current wholesale page before opening Market chat. */
export function captureWholesalePageForChat(extra?: Partial<WholesaleNavContext>): WholesaleNavContext | null {
  if (typeof window === "undefined") return null;
  const path = `${window.location.pathname}${window.location.search || ""}`;
  if (!isWholesalePath(window.location.pathname)) return null;
  const ctx = {
    path,
    scrollY: window.scrollY || window.pageYOffset || 0,
    ...extra,
  };
  saveWholesaleNavContext(ctx, { markChatReturn: true });
  return { ...ctx, savedAt: Date.now() };
}

export function restoreWholesaleScroll(ctx: WholesaleNavContext | null | undefined): void {
  if (typeof window === "undefined" || ctx?.scrollY == null) return;
  const y = ctx.scrollY;
  requestAnimationFrame(() => {
    window.scrollTo(0, y);
    setTimeout(() => window.scrollTo(0, y), 50);
  });
}
