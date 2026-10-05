import assert from "node:assert/strict";
import { test } from "node:test";
import { canShowFMDeliveryLinks } from "./delivery-navigation";

test("FM driver navigation is visible only for Haiti", () => {
  assert.equal(canShowFMDeliveryLinks("Haiti"), true);
  for (const country of ["Dominican Republic", "United States", "", null, undefined]) {
    assert.equal(canShowFMDeliveryLinks(country), false, `Must hide FM links for ${country}`);
  }
});
