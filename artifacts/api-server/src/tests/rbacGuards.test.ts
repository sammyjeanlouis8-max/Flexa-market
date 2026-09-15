import { describe, expect, it } from "vitest";
import {
  getRole,
  hasFinanceAdminAccess,
  hasRole,
  isAdminAccessSuspended,
} from "../middlewares/auth";
import { listingInAdminScope, userInAdminScope } from "../lib/adminScope";

const baseUser = {
  id: 1,
  role: "user",
  isAdmin: false,
  isSuperAdmin: false,
  isAdminSuspended: false,
  adminSuspendedUntil: null,
  adminScopeCountry: null,
  adminScopeCountries: null,
  adminScopeDepartment: null,
  adminScopeCity: null,
  country: "Haiti",
  location: "Delmas",
} as any;

describe("canonical staff authorization", () => {
  it("does not promote a legacy moderator with isAdmin=true", () => {
    const moderator = { ...baseUser, role: "moderator", isAdmin: true };

    expect(getRole(moderator)).toBe("moderator");
    expect(hasRole(moderator, "moderator")).toBe(true);
    expect(hasRole(moderator, "admin")).toBe(false);
    expect(hasFinanceAdminAccess(moderator)).toBe(false);
  });

  it("does not promote an explicit moderator with a stale isSuperAdmin flag", () => {
    const moderator = { ...baseUser, role: "moderator", isAdmin: true, isSuperAdmin: true };

    expect(getRole(moderator)).toBe("moderator");
    expect(hasRole(moderator, "admin")).toBe(false);
    expect(hasFinanceAdminAccess(moderator)).toBe(false);
  });

  it("recognizes active and expired admin suspensions", () => {
    const active = {
      ...baseUser,
      role: "moderator",
      isAdminSuspended: true,
      adminSuspendedUntil: new Date(Date.now() + 60_000),
    };
    const expired = {
      ...active,
      adminSuspendedUntil: new Date(Date.now() - 60_000),
    };

    expect(isAdminAccessSuspended(active)).toBe(true);
    expect(isAdminAccessSuspended(expired)).toBe(false);
  });

  it("keeps canonical finance admins and superadmins authorized", () => {
    expect(hasFinanceAdminAccess({ ...baseUser, role: "admin", isAdmin: true })).toBe(true);
    expect(hasFinanceAdminAccess({ ...baseUser, role: "superadmin", isSuperAdmin: true })).toBe(true);
  });
});

describe("moderator geographic scope", () => {
  it("enforces a city scope", () => {
    const admin = { ...baseUser, role: "moderator", adminScopeCountry: "Haiti", adminScopeCity: "Delmas" };

    expect(userInAdminScope(admin, { ...baseUser, location: "Delmas" })).toBe(true);
    expect(userInAdminScope(admin, { ...baseUser, location: "Pétion-Ville" })).toBe(false);
  });

  it("enforces a mapped department scope", () => {
    const admin = { ...baseUser, role: "moderator", adminScopeCountry: "Haiti", adminScopeDepartment: "Ouest" };

    expect(userInAdminScope(admin, { ...baseUser, location: "Port-au-Prince" })).toBe(true);
    expect(userInAdminScope(admin, { ...baseUser, location: "Cap-Haïtien" })).toBe(false);
  });

  it("fails closed when a department has no configured city mapping", () => {
    const admin = { ...baseUser, role: "moderator", adminScopeCountry: "Haiti", adminScopeDepartment: "Centre" };

    expect(userInAdminScope(admin, { ...baseUser, location: "Mirebalais" })).toBe(false);
  });

  it("applies city scope even when multiple countries are configured", () => {
    const admin = {
      ...baseUser,
      role: "moderator",
      adminScopeCountries: JSON.stringify(["Haiti", "USA"]),
      adminScopeCity: "Delmas",
    };

    expect(userInAdminScope(admin, { ...baseUser, country: "Haiti", location: "Delmas" })).toBe(true);
    expect(userInAdminScope(admin, { ...baseUser, country: "USA", location: "New York, NY" })).toBe(false);
  });
});

describe("listing geographic scope", () => {
  it("honors JSON countries and a mapped department", () => {
    const admin = {
      ...baseUser,
      role: "admin",
      adminScopeCountries: JSON.stringify(["Haiti", "USA"]),
      adminScopeDepartment: "Ouest",
    };

    expect(listingInAdminScope(admin, { country: "Haiti", city: "Delmas" })).toBe(true);
    expect(listingInAdminScope(admin, { country: "USA", city: "New York, NY" })).toBe(false);
    expect(listingInAdminScope(admin, { country: "Dominican Republic", city: "Delmas" })).toBe(false);
  });

  it("allows a super admin globally and hides an out-of-scope detail", () => {
    const scoped = { ...baseUser, role: "admin", adminScopeCountry: "Haiti", adminScopeCity: "Delmas" };
    const superAdmin = { ...baseUser, role: "superadmin", isSuperAdmin: true };

    expect(listingInAdminScope(scoped, { country: "Haiti", city: "Pétion-Ville" })).toBe(false);
    expect(listingInAdminScope(superAdmin, { country: "USA", city: "Chicago, IL" })).toBe(true);
  });

  it("fails closed when an admin has no assigned or profile country", () => {
    const unscoped = {
      ...baseUser,
      role: "admin",
      country: null,
      adminScopeCountry: null,
      adminScopeCountries: null,
    };

    expect(userInAdminScope(unscoped, { ...baseUser, country: "Haiti" })).toBe(false);
    expect(listingInAdminScope(unscoped, { country: "Haiti", city: "Delmas" })).toBe(false);
  });
});