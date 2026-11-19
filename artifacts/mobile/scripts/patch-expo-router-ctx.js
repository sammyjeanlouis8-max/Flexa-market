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

/**
 * Expo Router's _ctx*.js files use require.context(process.env.EXPO_ROUTER_APP_ROOT).
 * In release/Gradle embeds, that env is often missing, so Metro resolves a bare
 * "app" folder relative to node_modules/expo-router (empty → "No routes found").
 * Always rewrite to a path relative to the _ctx file that points at this package's
 * Expo Router `app/` directory.
 */
const appRoot = path.resolve(__dirname, "../app");
const candidates = [
  path.resolve(__dirname, "../node_modules/expo-router/_ctx.android.js"),
  path.resolve(__dirname, "../../../node_modules/expo-router/_ctx.android.js"),
  path.resolve(__dirname, "../node_modules/expo-router/_ctx.ios.js"),
  path.resolve(__dirname, "../../../node_modules/expo-router/_ctx.ios.js"),
  path.resolve(__dirname, "../node_modules/expo-router/_ctx.js"),
  path.resolve(__dirname, "../../../node_modules/expo-router/_ctx.js"),
];

for (const p of candidates) {
  if (!fs.existsSync(p)) continue;
  const relApp = path.relative(path.dirname(p), appRoot).split(path.sep).join("/");
  const quoted = `'${relApp}'`;
  let content = fs.readFileSync(p, "utf8");
  let patched = content
    .replace(/process\.env\.EXPO_ROUTER_APP_ROOT/g, quoted)
    .replace(/process\.env\.EXPO_ROUTER_IMPORT_MODE/g, "'sync'");
  // Fix prior incorrect patch that used a bare 'app' string.
  patched = patched.replace(
    /require\.context\(\s*(['"])app\1/g,
    `require.context(\n  ${quoted}`,
  );
  patched = patched.replace(
    /require\.context\(\s*\n\s*(['"])app\1/g,
    `require.context(\n  ${quoted}`,
  );
  if (patched !== content) {
    fs.writeFileSync(p, patched, "utf8");
    console.log("Patched expo-router context at", p, "→", relApp);
  } else {
    console.log("expo-router context already patched at", p, "→", relApp);
  }
}
