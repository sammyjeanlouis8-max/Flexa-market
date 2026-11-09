import { describe, expect, it } from "vitest";
import {
  isGlobalCountryAdmin,
  parseAdminScopeCountriesList,
} from "../../../marketplace/src/lib/adminCountryAccess";

describe("marketplace adminCountryAccess helpers", () => {
  it("parses single and multi-country assignments", () => {
    expect(parseAdminScopeCountriesList({
      isAdmin: true,
      adminScopeCountry: "Haiti",
    })).toEqual(["Haiti"]);

    expect(parseAdminScopeCountriesList({
      isAdmin: true,
      adminScopeCountries: JSON.stringify(["Haiti", "USA", "Canada"]),
    })).toEqual(["Haiti", "USA", "Canada"]);
  });

  it("treats null scope as global-country admin without Super Admin", () => {
    const globalAdmin = {
      isAdmin: true,
      isSuperAdmin: false,
      adminScopeCountry: null,
      adminScopeCountries: null,
    };
    expect(isGlobalCountryAdmin(globalAdmin)).toBe(true);
    expect(parseAdminScopeCountriesList(globalAdmin)).toEqual([]);
  });

  it("never marks Super Admin as global-country admin", () => {
    expect(isGlobalCountryAdmin({
      isAdmin: true,
      isSuperAdmin: true,
      adminScopeCountry: null,
    })).toBe(false);
  });

  it("keeps city/department admins out of global scope", () => {
    expect(isGlobalCountryAdmin({
      isAdmin: true,
      isSuperAdmin: false,
      adminScopeCountry: "Haiti",
      adminScopeDepartment: "Ouest",
    })).toBe(false);
  });
});
