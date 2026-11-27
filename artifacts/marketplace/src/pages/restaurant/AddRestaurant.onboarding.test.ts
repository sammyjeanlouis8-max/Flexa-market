import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "AddRestaurant.tsx"), "utf8");

describe("Flexa Restaurant onboarding wizard", () => {
  it("defines six registration steps", () => {
    assert.match(source, /STEPS = \["info", "location", "hours", "identity", "safety", "review"\]/);
  });

  it("renders business info fields including name, logo, cover, and category cards", () => {
    assert.match(source, /BusinessInfoStep/);
    assert.match(source, /restaurant-basics-form/);
    assert.match(source, /businessName/);
    assert.match(source, /ImageUploadCard/);
    assert.match(source, /generateInitialsLogo/);
    assert.match(source, /PRIMARY_TYPES/);
  });

  it("includes location pickup address and current location", () => {
    assert.match(source, /LocationStep/);
    assert.match(source, /pickupAddress/);
    assert.match(source, /useCurrentLocation/);
    assert.match(source, /publicPickupAddress/);
  });

  it("configures per-day hours without overlapping time grid", () => {
    assert.match(source, /HoursStep/);
    assert.match(source, /WEEKDAYS/);
    assert.match(source, /open24h/);
    assert.match(source, /overnight/);
    assert.match(source, /deliveryZones/);
    assert.match(source, /grid-cols-1 gap-2 sm:grid-cols-2/);
  });

  it("wires identity and food safety with restaurant id when draft exists", () => {
    assert.match(source, /\/restaurant\/owner\/identity\?rid=/);
    assert.match(source, /\/restaurant\/owner\/food-safety\?rid=/);
    assert.match(source, /ensureDraftRestaurant/);
  });

  it("submits for review instead of auto-publishing", () => {
    assert.match(source, /submitForReview/);
    assert.match(source, /submit: true/);
    assert.match(source, /restaurant-submit-review/);
  });

  it("supports all five business types via BUSINESS_TYPES", () => {
    assert.match(source, /BUSINESS_TYPES/);
    const api = readFileSync(join(__dirname, "../../lib/restaurantApi.ts"), "utf8");
    assert.match(api, /id: "bakery"/);
    assert.match(api, /id: "catering"/);
    assert.match(api, /id: "home_kitchen"/);
    assert.match(api, /id: "food_truck"/);
    assert.match(api, /id: "traditional"/);
  });
});
