import { describe, expect, it } from "vitest";
import {
  buildAdminVideoFeedParams,
  canAdminSelectAllCountries,
  isGlobalCountryAdmin,
  isMultiCountryAdmin,
  parseAdminScopeCountriesList,
  resolveEffectiveAdminCountry,
  shouldShowAdminCountryFlags,
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

  it("builds feed params for All vs specific country", () => {
    const sa = { isAdmin: true, isSuperAdmin: true, role: "superadmin" };
    expect(buildAdminVideoFeedParams(sa, null)).toEqual({ allCountries: "1" });
    expect(buildAdminVideoFeedParams(sa, "Dominican Republic")).toEqual({
      country: "Dominican Republic",
    });

    const multi = {
      isAdmin: true,
      isSuperAdmin: false,
      adminScopeCountries: JSON.stringify(["Haiti", "Dominican Republic"]),
    };
    expect(isMultiCountryAdmin(multi)).toBe(true);
    expect(canAdminSelectAllCountries(multi)).toBe(true);
    expect(resolveEffectiveAdminCountry(multi, null)).toBeNull();
    expect(resolveEffectiveAdminCountry(multi, "Haiti")).toBe("Haiti");
    expect(buildAdminVideoFeedParams(multi, null)).toEqual({});
    expect(buildAdminVideoFeedParams(multi, "Haiti")).toEqual({ country: "Haiti" });
    expect(shouldShowAdminCountryFlags(multi, null)).toBe(true);
    expect(shouldShowAdminCountryFlags(multi, "Haiti")).toBe(false);
  });
});
