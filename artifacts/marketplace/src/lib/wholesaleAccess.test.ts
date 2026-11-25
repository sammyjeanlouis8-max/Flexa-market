import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessWholesale, WHOLESALE_PUBLIC_LAUNCH } from "./wholesaleAccess";

describe("canAccessWholesale", () => {
  it("keeps public launch disabled", () => {
    assert.equal(WHOLESALE_PUBLIC_LAUNCH, false);
  });

  it("allows authenticated Super Admins only", () => {
    assert.equal(canAccessWholesale({ isSuperAdmin: true }), true);
    assert.equal(canAccessWholesale({ isSuperAdmin: true, isAdmin: true, role: "superadmin" }), true);
    assert.equal(canAccessWholesale({ role: "superadmin" }), true);
  });

  it("hides wholesale from everyone else", () => {
    assert.equal(canAccessWholesale(null), false);
    assert.equal(canAccessWholesale(undefined), false);
    assert.equal(canAccessWholesale({}), false);
    assert.equal(canAccessWholesale({ isAdmin: true }), false);
    assert.equal(canAccessWholesale({ isAdmin: true, role: "admin" }), false);
    assert.equal(canAccessWholesale({ role: "moderator" }), false);
    assert.equal(canAccessWholesale({ role: "user" }), false);
    assert.equal(canAccessWholesale({ isSuperAdmin: false, isAdmin: true }), false);
  });
});
