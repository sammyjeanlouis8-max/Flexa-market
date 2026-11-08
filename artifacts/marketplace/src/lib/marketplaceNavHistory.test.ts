import assert from "node:assert/strict";
import test from "node:test";

/**
 * Mirrors marketplaceNavHistory helpers for node:test without Vite path aliases.
 */

const STACK_KEY = "fm_marketplace_nav_stack";
const SCROLL_RESTORE_KEY = "fm_marketplace_scroll_restore";

type MarketplaceNavEntry = { path: string; scroll: number };

function normalizePath(path: string): string | null {
  if (!path || typeof path !== "string") return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return null;
  return trimmed.split("#")[0] || trimmed;
}

function isListingDetailPath(path: string, listingId?: number): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  const match = normalized.match(/^\/listings\/(\d+)(?:\/|$|\?)/);
  if (!match) return false;
  if (listingId != null) return Number(match[1]) === listingId;
  return true;
}

function isMarketplaceBrowsePath(path: string): boolean {
  const normalized = normalizePath(path);
  if (!normalized) return false;
  if (normalized.startsWith("/auth")) return false;
  if (normalized.startsWith("/api")) return false;
  return true;
}

function readStack(): MarketplaceNavEntry[] {
  const raw = sessionStorage.getItem(STACK_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((e) => e && typeof e.path === "string");
}

function writeStack(stack: MarketplaceNavEntry[]) {
  sessionStorage.setItem(STACK_KEY, JSON.stringify(stack));
}

function recordMarketplaceLocation(path: string, scrollTop = 0): void {
  const normalized = normalizePath(path);
  if (!normalized || !isMarketplaceBrowsePath(normalized)) return;
  const stack = readStack();
  const last = stack[stack.length - 1];
  if (last && last.path === normalized) {
    last.scroll = Math.max(0, scrollTop);
    writeStack(stack);
    return;
  }
  stack.push({ path: normalized, scroll: Math.max(0, scrollTop) });
  writeStack(stack);
}

function consumeMarketplaceBackPath(listingId: number): MarketplaceNavEntry | null {
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

function markScrollRestore(scrollTop: number): void {
  sessionStorage.setItem(SCROLL_RESTORE_KEY, String(Math.max(0, scrollTop)));
}

function takeScrollRestore(): number | null {
  const raw = sessionStorage.getItem(SCROLL_RESTORE_KEY);
  sessionStorage.removeItem(SCROLL_RESTORE_KEY);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

(globalThis as any).sessionStorage = new MemoryStorage();

test("isListingDetailPath detects listing routes", () => {
  assert.equal(isListingDetailPath("/listings/42"), true);
  assert.equal(isListingDetailPath("/listings/42?buy=1", 42), true);
  assert.equal(isListingDetailPath("/listings/42", 99), false);
  assert.equal(isListingDetailPath("/search?q=pad"), false);
});

test("isMarketplaceBrowsePath rejects auth/api", () => {
  assert.equal(isMarketplaceBrowsePath("/search?q=pad"), true);
  assert.equal(isMarketplaceBrowsePath("/"), true);
  assert.equal(isMarketplaceBrowsePath("/auth/login"), false);
  assert.equal(isMarketplaceBrowsePath("/api/listings/1"), false);
});

test("PDP back restores previous search filters and skips same listing loops", () => {
  sessionStorage.clear();
  recordMarketplaceLocation("/search?q=massage&category=health", 240);
  recordMarketplaceLocation("/listings/80", 0);
  const consumed = consumeMarketplaceBackPath(80);
  assert.equal(consumed?.path, "/search?q=massage&category=health");
  assert.equal(consumed?.scroll, 240);
  assert.equal(consumeMarketplaceBackPath(80), null);
});

test("related listing back returns to previous listing", () => {
  sessionStorage.clear();
  recordMarketplaceLocation("/", 0);
  recordMarketplaceLocation("/listings/10", 80);
  recordMarketplaceLocation("/listings/11", 0);
  const back = consumeMarketplaceBackPath(11);
  assert.equal(back?.path, "/listings/10");
  assert.equal(back?.scroll, 80);
});

test("after back, not re-recording the left listing prevents A↔B loops", () => {
  sessionStorage.clear();
  recordMarketplaceLocation("/", 0);
  recordMarketplaceLocation("/listings/10", 80);
  recordMarketplaceLocation("/listings/11", 0);
  const back = consumeMarketplaceBackPath(11);
  assert.equal(back?.path, "/listings/10");
  // Simulate App skip-flush on back: only seed destination
  recordMarketplaceLocation("/listings/10", back?.scroll ?? 0);
  const again = consumeMarketplaceBackPath(10);
  assert.equal(again?.path, "/");
});

test("scroll restore marker round-trips", () => {
  sessionStorage.clear();
  markScrollRestore(320);
  assert.equal(takeScrollRestore(), 320);
  assert.equal(takeScrollRestore(), null);
});
