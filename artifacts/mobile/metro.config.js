const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Preserve Expo's default watch folders and add the workspace root so Metro
// can resolve hoisted workspace dependencies without hiding Expo defaults.
config.watchFolders = [
  ...(config.watchFolders ?? []),
  workspaceRoot,
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// expo-notifications depends on @ide/backoff, whose tiny runtime imports
// Node's built-in "assert". React Native has no Node standard library, so map
// that one import to a browser-safe assertion function.
const assertShim = path.resolve(projectRoot, "shims/assert.js");
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const importer = context.originModulePath || "";
  if (
    moduleName === "assert" &&
    /(?:^|[\\/])@ide[\\/]backoff(?:[\\/]|$)/.test(importer)
  ) {
    return { type: "sourceFile", filePath: assertShim };
  }
  return context.resolveRequest(context, moduleName, platform);
};

// Belt-and-suspenders: block .local from ever being resolved/bundled.
config.resolver.blockList = [
  /\/\.local\/.*/,
];

module.exports = config;
