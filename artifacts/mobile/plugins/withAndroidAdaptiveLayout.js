"use strict";

/**
 * Apply after Expo's orientation mod. Keep the existing iOS portrait policy,
 * while allowing the Android launcher activity to rotate and use multi-window.
 * Fail loudly if the generated launcher activity cannot be identified.
 */
function applyAdaptiveLayout(manifest) {
  const application = manifest.application?.[0];
  const activity = application?.activity?.find((entry) =>
    entry["intent-filter"]?.some((filter) =>
      filter.action?.some((action) => action.$?.["android:name"] === "android.intent.action.MAIN") &&
      filter.category?.some((category) => category.$?.["android:name"] === "android.intent.category.LAUNCHER"),
    ),
  );
  if (!activity?.$) throw new Error("Android launcher activity is missing; cannot apply adaptive layout");
  activity.$["android:screenOrientation"] = "unspecified";
  activity.$["android:resizeableActivity"] = "true";
  delete activity.$["android:maxAspectRatio"];
  delete activity.$["android:minAspectRatio"];
  return manifest;
}

module.exports = function withAndroidAdaptiveLayout(config) {
  const { withAndroidManifest } = require("expo/config-plugins");
  return withAndroidManifest(config, (configured) => {
    applyAdaptiveLayout(configured.modResults.manifest);
    return configured;
  });
};
module.exports.applyAdaptiveLayout = applyAdaptiveLayout;