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

const candidates = [
  path.resolve(__dirname, "../node_modules/expo-router/_ctx.android.js"),
  path.resolve(__dirname, "../../../node_modules/expo-router/_ctx.android.js"),
  path.resolve(__dirname, "../node_modules/expo-router/_ctx.ios.js"),
  path.resolve(__dirname, "../../../node_modules/expo-router/_ctx.ios.js"),
  path.resolve(__dirname, "../node_modules/expo-router/_ctx.js"),
  path.resolve(__dirname, "../../../node_modules/expo-router/_ctx.js"),
];

for (const p of candidates) {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, "utf8");
    const patched = content
      .replace(/process\.env\.EXPO_ROUTER_APP_ROOT/g, "'app'")
      .replace(/process\.env\.EXPO_ROUTER_IMPORT_MODE/g, "'sync'");
    if (patched !== content) {
      fs.writeFileSync(p, patched, "utf8");
      console.log("Patched expo-router _ctx.android.js at", p);
    } else {
      console.log("expo-router _ctx.android.js already patched at", p);
    }
  }
}
