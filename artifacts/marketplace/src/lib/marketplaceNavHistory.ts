/**
 * SPA-friendly marketplace back navigation for the product details page.
 * Tracks browse paths (search filters, categories, profiles, videos, home)
 * with scroll offsets so PDP "Back" can restore context without loops.
 */

const STACK_KEY = "fm_marketplace_nav_stack";
const SCROLL_RESTORE_KEY = "fm_marketplace_scroll_restore";
const BACK_NAV_KEY = "fm_marketplace_back_nav";
const MAX_STACK = 40;

export type MarketplaceNavEntry = {
  path: string;
  scroll: number;
};

function normalizePath(path: string): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return null;
  // Strip hash; keep query string (filters / sort / search).
  const noHash = trimmed.split("#")[0] || trimmed;
  return noHash || null;
}

export function isListingDetailPath(path: string, listingId?: number): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  const match = normalized.match(/^\/listings\/(\d+)(?:\/|$|\?)/);
  if (!match) return false;
  if (listingId != null) return Number(match[1]) === listingId;
  return true;
}

/** Paths that are safe marketplace destinations for PDP Back. */
export function isMarketplaceBrowsePath(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  if (normalized.startsWith("/auth")) return false;
  if (normalized.startsWith("/api")) return false;
  // Stay inside the SPA marketplace surface.
  return true;
}

function readStack(): MarketplaceNavEntry[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const path = normalizePath((entry as MarketplaceNavEntry).path);
        if (!path || !isMarketplaceBrowsePath(path)) return null;
        const scroll = Number((entry as MarketplaceNavEntry).scroll);
        return {
          path,
          scroll: Number.isFinite(scroll) && scroll > 0 ? scroll : 0,
        } satisfies MarketplaceNavEntry;
      })
      .filter((entry): entry is MarketplaceNavEntry => !!entry);
  } catch {
    return [];
  }
}

function writeStack(stack: MarketplaceNavEntry[]) {
  try {
    sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_STACK)));
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Record a marketplace path the user visited (including other PDPs). */
export function recordMarketplaceLocation(path: string, scrollTop = 0): void {
  const normalized = normalizePath(path);
  if (!normalized || !isMarketplaceBrowsePath(normalized)) return;

  const stack = readStack();
  const last = stack[stack.length - 1];
  if (last && last.path === normalized) {
    last.scroll = Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : last.scroll;
    writeStack(stack);
    return;
  }
  stack.push({
    path: normalized,
    scroll: Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0,
  });
  writeStack(stack);
}

/** Peek a safe back target that is not the current listing (avoids loops). */
export function peekMarketplaceBackPath(listingId: number): MarketplaceNavEntry | null {
  const stack = readStack();
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    const entry = stack[i];
    if (!entry) continue;
    if (!isMarketplaceBrowsePath(entry.path)) continue;
    if (isListingDetailPath(entry.path, listingId)) continue;
    return entry;
  }
  return null;
}

/** Consume (pop through) entries until a usable back target is found. */
export function consumeMarketplaceBackPath(listingId: number): MarketplaceNavEntry | null {
  const stack = readStack();
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (!isMarketplaceBrowsePath(entry.path)) continue;
    if (isListingDetailPath(entry.path, listingId)) continue;
    writeStack(stack);
    return entry;
  }
  writeStack(stack);
  return null;
}

export function markScrollRestore(scrollTop: number): void {
  try {
    sessionStorage.setItem(
      SCROLL_RESTORE_KEY,
      String(Math.max(0, Number.isFinite(scrollTop) ? scrollTop : 0)),
    );
  } catch {
    /* ignore */
  }
}

export function takeScrollRestore(): number | null {
  try {
    const raw = sessionStorage.getItem(SCROLL_RESTORE_KEY);
    sessionStorage.removeItem(SCROLL_RESTORE_KEY);
    if (raw == null) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 0 ? value : null;
  } catch {
    return null;
  }
}

/** Mark the next route change as a PDP Back so we do not re-stack the left page. */
export function markBackNavigation(): void {
  try {
    sessionStorage.setItem(BACK_NAV_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function takeBackNavigation(): boolean {
  try {
    const raw = sessionStorage.getItem(BACK_NAV_KEY);
    sessionStorage.removeItem(BACK_NAV_KEY);
    return raw === "1";
  } catch {
    return false;
  }
}
