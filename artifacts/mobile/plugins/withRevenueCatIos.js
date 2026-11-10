/**
 * Injects the public RevenueCat Apple SDK key into Info.plist as RevenueCatApiKey
 * (parity with the legacy Swift shell). Reads EXPO_PUBLIC_REVENUECAT_IOS_API_KEY
 * at prebuild time — never embeds the secret webhook auth key.
 */
const { withInfoPlist } = require("expo/config-plugins");

function withRevenueCatIos(config) {
  return withInfoPlist(config, (cfg) => {
    const key = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
    if (key && !key.includes("$(")) {
      cfg.modResults.RevenueCatApiKey = key;
    }
    return cfg;
  });
}

module.exports = withRevenueCatIos;
