import { describe, expect, it } from "vitest";
import {
  HAITI_DEPARTMENT_NAMES,
  HAITI_COMMUNES_BY_DEPARTMENT,
  getCommuneMatchTokensForDepartment,
  isValidHaitiDepartment,
  isValidHaitiCommune,
  parseWorkZonesJson,
  validateWorkZones,
} from "../lib/haitiGeography";

describe("haitiGeography", () => {
  it("covers all 10 departments", () => {
    expect(HAITI_DEPARTMENT_NAMES).toHaveLength(10);
    for (const dep of HAITI_DEPARTMENT_NAMES) {
      expect(HAITI_COMMUNES_BY_DEPARTMENT[dep].length).toBeGreaterThan(0);
    }
  });

  it("includes Nord-Est, Nord-Ouest, and Nippes", () => {
    expect(isValidHaitiDepartment("Nord-Est")).toBe(true);
    expect(isValidHaitiDepartment("Nord-Ouest")).toBe(true);
    expect(isValidHaitiDepartment("Nippes")).toBe(true);
    expect(isValidHaitiCommune("Ouest", "Delmas")).toBe(true);
    expect(isValidHaitiCommune("Nippes", "Miragoâne")).toBe(true);
  });

  it("validates multi-commune work zones", () => {
    const ok = validateWorkZones({
      department: "Ouest",
      communes: ["Delmas", "Pétion-Ville", "Tabarre"],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.communes).toEqual(["Delmas", "Pétion-Ville", "Tabarre"]);
    }

    const bad = validateWorkZones({
      department: "Ouest",
      communes: ["Cap-Haïtien"],
    });
    expect(bad.ok).toBe(false);
  });

  it("builds match tokens for department filtering", () => {
    const tokens = getCommuneMatchTokensForDepartment("Ouest");
    expect(tokens.some((t) => t.includes("delmas"))).toBe(true);
    expect(tokens.some((t) => t.includes("port"))).toBe(true);
  });

  it("parses work zone JSON", () => {
    expect(parseWorkZonesJson('["Delmas","Tabarre"]')).toEqual(["Delmas", "Tabarre"]);
    expect(parseWorkZonesJson("not-json")).toEqual([]);
  });
});
