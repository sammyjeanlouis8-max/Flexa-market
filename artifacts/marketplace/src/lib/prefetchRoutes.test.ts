import assert from "node:assert/strict";
import test from "node:test";

function normalizePath(href: string): string {
  const path = href.split("?")[0] || "/";
  if (path.startsWith("/listings/") && !path.endsWith("/video")) {
    return "/listings/:id";
  }
  if (path.startsWith("/messages/")) return "/messages";
  if (path.startsWith("/orders/") && path !== "/orders") return "/orders";
  if (path.startsWith("/admin")) return "/admin";
  if (path.startsWith("/settings")) return "/settings";
  if (path.startsWith("/music")) return "/music";
  if (path.startsWith("/tv")) return "/tv";
  if (path.startsWith("/wallet")) return "/wallet";
  return path;
}

test("normalizePath collapses detail routes for prefetch keys", () => {
  assert.equal(normalizePath("/listings/42"), "/listings/:id");
  assert.equal(normalizePath("/messages/9"), "/messages");
  assert.equal(normalizePath("/admin?tab=moderation"), "/admin");
  assert.equal(normalizePath("/search"), "/search");
});
