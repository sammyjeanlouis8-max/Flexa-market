import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultSellForm,
  validateSellForm,
  carriersForCountry,
  defaultDeliveryForCountry,
} from "../lib/sellValidation.ts";

describe("validateSellForm", () => {
  it("requires title, description, price, category, location, photos, country", () => {
    const errors = validateSellForm(defaultSellForm(), { imageCount: 0, country: null });
    assert.ok(errors.title);
    assert.ok(errors.description);
    assert.ok(errors.price);
    assert.ok(errors.categoryId);
    assert.ok(errors.location);
    assert.ok(errors.images);
    assert.ok(errors.country);
  });

  it("accepts a minimal valid create payload", () => {
    const form = {
      ...defaultSellForm(),
      title: "Blue jeans",
      description: "Gently used denim jeans size 32",
      price: "25",
      categoryId: 1,
      location: "Port-au-Prince",
      city: "Port-au-Prince",
    };
    const errors = validateSellForm(form, { imageCount: 1, country: "Haiti" });
    assert.deepEqual(errors, {});
  });
});

describe("sell helpers", () => {
  it("returns Haiti motorcycle default delivery", () => {
    assert.equal(defaultDeliveryForCountry("Haiti"), "motorcycle");
  });
  it("returns DR carriers list", () => {
    assert.ok(carriersForCountry("Dominican Republic").includes("Vimenpaq"));
  });
});
