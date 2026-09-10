const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Watch the entire workspace root so Metro can resolve bundle paths that are
// relative to the workspace (e.g. artifacts/mobile/node_modules/expo-router/entry).
// The blockList below prevents .local/ from ever being crawled or bundled.
config.watchFolders = [workspaceRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// expo-notifications depends on @ide/backoff, whose tiny runtime imports
// Node's built-in "assert". React Native has no Node standard library, so map
// that one import to a browser-safe assertion function.
const assertShim = path.resolve(projectRoot, "shims/assert.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "assert") {
    return { type: "sourceFile", filePath: assertShim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Belt-and-suspenders: block .local from ever being resolved/bundled.
config.resolver.blockList = [
  /\/\.local\/.*/,
];

module.exports = config;
