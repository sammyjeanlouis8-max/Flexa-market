"use strict";

const fs = require("fs");
const path = require("path");

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

/**
 * Ensure MainActivity draws edge-to-edge so react-native-safe-area-context
 * receives navigation-bar insets (three-button + gesture).
 */
function ensureEdgeToEdgeMainActivity(projectRoot) {
  const candidates = [
    path.join(projectRoot, "android/app/src/main/java/com/flexamarket/app/MainActivity.kt"),
    path.join(projectRoot, "android/app/src/main/java/com/flexamarket/MainActivity.kt"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    let src = fs.readFileSync(file, "utf8");
    if (src.includes("WindowCompat.setDecorFitsSystemWindows")) return;
    if (!src.includes("import androidx.core.view.WindowCompat")) {
      src = src.replace(
        /^(package [^\n]+\n)/m,
        "$1\nimport androidx.core.view.WindowCompat\n",
      );
    }
    if (src.includes("super.onCreate(")) {
      src = src.replace(
        /super\.onCreate\(([^\)]*)\)/,
        "super.onCreate($1)\n    WindowCompat.setDecorFitsSystemWindows(window, false)",
      );
      fs.writeFileSync(file, src, "utf8");
    }
    return;
  }
}

module.exports = function withAndroidAdaptiveLayout(config) {
  const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
  let next = withAndroidManifest(config, (configured) => {
    applyAdaptiveLayout(configured.modResults.manifest);
    return configured;
  });
  next = withDangerousMod(next, [
    "android",
    async (configured) => {
      ensureEdgeToEdgeMainActivity(configured.modRequest.projectRoot);
      return configured;
    },
  ]);
  return next;
};
module.exports.applyAdaptiveLayout = applyAdaptiveLayout;
module.exports.ensureEdgeToEdgeMainActivity = ensureEdgeToEdgeMainActivity;
