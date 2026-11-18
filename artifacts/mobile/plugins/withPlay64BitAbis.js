"use strict";

/**
 * Prefer 64-bit ABIs for Play 16 KB page-size compatibility.
 * arm64-v8a is required for devices; x86_64 retained for emulator smoke.
 */
function applyAbiFilters(gradle) {
  if (gradle.includes("abiFilters")) return gradle;
  const snippet = `
        ndk {
            abiFilters "arm64-v8a", "x86_64"
        }
`;
  // Insert into defaultConfig { ... } of app/build.gradle
  return gradle.replace(
    /(defaultConfig\s*\{)/,
    `$1${snippet}`,
  );
}

module.exports = function withPlay64BitAbis(config) {
  const { withAppBuildGradle } = require("expo/config-plugins");
  return withAppBuildGradle(config, (configured) => {
    configured.modResults.contents = applyAbiFilters(configured.modResults.contents);
    return configured;
  });
};
module.exports.applyAbiFilters = applyAbiFilters;
