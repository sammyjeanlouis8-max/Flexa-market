import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  shouldWireGoogleServicesFile,
  validateGoogleServicesForTarget,
} from "../lib/firebaseAndroidConfig.ts";

describe("firebaseAndroidConfig", () => {
  it("blocks wiring when only suspended package is present", () => {
    const v = validateGoogleServicesForTarget({
      project_info: { project_id: "flexa-market-8873a" },
      client: [
        { client_info: { android_client_info: { package_name: "com.flexa.market" } } },
      ],
    });
    assert.equal(v.ok, false);
    assert.equal(v.canWireGoogleServicesFile, false);
    assert.equal(v.hasLegacyPackageOnly, true);
    assert.equal(shouldWireGoogleServicesFile("com.flexamarket.app", {
      project_info: { project_id: "flexa-market-8873a" },
      client: [
        { client_info: { android_client_info: { package_name: "com.flexa.market" } } },
      ],
    }), false);
  });

  it("allows wiring when target package is present", () => {
    const json = {
      project_info: { project_id: "flexa-market-8873a" },
      client: [
        { client_info: { android_client_info: { package_name: "com.flexa.market" } } },
        { client_info: { android_client_info: { package_name: "com.flexamarket.app" } } },
      ],
    };
    const v = validateGoogleServicesForTarget(json);
    assert.equal(v.ok, true);
    assert.equal(v.canWireGoogleServicesFile, true);
    assert.equal(shouldWireGoogleServicesFile("com.flexamarket.app", json), true);
  });
});
