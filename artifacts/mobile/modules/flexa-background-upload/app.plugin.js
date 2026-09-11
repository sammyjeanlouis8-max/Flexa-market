// `expo/config-plugins` is Expo's supported public re-export and is available
// to local modules without adding a second direct dependency.
const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Kept local to the Expo app so prebuild/release builds always carry the
 * Android 14 foreground data-sync declarations required by the WorkManager
 * worker. The module manifest supplies the library portion; this protects the
 * host application's merged manifest as well.
 */
module.exports = function withFlexaBackgroundUpload(config) {
  return withAndroidManifest(config, (configured) => {
    const manifest = configured.modResults.manifest;
    const permissions = manifest["uses-permission"] || [];
    const required = [
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_DATA_SYNC",
      "android.permission.WAKE_LOCK",
    ];
    for (const name of required) {
      if (!permissions.some((permission) => permission.$?.["android:name"] === name)) {
        permissions.push({ $: { "android:name": name } });
      }
    }
    manifest["uses-permission"] = permissions;
    return configured;
  });
};