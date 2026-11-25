import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessWholesale, WHOLESALE_PUBLIC_LAUNCH } from "./wholesaleAccess";

describe("canAccessWholesale", () => {
  it("keeps public launch disabled", () => {
    assert.equal(WHOLESALE_PUBLIC_LAUNCH, false);
  });

  it("allows Super Admins, Admins, and Moderators", () => {
    assert.equal(canAccessWholesale({ isSuperAdmin: true }), true);
    assert.equal(canAccessWholesale({ isAdmin: true }), true);
    assert.equal(canAccessWholesale({ isAdmin: true, role: "admin" }), true);
    assert.equal(canAccessWholesale({ role: "admin" }), true);
    assert.equal(canAccessWholesale({ role: "Admin" }), true);
    assert.equal(canAccessWholesale({ role: "moderator" }), true);
    assert.equal(canAccessWholesale({ role: "Moderator" }), true);
    assert.equal(canAccessWholesale({ role: "superadmin" }), true);
  });

  it("hides wholesale from regular users and support", () => {
    assert.equal(canAccessWholesale(null), false);
    assert.equal(canAccessWholesale(undefined), false);
    assert.equal(canAccessWholesale({}), false);
    assert.equal(canAccessWholesale({ role: "user" }), false);
    assert.equal(canAccessWholesale({ role: "support" }), false);
    assert.equal(canAccessWholesale({ isSuperAdmin: false, isAdmin: false }), false);
  });
});
