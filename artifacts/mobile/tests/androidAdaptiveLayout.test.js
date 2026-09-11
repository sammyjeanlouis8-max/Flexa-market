"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { applyAdaptiveLayout } = require("../plugins/withAndroidAdaptiveLayout");
const app = require("../app.json").expo;

function fixture() {
  return {
    "uses-permission": [{ $: { "android:name": "android.permission.CAMERA" } }],
    application: [{
      activity: [{
        $: {
          "android:name": ".MainActivity",
          "android:screenOrientation": "portrait",
          "android:resizeableActivity": "false",
          "android:maxAspectRatio": "1.8",
          "android:minAspectRatio": "1.2",
          "android:windowSoftInputMode": "adjustResize",
          "android:configChanges": "keyboard|keyboardHidden|orientation|screenSize",
        },
        "intent-filter": [{
          action: [{ $: { "android:name": "android.intent.action.MAIN" } }],
          category: [{ $: { "android:name": "android.intent.category.LAUNCHER" } }],
        }],
      }, { $: { "android:name": "ThirdPartyActivity", "android:screenOrientation": "portrait" } }],
    }],
  };
}

test("Android launcher rotates and resizes without changing keyboard, lifecycle, other activities or permissions", () => {
  const manifest = fixture();
  const result = applyAdaptiveLayout(manifest);
  const activity = result.application[0].activity[0].$;
  assert.equal(activity["android:screenOrientation"], "unspecified");
  assert.equal(activity["android:resizeableActivity"], "true");
  assert.equal(activity["android:maxAspectRatio"], undefined);
  assert.equal(activity["android:minAspectRatio"], undefined);
  assert.equal(activity["android:windowSoftInputMode"], "adjustResize");
  assert.equal(activity["android:configChanges"], "keyboard|keyboardHidden|orientation|screenSize");
  assert.equal(result.application[0].activity[1].$["android:screenOrientation"], "portrait");
  assert.deepEqual(result["uses-permission"], fixture()["uses-permission"]);
  assert.deepEqual(applyAdaptiveLayout(result), result);
});

test("missing launcher is an explicit build error, not a silent ineffective patch", () => {
  assert.throws(() => applyAdaptiveLayout({ application: [{ activity: [] }] }), /launcher activity is missing/);
});

test("plugin is registered last and iOS orientation is unchanged", () => {
  assert.equal(app.plugins.at(-1), "./plugins/withAndroidAdaptiveLayout.js");
  assert.equal(app.orientation, "portrait");
  assert.equal(app.ios.supportsTablet, false);
});

test("release optimization uses supported Android-only Expo configuration", () => {
  const plugin = app.plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-build-properties");
  assert.ok(plugin);
  assert.deepEqual(plugin[1], {
    android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true },
  });
});