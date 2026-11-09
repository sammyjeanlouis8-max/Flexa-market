import { describe, expect, it } from "vitest";
import { normalizeAddressInput } from "../lib/userAddressValidation";

describe("normalizeAddressInput", () => {
  it("accepts a complete Haiti delivery address without postal code", () => {
    const result = normalizeAddressInput({
      fullName: "Jean Pierre",
      phone: "+50937001234",
      street: "12 Rue des Miracles",
      city: "Port-au-Prince",
      region: "Ouest",
      country: "Haiti",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("delivery");
      expect(result.value.isDefault).toBe(true);
      expect(result.value.postalCode).toBeNull();
    }
  });

  it("requires postal code for USA", () => {
    const result = normalizeAddressInput({
      fullName: "Jane Doe",
      phone: "+12025550123",
      street: "1600 Pennsylvania Ave",
      city: "Washington",
      region: "DC",
      country: "USA",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects incomplete street", () => {
    const result = normalizeAddressInput({
      fullName: "Jean",
      phone: "50937001234",
      street: "ab",
      city: "Cap-Haitien",
      region: "Nord",
      country: "Haiti",
    });
    expect(result.ok).toBe(false);
  });

  it("supports ship_from kind for seller origin", () => {
    const result = normalizeAddressInput({
      kind: "ship_from",
      fullName: "Seller Shop",
      phone: "50937009999",
      street: "Depot Road 1",
      city: "Petion-Ville",
      region: "Ouest",
      country: "Haiti",
      label: "Warehouse",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("ship_from");
      expect(result.value.label).toBe("Warehouse");
    }
  });
});
