"use strict";

/**
 * Keep Android builds green when google-services.json is not checked in yet.
 * If the Firebase config file is present, leave Expo's googleServicesFile alone
 * so FCM / expo-notifications can wire up. If it is missing, strip the path so
 * prebuild/EAS do not fail looking for a file that is not ready.
 */
const fs = require("fs");
const path = require("path");

function resolveGoogleServicesPath(config, projectRoot) {
  const configured = config.android?.googleServicesFile;
  if (!configured) return null;
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(projectRoot, configured);
}

module.exports = function withOptionalGoogleServices(config) {
  const projectRoot = path.resolve(__dirname, "..");
  const filePath = resolveGoogleServicesPath(config, projectRoot);
  if (filePath && fs.existsSync(filePath)) {
    return config;
  }

  if (config.android?.googleServicesFile) {
    // Clone shallowly so Expo config plugins do not mutate frozen objects.
    config = {
      ...config,
      android: {
        ...config.android,
      },
    };
    delete config.android.googleServicesFile;
  }

  return config;
};
