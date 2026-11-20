const fs = require("fs");
const path = require("path");

/**
 * Do NOT rewrite expo-router `_ctx*.js` require.context roots.
 * babel-preset-expo inlines `process.env.EXPO_ROUTER_APP_ROOT` to the correct
 * project-relative path. Replacing it with a bare `"app"` string makes Metro
 * resolve from `node_modules/expo-router/app` → empty routes → crash.
 */

// ─── Fix expo-file-system@18 Swift incompatibility with expo-modules-core 3.x ───
const fsPatchCandidates = [
  path.resolve(__dirname, "../node_modules/expo-file-system/ios/FileSystemModule.swift"),
  path.resolve(__dirname, "../../../node_modules/expo-file-system/ios/FileSystemModule.swift"),
];
for (const p of fsPatchCandidates) {
  if (fs.existsSync(p)) {
    let content = fs.readFileSync(p, "utf8");
    const patched = content.replace(
      /ExpoAppDelegate\.getSubscriberOfType\(/g,
      "ExpoAppDelegateSubscriberRepository.getSubscriberOfType(",
    );
    if (patched !== content) {
      fs.writeFileSync(p, patched, "utf8");
      console.log("Patched expo-file-system FileSystemModule.swift at", p);
    } else {
      console.log(
        "expo-file-system FileSystemModule.swift already patched or not matched at",
        p,
      );
    }
    break;
  }
}
