const fs = require("fs");
const path = require("path");

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
