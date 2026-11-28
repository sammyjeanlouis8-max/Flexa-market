import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canAccessWholesale, WHOLESALE_PUBLIC_LAUNCH } from "./wholesaleAccess";

describe("canAccessWholesale", () => {
  it("enables public launch for everyone including guests", () => {
    assert.equal(WHOLESALE_PUBLIC_LAUNCH, true);
    assert.equal(canAccessWholesale(null), true);
    assert.equal(canAccessWholesale(undefined), true);
    assert.equal(canAccessWholesale({}), true);
    assert.equal(canAccessWholesale({ role: "user" }), true);
    assert.equal(canAccessWholesale({ role: "support" }), true);
  });

  it("still allows Super Admins, Admins, and Moderators", () => {
    assert.equal(canAccessWholesale({ isSuperAdmin: true }), true);
    assert.equal(canAccessWholesale({ isAdmin: true }), true);
    assert.equal(canAccessWholesale({ role: "admin" }), true);
    assert.equal(canAccessWholesale({ role: "moderator" }), true);
    assert.equal(canAccessWholesale({ role: "superadmin" }), true);
  });
});
