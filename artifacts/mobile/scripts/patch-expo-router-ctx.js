const fs = require("fs");
const path = require("path");

// ─── Fix expo-file-system@18.0.12 Swift incompatibility with expo-modules-core 3.x ───
// expo-modules-core 3.x renamed ExpoAppDelegate → ExpoAppDelegateSubscriberRepository.
// FileSystemModule.swift still calls ExpoAppDelegate.getSubscriberOfType() which no
// longer exists, causing a Swift compile error on every EAS iOS build.
const fsPatchCandidates = [
  path.resolve(__dirname, "../node_modules/expo-file-system/ios/FileSystemModule.swift"),
  path.resolve(__dirname, "../../../node_modules/expo-file-system/ios/FileSystemModule.swift"),
];
for (const p of fsPatchCandidates) {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, "utf8");
    const patched = content.replace(
      /ExpoAppDelegate\.getSubscriberOfType\(/g,
      "ExpoAppDelegateSubscriberRepository.getSubscriberOfType("
    );
    if (patched !== content) {
      fs.writeFileSync(p, patched, "utf8");
      console.log("Patched expo-file-system FileSystemModule.swift at", p);
    } else {
      console.log("expo-file-system FileSystemModule.swift already patched or not matched at", p);
    }
    break;
  }
}

// NOTE: Do NOT rewrite expo-router `_ctx*.js` to hardcode `'app'`.
// babel-preset-expo's expo-router plugin must see
// `process.env.EXPO_ROUTER_APP_ROOT` so it can inline the correct relative
// path from the transformed file to the project `app/` directory. Hardcoding
// `'app'` breaks require.context under pnpm/EAS and yields "No routes found".
