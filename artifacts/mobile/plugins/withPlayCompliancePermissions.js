/**
 * Ensures Play Photo/Video + unused sensitive permissions stay removed from
 * the merged AndroidManifest even when dependencies re-add them.
 */
const { withAndroidManifest } = require("expo/config-plugins");

const REMOVE = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.ACCESS_FINE_LOCATION",
  "android.permission.ACCESS_COARSE_LOCATION",
  "android.permission.CAMERA",
  "android.permission.SYSTEM_ALERT_WINDOW",
];

function ensureRemove(androidManifest, permission) {
  const manifest = androidManifest.manifest;
  if (!manifest) return androidManifest;
  if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
  const list = manifest["uses-permission"];
  const existing = list.find(
    (entry) => entry?.$?.["android:name"] === permission,
  );
  if (existing) {
    existing.$["tools:node"] = "remove";
  } else {
    list.push({
      $: {
        "android:name": permission,
        "tools:node": "remove",
      },
    });
  }
  if (!manifest.$) manifest.$ = {};
  if (!manifest.$["xmlns:tools"]) {
    manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
  }
  return androidManifest;
}

const withPlayCompliancePermissions = (config) => {
  return withAndroidManifest(config, (config) => {
    for (const permission of REMOVE) {
      config.modResults = ensureRemove(config.modResults, permission);
    }
    return config;
  });
};

module.exports = withPlayCompliancePermissions;
module.exports.REMOVE = REMOVE;
