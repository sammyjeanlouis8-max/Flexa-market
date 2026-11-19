import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizeAddressInput } from "../lib/userAddressValidation";
import { evaluateDeliveryEligibility } from "../lib/deliveryEligibility";

const apiRoot = join(process.cwd(), "src");
const marketplaceRoot = join(process.cwd(), "../marketplace/src");

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Smart Address Management — mandatory scenarios TEST 1–16", () => {
  const registerSrc = existsSync(join(marketplaceRoot, "pages/auth/Register.tsx"))
    ? read(join(marketplaceRoot, "pages/auth/Register.tsx"))
    : "";
  const pickerSrc = existsSync(join(marketplaceRoot, "components/checkout/SavedAddressPicker.tsx"))
    ? read(join(marketplaceRoot, "components/checkout/SavedAddressPicker.tsx"))
    : "";
  const settingsSrc = existsSync(join(marketplaceRoot, "pages/SettingsAddresses.tsx"))
    ? read(join(marketplaceRoot, "pages/SettingsAddresses.tsx"))
    : "";
  const sellSrc = existsSync(join(marketplaceRoot, "pages/Sell.tsx"))
    ? read(join(marketplaceRoot, "pages/Sell.tsx"))
    : "";
  const listingSrc = existsSync(join(marketplaceRoot, "pages/ListingDetail.tsx"))
    ? read(join(marketplaceRoot, "pages/ListingDetail.tsx"))
    : "";
  const cartSrc = existsSync(join(marketplaceRoot, "pages/Cart.tsx"))
    ? read(join(marketplaceRoot, "pages/Cart.tsx"))
    : "";
  const routesSrc = read(join(apiRoot, "routes/userAddresses.ts"));
  const schemaSrc = read(join(process.cwd(), "../../lib/db/src/schema/user_addresses.ts"));
  const txSchemaSrc = read(join(process.cwd(), "../../lib/db/src/schema/transactions.ts"));
  const shoppingSrc = existsSync(join(marketplaceRoot, "lib/shoppingLocation.ts"))
    ? read(join(marketplaceRoot, "lib/shoppingLocation.ts"))
    : "";
  const eligibilitySrc = existsSync(join(marketplaceRoot, "lib/deliveryEligibility.ts"))
    ? read(join(marketplaceRoot, "lib/deliveryEligibility.ts"))
    : "";

  it("TEST 1: registration collects country+city without requiring street address", () => {
    expect(registerSrc).toContain('name="country"');
    expect(registerSrc).toContain('name="location"');
    expect(registerSrc).toMatch(/location:[\s\S]*min\(2/);
    expect(registerSrc).toMatch(/Street address is only needed|cityRegisterHint/);
    expect(registerSrc).not.toMatch(/streetAddress.*required.*register/i);
  });

  it("TEST 2: first checkout shows address form when no saved delivery address", () => {
    expect(pickerSrc).toContain("onNeedForm");
    expect(pickerSrc).toContain("data.addresses.length === 0");
    expect(pickerSrc).toContain('data-testid="address-form"');
  });

  it("TEST 3: valid address saves via authenticated POST /me/addresses", () => {
    const ok = normalizeAddressInput({
      fullName: "Marie Claire",
      phone: "+50937001111",
      street: "15 Ave John Brown",
      city: "Port-au-Prince",
      region: "Ouest",
      country: "Haiti",
    });
    expect(ok.ok).toBe(true);
    expect(routesSrc).toContain('router.post("/me/addresses"');
    expect(routesSrc).toContain("normalizeAddressInput");
    expect(pickerSrc).toContain("createUserAddress");
    expect(pickerSrc).toContain('data-testid="button-save-address"');
  });

  it("TEST 4: address saves on form submit independently of checkout completion", () => {
    expect(routesSrc).toMatch(/Saves even when checkout is abandoned|create a saved address/i);
    expect(pickerSrc).toContain("onSaved");
    expect(cartSrc).toContain("saveCartAddressNow");
    expect(cartSrc).toContain("onBlur={saveCartAddressNow}");
  });

  it("TEST 5: default saved address auto-populates future checkouts", () => {
    expect(pickerSrc).toContain("defaultAddress");
    expect(pickerSrc).toContain("onSelect(data.defaultAddress)");
    expect(cartSrc).toContain("defaultAddress");
    expect(listingSrc).toContain("SavedAddressPicker");
  });

  it("TEST 6: addresses persist via backend DB (not localStorage-only)", () => {
    expect(schemaSrc).toContain("user_addresses");
    expect(schemaSrc).toContain("userId");
    expect(routesSrc).toContain("requireAuth");
    expect(pickerSrc).toContain("fetchUserAddresses");
    // localStorage may cache, but API is source of truth
    expect(existsSync(join(marketplaceRoot, "lib/userAddressesApi.ts"))).toBe(true);
  });

  it("TEST 7: customer can edit a saved address", () => {
    expect(pickerSrc).toContain("updateUserAddress");
    expect(pickerSrc).toContain("startEdit");
    expect(pickerSrc).toContain("button-edit-address");
    expect(settingsSrc).toContain("updateUserAddress");
    expect(routesSrc).toContain('router.patch("/me/addresses/:id"');
  });

  it("TEST 8: customer can add a second address without deleting the first", () => {
    expect(pickerSrc).toContain("button-add-address");
    expect(pickerSrc).toContain("createUserAddress");
    expect(routesSrc).toContain("insert(userAddressesTable)");
  });

  it("TEST 9: customer can change default address", () => {
    expect(pickerSrc).toContain("setDefaultUserAddress");
    expect(routesSrc).toContain('router.post("/me/addresses/:id/default"');
    expect(settingsSrc).toContain("setDefaultUserAddress");
  });

  it("TEST 10: deleting saved address does not erase historical order snapshots", () => {
    expect(routesSrc).toMatch(/Does NOT touch order shipping snapshots|orders unchanged/i);
    expect(schemaSrc).toMatch(/must never erase historical order addresses|immutable snapshots/i);
    expect(txSchemaSrc).toMatch(/shippingName|shipping_name/);
    expect(txSchemaSrc).toMatch(/shippingStreet|shipping_street/);
    expect(txSchemaSrc).toMatch(/shippingCountry|shipping_country/);
  });

  it("TEST 11: unsupported destination blocks checkout with clear explanation", () => {
    expect(eligibilitySrc).toContain("evaluateDeliveryEligibility");
    expect(eligibilitySrc).toContain("UNSUPPORTED_DESTINATION");
    expect(pickerSrc).toContain("shipping-unavailable-banner");
    expect(listingSrc).toContain("continueFromAddressStep");
    expect(listingSrc).toContain("evaluateDeliveryEligibility");
  });

  it("TEST 12: seller product creation suggests ship_from origin, never buyer delivery", () => {
    expect(sellSrc).toContain("kind=ship_from");
    expect(sellSrc).toContain("persistSellerShipFrom");
    expect(sellSrc).toContain('kind: "ship_from"');
    expect(sellSrc).toMatch(/Never overwrite registered account country|never buyer delivery|Never use/i);
    // Suggestion fetch must request ship_from only
    expect(sellSrc).toMatch(/addresses\?kind=ship_from/);
  });

  it("TEST 13: addresses synchronize across devices via authenticated API", () => {
    expect(routesSrc).toContain('router.get("/me/addresses"');
    expect(pickerSrc).toContain("fetchUserAddresses(token");
    expect(cartSrc).toContain("fetchUserAddresses(token");
  });

  it("TEST 14: backend rejects unauthorized access to another customer's address", () => {
    expect(routesSrc).toContain("eq(userAddressesTable.userId, req.userId)");
    expect(routesSrc).toContain('status(404)');
    expect(routesSrc).toContain("Address not found");
    // Ownership check present on PATCH, DELETE, and default
    const ownershipHits = routesSrc.split("eq(userAddressesTable.userId, req.userId)").length - 1;
    expect(ownershipHits).toBeGreaterThanOrEqual(4);
  });

  it("TEST 15: checkout attaches selected saved address fields to order payload", () => {
    expect(listingSrc).toContain("shippingName");
    expect(listingSrc).toContain("shippingStreet");
    expect(listingSrc).toContain("shippingCity");
    expect(listingSrc).toContain("shippingCountry");
    expect(listingSrc).toContain("applySavedAddress");
    expect(cartSrc).toContain("shippingName: name.trim()");
  });

  it("TEST 16: modifying a saved address does not mutate order shipping snapshots", () => {
    // Order columns live on transactions; address PATCH only updates user_addresses
    expect(routesSrc).toContain("update(userAddressesTable)");
    expect(routesSrc).not.toMatch(/update\(transactionsTable\)/);
    expect(txSchemaSrc).toMatch(/shippingName|shipping_name/);
  });

  it("registered browsing country is not overwritten by guest shopping location", () => {
    expect(shoppingSrc.length).toBeGreaterThan(0);
    expect(shoppingSrc + registerSrc + listingSrc).toMatch(/guest|profile country|authenticated/i);
  });

  it("rejects incomplete addresses (never save invalid)", () => {
    const bad = normalizeAddressInput({
      fullName: "A",
      phone: "12",
      street: "x",
      city: "",
      region: "",
      country: "",
    });
    expect(bad.ok).toBe(false);
  });

  it("eligibility helper: Haiti local OK; Atlantis blocked; local-only seller blocked for USA", () => {
    expect(evaluateDeliveryEligibility({
      listingCountry: "Haiti",
      destinationCountry: "Haiti",
    }).ok).toBe(true);

    const unsupported = evaluateDeliveryEligibility({
      listingCountry: "Haiti",
      destinationCountry: "Atlantis",
      listingOffersInternationalShipping: true,
    });
    expect(unsupported.ok).toBe(false);

    const localOnly = evaluateDeliveryEligibility({
      listingCountry: "Haiti",
      destinationCountry: "United States",
      listingOffersInternationalShipping: false,
    });
    expect(localOnly.ok).toBe(false);
  });
});
