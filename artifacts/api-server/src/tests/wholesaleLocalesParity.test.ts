import { describe, expect, it } from "vitest";
import {
  wholesaleEn,
  wholesaleEs,
  wholesaleFr,
  wholesaleHt,
} from "../../../marketplace/src/i18n/wholesaleLocales";

describe("wholesale locale parity", () => {
  it("keeps identical keys across en/fr/ht/es", () => {
    const enKeys = Object.keys(wholesaleEn).sort();
    expect(Object.keys(wholesaleHt).sort()).toEqual(enKeys);
    expect(Object.keys(wholesaleFr).sort()).toEqual(enKeys);
    expect(Object.keys(wholesaleEs).sort()).toEqual(enKeys);
  });

  it("has non-empty values for core chrome keys", () => {
    for (const pack of [wholesaleEn, wholesaleHt, wholesaleFr, wholesaleEs]) {
      expect(pack.tabCatalog.length).toBeGreaterThan(0);
      expect(pack.tabSeller.length).toBeGreaterThan(0);
      expect(pack.contactSeller.length).toBeGreaterThan(0);
      expect(pack.adminTitle.length).toBeGreaterThan(0);
    }
  });
});
